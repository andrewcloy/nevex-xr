import type { Unsubscribe } from "../hand_input/contracts";
import {
  DiagnosticsStore,
  type DiagnosticsSnapshot,
  type HearingEnhancementTelemetrySnapshot,
  type IrIlluminatorTelemetrySnapshot,
  type PhoneMediaAudioTelemetrySnapshot,
  type SourceHealthState,
  type ThermalTelemetrySnapshot,
} from "../diagnostics/diagnostics_store";
import { SettingsStore } from "../settings_state/settings_store";

export interface DiagnosticsPanelCameraTelemetrySnapshot {
  readonly captureBackendText: string;
  readonly frameSourceModeText: string;
  readonly frameSourceNameText: string;
  readonly bridgeModeText: string;
  readonly runtimeProfileNameText: string;
  readonly runtimeProfileTypeText: string;
  readonly availableProfilesText: string;
  readonly frameSizeText: string;
  readonly frameIntervalText: string;
  readonly inputResolutionText: string;
  readonly outputResolutionText: string;
  readonly outputModeText: string;
  readonly effectiveFpsText: string;
  readonly preflightStatusText: string;
  readonly recordingStateText: string;
  readonly artifactText: string;
  readonly fallbackStateText: string;
  readonly fallbackReasonText: string;
  readonly captureHealthStateText: string;
  readonly startupValidatedText: string;
  readonly capturesAttemptedText: string;
  readonly capturesSucceededText: string;
  readonly capturesFailedText: string;
  readonly consecutiveFailureCountText: string;
  readonly captureRetryCountText: string;
  readonly captureRetryDelayText: string;
  readonly recentRetryAttemptsText: string;
  readonly currentRetryAttemptText: string;
  readonly transientFailureCountText: string;
  readonly recoveryCountText: string;
  readonly lastSuccessfulCaptureTimeText: string;
  readonly lastRecoveryTimeText: string;
  readonly lastTerminalFailureTimeText: string;
  readonly lastCaptureDurationText: string;
  readonly averageCaptureDurationText: string;
  readonly effectiveFrameIntervalText: string;
  readonly telemetryUpdatedAtText: string;
  readonly telemetryCurrentText: string;
  readonly telemetryStaleThresholdText: string;
  readonly recentCaptureEventsText: string;
  readonly replaySourceIdentityText: string;
  readonly replayLoopText: string;
  readonly replayIndexText: string;
  readonly replayTimingModeText: string;
  readonly replayTimeScaleText: string;
  readonly replayManifestLoadedText: string;
  readonly replayManifestValidatedText: string;
  readonly replayManifestErrorCountText: string;
  readonly replayManifestWarningCountText: string;
  readonly replayManifestSourceText: string;
  readonly replayValidationSummaryText: string;
  readonly replayRecordedTimestampText: string;
  readonly replayDelayUntilNextText: string;
  readonly replayScaledDelayUntilNextText: string;
  readonly replayTimingOffsetText: string;
  readonly replayNominalLoopDurationText: string;
  readonly replayScaledLoopDurationText: string;
  readonly replayLeftSourceText: string;
  readonly replayRightSourceText: string;
  readonly leftCameraDeviceText: string;
  readonly rightCameraDeviceText: string;
  readonly gstLaunchPathText: string;
}

export interface DiagnosticsPanelThermalTelemetrySnapshot {
  readonly thermalAvailableText: string;
  readonly thermalBackendText: string;
  readonly thermalFrameSizeText: string;
  readonly thermalFrameRateText: string;
  readonly thermalOverlaySupportedText: string;
  readonly thermalSupportedModesText: string;
  readonly thermalOverlayModeText: string;
  readonly thermalHealthStateText: string;
  readonly lastThermalFrameText: string;
  readonly lastThermalTimestampText: string;
  readonly hotspotCountText: string;
  readonly paletteHintText: string;
  readonly thermalErrorText: string;
}

export interface DiagnosticsPanelIrIlluminatorSnapshot {
  readonly irAvailableText: string;
  readonly irBackendText: string;
  readonly irEnabledText: string;
  readonly irLevelText: string;
  readonly irControlSupportedText: string;
  readonly irFaultStateText: string;
  readonly irErrorText: string;
}

export interface DiagnosticsPanelHearingEnhancementSnapshot {
  readonly hearingAvailableText: string;
  readonly microphoneArrayText: string;
  readonly hearingBackendText: string;
  readonly hearingModeText: string;
  readonly hearingGainText: string;
  readonly hearingModesSupportedText: string;
  readonly hearingHealthStateText: string;
  readonly hearingLatencyEstimateText: string;
  readonly hearingErrorText: string;
}

export interface DiagnosticsPanelPhoneMediaAudioSnapshot {
  readonly phoneAudioAvailableText: string;
  readonly bluetoothAudioConnectedText: string;
  readonly mediaPlaybackControlSupportedText: string;
  readonly mediaPlaybackStateText: string;
  readonly mediaVolumeRangeText: string;
  readonly mediaVolumeTargetText: string;
  readonly mediaMutedText: string;
}

/**
 * Diagnostics panel state prepared for a future XR UI implementation.
 */
