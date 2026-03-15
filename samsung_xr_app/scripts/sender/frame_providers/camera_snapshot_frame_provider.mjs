import { createStereoCaptureBackend } from "../capture_backend_factory.mjs";
import { createFrameProviderStatus } from "../frame_provider_contract.mjs";

export class CameraSnapshotFrameProvider {
  constructor(options) {
    this.options = options;
    this.backend = createStereoCaptureBackend(options);
    this.frameIndex = 0;
    this.status = createFrameProviderStatus({
      providerType: "camera",
      providerDisplayName: "Camera Snapshot Frame Provider",
      detailText: "Waiting to start the stereo capture backend.",
      ...mapBackendTelemetryToProviderStatus(this.backend.getStatus()),
    });
  }

  async start() {
    this.frameIndex = 0;
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "starting",
      detailText: "Starting camera snapshot provider.",
      lastError: undefined,
      lastCaptureError: undefined,
    });

    await this.backend.start();
    const backendStatus = this.backend.getStatus();
    if (backendStatus.state !== "running") {
      const message =
        backendStatus.lastError ??
        backendStatus.detailText ??
        "Stereo capture backend is unavailable.";
      this.status = createFrameProviderStatus({
        ...this.status,
        state: "error",
        detailText: backendStatus.detailText ?? "Stereo capture backend unavailable.",
        lastError: message,
        ...mapBackendTelemetryToProviderStatus(backendStatus),
      });
      throw new Error(message);
    }

    this.status = createFrameProviderStatus({
      ...this.status,
      state: "running",
      detailText:
        backendStatus.detailText ??
        `Capturing stereo snapshots through ${backendStatus.backendDisplayName}.`,
      ...mapBackendTelemetryToProviderStatus(backendStatus),
    });
  }

  async stop() {
    await this.backend.stop();
    const backendStatus = this.backend.getStatus();
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "stopped",
      detailText: "Camera snapshot provider stopped.",
      ...mapBackendTelemetryToProviderStatus(backendStatus),
    });
  }

  getStatus() {
    const backendStatus = this.backend.getStatus();
    this.status = createFrameProviderStatus({
      ...this.status,
      state: mapBackendStateToProviderState(backendStatus.state),
      detailText: backendStatus.detailText ?? this.status.detailText,
      lastError:
        backendStatus.state === "error"
          ? backendStatus.lastError ?? this.status.lastError
          : this.status.lastError,
      ...mapBackendTelemetryToProviderStatus(
        backendStatus,
        this.status.lastFrameTimestampMs,
      ),
    });
    return this.status;
  }

  shouldAutoSendFrames() {
    if (typeof this.backend.shouldAutoSendFrames === "function") {
      return this.backend.shouldAutoSendFrames();
    }

    return true;
  }

  async handleControlCommand(command) {
    if (typeof this.backend.handleControlCommand === "function") {
      return this.backend.handleControlCommand(command);
    }

    return { handled: false };
  }

  async getNextStereoFrame() {
    if (this.status.state !== "running") {
      throw new Error(
        this.status.lastError ?? "Camera snapshot provider is not running.",
      );
    }

    try {
      const capturedPair = await this.backend.captureStereoPair();
      const backendStatus = this.backend.getStatus();
      this.frameIndex += 1;
      this.status = createFrameProviderStatus({
        ...this.status,
        state: "running",
        detailText:
          backendStatus.detailText ??
          `Captured stereo snapshot ${String(this.frameIndex).padStart(4, "0")}.`,
        lastFrameIndex: this.frameIndex,
        lastFrameTimestampMs: capturedPair.timestampMs,
        ...mapBackendTelemetryToProviderStatus(backendStatus, capturedPair.timestampMs),
      });

      return {
        frameIndex: this.frameIndex,
        timestampMs: capturedPair.timestampMs,
        providerType: "camera",
        overlayLabel:
          capturedPair.overlayLabel ??
          `Camera Snapshot ${String(this.frameIndex).padStart(4, "0")}`,
        tags: [
          "sender-prototype",
          "camera-provider",
          `backend:${backendStatus.backendType}`,
          ...(capturedPair.tags ?? []),
        ],
        extras: {
          providerType: "camera",
          captureBackend: backendStatus.backendType,
          backendDisplayName: backendStatus.backendDisplayName,
          cameraProfile: this.options.cameraProfile,
          leftCameraId: String(this.options.leftCameraId),
          rightCameraId: String(this.options.rightCameraId),
          leftCameraDevice:
            this.options.leftCameraDevice ?? backendStatus.leftDevice,
          rightCameraDevice:
            this.options.rightCameraDevice ?? backendStatus.rightDevice,
          captureWidth: this.options.captureWidth,
          captureHeight: this.options.captureHeight,
          captureTimeoutMs: this.options.captureTimeoutMs,
          captureJpegQuality: this.options.captureJpegQuality,
          captureWarmupFrames: this.options.captureWarmupFrames,
          capturesAttempted: backendStatus.capturesAttempted,
          capturesSucceeded: backendStatus.capturesSucceeded ??
            backendStatus.successfulCaptures,
          capturesFailed: backendStatus.capturesFailed ?? backendStatus.failedCaptures,
          successfulCaptures: backendStatus.successfulCaptures,
          failedCaptures: backendStatus.failedCaptures,
          lastSuccessfulCaptureTime: backendStatus.lastSuccessfulCaptureTime,
          lastCaptureDurationMs: backendStatus.lastCaptureDurationMs,
          averageCaptureDurationMs: backendStatus.averageCaptureDurationMs,
          effectiveFrameIntervalMs: backendStatus.effectiveFrameIntervalMs,
          consecutiveFailureCount: backendStatus.consecutiveFailureCount,
          startupValidated: backendStatus.startupValidated,
          gstLaunchPath: backendStatus.gstLaunchPath,
          captureHealthState: backendStatus.captureHealthState,
          captureRetryCount: backendStatus.captureRetryCount,
          captureRetryDelayMs: backendStatus.captureRetryDelayMs,
          recentRetryAttempts: backendStatus.recentRetryAttempts,
          currentRetryAttempt: backendStatus.currentRetryAttempt,
          transientFailureCount: backendStatus.transientFailureCount,
          recoveryCount: backendStatus.recoveryCount,
          lastRecoveryTime: backendStatus.lastRecoveryTime,
          lastTerminalFailureTime: backendStatus.lastTerminalFailureTime,
          telemetryUpdatedAtMs: backendStatus.telemetryUpdatedAtMs,
          recentCaptureEvents: backendStatus.recentCaptureEvents,
          replaySourceIdentity: backendStatus.replaySourceIdentity,
          replayLoopEnabled: backendStatus.replayLoopEnabled,
          replayCurrentIndex: backendStatus.replayCurrentIndex,
          replayFrameCount: backendStatus.replayFrameCount,
          replayLeftSource: backendStatus.replayLeftSource,
          replayRightSource: backendStatus.replayRightSource,
          replayTimingMode: backendStatus.replayTimingMode,
          replayTimeScale: backendStatus.replayTimeScale,
          replayManifestLoaded: backendStatus.replayManifestLoaded,
          replayManifestValidated: backendStatus.replayManifestValidated,
          replayManifestErrorCount: backendStatus.replayManifestErrorCount,
          replayManifestWarningCount: backendStatus.replayManifestWarningCount,
          replayManifestSource: backendStatus.replayManifestSource,
          replayValidationSummary: backendStatus.replayValidationSummary,
          replayRecordedTimestamp: backendStatus.replayRecordedTimestamp,
          replayDelayUntilNextMs: backendStatus.replayDelayUntilNextMs,
          replayScaledDelayUntilNextMs: backendStatus.replayScaledDelayUntilNextMs,
          replayTimingOffsetMs: backendStatus.replayTimingOffsetMs,
          replayNominalLoopDurationMs: backendStatus.replayNominalLoopDurationMs,
          replayScaledLoopDurationMs: backendStatus.replayScaledLoopDurationMs,
          ...(capturedPair.extras ?? {}),
        },
        left: capturedPair.left,
        right: capturedPair.right,
      };
    } catch (error) {
      const backendStatus = this.backend.getStatus();
      const message =
        error instanceof Error ? error.message : String(error);
      this.status = createFrameProviderStatus({
        ...this.status,
        state: "error",
        detailText: backendStatus.detailText ?? "Stereo snapshot capture failed.",
        lastError: message,
        ...mapBackendTelemetryToProviderStatus(backendStatus),
        lastCaptureError: message,
      });
      throw error;
    }
  }
}

