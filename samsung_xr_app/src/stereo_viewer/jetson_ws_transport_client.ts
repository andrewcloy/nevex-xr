import type { LiveTransportConfig } from "./transport_adapter";
import type { JetsonMessageDispatcher } from "./jetson_message_dispatcher";
import type {
  JetsonTransportErrorPayload,
  JetsonTransportStatusPayload,
} from "./jetson_transport_payloads";
import {
  decodeJetsonBinaryStereoFrameMessage,
  revokeJetsonBinaryStereoFrameObjectUrls,
} from "./jetson_binary_stereo_frame_message";

const MAX_RETAINED_BINARY_FRAME_URL_SETS = 2;
const MIN_CONNECT_TIMEOUT_MS = 3000;

/**
 * Browser-friendly WebSocket constructor used by the prototype transport.
 */
export type JetsonPrototypeWebSocketFactory = (url: string) => WebSocket;

/**
 * Options used to construct the prototype WebSocket transport client.
 */
export interface JetsonWebSocketTransportClientOptions {
  readonly dispatcher: JetsonMessageDispatcher;
  readonly onTransportStatus: (payload: JetsonTransportStatusPayload) => void;
  readonly onTransportError: (payload: JetsonTransportErrorPayload) => void;
  readonly createWebSocket?: JetsonPrototypeWebSocketFactory;
}

interface PendingBinaryTransportMessage {
  readonly socket: WebSocket;
  readonly sessionId: number;
  readonly rawData: unknown;
  readonly messageId: number;
}

/**
 * Minimal browser-friendly JSON-over-WebSocket transport prototype.
 *
 * This client is intentionally lightweight. It only owns endpoint connection,
 * JSON parsing, envelope dispatch, and basic reconnect behavior.
 */
export class JetsonWebSocketTransportClient {
  private readonly dispatcher: JetsonMessageDispatcher;

  private readonly onTransportStatus: (
    payload: JetsonTransportStatusPayload,
  ) => void;

  private readonly onTransportError: (payload: JetsonTransportErrorPayload) => void;

  private readonly createWebSocket: JetsonPrototypeWebSocketFactory;

  private socket?: WebSocket;

  private activeConfig?: LiveTransportConfig;

  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private connectTimeoutTimer?: ReturnType<typeof setTimeout>;

  private manualDisconnect = false;

  private messageHandlingQueue: Promise<void> = Promise.resolve();

  // Coalesce binary stereo_frame work so a slow decode/present step never forces
  // the browser to grind through an ever-growing queue of stale frames.
  private pendingBinaryMessage?: PendingBinaryTransportMessage;

  private binaryMessageDrainScheduled = false;

  private nextBinaryMessageId = 0;

  private latestQueuedBinaryMessageId = 0;

  private retainedBinaryFrameObjectUrls: string[][] = [];

  private activeSessionId = 0;

  private hadSocketOpenThisSession = false;

  private sessionTransportErrorText?: string;

  constructor(options: JetsonWebSocketTransportClientOptions) {
    this.dispatcher = options.dispatcher;
    this.onTransportStatus = options.onTransportStatus;
    this.onTransportError = options.onTransportError;
    this.createWebSocket =
      options.createWebSocket ??
      ((url: string) => {
        return new WebSocket(url);
      });
  }

  async connect(config: LiveTransportConfig): Promise<void> {
    this.activeConfig = config;
    this.manualDisconnect = false;
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this.hadSocketOpenThisSession = false;
    this.sessionTransportErrorText = undefined;

    if (this.socket) {
      const readyState = this.socket.readyState;
      if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) {
        return;
      }
    }

    let url: string;

    try {
      url = buildJetsonWebSocketUrl(config);
    } catch (error) {
      this.onTransportError({
        stage: "transport",
        recoverable: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid WebSocket transport URL.",
      });
      this.onTransportStatus({
        transportState: "error",
        connected: false,
        statusText: "WebSocket transport configuration is invalid.",
      });
      return;
    }

    this.onTransportStatus({
      transportState: "connecting",
      connected: false,
      statusText: `Connecting WebSocket transport to ${url}...`,
      parseErrorText: undefined,
      lastError: undefined,
    });

    let socket: WebSocket;

    try {
      socket = this.createWebSocket(url);
    } catch (error) {
      this.onTransportError({
        stage: "transport",
        recoverable: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to create WebSocket transport.",
      });
      this.onTransportStatus({
        transportState: "error",
        connected: false,
        statusText: `Unable to open WebSocket transport at ${url}.`,
      });
      return;
    }

