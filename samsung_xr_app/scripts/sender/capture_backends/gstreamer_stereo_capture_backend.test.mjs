import { afterEach, describe, expect, it, vi } from "vitest";
import { createStereoCaptureBackend } from "../capture_backend_factory.mjs";
import { parseSenderCliArgs } from "../sender_config.mjs";
import {
  GStreamerStereoCaptureBackend,
  runGStreamerStereoCapturePreflight,
} from "./gstreamer_stereo_capture_backend.mjs";

const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe("sender camera config", () => {
  it("parses new capture CLI options", () => {
    const config = parseSenderCliArgs([
      "--provider",
      "camera",
      "--camera-profile",
      "hardware_safe",
      "--capture-backend",
      "gstreamer",
      "--health-log",
      "--health-log-interval-ms",
      "4500",
      "--left-camera-device",
      "/dev/video6",
      "--right-camera-device",
      "/dev/video7",
      "--capture-timeout-ms",
      "3500",
      "--capture-jpeg-quality",
      "92",
      "--capture-warmup-frames",
      "2",
      "--capture-retry-count",
      "4",
      "--capture-retry-delay-ms",
      "650",
      "--fault-inject-every-n-captures",
      "3",
      "--fault-inject-failure-count",
      "2",
      "--fault-inject-mode",
      "timeout",
      "--fault-inject-start-after-captures",
      "1",
      "--fault-inject-heartbeat-drop",
      "--fault-inject-heartbeat-drop-after-ms",
      "2200",
    ]);

    expect(config.provider).toBe("camera");
    expect(config.cameraProfile).toBe("hardware_safe");
    expect(config.captureBackend).toBe("gstreamer");
    expect(config.healthLog).toBe(true);
    expect(config.healthLogIntervalMs).toBe(4500);
    expect(config.leftCameraDevice).toBe("/dev/video6");
    expect(config.rightCameraDevice).toBe("/dev/video7");
    expect(config.captureTimeoutMs).toBe(3500);
    expect(config.captureJpegQuality).toBe(92);
    expect(config.captureWarmupFrames).toBe(2);
    expect(config.captureRetryCount).toBe(4);
    expect(config.captureRetryDelayMs).toBe(650);
    expect(config.faultInjectEveryNCaptures).toBe(3);
    expect(config.faultInjectFailureCount).toBe(2);
    expect(config.faultInjectMode).toBe("timeout");
    expect(config.faultInjectStartAfterCaptures).toBe(1);
    expect(config.faultInjectHeartbeatDrop).toBe(true);
    expect(config.faultInjectHeartbeatDropAfterMs).toBe(2200);
    expect(config.fps).toBe(0.5);
    expect(config.captureWidth).toBe(1280);
    expect(config.captureHeight).toBe(720);
  });
});

describe("capture backend factory", () => {
  it("falls back to the placeholder backend on unsupported hosts", () => {
    const restorePlatform = mockProcessPlatform("win32");

    try {
      const backend = createStereoCaptureBackend(createFactoryConfig());
      expect(backend.constructor.name).toBe("PlaceholderStereoCaptureBackend");
    } finally {
      restorePlatform();
    }
  });
});