export interface DiagnosticsPanelSnapshot {
  readonly visible: boolean;
  readonly appRunning: boolean;
  readonly sourceMode: DiagnosticsSnapshot["sourceMode"];
  readonly connectionStatusText: string;
  readonly sourceLifecycleText: string;
  readonly sourceConnectionStatusText: string;
  readonly sourceLastFrameText: string;
  readonly sourceLastFrameTimestampText: string;
  readonly sourceSceneIdText: string;
  readonly sourceStreamNameText: string;
  readonly sourceErrorText?: string;
  readonly sourceStatusText?: string;
  readonly sourceHealthText: string;
  readonly sourceHealthTone: SourceHealthState;
  readonly transportAdapterText: string;
  readonly transportConnectionText: string;
  readonly transportStatusText: string;
  readonly transportWebSocketUrlText: string;
  readonly transportHostText: string;
  readonly transportReconnectText: string;
  readonly senderNameText: string;
  readonly transportCapabilitiesText: string;
  readonly transportImageModesText: string;
  readonly transportSequenceHealthText: string;
  readonly transportLastMessageSizeText: string;
  readonly transportPayloadLimitsText: string;
  readonly transportStereoFormatNoteText?: string;
  readonly transportErrorText?: string;
  readonly transportParseErrorText?: string;
  readonly transportLastMessageTypeText: string;
  readonly transportLastSequenceText: string;
  readonly transportLastMessageTimestampText: string;
  readonly cameraTelemetry?: DiagnosticsPanelCameraTelemetrySnapshot;
  readonly thermalTelemetry: DiagnosticsPanelThermalTelemetrySnapshot;
  readonly irIlluminatorTelemetry: DiagnosticsPanelIrIlluminatorSnapshot;
  readonly hearingEnhancementTelemetry: DiagnosticsPanelHearingEnhancementSnapshot;
  readonly phoneMediaAudioTelemetry: DiagnosticsPanelPhoneMediaAudioSnapshot;
  readonly statusText: string;
  readonly renderStatusText: string;
  readonly fpsText: string;
  readonly lines: readonly string[];
}

/**
 * Listener invoked when diagnostics panel state changes.
 */
export type DiagnosticsPanelListener = (
  snapshot: DiagnosticsPanelSnapshot,
) => void;

/**
 * State connector for a future diagnostics overlay.
 *
 * The panel stays render-agnostic by consuming a diagnostics read-model rather
 * than directly depending on a runtime or transport implementation.
 */
export class DiagnosticsPanelController {
  private readonly settingsStore: SettingsStore;

  private readonly diagnosticsStore: DiagnosticsStore;

  private readonly listeners = new Set<DiagnosticsPanelListener>();

  private readonly settingsUnsubscribe: Unsubscribe;

  private readonly diagnosticsUnsubscribe: Unsubscribe;

  constructor(settingsStore: SettingsStore, diagnosticsStore: DiagnosticsStore) {
    this.settingsStore = settingsStore;
    this.diagnosticsStore = diagnosticsStore;

    this.settingsUnsubscribe = this.settingsStore.subscribe(() => {
      this.emit();
    });
    this.diagnosticsUnsubscribe = this.diagnosticsStore.subscribe(() => {
      this.emit();
    });
  }