    this.socket = socket;
    this.socket.binaryType = "arraybuffer";
    this.messageHandlingQueue = Promise.resolve();
    this.resetBinaryMessageQueue();
    const sessionId = ++this.activeSessionId;
    this.scheduleConnectTimeout(socket, sessionId, url);

    socket.addEventListener("open", () => {
      if (!this.isActiveSocket(socket, sessionId)) {
        return;
      }

      this.clearConnectTimeout();
      this.hadSocketOpenThisSession = true;
      this.sessionTransportErrorText = undefined;
      this.onTransportStatus({
        transportState: "running",
        connected: true,
        statusText: `WebSocket transport connected to ${url}.`,
        parseErrorText: undefined,
        lastError: undefined,
      });
    });

    socket.addEventListener("message", (event) => {
      if (!this.isActiveSocket(socket, sessionId)) {
        return;
      }

      if (typeof event.data === "string") {
        this.enqueueMessageHandlingTask(socket, sessionId, () => {
          return this.handleMessage(socket, sessionId, event.data);
        });
        return;
      }

      this.queueLatestBinaryMessage(socket, sessionId, event.data);
    });

    socket.addEventListener("error", () => {
      if (!this.isActiveSocket(socket, sessionId)) {
        return;
      }

      const message = this.hadSocketOpenThisSession
        ? `WebSocket transport error on ${url}.`
        : buildPreOpenTransportFailureMessage(url);
      this.sessionTransportErrorText = message;
      this.onTransportError({
        stage: "transport",
        recoverable: Boolean(this.activeConfig?.reconnectEnabled),
        message,
      });
    });

    socket.addEventListener("close", (event) => {
      if (!this.isActiveSocket(socket, sessionId)) {
        return;
      }

      this.clearConnectTimeout();
      this.resetBinaryMessageQueue();
      this.revokeRetainedBinaryFrameObjectUrls();
      this.socket = undefined;
      const closeReason = event.reason || `Close code ${event.code}`;
      const lastErrorText = this.sessionTransportErrorText ?? closeReason;

      if (this.manualDisconnect) {
        this.onTransportStatus({
          transportState: "stopped",
          connected: false,
          statusText: "WebSocket transport disconnected.",
          lastError: undefined,
        });
        return;
      }

      if (this.activeConfig?.reconnectEnabled) {
        this.onTransportStatus({
          transportState: "reconnecting",
          connected: false,
          statusText: this.hadSocketOpenThisSession
            ? `WebSocket transport disconnected. Retrying in ${this.activeConfig.reconnectIntervalMs} ms...`
            : `WebSocket connection failed before socket open. Retrying in ${this.activeConfig.reconnectIntervalMs} ms...`,
          lastError: lastErrorText,
        });
        this.scheduleReconnect();
        return;
      }

      this.onTransportStatus({
        transportState: "error",
        connected: false,
        statusText: this.hadSocketOpenThisSession
          ? `WebSocket transport disconnected from ${url}.`
          : `WebSocket connection failed before socket open at ${url}.`,
        lastError: lastErrorText,
      });
    });
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this.messageHandlingQueue = Promise.resolve();
    this.resetBinaryMessageQueue();
    this.activeSessionId += 1;
    this.hadSocketOpenThisSession = false;
    this.sessionTransportErrorText = undefined;
    this.revokeRetainedBinaryFrameObjectUrls();

