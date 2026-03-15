import { createSvgImageFrame } from "../frame_provider_support.mjs";
import {
  appendRecentCaptureEvent,
  createFaultInjectedCaptureError,
  resolveCaptureFaultFailureCount,
  resolveFaultInjectionEyeLabel,
  shouldTriggerCaptureFaultInjection,
  summarizeCaptureIssue,
} from "../fault_injection.mjs";
import { createCaptureBackendStatus } from "./capture_backend_contract.mjs";

const DEFAULT_CAPTURE_WIDTH = 1280;
const DEFAULT_CAPTURE_HEIGHT = 720;
const DEFAULT_CAPTURE_TIMEOUT_MS = 3000;
const DEFAULT_CAPTURE_JPEG_QUALITY = 85;
const DEFAULT_CAPTURE_WARMUP_FRAMES = 1;
const DEFAULT_CAPTURE_RETRY_COUNT = 2;
const DEFAULT_CAPTURE_RETRY_DELAY_MS = 500;
const SIMULATED_GST_LAUNCH_PATH = "n/a (simulated)";

export class SimulatedStereoCaptureBackend {
  constructor(options) {
    this.options = normalizeCaptureOptions(options);
    this.nowFn = options.nowFn ?? Date.now;
    this.leftDevicePath = resolveSimulatedDeviceLabel(
      this.options.leftCameraDevice,
      this.options.leftCameraId,
      "left",
    );
    this.rightDevicePath = resolveSimulatedDeviceLabel(
      this.options.rightCameraDevice,
      this.options.rightCameraId,
      "right",
    );
    this.captureQueue = Promise.resolve();
    this.isRunning = false;
    this.startupValidated = false;
    this.captureHealthState = "idle";
    this.gstLaunchPath = SIMULATED_GST_LAUNCH_PATH;
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
      detailText: `Waiting to start simulated stereo capture for ${this.leftDevicePath} and ${this.rightDevicePath}.`,
    });
  }

  createStatus(overrides = {}) {
    const normalizedStatus = createCaptureBackendStatus({
      backendType: "simulated",
      backendDisplayName: "Simulated Stereo Capture Backend",
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
      backend: "simulated",
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
      detailText: `Starting simulated stereo capture for ${this.leftDevicePath} and ${this.rightDevicePath}.`,
      lastError: null,
    });

    try {
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
      detailText: "Simulated stereo capture backend stopped.",
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
          "Simulated stereo capture backend is not running.",
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

        const timestampMs = this.nowFn();
        const captureDurationMs = resolveSimulatedCaptureDurationMs(
          logicalCaptureIndex,
          retryAttemptsUsed,
        );
        const snapshotIndex = this.successfulCaptures + 1;
        const leftFrame = createSimulatedEyeFrame({
          eye: "left",
          captureIndex: logicalCaptureIndex,
          snapshotIndex,
          timestampMs,
          captureDurationMs,
          width: this.options.captureWidth,
          height: this.options.captureHeight,
          deviceLabel: this.leftDevicePath,
        });
        const rightFrame = createSimulatedEyeFrame({
          eye: "right",
          captureIndex: logicalCaptureIndex,
          snapshotIndex,
          timestampMs,
          captureDurationMs,
          width: this.options.captureWidth,
          height: this.options.captureHeight,
          deviceLabel: this.rightDevicePath,
        });

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
          leftImage: leftFrame.bytes,
          rightImage: rightFrame.bytes,
          left: leftFrame,
          right: rightFrame,
          overlayLabel: `Simulated Camera Snapshot ${new Date(timestampMs).toISOString()}`,
          tags: ["simulated", "camera", "snapshot"],
          extras: {
            captureBackend: "simulated",
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
            simulatedBackend: true,
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

function createSimulatedEyeFrame(options) {
  const backgroundHex = options.eye === "left" ? "#10293d" : "#24173d";
  const accentHex = options.eye === "left" ? "#8fe5ff" : "#f1c5ff";
  const svgText = buildSimulatedSnapshotSvg({
    ...options,
    backgroundHex,
    accentHex,
  });

  return createSvgImageFrame(svgText, {
    width: options.width,
    height: options.height,
    sourceLabel: `simulated-${options.eye}-capture-${String(options.snapshotIndex).padStart(4, "0")}.svg`,
    title: "Simulated Camera Snapshot",
    markerText: `${options.eye.toUpperCase()} CAM ${String(options.snapshotIndex).padStart(4, "0")}`,
    backgroundHex,
    accentHex,
    metadata: {
      captureBackend: "simulated",
      devicePath: options.deviceLabel,
      captureMethod: "simulated_snapshot",
      captureDurationMs: options.captureDurationMs,
      eye: options.eye,
      simulated: true,
    },
  });
}

function buildSimulatedSnapshotSvg(options) {
  const width = options.width;
  const height = options.height;
  const horizonY = Math.round(height * 0.62);
  const phase = options.captureIndex * 0.37;
  const parallaxOffset =
    options.eye === "left" ? -Math.round(width * 0.018) : Math.round(width * 0.018);
  const targetX = Math.round(
    width * 0.5 + Math.sin(phase) * width * 0.16 + parallaxOffset,
  );
  const targetY = Math.round(height * 0.42 + Math.cos(phase * 0.7) * height * 0.05);
  const guideX = Math.round(width * 0.5 + Math.cos(phase * 0.45) * width * 0.06);
  const guideY = Math.round(height * 0.54);
  const scanLineCount = 10;
  const scanLines = Array.from({ length: scanLineCount }, (_, index) => {
    const y = Math.round((height / scanLineCount) * index + (options.captureIndex % 3));
    const opacity = (0.025 + (index % 3) * 0.01).toFixed(3);
    return `<rect x="0" y="${y}" width="${width}" height="2" fill="#ffffff" opacity="${opacity}" />`;
  }).join("");
  const starField = Array.from({ length: 12 }, (_, index) => {
    const x = Math.round(
      width * (0.08 + ((index * 0.07 + options.captureIndex * 0.013) % 0.82)),
    );
    const y = Math.round(
      height * (0.08 + ((index * 0.05 + options.captureIndex * 0.009) % 0.38)),
    );
    const opacity = (0.28 + (index % 4) * 0.12).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${1 + (index % 2)}" fill="#ffffff" opacity="${opacity}" />`;
  }).join("");
  const deviceLabel = escapeXml(options.deviceLabel);
  const timestampText = escapeXml(new Date(options.timestampMs).toISOString());

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="sky-${options.eye}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${options.backgroundHex}" />
          <stop offset="100%" stop-color="#050910" />
        </linearGradient>
        <linearGradient id="ground-${options.eye}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#09131d" />
          <stop offset="50%" stop-color="#112335" />
          <stop offset="100%" stop-color="#0a1119" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#sky-${options.eye})" />
      <rect y="${horizonY}" width="${width}" height="${height - horizonY}" fill="url(#ground-${options.eye})" />
      <rect x="0" y="${Math.round(height * 0.1)}" width="${width}" height="1" fill="${options.accentHex}" opacity="0.18" />
      ${starField}
      ${scanLines}
      <path d="M 0 ${horizonY} C ${Math.round(width * 0.24)} ${Math.round(horizonY - height * 0.08)}, ${Math.round(width * 0.48)} ${Math.round(horizonY + height * 0.04)}, ${Math.round(width * 0.72)} ${Math.round(horizonY - height * 0.05)} S ${width} ${Math.round(horizonY + height * 0.03)}, ${width} ${horizonY}" fill="none" stroke="${options.accentHex}" stroke-opacity="0.25" stroke-width="4" />
      <rect x="${Math.round(width * 0.14)}" y="${Math.round(horizonY - height * 0.09)}" width="${Math.round(width * 0.1)}" height="${Math.round(height * 0.11)}" rx="10" fill="#101c28" stroke="${options.accentHex}" stroke-opacity="0.35" />
      <rect x="${Math.round(width * 0.7)}" y="${Math.round(horizonY - height * 0.13)}" width="${Math.round(width * 0.12)}" height="${Math.round(height * 0.16)}" rx="12" fill="#0e1823" stroke="${options.accentHex}" stroke-opacity="0.28" />
      <circle cx="${targetX}" cy="${targetY}" r="${Math.round(height * 0.045)}" fill="${options.accentHex}" fill-opacity="0.18" stroke="${options.accentHex}" stroke-width="4" />
      <circle cx="${targetX}" cy="${targetY}" r="${Math.round(height * 0.018)}" fill="${options.accentHex}" />
      <path d="M ${guideX} ${guideY} l ${Math.round(width * 0.08)} 0" stroke="${options.accentHex}" stroke-width="3" stroke-linecap="round" />
      <path d="M ${guideX} ${guideY} l 0 ${Math.round(height * 0.08)}" stroke="${options.accentHex}" stroke-width="3" stroke-linecap="round" />
      <rect x="${Math.round(width * 0.04)}" y="${Math.round(height * 0.05)}" width="${Math.round(width * 0.28)}" height="${Math.round(height * 0.16)}" rx="18" fill="#040810" fill-opacity="0.55" stroke="${options.accentHex}" stroke-opacity="0.24" />
      <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.1)}" fill="${options.accentHex}" font-size="${Math.max(18, Math.round(height * 0.03))}" font-family="Inter, Segoe UI, sans-serif" font-weight="700">SIM CAMERA ${options.eye.toUpperCase()}</text>
      <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.135)}" fill="#edf4ff" font-size="${Math.max(12, Math.round(height * 0.018))}" font-family="Inter, Segoe UI, sans-serif">snapshot ${String(options.snapshotIndex).padStart(4, "0")} • ${timestampText}</text>
      <text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.17)}" fill="#b6c7de" font-size="${Math.max(12, Math.round(height * 0.016))}" font-family="Inter, Segoe UI, sans-serif">${deviceLabel} • ${options.captureDurationMs} ms</text>
      <rect x="${Math.round(width * 0.04)}" y="${Math.round(height * 0.82)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.08)}" rx="14" fill="#040810" fill-opacity="0.48" stroke="#ffffff" stroke-opacity="0.12" />
      <text x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.87)}" fill="#edf4ff" font-size="${Math.max(14, Math.round(height * 0.022))}" font-family="Inter, Segoe UI, sans-serif">SIM SNAPSHOT</text>
    </svg>
  `.trim();
}

function resolveSimulatedCaptureDurationMs(captureIndex, retryAttemptsUsed) {
  return 32 + ((captureIndex * 11 + retryAttemptsUsed * 17) % 37);
}

function resolveSimulatedDeviceLabel(devicePath, cameraId, eyeLabel) {
  const requestedTarget =
    typeof devicePath === "string" && devicePath.length > 0
      ? devicePath
      : String(cameraId ?? eyeLabel);

  return `simulated://${eyeLabel}-camera/${sanitizeDeviceToken(requestedTarget)}`;
}

