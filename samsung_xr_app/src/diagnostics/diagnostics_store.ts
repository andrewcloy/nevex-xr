import type { Unsubscribe } from "../hand_input/contracts";
import type { StereoFrame, StereoFrameMetadata } from "../stereo_viewer/frame_models";
import type {
  StereoFrameSourceCaptureEventSnapshot,
  StereoFrameSourceIrIlluminatorTelemetrySnapshot,
  StereoFrameSourceState,
  StereoFrameSourceStatusSnapshot,
  StereoFrameSourceThermalTelemetrySnapshot,
} from "../stereo_viewer/frame_source";
import type {
  HearingEnhancementCapabilitySnapshot,
  HearingEnhancementMode,
  PhoneMediaAudioCapabilitySnapshot,
} from "../stereo_viewer/audio_models";
import {
  createDefaultHearingEnhancementCapabilitySnapshot,
  createDefaultPhoneMediaAudioCapabilitySnapshot,
} from "../stereo_viewer/audio_models";
import type {
  LiveTransportAdapterType,
  LiveTransportAdapterState,
  LiveTransportCapabilitiesSnapshot,
  LiveTransportConfig,
  LiveTransportSequenceHealthSnapshot,
} from "../stereo_viewer/transport_adapter";
import {
  createDefaultIrIlluminatorCapabilitySnapshot,
  createDefaultThermalCapabilitySnapshot,
  DEFAULT_THERMAL_OVERLAY_MODE,
  type IrIlluminatorCapabilitySnapshot,
  type ThermalCapabilitySnapshot,
  type ThermalOverlayMode,
} from "../stereo_viewer/thermal_models";
import type { ViewerSurfaceSnapshot } from "../stereo_viewer/viewer_surface";
import {
  SettingsStore,
  type SourceMode,
  type XrAppSettingsState,
} from "../settings_state/settings_store";

export interface CameraTelemetrySnapshot {
  readonly captureBackendName?: string;
  readonly frameSourceMode?: string;
  readonly frameSourceName?: string;
  readonly bridgeMode?: string;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly frameIntervalMs?: number;
  readonly fallbackActive?: boolean;
  readonly fallbackReason?: string;
  readonly startupValidated?: boolean;
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
  readonly recentCaptureEvents?: readonly StereoFrameSourceCaptureEventSnapshot[];
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
  readonly replayFrameId?: number;
  readonly replayLabel?: string;
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
  readonly telemetryUpdatedAtMs?: number;
  readonly telemetryCurrent?: boolean;
  readonly telemetryStaleThresholdMs?: number;
}

export interface ThermalTelemetrySnapshot extends ThermalCapabilitySnapshot {
  readonly currentOverlayMode: ThermalOverlayMode;
  readonly lastThermalFrameId?: number;
  readonly lastThermalTimestampMs?: number;
  readonly hotspotCount?: number;
  readonly paletteHint?: string;
}

export interface IrIlluminatorTelemetrySnapshot
  extends IrIlluminatorCapabilitySnapshot {}

export interface HearingEnhancementTelemetrySnapshot
  extends HearingEnhancementCapabilitySnapshot {
  readonly currentMode: HearingEnhancementMode;
  readonly currentGain: number;
}

export interface PhoneMediaAudioTelemetrySnapshot
  extends PhoneMediaAudioCapabilitySnapshot {
  readonly currentVolume: number;
  readonly mediaMuted: boolean;
}

export type SourceHealthState =
  | "pending"
  | "healthy"
  | "retrying"
  | "degraded"
  | "terminal_failure"
  | "telemetry_stale";

/**
 * Diagnostics snapshot prepared for readouts and overlays.
 */
export interface DiagnosticsSnapshot {
  readonly appRunning: boolean;
  readonly sourceMode: SourceMode;
  readonly isConnected: boolean;
  readonly connectionStatusText: string;
  readonly sourceDisplayName?: string;
  readonly sourceLifecycleState?: StereoFrameSourceState;
  readonly sourceConnectionStatusText: string;
  readonly sourceLastFrameId?: number;
  readonly sourceLastFrameTimestampMs?: number;
  readonly sourceSceneId?: string;
  readonly sourceStreamName?: string;
  readonly sourceErrorText?: string;
  readonly sourceStatusText?: string;
  readonly sourceHealthState: SourceHealthState;
  readonly sourceHealthText: string;
  readonly transportAdapterType: LiveTransportAdapterType;
  readonly transportAdapterDisplayName: string;
  readonly transportStatusState: LiveTransportAdapterState;
  readonly transportConnected: boolean;
  readonly transportConnectionStatusText: string;
  readonly transportStatusText: string;
  readonly transportErrorText?: string;
  readonly transportParseErrorText?: string;
  readonly transportLastMessageType?: string;
  readonly transportLastSequence?: number;
  readonly transportLastMessageTimestampMs?: number;
  readonly transportLastMessageSizeBytes?: number;
  readonly transportSequenceHealth: LiveTransportSequenceHealthSnapshot;
  readonly transportCapabilities?: LiveTransportCapabilitiesSnapshot;
  readonly senderName?: string;
  readonly transportConfig: LiveTransportConfig;
  readonly cameraTelemetry?: CameraTelemetrySnapshot;
  readonly thermalTelemetry: ThermalTelemetrySnapshot;
  readonly irIlluminatorTelemetry: IrIlluminatorTelemetrySnapshot;
  readonly hearingEnhancementTelemetry: HearingEnhancementTelemetrySnapshot;
  readonly phoneMediaAudioTelemetry: PhoneMediaAudioTelemetrySnapshot;
  readonly statusText: string;
  readonly renderStatusText: string;
  readonly fpsEstimate: number;
  readonly viewerSource: ViewerSurfaceSnapshot["source"];
  readonly viewerInitialized: boolean;
}

