import fs from "node:fs/promises";
import path from "node:path";
import {
  listSupportedImageFiles,
  loadImageFrameFromFile,
} from "../frame_provider_support.mjs";
import {
  appendRecentCaptureEvent,
  createFaultInjectedCaptureError,
  resolveCaptureFaultFailureCount,
  resolveFaultInjectionEyeLabel,
  shouldTriggerCaptureFaultInjection,
  summarizeCaptureIssue,
} from "../fault_injection.mjs";
import { createCaptureBackendStatus } from "./capture_backend_contract.mjs";
import { validateReplayCaptureInputs } from "./replay_manifest_validator.mjs";
import {
  normalizeReplayTimeScale,
  resolveFixedReplayDelayMs,
  resolveReplayNominalDelayDescriptor,
  scaleReplayDelayMs,
} from "./replay_timing_support.mjs";

const DEFAULT_CAPTURE_WIDTH = 1280;
const DEFAULT_CAPTURE_HEIGHT = 720;
const DEFAULT_CAPTURE_TIMEOUT_MS = 3000;
const DEFAULT_CAPTURE_JPEG_QUALITY = 85;
const DEFAULT_CAPTURE_WARMUP_FRAMES = 1;
const DEFAULT_CAPTURE_RETRY_COUNT = 2;
const DEFAULT_CAPTURE_RETRY_DELAY_MS = 500;
const DEFAULT_REPLAY_FPS = 1;
const DEFAULT_REPLAY_TIMING_MODE = "fixed";
const REPLAY_GST_LAUNCH_PATH = "n/a (replay)";
const REPLAY_DEVICE_TEXT = "n/a (replay)";

export class ReplayStereoCaptureBackend {
  constructor(options) {
    this.options = normalizeCaptureOptions(options);
    this.nowFn = options.nowFn ?? Date.now;
    this.captureQueue = Promise.resolve();
    this.frameCache = new Map();
    this.replayEntries = [];
    this.sequenceIndex = 0;
    this.currentReplayIndex = undefined;
    this.isRunning = false;
    this.startupValidated = false;
    this.captureHealthState = "idle";
    this.gstLaunchPath = REPLAY_GST_LAUNCH_PATH;
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
    this.replayTimingMode = this.options.replayFpsMode;
    this.replayTimeScale = this.options.replayTimeScale;
    this.replayManifestLoaded = false;
    this.replayManifestValidated = false;
    this.replayManifestErrorCount = 0;
    this.replayManifestWarningCount = 0;
    this.replayManifestSource = this.options.replayManifestPath
      ? path.resolve(this.options.replayManifestPath)
      : "not_configured";
    this.replayValidationSummary = this.options.replayManifestPath
      ? `Replay manifest ${path.resolve(this.options.replayManifestPath)} is pending validation.`
      : "Replay manifest not configured; directory/file-list replay validation is pending.";
    this.replayRecordedTimestamp = undefined;
    this.replayDelayUntilNextMs = resolveFixedReplayDelayMs(this.options.fps);
    this.replayScaledDelayUntilNextMs = scaleReplayDelayMs(
      this.replayDelayUntilNextMs,
      this.replayTimeScale,
      this.replayTimingMode,
    );
    this.replayTimingOffsetMs = undefined;
    this.replayNominalLoopDurationMs = undefined;
    this.replayScaledLoopDurationMs = undefined;
    this.replayStartTimestampMs = undefined;
    this.replayAnchorRecordedTimestamp = undefined;
    this.leftReplaySource = createReplaySourcePreview(
      this.options.leftReplayFiles,
      this.options.leftReplayDir,
      "left",
    );
    this.rightReplaySource = createReplaySourcePreview(
      this.options.rightReplayFiles,
      this.options.rightReplayDir,
      "right",
    );
    this.replaySourceIdentity = this.options.replayManifestPath
      ? createManifestSourceIdentityPreview(this.options.replayManifestPath)
      : createReplaySourceIdentity(this.leftReplaySource, this.rightReplaySource);
    this.status = this.createStatus({
      state: "idle",
      detailText: `Waiting to start replay stereo capture using ${this.replaySourceIdentity}.`,
    });
  }

