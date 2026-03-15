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

  private manualDisconnect = false;

  private messageHandlingQueue: Promise<void> = Promise.resolve();

  private retainedBinaryFrameObjectUrls: string[][] = [];

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

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }

      this.onTransportStatus({
        transportState: "running",
        connected: true,
        statusText: `WebSocket transport connected to ${url}.`,
        parseErrorText: undefined,
        lastError: undefined,
      });
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }

      this.messageHandlingQueue = this.messageHandlingQueue
        .then(() => {
          return this.handleMessage(event);
        })
        .catch((error) => {
          this.onTransportError({
            stage: "parse",
            recoverable: true,
            message:
              error instanceof Error
                ? error.message
                : "Unexpected WebSocket message handling failure.",
          });
        });
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }

      this.onTransportError({
        stage: "transport",
        recoverable: Boolean(this.activeConfig?.reconnectEnabled),
        message: `WebSocket transport error on ${url}.`,
      });
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = undefined;
      const closeReason = event.reason || `Close code ${event.code}`;

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
          statusText: `WebSocket transport disconnected. Retrying in ${this.activeConfig.reconnectIntervalMs} ms...`,
          lastError: closeReason,
        });
        this.scheduleReconnect();
        return;
      }

      this.onTransportStatus({
        transportState: "error",
        connected: false,
        statusText: `WebSocket transport disconnected from ${url}.`,
        lastError: closeReason,
      });
    });
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.clearReconnectTimer();

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

  private async handleMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data === "string") {
      this.handleJsonMessage(event.data);
      return;
    }

    const binaryBytes = await this.normalizeBinaryMessageData(event.data);
    if (!binaryBytes) {
      this.onTransportError({
        stage: "parse",
        recoverable: true,
        message:
          "WebSocket message data must be a JSON string or binary stereo_frame payload.",
      });
      return;
    }

    this.handleBinaryMessage(binaryBytes);
  }

  private handleJsonMessage(rawMessage: string): void {
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

  private handleBinaryMessage(binaryBytes: ArrayBuffer | Uint8Array): void {
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
