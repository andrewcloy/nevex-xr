import { afterEach, describe, expect, it } from "vitest";
import { WebSocket as NodeWebSocket } from "ws";
import { JetsonTransportAdapter } from "./jetson_transport_adapter";
import type { StereoFrame } from "./frame_models";
// @ts-expect-error The sender runtime remains a JS test fixture.
import { DEFAULT_SENDER_CONFIG } from "../../scripts/sender/sender_config.mjs";
// @ts-expect-error The sender runtime remains a JS test fixture.
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

  it(
    "delivers live stereo frames from the canonical sender runtime into the XR transport adapter",
    async () => {
    const server = await startJetsonSenderRuntime({
      ...DEFAULT_SENDER_CONFIG,
      host: "127.0.0.1",
      port: 0,
      path: "/jetson/messages",
      provider: "camera",
      captureBackend: "simulated",
      imageMode: "binary_frame",
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
      createWebSocket: (url) => new NodeWebSocket(url) as unknown as WebSocket,
    });
    cleanupTasks.push(async () => {
      await adapter.stop();
    });

    const statusHistory: string[] = [];
    const unsubscribeStatus = adapter.subscribeStatus((status) => {
      statusHistory.push(
        [
          `state=${status.state}`,
          `connected=${String(status.connected)}`,
          `lastMessageType=${status.lastMessageType ?? "none"}`,
          `lastParseError=${status.lastParseError ?? "none"}`,
          `lastError=${status.lastError ?? "none"}`,
        ].join(" "),
      );
    });
    cleanupTasks.push(async () => {
      unsubscribeStatus();
    });

    const receivedFrames: StereoFrame[] = [];
    const unsubscribeFrame = adapter.frameSource.subscribeFrame((frame) => {
      receivedFrames.push(frame);
    });
    cleanupTasks.push(async () => {
      unsubscribeFrame();
    });

    await adapter.start();

    try {
      await waitFor(() => {
        return (
          adapter.getStatus().connected &&
          adapter.getStatus().state === "running" &&
          adapter.frameSource.getStatus().state === "running" &&
          receivedFrames.length >= 1
        );
      }, 8000);
    } catch (error) {
      const timeoutReason =
        error instanceof Error ? error.message : "Unknown timeout failure.";
      throw new Error(
        `Timed out waiting for live frame ingest. Status history: ${statusHistory.join(
          " -> ",
        )}. Received frames: ${receivedFrames.length}. Root cause: ${timeoutReason}.`,
      );
    }

    const adapterStatus = adapter.getStatus();
    const sourceStatus = adapter.frameSource.getStatus();
    const firstFrame = receivedFrames[0];

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
    expect(sourceStatus.lastFrameId).toBe(firstFrame.frameId);
    expect(sourceStatus.lastTimestampMs).toBe(firstFrame.timestampMs);
    expect(sourceStatus.cameraTelemetry?.captureBackendName).toBe("simulated");
    expect(firstFrame.left.imageContent?.sourceKind).toBe("uri");
    expect(firstFrame.right.imageContent?.sourceKind).toBe("uri");
    },
    10000,
  );
});

type TestWebSocketServer = {
  address(): { port: number } | string | null;
  once(event: "listening", listener: () => void): void;
  once(event: "error", listener: (error: Error) => void): void;
  off(event: "listening", listener: () => void): void;
  off(event: "error", listener: (error: Error) => void): void;
  close(callback: (error?: Error) => void): void;
};

async function waitForServerListening(server: TestWebSocketServer): Promise<void> {
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

async function closeServer(server: TestWebSocketServer): Promise<void> {
  if (!server.address()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
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
