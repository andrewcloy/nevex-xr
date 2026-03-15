import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createStereoCaptureBackend } from "../capture_backend_factory.mjs";
import { parseSenderCliArgs } from "../sender_config.mjs";
import { ReplayStereoCaptureBackend } from "./replay_stereo_capture_backend.mjs";

const BACKENDS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SENDER_DIR = path.resolve(BACKENDS_DIR, "..");
const ASSETS_DIR = path.resolve(SENDER_DIR, "..", "assets");
const LEFT_REPLAY_DIR = path.resolve(ASSETS_DIR, "sequence", "left");
const RIGHT_REPLAY_DIR = path.resolve(ASSETS_DIR, "sequence", "right");
const REPLAY_MANIFEST_PATH = path.resolve(
  ASSETS_DIR,
  "sequence",
  "replay_manifest.json",
);

describe("replay sender camera config", () => {
  it("parses replay backend CLI options", () => {
    const config = parseSenderCliArgs([
      "--provider",
      "camera",
      "--capture-backend",
      "replay",
      "--left-replay-dir",
      LEFT_REPLAY_DIR,
      "--right-replay-dir",
      RIGHT_REPLAY_DIR,
      "--replay-loop",
      "false",
      "--replay-fps-mode",
      "recorded",
      "--replay-time-scale",
      "2.0",
      "--replay-preview-count",
      "3",
      "--preflight-output",
      "json",
      "--preflight-output-file",
      ".\\reports\\preflight.json",
      "--preflight-output-quiet",
      "--replay-manifest",
      REPLAY_MANIFEST_PATH,
    ]);

    expect(config.provider).toBe("camera");
    expect(config.captureBackend).toBe("replay");
    expect(config.leftReplayDir).toBe(LEFT_REPLAY_DIR);
    expect(config.rightReplayDir).toBe(RIGHT_REPLAY_DIR);
    expect(config.replayLoop).toBe(false);
    expect(config.replayFpsMode).toBe("recorded");
    expect(config.replayTimeScale).toBe(2);
    expect(config.replayPreviewCount).toBe(3);
    expect(config.preflightOutput).toBe("json");
    expect(config.preflightOutputFile).toBe(".\\reports\\preflight.json");
    expect(config.preflightOutputQuiet).toBe(true);
    expect(config.replayManifestPath).toBe(REPLAY_MANIFEST_PATH);
  });

  it("rejects invalid replay time scale values", () => {
    expect(() => {
      parseSenderCliArgs([
        "--provider",
        "camera",
        "--capture-backend",
        "replay",
        "--replay-time-scale",
        "0",
      ]);
    }).toThrow("--replay-time-scale must be a positive number.");
  });

  it("rejects invalid replay preview count values", () => {
    expect(() => {
      parseSenderCliArgs([
        "--provider",
        "camera",
        "--capture-backend",
        "replay",
        "--replay-preview-count",
        "0",
      ]);
    }).toThrow("--replay-preview-count must be a positive integer.");
  });
});

