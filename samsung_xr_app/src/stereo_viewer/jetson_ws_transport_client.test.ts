import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTransportStatusEnvelope,
  type JetsonMessageEnvelope,
} from "./jetson_message_envelope";
import {
  JetsonMessageDispatcher,
  type JetsonMessageDispatchTarget,
  type JetsonMessageReceiptMetadata,
} from "./jetson_message_dispatcher";
import {
  JetsonWebSocketTransportClient,
} from "./jetson_ws_transport_client";
import {
  DEFAULT_LIVE_TRANSPORT_CONFIG,
  type LiveTransportConfig,
} from "./transport_adapter";
import type {
  JetsonCapabilitiesPayload,
  JetsonRemoteConfigPayload,
  JetsonSourceStatusPayload,
  JetsonStereoFramePayload,
  JetsonTransportErrorPayload,
  JetsonTransportStatusPayload,
} from "./jetson_transport_payloads";

describe("JetsonWebSocketTransportClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ignores delayed stale-socket payloads after reconnect", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const target = new RecordingDispatchTarget();
    const dispatcher = new JetsonMessageDispatcher(target);
    const transportStatuses: JetsonTransportStatusPayload[] = [];
    const transportErrors: JetsonTransportErrorPayload[] = [];
    const sockets: FakeWebSocket[] = [];
    const client = new JetsonWebSocketTransportClient({
      dispatcher,
      onTransportStatus: (payload) => {
        transportStatuses.push(payload);
      },
      onTransportError: (payload) => {
        transportErrors.push(payload);
      },
      createWebSocket: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    await client.connect(createConfig());
    const firstSocket = sockets[0];
    firstSocket.emitOpen();

    let resolveDelayedArrayBuffer!: (buffer: ArrayBuffer) => void;
    const delayedBlob = new Blob([]);
    Object.defineProperty(delayedBlob, "arrayBuffer", {
      configurable: true,
      value: () => {
        return new Promise<ArrayBuffer>((resolve) => {
          resolveDelayedArrayBuffer = resolve;
        });
      },
    });
    firstSocket.emitMessage(delayedBlob);
    await flushMicrotasks();

    await client.disconnect();
    await client.connect(createConfig());
    const secondSocket = sockets[1];
    secondSocket.emitOpen();
    secondSocket.emitMessage(
      JSON.stringify(
        buildTransportStatusEnvelope(
          {
            transportState: "running",
            connected: true,
            statusText: "Runtime connected.",
          },
          {
            timestampMs: 1000,
            sequence: 1,
          },
        ),
      ),
    );
    await flushMicrotasks();

    resolveDelayedArrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer);
    await flushMicrotasks();

    expect(target.receivedEnvelopeSequences).toEqual([1]);
    expect(target.receivedTransportStatuses).toHaveLength(1);
    expect(transportErrors).toEqual([]);
    expect(getLast(transportStatuses)?.transportState).toBe("running");
  });

  it("times out hung websocket connects and surfaces the failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const target = new RecordingDispatchTarget();
    const dispatcher = new JetsonMessageDispatcher(target);
    const transportStatuses: JetsonTransportStatusPayload[] = [];
    const transportErrors: JetsonTransportErrorPayload[] = [];
    const sockets: FakeWebSocket[] = [];
    const client = new JetsonWebSocketTransportClient({
      dispatcher,
      onTransportStatus: (payload) => {
        transportStatuses.push(payload);
      },
      onTransportError: (payload) => {
        transportErrors.push(payload);
      },
      createWebSocket: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    await client.connect(
      createConfig({
        reconnectEnabled: false,
        reconnectIntervalMs: 1500,
      }),
    );
    expect(getLast(transportStatuses)?.transportState).toBe("connecting");

    vi.advanceTimersByTime(3000);
    await flushMicrotasks();

    expect(getLast(transportErrors)?.message).toContain("timed out connecting");
    expect(sockets[0]?.readyState).toBe(FakeWebSocket.CLOSED);
    expect(getLast(transportStatuses)?.transportState).toBe("error");
    expect(getLast(transportStatuses)?.lastError).toBe("Connect timeout");
  });

  it("surfaces actionable pre-open websocket failures while retrying", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const target = new RecordingDispatchTarget();
    const dispatcher = new JetsonMessageDispatcher(target);
    const transportStatuses: JetsonTransportStatusPayload[] = [];
    const transportErrors: JetsonTransportErrorPayload[] = [];
    const sockets: FakeWebSocket[] = [];
    const client = new JetsonWebSocketTransportClient({
      dispatcher,
      onTransportStatus: (payload) => {
        transportStatuses.push(payload);
      },
      onTransportError: (payload) => {
        transportErrors.push(payload);
      },
      createWebSocket: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    await client.connect(
      createConfig({
        host: "192.168.1.56",
        reconnectEnabled: true,
        reconnectIntervalMs: 1500,
      }),
    );

    sockets[0]?.emitError();
    sockets[0]?.close(1006, "");
    await flushMicrotasks();

    expect(getLast(transportErrors)?.message).toContain(
      "sender is bound for LAN access instead of localhost-only",
    );
    expect(getLast(transportStatuses)?.transportState).toBe("reconnecting");
    expect(getLast(transportStatuses)?.statusText).toContain(
      "failed before socket open",
    );
    expect(getLast(transportStatuses)?.lastError).toContain(
      "192.168.1.56:8090/jetson/messages",
    );
  });
});

