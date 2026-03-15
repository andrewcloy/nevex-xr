import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createImageFrameFromBuffer } from "../frame_provider_support.mjs";
import {
  appendRecentCaptureEvent,
  createFaultInjectedCaptureError,
  resolveCaptureFaultFailureCount,
  resolveFaultInjectionEyeLabel,
  shouldTriggerCaptureFaultInjection,
  summarizeCaptureIssue,
} from "../fault_injection.mjs";
import { createCaptureBackendStatus } from "./capture_backend_contract.mjs";

const GST_LAUNCH_COMMAND = "gst-launch-1.0";
const GST_PROBE_TIMEOUT_MS = 5000;
const DEFAULT_CAPTURE_TIMEOUT_MS = 3000;
const DEFAULT_CAPTURE_JPEG_QUALITY = 85;
const DEFAULT_CAPTURE_WARMUP_FRAMES = 1;
const DEFAULT_CAPTURE_RETRY_COUNT = 2;
const DEFAULT_CAPTURE_RETRY_DELAY_MS = 500;

export class GStreamerStereoCaptureBackend {
  constructor(options) {
    this.options = normalizeCaptureOptions(options);
    this.platform = options.platform ?? process.platform;
    this.accessFn = options.accessFn ?? access;
    this.runProcessFn = options.runProcessFn ?? runProcess;
    this.resolveCommandPathFn =
      options.resolveCommandPathFn ?? resolveGStreamerLaunchPath;
    this.nowFn = options.nowFn ?? Date.now;
    this.leftDevicePath = resolveVideoDevicePath(
      this.options.leftCameraDevice,
      this.options.leftCameraId,
    );
    this.rightDevicePath = resolveVideoDevicePath(
      this.options.rightCameraDevice,
      this.options.rightCameraId,
    );
    this.captureQueue = Promise.resolve();
    this.isRunning = false;
    this.startupValidated = false;
    this.captureHealthState = "idle";
    this.gstLaunchPath = null;
    this.lastCaptureTimestampMs = undefined;
    this.lastSuccessfulCaptureTimestampMs = null;
    this.lastCaptureDurationMs = null;
    this.averageCaptureDurationMs = null;
    this.effectiveFrameIntervalMs = null;
    this.successfulCaptures = 0;
    this.failedCaptures = 0;
    this.attemptedCaptures = 0;
    this.consecutiveFailureCount = 0;
    this.recentRetryAttempts = 0;
    this.currentRetryAttempt = 0;
    this.transientFailureCount = 0;
    this.recoveryCount = 0;
    this.lastRecoveryTime = null;
    this.lastTerminalFailureTime = null;
    this.recentCaptureEvents = [];
    this.totalSuccessfulCaptureDurationMs = 0;
    this.lastError = null;
    this.telemetryUpdatedAtMs = this.nowFn();
    this.status = this.createStatus({
      state: "idle",
      detailText: `Waiting to start GStreamer snapshot capture for ${this.leftDevicePath} and ${this.rightDevicePath}.`,
    });
  }

  createStatus(overrides = {}) {
    const normalizedStatus = createCaptureBackendStatus({
      backendType: "gstreamer",
      backendDisplayName: "GStreamer Stereo Capture Backend",
      state: overrides.state ?? this.status?.state ?? "idle",
      detailText: overrides.detailText ?? this.status?.detailText,
      lastCaptureTimestampMs:
        overrides.lastCaptureTimestampMs !== undefined
          ? overrides.lastCaptureTimestampMs
          : this.lastCaptureTimestampMs,
      lastError:
        overrides.lastError !== undefined ? overrides.lastError : this.lastError,
    });

    return {
      ...normalizedStatus,
      backend: "gstreamer",
      lastCaptureTime: normalizedStatus.lastCaptureTimestampMs ?? null,
      lastError: normalizedStatus.lastError ?? null,
      leftDevice: this.leftDevicePath,
      rightDevice: this.rightDevicePath,
      width: this.options.captureWidth,
      height: this.options.captureHeight,
      lastCaptureDurationMs: this.lastCaptureDurationMs,
      averageCaptureDurationMs: this.averageCaptureDurationMs,
      effectiveFrameIntervalMs: this.effectiveFrameIntervalMs,
      successfulCaptures: this.successfulCaptures,
      failedCaptures: this.failedCaptures,
      capturesAttempted: this.attemptedCaptures,
      capturesSucceeded: this.successfulCaptures,
      capturesFailed: this.failedCaptures,
      lastSuccessfulCaptureTime: this.lastSuccessfulCaptureTimestampMs,
      consecutiveFailureCount: this.consecutiveFailureCount,
      startupValidated: this.startupValidated,
      gstLaunchPath: this.gstLaunchPath,
      captureHealthState: this.captureHealthState,
      captureRetryCount: this.options.captureRetryCount,
      captureRetryDelayMs: this.options.captureRetryDelayMs,
      recentRetryAttempts: this.recentRetryAttempts,
      currentRetryAttempt: this.currentRetryAttempt,
      transientFailureCount: this.transientFailureCount,
      recoveryCount: this.recoveryCount,
      lastRecoveryTime: this.lastRecoveryTime,
      lastTerminalFailureTime: this.lastTerminalFailureTime,
      recentCaptureEvents: this.recentCaptureEvents,
      telemetryUpdatedAtMs:
        overrides.telemetryUpdatedAtMs !== undefined
          ? overrides.telemetryUpdatedAtMs
          : this.telemetryUpdatedAtMs,
    };
  }