  getSnapshot(): DiagnosticsPanelSnapshot {
    const settings = this.settingsStore.getSnapshot();
    const diagnosticsEnabled = settings.diagnosticsModeEnabled;
    const diagnostics = this.diagnosticsStore.getSnapshot();
    const fpsText =
      diagnostics.fpsEstimate > 0
        ? `${diagnostics.fpsEstimate.toFixed(2)} FPS`
        : "FPS pending";
    const transportCapabilitiesText = diagnostics.transportCapabilities
      ? `${diagnostics.transportCapabilities.senderName}${
          diagnostics.transportCapabilities.senderVersion
            ? ` v${diagnostics.transportCapabilities.senderVersion}`
            : ""
        }`
      : "Pending";
    const cameraTelemetry = diagnostics.cameraTelemetry
      ? {
          captureBackendText:
            diagnostics.cameraTelemetry.captureBackendName ??
            diagnostics.cameraTelemetry.frameSourceName ??
            "Pending",
          frameSourceModeText: formatRuntimeSourceModeText(
            diagnostics.cameraTelemetry,
          ),
          frameSourceNameText: formatRuntimeSourceNameText(
            diagnostics.cameraTelemetry,
          ),
          bridgeModeText: formatBridgeModeText(diagnostics.cameraTelemetry),
          runtimeProfileNameText:
            diagnostics.cameraTelemetry.runtimeProfileName ?? "Pending",
          runtimeProfileTypeText:
            diagnostics.cameraTelemetry.runtimeProfileType ?? "Pending",
          availableProfilesText: formatAvailableProfilesText(
            diagnostics.cameraTelemetry,
          ),
          frameSizeText: formatFrameSizeText(diagnostics.cameraTelemetry),
          frameIntervalText: formatFrameIntervalText(diagnostics.cameraTelemetry),
          inputResolutionText: formatResolutionPair(
            diagnostics.cameraTelemetry.inputWidth,
            diagnostics.cameraTelemetry.inputHeight,
          ),
          outputResolutionText: formatResolutionPair(
            diagnostics.cameraTelemetry.outputWidth,
            diagnostics.cameraTelemetry.outputHeight,
          ),
          outputModeText: diagnostics.cameraTelemetry.outputMode ?? "Pending",
          effectiveFpsText: formatFramesPerSecond(
            diagnostics.cameraTelemetry.effectiveFps,
          ),
          preflightStatusText: formatPreflightStatusText(
            diagnostics.cameraTelemetry,
          ),
          recordingStateText: formatRecordingStateText(
            diagnostics.cameraTelemetry,
          ),
          artifactText: formatArtifactSummaryText(diagnostics.cameraTelemetry),
          fallbackStateText: diagnostics.cameraTelemetry.fallbackActive
            ? "Active"
            : "Inactive",
          fallbackReasonText:
            diagnostics.cameraTelemetry.fallbackReason ?? "None",
          captureHealthStateText:
            diagnostics.cameraTelemetry.captureHealthState ?? "Pending",
          startupValidatedText:
            diagnostics.cameraTelemetry.startupValidated === undefined
              ? "Pending"
              : diagnostics.cameraTelemetry.startupValidated
                ? "Yes"
                : "No",
          capturesAttemptedText: formatCount(diagnostics.cameraTelemetry.capturesAttempted),
          capturesSucceededText: formatCount(diagnostics.cameraTelemetry.capturesSucceeded),
          capturesFailedText: formatCount(diagnostics.cameraTelemetry.capturesFailed),
          consecutiveFailureCountText: formatCount(
            diagnostics.cameraTelemetry.consecutiveFailureCount,
          ),
          captureRetryCountText: formatCount(
            diagnostics.cameraTelemetry.captureRetryCount,
          ),
          captureRetryDelayText: formatDuration(
            diagnostics.cameraTelemetry.captureRetryDelayMs,
          ),
          recentRetryAttemptsText: formatCount(
            diagnostics.cameraTelemetry.recentRetryAttempts,
          ),
          currentRetryAttemptText: formatCount(
            diagnostics.cameraTelemetry.currentRetryAttempt,
          ),
          transientFailureCountText: formatCount(
            diagnostics.cameraTelemetry.transientFailureCount,
          ),
          recoveryCountText: formatCount(diagnostics.cameraTelemetry.recoveryCount),
          lastSuccessfulCaptureTimeText: formatTimestamp(
            diagnostics.cameraTelemetry.lastSuccessfulCaptureTime,
          ),
          lastRecoveryTimeText: formatTimestamp(
            diagnostics.cameraTelemetry.lastRecoveryTime,
          ),
          lastTerminalFailureTimeText: formatTimestamp(
            diagnostics.cameraTelemetry.lastTerminalFailureTime,
          ),
          lastCaptureDurationText: formatDuration(
            diagnostics.cameraTelemetry.lastCaptureDurationMs,
          ),
          averageCaptureDurationText: formatDuration(
            diagnostics.cameraTelemetry.averageCaptureDurationMs,
          ),
          effectiveFrameIntervalText: formatDuration(
            diagnostics.cameraTelemetry.effectiveFrameIntervalMs,
          ),
          telemetryUpdatedAtText: formatTimestamp(
            diagnostics.cameraTelemetry.telemetryUpdatedAtMs,
          ),
          telemetryCurrentText:
            diagnostics.cameraTelemetry.telemetryCurrent === undefined
              ? "Pending"
              : diagnostics.cameraTelemetry.telemetryCurrent
                ? "Current"
                : "Stale",
          telemetryStaleThresholdText: formatDuration(
            diagnostics.cameraTelemetry.telemetryStaleThresholdMs,
          ),
          recentCaptureEventsText: formatRecentCaptureEvents(
            diagnostics.cameraTelemetry.recentCaptureEvents,
          ),
          replaySourceIdentityText:
            diagnostics.cameraTelemetry.replaySourceIdentity ?? "Pending",
          replayLoopText:
            diagnostics.cameraTelemetry.replayLoopEnabled === undefined
              ? "Pending"
              : diagnostics.cameraTelemetry.replayLoopEnabled
                ? "Enabled"
                : "Disabled",
          replayIndexText:
            typeof diagnostics.cameraTelemetry.replayCurrentIndex === "number"
              ? `${diagnostics.cameraTelemetry.replayCurrentIndex}/${
                  diagnostics.cameraTelemetry.replayFrameCount ?? "?"
                }`
              : "Pending",
          replayTimingModeText:
            diagnostics.cameraTelemetry.replayTimingMode ?? "Pending",
          replayTimeScaleText: formatMultiplier(
            diagnostics.cameraTelemetry.replayTimeScale,
          ),
          replayManifestLoadedText:
            diagnostics.cameraTelemetry.replayManifestLoaded === undefined
              ? "Pending"
              : diagnostics.cameraTelemetry.replayManifestLoaded
                ? "Yes"
                : "No",
          replayManifestValidatedText:
            diagnostics.cameraTelemetry.replayManifestValidated === undefined
              ? "Pending"
              : diagnostics.cameraTelemetry.replayManifestValidated
                ? "Yes"
                : "No",
          replayManifestErrorCountText: formatCount(
            diagnostics.cameraTelemetry.replayManifestErrorCount,
          ),
          replayManifestWarningCountText: formatCount(
            diagnostics.cameraTelemetry.replayManifestWarningCount,
          ),
          replayManifestSourceText:
            diagnostics.cameraTelemetry.replayManifestSource ?? "Pending",
          replayValidationSummaryText:
            diagnostics.cameraTelemetry.replayValidationSummary ?? "Pending",
          replayRecordedTimestampText: formatTimestamp(
            diagnostics.cameraTelemetry.replayRecordedTimestamp,
          ),
          replayDelayUntilNextText: formatDuration(
            diagnostics.cameraTelemetry.replayDelayUntilNextMs,
          ),
          replayScaledDelayUntilNextText: formatDuration(
            diagnostics.cameraTelemetry.replayScaledDelayUntilNextMs,
          ),
          replayTimingOffsetText: formatSignedDuration(
            diagnostics.cameraTelemetry.replayTimingOffsetMs,
          ),
          replayNominalLoopDurationText: formatDuration(
            diagnostics.cameraTelemetry.replayNominalLoopDurationMs,
          ),
          replayScaledLoopDurationText: formatDuration(
            diagnostics.cameraTelemetry.replayScaledLoopDurationMs,
          ),
          replayLeftSourceText:
            diagnostics.cameraTelemetry.replayLeftSource ?? "Pending",
          replayRightSourceText:
            diagnostics.cameraTelemetry.replayRightSource ?? "Pending",
          leftCameraDeviceText:
            diagnostics.cameraTelemetry.leftCameraDevice ?? "Pending",
          rightCameraDeviceText:
            diagnostics.cameraTelemetry.rightCameraDevice ?? "Pending",
          gstLaunchPathText: diagnostics.cameraTelemetry.gstLaunchPath ?? "Pending",
        }
      : undefined;
    const thermalTelemetry = {
      thermalAvailableText: formatAvailabilityText(
        diagnostics.thermalTelemetry.thermalAvailable,
      ),
      thermalBackendText: formatThermalBackendText(diagnostics.thermalTelemetry),
      thermalFrameSizeText: formatThermalFrameSizeText(diagnostics.thermalTelemetry),
      thermalFrameRateText: formatThermalFrameRateText(diagnostics.thermalTelemetry),
      thermalOverlaySupportedText: diagnostics.thermalTelemetry.thermalOverlaySupported
        ? "Yes"
        : "No",
      thermalSupportedModesText:
        diagnostics.thermalTelemetry.supportedThermalOverlayModes.join(", "),
      thermalOverlayModeText: formatThermalOverlayModeText(
        diagnostics.thermalTelemetry,
      ),
      thermalHealthStateText: diagnostics.thermalTelemetry.thermalAvailable
        ? diagnostics.thermalTelemetry.thermalHealthState
        : "Unavailable",
      lastThermalFrameText:
        typeof diagnostics.thermalTelemetry.lastThermalFrameId === "number"
          ? `#${diagnostics.thermalTelemetry.lastThermalFrameId}`
          : "Pending",
      lastThermalTimestampText: formatTimestamp(
        diagnostics.thermalTelemetry.lastThermalTimestampMs,
      ),
      hotspotCountText: formatCount(diagnostics.thermalTelemetry.hotspotCount),
      paletteHintText: diagnostics.thermalTelemetry.paletteHint ?? "Pending",
      thermalErrorText: diagnostics.thermalTelemetry.thermalErrorText ?? "None",
    };
    const irIlluminatorTelemetry = {
      irAvailableText: formatAvailabilityText(
        diagnostics.irIlluminatorTelemetry.irAvailable,
      ),
      irBackendText:
        diagnostics.irIlluminatorTelemetry.irAvailable
          ? diagnostics.irIlluminatorTelemetry.irBackendIdentity ?? "Pending"
          : "Unavailable",
      irEnabledText: formatIrEnabledText(
        diagnostics.irIlluminatorTelemetry,
      ),
      irLevelText: formatIrLevelText(
        diagnostics.irIlluminatorTelemetry,
      ),
      irControlSupportedText: diagnostics.irIlluminatorTelemetry.irControlSupported
        ? "Yes"
        : "No",
      irFaultStateText: diagnostics.irIlluminatorTelemetry.irFaultState ?? "None",
      irErrorText: diagnostics.irIlluminatorTelemetry.irErrorText ?? "None",
    };
    const hearingEnhancementTelemetry = {
      hearingAvailableText: formatAvailabilityText(
        diagnostics.hearingEnhancementTelemetry.hearingEnhancementAvailable,
      ),
      microphoneArrayText: formatAvailabilityText(
        diagnostics.hearingEnhancementTelemetry.microphoneArrayAvailable,
      ),
      hearingBackendText: formatHearingBackendText(
        diagnostics.hearingEnhancementTelemetry,
      ),
      hearingModeText: formatHearingModeText(
        diagnostics.hearingEnhancementTelemetry,
      ),
      hearingGainText: formatHearingGainText(
        diagnostics.hearingEnhancementTelemetry,
      ),
      hearingModesSupportedText:
        diagnostics.hearingEnhancementTelemetry.hearingModesSupported.join(", "),
      hearingHealthStateText: diagnostics.hearingEnhancementTelemetry
        .hearingEnhancementAvailable
        ? diagnostics.hearingEnhancementTelemetry.hearingHealthState
        : "Unavailable",
      hearingLatencyEstimateText:
        diagnostics.hearingEnhancementTelemetry.hearingEnhancementAvailable
          ? formatDuration(
              diagnostics.hearingEnhancementTelemetry.hearingLatencyEstimateMs,
            )
          : "Unavailable",
      hearingErrorText: diagnostics.hearingEnhancementTelemetry.hearingErrorText ?? "None",
    };
    const phoneMediaAudioTelemetry = {
      phoneAudioAvailableText: formatAvailabilityText(
        diagnostics.phoneMediaAudioTelemetry.phoneAudioAvailable,
      ),
      bluetoothAudioConnectedText: formatBluetoothAudioConnectionText(
        diagnostics.phoneMediaAudioTelemetry,
      ),
      mediaPlaybackControlSupportedText:
        diagnostics.phoneMediaAudioTelemetry.mediaPlaybackControlSupported
          ? "Yes"
          : "No",
      mediaPlaybackStateText: formatMediaPlaybackStateText(
        diagnostics.phoneMediaAudioTelemetry,
      ),
      mediaVolumeRangeText: diagnostics.phoneMediaAudioTelemetry.phoneAudioAvailable
        ? `${Math.round(
            diagnostics.phoneMediaAudioTelemetry.mediaVolumeMin * 100,
          )}% - ${Math.round(
            diagnostics.phoneMediaAudioTelemetry.mediaVolumeMax * 100,
          )}%`
        : "Unavailable",
      mediaVolumeTargetText: diagnostics.phoneMediaAudioTelemetry.phoneAudioAvailable
        ? `${Math.round(
            diagnostics.phoneMediaAudioTelemetry.currentVolume * 100,
          )}%`
        : "Unavailable",
      mediaMutedText: diagnostics.phoneMediaAudioTelemetry.mediaMuted
        ? "Muted"
        : "Live",
    };

    return {
      visible: diagnosticsEnabled,
      appRunning: diagnostics.appRunning,
      sourceMode: diagnostics.sourceMode,
      connectionStatusText: diagnostics.connectionStatusText,
      sourceLifecycleText: diagnostics.sourceLifecycleState ?? "detached",
      sourceConnectionStatusText: diagnostics.sourceConnectionStatusText,
      sourceLastFrameText:
        typeof diagnostics.sourceLastFrameId === "number"
          ? `#${diagnostics.sourceLastFrameId}`
          : "Pending",
      sourceLastFrameTimestampText:
        typeof diagnostics.sourceLastFrameTimestampMs === "number"
          ? new Date(diagnostics.sourceLastFrameTimestampMs).toLocaleTimeString()
          : "Pending",
      sourceSceneIdText: diagnostics.sourceSceneId ?? "Pending",
      sourceStreamNameText: diagnostics.sourceStreamName ?? "Pending",
      sourceErrorText: diagnostics.sourceErrorText,
      sourceStatusText: diagnostics.sourceStatusText,
      sourceHealthText: diagnostics.sourceHealthText,
      sourceHealthTone: diagnostics.sourceHealthState,
      transportAdapterText: diagnostics.transportAdapterDisplayName,
      transportConnectionText: diagnostics.transportConnectionStatusText,
      transportStatusText: diagnostics.transportStatusText,
      transportWebSocketUrlText: buildTransportWebSocketUrl(
        diagnostics.transportConfig.host,
        diagnostics.transportConfig.port,
        diagnostics.transportConfig.path,
      ),
      transportHostText: `${diagnostics.transportConfig.host}:${diagnostics.transportConfig.port}`,
      transportReconnectText: diagnostics.transportConfig.reconnectEnabled
        ? "Enabled"
        : "Disabled",
      senderNameText: diagnostics.senderName ?? "Pending",
      transportCapabilitiesText,
      transportImageModesText: diagnostics.transportCapabilities
        ? diagnostics.transportCapabilities.supportedImagePayloadModes.join(", ")
        : "Pending",
      transportSequenceHealthText: formatSequenceHealth(
        diagnostics.transportSequenceHealth,
      ),
      transportLastMessageSizeText: formatByteSize(
        diagnostics.transportLastMessageSizeBytes,
      ),
      transportPayloadLimitsText: `${formatByteSize(
        diagnostics.transportConfig.maxMessageBytes,
      )} max message / ${formatByteSize(
        diagnostics.transportConfig.maxImagePayloadBytes,
      )} max image`,
      transportStereoFormatNoteText: diagnostics.transportCapabilities?.stereoFormatNote,
      transportErrorText: diagnostics.transportErrorText,
      transportParseErrorText: diagnostics.transportParseErrorText,
      transportLastMessageTypeText:
        diagnostics.transportLastMessageType ?? "Pending",
      transportLastSequenceText:
        typeof diagnostics.transportLastSequence === "number"
          ? `#${diagnostics.transportLastSequence}`
          : "Pending",
      transportLastMessageTimestampText:
        typeof diagnostics.transportLastMessageTimestampMs === "number"
          ? new Date(diagnostics.transportLastMessageTimestampMs).toLocaleTimeString()
          : "Pending",
      cameraTelemetry,
      thermalTelemetry,
      irIlluminatorTelemetry,
      hearingEnhancementTelemetry,
      phoneMediaAudioTelemetry,
      statusText: diagnostics.statusText,
      renderStatusText: diagnostics.renderStatusText,
      fpsText,
      lines: [
        `App running: ${diagnostics.appRunning ? "yes" : "no"}`,
        `Source mode: ${diagnostics.sourceMode}`,
        `Control connection: ${diagnostics.connectionStatusText}`,
        `Source lifecycle: ${diagnostics.sourceLifecycleState ?? "detached"}`,
        `Source link: ${diagnostics.sourceConnectionStatusText}`,
        `Source health: ${diagnostics.sourceHealthText}`,
        `Last frame: ${
          typeof diagnostics.sourceLastFrameId === "number"
            ? `#${diagnostics.sourceLastFrameId}`
            : "Pending"
        }`,
        `Last frame time: ${
          typeof diagnostics.sourceLastFrameTimestampMs === "number"
            ? new Date(diagnostics.sourceLastFrameTimestampMs).toLocaleTimeString()
            : "Pending"
        }`,
        `Scene ID: ${diagnostics.sourceSceneId ?? "Pending"}`,
        `Stream name: ${diagnostics.sourceStreamName ?? "Pending"}`,
        `Source status: ${diagnostics.sourceStatusText ?? "none"}`,
        `Source error: ${diagnostics.sourceErrorText ?? "none"}`,
        `Transport adapter: ${diagnostics.transportAdapterDisplayName}`,
        `Transport connection: ${diagnostics.transportConnectionStatusText}`,
        `Transport status: ${diagnostics.transportStatusText}`,
        `Transport URL: ${buildTransportWebSocketUrl(
          diagnostics.transportConfig.host,
          diagnostics.transportConfig.port,
          diagnostics.transportConfig.path,
        )}`,
        `Sender name: ${diagnostics.senderName ?? "Pending"}`,
        `Transport host: ${diagnostics.transportConfig.host}:${diagnostics.transportConfig.port}`,
        `Transport reconnect: ${
          diagnostics.transportConfig.reconnectEnabled ? "enabled" : "disabled"
        }`,
        `Sender capabilities: ${transportCapabilitiesText}`,
        `Image modes: ${
          diagnostics.transportCapabilities
            ? diagnostics.transportCapabilities.supportedImagePayloadModes.join(", ")
            : "none"
        }`,
        `Last message type: ${diagnostics.transportLastMessageType ?? "none"}`,
        `Last sequence: ${
          typeof diagnostics.transportLastSequence === "number"
            ? `#${diagnostics.transportLastSequence}`
            : "none"
        }`,
        `Last message time: ${
          typeof diagnostics.transportLastMessageTimestampMs === "number"
            ? new Date(diagnostics.transportLastMessageTimestampMs).toLocaleTimeString()
            : "Pending"
        }`,
        `Sequence health: ${formatSequenceHealth(
          diagnostics.transportSequenceHealth,
        )}`,
        `Last message size: ${formatByteSize(
          diagnostics.transportLastMessageSizeBytes,
        )}`,
        `Payload limits: ${formatByteSize(
          diagnostics.transportConfig.maxMessageBytes,
        )} max message / ${formatByteSize(
          diagnostics.transportConfig.maxImagePayloadBytes,
        )} max image`,
        `Transport error: ${diagnostics.transportErrorText ?? "none"}`,
        `Protocol parse/validation error: ${
          diagnostics.transportParseErrorText ?? "none"
        }`,
        diagnostics.transportCapabilities?.stereoFormatNote
          ? `Stereo format note: ${diagnostics.transportCapabilities.stereoFormatNote}`
          : "Stereo format note: none",
        ...(cameraTelemetry
          ? [
              `Capture backend: ${cameraTelemetry.captureBackendText}`,
              `Runtime source mode: ${cameraTelemetry.frameSourceModeText}`,
              `Runtime source name: ${cameraTelemetry.frameSourceNameText}`,
              `Bridge mode: ${cameraTelemetry.bridgeModeText}`,
              `Frame size: ${cameraTelemetry.frameSizeText}`,
              `Frame interval: ${cameraTelemetry.frameIntervalText}`,
              `Fallback state: ${cameraTelemetry.fallbackStateText}`,
              `Fallback reason: ${cameraTelemetry.fallbackReasonText}`,
              `Capture health: ${cameraTelemetry.captureHealthStateText}`,
              `Startup validated: ${cameraTelemetry.startupValidatedText}`,
              `Captures attempted: ${cameraTelemetry.capturesAttemptedText}`,
              `Captures succeeded: ${cameraTelemetry.capturesSucceededText}`,
              `Captures failed: ${cameraTelemetry.capturesFailedText}`,
              `Consecutive failures: ${cameraTelemetry.consecutiveFailureCountText}`,
              `Retry budget: ${cameraTelemetry.captureRetryCountText}`,
              `Retry delay: ${cameraTelemetry.captureRetryDelayText}`,
              `Recent retry attempts: ${cameraTelemetry.recentRetryAttemptsText}`,
              `Current retry attempt: ${cameraTelemetry.currentRetryAttemptText}`,
              `Transient failures: ${cameraTelemetry.transientFailureCountText}`,
              `Recoveries: ${cameraTelemetry.recoveryCountText}`,
              `Last successful capture: ${cameraTelemetry.lastSuccessfulCaptureTimeText}`,
              `Last recovery: ${cameraTelemetry.lastRecoveryTimeText}`,
              `Last terminal failure: ${cameraTelemetry.lastTerminalFailureTimeText}`,
              `Last capture duration: ${cameraTelemetry.lastCaptureDurationText}`,
              `Average capture duration: ${cameraTelemetry.averageCaptureDurationText}`,
              `Effective frame interval: ${cameraTelemetry.effectiveFrameIntervalText}`,
              `Telemetry updated: ${cameraTelemetry.telemetryUpdatedAtText}`,
              `Telemetry freshness: ${cameraTelemetry.telemetryCurrentText}`,
              `Telemetry stale threshold: ${cameraTelemetry.telemetryStaleThresholdText}`,
              `Recent capture issues: ${cameraTelemetry.recentCaptureEventsText}`,
              `Replay source: ${cameraTelemetry.replaySourceIdentityText}`,
              `Replay loop: ${cameraTelemetry.replayLoopText}`,
              `Replay pair: ${cameraTelemetry.replayIndexText}`,
              `Replay timing mode: ${cameraTelemetry.replayTimingModeText}`,
              `Replay time scale: ${cameraTelemetry.replayTimeScaleText}`,
              `Replay manifest loaded: ${cameraTelemetry.replayManifestLoadedText}`,
              `Replay manifest validated: ${cameraTelemetry.replayManifestValidatedText}`,
              `Replay manifest errors: ${cameraTelemetry.replayManifestErrorCountText}`,
              `Replay manifest warnings: ${cameraTelemetry.replayManifestWarningCountText}`,
              `Replay manifest source: ${cameraTelemetry.replayManifestSourceText}`,
              `Replay validation summary: ${cameraTelemetry.replayValidationSummaryText}`,
              `Replay recorded timestamp: ${cameraTelemetry.replayRecordedTimestampText}`,
              `Replay delay until next: ${cameraTelemetry.replayDelayUntilNextText}`,
              `Replay scaled delay until next: ${cameraTelemetry.replayScaledDelayUntilNextText}`,
              `Replay timing offset: ${cameraTelemetry.replayTimingOffsetText}`,
              `Replay nominal loop duration: ${cameraTelemetry.replayNominalLoopDurationText}`,
              `Replay scaled loop duration: ${cameraTelemetry.replayScaledLoopDurationText}`,
              `Left replay source: ${cameraTelemetry.replayLeftSourceText}`,
              `Right replay source: ${cameraTelemetry.replayRightSourceText}`,
              `Left camera device: ${cameraTelemetry.leftCameraDeviceText}`,
              `Right camera device: ${cameraTelemetry.rightCameraDeviceText}`,
              `gst-launch path: ${cameraTelemetry.gstLaunchPathText}`,
            ]
          : []),
        `Thermal available: ${thermalTelemetry.thermalAvailableText}`,
        `Thermal backend: ${thermalTelemetry.thermalBackendText}`,
        `Thermal frame size: ${thermalTelemetry.thermalFrameSizeText}`,
        `Thermal frame rate: ${thermalTelemetry.thermalFrameRateText}`,
        `Thermal overlay supported: ${thermalTelemetry.thermalOverlaySupportedText}`,
        `Thermal overlay modes: ${thermalTelemetry.thermalSupportedModesText}`,
        `Current thermal mode: ${thermalTelemetry.thermalOverlayModeText}`,
        `Operator thermal mode: ${settings.thermalOverlayMode}`,
        `Thermal health: ${thermalTelemetry.thermalHealthStateText}`,
        `Last thermal frame: ${thermalTelemetry.lastThermalFrameText}`,
        `Last thermal frame time: ${thermalTelemetry.lastThermalTimestampText}`,
        `Thermal hotspot count: ${thermalTelemetry.hotspotCountText}`,
        `Thermal palette: ${thermalTelemetry.paletteHintText}`,
        `Thermal error: ${thermalTelemetry.thermalErrorText}`,
        `IR available: ${irIlluminatorTelemetry.irAvailableText}`,
        `IR backend: ${irIlluminatorTelemetry.irBackendText}`,
        `IR enabled: ${irIlluminatorTelemetry.irEnabledText}`,
        `IR level: ${irIlluminatorTelemetry.irLevelText}`,
        `Operator IR target: ${settings.irEnabled ? "enabled" : "disabled"} @ ${settings.irLevel}`,
        `IR control supported: ${irIlluminatorTelemetry.irControlSupportedText}`,
        `IR fault state: ${irIlluminatorTelemetry.irFaultStateText}`,
        `IR error: ${irIlluminatorTelemetry.irErrorText}`,
        `Hearing enhancement available: ${hearingEnhancementTelemetry.hearingAvailableText}`,
        `Microphone array available: ${hearingEnhancementTelemetry.microphoneArrayText}`,
        `Hearing backend: ${hearingEnhancementTelemetry.hearingBackendText}`,
        `Current hearing mode: ${hearingEnhancementTelemetry.hearingModeText}`,
        `Current hearing gain: ${hearingEnhancementTelemetry.hearingGainText}`,
        `Supported hearing modes: ${hearingEnhancementTelemetry.hearingModesSupportedText}`,
        `Hearing health: ${hearingEnhancementTelemetry.hearingHealthStateText}`,
        `Hearing latency estimate: ${hearingEnhancementTelemetry.hearingLatencyEstimateText}`,
        `Hearing error: ${hearingEnhancementTelemetry.hearingErrorText}`,
        `Operator hearing target: ${settings.hearingMode} @ ${Math.round(
          settings.hearingGain * 100,
        )}%`,
        `Phone audio available: ${phoneMediaAudioTelemetry.phoneAudioAvailableText}`,
        `Bluetooth audio: ${phoneMediaAudioTelemetry.bluetoothAudioConnectedText}`,
        `Media playback control supported: ${phoneMediaAudioTelemetry.mediaPlaybackControlSupportedText}`,
        `Media playback state: ${phoneMediaAudioTelemetry.mediaPlaybackStateText}`,
        `Media volume range: ${phoneMediaAudioTelemetry.mediaVolumeRangeText}`,
        `Media volume target: ${phoneMediaAudioTelemetry.mediaVolumeTargetText}`,
        `Media muted target: ${phoneMediaAudioTelemetry.mediaMutedText}`,
        `Render: ${diagnostics.renderStatusText}`,
        `FPS: ${fpsText}`,
      ],
    };
  }

  subscribe(listener: DiagnosticsPanelListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.settingsUnsubscribe();
    this.diagnosticsUnsubscribe();
    this.listeners.clear();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function buildTransportWebSocketUrl(
  host: string,
  port: number,
  path: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (/^wss?:\/\//i.test(host)) {
    const url = new URL(host);
    if (port > 0) {
      url.port = String(port);
    }
    url.pathname = normalizedPath;
    return url.toString();
  }

  return `ws://${host}:${port}${normalizedPath}`;
}

function formatSequenceHealth(snapshot: {
  readonly repeatedCount: number;
  readonly outOfOrderCount: number;
  readonly droppedCountEstimate: number;
  readonly lastAnomalyText?: string;
}): string {
  if (
    snapshot.repeatedCount === 0 &&
    snapshot.outOfOrderCount === 0 &&
    snapshot.droppedCountEstimate === 0
  ) {
    return "Healthy";
  }

  return [
    `Repeated ${snapshot.repeatedCount}, out-of-order ${snapshot.outOfOrderCount}, dropped est ${snapshot.droppedCountEstimate}`,
    snapshot.lastAnomalyText ? `last anomaly: ${snapshot.lastAnomalyText}` : undefined,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" | ");
}

function formatRuntimeSourceModeText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  return cameraTelemetry?.frameSourceMode ?? "Pending";
}

function formatRuntimeSourceNameText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  return (
    cameraTelemetry?.frameSourceName ??
    cameraTelemetry?.captureBackendName ??
    "Pending"
  );
}