class RecordingDispatchTarget implements JetsonMessageDispatchTarget {
  readonly receivedEnvelopeSequences: number[] = [];

  readonly receivedTransportStatuses: JetsonTransportStatusPayload[] = [];

  readonly receivedErrors: JetsonTransportErrorPayload[] = [];

  recordEnvelopeReceipt(
    envelope: JetsonMessageEnvelope,
    _metadata?: JetsonMessageReceiptMetadata,
  ): void {
    if (typeof envelope.sequence === "number") {
      this.receivedEnvelopeSequences.push(envelope.sequence);
    }
  }

  ingestCapabilitiesPayload(_payload: JetsonCapabilitiesPayload): void {}

  ingestTransportStatusPayload(payload: JetsonTransportStatusPayload): void {
    this.receivedTransportStatuses.push(payload);
  }

  ingestSourceStatusPayload(_payload: JetsonSourceStatusPayload): void {}

  ingestFramePayload(_payload: JetsonStereoFramePayload): void {}

  ingestError(payload: JetsonTransportErrorPayload): void {
    this.receivedErrors.push(payload);
  }

  applyRemoteConfig(_payload: JetsonRemoteConfigPayload): void {}
}

class FakeWebSocket {
  static readonly CONNECTING = 0;

  static readonly OPEN = 1;

  static readonly CLOSING = 2;

  static readonly CLOSED = 3;

  readonly url: string;

  readonly sentMessages: string[] = [];

  readyState = FakeWebSocket.CONNECTING;

  binaryType: BinaryType = "blob";

  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let listenersForType = this.listeners.get(type);
    if (!listenersForType) {
      listenersForType = new Set();
      this.listeners.set(type, listenersForType);
    }

    listenersForType.add(listener);
  }

  send(message: string): void {
    this.sentMessages.push(message);
  }

  close(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {
      code,
      reason,
    });
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  emitMessage(data: unknown): void {
    this.emit("message", { data });
  }

  emitError(): void {
    this.emit("error", {});
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function createConfig(
  overrides: Partial<LiveTransportConfig> = {},
): LiveTransportConfig {
  return {
    ...DEFAULT_LIVE_TRANSPORT_CONFIG,
    host: "127.0.0.1",
    port: 8090,
    path: "/jetson/messages",
    protocolType: "websocket_json",
    streamName: "jetson_test_stream",
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function getLast<T>(values: readonly T[]): T | undefined {
  return values.length > 0 ? values[values.length - 1] : undefined;
}
