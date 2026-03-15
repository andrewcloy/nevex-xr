import type {
  StereoEye,
  StereoEyeFrame,
  StereoFrame,
  StereoFrameFormat,
  StereoEyeImageContent,
  StereoMetadataValue,
  StereoOverlayAnnotation,
  StereoOverlayPayload,
} from "./frame_models";
import type {
  HearingEnhancementCapabilitySnapshot,
  HearingEnhancementMode,
  MediaPlaybackState,
} from "./audio_models";
import {
  createDefaultHearingEnhancementCapabilitySnapshot,
  createDefaultPhoneMediaAudioCapabilitySnapshot,
} from "./audio_models";
import type {
  StereoFrameSourceCaptureEventSnapshot,
  StereoFrameSourceCameraTelemetrySnapshot,
  StereoFrameSourceIrIlluminatorTelemetrySnapshot,
  StereoFrameSourceState,
  StereoFrameSourceThermalTelemetrySnapshot,
} from "./frame_source";
import type {
  LiveTransportAdapterState,
  LiveTransportCapabilitiesSnapshot,
  LiveTransportConfig,
  LiveTransportStatusSnapshot,
} from "./transport_adapter";
import {
  createDefaultIrIlluminatorCapabilitySnapshot,
  createDefaultThermalCapabilitySnapshot,
  type IrIlluminatorCapabilitySnapshot,
  type ThermalCapabilitySnapshot,
  type ThermalFrame,
  type ThermalHotspotAnnotation,
  type ThermalOverlayMode,
} from "./thermal_models";

/**
 * External payload describing one eye from a future Jetson-side transport.
 */
export type JetsonEyeImagePayloadMode =
  | "data_url"
  | "base64"
  | "image_url"
  | "binary_frame";

export interface JetsonEyeImagePayload {
  readonly dataUrl?: string;
  readonly base64Data?: string;
  readonly mimeType?: string;
  readonly imageUrl?: string;
}

export interface JetsonEyeFramePayload {
  readonly eye: StereoEye;
  readonly width: number;
  readonly height: number;
  readonly format?: string;
  readonly contentLabel?: string;
  readonly title?: string;
  readonly markerText?: string;
  readonly backgroundHex?: string;
  readonly accentHex?: string;
  readonly image?: JetsonEyeImagePayload;
  readonly metadata?: Readonly<Record<string, StereoMetadataValue>>;
}

/**
 * External payload carrying overlay annotations.
 */
export interface JetsonOverlayAnnotationPayload {
  readonly id: string;
  readonly kind: StereoOverlayAnnotation["kind"];
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly label?: string;
}

export interface JetsonOverlayPayload {
  readonly label?: string;
  readonly annotations?: readonly JetsonOverlayAnnotationPayload[];
}

/**
 * External payload carrying one full stereo frame.
 */
export interface JetsonStereoFramePayload {
  readonly frameId: number;
  readonly timestampMs?: number;
  readonly sourceId?: string;
  readonly sceneId?: string;
  readonly streamName?: string;
  readonly tags?: readonly string[];
  readonly extras?: Readonly<Record<string, StereoMetadataValue>>;
  readonly overlay?: JetsonOverlayPayload;
  readonly thermalFrame?: JetsonThermalFramePayload;
  readonly thermalOverlayMode?: ThermalOverlayMode;
  readonly left: JetsonEyeFramePayload;
  readonly right: JetsonEyeFramePayload;
}

export interface JetsonThermalHotspotAnnotationPayload {
  readonly id: string;
  readonly label?: string;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly normalizedRadius?: number;
  readonly normalizedBoxWidth?: number;
  readonly normalizedBoxHeight?: number;
  readonly temperatureC?: number;
  readonly intensityNormalized?: number;
}

export interface JetsonThermalFramePayload {
  readonly frameId: number;
  readonly timestamp: number;
  readonly width: number;
  readonly height: number;
  readonly thermalValues: readonly number[];
  readonly minTemperature: number;
  readonly maxTemperature: number;
  readonly hotspotAnnotations?: readonly JetsonThermalHotspotAnnotationPayload[];
  readonly paletteHint?: string;
}

/**
 * External payload describing one transport-status update.
 */
export interface JetsonTransportStatusPayload {
  readonly transportState?: LiveTransportAdapterState;
  readonly connected?: boolean;
  readonly statusText?: string;
  readonly lastError?: string;
  readonly parseErrorText?: string;
}

/**
 * External payload describing one source-status update.
 */