function mapBackendTelemetryToProviderStatus(
  backendStatus,
  fallbackCaptureTimestampMs,
) {
  return {
    backendType: backendStatus.backendType,
    backendDisplayName: backendStatus.backendDisplayName,
    backendState: backendStatus.state,
    lastCaptureTimestampMs:
      backendStatus.lastCaptureTimestampMs ?? fallbackCaptureTimestampMs,
    lastCaptureError: backendStatus.lastError,
    leftDevice: backendStatus.leftDevice,
    rightDevice: backendStatus.rightDevice,
    capturesAttempted: backendStatus.capturesAttempted,
    capturesSucceeded:
      backendStatus.capturesSucceeded ?? backendStatus.successfulCaptures,
    capturesFailed: backendStatus.capturesFailed ?? backendStatus.failedCaptures,
    lastSuccessfulCaptureTime: backendStatus.lastSuccessfulCaptureTime,
    lastCaptureDurationMs: backendStatus.lastCaptureDurationMs,
    averageCaptureDurationMs: backendStatus.averageCaptureDurationMs,
    effectiveFrameIntervalMs: backendStatus.effectiveFrameIntervalMs,
    consecutiveFailureCount: backendStatus.consecutiveFailureCount,
    startupValidated: backendStatus.startupValidated,
    gstLaunchPath: backendStatus.gstLaunchPath,
    captureHealthState: backendStatus.captureHealthState,
    captureRetryCount: backendStatus.captureRetryCount,
    captureRetryDelayMs: backendStatus.captureRetryDelayMs,
    recentRetryAttempts: backendStatus.recentRetryAttempts,
    currentRetryAttempt: backendStatus.currentRetryAttempt,
    transientFailureCount: backendStatus.transientFailureCount,
    recoveryCount: backendStatus.recoveryCount,
    lastRecoveryTime: backendStatus.lastRecoveryTime,
    lastTerminalFailureTime: backendStatus.lastTerminalFailureTime,
    telemetryUpdatedAtMs: backendStatus.telemetryUpdatedAtMs,
    replaySourceIdentity: backendStatus.replaySourceIdentity,
    replayLoopEnabled: backendStatus.replayLoopEnabled,
    replayCurrentIndex: backendStatus.replayCurrentIndex,
    replayFrameCount: backendStatus.replayFrameCount,
    replayLeftSource: backendStatus.replayLeftSource,
    replayRightSource: backendStatus.replayRightSource,
    replayTimingMode: backendStatus.replayTimingMode,
    replayTimeScale: backendStatus.replayTimeScale,
    replayManifestLoaded: backendStatus.replayManifestLoaded,
    replayManifestValidated: backendStatus.replayManifestValidated,
    replayManifestErrorCount: backendStatus.replayManifestErrorCount,
    replayManifestWarningCount: backendStatus.replayManifestWarningCount,
    replayManifestSource: backendStatus.replayManifestSource,
    replayValidationSummary: backendStatus.replayValidationSummary,
    replayRecordedTimestamp: backendStatus.replayRecordedTimestamp,
    replayDelayUntilNextMs: backendStatus.replayDelayUntilNextMs,
    replayScaledDelayUntilNextMs: backendStatus.replayScaledDelayUntilNextMs,
    replayTimingOffsetMs: backendStatus.replayTimingOffsetMs,
    replayNominalLoopDurationMs: backendStatus.replayNominalLoopDurationMs,
    replayScaledLoopDurationMs: backendStatus.replayScaledLoopDurationMs,
    recentCaptureEvents: backendStatus.recentCaptureEvents,
    bridgeMode: backendStatus.bridgeMode,
    frameSourceMode: backendStatus.frameSourceMode,
    frameSourceName: backendStatus.frameSourceName,
    runtimeProfileName: backendStatus.runtimeProfileName,
    runtimeProfileType: backendStatus.runtimeProfileType,
    runtimeProfileDescription: backendStatus.runtimeProfileDescription,
    defaultProfileName: backendStatus.defaultProfileName,
    availableProfileNames: backendStatus.availableProfileNames,
    leftSensorId: backendStatus.leftSensorId,
    rightSensorId: backendStatus.rightSensorId,
    inputWidth: backendStatus.inputWidth,
    inputHeight: backendStatus.inputHeight,
    outputWidth: backendStatus.outputWidth,
    outputHeight: backendStatus.outputHeight,
    outputMode: backendStatus.outputMode,
    effectiveFps: backendStatus.effectiveFps,
    recordingContainer: backendStatus.recordingContainer,
    recordDurationSeconds: backendStatus.recordDurationSeconds,
    testDurationSeconds: backendStatus.testDurationSeconds,
    queueMaxSizeBuffers: backendStatus.queueMaxSizeBuffers,
    outputDirectory: backendStatus.outputDirectory,
    recordingActive: backendStatus.recordingActive,
    recordingOutputPath: backendStatus.recordingOutputPath,
    artifactType: backendStatus.artifactType,
    artifactPath: backendStatus.artifactPath,
    artifactSizeBytes: backendStatus.artifactSizeBytes,
    artifactCapturedAt: backendStatus.artifactCapturedAt,
    artifactMetadataSource: backendStatus.artifactMetadataSource,
    preflightOverallStatus: backendStatus.preflightOverallStatus,
    preflightOk: backendStatus.preflightOk,
    preflightPassCount: backendStatus.preflightPassCount,
    preflightWarnCount: backendStatus.preflightWarnCount,
    preflightFailCount: backendStatus.preflightFailCount,
    preflightCriticalFailCount: backendStatus.preflightCriticalFailCount,
    systemIsJetson: backendStatus.systemIsJetson,
    jetpackVersion: backendStatus.jetpackVersion,
    l4tVersion: backendStatus.l4tVersion,
    projectName: backendStatus.projectName,
    configPath: backendStatus.configPath,
    gstLaunchBinary: backendStatus.gstLaunchBinary,
  };
}

function mapBackendStateToProviderState(backendState) {
  if (
    backendState === "starting" ||
    backendState === "running" ||
    backendState === "stopped" ||
    backendState === "error"
  ) {
    return backendState;
  }

  return "error";
}