  createStatus(overrides = {}) {
    const normalizedStatus = createCaptureBackendStatus({
      backendType: "replay",
      backendDisplayName: "Replay Stereo Capture Backend",
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
      backend: "replay",
      lastCaptureTime: normalizedStatus.lastCaptureTimestampMs ?? null,
      lastError: normalizedStatus.lastError ?? null,
      leftDevice: REPLAY_DEVICE_TEXT,
      rightDevice: REPLAY_DEVICE_TEXT,
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
      replaySourceIdentity: this.replaySourceIdentity,
      replayLoopEnabled: this.options.replayLoop,
      replayCurrentIndex: this.currentReplayIndex,
      replayFrameCount: this.replayEntries.length || undefined,
      replayLeftSource: this.leftReplaySource,
      replayRightSource: this.rightReplaySource,
      replayTimingMode: this.replayTimingMode,
      replayTimeScale: this.replayTimeScale,
      replayManifestLoaded: this.replayManifestLoaded,
      replayManifestValidated: this.replayManifestValidated,
      replayManifestErrorCount: this.replayManifestErrorCount,
      replayManifestWarningCount: this.replayManifestWarningCount,
      replayManifestSource: this.replayManifestSource,
      replayValidationSummary: this.replayValidationSummary,
      replayRecordedTimestamp: this.replayRecordedTimestamp,
      replayDelayUntilNextMs: this.replayDelayUntilNextMs,
      replayScaledDelayUntilNextMs: this.replayScaledDelayUntilNextMs,
      replayTimingOffsetMs: this.replayTimingOffsetMs,
      replayNominalLoopDurationMs: this.replayNominalLoopDurationMs,
      replayScaledLoopDurationMs: this.replayScaledLoopDurationMs,
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

  applyReplayValidationReport(report) {
    this.replayTimeScale = report.replayTimeScale ?? this.options.replayTimeScale;
    this.replayManifestLoaded = report.manifestLoaded;
    this.replayManifestValidated = report.manifestValidated;
    this.replayManifestErrorCount = report.failedCount;
    this.replayManifestWarningCount = report.warningCount;
    this.replayManifestSource = report.manifestSource ?? "not_configured";
    this.replayValidationSummary =
      report.validationSummary ??
      "Replay validation completed without a summary.";
    this.replayNominalLoopDurationMs =
      report.timingSummary?.nominalLoopDurationMs ?? undefined;
    this.replayScaledLoopDurationMs =
      report.timingSummary?.scaledLoopDurationMs ?? undefined;
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.startupValidated = false;
    this.captureHealthState = "idle";
    this.currentRetryAttempt = 0;
    this.currentReplayIndex = undefined;
    this.replayManifestLoaded = false;
    this.replayManifestValidated = false;
    this.replayManifestErrorCount = 0;
    this.replayManifestWarningCount = 0;
    this.replayManifestSource = this.options.replayManifestPath
      ? path.resolve(this.options.replayManifestPath)
      : "not_configured";
    this.replayValidationSummary = this.options.replayManifestPath
      ? `Replay manifest ${path.resolve(this.options.replayManifestPath)} is pending validation.`
      : "Replay manifest not configured; directory/file-list replay validation is pending.";
    this.replayRecordedTimestamp = undefined;
    this.replayDelayUntilNextMs = resolveFixedReplayDelayMs(this.options.fps);
    this.replayScaledDelayUntilNextMs = scaleReplayDelayMs(
      this.replayDelayUntilNextMs,
      this.replayTimeScale,
      this.replayTimingMode,
    );
    this.replayTimingOffsetMs = undefined;
    this.replayNominalLoopDurationMs = undefined;
    this.replayScaledLoopDurationMs = undefined;
    this.replayStartTimestampMs = undefined;
    this.replayAnchorRecordedTimestamp = undefined;
    this.updateStatus({
      state: "starting",
      detailText: `Resolving replay inputs for ${this.replaySourceIdentity}.`,
      lastError: null,
    });

    try {
      const replayValidation = await validateReplayCaptureInputs(this.options);
      this.applyReplayValidationReport(replayValidation);
      if (!replayValidation.ok) {
        throw new Error(replayValidation.validationSummary);
      }

      this.replayEntries = replayValidation.entries;
      this.replayManifestLoaded = replayValidation.manifestLoaded;
      this.leftReplaySource = replayValidation.leftSource;
      this.rightReplaySource = replayValidation.rightSource;
      this.replaySourceIdentity = replayValidation.sourceIdentity;
      this.sequenceIndex = 0;
      this.currentReplayIndex = undefined;
      await this.preloadFirstReplayPair();

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
      this.currentReplayIndex = undefined;
      this.replayRecordedTimestamp = undefined;
      this.replayDelayUntilNextMs = resolveFixedReplayDelayMs(this.options.fps);
      this.replayScaledDelayUntilNextMs = scaleReplayDelayMs(
        this.replayDelayUntilNextMs,
        this.replayTimeScale,
        this.replayTimingMode,
      );
      this.replayTimingOffsetMs = undefined;
      this.replayStartTimestampMs = undefined;
      this.replayAnchorRecordedTimestamp = undefined;
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
      detailText: "Replay stereo capture backend stopped.",
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
        this.status.lastError ?? "Replay stereo capture backend is not running.",
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

  async preloadFirstReplayPair() {
    if (this.replayEntries.length === 0) {
      return;
    }

    const initialPair = this.replayEntries[0];
    await Promise.all([
      this.loadCachedImageFrame(initialPair.leftFilePath, {
        eye: "left",
        pairIndex: 0,
        entry: initialPair,
      }),
      this.loadCachedImageFrame(initialPair.rightFilePath, {
        eye: "right",
        pairIndex: 0,
        entry: initialPair,
      }),
    ]);
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

        const pairIndex = resolveReplayPairIndex(this, options);
        const replayEntry = this.replayEntries[pairIndex];
        const timestampMs = this.nowFn();
        const captureDurationMs = resolveReplayCaptureDurationMs(
          logicalCaptureIndex,
          pairIndex,
          retryAttemptsUsed,
        );
        const holdingFinalReplayPair =
          options.phase === "capture" &&
          !this.options.replayLoop &&
          this.sequenceIndex >= this.replayEntries.length;
        const replayDelayDescriptor = resolveReplayNominalDelayDescriptor({
          entries: this.replayEntries,
          currentIndex: pairIndex,
          loopEnabled: this.options.replayLoop,
          timingMode: this.replayTimingMode,
          fixedFps: this.options.fps,
          timeScale: this.replayTimeScale,
        });
        const replayDelayUntilNextMs = replayDelayDescriptor.delayMs;
        const replayScaledDelayUntilNextMs = replayDelayDescriptor.scaledDelayMs;
        const replayTimingOffsetMs = resolveReplayTimingOffsetMs(
          this,
          replayEntry.recordedTimestampMs,
          timestampMs,
        );
        const leftFrame = await this.loadCachedImageFrame(replayEntry.leftFilePath, {
          eye: "left",
          pairIndex,
          entry: replayEntry,
        });
        const rightFrame = await this.loadCachedImageFrame(replayEntry.rightFilePath, {
          eye: "right",
          pairIndex,
          entry: replayEntry,
        });

        const previousSuccessfulCaptureTimestampMs =
          this.lastSuccessfulCaptureTimestampMs;
        const recoveredAfterRetry = retryAttemptsUsed > 0;
        this.successfulCaptures += 1;
        this.currentReplayIndex = pairIndex + 1;
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
        this.replayRecordedTimestamp = replayEntry.recordedTimestampMs;
        this.replayDelayUntilNextMs = replayDelayUntilNextMs;
        this.replayScaledDelayUntilNextMs = replayScaledDelayUntilNextMs;
        this.replayTimingOffsetMs = replayTimingOffsetMs;
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
        if (options.phase === "capture") {
          this.sequenceIndex += 1;
        }
        this.updateStatus({
          state: "running",
          detailText: createCaptureDetailText({
            phase: options.phase,
            warmupIndex: options.warmupIndex,
            warmupFrames: this.options.captureWarmupFrames,
            captureDurationMs,
            timestampMs,
            retryAttemptsUsed,
            replayPairIndex: pairIndex + 1,
            replayPairCount: this.replayEntries.length,
            replaySourceIdentity: this.replaySourceIdentity,
            replayTimingMode: this.replayTimingMode,
            replayTimeScale: this.replayTimeScale,
            replayDelayUntilNextMs,
            replayScaledDelayUntilNextMs,
            holdingFinalReplayPair,
          }),
          lastCaptureTimestampMs: timestampMs,
          lastError: null,
        });

        return {
          timestampMs,
          timestamp: timestampMs,
          leftImage: leftFrame.bytes,
          rightImage: rightFrame.bytes,
          left: {
            ...leftFrame,
            markerText: `LEFT R${String(pairIndex + 1).padStart(2, "0")}`,
          },
          right: {
            ...rightFrame,
            markerText: `RIGHT R${String(pairIndex + 1).padStart(2, "0")}`,
          },
          overlayLabel:
            replayEntry.label ??
            `Replay Camera Snapshot ${String(pairIndex + 1).padStart(2, "0")}/${String(
              this.replayEntries.length,
            ).padStart(2, "0")}`,
          tags: [
            "replay",
            "camera",
            "snapshot",
            `timing:${this.replayTimingMode}`,
            `time-scale:${this.replayTimeScale}`,
            ...(this.replayManifestLoaded ? ["manifest"] : []),
          ],
          extras: {
            captureBackend: "replay",
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
            replaySourceIdentity: this.replaySourceIdentity,
            replayLoopEnabled: this.options.replayLoop,
            replayCurrentIndex: pairIndex + 1,
            replayFrameCount: this.replayEntries.length,
            replayLeftSource: this.leftReplaySource,
            replayRightSource: this.rightReplaySource,
            replayTimingMode: this.replayTimingMode,
            replayTimeScale: this.replayTimeScale,
            replayManifestLoaded: this.replayManifestLoaded,
            replayManifestValidated: this.replayManifestValidated,
            replayManifestErrorCount: this.replayManifestErrorCount,
            replayManifestWarningCount: this.replayManifestWarningCount,
            replayManifestSource: this.replayManifestSource,
            replayValidationSummary: this.replayValidationSummary,
            replayRecordedTimestamp: replayEntry.recordedTimestampMs,
            replayDelayUntilNextMs,
            replayScaledDelayUntilNextMs,
            replayTimingOffsetMs,
            replayNominalLoopDurationMs: this.replayNominalLoopDurationMs,
            replayScaledLoopDurationMs: this.replayScaledLoopDurationMs,
            replayFrameId: replayEntry.frameId,
            replayLabel: replayEntry.label,
            replayNotes: replayEntry.notes,
            replayLeftFileName: path.basename(replayEntry.leftFilePath),
            replayRightFileName: path.basename(replayEntry.rightFilePath),
            replayHoldingFinalFrame: holdingFinalReplayPair,
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
              replaySourceIdentity: this.replaySourceIdentity,
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
            replaySourceIdentity: this.replaySourceIdentity,
            message,
          }),
          lastError: message,
        });
        throw error;
      }
    }
  }

  async loadCachedImageFrame(filePath, options) {
    const sourceLabel = `replay-${options.eye}-${String(options.pairIndex + 1).padStart(
      4,
      "0",
    )}`;
    const cacheKey = `${path.resolve(filePath)}::${sourceLabel}`;
    const cachedFrame = this.frameCache.get(cacheKey);
    if (cachedFrame) {
      return cachedFrame;
    }

    const loadedFrame = await loadImageFrameFromFile(filePath, {
      width: this.options.captureWidth,
      height: this.options.captureHeight,
      sourceLabel,
      title: "Replay Camera Snapshot",
      backgroundHex: options.eye === "left" ? "#10293d" : "#24173d",
      accentHex: options.eye === "left" ? "#8fe5ff" : "#f1c5ff",
      metadata: {
        captureBackend: "replay",
        replaySourceIdentity: this.replaySourceIdentity,
        replayLoopEnabled: this.options.replayLoop,
        replayPairIndex: options.pairIndex + 1,
        replayPairCount: this.replayEntries.length,
        replaySource:
          options.eye === "left" ? this.leftReplaySource : this.rightReplaySource,
        replayTimingMode: this.replayTimingMode,
        replayTimeScale: this.replayTimeScale,
        replayManifestLoaded: this.replayManifestLoaded,
        replayManifestValidated: this.replayManifestValidated,
        replayManifestErrorCount: this.replayManifestErrorCount,
        replayManifestWarningCount: this.replayManifestWarningCount,
        replayManifestSource: this.replayManifestSource,
        replayValidationSummary: this.replayValidationSummary,
        replayRecordedTimestamp: options.entry.recordedTimestampMs,
        replayNominalLoopDurationMs: this.replayNominalLoopDurationMs,
        replayScaledLoopDurationMs: this.replayScaledLoopDurationMs,
        replayFrameId: options.entry.frameId,
        replayLabel: options.entry.label,
        eye: options.eye,
      },
    });
    this.frameCache.set(cacheKey, loadedFrame);
    return loadedFrame;
  }
}

async function resolveReplayInputBundle(options) {
  const manifestResult = await maybeLoadReplayManifest(options.replayManifestPath);
  if (manifestResult?.loaded) {
    return manifestResult;
  }

  const leftFiles = await resolveReplayFiles(
    options.leftReplayFiles,
    options.leftReplayDir,
  );
  const rightFiles = await resolveReplayFiles(
    options.rightReplayFiles,
    options.rightReplayDir,
  );

  if (leftFiles.length === 0 || rightFiles.length === 0) {
    throw new Error(
      "Replay camera backend requires non-empty left/right replay inputs.",
    );
  }

  if (leftFiles.length !== rightFiles.length) {
    throw new Error(
      `Replay left/right input lengths must match (${leftFiles.length} !== ${rightFiles.length}).`,
    );
  }

  return {
    loaded: false,
    manifestLoaded: false,
    entries: leftFiles.map((leftFilePath, index) => {
      return {
        leftFilePath,
        rightFilePath: rightFiles[index],
      };
    }),
    leftSource: createResolvedReplaySourceText(
      leftFiles,
      options.leftReplayFiles,
      options.leftReplayDir,
      "left",
    ),
    rightSource: createResolvedReplaySourceText(
      rightFiles,
      options.rightReplayFiles,
      options.rightReplayDir,
      "right",
    ),
    sourceIdentity: createReplaySourceIdentity(
      createResolvedReplaySourceText(
        leftFiles,
        options.leftReplayFiles,
        options.leftReplayDir,
        "left",
      ),
      createResolvedReplaySourceText(
        rightFiles,
        options.rightReplayFiles,
        options.rightReplayDir,
        "right",
      ),
    ),
  };
}

async function maybeLoadReplayManifest(manifestPath) {
  if (!manifestPath) {
    return undefined;
  }

  const resolvedManifestPath = path.resolve(manifestPath);
  let manifestText;
  try {
    manifestText = await fs.readFile(resolvedManifestPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return {
        loaded: false,
      };
    }

    throw new Error(
      `Failed to load replay manifest ${resolvedManifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(
      `Replay manifest ${resolvedManifestPath} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
    throw new Error(
      `Replay manifest ${resolvedManifestPath} must contain an "entries" array.`,
    );
  }

  if (parsed.entries.length === 0) {
    throw new Error(
      `Replay manifest ${resolvedManifestPath} must include at least one replay entry.`,
    );
  }

  const manifestBaseDir =
    typeof parsed.baseDir === "string" && parsed.baseDir.trim().length > 0
      ? path.resolve(path.dirname(resolvedManifestPath), parsed.baseDir)
      : path.dirname(resolvedManifestPath);

  const entries = parsed.entries.map((entry, index) => {
    return parseReplayManifestEntry(
      entry,
      index,
      resolvedManifestPath,
      manifestBaseDir,
    );
  });

  return {
    loaded: true,
    manifestLoaded: true,
    entries,
    leftSource: createManifestEyeSource(entries, "left"),
    rightSource: createManifestEyeSource(entries, "right"),
    sourceIdentity: createManifestSourceIdentity(
      resolvedManifestPath,
      entries.length,
    ),
  };
}

function parseReplayManifestEntry(entry, index, manifestPath, manifestBaseDir) {
  if (!entry || typeof entry !== "object") {
    throw new Error(
      `Replay manifest ${manifestPath} entry ${index} must be an object.`,
    );
  }

  const record = entry;
  const leftFile = readRequiredManifestString(
    record.leftFile,
    manifestPath,
    index,
    "leftFile",
  );
  const rightFile = readRequiredManifestString(
    record.rightFile,
    manifestPath,
    index,
    "rightFile",
  );
  const timestampValue =
    record.timestampMs !== undefined ? record.timestampMs : record.timestamp;

  return {
    leftFilePath: resolveReplayManifestFilePath(manifestBaseDir, leftFile),
    rightFilePath: resolveReplayManifestFilePath(manifestBaseDir, rightFile),
    recordedTimestampMs: readOptionalManifestNonNegativeNumber(
      timestampValue,
      manifestPath,
      index,
      "timestampMs",
    ),
    frameId: readOptionalManifestNonNegativeInteger(
      record.frameId,
      manifestPath,
      index,
      "frameId",
    ),
    label: readOptionalManifestString(record.label),
    notes: readOptionalManifestString(record.notes),
    delayUntilNextMs: readOptionalManifestNonNegativeNumber(
      record.delayUntilNextMs,
      manifestPath,
      index,
      "delayUntilNextMs",
    ),
  };
}

async function resolveReplayFiles(replayFiles, replayDir) {
  if (Array.isArray(replayFiles) && replayFiles.length > 0) {
    return replayFiles.map((filePath) => {
      return path.resolve(filePath);
    });
  }

  if (!replayDir) {
    return [];
  }

  return listSupportedImageFiles(replayDir);
}

function resolveReplayPairIndex(backend, options) {
  if (backend.replayEntries.length === 0) {
    throw new Error("Replay stereo capture backend has no resolved input pairs.");
  }

  const replayBaseIndex =
    options.phase === "warmup"
      ? Math.max(0, (options.warmupIndex ?? 1) - 1)
      : backend.sequenceIndex;

  if (backend.options.replayLoop) {
    return replayBaseIndex % backend.replayEntries.length;
  }

  return Math.min(replayBaseIndex, backend.replayEntries.length - 1);
}

function resolveReplayCaptureDurationMs(
  captureIndex,
  replayPairIndex,
  retryAttemptsUsed,
) {
  return (
    24 +
    ((captureIndex * 7 + replayPairIndex * 13 + retryAttemptsUsed * 11) % 29)
  );
}

function resolveReplayDelayUntilNextMs(backend, currentIndex) {
  const fixedDelayMs = resolveLegacyFixedReplayDelayMs(backend.options.fps);
  if (backend.options.replayFpsMode !== "recorded") {
    return fixedDelayMs;
  }

  const currentEntry = backend.replayEntries[currentIndex];
  if (typeof currentEntry?.delayUntilNextMs === "number") {
    return currentEntry.delayUntilNextMs;
  }

  const nextEntry = resolveNextReplayEntry(
    backend.replayEntries,
    currentIndex,
    backend.options.replayLoop,
  );
  if (
    nextEntry &&
    typeof currentEntry?.recordedTimestampMs === "number" &&
    typeof nextEntry.recordedTimestampMs === "number" &&
    nextEntry.recordedTimestampMs >= currentEntry.recordedTimestampMs
  ) {
    return Math.max(
      0,
      nextEntry.recordedTimestampMs - currentEntry.recordedTimestampMs,
    );
  }

  return fixedDelayMs;
}

function resolveNextReplayEntry(entries, currentIndex, loopEnabled) {
  if (currentIndex + 1 < entries.length) {
    return entries[currentIndex + 1];
  }

  if (loopEnabled && entries.length > 0) {
    return entries[0];
  }

  return undefined;
}

function resolveReplayTimingOffsetMs(
  backend,
  recordedTimestampMs,
  actualTimestampMs,
) {
  if (typeof recordedTimestampMs !== "number") {
    return undefined;
  }

  if (
    typeof backend.replayStartTimestampMs !== "number" ||
    typeof backend.replayAnchorRecordedTimestamp !== "number"
  ) {
    backend.replayStartTimestampMs = actualTimestampMs;
    backend.replayAnchorRecordedTimestamp = recordedTimestampMs;
    return 0;
  }

  const expectedElapsedMs = scaleReplayDelayMs(
    recordedTimestampMs - backend.replayAnchorRecordedTimestamp,
    backend.replayTimeScale,
    backend.replayTimingMode,
  );
  const actualElapsedMs = actualTimestampMs - backend.replayStartTimestampMs;
  return actualElapsedMs - expectedElapsedMs;
}

function createReplaySourcePreview(replayFiles, replayDir, eyeLabel) {
  if (Array.isArray(replayFiles) && replayFiles.length > 0) {
    return createFileListPreview(replayFiles, eyeLabel);
  }

  if (typeof replayDir === "string" && replayDir.length > 0) {
    return `dir:${path.resolve(replayDir)}`;
  }

  return `${eyeLabel}:unconfigured`;
}

function createResolvedReplaySourceText(
  resolvedFiles,
  configuredFiles,
  configuredDir,
  eyeLabel,
) {
  if (Array.isArray(configuredFiles) && configuredFiles.length > 0) {
    return createFileListPreview(resolvedFiles, eyeLabel);
  }

  if (typeof configuredDir === "string" && configuredDir.length > 0) {
    return `dir:${path.resolve(configuredDir)} (${resolvedFiles.length} file${
      resolvedFiles.length === 1 ? "" : "s"
    })`;
  }

  return createFileListPreview(resolvedFiles, eyeLabel);
}

function createManifestEyeSource(entries, eyeLabel) {
  const filePaths = entries.map((entry) => {
    return eyeLabel === "left" ? entry.leftFilePath : entry.rightFilePath;
  });
  return createFileListPreview(filePaths, eyeLabel);
}

function createManifestSourceIdentity(manifestPath, entryCount) {
  return `manifest:${path.resolve(manifestPath)} (${entryCount} entries)`;
}

function createManifestSourceIdentityPreview(manifestPath) {
  return `manifest:${path.resolve(manifestPath)}`;
}

function createFileListPreview(filePaths, eyeLabel) {
  const resolvedPaths = filePaths.map((filePath) => {
    return path.resolve(filePath);
  });
  if (resolvedPaths.length === 0) {
    return `${eyeLabel}:empty`;
  }

  const firstName = path.basename(resolvedPaths[0]);
  const lastName = path.basename(resolvedPaths[resolvedPaths.length - 1]);
  if (resolvedPaths.length === 1) {
    return `file:${resolvedPaths[0]}`;
  }

  return `files:${resolvedPaths.length} (${firstName}..${lastName})`;
}

function createReplaySourceIdentity(leftSource, rightSource) {
  return `left=${leftSource} | right=${rightSource}`;
}

function createCaptureDetailText(options) {
  const holdingFinalText = options.holdingFinalReplayPair
    ? " Holding final replay pair."
    : "";
  const timingText = ` Timing=${options.replayTimingMode} @ ${options.replayTimeScale}x; next nominal delay ${options.replayDelayUntilNextMs}ms, scaled ${options.replayScaledDelayUntilNextMs}ms.`;
  if (options.phase === "warmup") {
    if (options.retryAttemptsUsed > 0) {
      return `Recovered after ${options.retryAttemptsUsed} retr${
        options.retryAttemptsUsed === 1 ? "y" : "ies"
      } and validated replay warm-up capture ${options.warmupIndex}/${options.warmupFrames} using pair ${options.replayPairIndex}/${options.replayPairCount} from ${options.replaySourceIdentity} in ${options.captureDurationMs}ms.${timingText}`;
    }

    return `Validated replay warm-up capture ${options.warmupIndex}/${options.warmupFrames} using pair ${options.replayPairIndex}/${options.replayPairCount} from ${options.replaySourceIdentity} in ${options.captureDurationMs}ms.${timingText}`;
  }

  if (options.retryAttemptsUsed > 0) {
    return `Recovered after ${options.retryAttemptsUsed} retr${
      options.retryAttemptsUsed === 1 ? "y" : "ies"
    } and replayed stereo pair ${options.replayPairIndex}/${options.replayPairCount} from ${options.replaySourceIdentity} in ${options.captureDurationMs}ms at ${new Date(
      options.timestampMs,
    ).toISOString()}.${holdingFinalText}${timingText}`;
  }

  return `Replayed stereo pair ${options.replayPairIndex}/${options.replayPairCount} from ${options.replaySourceIdentity} in ${options.captureDurationMs}ms at ${new Date(
    options.timestampMs,
  ).toISOString()}.${holdingFinalText}${timingText}`;
}

function createRetryingCaptureDetailText(options) {
  return `Transient replay capture failure from ${options.replaySourceIdentity}; retry ${options.retryAttempt}/${options.retryBudget} in ${options.retryDelayMs}ms. ${options.message}`;
}

function createTerminalCaptureFailureDetailText(options) {
  return `Replay capture failed for ${options.replaySourceIdentity} after ${options.retryAttemptsUsed}/${options.retryBudget} retr${
    options.retryBudget === 1 ? "y" : "ies"
  }. ${options.message}`;
}

function createRunningDetailText(backend) {
  const warmupText =
    backend.options.captureWarmupFrames > 0
      ? `Validated replay startup with ${backend.options.captureWarmupFrames} warm-up capture(s).`
      : "Replay camera backend ready.";

  return `${warmupText} Ready to replay ${backend.replayEntries.length} stereo pair(s) from ${backend.replaySourceIdentity}${
    backend.options.replayLoop ? " with looping." : " without looping."
  } Timing mode: ${backend.replayTimingMode} @ ${backend.replayTimeScale}x. Manifest loaded: ${
    backend.replayManifestLoaded ? "yes" : "no"
  }. Nominal loop=${backend.replayNominalLoopDurationMs ?? "pending"}ms, scaled loop=${
    backend.replayScaledLoopDurationMs ?? "pending"
  }ms.`;
}

function resolveLegacyFixedReplayDelayMs(fps) {
  const normalizedFps =
    typeof fps === "number" && Number.isFinite(fps) && fps > 0
      ? fps
      : DEFAULT_REPLAY_FPS;
  return Math.max(1, Math.round(1000 / normalizedFps));
}

function resolveReplayManifestFilePath(baseDir, filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(baseDir, filePath);
}

function readRequiredManifestString(value, manifestPath, index, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Replay manifest ${manifestPath} entry ${index} requires "${fieldName}".`,
    );
  }

  return value.trim();
}

function readOptionalManifestString(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readOptionalManifestNonNegativeNumber(
  value,
  manifestPath,
  index,
  fieldName,
) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Replay manifest ${manifestPath} entry ${index} has invalid "${fieldName}".`,
    );
  }

  return value;
}

function readOptionalManifestNonNegativeInteger(
  value,
  manifestPath,
  index,
  fieldName,
) {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isInteger(value)
  ) {
    throw new Error(
      `Replay manifest ${manifestPath} entry ${index} has invalid "${fieldName}".`,
    );
  }

  return value;
}

function readCaptureEyeLabel(error) {
  return error?.captureEyeLabel === "left" || error?.captureEyeLabel === "right"
    ? error.captureEyeLabel
    : undefined;
}

function normalizeCaptureOptions(options) {
  return {
    ...options,
    fps: normalizePositiveNumber(options.fps, DEFAULT_REPLAY_FPS),
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
    replayLoop: options.replayLoop !== false,
    replayFpsMode:
      options.replayFpsMode === "recorded"
        ? "recorded"
        : DEFAULT_REPLAY_TIMING_MODE,
    replayTimeScale: normalizeReplayTimeScale(options.replayTimeScale),
    replayManifestPath:
      typeof options.replayManifestPath === "string" &&
      options.replayManifestPath.trim().length > 0
        ? options.replayManifestPath.trim()
        : undefined,
  };
}

function normalizePositiveNumber(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
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