    const socket = this.socket;
    this.socket = undefined;

    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      socket.close(1000, "Manual disconnect");
    }

    this.onTransportStatus({
      transportState: "stopped",
      connected: false,
      statusText: "WebSocket transport disconnected.",
      lastError: undefined,
      parseErrorText: undefined,
    });
  }

  async reconnect(config: LiveTransportConfig): Promise<void> {
    await this.disconnect();
    await this.connect(config);
  }

  isConnectedOrConnecting(): boolean {
    if (!this.socket) {
      return false;
    }

    return (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    );
  }

  async sendMessageObject(message: unknown): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket transport is not connected.");
    }

    let serializedMessage: string;

    try {
      serializedMessage = JSON.stringify(message);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Failed to serialize outbound control message: ${error.message}`
          : "Failed to serialize outbound control message.",
      );
    }

    this.socket.send(serializedMessage);
  }

  private async handleMessage(
    socket: WebSocket,
    sessionId: number,
    rawData: unknown,
  ): Promise<void> {
    if (!this.isActiveSocket(socket, sessionId)) {
      return;
    }

    if (typeof rawData === "string") {
      this.handleJsonMessage(socket, sessionId, rawData);
      return;
    }

    const binaryBytes = await this.normalizeBinaryMessageData(rawData);
    if (!this.isActiveSocket(socket, sessionId)) {
      return;
    }

    if (!binaryBytes) {
      this.onTransportError({
        stage: "parse",
        recoverable: true,
        message:
          "WebSocket message data must be a JSON string or binary stereo_frame payload.",
      });
      return;
    }

    this.handleBinaryMessage(socket, sessionId, binaryBytes);
  }

  private queueLatestBinaryMessage(
    socket: WebSocket,
    sessionId: number,
    rawData: unknown,
  ): void {
    const messageId = ++this.nextBinaryMessageId;
    this.latestQueuedBinaryMessageId = messageId;
    this.pendingBinaryMessage = {
      socket,
      sessionId,
      rawData,
      messageId,
    };
    if (this.binaryMessageDrainScheduled) {
      return;
    }

    this.binaryMessageDrainScheduled = true;
    this.enqueueMessageHandlingTask(socket, sessionId, async () => {
      this.binaryMessageDrainScheduled = false;
      const pendingBinaryMessage = this.takePendingBinaryMessage();
      if (!pendingBinaryMessage) {
        return;
      }

      await this.handlePendingBinaryMessage(pendingBinaryMessage);
    });
  }

  private async handlePendingBinaryMessage(
    pendingBinaryMessage: PendingBinaryTransportMessage,
  ): Promise<void> {
    if (!this.isActiveSocket(pendingBinaryMessage.socket, pendingBinaryMessage.sessionId)) {
      return;
    }

    if (this.isSupersededBinaryMessage(pendingBinaryMessage.messageId)) {
      return;
    }

    const binaryBytes = await this.normalizeBinaryMessageData(pendingBinaryMessage.rawData);
    if (!this.isActiveSocket(pendingBinaryMessage.socket, pendingBinaryMessage.sessionId)) {
      return;
    }

    if (this.isSupersededBinaryMessage(pendingBinaryMessage.messageId)) {
      return;
    }

    if (!binaryBytes) {
      this.onTransportError({
        stage: "parse",
        recoverable: true,
        message:
          "WebSocket message data must be a JSON string or binary stereo_frame payload.",
      });
      return;
    }

    this.handleBinaryMessage(
      pendingBinaryMessage.socket,
      pendingBinaryMessage.sessionId,
      binaryBytes,
    );
  }

  private handleJsonMessage(
    socket: WebSocket,
    sessionId: number,
    rawMessage: string,
  ): void {
    if (!this.isActiveSocket(socket, sessionId)) {
      return;
    }

    const messageSizeBytes = measureUtf8ByteSize(rawMessage);
    const maxMessageBytes = this.activeConfig?.maxMessageBytes ?? 0;
    if (maxMessageBytes > 0 && messageSizeBytes > maxMessageBytes) {
      this.onTransportError({
        stage: "parse",
        code: "invalid_payload",
        recoverable: true,
        message: `payload: serialized payload size ${messageSizeBytes} bytes exceeds limit ${maxMessageBytes} bytes.`,
      });
      return;
    }

    let parsedMessage: unknown;

    try {
      parsedMessage = JSON.parse(rawMessage) as unknown;
    } catch (error) {
      this.onTransportError({
        stage: "parse",
        recoverable: true,
        message: error instanceof Error ? error.message : "Invalid JSON message.",
      });
      return;
    }

    const result = this.dispatcher.dispatchMessageObject(parsedMessage, {
      messageSizeBytes,
    });
    void result;
  }

  private handleBinaryMessage(
    socket: WebSocket,
    sessionId: number,
    binaryBytes: ArrayBuffer | Uint8Array,
  ): void {
    let decodedMessage;
    try {
      decodedMessage = decodeJetsonBinaryStereoFrameMessage(binaryBytes, {
        maxHeaderBytes: this.activeConfig?.maxMessageBytes,
        maxImagePayloadBytes: this.activeConfig?.maxImagePayloadBytes,
      });
    } catch (error) {
      this.onTransportError({
        stage: "parse",
        code: "invalid_payload",
        recoverable: true,
        message: error instanceof Error ? error.message : "Invalid binary frame.",
      });
      return;
    }

    if (!this.isActiveSocket(socket, sessionId)) {
      revokeJetsonBinaryStereoFrameObjectUrls(decodedMessage.objectUrls);
      return;
    }

    const result = this.dispatcher.dispatchMessageObject(
      decodedMessage.envelope,
      {
        messageSizeBytes: decodedMessage.messageSizeBytes,
      },
    );
    if (!result.ok) {
      revokeJetsonBinaryStereoFrameObjectUrls(decodedMessage.objectUrls);
      return;
    }

    this.retainedBinaryFrameObjectUrls.push([...decodedMessage.objectUrls]);
    while (
      this.retainedBinaryFrameObjectUrls.length > MAX_RETAINED_BINARY_FRAME_URL_SETS
    ) {
      const retiredObjectUrls = this.retainedBinaryFrameObjectUrls.shift();
      if (retiredObjectUrls) {
        revokeJetsonBinaryStereoFrameObjectUrls(retiredObjectUrls);
      }
    }
  }

  private scheduleConnectTimeout(
    socket: WebSocket,
    sessionId: number,
    url: string,
  ): void {
    this.clearConnectTimeout();
    const timeoutMs = Math.max(
      MIN_CONNECT_TIMEOUT_MS,
      (this.activeConfig?.reconnectIntervalMs ?? MIN_CONNECT_TIMEOUT_MS) * 2,
    );

    this.connectTimeoutTimer = setTimeout(() => {
      if (!this.isActiveSocket(socket, sessionId)) {
        return;
      }

      this.onTransportError({
        stage: "transport",
        recoverable: Boolean(this.activeConfig?.reconnectEnabled),
        message: `WebSocket transport timed out connecting to ${url}.`,
      });

      try {
        socket.close(4000, "Connect timeout");
      } catch {
        // Ignore transport cleanup failures during timeout handling.
      }
    }, timeoutMs);
  }

  private async normalizeBinaryMessageData(
    value: unknown,
  ): Promise<ArrayBuffer | Uint8Array | undefined> {
    if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
      return value;
    }

    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return value.arrayBuffer();
    }

    return undefined;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    if (!this.activeConfig) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      if (!this.activeConfig) {
        return;
      }

      void this.connect(this.activeConfig);
    }, this.activeConfig.reconnectIntervalMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = undefined;
    }
  }

  private enqueueMessageHandlingTask(
    socket: WebSocket,
    sessionId: number,
    task: () => Promise<void>,
  ): void {
    this.messageHandlingQueue = this.messageHandlingQueue
      .then(() => {
        return task();
      })
      .catch((error) => {
        if (!this.isActiveSocket(socket, sessionId)) {
          return;
        }

        this.onTransportError({
          stage: "parse",
          recoverable: true,
          message:
            error instanceof Error
              ? error.message
              : "Unexpected WebSocket message handling failure.",
        });
      });
  }

  private takePendingBinaryMessage(): PendingBinaryTransportMessage | undefined {
    const pendingBinaryMessage = this.pendingBinaryMessage;
    this.pendingBinaryMessage = undefined;
    return pendingBinaryMessage;
  }

  private isSupersededBinaryMessage(messageId: number): boolean {
    return messageId !== this.latestQueuedBinaryMessageId;
  }

  private revokeRetainedBinaryFrameObjectUrls(): void {
    while (this.retainedBinaryFrameObjectUrls.length > 0) {
      const objectUrls = this.retainedBinaryFrameObjectUrls.shift();
      if (objectUrls) {
        revokeJetsonBinaryStereoFrameObjectUrls(objectUrls);
      }
    }
  }

  private isActiveSocket(socket: WebSocket, sessionId: number): boolean {
    return this.socket === socket && this.activeSessionId === sessionId;
  }

  private resetBinaryMessageQueue(): void {
    this.pendingBinaryMessage = undefined;
    this.binaryMessageDrainScheduled = false;
    this.nextBinaryMessageId = 0;
    this.latestQueuedBinaryMessageId = 0;
  }
}

/**
 * Builds the prototype WebSocket endpoint URL from the shared transport config.
 */
export function buildJetsonWebSocketUrl(config: LiveTransportConfig): string {
  const normalizedPath = config.path.startsWith("/")
    ? config.path
    : `/${config.path}`;
  const trimmedHost = config.host.trim();

  if (/^wss?:\/\//i.test(trimmedHost)) {
    const url = new URL(trimmedHost);
    if (config.port > 0) {
      url.port = String(config.port);
    }
    url.pathname = normalizedPath;
    return url.toString();
  }

  const socketProtocol =
    String(config.options.secure ?? false) === "true" ? "wss" : "ws";
  const hostWithPort =
    config.port > 0 ? `${trimmedHost}:${config.port}` : trimmedHost;
  return `${socketProtocol}://${hostWithPort}${normalizedPath}`;
}

function measureUtf8ByteSize(value: string): number {
  return new TextEncoder().encode(value).length;
}

function buildPreOpenTransportFailureMessage(url: string): string {
  return `WebSocket connection attempt failed for ${url}. Browser error details were not exposed; check host, port, path, firewall/LAN reachability, and whether the sender is bound for LAN access instead of localhost-only.`;
}