export interface DiagnosticsStoreOptions {
  readonly nowFn?: () => number;
  readonly staleThresholdMs?: number;
  readonly pollIntervalMs?: number;
  readonly setIntervalFn?: typeof setInterval;
  readonly clearIntervalFn?: typeof clearInterval;
}

const DEFAULT_SOURCE_TELEMETRY_STALE_THRESHOLD_MS = 3000;
const DEFAULT_DIAGNOSTICS_POLL_INTERVAL_MS = 250;

/**
 * Listener invoked when diagnostics state changes.
 */
export type DiagnosticsListener = (snapshot: DiagnosticsSnapshot) => void;

/**
 * Central diagnostics read-model for the mock-first XR app scaffold.
 *
 * The store derives high-level health text from the settings store and consumes
 * viewer updates to maintain placeholder render diagnostics.
 */
export class DiagnosticsStore {
  private snapshot: DiagnosticsSnapshot;

  private readonly listeners = new Set<DiagnosticsListener>();

  private readonly settingsUnsubscribe: Unsubscribe;

  private readonly nowFn: () => number;

  private readonly staleThresholdMs: number;

  private readonly setIntervalFn: typeof setInterval;

  private readonly clearIntervalFn: typeof clearInterval;

  private readonly telemetryFreshnessTimer: ReturnType<typeof setInterval>;

  private lastFrameTimestampMs?: number;

  constructor(
    private readonly settingsStore: SettingsStore,
    options: DiagnosticsStoreOptions = {},
  ) {
    this.nowFn = options.nowFn ?? Date.now;
    this.staleThresholdMs =
      options.staleThresholdMs ?? DEFAULT_SOURCE_TELEMETRY_STALE_THRESHOLD_MS;
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    this.snapshot = createSnapshotFromSettings(settingsStore.getSnapshot());
    this.settingsUnsubscribe = this.settingsStore.subscribe((settings) => {
      this.handleSettingsSnapshot(settings);
    });
    this.telemetryFreshnessTimer = this.setIntervalFn(() => {
      this.refreshTelemetryFreshness();
    }, options.pollIntervalMs ?? DEFAULT_DIAGNOSTICS_POLL_INTERVAL_MS);
  }

  getSnapshot(): DiagnosticsSnapshot {
    return this.snapshot;
  }