describe("ReplayStereoCaptureBackend", () => {
  it("is selected by the factory when replay is requested", () => {
    const backend = createStereoCaptureBackend(createFactoryConfig());
    expect(backend.constructor.name).toBe("ReplayStereoCaptureBackend");
  });

  it("starts cleanly and resolves replay telemetry", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      fps: 4,
    });

    await backend.start();
    const firstPair = await backend.captureStereoPair();
    const status = backend.getStatus();

    expect(status.state).toBe("running");
    expect(status.startupValidated).toBe(true);
    expect(status.captureHealthState).toBe("healthy");
    expect(status.gstLaunchPath).toBe("n/a (replay)");
    expect(status.replayFrameCount).toBe(2);
    expect(status.replayLoopEnabled).toBe(true);
    expect(status.replaySourceIdentity).toContain("left=");
    expect(status.replayLeftSource).toContain(LEFT_REPLAY_DIR);
    expect(status.replayRightSource).toContain(RIGHT_REPLAY_DIR);
    expect(status.replayTimingMode).toBe("fixed");
    expect(status.replayManifestLoaded).toBe(false);
    expect(status.replayManifestValidated).toBe(false);
    expect(status.replayManifestErrorCount).toBe(0);
    expect(status.replayManifestWarningCount).toBe(0);
    expect(status.replayValidationSummary).toContain("without a replay manifest");
    expect(status.replayDelayUntilNextMs).toBe(250);
    expect(firstPair.extras.replayDelayUntilNextMs).toBe(250);
  });

  it("uses manifest entries and recorded timing metadata when requested", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      replayFpsMode: "recorded",
      replayManifestPath: REPLAY_MANIFEST_PATH,
      replayLoop: true,
    });

    await backend.start();
    const firstPair = await backend.captureStereoPair();
    const secondPair = await backend.captureStereoPair();

    expect(path.basename(firstPair.left.filePath)).toBe("frame_001.svg");
    expect(path.basename(firstPair.right.filePath)).toBe("frame_001.svg");
    expect(firstPair.extras.replayManifestLoaded).toBe(true);
    expect(firstPair.extras.replayTimingMode).toBe("recorded");
    expect(firstPair.extras.replayTimeScale).toBe(1);
    expect(firstPair.extras.replayRecordedTimestamp).toBe(1000);
    expect(firstPair.extras.replayDelayUntilNextMs).toBe(180);
    expect(firstPair.extras.replayScaledDelayUntilNextMs).toBe(180);
    expect(firstPair.extras.replayFrameId).toBe(101);
    expect(firstPair.overlayLabel).toBe("Replay sample pair 1");

    expect(secondPair.extras.replayRecordedTimestamp).toBe(1180);
    expect(secondPair.extras.replayDelayUntilNextMs).toBe(90);
    expect(secondPair.extras.replayScaledDelayUntilNextMs).toBe(90);
    expect(secondPair.extras.replayFrameId).toBe(102);
    expect(secondPair.overlayLabel).toBe("Replay sample pair 2");

    const status = backend.getStatus();
    expect(status.replayManifestLoaded).toBe(true);
    expect(status.replayManifestValidated).toBe(true);
    expect(status.replayManifestErrorCount).toBe(0);
    expect(status.replayManifestWarningCount).toBe(0);
    expect(status.replayManifestSource).toBe(REPLAY_MANIFEST_PATH);
    expect(status.replayValidationSummary).toContain("Validated replay manifest");
    expect(status.replayTimingMode).toBe("recorded");
    expect(status.replayTimeScale).toBe(1);
    expect(status.replayRecordedTimestamp).toBe(1180);
    expect(status.replayDelayUntilNextMs).toBe(90);
    expect(status.replayScaledDelayUntilNextMs).toBe(90);
    expect(status.replayNominalLoopDurationMs).toBe(270);
    expect(status.replayScaledLoopDurationMs).toBe(270);
    expect(status.replaySourceIdentity).toContain("manifest:");
  });

  it("steps through replay pairs and holds the final pair when looping is disabled", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      replayLoop: false,
    });

    await backend.start();
    const firstPair = await backend.captureStereoPair();
    const secondPair = await backend.captureStereoPair();
    const thirdPair = await backend.captureStereoPair();

    expect(path.basename(firstPair.left.filePath)).toBe("frame_001.svg");
    expect(path.basename(firstPair.right.filePath)).toBe("frame_001.svg");
    expect(path.basename(secondPair.left.filePath)).toBe("frame_002.svg");
    expect(path.basename(secondPair.right.filePath)).toBe("frame_002.svg");
    expect(path.basename(thirdPair.left.filePath)).toBe("frame_002.svg");
    expect(path.basename(thirdPair.right.filePath)).toBe("frame_002.svg");
    expect(thirdPair.extras.replayHoldingFinalFrame).toBe(true);

    const status = backend.getStatus();
    expect(status.capturesAttempted).toBe(3);
    expect(status.capturesSucceeded).toBe(3);
    expect(status.replayCurrentIndex).toBe(2);
    expect(status.replayFrameCount).toBe(2);
  });

  it("loops back to the first pair when replay looping is enabled", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      replayLoop: true,
    });

    await backend.start();
    const firstPair = await backend.captureStereoPair();
    const secondPair = await backend.captureStereoPair();
    const thirdPair = await backend.captureStereoPair();

    expect(path.basename(firstPair.left.filePath)).toBe("frame_001.svg");
    expect(path.basename(secondPair.left.filePath)).toBe("frame_002.svg");
    expect(path.basename(thirdPair.left.filePath)).toBe("frame_001.svg");
    expect(thirdPair.extras.replayHoldingFinalFrame).toBe(false);

    const status = backend.getStatus();
    expect(status.replayCurrentIndex).toBe(1);
    expect(status.captureHealthState).toBe("healthy");
  });

  it("falls back to directory pairing when the replay manifest is missing in fixed mode", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      replayFpsMode: "fixed",
      replayManifestPath: path.resolve(ASSETS_DIR, "sequence", "missing_manifest.json"),
      replayLoop: false,
      fps: 2,
    });

    await backend.start();
    const firstPair = await backend.captureStereoPair();

    expect(path.basename(firstPair.left.filePath)).toBe("frame_001.svg");
    expect(firstPair.extras.replayManifestLoaded).toBe(false);
    expect(firstPair.extras.replayManifestValidated).toBe(false);
    expect(firstPair.extras.replayManifestWarningCount).toBe(1);
    expect(firstPair.extras.replayTimingMode).toBe("fixed");
    expect(firstPair.extras.replayDelayUntilNextMs).toBe(500);
    expect(backend.getStatus().replaySourceIdentity).toContain("left=");
    expect(backend.getStatus().replayValidationSummary).toContain(
      "was not found",
    );
  });

  it("loops manifest-backed replay sequences cleanly", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      replayFpsMode: "recorded",
      replayManifestPath: REPLAY_MANIFEST_PATH,
      replayLoop: true,
    });

    await backend.start();
    const firstPair = await backend.captureStereoPair();
    const secondPair = await backend.captureStereoPair();
    const thirdPair = await backend.captureStereoPair();

    expect(path.basename(firstPair.left.filePath)).toBe("frame_001.svg");
    expect(path.basename(secondPair.left.filePath)).toBe("frame_002.svg");
    expect(path.basename(thirdPair.left.filePath)).toBe("frame_001.svg");
    expect(secondPair.extras.replayDelayUntilNextMs).toBe(90);
    expect(thirdPair.extras.replayManifestLoaded).toBe(true);
  });

  it("recovers from an injected transient replay failure", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      captureRetryCount: 2,
      captureRetryDelayMs: 0,
      faultInjectEveryNCaptures: 1,
      faultInjectFailureCount: 1,
      faultInjectMode: "timeout",
      nowFn: createIncrementingNowFn(),
    });

    await backend.start();
    const capturedPair = await backend.captureStereoPair();
    expect(capturedPair.left.bytes.byteLength).toBeGreaterThan(0);
    expect(capturedPair.right.bytes.byteLength).toBeGreaterThan(0);

    const status = backend.getStatus();
    expect(status.state).toBe("running");
    expect(status.captureHealthState).toBe("recovered");
    expect(status.transientFailureCount).toBe(1);
    expect(status.recoveryCount).toBe(1);
    expect(status.recentRetryAttempts).toBe(1);
    expect(status.recentCaptureEvents).toHaveLength(2);
    expect(status.recentCaptureEvents?.[0]).toMatchObject({
      eventType: "retrying",
      retryAttempt: 1,
    });
    expect(status.recentCaptureEvents?.[1]).toMatchObject({
      eventType: "recovered",
      retryAttempt: 1,
    });
  });
});