function formatBridgeModeText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  if (cameraTelemetry?.bridgeMode) {
    return cameraTelemetry.bridgeMode;
  }

  if (cameraTelemetry?.frameSourceMode === "camera") {
    return "visible_camera";
  }

  if (cameraTelemetry?.frameSourceMode === "simulated") {
    return "simulated";
  }

  return "Pending";
}

function formatFrameSizeText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  if (
    typeof cameraTelemetry?.frameWidth === "number" &&
    typeof cameraTelemetry?.frameHeight === "number"
  ) {
    return `${cameraTelemetry.frameWidth} x ${cameraTelemetry.frameHeight}`;
  }

  return "Pending";
}

function formatFrameIntervalText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  const intervalMs =
    cameraTelemetry?.frameIntervalMs ?? cameraTelemetry?.effectiveFrameIntervalMs;
  return typeof intervalMs === "number" ? `${intervalMs.toFixed(1)} ms` : "Pending";
}

function formatResolutionPair(
  width: number | undefined,
  height: number | undefined,
): string {
  return typeof width === "number" && typeof height === "number"
    ? `${width} x ${height}`
    : "Pending";
}

function formatFramesPerSecond(value: number | undefined): string {
  return typeof value === "number" ? `${value.toFixed(2)} FPS` : "Pending";
}