function sanitizeDeviceToken(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createCaptureDetailText(options) {
  if (options.phase === "warmup") {
    if (options.retryAttemptsUsed > 0) {
      return `Recovered after ${options.retryAttemptsUsed} retr${
        options.retryAttemptsUsed === 1 ? "y" : "ies"
      } and validated simulated warm-up capture ${options.warmupIndex}/${options.warmupFrames} from ${options.leftDevicePath} and ${options.rightDevicePath} in ${options.captureDurationMs}ms.`;
    }

    return `Validated simulated warm-up capture ${options.warmupIndex}/${options.warmupFrames} from ${options.leftDevicePath} and ${options.rightDevicePath} in ${options.captureDurationMs}ms.`;
  }

  if (options.retryAttemptsUsed > 0) {
    return `Recovered after ${options.retryAttemptsUsed} retr${
      options.retryAttemptsUsed === 1 ? "y" : "ies"
    } and captured simulated stereo snapshot from ${options.leftDevicePath} and ${options.rightDevicePath} in ${options.captureDurationMs}ms at ${new Date(
      options.timestampMs,
    ).toISOString()}.`;
  }

  return `Captured simulated stereo snapshot from ${options.leftDevicePath} and ${options.rightDevicePath} in ${options.captureDurationMs}ms at ${new Date(
    options.timestampMs,
  ).toISOString()}.`;
}

function createRetryingCaptureDetailText(options) {
  return `Transient simulated capture failure from ${options.leftDevicePath} and ${options.rightDevicePath}; retry ${options.retryAttempt}/${options.retryBudget} in ${options.retryDelayMs}ms. ${options.message}`;
}

function createTerminalCaptureFailureDetailText(options) {
  return `Simulated capture failed for ${options.leftDevicePath} and ${options.rightDevicePath} after ${options.retryAttemptsUsed}/${options.retryBudget} retr${
    options.retryBudget === 1 ? "y" : "ies"
  }. ${options.message}`;
}

function createRunningDetailText(backend) {
  if (backend.options.captureWarmupFrames > 0) {
    return `Validated simulated startup with ${backend.options.captureWarmupFrames} warm-up capture(s). Ready to produce camera-mode snapshots from ${backend.leftDevicePath} and ${backend.rightDevicePath}.`;
  }

  return `Simulated camera backend ready to produce camera-mode snapshots from ${backend.leftDevicePath} and ${backend.rightDevicePath}.`;
}

function readCaptureEyeLabel(error) {
  return error?.captureEyeLabel === "left" || error?.captureEyeLabel === "right"
    ? error.captureEyeLabel
    : undefined;
}

function normalizeCaptureOptions(options) {
  return {
    ...options,
    captureWidth: normalizePositiveInteger(
      options.captureWidth,
      DEFAULT_CAPTURE_WIDTH,
    ),
    captureHeight: normalizePositiveInteger(
      options.captureHeight,
      DEFAULT_CAPTURE_HEIGHT,
    ),
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

function delayMs(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
