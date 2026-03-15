import { afterEach, describe, expect, it } from "vitest";
import { JetsonTransportAdapter } from "../../src/stereo_viewer/jetson_transport_adapter.ts";
import { DEFAULT_SENDER_CONFIG } from "./sender_config.mjs";
import { startJetsonSenderRuntime } from "./sender_runtime.mjs";

describe("Jetson sender runtime end-to-end", () => {
  const cleanupTasks = [];

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
      createWebSocket: (url) => new WebSocket(url),
    });
    cleanupTasks.push(async () => {
      await adapter.stop();
    });

    const receivedFrames = [];
    const unsubscribeFrame = adapter.frameSource.subscribeFrame((frame) => {
      receivedFrames.push(frame);
    });
    cleanupTasks.push(async () => {
      unsubscribeFrame();
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
  }, 10000);
});

async function waitForServerListening(server) {
  if (server.address()) {
    return;
  }

  await new Promise((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };

    server.once("listening", onListening);
    server.once("error", onError);
  });
}

async function closeServer(server) {
  if (!server.address()) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function waitFor(predicate, timeoutMs) {
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
