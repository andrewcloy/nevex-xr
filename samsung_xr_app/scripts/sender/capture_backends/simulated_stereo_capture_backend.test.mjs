import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStereoCaptureBackend } from "../capture_backend_factory.mjs";
import { parseSenderCliArgs } from "../sender_config.mjs";
import { SimulatedStereoCaptureBackend } from "./simulated_stereo_capture_backend.mjs";

const CAPTURE_BACKENDS_DIR = path.dirname(fileURLToPath(import.meta.url));
const XR_APP_ROOT = path.resolve(CAPTURE_BACKENDS_DIR, "..", "..", "..");
const UNIFIED_PROJECT_ROOT = path.resolve(XR_APP_ROOT, "..");

describe("simulated sender camera config", () => {
  it("parses the simulated capture backend", () => {
    const config = parseSenderCliArgs([
      "--provider",
      "camera",
      "--capture-backend",
      "simulated",
      "--capture-width",
      "960",
      "--capture-height",
      "540",
    ]);

    expect(config.provider).toBe("camera");
    expect(config.captureBackend).toBe("simulated");
    expect(config.captureWidth).toBe(960);
    expect(config.captureHeight).toBe(540);
  });

  it("prefers the canonical top-level Jetson runtime sibling when present", () => {
    const config = parseSenderCliArgs([]);

    expect(config.jetsonRuntimeAppPath).toBe(
      path.resolve(UNIFIED_PROJECT_ROOT, "jetson_runtime", "app.py"),
    );
    expect(config.jetsonRuntimeConfigPath).toBe(
      path.resolve(
        UNIFIED_PROJECT_ROOT,
        "jetson_runtime",
        "config",
        "camera_config.json",
      ),
    );
    expect(config.jetsonRuntimeWorkingDirectory).toBe(
      path.resolve(UNIFIED_PROJECT_ROOT, "jetson_runtime"),
    );
  });
});

describe("SimulatedStereoCaptureBackend", () => {
  afterEach(() => {
    // no-op; kept for consistency with the sender backend suites
  });

  it("is selected by the factory on non-Linux hosts", () => {
    const restorePlatform = mockProcessPlatform("win32");

    try {
      const backend = createStereoCaptureBackend(createFactoryConfig());
      expect(backend.constructor.name).toBe("SimulatedStereoCaptureBackend");
    } finally {
      restorePlatform();
    }
  });

  it("starts cleanly and produces repeated simulated captures", async () => {
    const backend = createTestBackend();

    await backend.start();
    const afterStart = backend.getStatus();
    expect(afterStart.state).toBe("running");
    expect(afterStart.startupValidated).toBe(true);
    expect(afterStart.gstLaunchPath).toBe("n/a (simulated)");
    expect(afterStart.leftDevice).toContain("simulated://left-camera");
    expect(afterStart.rightDevice).toContain("simulated://right-camera");

    const firstPair = await backend.captureStereoPair();
    const secondPair = await backend.captureStereoPair();
    expect(firstPair.left.mimeType).toBe("image/svg+xml");
    expect(firstPair.right.mimeType).toBe("image/svg+xml");
    expect(firstPair.left.bytes.byteLength).toBeGreaterThan(0);
    expect(secondPair.right.bytes.byteLength).toBeGreaterThan(0);

    const status = backend.getStatus();
    expect(status.capturesAttempted).toBe(3);
    expect(status.capturesSucceeded).toBe(3);
    expect(status.capturesFailed).toBe(0);
    expect(status.lastCaptureDurationMs).toBeTypeOf("number");
    expect(status.averageCaptureDurationMs).toBeTypeOf("number");
    expect(status.effectiveFrameIntervalMs).toBeTypeOf("number");
    expect(status.captureHealthState).toBe("healthy");
  });

  it("recovers from a transient injected timeout", async () => {
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

  it("enters terminal failure after injected retries are exhausted", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      captureRetryCount: 2,
      captureRetryDelayMs: 0,
      faultInjectEveryNCaptures: 1,
      faultInjectFailureCount: 1,
      faultInjectMode: "terminal",
      nowFn: createIncrementingNowFn(),
    });

    await backend.start();
    await expect(backend.captureStereoPair()).rejects.toThrow(
      /Injected terminal fault/i,
    );

    const status = backend.getStatus();
    expect(status.state).toBe("error");
    expect(status.captureHealthState).toBe("terminal_failure");
    expect(status.capturesFailed).toBe(1);
    expect(status.recentCaptureEvents?.at(-1)).toMatchObject({
      eventType: "terminal_failure",
      retryAttempt: 2,
    });
  });
});

function createFactoryConfig() {
  return {
    provider: "camera",
    cameraProfile: "default",
    captureBackend: "simulated",
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
  };
}

function createTestBackend(overrides = {}) {
  return new SimulatedStereoCaptureBackend({
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

function mockProcessPlatform(platformValue) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  if (originalDescriptor && process.platform !== platformValue) {
    Object.defineProperty(process, "platform", {
      configurable: true,
      enumerable: originalDescriptor.enumerable ?? true,
      value: platformValue,
    });
  }

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(process, "platform", originalDescriptor);
    }
  };
}