function formatAvailableProfilesText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  return cameraTelemetry?.availableProfileNames?.length
    ? cameraTelemetry.availableProfileNames.join(", ")
    : "Pending";
}

function formatPreflightStatusText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  if (!cameraTelemetry?.preflightOverallStatus) {
    return "Pending";
  }

  const counts = [
    `pass=${cameraTelemetry.preflightPassCount ?? "?"}`,
    `warn=${cameraTelemetry.preflightWarnCount ?? "?"}`,
    `fail=${cameraTelemetry.preflightFailCount ?? "?"}`,
    `critical=${cameraTelemetry.preflightCriticalFailCount ?? "?"}`,
  ].join(" ");

  return `${cameraTelemetry.preflightOverallStatus.toUpperCase()} (${counts})`;
}

function formatRecordingStateText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  if (!cameraTelemetry) {
    return "Pending";
  }

  if (!cameraTelemetry.recordingActive) {
    return "Idle";
  }

  return cameraTelemetry.recordingOutputPath
    ? `Active -> ${cameraTelemetry.recordingOutputPath}`
    : "Active";
}

function formatArtifactSummaryText(
  cameraTelemetry: DiagnosticsSnapshot["cameraTelemetry"],
): string {
  if (!cameraTelemetry?.artifactPath) {
    return "Pending";
  }

  const segments = [
    cameraTelemetry.artifactType ?? "artifact",
    cameraTelemetry.artifactPath,
    typeof cameraTelemetry.artifactSizeBytes === "number"
      ? formatByteSize(cameraTelemetry.artifactSizeBytes)
      : undefined,
    cameraTelemetry.artifactCapturedAt,
  ];

  return segments
    .filter((segment): segment is string => typeof segment === "string")
    .join(" | ");
}