export interface JetsonSourceStatusCameraTelemetryPayload {
  readonly captureBackendName?: string;
  readonly bridgeMode?: string;
  readonly startupValidated?: boolean;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly frameIntervalMs?: number;
  readonly frameSourceMode?: string;
  readonly frameSourceName?: string;
  readonly capturesAttempted?: number;
  readonly capturesSucceeded?: number;
  readonly capturesFailed?: number;
  readonly consecutiveFailureCount?: number;
  readonly lastSuccessfulCaptureTime?: number;
  readonly lastCaptureDurationMs?: number;
  readonly averageCaptureDurationMs?: number;
  readonly effectiveFrameIntervalMs?: number;
  readonly leftCameraDevice?: string;
  readonly rightCameraDevice?: string;
  readonly gstLaunchPath?: string;
  readonly captureHealthState?:
    | "idle"
    | "healthy"
    | "retrying"
    | "recovered"
    | "terminal_failure";
  readonly captureRetryCount?: number;
  readonly captureRetryDelayMs?: number;
  readonly recentRetryAttempts?: number;
  readonly currentRetryAttempt?: number;
  readonly transientFailureCount?: number;
  readonly recoveryCount?: number;
  readonly lastRecoveryTime?: number;
  readonly lastTerminalFailureTime?: number;
  readonly recentCaptureEvents?: readonly JetsonSourceStatusCaptureEventPayload[];
  readonly replaySourceIdentity?: string;
  readonly replayLoopEnabled?: boolean;
  readonly replayCurrentIndex?: number;
  readonly replayFrameCount?: number;
  readonly replayLeftSource?: string;
  readonly replayRightSource?: string;
  readonly replayTimingMode?: "fixed" | "recorded";
  readonly replayTimeScale?: number;
  readonly replayManifestLoaded?: boolean;
  readonly replayManifestValidated?: boolean;
  readonly replayManifestErrorCount?: number;
  readonly replayManifestWarningCount?: number;
  readonly replayManifestSource?: string;
  readonly replayValidationSummary?: string;
  readonly replayRecordedTimestamp?: number;
  readonly replayDelayUntilNextMs?: number;
  readonly replayScaledDelayUntilNextMs?: number;
  readonly replayTimingOffsetMs?: number;
  readonly replayNominalLoopDurationMs?: number;
  readonly replayScaledLoopDurationMs?: number;
  readonly runtimeProfileName?: string;
  readonly runtimeProfileType?: string;
  readonly runtimeProfileDescription?: string;
  readonly defaultProfileName?: string;
  readonly availableProfileNames?: readonly string[];
  readonly leftSensorId?: string | number;
  readonly rightSensorId?: string | number;
  readonly inputWidth?: number;
  readonly inputHeight?: number;
  readonly outputWidth?: number;
  readonly outputHeight?: number;
  readonly outputMode?: string;
  readonly effectiveFps?: number;
  readonly recordingContainer?: string;
  readonly recordDurationSeconds?: number;
  readonly testDurationSeconds?: number;
  readonly queueMaxSizeBuffers?: number;
  readonly outputDirectory?: string;
  readonly recordingActive?: boolean;
  readonly recordingOutputPath?: string;
  readonly artifactType?: string;
  readonly artifactPath?: string;
  readonly artifactSizeBytes?: number;
  readonly artifactCapturedAt?: string;
  readonly artifactMetadataSource?: string;
  readonly preflightOverallStatus?: string;
  readonly preflightOk?: boolean;
  readonly preflightPassCount?: number;
  readonly preflightWarnCount?: number;
  readonly preflightFailCount?: number;
  readonly preflightCriticalFailCount?: number;
  readonly systemIsJetson?: boolean;
  readonly jetpackVersion?: string;
  readonly l4tVersion?: string;
  readonly projectName?: string;
  readonly configPath?: string;
  readonly gstLaunchBinary?: string;
}

export interface JetsonSourceStatusCaptureEventPayload {
  readonly timestampMs: number;
  readonly eventType: "retrying" | "recovered" | "terminal_failure";
  readonly retryAttempt?: number;
  readonly eye?: StereoEye;
  readonly summary: string;
}

export interface JetsonSourceStatusPayload {
  readonly sourceState?: StereoFrameSourceState;
  readonly lastFrameId?: number;
  readonly lastTimestampMs?: number;
  readonly lastError?: string;
  readonly statusText?: string;
  readonly telemetryUpdatedAtMs?: number;
  readonly cameraTelemetry?: JetsonSourceStatusCameraTelemetryPayload;
  readonly thermalTelemetry?: JetsonSourceStatusThermalTelemetryPayload;
  readonly irIlluminatorStatus?: JetsonSourceStatusIrIlluminatorStatusPayload;
}

export interface JetsonSourceStatusThermalTelemetryPayload
  extends ThermalCapabilitySnapshot {
  readonly currentOverlayMode: ThermalOverlayMode;
  readonly lastThermalFrameId?: number;
  readonly lastThermalTimestamp?: number;
  readonly hotspotCount?: number;
  readonly paletteHint?: string;
}

export interface JetsonSourceStatusIrIlluminatorStatusPayload
  extends IrIlluminatorCapabilitySnapshot {}

/**
 * Handshake-style capabilities announcement from a Jetson sender.
 */
export interface JetsonCapabilitiesPayload {
  readonly senderName: string;
  readonly senderVersion?: string;
  readonly supportedMessageVersion: number;
  readonly supportedImagePayloadModes: readonly JetsonEyeImagePayloadMode[];
  readonly maxRecommendedPayloadBytes?: number;
  readonly stereoFormatNote?: string;
  readonly thermalAvailable: boolean;
  readonly thermalBackendIdentity?: string;
  readonly thermalFrameWidth?: number;
  readonly thermalFrameHeight?: number;
  readonly thermalFrameRate?: number;
  readonly thermalOverlaySupported: boolean;
  readonly supportedThermalOverlayModes: readonly ThermalOverlayMode[];
  readonly thermalHealthState: ThermalCapabilitySnapshot["thermalHealthState"];
  readonly thermalErrorText?: string;
  readonly irAvailable: boolean;
  readonly irBackendIdentity?: string;
  readonly irEnabled: boolean;
  readonly irLevel: number;
  readonly irMaxLevel: number;
  readonly irControlSupported: boolean;
  readonly irFaultState?: string;
  readonly irErrorText?: string;
  readonly hearingEnhancementAvailable?: boolean;
  readonly microphoneArrayAvailable?: boolean;
  readonly audioEnhancementBackendIdentity?: string;
  readonly hearingModesSupported?: readonly HearingEnhancementMode[];
  readonly hearingHealthState?: HearingEnhancementCapabilitySnapshot["hearingHealthState"];
  readonly hearingErrorText?: string;
  readonly hearingGainMin?: number;
  readonly hearingGainMax?: number;
  readonly hearingLatencyEstimateMs?: number;
  readonly phoneAudioAvailable?: boolean;
  readonly bluetoothAudioConnected?: boolean;
  readonly mediaPlaybackControlSupported?: boolean;
  readonly mediaPlaybackState?: MediaPlaybackState;
  readonly mediaVolumeMin?: number;
  readonly mediaVolumeMax?: number;
}