function createFactoryConfig() {
  return {
    fps: 1,
    provider: "camera",
    cameraProfile: "default",
    captureBackend: "replay",
    leftCameraId: "0",
    rightCameraId: "1",
    leftCameraDevice: undefined,
    rightCameraDevice: undefined,
    captureWidth: 1280,
    captureHeight: 720,
    captureTimeoutMs: 3000,
    captureJpegQuality: 85,
    captureWarmupFrames: 1,
    captureRetryCount: 2,
    captureRetryDelayMs: 500,
    faultInjectEveryNCaptures: 0,
    faultInjectFailureCount: 1,
    faultInjectMode: "transient",
    faultInjectStartAfterCaptures: 0,
    leftReplayDir: LEFT_REPLAY_DIR,
    rightReplayDir: RIGHT_REPLAY_DIR,
    leftReplayFiles: [],
    rightReplayFiles: [],
    replayLoop: true,
    replayFpsMode: "fixed",
    replayTimeScale: 1,
    replayManifestPath: undefined,
  };
}

function createTestBackend(overrides = {}) {
  return new ReplayStereoCaptureBackend({
    ...createFactoryConfig(),
    nowFn: overrides.nowFn ?? createIncrementingNowFn(),
    ...overrides,
  });
}

function createIncrementingNowFn(startMs = 1000, stepMs = 40) {
  let currentMs = startMs;
  return () => {
    currentMs += stepMs;
    return currentMs;
  };
}