  subscribe(listener: DiagnosticsListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Records the latest viewer state and derives placeholder render diagnostics.
   */
  recordViewerSnapshot(viewerSnapshot: ViewerSurfaceSnapshot): void {
    const frameTimestampMs = viewerSnapshot.currentFrame?.timestampMs;
    const nextFpsEstimate = estimateFps(
      this.lastFrameTimestampMs,
      frameTimestampMs,
      this.snapshot.fpsEstimate,
    );

    this.lastFrameTimestampMs = frameTimestampMs;

    const cameraTelemetry = extractCameraTelemetry(
      viewerSnapshot.frameSourceStatus,
      viewerSnapshot.currentFrame?.metadata,
      this.nowFn(),
      this.staleThresholdMs,
    );
    const settings = this.settingsStore.getSnapshot();
    const thermalTelemetry = extractThermalTelemetry(
      viewerSnapshot.frameSourceStatus,
      viewerSnapshot.currentFrame,
      settings.liveTransportCapabilities,
      this.snapshot.thermalTelemetry.currentOverlayMode,
    );
    const irIlluminatorTelemetry = extractIrIlluminatorTelemetry(
      viewerSnapshot.frameSourceStatus,
      settings.liveTransportCapabilities,
    );
    const hearingEnhancementTelemetry =
      mergeHearingEnhancementTelemetryWithCapabilities(
        settings.liveTransportCapabilities,
        settings.hearingMode,
        settings.hearingGain,
      );
    const phoneMediaAudioTelemetry =
      mergePhoneMediaAudioTelemetryWithCapabilities(
        settings.liveTransportCapabilities,
        settings.mediaVolume,
        settings.mediaMuted,
      );
    const sourceHealthState = deriveSourceHealthState(
      viewerSnapshot.frameSourceStatus?.state,
      cameraTelemetry,
    );

    this.snapshot = {
      ...this.snapshot,
      viewerSource: viewerSnapshot.source,
      viewerInitialized: viewerSnapshot.initialized,
      sourceDisplayName: viewerSnapshot.frameSourceStatus?.info.displayName,
      sourceLifecycleState: viewerSnapshot.frameSourceStatus?.state,
      sourceConnectionStatusText: mapSourceConnectionStatusText(
        viewerSnapshot.frameSourceStatus?.state,
      ),
      sourceLastFrameId: viewerSnapshot.frameSourceStatus?.lastFrameId,
      sourceLastFrameTimestampMs: viewerSnapshot.frameSourceStatus?.lastTimestampMs,
      sourceSceneId:
        viewerSnapshot.source === "none" &&
        viewerSnapshot.currentFrame === undefined &&
        viewerSnapshot.activeSceneId === undefined
          ? undefined
          : viewerSnapshot.activeSceneId ??
            viewerSnapshot.currentFrame?.metadata?.sceneId ??
            this.snapshot.sourceSceneId,
      sourceStreamName:
        viewerSnapshot.source === "none" && viewerSnapshot.currentFrame === undefined
          ? undefined
          : viewerSnapshot.currentFrame?.metadata?.streamName ??
            this.snapshot.sourceStreamName,
      sourceErrorText: viewerSnapshot.frameSourceStatus?.lastError,
      sourceStatusText: viewerSnapshot.frameSourceStatus?.statusText,
      sourceHealthState,
      sourceHealthText: formatSourceHealthText(sourceHealthState),
      cameraTelemetry,
      thermalTelemetry,
      irIlluminatorTelemetry,
      hearingEnhancementTelemetry,
      phoneMediaAudioTelemetry,
      renderStatusText: viewerSnapshot.renderStatusText,
      fpsEstimate: nextFpsEstimate,
    };
    this.emit();
  }

  dispose(): void {
    this.settingsUnsubscribe();
    this.clearIntervalFn(this.telemetryFreshnessTimer);
    this.listeners.clear();
  }

  private handleSettingsSnapshot(settings: XrAppSettingsState): void {
    const thermalTelemetry = mergeThermalTelemetryWithCapabilities(
      this.snapshot.thermalTelemetry,
      settings.liveTransportCapabilities,
      this.snapshot.thermalTelemetry.currentOverlayMode,
    );
    const irIlluminatorTelemetry = mergeIrIlluminatorTelemetryWithCapabilities(
      this.snapshot.irIlluminatorTelemetry,
      settings.liveTransportCapabilities,
    );
    const hearingEnhancementTelemetry =
      mergeHearingEnhancementTelemetryWithCapabilities(
        settings.liveTransportCapabilities,
        settings.hearingMode,
        settings.hearingGain,
      );
    const phoneMediaAudioTelemetry =
      mergePhoneMediaAudioTelemetryWithCapabilities(
        settings.liveTransportCapabilities,
        settings.mediaVolume,
        settings.mediaMuted,
      );

    this.snapshot = {
      ...this.snapshot,
      appRunning: settings.appRunning,
      sourceMode: settings.sourceMode,
      isConnected: settings.isConnected,
      connectionStatusText: settings.isConnected ? "Connected" : "Disconnected",
      transportAdapterType: settings.liveTransportAdapterType,
      transportAdapterDisplayName: settings.liveTransportAdapterDisplayName,
      transportStatusState: settings.liveTransportStatusState,
      transportConnected: settings.liveTransportConnected,
      transportConnectionStatusText: mapTransportConnectionStatusText(
        settings.liveTransportStatusState,
        settings.liveTransportConnected,
      ),
      transportStatusText: settings.liveTransportStatusText,
      transportErrorText: settings.liveTransportErrorText,
      transportParseErrorText: settings.liveTransportParseErrorText,
      transportLastMessageType: settings.liveTransportLastMessageType,
      transportLastSequence: settings.liveTransportLastSequence,
      transportLastMessageTimestampMs: settings.liveTransportLastMessageTimestampMs,
      transportLastMessageSizeBytes: settings.liveTransportLastMessageSizeBytes,
      transportSequenceHealth: settings.liveTransportSequenceHealth,
      transportCapabilities: settings.liveTransportCapabilities,
      senderName: settings.liveTransportCapabilities?.senderName,
      transportConfig: settings.liveTransportConfig,
      thermalTelemetry,
      irIlluminatorTelemetry,
      hearingEnhancementTelemetry,
      phoneMediaAudioTelemetry,
      statusText: settings.statusText,
      renderStatusText: this.snapshot.renderStatusText,
      fpsEstimate: this.snapshot.fpsEstimate,
    };
    this.emit();
  }

  private refreshTelemetryFreshness(): void {
    if (!this.snapshot.cameraTelemetry) {
      return;
    }

    const refreshedCameraTelemetry = refreshCameraTelemetrySnapshot(
      this.snapshot.cameraTelemetry,
      this.staleThresholdMs,
      this.nowFn(),
    );
    const nextSourceHealthState = deriveSourceHealthState(
      this.snapshot.sourceLifecycleState,
      refreshedCameraTelemetry,
    );
    const nextSourceHealthText = formatSourceHealthText(nextSourceHealthState);

    if (
      refreshedCameraTelemetry.telemetryCurrent ===
        this.snapshot.cameraTelemetry.telemetryCurrent &&
      nextSourceHealthState === this.snapshot.sourceHealthState &&
      nextSourceHealthText === this.snapshot.sourceHealthText
    ) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      cameraTelemetry: refreshedCameraTelemetry,
      sourceHealthState: nextSourceHealthState,
      sourceHealthText: nextSourceHealthText,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

function createSnapshotFromSettings(
  settings: XrAppSettingsState,
): DiagnosticsSnapshot {
  return {
    appRunning: settings.appRunning,
    sourceMode: settings.sourceMode,
    isConnected: settings.isConnected,
    connectionStatusText: settings.isConnected ? "Connected" : "Disconnected",
    sourceConnectionStatusText: "Detached",
    sourceSceneId: undefined,
    sourceStreamName: undefined,
    sourceStatusText: undefined,
    sourceHealthState: "pending",
    sourceHealthText: "Pending",
    transportAdapterType: settings.liveTransportAdapterType,
    transportAdapterDisplayName: settings.liveTransportAdapterDisplayName,
    transportStatusState: settings.liveTransportStatusState,
    transportConnected: settings.liveTransportConnected,
    transportConnectionStatusText: mapTransportConnectionStatusText(
      settings.liveTransportStatusState,
      settings.liveTransportConnected,
    ),
    transportStatusText: settings.liveTransportStatusText,
    transportErrorText: settings.liveTransportErrorText,
    transportParseErrorText: settings.liveTransportParseErrorText,
    transportLastMessageType: settings.liveTransportLastMessageType,
    transportLastSequence: settings.liveTransportLastSequence,
    transportLastMessageTimestampMs: settings.liveTransportLastMessageTimestampMs,
    transportLastMessageSizeBytes: settings.liveTransportLastMessageSizeBytes,
    transportSequenceHealth: settings.liveTransportSequenceHealth,
    transportCapabilities: settings.liveTransportCapabilities,
    senderName: settings.liveTransportCapabilities?.senderName,
    transportConfig: settings.liveTransportConfig,
    cameraTelemetry: undefined,
    thermalTelemetry: mergeThermalTelemetryWithCapabilities(
      undefined,
      settings.liveTransportCapabilities,
      DEFAULT_THERMAL_OVERLAY_MODE,
    ),
    irIlluminatorTelemetry: mergeIrIlluminatorTelemetryWithCapabilities(
      undefined,
      settings.liveTransportCapabilities,
    ),
    hearingEnhancementTelemetry:
      mergeHearingEnhancementTelemetryWithCapabilities(
        settings.liveTransportCapabilities,
        settings.hearingMode,
        settings.hearingGain,
      ),
    phoneMediaAudioTelemetry: mergePhoneMediaAudioTelemetryWithCapabilities(
      settings.liveTransportCapabilities,
      settings.mediaVolume,
      settings.mediaMuted,
    ),
    statusText: settings.statusText,
    renderStatusText: settings.renderStatusText,
    fpsEstimate: settings.fpsEstimate,
    viewerSource: "none",
    viewerInitialized: false,
  };
}

function estimateFps(
  previousTimestampMs: number | undefined,
  nextTimestampMs: number | undefined,
  fallback: number,
): number {
  if (
    typeof previousTimestampMs !== "number" ||
    typeof nextTimestampMs !== "number" ||
    nextTimestampMs <= previousTimestampMs
  ) {
    return fallback;
  }

  const frameDurationMs = nextTimestampMs - previousTimestampMs;
  return Number((1000 / frameDurationMs).toFixed(2));
}

function mapSourceConnectionStatusText(
  state: StereoFrameSourceState | undefined,
): string {
  if (state === "running") {
    return "Connected";
  }

  if (state === "starting") {
    return "Connecting";
  }

  if (state === "reconnecting") {
    return "Retrying";
  }

  if (state === "idle") {
    return "Idle";
  }

  if (state === "error") {
    return "Error";
  }

  if (state === "stopped") {
    return "Stopped";
  }

  return "Detached";
}

function mapTransportConnectionStatusText(
  state: LiveTransportAdapterState,
  connected: boolean,
): string {
  if (connected) {
    return "Connected";
  }

  if (state === "starting" || state === "connecting" || state === "reconnecting") {
    return "Connecting";
  }

  if (state === "error") {
    return "Error";
  }

  if (state === "idle") {
    return "Idle";
  }

  if (state === "stopped") {
    return "Disconnected";
  }

  return "Disconnected";
}

function extractCameraTelemetry(
  sourceStatus: StereoFrameSourceStatusSnapshot | undefined,
  metadata: StereoFrameMetadata | undefined,
  nowMs: number,
  staleThresholdMs: number,
): CameraTelemetrySnapshot | undefined {
  const metadataTelemetry = extractCameraTelemetryFromMetadataExtras(
    metadata?.extras,
    staleThresholdMs,
  );

  const mergedTelemetry = sourceStatus?.cameraTelemetry
    ? mergeDefinedTelemetryFields(
        {
          ...sourceStatus.cameraTelemetry,
          telemetryUpdatedAtMs:
            sourceStatus.telemetryReceivedAtMs ?? sourceStatus.telemetryUpdatedAtMs,
          telemetryStaleThresholdMs: staleThresholdMs,
        },
        metadataTelemetry,
      )
    : metadataTelemetry;

  if (!mergedTelemetry) {
    return undefined;
  }

  return refreshCameraTelemetrySnapshot(
    deriveCameraFallbackTelemetry(
      mergedTelemetry,
      sourceStatus?.statusText,
      sourceStatus?.lastError,
    ),
    staleThresholdMs,
    nowMs,
  );
}

function extractThermalTelemetry(
  sourceStatus: StereoFrameSourceStatusSnapshot | undefined,
  frame: StereoFrame | undefined,
  capabilities: LiveTransportCapabilitiesSnapshot | undefined,
  fallbackOverlayMode: ThermalOverlayMode,
): ThermalTelemetrySnapshot {
  const capabilitySnapshot = createDefaultThermalCapabilitySnapshot({
    thermalAvailable: capabilities?.thermalAvailable ?? false,
    thermalBackendIdentity: capabilities?.thermalBackendIdentity,
    thermalFrameWidth: capabilities?.thermalFrameWidth,
    thermalFrameHeight: capabilities?.thermalFrameHeight,
    thermalFrameRate: capabilities?.thermalFrameRate,
    thermalOverlaySupported: capabilities?.thermalOverlaySupported ?? false,
    supportedThermalOverlayModes:
      capabilities?.supportedThermalOverlayModes ??
      [DEFAULT_THERMAL_OVERLAY_MODE],
    thermalHealthState: capabilities?.thermalHealthState ?? "unavailable",
    thermalErrorText: capabilities?.thermalErrorText,
  });
  const sourceTelemetry = sourceStatus?.thermalTelemetry;

  return {
    ...capabilitySnapshot,
    ...mergeDefinedThermalTelemetryFields(sourceTelemetry),
    currentOverlayMode:
      sourceTelemetry?.currentOverlayMode ??
      frame?.thermalOverlayMode ??
      fallbackOverlayMode,
    lastThermalFrameId:
      sourceTelemetry?.lastThermalFrameId ?? frame?.thermalFrame?.frameId,
    lastThermalTimestampMs:
      sourceTelemetry?.lastThermalTimestampMs ?? frame?.thermalFrame?.timestampMs,
    hotspotCount:
      sourceTelemetry?.hotspotCount ??
      frame?.thermalFrame?.hotspotAnnotations?.length,
    paletteHint: sourceTelemetry?.paletteHint ?? frame?.thermalFrame?.paletteHint,
  };
}

function extractIrIlluminatorTelemetry(
  sourceStatus: StereoFrameSourceStatusSnapshot | undefined,
  capabilities: LiveTransportCapabilitiesSnapshot | undefined,
): IrIlluminatorTelemetrySnapshot {
  const capabilitySnapshot = createDefaultIrIlluminatorCapabilitySnapshot({
    irAvailable: capabilities?.irAvailable ?? false,
    irBackendIdentity: capabilities?.irBackendIdentity,
    irEnabled: capabilities?.irEnabled ?? false,
    irLevel: capabilities?.irLevel ?? 0,
    irMaxLevel: capabilities?.irMaxLevel ?? 0,
    irControlSupported: capabilities?.irControlSupported ?? false,
    irFaultState: capabilities?.irFaultState,
    irErrorText: capabilities?.irErrorText,
  });

  return {
    ...capabilitySnapshot,
    ...mergeDefinedIrIlluminatorTelemetryFields(
      sourceStatus?.irIlluminatorTelemetry,
    ),
  };
}

function mergeThermalTelemetryWithCapabilities(
  currentTelemetry: ThermalTelemetrySnapshot | undefined,
  capabilities: LiveTransportCapabilitiesSnapshot | undefined,
  fallbackOverlayMode: ThermalOverlayMode,
): ThermalTelemetrySnapshot {
  const capabilitySnapshot = createDefaultThermalCapabilitySnapshot({
    thermalAvailable: capabilities?.thermalAvailable ?? false,
    thermalBackendIdentity: capabilities?.thermalBackendIdentity,
    thermalFrameWidth: capabilities?.thermalFrameWidth,
    thermalFrameHeight: capabilities?.thermalFrameHeight,
    thermalFrameRate: capabilities?.thermalFrameRate,
    thermalOverlaySupported: capabilities?.thermalOverlaySupported ?? false,
    supportedThermalOverlayModes:
      capabilities?.supportedThermalOverlayModes ??
      [DEFAULT_THERMAL_OVERLAY_MODE],
    thermalHealthState: capabilities?.thermalHealthState ?? "unavailable",
    thermalErrorText: capabilities?.thermalErrorText,
  });

  return {
    ...capabilitySnapshot,
    thermalAvailable:
      capabilitySnapshot.thermalAvailable || currentTelemetry?.thermalAvailable || false,
    thermalBackendIdentity:
      currentTelemetry?.thermalBackendIdentity ??
      capabilitySnapshot.thermalBackendIdentity,
    thermalFrameWidth:
      currentTelemetry?.thermalFrameWidth ?? capabilitySnapshot.thermalFrameWidth,
    thermalFrameHeight:
      currentTelemetry?.thermalFrameHeight ?? capabilitySnapshot.thermalFrameHeight,
    thermalFrameRate:
      currentTelemetry?.thermalFrameRate ?? capabilitySnapshot.thermalFrameRate,
    thermalOverlaySupported:
      capabilitySnapshot.thermalOverlaySupported ||
      currentTelemetry?.thermalOverlaySupported ||
      false,
    supportedThermalOverlayModes:
      hasDynamicThermalTelemetry(currentTelemetry) &&
      currentTelemetry?.supportedThermalOverlayModes?.length
        ? currentTelemetry.supportedThermalOverlayModes
        : capabilitySnapshot.supportedThermalOverlayModes,
    thermalHealthState:
      hasDynamicThermalTelemetry(currentTelemetry)
        ? currentTelemetry?.thermalHealthState ?? capabilitySnapshot.thermalHealthState
        : capabilitySnapshot.thermalHealthState,
    thermalErrorText:
      currentTelemetry?.thermalErrorText ?? capabilitySnapshot.thermalErrorText,
    currentOverlayMode:
      currentTelemetry?.currentOverlayMode ?? fallbackOverlayMode,
    lastThermalFrameId: currentTelemetry?.lastThermalFrameId,
    lastThermalTimestampMs: currentTelemetry?.lastThermalTimestampMs,
    hotspotCount: currentTelemetry?.hotspotCount,
    paletteHint: currentTelemetry?.paletteHint,
  };
}

function mergeIrIlluminatorTelemetryWithCapabilities(
  currentTelemetry: IrIlluminatorTelemetrySnapshot | undefined,
  capabilities: LiveTransportCapabilitiesSnapshot | undefined,
): IrIlluminatorTelemetrySnapshot {
  const capabilitySnapshot = createDefaultIrIlluminatorCapabilitySnapshot({
    irAvailable: capabilities?.irAvailable ?? false,
    irBackendIdentity: capabilities?.irBackendIdentity,
    irEnabled: capabilities?.irEnabled ?? false,
    irLevel: capabilities?.irLevel ?? 0,
    irMaxLevel: capabilities?.irMaxLevel ?? 0,
    irControlSupported: capabilities?.irControlSupported ?? false,
    irFaultState: capabilities?.irFaultState,
    irErrorText: capabilities?.irErrorText,
  });

  return {
    ...capabilitySnapshot,
    irAvailable:
      capabilitySnapshot.irAvailable || currentTelemetry?.irAvailable || false,
    irBackendIdentity:
      currentTelemetry?.irBackendIdentity ?? capabilitySnapshot.irBackendIdentity,
    irEnabled:
      hasDynamicIrIlluminatorTelemetry(currentTelemetry)
        ? currentTelemetry?.irEnabled ?? capabilitySnapshot.irEnabled
        : capabilitySnapshot.irEnabled,
    irLevel:
      hasDynamicIrIlluminatorTelemetry(currentTelemetry)
        ? currentTelemetry?.irLevel ?? capabilitySnapshot.irLevel
        : capabilitySnapshot.irLevel,
    irMaxLevel:
      currentTelemetry?.irMaxLevel ?? capabilitySnapshot.irMaxLevel,
    irControlSupported:
      capabilitySnapshot.irControlSupported ||
      currentTelemetry?.irControlSupported ||
      false,
    irFaultState:
      currentTelemetry?.irFaultState ?? capabilitySnapshot.irFaultState,
    irErrorText:
      currentTelemetry?.irErrorText ?? capabilitySnapshot.irErrorText,
  };
}

function mergeHearingEnhancementTelemetryWithCapabilities(
  capabilities: LiveTransportCapabilitiesSnapshot | undefined,
  selectedMode: HearingEnhancementMode,
  selectedGain: number,
): HearingEnhancementTelemetrySnapshot {
  const capabilitySnapshot = createDefaultHearingEnhancementCapabilitySnapshot({
    hearingEnhancementAvailable:
      capabilities?.hearingEnhancementAvailable ?? false,
    microphoneArrayAvailable: capabilities?.microphoneArrayAvailable ?? false,
    audioEnhancementBackendIdentity:
      capabilities?.audioEnhancementBackendIdentity,
    hearingModesSupported: capabilities?.hearingModesSupported ?? ["off"],
    hearingHealthState: capabilities?.hearingHealthState ?? "unavailable",
    hearingErrorText: capabilities?.hearingErrorText,
    hearingGainMin: capabilities?.hearingGainMin ?? 0,
    hearingGainMax: capabilities?.hearingGainMax ?? 1,
    hearingLatencyEstimateMs: capabilities?.hearingLatencyEstimateMs,
  });
  const normalizedMode = capabilitySnapshot.hearingModesSupported.includes(
    selectedMode,
  )
    ? selectedMode
    : capabilitySnapshot.hearingModesSupported[0] ?? selectedMode;

  return {
    ...capabilitySnapshot,
    currentMode: normalizedMode,
    currentGain: clamp(
      selectedGain,
      capabilitySnapshot.hearingGainMin,
      capabilitySnapshot.hearingGainMax,
    ),
  };
}

function mergePhoneMediaAudioTelemetryWithCapabilities(
  capabilities: LiveTransportCapabilitiesSnapshot | undefined,
  selectedVolume: number,
  mediaMuted: boolean,
): PhoneMediaAudioTelemetrySnapshot {
  const capabilitySnapshot = createDefaultPhoneMediaAudioCapabilitySnapshot({
    phoneAudioAvailable: capabilities?.phoneAudioAvailable ?? false,
    bluetoothAudioConnected: capabilities?.bluetoothAudioConnected ?? false,
    mediaPlaybackControlSupported:
      capabilities?.mediaPlaybackControlSupported ?? false,
    mediaPlaybackState: capabilities?.mediaPlaybackState ?? "unavailable",
    mediaVolumeMin: capabilities?.mediaVolumeMin ?? 0,
    mediaVolumeMax: capabilities?.mediaVolumeMax ?? 1,
  });

  return {
    ...capabilitySnapshot,
    currentVolume: clamp(
      selectedVolume,
      capabilitySnapshot.mediaVolumeMin,
      capabilitySnapshot.mediaVolumeMax,
    ),
    mediaMuted,
  };
}

function extractCameraTelemetryFromMetadataExtras(
  extras: StereoFrameMetadata["extras"] | undefined,
  staleThresholdMs: number,
): CameraTelemetrySnapshot | undefined {
  if (!extras) {
    return undefined;
  }

  const providerType = readStringMetadata(extras["providerType"]);
  const captureBackendName = readStringMetadata(extras["captureBackend"]);
  const bridgeMode = readStringMetadata(extras["bridgeMode"]);
  const frameWidth = readNumberMetadata(extras["frameWidth"]);
  const frameHeight = readNumberMetadata(extras["frameHeight"]);
  const frameIntervalMs = readNumberMetadata(extras["frameIntervalMs"]);
  const frameSourceMode = readStringMetadata(extras["frameSourceMode"]);
  const frameSourceName = readStringMetadata(extras["frameSourceName"]);
  const replayFrameId = readNumberMetadata(extras["replayFrameId"]);
  const replayLabel = readStringMetadata(extras["replayLabel"]);
  if (
    providerType !== "camera" &&
    !captureBackendName &&
    !bridgeMode &&
    frameWidth === undefined &&
    frameHeight === undefined &&
    frameIntervalMs === undefined &&
    frameSourceMode === undefined &&
    frameSourceName === undefined &&
    replayFrameId === undefined &&
    replayLabel === undefined
  ) {
    return undefined;
  }

  return {
    captureBackendName,
    bridgeMode,
    frameWidth,
    frameHeight,
    frameIntervalMs,
    frameSourceMode,
    frameSourceName,
    startupValidated: readBooleanMetadata(extras["startupValidated"]),
    capturesAttempted: readNumberMetadata(extras["capturesAttempted"]),
    capturesSucceeded: readNumberMetadata(
      extras["capturesSucceeded"] ?? extras["successfulCaptures"],
    ),
    capturesFailed: readNumberMetadata(
      extras["capturesFailed"] ?? extras["failedCaptures"],
    ),
    consecutiveFailureCount: readNumberMetadata(extras["consecutiveFailureCount"]),
    lastSuccessfulCaptureTime: readNumberMetadata(extras["lastSuccessfulCaptureTime"]),
    lastCaptureDurationMs: readNumberMetadata(extras["lastCaptureDurationMs"]),
    averageCaptureDurationMs: readNumberMetadata(extras["averageCaptureDurationMs"]),
    effectiveFrameIntervalMs: readNumberMetadata(extras["effectiveFrameIntervalMs"]),
    leftCameraDevice: readStringMetadata(extras["leftCameraDevice"]),
    rightCameraDevice: readStringMetadata(extras["rightCameraDevice"]),
    gstLaunchPath: readStringMetadata(extras["gstLaunchPath"]),
    captureHealthState: readCaptureHealthStateMetadata(extras["captureHealthState"]),
    captureRetryCount: readNumberMetadata(extras["captureRetryCount"]),
    captureRetryDelayMs: readNumberMetadata(extras["captureRetryDelayMs"]),
    recentRetryAttempts: readNumberMetadata(extras["recentRetryAttempts"]),
    currentRetryAttempt: readNumberMetadata(extras["currentRetryAttempt"]),
    transientFailureCount: readNumberMetadata(extras["transientFailureCount"]),
    recoveryCount: readNumberMetadata(extras["recoveryCount"]),
    lastRecoveryTime: readNumberMetadata(extras["lastRecoveryTime"]),
    lastTerminalFailureTime: readNumberMetadata(extras["lastTerminalFailureTime"]),
    replaySourceIdentity: readStringMetadata(extras["replaySourceIdentity"]),
    replayLoopEnabled: readBooleanMetadata(extras["replayLoopEnabled"]),
    replayCurrentIndex: readNumberMetadata(extras["replayCurrentIndex"]),
    replayFrameCount: readNumberMetadata(extras["replayFrameCount"]),
    replayLeftSource: readStringMetadata(extras["replayLeftSource"]),
    replayRightSource: readStringMetadata(extras["replayRightSource"]),
    replayTimingMode: readReplayTimingModeMetadata(extras["replayTimingMode"]),
    replayTimeScale: readPositiveNumberMetadata(extras["replayTimeScale"]),
    replayManifestLoaded: readBooleanMetadata(extras["replayManifestLoaded"]),
    replayManifestValidated: readBooleanMetadata(extras["replayManifestValidated"]),
    replayManifestErrorCount: readNumberMetadata(extras["replayManifestErrorCount"]),
    replayManifestWarningCount: readNumberMetadata(
      extras["replayManifestWarningCount"],
    ),
    replayManifestSource: readStringMetadata(extras["replayManifestSource"]),
    replayValidationSummary: readStringMetadata(extras["replayValidationSummary"]),
    replayRecordedTimestamp: readNumberMetadata(extras["replayRecordedTimestamp"]),
    replayFrameId,
    replayLabel,
    replayDelayUntilNextMs: readNumberMetadata(extras["replayDelayUntilNextMs"]),
    replayScaledDelayUntilNextMs: readNumberMetadata(
      extras["replayScaledDelayUntilNextMs"],
    ),
    replayTimingOffsetMs: readFiniteNumberMetadata(extras["replayTimingOffsetMs"]),
    replayNominalLoopDurationMs: readNumberMetadata(
      extras["replayNominalLoopDurationMs"],
    ),
    replayScaledLoopDurationMs: readNumberMetadata(
      extras["replayScaledLoopDurationMs"],
    ),
    recentCaptureEvents: readRecentCaptureEventsMetadata(extras["recentCaptureEvents"]),
    telemetryUpdatedAtMs: readNumberMetadata(extras["telemetryUpdatedAtMs"]),
    telemetryStaleThresholdMs: staleThresholdMs,
  };
}

function mergeDefinedTelemetryFields(
  base: CameraTelemetrySnapshot,
  additions: CameraTelemetrySnapshot | undefined,
): CameraTelemetrySnapshot {
  if (!additions) {
    return base;
  }

  const mergedSnapshot: Record<string, unknown> = {
    ...base,
  };
  for (const [key, value] of Object.entries(additions)) {
    if (value !== undefined) {
      mergedSnapshot[key] = value;
    }
  }

  return mergedSnapshot as CameraTelemetrySnapshot;
}

function deriveCameraFallbackTelemetry(
  snapshot: CameraTelemetrySnapshot,
  sourceStatusText: string | undefined,
  sourceErrorText: string | undefined,
): CameraTelemetrySnapshot {
  const fallbackReason =
    extractFallbackReason(sourceStatusText) ??
    extractFallbackReason(sourceErrorText) ??
    snapshot.fallbackReason;

  return {
    ...snapshot,
    fallbackActive:
      fallbackReason !== undefined ? true : snapshot.fallbackActive,
    fallbackReason,
  };
}

function mergeDefinedThermalTelemetryFields(
  additions: StereoFrameSourceThermalTelemetrySnapshot | ThermalTelemetrySnapshot | undefined,
): Partial<ThermalTelemetrySnapshot> {
  if (!additions) {
    return {};
  }

  const mergedSnapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(additions)) {
    if (value !== undefined) {
      mergedSnapshot[key] = value;
    }
  }

  return mergedSnapshot as Partial<ThermalTelemetrySnapshot>;
}

function mergeDefinedIrIlluminatorTelemetryFields(
  additions:
    | StereoFrameSourceIrIlluminatorTelemetrySnapshot
    | IrIlluminatorTelemetrySnapshot
    | undefined,
): Partial<IrIlluminatorTelemetrySnapshot> {
  if (!additions) {
    return {};
  }

  const mergedSnapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(additions)) {
    if (value !== undefined) {
      mergedSnapshot[key] = value;
    }
  }

  return mergedSnapshot as Partial<IrIlluminatorTelemetrySnapshot>;
}

function hasDynamicThermalTelemetry(
  telemetry: ThermalTelemetrySnapshot | undefined,
): boolean {
  return Boolean(
    telemetry &&
      (telemetry.lastThermalFrameId !== undefined ||
        telemetry.lastThermalTimestampMs !== undefined ||
        telemetry.hotspotCount !== undefined ||
        telemetry.paletteHint !== undefined ||
        telemetry.thermalErrorText !== undefined ||
        telemetry.thermalBackendIdentity !== undefined),
  );
}

function hasDynamicIrIlluminatorTelemetry(
  telemetry: IrIlluminatorTelemetrySnapshot | undefined,
): boolean {
  return Boolean(
    telemetry &&
      (telemetry.irBackendIdentity !== undefined ||
        telemetry.irEnabled ||
        telemetry.irLevel > 0 ||
        telemetry.irFaultState !== undefined ||
        telemetry.irErrorText !== undefined),
  );
}

function refreshCameraTelemetrySnapshot(
  snapshot: CameraTelemetrySnapshot,
  staleThresholdMs: number,
  nowMs: number,
): CameraTelemetrySnapshot {
  return {
    ...snapshot,
    telemetryCurrent: isTelemetryCurrent(
      snapshot.telemetryUpdatedAtMs,
      staleThresholdMs,
      nowMs,
    ),
    telemetryStaleThresholdMs: staleThresholdMs,
  };
}

function deriveSourceHealthState(
  sourceState: StereoFrameSourceState | undefined,
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
): SourceHealthState {
  if (cameraTelemetry?.telemetryCurrent === false) {
    return "telemetry_stale";
  }

  if (
    cameraTelemetry?.captureHealthState === "terminal_failure" ||
    sourceState === "error"
  ) {
    return "terminal_failure";
  }

  if (
    cameraTelemetry?.captureHealthState === "retrying" ||
    sourceState === "reconnecting"
  ) {
    return "retrying";
  }

  if (cameraTelemetry?.captureHealthState === "recovered") {
    return "degraded";
  }

  if (
    cameraTelemetry?.captureHealthState === "healthy" ||
    (cameraTelemetry && sourceState === "running")
  ) {
    return "healthy";
  }

  return "pending";
}

function formatSourceHealthText(state: SourceHealthState): string {
  switch (state) {
    case "healthy":
      return "Healthy";
    case "retrying":
      return "Retrying";
    case "degraded":
      return "Degraded";
    case "terminal_failure":
      return "Terminal Failure";
    case "telemetry_stale":
      return "Telemetry Stale";
    default:
      return "Pending";
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function extractFallbackReason(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const quotedMatch = value.match(/fallback=['"]([^'"]+)['"]/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  return /fallback/i.test(value) ? value : undefined;
}

function readStringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumberMetadata(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readFiniteNumberMetadata(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPositiveNumberMetadata(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function readBooleanMetadata(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readCaptureHealthStateMetadata(
  value: unknown,
):
  | "idle"
  | "healthy"
  | "retrying"
  | "recovered"
  | "terminal_failure"
  | undefined {
  return value === "idle" ||
    value === "healthy" ||
    value === "retrying" ||
    value === "recovered" ||
    value === "terminal_failure"
    ? value
    : undefined;
}

function readReplayTimingModeMetadata(
  value: unknown,
): "fixed" | "recorded" | undefined {
  return value === "fixed" || value === "recorded" ? value : undefined;
}

function readRecentCaptureEventsMetadata(
  value: unknown,
): readonly StereoFrameSourceCaptureEventSnapshot[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const events: StereoFrameSourceCaptureEventSnapshot[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const timestampMs = readNumberMetadata(record["timestampMs"]);
    const eventType = readCaptureEventTypeMetadata(record["eventType"]);
    const summary = readStringMetadata(record["summary"]);
    if (
      typeof timestampMs !== "number" ||
      eventType === undefined ||
      summary === undefined
    ) {
      continue;
    }

    const retryAttempt = readNumberMetadata(record["retryAttempt"]);
    const eye = readCaptureEyeMetadata(record["eye"]);
    events.push({
      timestampMs,
      eventType,
      ...(retryAttempt !== undefined ? { retryAttempt } : {}),
      ...(eye !== undefined ? { eye } : {}),
      summary,
    });
  }

  return events.length > 0 ? events : undefined;
}

function readCaptureEventTypeMetadata(
  value: unknown,
): "retrying" | "recovered" | "terminal_failure" | undefined {
  return value === "retrying" ||
    value === "recovered" ||
    value === "terminal_failure"
    ? value
    : undefined;
}

function readCaptureEyeMetadata(
  value: unknown,
): "left" | "right" | undefined {
  return value === "left" || value === "right" ? value : undefined;
}

function isTelemetryCurrent(
  telemetryUpdatedAtMs: number | undefined,
  staleThresholdMs: number,
  nowMs: number,
): boolean | undefined {
  if (typeof telemetryUpdatedAtMs !== "number") {
    return undefined;
  }

  return Math.max(0, nowMs - telemetryUpdatedAtMs) <= staleThresholdMs;
}