/**
 * External payload describing one transport-facing error condition.
 */
export interface JetsonTransportErrorPayload {
  readonly message: string;
  readonly code?: string;
  readonly stage?: "transport" | "parse" | "mapping" | "source";
  readonly recoverable?: boolean;
  readonly details?: Readonly<Record<string, StereoMetadataValue>>;
}

/**
 * External payload for remote configuration hints.
 */
export interface JetsonRemoteConfigPayload {
  readonly host?: string;
  readonly port?: number;
  readonly path?: string;
  readonly protocolType?: string;
  readonly reconnectEnabled?: boolean;
  readonly reconnectIntervalMs?: number;
  readonly streamName?: string;
  readonly maxMessageBytes?: number;
  readonly maxImagePayloadBytes?: number;
  readonly options?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Mapped source-status patch derived from an incoming status payload.
 */
export interface JetsonMappedSourceStatusPatch {
  state?: StereoFrameSourceState;
  lastFrameId?: number;
  lastTimestampMs?: number;
  lastError?: string;
  statusText?: string;
  telemetryUpdatedAtMs?: number;
  cameraTelemetry?: StereoFrameSourceCameraTelemetrySnapshot;
  thermalTelemetry?: StereoFrameSourceThermalTelemetrySnapshot;
  irIlluminatorTelemetry?: StereoFrameSourceIrIlluminatorTelemetrySnapshot;
}

/**
 * Mapped transport-status patch derived from an incoming status payload.
 */
export interface JetsonMappedTransportStatusPatch {
  readonly state?: LiveTransportAdapterState;
  readonly connected?: boolean;
  readonly statusText?: string;
  readonly lastError?: string;
  readonly lastParseError?: string;
}

/**
 * Mapped error patch derived from an incoming error payload.
 */
export interface JetsonMappedErrorPatch {
  readonly transportState?: LiveTransportAdapterState;
  readonly statusText: string;
  readonly lastError?: string;
  readonly lastParseError?: string;
  readonly sourceErrorText?: string;
}

/**
 * Maps an incoming capabilities payload into shared diagnostics state.
 */
export function mapJetsonCapabilitiesPayload(
  payload: JetsonCapabilitiesPayload,
  receivedAtMs = Date.now(),
): LiveTransportCapabilitiesSnapshot {
  const thermalCapability = createDefaultThermalCapabilitySnapshot({
    thermalAvailable: payload.thermalAvailable,
    thermalBackendIdentity: payload.thermalBackendIdentity,
    thermalFrameWidth: payload.thermalFrameWidth,
    thermalFrameHeight: payload.thermalFrameHeight,
    thermalFrameRate: payload.thermalFrameRate,
    thermalOverlaySupported: payload.thermalOverlaySupported,
    supportedThermalOverlayModes: payload.supportedThermalOverlayModes,
    thermalHealthState: payload.thermalHealthState,
    thermalErrorText: payload.thermalErrorText,
  });
  const irCapability = createDefaultIrIlluminatorCapabilitySnapshot({
    irAvailable: payload.irAvailable,
    irBackendIdentity: payload.irBackendIdentity,
    irEnabled: payload.irEnabled,
    irLevel: payload.irLevel,
    irMaxLevel: payload.irMaxLevel,
    irControlSupported: payload.irControlSupported,
    irFaultState: payload.irFaultState,
    irErrorText: payload.irErrorText,
  });
  const hearingCapability = createDefaultHearingEnhancementCapabilitySnapshot({
    hearingEnhancementAvailable: payload.hearingEnhancementAvailable ?? false,
    microphoneArrayAvailable: payload.microphoneArrayAvailable ?? false,
    audioEnhancementBackendIdentity: payload.audioEnhancementBackendIdentity,
    hearingModesSupported: payload.hearingModesSupported ?? ["off"],
    hearingHealthState: payload.hearingHealthState ?? "unavailable",
    hearingErrorText: payload.hearingErrorText,
    hearingGainMin: payload.hearingGainMin ?? 0,
    hearingGainMax: payload.hearingGainMax ?? 1,
    hearingLatencyEstimateMs: payload.hearingLatencyEstimateMs,
  });
  const phoneMediaCapability = createDefaultPhoneMediaAudioCapabilitySnapshot({
    phoneAudioAvailable: payload.phoneAudioAvailable ?? false,
    bluetoothAudioConnected: payload.bluetoothAudioConnected ?? false,
    mediaPlaybackControlSupported:
      payload.mediaPlaybackControlSupported ?? false,
    mediaPlaybackState: payload.mediaPlaybackState ?? "unavailable",
    mediaVolumeMin: payload.mediaVolumeMin ?? 0,
    mediaVolumeMax: payload.mediaVolumeMax ?? 1,
  });

  return {
    senderName: payload.senderName,
    senderVersion: payload.senderVersion,
    supportedMessageVersion: payload.supportedMessageVersion,
    supportedImagePayloadModes: payload.supportedImagePayloadModes,
    maxRecommendedPayloadBytes: payload.maxRecommendedPayloadBytes,
    stereoFormatNote: payload.stereoFormatNote,
    thermalAvailable: thermalCapability.thermalAvailable,
    thermalBackendIdentity: thermalCapability.thermalBackendIdentity,
    thermalFrameWidth: thermalCapability.thermalFrameWidth,
    thermalFrameHeight: thermalCapability.thermalFrameHeight,
    thermalFrameRate: thermalCapability.thermalFrameRate,
    thermalOverlaySupported: thermalCapability.thermalOverlaySupported,
    supportedThermalOverlayModes: thermalCapability.supportedThermalOverlayModes,
    thermalHealthState: thermalCapability.thermalHealthState,
    thermalErrorText: thermalCapability.thermalErrorText,
    irAvailable: irCapability.irAvailable,
    irBackendIdentity: irCapability.irBackendIdentity,
    irEnabled: irCapability.irEnabled,
    irLevel: irCapability.irLevel,
    irMaxLevel: irCapability.irMaxLevel,
    irControlSupported: irCapability.irControlSupported,
    irFaultState: irCapability.irFaultState,
    irErrorText: irCapability.irErrorText,
    hearingEnhancementAvailable:
      hearingCapability.hearingEnhancementAvailable,
    microphoneArrayAvailable: hearingCapability.microphoneArrayAvailable,
    audioEnhancementBackendIdentity:
      hearingCapability.audioEnhancementBackendIdentity,
    hearingModesSupported: hearingCapability.hearingModesSupported,
    hearingHealthState: hearingCapability.hearingHealthState,
    hearingErrorText: hearingCapability.hearingErrorText,
    hearingGainMin: hearingCapability.hearingGainMin,
    hearingGainMax: hearingCapability.hearingGainMax,
    hearingLatencyEstimateMs: hearingCapability.hearingLatencyEstimateMs,
    phoneAudioAvailable: phoneMediaCapability.phoneAudioAvailable,
    bluetoothAudioConnected: phoneMediaCapability.bluetoothAudioConnected,
    mediaPlaybackControlSupported:
      phoneMediaCapability.mediaPlaybackControlSupported,
    mediaPlaybackState: phoneMediaCapability.mediaPlaybackState,
    mediaVolumeMin: phoneMediaCapability.mediaVolumeMin,
    mediaVolumeMax: phoneMediaCapability.mediaVolumeMax,
    receivedAtMs,
  };
}

/**
 * Maps one protocol-facing Jetson frame payload into the internal stereo frame.
 */
export function mapJetsonFramePayloadToStereoFrame(
  payload: JetsonStereoFramePayload,
): StereoFrame {
  const frameId = requireFiniteNumber(payload.frameId, "frameId");
  const timestampMs =
    typeof payload.timestampMs === "number"
      ? requireFiniteNumber(payload.timestampMs, "timestampMs")
      : Date.now();

  return {
    frameId,
    timestampMs,
    source: "live",
    metadata: {
      sourceId: payload.sourceId,
      sceneId: payload.sceneId,
      streamName: payload.streamName,
      tags: payload.tags,
      extras: payload.extras,
    },
    overlay: payload.overlay ? mapJetsonOverlayPayload(payload.overlay) : undefined,
    thermalFrame: payload.thermalFrame
      ? mapJetsonThermalFramePayload(payload.thermalFrame)
      : undefined,
    thermalOverlayMode: payload.thermalOverlayMode,
    left: mapJetsonEyeFramePayload(payload.left, "left"),
    right: mapJetsonEyeFramePayload(payload.right, "right"),
  };
}

/**
 * Maps an incoming transport-status payload into an internal transport patch.
 */
export function mapJetsonTransportStatusPayload(
  payload: JetsonTransportStatusPayload,
  currentTransportStatus: LiveTransportStatusSnapshot,
): JetsonMappedTransportStatusPatch {
  const transportStatusPatch: JetsonMappedTransportStatusPatch = {
    state: payload.transportState ?? currentTransportStatus.state,
    connected: payload.connected ?? currentTransportStatus.connected,
    statusText:
      payload.statusText ??
      createDefaultTransportStatusText(
        payload.transportState ?? currentTransportStatus.state,
        payload.connected ?? currentTransportStatus.connected,
      ),
    ...(payload.lastError !== undefined || payload.transportState === "running"
      ? { lastError: payload.lastError }
      : {}),
    ...(payload.parseErrorText !== undefined || payload.transportState === "running"
      ? { lastParseError: payload.parseErrorText }
      : {}),
  };

  return transportStatusPatch;
}

/**
 * Maps an incoming source-status payload into an internal source patch.
 */
export function mapJetsonSourceStatusPayload(
  payload: JetsonSourceStatusPayload,
): JetsonMappedSourceStatusPatch {
  const sourceStatusPatch: JetsonMappedSourceStatusPatch = {};
  if (payload.sourceState !== undefined) {
    sourceStatusPatch.state = payload.sourceState;
  }
  if (payload.lastFrameId !== undefined) {
    sourceStatusPatch.lastFrameId = payload.lastFrameId;
  }
  if (payload.lastTimestampMs !== undefined) {
    sourceStatusPatch.lastTimestampMs = payload.lastTimestampMs;
  }
  if (payload.lastError !== undefined || payload.sourceState === "running") {
    sourceStatusPatch.lastError = payload.lastError;
  }
  if (payload.statusText !== undefined) {
    sourceStatusPatch.statusText = payload.statusText;
  }
  if (payload.telemetryUpdatedAtMs !== undefined) {
    sourceStatusPatch.telemetryUpdatedAtMs = payload.telemetryUpdatedAtMs;
  }
  if (payload.cameraTelemetry !== undefined) {
    sourceStatusPatch.cameraTelemetry = mapJetsonSourceStatusCameraTelemetryPayload(
      payload.cameraTelemetry,
    );
  }
  if (payload.thermalTelemetry !== undefined) {
    sourceStatusPatch.thermalTelemetry = mapJetsonSourceStatusThermalTelemetryPayload(
      payload.thermalTelemetry,
    );
  }
  if (payload.irIlluminatorStatus !== undefined) {
    sourceStatusPatch.irIlluminatorTelemetry =
      mapJetsonSourceStatusIrIlluminatorStatusPayload(
        payload.irIlluminatorStatus,
      );
  }

  return sourceStatusPatch;
}

function mapJetsonSourceStatusCameraTelemetryPayload(
  payload: JetsonSourceStatusCameraTelemetryPayload,
): StereoFrameSourceCameraTelemetrySnapshot {
  return {
    captureBackendName: payload.captureBackendName,
    bridgeMode: payload.bridgeMode,
    startupValidated: payload.startupValidated,
    frameWidth: payload.frameWidth,
    frameHeight: payload.frameHeight,
    frameIntervalMs: payload.frameIntervalMs,
    frameSourceMode: payload.frameSourceMode,
    frameSourceName: payload.frameSourceName,
    capturesAttempted: payload.capturesAttempted,
    capturesSucceeded: payload.capturesSucceeded,
    capturesFailed: payload.capturesFailed,
    consecutiveFailureCount: payload.consecutiveFailureCount,
    lastSuccessfulCaptureTime: payload.lastSuccessfulCaptureTime,
    lastCaptureDurationMs: payload.lastCaptureDurationMs,
    averageCaptureDurationMs: payload.averageCaptureDurationMs,
    effectiveFrameIntervalMs: payload.effectiveFrameIntervalMs,
    leftCameraDevice: payload.leftCameraDevice,
    rightCameraDevice: payload.rightCameraDevice,
    gstLaunchPath: payload.gstLaunchPath,
    captureHealthState: payload.captureHealthState,
    captureRetryCount: payload.captureRetryCount,
    captureRetryDelayMs: payload.captureRetryDelayMs,
    recentRetryAttempts: payload.recentRetryAttempts,
    currentRetryAttempt: payload.currentRetryAttempt,
    transientFailureCount: payload.transientFailureCount,
    recoveryCount: payload.recoveryCount,
    lastRecoveryTime: payload.lastRecoveryTime,
    lastTerminalFailureTime: payload.lastTerminalFailureTime,
    recentCaptureEvents: payload.recentCaptureEvents?.map((event) => {
      return mapJetsonSourceStatusCaptureEventPayload(event);
    }),
    replaySourceIdentity: payload.replaySourceIdentity,
    replayLoopEnabled: payload.replayLoopEnabled,
    replayCurrentIndex: payload.replayCurrentIndex,
    replayFrameCount: payload.replayFrameCount,
    replayLeftSource: payload.replayLeftSource,
    replayRightSource: payload.replayRightSource,
    replayTimingMode: payload.replayTimingMode,
    replayTimeScale: payload.replayTimeScale,
    replayManifestLoaded: payload.replayManifestLoaded,
    replayManifestValidated: payload.replayManifestValidated,
    replayManifestErrorCount: payload.replayManifestErrorCount,
    replayManifestWarningCount: payload.replayManifestWarningCount,
    replayManifestSource: payload.replayManifestSource,
    replayValidationSummary: payload.replayValidationSummary,
    replayRecordedTimestamp: payload.replayRecordedTimestamp,
    replayDelayUntilNextMs: payload.replayDelayUntilNextMs,
    replayScaledDelayUntilNextMs: payload.replayScaledDelayUntilNextMs,
    replayTimingOffsetMs: payload.replayTimingOffsetMs,
    replayNominalLoopDurationMs: payload.replayNominalLoopDurationMs,
    replayScaledLoopDurationMs: payload.replayScaledLoopDurationMs,
    runtimeProfileName: payload.runtimeProfileName,
    runtimeProfileType: payload.runtimeProfileType,
    runtimeProfileDescription: payload.runtimeProfileDescription,
    defaultProfileName: payload.defaultProfileName,
    availableProfileNames: payload.availableProfileNames,
    leftSensorId: payload.leftSensorId,
    rightSensorId: payload.rightSensorId,
    inputWidth: payload.inputWidth,
    inputHeight: payload.inputHeight,
    outputWidth: payload.outputWidth,
    outputHeight: payload.outputHeight,
    outputMode: payload.outputMode,
    effectiveFps: payload.effectiveFps,
    recordingContainer: payload.recordingContainer,
    recordDurationSeconds: payload.recordDurationSeconds,
    testDurationSeconds: payload.testDurationSeconds,
    queueMaxSizeBuffers: payload.queueMaxSizeBuffers,
    outputDirectory: payload.outputDirectory,
    recordingActive: payload.recordingActive,
    recordingOutputPath: payload.recordingOutputPath,
    artifactType: payload.artifactType,
    artifactPath: payload.artifactPath,
    artifactSizeBytes: payload.artifactSizeBytes,
    artifactCapturedAt: payload.artifactCapturedAt,
    artifactMetadataSource: payload.artifactMetadataSource,
    preflightOverallStatus: payload.preflightOverallStatus,
    preflightOk: payload.preflightOk,
    preflightPassCount: payload.preflightPassCount,
    preflightWarnCount: payload.preflightWarnCount,
    preflightFailCount: payload.preflightFailCount,
    preflightCriticalFailCount: payload.preflightCriticalFailCount,
    systemIsJetson: payload.systemIsJetson,
    jetpackVersion: payload.jetpackVersion,
    l4tVersion: payload.l4tVersion,
    projectName: payload.projectName,
    configPath: payload.configPath,
    gstLaunchBinary: payload.gstLaunchBinary,
  };
}

function mapJetsonSourceStatusThermalTelemetryPayload(
  payload: JetsonSourceStatusThermalTelemetryPayload,
): StereoFrameSourceThermalTelemetrySnapshot {
  const capabilitySnapshot = createDefaultThermalCapabilitySnapshot({
    thermalAvailable: payload.thermalAvailable,
    thermalBackendIdentity: payload.thermalBackendIdentity,
    thermalFrameWidth: payload.thermalFrameWidth,
    thermalFrameHeight: payload.thermalFrameHeight,
    thermalFrameRate: payload.thermalFrameRate,
    thermalOverlaySupported: payload.thermalOverlaySupported,
    supportedThermalOverlayModes: payload.supportedThermalOverlayModes,
    thermalHealthState: payload.thermalHealthState,
    thermalErrorText: payload.thermalErrorText,
  });

  return {
    ...capabilitySnapshot,
    currentOverlayMode: payload.currentOverlayMode,
    lastThermalFrameId: payload.lastThermalFrameId,
    lastThermalTimestampMs: payload.lastThermalTimestamp,
    hotspotCount: payload.hotspotCount,
    paletteHint: payload.paletteHint,
  };
}

function mapJetsonSourceStatusIrIlluminatorStatusPayload(
  payload: JetsonSourceStatusIrIlluminatorStatusPayload,
): StereoFrameSourceIrIlluminatorTelemetrySnapshot {
  return createDefaultIrIlluminatorCapabilitySnapshot({
    irAvailable: payload.irAvailable,
    irBackendIdentity: payload.irBackendIdentity,
    irEnabled: payload.irEnabled,
    irLevel: payload.irLevel,
    irMaxLevel: payload.irMaxLevel,
    irControlSupported: payload.irControlSupported,
    irFaultState: payload.irFaultState,
    irErrorText: payload.irErrorText,
  });
}

function mapJetsonSourceStatusCaptureEventPayload(
  payload: JetsonSourceStatusCaptureEventPayload,
): StereoFrameSourceCaptureEventSnapshot {
  return {
    timestampMs: payload.timestampMs,
    eventType: payload.eventType,
    retryAttempt: payload.retryAttempt,
    eye: payload.eye,
    summary: payload.summary,
  };
}

/**
 * Maps an incoming Jetson error payload into transport/source error fields.
 */
export function mapJetsonErrorPayload(
  payload: JetsonTransportErrorPayload,
): JetsonMappedErrorPatch {
  const stage = payload.stage ?? "transport";
  const codePrefix = payload.code ? `${payload.code}: ` : "";
  const message = `${codePrefix}${payload.message}`;

  if (stage === "parse") {
    return {
      transportState: payload.recoverable ? "running" : "error",
      statusText: "Jetson protocol parse/validation error.",
      lastError: payload.recoverable ? undefined : message,
      lastParseError: message,
    };
  }

  if (stage === "mapping") {
    return {
      transportState: payload.recoverable ? "running" : "error",
      statusText: "Jetson payload mapping error.",
      lastError: message,
      lastParseError: undefined,
    };
  }

  if (stage === "source") {
    return {
      transportState: payload.recoverable ? "running" : "error",
      statusText: "Jetson source error reported.",
      lastError: payload.recoverable ? undefined : message,
      sourceErrorText: message,
    };
  }

  return {
    transportState: payload.recoverable ? "reconnecting" : "error",
    statusText: "Jetson transport error reported.",
    lastError: message,
  };
}

/**
 * Maps a remote configuration payload into the shared transport-config shape.
 */
export function mapJetsonRemoteConfigPayload(
  payload: JetsonRemoteConfigPayload,
): Partial<LiveTransportConfig> {
  const config: MutableTransportConfigPatch = {};

  if (payload.host !== undefined) {
    config.host = payload.host;
  }
  if (payload.port !== undefined) {
    config.port = payload.port;
  }
  if (payload.path !== undefined) {
    config.path = payload.path;
  }
  if (payload.protocolType !== undefined) {
    config.protocolType = payload.protocolType;
  }
  if (payload.reconnectEnabled !== undefined) {
    config.reconnectEnabled = payload.reconnectEnabled;
  }
  if (payload.reconnectIntervalMs !== undefined) {
    config.reconnectIntervalMs = payload.reconnectIntervalMs;
  }
  if (payload.streamName !== undefined) {
    config.streamName = payload.streamName;
  }
  if (payload.maxMessageBytes !== undefined) {
    config.maxMessageBytes = payload.maxMessageBytes;
  }
  if (payload.maxImagePayloadBytes !== undefined) {
    config.maxImagePayloadBytes = payload.maxImagePayloadBytes;
  }
  if (payload.options !== undefined) {
    config.options = payload.options;
  }

  return config;
}

/**
 * Creates one sample capabilities announcement for local seam testing.
 */
export function createSampleJetsonCapabilitiesPayload(
  senderName = "jetson_stub_sender",
  streamName = "jetson_stub",
): JetsonCapabilitiesPayload {
  return {
    senderName,
    senderVersion: "0.1.0-dev",
    supportedMessageVersion: 1,
    supportedImagePayloadModes: [
      "data_url",
      "base64",
      "image_url",
      "binary_frame",
    ],
    maxRecommendedPayloadBytes: 256 * 1024,
    stereoFormatNote: `Stereo side-by-side proof-of-life for ${streamName}.`,
    thermalAvailable: false,
    thermalOverlaySupported: false,
    supportedThermalOverlayModes: ["thermal_fusion_envg"],
    thermalHealthState: "unavailable",
    irAvailable: false,
    irEnabled: false,
    irLevel: 0,
    irMaxLevel: 0,
    irControlSupported: false,
    hearingEnhancementAvailable: false,
    microphoneArrayAvailable: false,
    hearingModesSupported: ["off"],
    hearingHealthState: "unavailable",
    hearingGainMin: 0,
    hearingGainMax: 1,
    phoneAudioAvailable: false,
    bluetoothAudioConnected: false,
    mediaPlaybackControlSupported: false,
    mediaPlaybackState: "unavailable",
    mediaVolumeMin: 0,
    mediaVolumeMax: 1,
  };
}

/**
 * Creates one sample Jetson-style payload for local seam testing.
 */
export function createSampleJetsonStereoFramePayload(
  frameId: number,
  streamName = "jetson_stub",
): JetsonStereoFramePayload {
  return {
    frameId,
    timestampMs: Date.now(),
    sourceId: "jetson-stub-ingress",
    sceneId: "jetson_stub_scene",
    streamName,
    tags: ["jetson", "stub", "sample-ingress"],
    extras: {
      exposureMs: 12,
      remoteGain: 0.84,
    },
    overlay: {
      label: `Jetson Overlay ${frameId.toString().padStart(4, "0")}`,
      annotations: [
        {
          id: "jetson-crosshair",
          kind: "crosshair",
          normalizedX: 0.5,
          normalizedY: 0.5,
        },
        {
          id: "jetson-text",
          kind: "text",
          normalizedX: 0.18,
          normalizedY: 0.18,
          label: `JETSON ${frameId}`,
        },
      ],
    },
    left: {
      eye: "left",
      width: 1920,
      height: 1080,
      format: "image",
      contentLabel: `${streamName}:left`,
      title: "Jetson Stub Frame",
      markerText: `JETSON F${frameId.toString().padStart(4, "0")}`,
      backgroundHex: "#13315c",
      accentHex: "#8cc8ff",
      image: {
        dataUrl: createSampleEyeImageDataUrl("left", frameId, streamName),
      },
    },
    right: {
      eye: "right",
      width: 1920,
      height: 1080,
      format: "image",
      contentLabel: `${streamName}:right`,
      title: "Jetson Stub Frame",
      markerText: `JETSON F${frameId.toString().padStart(4, "0")}`,
      backgroundHex: "#3b1b54",
      accentHex: "#d1a6ff",
      image: {
        dataUrl: createSampleEyeImageDataUrl("right", frameId, streamName),
      },
    },
  };
}

function mapJetsonEyeFramePayload(
  payload: JetsonEyeFramePayload,
  expectedEye: StereoEye,
): StereoEyeFrame {
  if (payload.eye !== expectedEye) {
    throw new Error(
      `Expected ${expectedEye} eye payload but received ${payload.eye}.`,
    );
  }

  const width = requireFiniteNumber(payload.width, `${expectedEye}.width`);
  const height = requireFiniteNumber(payload.height, `${expectedEye}.height`);
  const imageContent = mapJetsonEyeImagePayload(payload.image);
  const format = imageContent ? "image" : mapFrameFormat(payload.format);
  const markerText = payload.markerText ?? `${expectedEye.toUpperCase()} EYE`;

  return {
    eye: payload.eye,
    width,
    height,
    format,
    contentLabel: payload.contentLabel,
    imageContent,
    metadata: payload.metadata,
    debugPattern: {
      eyeLabel: `${expectedEye.toUpperCase()} EYE`,
      title: payload.title ?? "Jetson Incoming Frame",
      backgroundHex:
        payload.backgroundHex ?? (expectedEye === "left" ? "#143958" : "#4a2746"),
      accentHex:
        payload.accentHex ?? (expectedEye === "left" ? "#77d9ff" : "#f2c0ff"),
      markerText,
    },
  };
}

function mapJetsonOverlayPayload(
  payload: JetsonOverlayPayload,
): StereoOverlayPayload {
  return {
    label: payload.label,
    annotations: payload.annotations?.map((annotation) => ({
      id: annotation.id,
      kind: annotation.kind,
      normalizedX: annotation.normalizedX,
      normalizedY: annotation.normalizedY,
      label: annotation.label,
    })),
  };
}

function mapJetsonThermalFramePayload(
  payload: JetsonThermalFramePayload,
): ThermalFrame {
  const width = requireFiniteNumber(payload.width, "thermalFrame.width");
  const height = requireFiniteNumber(payload.height, "thermalFrame.height");
  const thermalValues = payload.thermalValues.map((value, index) => {
    return requireFiniteNumber(value, `thermalFrame.thermalValues[${index}]`);
  });
  if (thermalValues.length !== width * height) {
    throw new Error(
      `thermalFrame.thermalValues must contain ${width * height} entries.`,
    );
  }

  return {
    frameId: requireFiniteNumber(payload.frameId, "thermalFrame.frameId"),
    timestampMs: requireFiniteNumber(
      payload.timestamp,
      "thermalFrame.timestamp",
    ),
    width,
    height,
    thermalValues,
    minTemperature: requireFiniteNumber(
      payload.minTemperature,
      "thermalFrame.minTemperature",
    ),
    maxTemperature: requireFiniteNumber(
      payload.maxTemperature,
      "thermalFrame.maxTemperature",
    ),
    hotspotAnnotations: payload.hotspotAnnotations?.map((annotation) => {
      return mapJetsonThermalHotspotAnnotationPayload(annotation);
    }),
    paletteHint: payload.paletteHint,
  };
}

function mapJetsonThermalHotspotAnnotationPayload(
  payload: JetsonThermalHotspotAnnotationPayload,
): ThermalHotspotAnnotation {
  return {
    id: payload.id,
    label: payload.label,
    normalizedX: payload.normalizedX,
    normalizedY: payload.normalizedY,
    normalizedRadius: payload.normalizedRadius,
    normalizedBoxWidth: payload.normalizedBoxWidth,
    normalizedBoxHeight: payload.normalizedBoxHeight,
    temperatureC: payload.temperatureC,
    intensityNormalized: payload.intensityNormalized,
  };
}

function mapFrameFormat(value: string | undefined): StereoFrameFormat {
  if (
    value === "placeholder" ||
    value === "image" ||
    value === "rgba8" ||
    value === "yuv"
  ) {
    return value;
  }

  if (!value) {
    return "unknown";
  }

  return "unknown";
}

function mapJetsonEyeImagePayload(
  payload: JetsonEyeImagePayload | undefined,
): StereoEyeImageContent | undefined {
  if (!payload) {
    return undefined;
  }

  if (payload.dataUrl && isSupportedImageDataUrl(payload.dataUrl)) {
    return {
      sourceKind: "data_url",
      src: payload.dataUrl,
      mimeType: extractMimeTypeFromDataUrl(payload.dataUrl),
    };
  }

  if (
    payload.base64Data &&
    payload.mimeType &&
    isSupportedImageMimeType(payload.mimeType)
  ) {
    return {
      sourceKind: "base64",
      src: `data:${payload.mimeType};base64,${payload.base64Data}`,
      mimeType: payload.mimeType,
    };
  }

  if (payload.imageUrl && isSupportedImageUrl(payload.imageUrl)) {
    return {
      sourceKind: "uri",
      src: payload.imageUrl,
      mimeType: payload.mimeType,
    };
  }

  return undefined;
}

function createDefaultTransportStatusText(
  state: LiveTransportAdapterState,
  connected: boolean,
): string {
  if (state === "running") {
    return connected
      ? "Jetson WebSocket transport receiving external ingress."
      : "Jetson WebSocket transport running without confirmed link.";
  }

  if (state === "connecting" || state === "reconnecting") {
    return "Jetson WebSocket transport waiting for remote ingress status.";
  }

  if (state === "starting") {
    return "Jetson WebSocket transport starting.";
  }

  if (state === "stopped") {
    return "Jetson WebSocket transport stopped.";
  }

  if (state === "error") {
    return "Jetson WebSocket transport entered an error state.";
  }

  return "Jetson WebSocket transport idle.";
}

function requireFiniteNumber(value: number, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }

  return value;
}

function createSampleEyeImageDataUrl(
  eye: StereoEye,
  frameId: number,
  streamName: string,
): string {
  const backgroundA = eye === "left" ? "#0f3b63" : "#4b1d59";
  const backgroundB = eye === "left" ? "#1f74a9" : "#8d43b2";
  const accent = eye === "left" ? "#9ee6ff" : "#f0c8ff";
  const label = eye === "left" ? "LEFT" : "RIGHT";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${backgroundA}" />
          <stop offset="100%" stop-color="${backgroundB}" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)" />
      <circle cx="${eye === "left" ? 180 : 460}" cy="130" r="80" fill="rgba(255,255,255,0.14)" />
      <rect x="88" y="228" width="464" height="54" rx="14" fill="rgba(0,0,0,0.24)" />
      <text x="320" y="94" text-anchor="middle" fill="${accent}" font-size="34" font-family="Segoe UI, Arial, sans-serif" font-weight="700">
        ${streamName.toUpperCase()}
      </text>
      <text x="320" y="162" text-anchor="middle" fill="#ffffff" font-size="92" font-family="Segoe UI, Arial, sans-serif" font-weight="800">
        ${label}
      </text>
      <text x="320" y="262" text-anchor="middle" fill="#ffffff" font-size="24" font-family="Segoe UI, Arial, sans-serif">
        Frame ${frameId.toString().padStart(4, "0")}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isSupportedImageDataUrl(dataUrl: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;?/i.test(dataUrl);
}

function extractMimeTypeFromDataUrl(dataUrl: string): string | undefined {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+)[;,]/i);
  return match?.[1];
}

function isSupportedImageMimeType(mimeType: string): boolean {
  return /^image\/[a-zA-Z0-9.+-]+$/i.test(mimeType);
}

function isSupportedImageUrl(imageUrl: string): boolean {
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(imageUrl);
}

type MutableTransportConfigPatch = {
  -readonly [K in keyof LiveTransportConfig]?: LiveTransportConfig[K];
};
