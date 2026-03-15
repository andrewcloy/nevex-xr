import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startJetsonSenderPrototype } from "./sender_runtime.mjs";

const SENDER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(SENDER_DIR, "..", "assets");
const LEFT_REPLAY_DIR = path.resolve(ASSETS_DIR, "sequence", "left");
const RIGHT_REPLAY_DIR = path.resolve(ASSETS_DIR, "sequence", "right");
const REPLAY_MANIFEST_PATH = path.resolve(
  ASSETS_DIR,
  "sequence",
  "replay_manifest.json",
);

describe("sender runtime with replay camera backend", () => {
  afterEach(() => {
    // no-op; server cleanup happens inside each test
  });

  it("emits camera-mode source_status and stereo_frame messages using the replay backend", async () => {
    const server = await startJetsonSenderPrototype(
      createRuntimeConfig({
        replayFpsMode: "fixed",
      }),
    );
    await waitForServerListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/jetson/messages`);
    const messages = [];

    socket.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    await waitFor(() => {
      return (
        messages.filter((message) => message.messageType === "stereo_frame").length >= 2
      );
    }, 4000);

    const sourceStatusMessage = messages.find((message) => {
      return (
        message.messageType === "source_status" &&
        message.payload?.cameraTelemetry?.captureBackendName === "replay"
      );
    });
    const stereoFrameMessages = messages.filter((message) => {
      return message.messageType === "stereo_frame";
    });

    expect(sourceStatusMessage?.payload?.sourceState).toBe("running");
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.startupValidated).toBe(true);
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayFrameCount).toBe(2);
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayLoopEnabled).toBe(true);
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replaySourceIdentity).toContain(
      "left=",
    );
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayTimingMode).toBe(
      "fixed",
    );
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayTimeScale).toBe(1);
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestLoaded).toBe(
      false,
    );
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestValidated,
    ).toBe(false);
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestErrorCount,
    ).toBe(0);
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestWarningCount,
    ).toBe(0);
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayValidationSummary,
    ).toContain("without a replay manifest");

    expect(stereoFrameMessages[0]?.payload?.left?.image?.base64Data).toBeTruthy();
    expect(stereoFrameMessages[0]?.payload?.right?.image?.base64Data).toBeTruthy();
    expect(stereoFrameMessages[0]?.payload?.left?.title).toBe("Replay Camera Snapshot");
    expect(stereoFrameMessages[0]?.payload?.left?.metadata?.fileName).toBe(
      "frame_001.svg",
    );
    expect(stereoFrameMessages[1]?.payload?.left?.metadata?.fileName).toBe(
      "frame_002.svg",
    );
    expect(stereoFrameMessages[0]?.payload?.extras?.replayDelayUntilNextMs).toBe(500);
    expect(stereoFrameMessages[0]?.payload?.extras?.replayScaledDelayUntilNextMs).toBe(
      500,
    );

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("uses manifest-derived replay timing in recorded mode", async () => {
    const server = await startJetsonSenderPrototype(
      createRuntimeConfig({
        fps: 20,
        replayFpsMode: "recorded",
        replayManifestPath: REPLAY_MANIFEST_PATH,
      }),
    );
    await waitForServerListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/jetson/messages`);
    const messages = [];
    const stereoFrames = [];

    socket.on("message", (data) => {
      const message = JSON.parse(data.toString("utf8"));
      messages.push(message);
      if (message.messageType === "stereo_frame") {
        stereoFrames.push({
          message,
          receivedAtMs: Date.now(),
        });
      }
    });

    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    await waitFor(() => {
      return stereoFrames.length >= 3;
    }, 6000);

    const sourceStatusMessage = messages.find((message) => {
      return (
        message.messageType === "source_status" &&
        message.payload?.cameraTelemetry?.captureBackendName === "replay" &&
        message.payload?.cameraTelemetry?.replayManifestLoaded === true &&
        typeof message.payload?.cameraTelemetry?.replayRecordedTimestamp === "number"
      );
    });

    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayTimingMode).toBe(
      "recorded",
    );
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayTimeScale).toBe(1);
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestLoaded).toBe(
      true,
    );
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestValidated,
    ).toBe(true);
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestErrorCount,
    ).toBe(0);
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestWarningCount,
    ).toBe(0);
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayManifestSource,
    ).toBe(REPLAY_MANIFEST_PATH);
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.replayRecordedTimestamp).toBe(
      1000,
    );
    expect(
      sourceStatusMessage?.payload?.cameraTelemetry?.replayValidationSummary,
    ).toContain("Validated replay manifest");

    expect(stereoFrames[0]?.message?.payload?.extras?.replayDelayUntilNextMs).toBe(
      180,
    );
    expect(
      stereoFrames[0]?.message?.payload?.extras?.replayScaledDelayUntilNextMs,
    ).toBe(180);
    expect(stereoFrames[1]?.message?.payload?.extras?.replayDelayUntilNextMs).toBe(90);
    expect(
      stereoFrames[1]?.message?.payload?.extras?.replayScaledDelayUntilNextMs,
    ).toBe(90);
    expect(
      stereoFrames[1].receivedAtMs - stereoFrames[0].receivedAtMs,
    ).toBeGreaterThanOrEqual(130);
    expect(
      stereoFrames[2].receivedAtMs - stereoFrames[1].receivedAtMs,
    ).toBeGreaterThanOrEqual(50);
    expect(stereoFrames[2]?.message?.payload?.left?.metadata?.fileName).toBe(
      "frame_001.svg",
    );

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });
});

function createRuntimeConfig(overrides = {}) {
  return {
    host: "127.0.0.1",
    port: 0,
    path: "/jetson/messages",
    fps: 2,
    senderName: "replay_camera_runtime_test",
    senderVersion: "0.1.0-test",
    streamName: "replay_camera_runtime_stream",
    imageMode: "base64",
    provider: "camera",
    cameraProfile: "default",
    captureBackend: "replay",
    leftCameraId: "replay-left",
    rightCameraId: "replay-right",
    leftCameraDevice: undefined,
    rightCameraDevice: undefined,
    captureWidth: 640,
    captureHeight: 360,
    captureTimeoutMs: 3000,
    captureJpegQuality: 75,
    captureWarmupFrames: 0,
    captureRetryCount: 2,
    captureRetryDelayMs: 0,
    faultInjectEveryNCaptures: 0,
    faultInjectFailureCount: 1,
    faultInjectMode: "transient",
    faultInjectStartAfterCaptures: 0,
    faultInjectHeartbeatDrop: false,
    faultInjectHeartbeatDropAfterMs: 3000,
    healthLog: false,
    healthLogIntervalMs: 5000,
    leftReplayDir: LEFT_REPLAY_DIR,
    rightReplayDir: RIGHT_REPLAY_DIR,
    leftReplayFiles: [],
    rightReplayFiles: [],
    replayLoop: true,
    replayFpsMode: "fixed",
    replayTimeScale: 1,
    replayManifestPath: undefined,
    maxRecommendedPayloadBytes: 256 * 1024,
    ...overrides,
  };
}

async function waitForServerListening(server) {
  if (server.address()) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
}