  updateStatus(overrides = {}) {
    this.telemetryUpdatedAtMs =
      overrides.telemetryUpdatedAtMs !== undefined
        ? overrides.telemetryUpdatedAtMs
        : this.nowFn();
    this.status = this.createStatus(overrides);
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.startupValidated = false;
    this.captureHealthState = "idle";
    this.currentRetryAttempt = 0;
    this.updateStatus({
      state: "starting",
      detailText: `Starting GStreamer stereo capture for ${this.leftDevicePath} and ${this.rightDevicePath}.`,
      lastError: null,
    });

    try {
      assertLinuxHost(this.platform);
      this.gstLaunchPath = await this.resolveCommandPathFn({
        command: GST_LAUNCH_COMMAND,
        platform: this.platform,
        runProcessFn: this.runProcessFn,
        timeoutMs: GST_PROBE_TIMEOUT_MS,
      });
      if (!this.gstLaunchPath) {
        throw new Error(
          "GStreamer launch command gst-launch-1.0 was not found on PATH.",
        );
      }

      await probeGStreamerLaunch({
        commandPath: this.gstLaunchPath,
        runProcessFn: this.runProcessFn,
      });
      await Promise.all([
        assertDeviceAccessible({
          eyeLabel: "left",
          devicePath: this.leftDevicePath,
          accessFn: this.accessFn,
        }),
        assertDeviceAccessible({
          eyeLabel: "right",
          devicePath: this.rightDevicePath,
          accessFn: this.accessFn,
        }),
      ]);

      for (
        let warmupIndex = 0;
        warmupIndex < this.options.captureWarmupFrames;
        warmupIndex += 1
      ) {
        await this.captureStereoPairInternal({
          phase: "warmup",
          warmupIndex: warmupIndex + 1,
        });
      }

      this.startupValidated = true;
      this.isRunning = true;
      this.captureHealthState =
        this.recentRetryAttempts > 0 ? "recovered" : "healthy";
      this.updateStatus({
        state: "running",
        detailText: createRunningDetailText(this),
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.isRunning = false;
      this.startupValidated = false;
      this.captureHealthState = "terminal_failure";
      this.lastTerminalFailureTime = this.nowFn();
      this.updateStatus({
        state: "error",
        detailText: message,
        lastError: message,
      });
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    this.captureQueue = Promise.resolve();
    this.captureHealthState = "idle";
    this.currentRetryAttempt = 0;
    this.updateStatus({
      state: "stopped",
      detailText: "GStreamer stereo capture backend stopped.",
    });
  }

  getStatus() {
    return this.status;
  }

  recordCaptureEvent(event) {
    this.recentCaptureEvents = appendRecentCaptureEvent(
      this.recentCaptureEvents,
      event,
    );
  }

  async captureStereoPair() {
    if (!this.isRunning || this.status.state !== "running") {
      throw new Error(
        this.status.lastError ??
          "GStreamer stereo capture backend is not running.",
      );
    }

    const capturePromise = this.captureQueue.then(() => {
      return this.captureStereoPairInternal({
        phase: "capture",
      });
    });

    this.captureQueue = capturePromise.catch(() => {});
    return capturePromise;
  }

  async captureStereoPairInternal(options) {
    const captureStartedAt = this.nowFn();
    this.attemptedCaptures += 1;
    const logicalCaptureIndex = this.attemptedCaptures;
    this.currentRetryAttempt = 0;
    let retryAttemptsUsed = 0;
    let lastFailureEyeLabel;
    let injectedFailuresRemaining =
      options.phase === "capture" &&
      shouldTriggerCaptureFaultInjection(this.options, logicalCaptureIndex)
        ? resolveCaptureFaultFailureCount(
            this.options,
            this.options.captureRetryCount,
          )
        : 0;

    while (true) {
      try {
        if (injectedFailuresRemaining > 0) {
          injectedFailuresRemaining -= 1;
          throw createFaultInjectedCaptureError({
            mode: this.options.faultInjectMode,
            eyeLabel: resolveFaultInjectionEyeLabel(logicalCaptureIndex),
            captureIndex: logicalCaptureIndex,
            retryAttempt: retryAttemptsUsed + 1,
          });
        }

        const [leftImage, rightImage] = await Promise.all([
          captureJpegSnapshot({
            eyeLabel: "left",
            commandPath: this.gstLaunchPath ?? GST_LAUNCH_COMMAND,
            devicePath: this.leftDevicePath,
            width: this.options.captureWidth,
            height: this.options.captureHeight,
            jpegQuality: this.options.captureJpegQuality,
            timeoutMs: this.options.captureTimeoutMs,
            runProcessFn: this.runProcessFn,
          }),
          captureJpegSnapshot({
            eyeLabel: "right",
            commandPath: this.gstLaunchPath ?? GST_LAUNCH_COMMAND,
            devicePath: this.rightDevicePath,
            width: this.options.captureWidth,
            height: this.options.captureHeight,
            jpegQuality: this.options.captureJpegQuality,
            timeoutMs: this.options.captureTimeoutMs,
            runProcessFn: this.runProcessFn,
          }),
        ]);

        const timestampMs = this.nowFn();
        const captureDurationMs = Math.max(0, timestampMs - captureStartedAt);
        const previousSuccessfulCaptureTimestampMs =
          this.lastSuccessfulCaptureTimestampMs;
        const recoveredAfterRetry = retryAttemptsUsed > 0;
        this.successfulCaptures += 1;
        this.lastCaptureTimestampMs = timestampMs;
        this.lastSuccessfulCaptureTimestampMs = timestampMs;
        this.lastCaptureDurationMs = captureDurationMs;
        this.totalSuccessfulCaptureDurationMs += captureDurationMs;
        this.averageCaptureDurationMs =
          this.totalSuccessfulCaptureDurationMs / this.successfulCaptures;
        this.effectiveFrameIntervalMs =
          previousSuccessfulCaptureTimestampMs === null
            ? null
            : Math.max(0, timestampMs - previousSuccessfulCaptureTimestampMs);
        this.consecutiveFailureCount = 0;
        this.currentRetryAttempt = 0;
        this.recentRetryAttempts = retryAttemptsUsed;
        if (recoveredAfterRetry) {
          this.captureHealthState = "recovered";
          this.recoveryCount += 1;
          this.lastRecoveryTime = timestampMs;
          this.recordCaptureEvent({
            timestampMs,
            eventType: "recovered",
            retryAttempt: retryAttemptsUsed,
            eye: lastFailureEyeLabel,
            summary: `Recovered after ${retryAttemptsUsed} retr${
              retryAttemptsUsed === 1 ? "y" : "ies"
            }.`,
          });
        } else {
          this.captureHealthState = "healthy";
        }
        this.lastError = null;
        this.updateStatus({
          state: "running",
          detailText: createCaptureDetailText({
            phase: options.phase,
            warmupIndex: options.warmupIndex,
            warmupFrames: this.options.captureWarmupFrames,
            leftDevicePath: this.leftDevicePath,
            rightDevicePath: this.rightDevicePath,
            captureDurationMs,
            timestampMs,
            retryAttemptsUsed,
          }),
          lastCaptureTimestampMs: timestampMs,
          lastError: null,
        });

        return {
          timestampMs,
          timestamp: timestampMs,
          leftImage,
          rightImage,
          left: createImageFrameFromBuffer({
            bytes: leftImage,
            mimeType: "image/jpeg",
            width: this.options.captureWidth,
            height: this.options.captureHeight,
            sourceLabel: `gstreamer-left-${sanitizeDeviceLabel(this.leftDevicePath)}.jpg`,
            title: "GStreamer Camera Snapshot",
            backgroundHex: "#0f385d",
            accentHex: "#9ee6ff",
            metadata: {
              captureBackend: "gstreamer",
              cameraId: String(this.options.leftCameraId),
              devicePath: this.leftDevicePath,
              captureMethod: "snapshot",
              jpegQuality: this.options.captureJpegQuality,
            },
          }),
          right: createImageFrameFromBuffer({
            bytes: rightImage,
            mimeType: "image/jpeg",
            width: this.options.captureWidth,
            height: this.options.captureHeight,
            sourceLabel: `gstreamer-right-${sanitizeDeviceLabel(this.rightDevicePath)}.jpg`,
            title: "GStreamer Camera Snapshot",
            backgroundHex: "#46185d",
            accentHex: "#f0c8ff",
            metadata: {
              captureBackend: "gstreamer",
              cameraId: String(this.options.rightCameraId),
              devicePath: this.rightDevicePath,
              captureMethod: "snapshot",
              jpegQuality: this.options.captureJpegQuality,
            },
          }),
          overlayLabel: `Camera Snapshot ${new Date(timestampMs).toISOString()}`,
          tags: ["gstreamer", "jpeg", "snapshot"],
          extras: {
            captureBackend: "gstreamer",
            leftDevicePath: this.leftDevicePath,
            rightDevicePath: this.rightDevicePath,
            captureTimeoutMs: this.options.captureTimeoutMs,
            captureJpegQuality: this.options.captureJpegQuality,
            captureDurationMs,
            captureHealthState: this.captureHealthState,
            captureRetryCount: this.options.captureRetryCount,
            captureRetryDelayMs: this.options.captureRetryDelayMs,
            recentRetryAttempts: this.recentRetryAttempts,
            currentRetryAttempt: this.currentRetryAttempt,
            transientFailureCount: this.transientFailureCount,
            recoveryCount: this.recoveryCount,
            lastRecoveryTime: this.lastRecoveryTime,
            lastTerminalFailureTime: this.lastTerminalFailureTime,
            recentCaptureEvents: this.recentCaptureEvents,
            telemetryUpdatedAtMs: this.telemetryUpdatedAtMs,
          },
        };
      } catch (error) {
        const captureFinishedAt = this.nowFn();
        const captureDurationMs = Math.max(0, captureFinishedAt - captureStartedAt);
        const message = error instanceof Error ? error.message : String(error);
        const failureEyeLabel = readCaptureEyeLabel(error) ?? lastFailureEyeLabel;
        lastFailureEyeLabel = failureEyeLabel;
        this.lastCaptureDurationMs = captureDurationMs;
        this.consecutiveFailureCount += 1;
        this.lastError = message;

        if (retryAttemptsUsed < this.options.captureRetryCount) {
          retryAttemptsUsed += 1;
          this.currentRetryAttempt = retryAttemptsUsed;
          this.recentRetryAttempts = retryAttemptsUsed;
          this.transientFailureCount += 1;
          this.captureHealthState = "retrying";
          this.recordCaptureEvent({
            timestampMs: captureFinishedAt,
            eventType: "retrying",
            retryAttempt: retryAttemptsUsed,
            eye: failureEyeLabel,
            summary: summarizeCaptureIssue(message),
          });
          this.updateStatus({
            state: "running",
            detailText: createRetryingCaptureDetailText({
              retryAttempt: retryAttemptsUsed,
              retryBudget: this.options.captureRetryCount,
              retryDelayMs: this.options.captureRetryDelayMs,
              leftDevicePath: this.leftDevicePath,
              rightDevicePath: this.rightDevicePath,
              message,
            }),
            lastError: message,
          });
          if (this.options.captureRetryDelayMs > 0) {
            await delayMs(this.options.captureRetryDelayMs);
          }
          continue;
        }

        this.failedCaptures += 1;
        this.currentRetryAttempt = 0;
        this.recentRetryAttempts = retryAttemptsUsed;
        this.captureHealthState = "terminal_failure";
        this.lastTerminalFailureTime = captureFinishedAt;
        this.recordCaptureEvent({
          timestampMs: captureFinishedAt,
          eventType: "terminal_failure",
          retryAttempt: retryAttemptsUsed,
          eye: failureEyeLabel,
          summary: summarizeCaptureIssue(message),
        });
        this.updateStatus({
          state: "error",
          detailText: createTerminalCaptureFailureDetailText({
            retryBudget: this.options.captureRetryCount,
            retryAttemptsUsed,
            leftDevicePath: this.leftDevicePath,
            rightDevicePath: this.rightDevicePath,
            message,
          }),
          lastError: message,
        });
        throw error;
      }
    }
  }
}

export async function runGStreamerStereoCapturePreflight(config, overrides = {}) {
  const options = normalizeCaptureOptions(config);
  const platform = overrides.platform ?? process.platform;
  const accessFn = overrides.accessFn ?? access;
  const runProcessFn = overrides.runProcessFn ?? runProcess;
  const resolveCommandPathFn =
    overrides.resolveCommandPathFn ?? resolveCommandPath;
  const leftDevicePath = resolveVideoDevicePath(
    options.leftCameraDevice,
    options.leftCameraId,
  );
  const rightDevicePath = resolveVideoDevicePath(
    options.rightCameraDevice,
    options.rightCameraId,
  );
  const results = [];

  if (platform === "linux") {
    results.push(createPreflightResult("pass", "platform", `Linux host detected (${platform}).`));
  } else {
    results.push(
      createPreflightResult(
        "fail",
        "platform",
        `Unsupported host platform: ${platform}. GStreamer camera validation requires Linux/Jetson.`,
      ),
    );
    return createPreflightSummary(results);
  }

  const gstLaunchPath = await resolveCommandPathFn({
    command: GST_LAUNCH_COMMAND,
    platform,
    runProcessFn,
    timeoutMs: GST_PROBE_TIMEOUT_MS,
  });
  if (!gstLaunchPath) {
    results.push(
      createPreflightResult(
        "fail",
        "gst-launch",
        "gst-launch-1.0 was not found on PATH.",
      ),
    );
    return createPreflightSummary(results, {
      leftDevicePath,
      rightDevicePath,
      gstLaunchPath: null,
    });
  }
  results.push(
    createPreflightResult(
      "pass",
      "gst-launch",
      `Resolved gst-launch-1.0 at ${gstLaunchPath}.`,
    ),
  );

  try {
    await probeGStreamerLaunch({
      commandPath: gstLaunchPath,
      runProcessFn,
    });
    results.push(
      createPreflightResult(
        "pass",
        "gst-launch-version",
        "gst-launch-1.0 responded to --version.",
      ),
    );
  } catch (error) {
    results.push(
      createPreflightResult(
        "fail",
        "gst-launch-version",
        error instanceof Error ? error.message : String(error),
      ),
    );
    return createPreflightSummary(results, {
      leftDevicePath,
      rightDevicePath,
      gstLaunchPath,
    });
  }

  const gstInspectPath = await resolveCommandPathFn({
    command: "gst-inspect-1.0",
    platform,
    runProcessFn,
    timeoutMs: GST_PROBE_TIMEOUT_MS,
  });
  if (!gstInspectPath) {
    results.push(
      createPreflightResult(
        "fail",
        "gst-inspect",
        "gst-inspect-1.0 was not found on PATH, so element checks could not run.",
      ),
    );
    return createPreflightSummary(results, {
      leftDevicePath,
      rightDevicePath,
      gstLaunchPath,
      gstInspectPath: null,
    });
  }
  results.push(
    createPreflightResult(
      "pass",
      "gst-inspect",
      `Resolved gst-inspect-1.0 at ${gstInspectPath}.`,
    ),
  );

  await runElementPreflightChecks({
    gstInspectPath,
    runProcessFn,
    results,
  });

  for (const deviceCheck of [
    { eyeLabel: "left", devicePath: leftDevicePath },
    { eyeLabel: "right", devicePath: rightDevicePath },
  ]) {
    try {
      await assertDeviceAccessible({
        eyeLabel: deviceCheck.eyeLabel,
        devicePath: deviceCheck.devicePath,
        accessFn,
      });
      results.push(
        createPreflightResult(
          "pass",
          `${deviceCheck.eyeLabel}-device`,
          `${capitalize(deviceCheck.eyeLabel)} camera device is accessible at ${deviceCheck.devicePath}.`,
        ),
      );
    } catch (error) {
      results.push(
        createPreflightResult(
          "fail",
          `${deviceCheck.eyeLabel}-device`,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  if (results.some((result) => result.status === "fail")) {
    return createPreflightSummary(results, {
      leftDevicePath,
      rightDevicePath,
      gstLaunchPath,
      gstInspectPath,
    });
  }

  const sampleCaptures = {};
  for (const captureOptions of [
    { eyeLabel: "left", devicePath: leftDevicePath },
    { eyeLabel: "right", devicePath: rightDevicePath },
  ]) {
    const startedAt = Date.now();
    try {
      const jpegBytes = await captureJpegSnapshot({
        eyeLabel: captureOptions.eyeLabel,
        commandPath: gstLaunchPath,
        devicePath: captureOptions.devicePath,
        width: options.captureWidth,
        height: options.captureHeight,
        jpegQuality: options.captureJpegQuality,
        timeoutMs: options.captureTimeoutMs,
        runProcessFn,
      });
      const durationMs = Date.now() - startedAt;
      sampleCaptures[captureOptions.eyeLabel] = {
        byteLength: jpegBytes.byteLength,
        durationMs,
      };
      results.push(
        createPreflightResult(
          "pass",
          `${captureOptions.eyeLabel}-capture`,
          `${capitalize(captureOptions.eyeLabel)} one-shot capture succeeded: ${jpegBytes.byteLength} bytes in ${durationMs}ms.`,
        ),
      );
    } catch (error) {
      results.push(
        createPreflightResult(
          "fail",
          `${captureOptions.eyeLabel}-capture`,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  return createPreflightSummary(results, {
    leftDevicePath,
    rightDevicePath,
    gstLaunchPath,
    gstInspectPath,
    sampleCaptures,
  });
}

async function assertDeviceAccessible(options) {
  try {
    await options.accessFn(options.devicePath);
  } catch (error) {
    throw new Error(
      `${capitalize(options.eyeLabel)} camera device ${options.devicePath} is not accessible: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function probeGStreamerLaunch(options) {
  try {
    await options.runProcessFn({
      command: options.commandPath,
      args: ["--version"],
      timeoutMs: GST_PROBE_TIMEOUT_MS,
      expectStdout: false,
    });
  } catch (error) {
    throw wrapGStreamerProbeError(error, options.commandPath);
  }
}

async function runElementPreflightChecks(options) {
  const mandatoryElements = ["v4l2src", "jpegenc"];
  for (const elementName of mandatoryElements) {
    try {
      await probeGStreamerElement({
        commandPath: options.gstInspectPath,
        elementName,
        runProcessFn: options.runProcessFn,
      });
      options.results.push(
        createPreflightResult(
          "pass",
          `gst-element:${elementName}`,
          `GStreamer element ${elementName} is available.`,
        ),
      );
    } catch (error) {
      options.results.push(
        createPreflightResult(
          "fail",
          `gst-element:${elementName}`,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  const sinkChecks = [];
  for (const elementName of ["fdsink", "filesink"]) {
    try {
      await probeGStreamerElement({
        commandPath: options.gstInspectPath,
        elementName,
        runProcessFn: options.runProcessFn,
      });
      sinkChecks.push({ elementName, ok: true });
    } catch (error) {
      sinkChecks.push({
        elementName,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (sinkChecks.some((check) => check.ok)) {
    const availableSinks = sinkChecks
      .filter((check) => check.ok)
      .map((check) => check.elementName)
      .join(", ");
    options.results.push(
      createPreflightResult(
        "pass",
        "gst-element:sink",
        `At least one supported sink element is available: ${availableSinks}.`,
      ),
    );
  } else {
    const failureDetails = sinkChecks
      .map((check) => {
        return `${check.elementName}: ${check.message ?? "missing"}`;
      })
      .join(" | ");
    options.results.push(
      createPreflightResult(
        "fail",
        "gst-element:sink",
        `Neither fdsink nor filesink is available. ${failureDetails}`,
      ),
    );
  }
}

async function probeGStreamerElement(options) {
  try {
    await options.runProcessFn({
      command: options.commandPath,
      args: [options.elementName],
      timeoutMs: GST_PROBE_TIMEOUT_MS,
    });
  } catch (error) {
    throw wrapGStreamerElementError(error, options.elementName);
  }
}

async function resolveGStreamerLaunchPath(options) {
  return resolveCommandPath(options);
}

async function resolveCommandPath(options) {
  if (options.platform !== "linux") {
    return null;
  }

  try {
    const probeResult = await options.runProcessFn({
      command: "sh",
      args: ["-lc", `command -v ${options.command}`],
      timeoutMs: options.timeoutMs ?? GST_PROBE_TIMEOUT_MS,
    });
    const resolvedPath = probeResult.stdout.toString("utf8").trim().split(/\r?\n/)[0];
    return resolvedPath && resolvedPath.length > 0 ? resolvedPath : null;
  } catch {
    return null;
  }
}

function createPreflightSummary(results, extras = {}) {
  const failedCount = results.filter((result) => result.status === "fail").length;
  const warningCount = results.filter((result) => result.status === "warn").length;
  const passedCount = results.filter((result) => result.status === "pass").length;

  return {
    ok: failedCount === 0,
    failedCount,
    warningCount,
    passedCount,
    results,
    ...extras,
  };
}

function createPreflightResult(status, key, message, details = {}) {
  return {
    status,
    key,
    message,
    ...details,
  };
}

async function captureJpegSnapshot(options) {
  try {
    const primaryResult = await options.runProcessFn({
      command: options.commandPath,
      args: buildGStreamerPipelineArgs({
        devicePath: options.devicePath,
        width: options.width,
        height: options.height,
        jpegQuality: options.jpegQuality,
        sinkMode: "fdsink",
      }),
      timeoutMs: options.timeoutMs,
    }).catch(async (error) => {
      if (!isFdsinkUnavailable(error)) {
        throw error;
      }

      return options.runProcessFn({
        command: options.commandPath,
        args: buildGStreamerPipelineArgs({
          devicePath: options.devicePath,
          width: options.width,
          height: options.height,
          jpegQuality: options.jpegQuality,
          sinkMode: "stdout-file",
        }),
        timeoutMs: options.timeoutMs,
      });
    });

    assertJpegBuffer(primaryResult.stdout, options.devicePath, options.eyeLabel);
    return primaryResult.stdout;
  } catch (error) {
    throw wrapEyeCaptureError(error, {
      eyeLabel: options.eyeLabel,
      devicePath: options.devicePath,
      timeoutMs: options.timeoutMs,
    });
  }
}

function buildGStreamerPipelineArgs(options) {
  const sinkArgs =
    options.sinkMode === "stdout-file"
      ? ["filesink", "location=/dev/stdout"]
      : ["fdsink", "fd=1"];

  return [
    "-q",
    "v4l2src",
    `device=${options.devicePath}`,
    "num-buffers=1",
    "!",
    `video/x-raw,width=${options.width},height=${options.height}`,
    "!",
    "jpegenc",
    `quality=${options.jpegQuality}`,
    "!",
    ...sinkArgs,
  ];
}

function normalizeCaptureOptions(options) {
  return {
    ...options,
    captureTimeoutMs: normalizePositiveInteger(
      options.captureTimeoutMs,
      DEFAULT_CAPTURE_TIMEOUT_MS,
    ),
    captureJpegQuality: normalizeRangedInteger(
      options.captureJpegQuality,
      DEFAULT_CAPTURE_JPEG_QUALITY,
      1,
      100,
    ),
    captureWarmupFrames: normalizeNonNegativeInteger(
      options.captureWarmupFrames,
      DEFAULT_CAPTURE_WARMUP_FRAMES,
    ),
    captureRetryCount: normalizeNonNegativeInteger(
      options.captureRetryCount,
      DEFAULT_CAPTURE_RETRY_COUNT,
    ),
    captureRetryDelayMs: normalizeNonNegativeInteger(
      options.captureRetryDelayMs,
      DEFAULT_CAPTURE_RETRY_DELAY_MS,
    ),
    faultInjectEveryNCaptures: normalizeNonNegativeInteger(
      options.faultInjectEveryNCaptures,
      0,
    ),
    faultInjectFailureCount: normalizeNonNegativeInteger(
      options.faultInjectFailureCount,
      1,
    ),
    faultInjectMode:
      options.faultInjectMode === "terminal" ||
      options.faultInjectMode === "timeout"
        ? options.faultInjectMode
        : "transient",
    faultInjectStartAfterCaptures: normalizeNonNegativeInteger(
      options.faultInjectStartAfterCaptures,
      0,
    ),
  };
}

function resolveVideoDevicePath(devicePath, cameraId) {
  if (typeof devicePath === "string" && devicePath.length > 0) {
    return devicePath;
  }

  const normalizedId = String(cameraId);
  if (normalizedId.startsWith("/")) {
    return normalizedId;
  }

  return `/dev/video${normalizedId}`;
}

function sanitizeDeviceLabel(devicePath) {
  return devicePath.replace(/\//g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

function assertLinuxHost(platform) {
  if (platform !== "linux") {
    throw new Error(
      "GStreamer stereo capture backend requires a Linux host with /dev/video devices.",
    );
  }
}

function assertJpegBuffer(buffer, devicePath, eyeLabel) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 4) {
    throw createTaggedError(
      `${capitalize(eyeLabel)} camera capture produced no JPEG buffer for ${devicePath}.`,
      {
        captureErrorKind: "empty_output",
      },
    );
  }

  const startsWithSoi = buffer[0] === 0xff && buffer[1] === 0xd8;
  const endsWithEoi =
    buffer[buffer.byteLength - 2] === 0xff &&
    buffer[buffer.byteLength - 1] === 0xd9;
  if (!startsWithSoi || !endsWithEoi) {
    throw createTaggedError(
      `${capitalize(eyeLabel)} camera capture produced invalid JPEG data for ${devicePath}.`,
      {
        captureErrorKind: "invalid_jpeg",
      },
    );
  }
}

function wrapGStreamerProbeError(error, commandPath) {
  if (error instanceof Error && error.captureErrorKind === "probe_error") {
    return error;
  }

  const stderrText =
    typeof error?.stderrText === "string" ? error.stderrText.trim() : "";
  let message = `Failed to validate GStreamer launch command at ${commandPath}.`;
  if (error instanceof Error && error.message.length > 0) {
    message += ` ${error.message}`;
  }
  if (stderrText.length > 0 && !message.includes(stderrText)) {
    message += ` stderr: ${stderrText}`;
  }

  return createTaggedError(message, {
    captureErrorKind: "probe_error",
    stderrText,
  });
}

function wrapGStreamerElementError(error, elementName) {
  const stderrText =
    typeof error?.stderrText === "string" ? error.stderrText.trim() : "";
  let message = `Failed to validate GStreamer element ${elementName}.`;
  if (error instanceof Error && error.message.length > 0) {
    message += ` ${error.message}`;
  }
  if (stderrText.length > 0 && !message.includes(stderrText)) {
    message += ` stderr: ${stderrText}`;
  }

  return createTaggedError(message, {
    captureErrorKind: "element_error",
    stderrText,
  });
}

function wrapEyeCaptureError(error, options) {
  if (error instanceof Error && error.isWrappedEyeCaptureError) {
    return error;
  }

  const reasonKind =
    error?.captureErrorKind ?? error?.processErrorKind ?? "process_failure";
  const stderrText =
    typeof error?.stderrText === "string" ? error.stderrText.trim() : "";
  let message = `${capitalize(options.eyeLabel)} camera capture failed for ${options.devicePath} (${describeErrorKind(
    reasonKind,
  )}).`;
  if (error instanceof Error && error.message.length > 0) {
    message += ` ${error.message}`;
  }
  if (stderrText.length > 0 && !message.includes(stderrText)) {
    message += ` stderr: ${stderrText}`;
  }

  return createTaggedError(message, {
    captureErrorKind: reasonKind,
    stderrText,
    isWrappedEyeCaptureError: true,
    captureEyeLabel: options.eyeLabel,
  });
}

function readCaptureEyeLabel(error) {
  return error?.captureEyeLabel === "left" || error?.captureEyeLabel === "right"
    ? error.captureEyeLabel
    : undefined;
}

function isFdsinkUnavailable(error) {
  const haystack = `${error?.message ?? ""}\n${error?.stderrText ?? ""}`.toLowerCase();
  return haystack.includes("fdsink");
}

function createCaptureDetailText(options) {
  if (options.phase === "warmup") {
    if (options.retryAttemptsUsed > 0) {
      return `Recovered after ${options.retryAttemptsUsed} retr${
        options.retryAttemptsUsed === 1 ? "y" : "ies"
      } and validated warm-up capture ${options.warmupIndex}/${options.warmupFrames} from ${options.leftDevicePath} and ${options.rightDevicePath} in ${options.captureDurationMs}ms.`;
    }

    return `Validated warm-up capture ${options.warmupIndex}/${options.warmupFrames} from ${options.leftDevicePath} and ${options.rightDevicePath} in ${options.captureDurationMs}ms.`;
  }

  if (options.retryAttemptsUsed > 0) {
    return `Recovered after ${options.retryAttemptsUsed} retr${
      options.retryAttemptsUsed === 1 ? "y" : "ies"
    } and captured stereo snapshot from ${options.leftDevicePath} and ${options.rightDevicePath} in ${options.captureDurationMs}ms at ${new Date(
      options.timestampMs,
    ).toISOString()}.`;
  }

  return `Captured stereo snapshot from ${options.leftDevicePath} and ${options.rightDevicePath} in ${options.captureDurationMs}ms at ${new Date(
    options.timestampMs,
  ).toISOString()}.`;
}

function createRetryingCaptureDetailText(options) {
  return `Transient capture failure from ${options.leftDevicePath} and ${options.rightDevicePath}; retry ${options.retryAttempt}/${options.retryBudget} in ${options.retryDelayMs}ms. ${options.message}`;
}

function createTerminalCaptureFailureDetailText(options) {
  return `Capture failed for ${options.leftDevicePath} and ${options.rightDevicePath} after ${options.retryAttemptsUsed}/${options.retryBudget} retr${
    options.retryBudget === 1 ? "y" : "ies"
  }. ${options.message}`;
}

function createRunningDetailText(backend) {
  if (backend.options.captureWarmupFrames > 0) {
    return `Validated GStreamer startup with ${backend.options.captureWarmupFrames} warm-up capture(s). Ready to capture JPEG stereo pairs from ${backend.leftDevicePath} and ${backend.rightDevicePath}.`;
  }

  return `Preflight validation completed. Ready to capture JPEG stereo pairs from ${backend.leftDevicePath} and ${backend.rightDevicePath}.`;
}

function describeErrorKind(kind) {
  switch (kind) {
    case "timeout":
      return "timeout";
    case "spawn_error":
      return "spawn failure";
    case "invalid_jpeg":
      return "invalid JPEG";
    case "empty_output":
      return "empty output";
    case "probe_error":
      return "probe failure";
    default:
      return "process failure";
  }
}

function normalizePositiveInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.round(parsed);
}

function normalizeNonNegativeInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackValue;
  }

  return Math.round(parsed);
}

function normalizeRangedInteger(value, fallbackValue, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createTaggedError(message, details = {}) {
  return Object.assign(new Error(message), details);
}

function delayMs(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function runProcess(options) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      const stderrText = Buffer.concat(stderrChunks).toString("utf8").trim();
      settled = true;
      child.kill("SIGKILL");
      reject(
        createTaggedError(
          `${options.command} timed out after ${options.timeoutMs}ms.`,
          {
            processErrorKind: "timeout",
            stderrText,
          },
        ),
      );
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      const stderrText = Buffer.concat(stderrChunks).toString("utf8").trim();
      settled = true;
      clearTimeout(timeout);
      reject(
        createTaggedError(error.message, {
          processErrorKind: "spawn_error",
          stderrText,
        }),
      );
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks);
      const stderrText = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (exitCode !== 0) {
        reject(
          createTaggedError(
            stderrText.length > 0
              ? stderrText
              : `${options.command} exited with code ${String(exitCode)}.`,
            {
              processErrorKind: "process_failure",
              stderrText,
              exitCode,
            },
          ),
        );
        return;
      }

      if (options.expectStdout !== false && stdout.byteLength === 0) {
        reject(
          createTaggedError(
            stderrText.length > 0
              ? stderrText
              : `${options.command} produced no output.`,
            {
              processErrorKind: "empty_output",
              stderrText,
            },
          ),
        );
        return;
      }

      resolve({
        stdout,
        stderrText,
      });
    });
  });
}