describe("GStreamerStereoCaptureBackend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a clean startup error when gst-launch-1.0 cannot be resolved", async () => {
    const backend = createTestBackend({
      resolveCommandPathFn: vi.fn(async () => {
        return null;
      }),
    });

    await expect(backend.start()).rejects.toThrow(
      /gst-launch-1.0 was not found on PATH/i,
    );

    const status = backend.getStatus();
    expect(status.state).toBe("error");
    expect(status.startupValidated).toBe(false);
    expect(status.gstLaunchPath).toBeNull();
    expect(status.lastError).toContain("gst-launch-1.0");
  });

  it("reports a clean startup error when a camera device path is missing", async () => {
    const backend = createTestBackend({
      accessFn: vi.fn(async (devicePath) => {
        if (devicePath === "/dev/video1") {
          throw new Error("ENOENT");
        }
      }),
    });

    await expect(backend.start()).rejects.toThrow(
      /Right camera device \/dev\/video1 is not accessible/i,
    );

    const status = backend.getStatus();
    expect(status.state).toBe("error");
    expect(status.startupValidated).toBe(false);
    expect(status.failedCaptures).toBe(0);
  });

  it("marks timeout failures with detailed diagnostics", async () => {
    const runProcessFn = vi.fn(async (request) => {
      if (request.args.includes("--version")) {
        return {
          stdout: Buffer.from("gst-launch-1.0 1.22.0"),
          stderrText: "",
        };
      }

      const argText = request.args.join(" ");
      if (argText.includes("device=/dev/video0")) {
        throw Object.assign(new Error("capture timed out"), {
          processErrorKind: "timeout",
          stderrText: "waiting for preroll",
        });
      }

      return {
        stdout: JPEG_BUFFER,
        stderrText: "",
      };
    });

    const backend = createTestBackend({
      captureWarmupFrames: 0,
      captureRetryCount: 0,
      runProcessFn,
    });

    await backend.start();
    await expect(backend.captureStereoPair()).rejects.toThrow(
      /Left camera capture failed for \/dev\/video0 \(timeout\)/i,
    );

    const status = backend.getStatus();
    expect(status.state).toBe("error");
    expect(status.failedCaptures).toBe(1);
    expect(status.transientFailureCount).toBe(0);
    expect(status.lastError).toContain("waiting for preroll");
    expect(status.lastCaptureDurationMs).not.toBeNull();
  });

  it("updates counters and status fields after successful and failed captures", async () => {
    let failRightCapture = false;
    const runProcessFn = vi.fn(async (request) => {
      if (request.args.includes("--version")) {
        return {
          stdout: Buffer.from("gst-launch-1.0 1.22.0"),
          stderrText: "",
        };
      }

      const argText = request.args.join(" ");
      if (failRightCapture && argText.includes("device=/dev/video1")) {
        throw Object.assign(new Error("pipeline exited"), {
          processErrorKind: "process_failure",
          stderrText: "device busy",
        });
      }

      return {
        stdout: JPEG_BUFFER,
        stderrText: "",
      };
    });

    const backend = createTestBackend({
      captureWarmupFrames: 1,
      captureRetryCount: 0,
      runProcessFn,
      nowFn: createIncrementingNowFn(),
    });

    await backend.start();
    const afterStart = backend.getStatus();
    expect(afterStart.state).toBe("running");
    expect(afterStart.startupValidated).toBe(true);
    expect(afterStart.gstLaunchPath).toBe("/usr/bin/gst-launch-1.0");
    expect(afterStart.leftDevice).toBe("/dev/video0");
    expect(afterStart.rightDevice).toBe("/dev/video1");
    expect(afterStart.width).toBe(1280);
    expect(afterStart.height).toBe(720);
    expect(afterStart.capturesAttempted).toBe(1);
    expect(afterStart.capturesSucceeded).toBe(1);
    expect(afterStart.lastSuccessfulCaptureTime).toBeTypeOf("number");
    expect(afterStart.successfulCaptures).toBe(1);
    expect(afterStart.failedCaptures).toBe(0);

    const successfulPair = await backend.captureStereoPair();
    expect(successfulPair.leftImage).toEqual(JPEG_BUFFER);
    expect(successfulPair.rightImage).toEqual(JPEG_BUFFER);

    const afterSuccess = backend.getStatus();
    expect(afterSuccess.successfulCaptures).toBe(2);
    expect(afterSuccess.failedCaptures).toBe(0);
    expect(afterSuccess.capturesSucceeded).toBe(2);
    expect(afterSuccess.lastCaptureTime).toBeTypeOf("number");
    expect(afterSuccess.lastSuccessfulCaptureTime).toBeTypeOf("number");
    expect(afterSuccess.lastCaptureDurationMs).toBeTypeOf("number");
    expect(afterSuccess.lastError).toBeNull();

    failRightCapture = true;
    await expect(backend.captureStereoPair()).rejects.toThrow(
      /Right camera capture failed for \/dev\/video1/i,
    );

    const afterFailure = backend.getStatus();
    expect(afterFailure.state).toBe("error");
    expect(afterFailure.successfulCaptures).toBe(2);
    expect(afterFailure.failedCaptures).toBe(1);
    expect(afterFailure.lastError).toContain("device busy");
    expect(afterFailure.capturesAttempted).toBe(3);
    expect(afterFailure.consecutiveFailureCount).toBe(1);
    expect(afterFailure.averageCaptureDurationMs).toBeTypeOf("number");
    expect(afterFailure.effectiveFrameIntervalMs).toBeTypeOf("number");
  });

  it("recovers after a single transient failure within the retry budget", async () => {
    let leftFailuresRemaining = 1;
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      captureRetryCount: 2,
      captureRetryDelayMs: 0,
      runProcessFn: vi.fn(async (request) => {
        if (request.args.includes("--version")) {
          return {
            stdout: Buffer.from("gst-launch-1.0 1.22.0"),
            stderrText: "",
          };
        }

        const argText = request.args.join(" ");
        if (
          leftFailuresRemaining > 0 &&
          argText.includes("device=/dev/video0")
        ) {
          leftFailuresRemaining -= 1;
          throw Object.assign(new Error("temporary v4l2 timeout"), {
            processErrorKind: "timeout",
            stderrText: "buffering",
          });
        }

        return {
          stdout: JPEG_BUFFER,
          stderrText: "",
        };
      }),
      nowFn: createIncrementingNowFn(),
    });

    await backend.start();
    const capturedPair = await backend.captureStereoPair();
    expect(capturedPair.leftImage).toEqual(JPEG_BUFFER);
    expect(capturedPair.rightImage).toEqual(JPEG_BUFFER);

    const status = backend.getStatus();
    expect(status.state).toBe("running");
    expect(status.captureHealthState).toBe("recovered");
    expect(status.capturesAttempted).toBe(1);
    expect(status.capturesSucceeded).toBe(1);
    expect(status.capturesFailed).toBe(0);
    expect(status.transientFailureCount).toBe(1);
    expect(status.recoveryCount).toBe(1);
    expect(status.recentRetryAttempts).toBe(1);
    expect(status.lastRecoveryTime).toBeTypeOf("number");
    expect(status.lastTerminalFailureTime).toBeNull();
    expect(status.lastError).toBeNull();
  });

  it("enters a terminal failure state after exhausting retries", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      captureRetryCount: 2,
      captureRetryDelayMs: 0,
      runProcessFn: vi.fn(async (request) => {
        if (request.args.includes("--version")) {
          return {
            stdout: Buffer.from("gst-launch-1.0 1.22.0"),
            stderrText: "",
          };
        }

        const argText = request.args.join(" ");
        if (argText.includes("device=/dev/video0")) {
          throw Object.assign(new Error("device lost"), {
            processErrorKind: "process_failure",
            stderrText: "no signal",
          });
        }

        return {
          stdout: JPEG_BUFFER,
          stderrText: "",
        };
      }),
      nowFn: createIncrementingNowFn(),
    });

    await backend.start();
    await expect(backend.captureStereoPair()).rejects.toThrow(
      /Left camera capture failed for \/dev\/video0/i,
    );

    const status = backend.getStatus();
    expect(status.state).toBe("error");
    expect(status.captureHealthState).toBe("terminal_failure");
    expect(status.capturesAttempted).toBe(1);
    expect(status.capturesSucceeded).toBe(0);
    expect(status.capturesFailed).toBe(1);
    expect(status.transientFailureCount).toBe(2);
    expect(status.recentRetryAttempts).toBe(2);
    expect(status.currentRetryAttempt).toBe(0);
    expect(status.lastTerminalFailureTime).toBeTypeOf("number");
    expect(status.lastError).toContain("no signal");
  });

  it("injects a transient timeout fault and records recovery history", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      captureRetryCount: 2,
      captureRetryDelayMs: 0,
      faultInjectEveryNCaptures: 1,
      faultInjectFailureCount: 1,
      faultInjectMode: "timeout",
      faultInjectStartAfterCaptures: 0,
      nowFn: createIncrementingNowFn(),
    });

    await backend.start();
    const capturedPair = await backend.captureStereoPair();
    expect(capturedPair.leftImage).toEqual(JPEG_BUFFER);
    expect(capturedPair.rightImage).toEqual(JPEG_BUFFER);

    const status = backend.getStatus();
    expect(status.state).toBe("running");
    expect(status.captureHealthState).toBe("recovered");
    expect(status.recentRetryAttempts).toBe(1);
    expect(status.recentCaptureEvents).toHaveLength(2);
    expect(status.recentCaptureEvents?.[0]).toMatchObject({
      eventType: "retrying",
      retryAttempt: 1,
    });
    expect(status.recentCaptureEvents?.[0]?.summary).toContain("Injected timeout fault");
    expect(status.recentCaptureEvents?.[1]).toMatchObject({
      eventType: "recovered",
      retryAttempt: 1,
    });
  });

  it("injects terminal failures until the retry budget is exhausted", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      captureRetryCount: 2,
      captureRetryDelayMs: 0,
      faultInjectEveryNCaptures: 1,
      faultInjectFailureCount: 1,
      faultInjectMode: "terminal",
      faultInjectStartAfterCaptures: 0,
      nowFn: createIncrementingNowFn(),
    });

    await backend.start();
    await expect(backend.captureStereoPair()).rejects.toThrow(
      /Injected terminal fault/i,
    );

    const status = backend.getStatus();
    expect(status.state).toBe("error");
    expect(status.captureHealthState).toBe("terminal_failure");
    expect(status.recentRetryAttempts).toBe(2);
    expect(status.recentCaptureEvents?.at(-1)).toMatchObject({
      eventType: "terminal_failure",
      retryAttempt: 2,
    });
  });

  it("keeps recent capture issue history bounded", async () => {
    const backend = createTestBackend({
      captureWarmupFrames: 0,
      captureRetryCount: 1,
      captureRetryDelayMs: 0,
      faultInjectEveryNCaptures: 1,
      faultInjectFailureCount: 1,
      faultInjectMode: "transient",
      faultInjectStartAfterCaptures: 0,
      nowFn: createIncrementingNowFn(),
    });

    await backend.start();
    await backend.captureStereoPair();
    await backend.captureStereoPair();
    await backend.captureStereoPair();

    const status = backend.getStatus();
    expect(status.recentCaptureEvents).toHaveLength(5);
    expect(status.recentCaptureEvents?.[0]?.eventType).toBe("recovered");
    expect(status.recentCaptureEvents?.at(-1)?.eventType).toBe("recovered");
  });

  it("uses explicit device paths in status and capture metadata", async () => {
    const backend = createTestBackend({
      leftCameraDevice: "/dev/media-left",
      rightCameraDevice: "/dev/media-right",
      captureWarmupFrames: 0,
    });

    await backend.start();
    const status = backend.getStatus();
    expect(status.leftDevice).toBe("/dev/media-left");
    expect(status.rightDevice).toBe("/dev/media-right");

    const capturedPair = await backend.captureStereoPair();
    expect(capturedPair.left.metadata?.devicePath).toBe("/dev/media-left");
    expect(capturedPair.right.metadata?.devicePath).toBe("/dev/media-right");
  });
});