function formatByteSize(value: number | undefined): string {
  if (typeof value !== "number") {
    return "Pending";
  }

  if (value <= 0) {
    return "Unlimited";
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function formatCount(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "Pending";
}

function formatAvailabilityText(available: boolean): string {
  return available ? "Available" : "Unavailable";
}

function formatThermalBackendText(thermalTelemetry: ThermalTelemetrySnapshot): string {
  if (!thermalTelemetry.thermalAvailable) {
    return "Unavailable";
  }

  return thermalTelemetry.thermalBackendIdentity ?? "Pending";
}

function formatThermalFrameSizeText(
  thermalTelemetry: ThermalTelemetrySnapshot,
): string {
  if (
    typeof thermalTelemetry.thermalFrameWidth !== "number" ||
    typeof thermalTelemetry.thermalFrameHeight !== "number"
  ) {
    return thermalTelemetry.thermalAvailable ? "Pending" : "Unavailable";
  }

  return `${thermalTelemetry.thermalFrameWidth} x ${thermalTelemetry.thermalFrameHeight}`;
}

function formatThermalFrameRateText(
  thermalTelemetry: ThermalTelemetrySnapshot,
): string {
  if (typeof thermalTelemetry.thermalFrameRate !== "number") {
    return thermalTelemetry.thermalAvailable ? "Pending" : "Unavailable";
  }

  return `${thermalTelemetry.thermalFrameRate.toFixed(2)} FPS`;
}

function formatThermalOverlayModeText(
  thermalTelemetry: ThermalTelemetrySnapshot,
): string {
  if (!thermalTelemetry.thermalAvailable) {
    return "Unavailable";
  }

  return thermalTelemetry.currentOverlayMode;
}

function formatIrEnabledText(
  irTelemetry: IrIlluminatorTelemetrySnapshot,
): string {
  if (!irTelemetry.irAvailable) {
    return "Unavailable";
  }

  return irTelemetry.irEnabled ? "Enabled" : "Disabled";
}

function formatIrLevelText(
  irTelemetry: IrIlluminatorTelemetrySnapshot,
): string {
  if (!irTelemetry.irAvailable) {
    return "Unavailable";
  }

  if (irTelemetry.irMaxLevel > 0) {
    return `${irTelemetry.irLevel}/${irTelemetry.irMaxLevel}`;
  }

  return String(irTelemetry.irLevel);
}

function formatHearingBackendText(
  hearingTelemetry: HearingEnhancementTelemetrySnapshot,
): string {
  if (!hearingTelemetry.hearingEnhancementAvailable) {
    return "Unavailable";
  }

  return hearingTelemetry.audioEnhancementBackendIdentity ?? "Pending";
}

function formatHearingModeText(
  hearingTelemetry: HearingEnhancementTelemetrySnapshot,
): string {
  if (!hearingTelemetry.hearingEnhancementAvailable) {
    return "Unavailable";
  }

  return hearingTelemetry.currentMode;
}

function formatHearingGainText(
  hearingTelemetry: HearingEnhancementTelemetrySnapshot,
): string {
  if (!hearingTelemetry.hearingEnhancementAvailable) {
    return "Unavailable";
  }

  return `${Math.round(hearingTelemetry.currentGain * 100)}%`;
}

function formatBluetoothAudioConnectionText(
  mediaTelemetry: PhoneMediaAudioTelemetrySnapshot,
): string {
  if (!mediaTelemetry.phoneAudioAvailable) {
    return "Unavailable";
  }

  return mediaTelemetry.bluetoothAudioConnected ? "Connected" : "Disconnected";
}

function formatMediaPlaybackStateText(
  mediaTelemetry: PhoneMediaAudioTelemetrySnapshot,
): string {
  if (!mediaTelemetry.phoneAudioAvailable) {
    return "Unavailable";
  }

  return mediaTelemetry.mediaPlaybackState;
}

function formatTimestamp(value: number | undefined): string {
  return typeof value === "number" ? new Date(value).toLocaleTimeString() : "Pending";
}

function formatDuration(value: number | undefined): string {
  return typeof value === "number" ? `${value.toFixed(1)} ms` : "Pending";
}

function formatMultiplier(value: number | undefined): string {
  return typeof value === "number" ? `${value.toFixed(2)}x` : "Pending";
}

function formatSignedDuration(value: number | undefined): string {
  return typeof value === "number"
    ? `${value >= 0 ? "+" : ""}${value.toFixed(1)} ms`
    : "Pending";
}

function formatRecentCaptureEvents(
  events:
    | readonly {
        readonly timestampMs: number;
        readonly eventType: string;
        readonly retryAttempt?: number;
        readonly eye?: string;
        readonly summary: string;
      }[]
    | undefined,
): string {
  if (!events || events.length === 0) {
    return "None";
  }

  return events
    .map((event) => {
      const parts = [
        new Date(event.timestampMs).toLocaleTimeString(),
        event.eventType,
        typeof event.retryAttempt === "number" ? `r${event.retryAttempt}` : undefined,
        event.eye,
        event.summary,
      ];

      return parts
        .filter((part) => typeof part === "string" && part.length > 0)
        .join(" ");
    })
    .join(" | ");
}
