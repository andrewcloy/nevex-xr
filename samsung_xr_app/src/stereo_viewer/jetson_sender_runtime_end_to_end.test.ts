import { afterEach, describe, expect, it } from "vitest";
import {
  WebSocket as NodeWebSocket,
  type WebSocketServer,
} from "ws";
import { JetsonTransportAdapter } from "./jetson_transport_adapter";
import type { StereoFrame } from "./frame_models";
import { DEFAULT_SENDER_CONFIG } from "../../scripts/sender/sender_config.mjs";
import { startJetsonSenderRuntime } from "../../scripts/sender/sender_runtime.mjs";

describe("Jetson sender runtime end-to-end", () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (!cleanup) {
        continue;
      }

      await cleanup();
    }
  });

  it("delivers live stereo frames from the canonical sender runtime into the XR transport adapter", async () => {
    const server = await startJetsonSenderRuntime({
      ...DEFAULT_SENDER_CONFIG,
      host: "127.0.0.1",
      port: 0,
      path: "/jetson/messages",
      provider: "still",
      imageMode: "base64",
      fps: 2,
    });
    cleanupTasks.push(async () => {
      await closeServer(server);
    });

    await waitForServerListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    const adapter = new JetsonTransportAdapter({
      config: {
        host: "127.0.0.1",
        port: address.port,
        path: "/jetson/messages",
        streamName: DEFAULT_SENDER_CONFIG.streamName,
      },
      createWebSocket: (url) => createBrowserCompatibleWebSocket(url),
    });
    cleanupTasks.push(async () => {
      await adapter.stop();
    });

    const receivedFrames: StereoFrame[] = [];
    const observedMessageTypes: string[] = [];
    const unsubscribeFrame = adapter.frameSource.subscribeFrame((frame) => {
      receivedFrames.push(frame);
    });
    cleanupTasks.push(async () => {
      unsubscribeFrame();
    });
    const unsubscribeStatus = adapter.subscribeStatus((status) => {
      if (!status.lastMessageType) {
        return;
      }
      if (observedMessageTypes[observedMessageTypes.length - 1] === status.lastMessageType) {
        return;
      }
      observedMessageTypes.push(status.lastMessageType);
    });
    cleanupTasks.push(async () => {
      unsubscribeStatus();
    });

    await adapter.start();

    await waitFor(() => {
      return (
        adapter.getStatus().connected &&
        adapter.getStatus().state === "running" &&
        adapter.frameSource.getStatus().state === "running" &&
        receivedFrames.length >= 1
      );
    }, 5000);

    const adapterStatus = adapter.getStatus();
    const sourceStatus = adapter.frameSource.getStatus();
    const firstFrame = receivedFrames[0];
    const startupCapabilitiesIndex = observedMessageTypes.indexOf("capabilities");
    const startupTransportStatusIndex =
      observedMessageTypes.indexOf("transport_status");
    const startupSourceStatusIndex = observedMessageTypes.indexOf("source_status");
    const startupStereoFrameIndex = observedMessageTypes.indexOf("stereo_frame");

    expect(adapterStatus.connected).toBe(true);
    expect(adapterStatus.state).toBe("running");
    expect(adapterStatus.config.port).toBe(address.port);
    expect(adapterStatus.lastMessageType).toBe("stereo_frame");
    expect(adapterStatus.capabilities?.senderName).toBe(
      DEFAULT_SENDER_CONFIG.senderName,
    );
    expect(adapterStatus.capabilities?.supportedImagePayloadModes).toContain(
      "binary_frame",
    );
    expect(sourceStatus.state).toBe("running");
    expect(sourceStatus.lastFrameId).toBe(firstFrame.frameId);
    expect(sourceStatus.lastTimestampMs).toBe(firstFrame.timestampMs);
    expect(firstFrame.left.imageContent?.sourceKind).toBe("base64");
    expect(firstFrame.right.imageContent?.sourceKind).toBe("base64");
    expect(startupCapabilitiesIndex).toBeGreaterThanOrEqual(0);
    expect(startupTransportStatusIndex).toBeGreaterThan(startupCapabilitiesIndex);
    expect(startupSourceStatusIndex).toBeGreaterThan(startupTransportStatusIndex);
    expect(startupStereoFrameIndex).toBeGreaterThan(startupSourceStatusIndex);
  });
});

async function waitForServerListening(server: WebSocketServer): Promise<void> {
  if (server.address()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };

    server.once("listening", onListening);
    server.once("error", onError);
  });
}

async function closeServer(server: WebSocketServer): Promise<void> {
  if (!server.address()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error(`Timed out waiting after ${timeoutMs} ms.`);
}

function createBrowserCompatibleWebSocket(url: string): WebSocket {
  return new BrowserCompatibleNodeWebSocket(url) as unknown as WebSocket;
}

class BrowserCompatibleNodeWebSocket extends EventTarget {
  private readonly socket: NodeWebSocket;

  private nextBinaryType: BinaryType = "blob";

  constructor(url: string) {
    super();
    this.socket = new NodeWebSocket(url);

    this.socket.on("open", () => {
      this.dispatchEvent(new Event("open"));
    });
    this.socket.on("message", (data, isBinary) => {
      this.dispatchEvent(
        createMessageEvent(normalizeSocketMessageData(data, isBinary)),
      );
    });
    this.socket.on("error", () => {
      this.dispatchEvent(new Event("error"));
    });
    this.socket.on("close", (code, reason) => {
      this.dispatchEvent(createCloseEvent(code, reason.toString("utf8")));
    });
  }

  get readyState(): number {
    return this.socket.readyState;
  }

  get binaryType(): BinaryType {
    return this.nextBinaryType;
  }

  set binaryType(value: BinaryType) {
    this.nextBinaryType = value;
    this.socket.binaryType = value === "arraybuffer" ? "arraybuffer" : "nodebuffer";
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.socket.send(data as never);
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }
}

function createMessageEvent(data: string | ArrayBuffer): MessageEvent {
  const event = new Event("message") as MessageEvent;
  Object.assign(event, {
    data,
  });
  return event;
}

function createCloseEvent(code: number, reason: string): CloseEvent {
  const event = new Event("close") as CloseEvent;
  Object.assign(event, {
    code,
    reason,
  });
  return event;
}

function normalizeSocketMessageData(
  value: unknown,
  isBinary: boolean,
): string | ArrayBuffer {
  if (!isBinary) {
    if (typeof value === "string") {
      return value;
    }

    return coerceToBuffer(value).toString("utf8");
  }

  const buffer = coerceToBuffer(value);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function coerceToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value)) {
    return Buffer.concat(value.map((entry) => coerceToBuffer(entry)));
  }

  throw new Error("Unsupported ws message payload in test adapter.");
}