describe("GStreamer preflight", () => {
  it("reports successful validation with sample capture sizes", async () => {
    const preflight = await runGStreamerStereoCapturePreflight(
      createFactoryConfig(),
      {
        platform: "linux",
        accessFn: async () => undefined,
        resolveCommandPathFn: async ({ command }) => {
          return `/usr/bin/${command}`;
        },
        runProcessFn: async (request) => {
          if (request.command.includes("gst-inspect-1.0")) {
            return {
              stdout: Buffer.from("ok"),
              stderrText: "",
            };
          }
          if (request.args.includes("--version")) {
            return {
              stdout: Buffer.from("gst-launch-1.0 1.22.0"),
              stderrText: "",
            };
          }
          return {
            stdout: JPEG_BUFFER,
            stderrText: "",
          };
        },
      },
    );

    expect(preflight.ok).toBe(true);
    expect(preflight.failedCount).toBe(0);
    expect(preflight.sampleCaptures?.left.byteLength).toBe(JPEG_BUFFER.byteLength);
    expect(preflight.sampleCaptures?.right.byteLength).toBe(JPEG_BUFFER.byteLength);
  });

  it("fails preflight cleanly on unsupported hosts", async () => {
    const preflight = await runGStreamerStereoCapturePreflight(
      createFactoryConfig(),
      {
        platform: "win32",
      },
    );

    expect(preflight.ok).toBe(false);
    expect(preflight.failedCount).toBe(1);
    expect(preflight.results[0]?.message).toContain("requires Linux/Jetson");
  });
});

function createFactoryConfig() {
  return {
    provider: "camera",
    cameraProfile: "default",
    captureBackend: "gstreamer",
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
    faultInjectHeartbeatDrop: false,
    faultInjectHeartbeatDropAfterMs: 3000,
  };
}

function createTestBackend(overrides = {}) {
  return new GStreamerStereoCaptureBackend({
    ...createFactoryConfig(),
    platform: "linux",
    accessFn:
      overrides.accessFn ??
      (async () => {
        return undefined;
      }),
    resolveCommandPathFn:
      overrides.resolveCommandPathFn ??
      (async () => {
        return "/usr/bin/gst-launch-1.0";
      }),
    runProcessFn:
      overrides.runProcessFn ??
      (async (request) => {
        if (request.args.includes("--version")) {
          return {
            stdout: Buffer.from("gst-launch-1.0 1.22.0"),
            stderrText: "",
          };
        }

        return {
          stdout: JPEG_BUFFER,
          stderrText: "",
        };
      }),
    nowFn: overrides.nowFn ?? createIncrementingNowFn(),
    ...overrides,
  });
}

function createIncrementingNowFn(startMs = 1000, stepMs = 25) {
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
