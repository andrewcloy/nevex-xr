import type { Unsubscribe } from "../hand_input/contracts";
import {
  DiagnosticsStore,
  type DiagnosticsSnapshot,
  type CameraTelemetrySnapshot,
  type HearingEnhancementTelemetrySnapshot,
  type IrIlluminatorTelemetrySnapshot,
  type PhoneMediaAudioTelemetrySnapshot,
  type SourceHealthState,
  type ThermalTelemetrySnapshot,
} from "../diagnostics/diagnostics_store";
import {
  HEARING_ENHANCEMENT_MODES,
  type HearingEnhancementMode,
} from "../stereo_viewer/audio_models";
import type {
  LiveTransportAdapterType,
  LiveTransportConfig,
} from "../stereo_viewer/transport_adapter";
import {
  THERMAL_OVERLAY_MODES,
  type ThermalOverlayMode,
} from "../stereo_viewer/thermal_models";
import {
  SettingsStore,
  type SourceMode,
  type XrAppSettingsState,
} from "../settings_state/settings_store";

/**
 * Actions exposed by the application shell to the status panel.
 *
 * The UI talks to the app shell through this narrow boundary rather than
 * calling the control client directly.
 */
export interface StatusPanelActions {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setSourceMode(mode: SourceMode): Promise<void>;
  setLiveTransportAdapterType(type: LiveTransportAdapterType): Promise<void>;
  connectLiveTransport(): Promise<void>;
  disconnectLiveTransport(): Promise<void>;
  applyLiveTransportConfig(): Promise<void>;
  toggleLiveTransportDemoFeed(): Promise<void>;
  injectLiveTransportSamplePayload(): Promise<void>;
  runJetsonPreflight(): Promise<void>;
  refreshJetsonEffectiveConfig(): Promise<void>;
  captureJetsonSnapshot(): Promise<void>;
  selectJetsonProfile(profileName: string): Promise<void>;
  startJetsonRecording(): Promise<void>;
  stopJetsonRecording(): Promise<void>;
}

/**
 * UI-facing snapshot for the simple in-headset status panel.
 */
export interface StatusPanelSnapshot {
  readonly visible: boolean;
  readonly title: string;
  readonly connectionStatusText: string;
  readonly sourceModeText: string;
  readonly statusText: string;
  readonly sourceLifecycleText: string;
  readonly sourceConnectionStatusText: string;
  readonly sourceHealthText: string;
  readonly sourceHealthTone: SourceHealthState;
  readonly runtimeSourceModeText: string;
  readonly runtimeSourceNameText: string;
  readonly bridgeModeText: string;
  readonly captureBackendText: string;
  readonly frameSizeText: string;
  readonly frameIntervalText: string;
  readonly fallbackStateText: string;
  readonly fallbackReasonText?: string;
  readonly fallbackActive: boolean;
  readonly runtimeOperationText: string;
  readonly lastFrameIdText: string;
  readonly lastFrameTimestampText: string;
  readonly telemetryFreshnessText: string;
  readonly lastTelemetryUpdateText: string;
  readonly telemetryStaleThresholdText: string;
  readonly recentCaptureEventsText: string;
  readonly sourceErrorText?: string;
  readonly thermalAvailabilityText: string;
  readonly thermalBackendIdentityText: string;
  readonly thermalOverlayModeText: string;
  readonly thermalHealthText: string;
  readonly thermalSelectedVsReportedText: string;
  readonly thermalControlAvailable: boolean;
  readonly thermalControlDisabledReason?: string;
  readonly thermalOverlayModeOptions: readonly ThermalOverlayMode[];
  readonly selectedThermalOverlayMode: ThermalOverlayMode;
  readonly irAvailabilityText: string;
  readonly irEnabledText: string;
  readonly irLevelText: string;
  readonly irSelectedVsReportedText: string;
  readonly irControlAvailable: boolean;
  readonly irControlDisabledReason?: string;
  readonly irEnabled: boolean;
  readonly irLevel: number;
  readonly irMaxLevel: number;
  readonly hearingAvailabilityText: string;
  readonly hearingBackendIdentityText: string;
  readonly hearingModeText: string;
  readonly hearingGainText: string;
  readonly hearingHealthText: string;
  readonly hearingControlAvailable: boolean;
  readonly hearingControlDisabledReason?: string;
  readonly hearingModeOptions: readonly HearingEnhancementMode[];
  readonly selectedHearingMode: HearingEnhancementMode;
  readonly hearingGain: number;
  readonly hearingGainMin: number;
  readonly hearingGainMax: number;
  readonly phoneAudioAvailabilityText: string;
  readonly bluetoothAudioConnectionText: string;
  readonly mediaPlaybackStateText: string;
  readonly mediaControlAvailable: boolean;
  readonly mediaControlDisabledReason?: string;
  readonly mediaVolume: number;
  readonly mediaVolumeText: string;
  readonly mediaVolumeMin: number;
  readonly mediaVolumeMax: number;
  readonly mediaMuted: boolean;
  readonly mediaMutedText: string;
  readonly transportAdapterType: LiveTransportAdapterType;
  readonly transportAdapterDisplayName: string;
  readonly transportConnectionStatusText: string;
  readonly transportLifecycleText: string;
  readonly transportStatusText: string;
  readonly transportHost: string;
  readonly transportPort: number;
  readonly transportReconnectEnabled: boolean;
  readonly transportPath: string;
  readonly transportStreamName: string;
  readonly transportWebSocketUrl: string;
  readonly transportParseErrorText?: string;
  readonly transportCapabilitiesText: string;
  readonly transportImageModesText: string;
  readonly transportSequenceHealthText: string;
  readonly transportLastMessageSizeText: string;
  readonly transportPayloadLimitsText: string;
  readonly transportStereoFormatNoteText?: string;
  readonly transportLastMessageTypeText: string;
  readonly transportLastSequenceText: string;
  readonly transportLastMessageTimestampText: string;
  readonly liveTransportDemoFeedActive: boolean;
  readonly jetsonControlModeText: string;
  readonly jetsonOperatorControlsAvailable: boolean;
  readonly jetsonOperatorControlsDisabledReason?: string;
  readonly jetsonRuntimeStatusText: string;
  readonly jetsonRuntimeProfileText: string;
  readonly jetsonProfileOptions: readonly string[];
  readonly jetsonSelectedProfileName?: string;
  readonly jetsonPreflightText: string;
  readonly jetsonRecordingActive: boolean;
  readonly jetsonRecordingStateText: string;
  readonly jetsonArtifactText: string;
  readonly brightness: number;
  readonly overlayEnabled: boolean;
  readonly modeToggleValue: SourceMode;
  readonly connectButtonLabel: string;
  readonly lines: readonly string[];
}

/**
 * Listener invoked when the status panel snapshot changes.
 */
export type StatusPanelListener = (snapshot: StatusPanelSnapshot) => void;

/**
 * Render-agnostic controller for the initial settings and status panel.
 */
export class StatusPanelController {
  private readonly settingsStore: SettingsStore;

  private readonly diagnosticsStore: DiagnosticsStore;

  private readonly actions: StatusPanelActions;

  private readonly listeners = new Set<StatusPanelListener>();

  private readonly settingsUnsubscribe: Unsubscribe;

  private readonly diagnosticsUnsubscribe: Unsubscribe;

  private visible = true;

  constructor(
    settingsStore: SettingsStore,
    diagnosticsStore: DiagnosticsStore,
    actions: StatusPanelActions,
  ) {
    this.settingsStore = settingsStore;
    this.diagnosticsStore = diagnosticsStore;
    this.actions = actions;

    this.settingsUnsubscribe = this.settingsStore.subscribe(() => {
      this.emit();
    });
    this.diagnosticsUnsubscribe = this.diagnosticsStore.subscribe(() => {
      this.emit();
    });
  }

  getSnapshot(): StatusPanelSnapshot {
    const settings = this.settingsStore.getSnapshot();
    const diagnostics = this.diagnosticsStore.getSnapshot();
    const connectionStatusText = settings.isConnected
      ? "Connected"
      : "Disconnected";
    const lastFrameIdText =
      typeof diagnostics.sourceLastFrameId === "number"
        ? `#${diagnostics.sourceLastFrameId}`
        : "Pending";
    const lastFrameTimestampText =
      typeof diagnostics.sourceLastFrameTimestampMs === "number"
        ? new Date(diagnostics.sourceLastFrameTimestampMs).toLocaleTimeString()
        : "Pending";
    const transportLastMessageTypeText =
      diagnostics.transportLastMessageType ?? "Pending";
    const transportLastSequenceText =
      typeof diagnostics.transportLastSequence === "number"
        ? `#${diagnostics.transportLastSequence}`
        : "Pending";
    const transportLastMessageTimestampText =
      typeof diagnostics.transportLastMessageTimestampMs === "number"
        ? new Date(diagnostics.transportLastMessageTimestampMs).toLocaleTimeString()
        : "Pending";
    const transportCapabilitiesText = diagnostics.transportCapabilities
      ? `${diagnostics.transportCapabilities.senderName}${
          diagnostics.transportCapabilities.senderVersion
            ? ` v${diagnostics.transportCapabilities.senderVersion}`
            : ""
        }`
      : "Pending";
    const transportImageModesText = diagnostics.transportCapabilities
      ? diagnostics.transportCapabilities.supportedImagePayloadModes.join(", ")
      : "Pending";
    const telemetryFreshnessText =
      diagnostics.cameraTelemetry?.telemetryCurrent === undefined
        ? "Pending"
        : diagnostics.cameraTelemetry.telemetryCurrent
          ? "Current"
          : "Stale";
    const lastTelemetryUpdateText =
      typeof diagnostics.cameraTelemetry?.telemetryUpdatedAtMs === "number"
        ? new Date(diagnostics.cameraTelemetry.telemetryUpdatedAtMs).toLocaleTimeString()
        : "Pending";
    const telemetryStaleThresholdText =
      typeof diagnostics.cameraTelemetry?.telemetryStaleThresholdMs === "number"
        ? `${diagnostics.cameraTelemetry.telemetryStaleThresholdMs} ms`
        : "Pending";
    const recentCaptureEventsText = formatRecentCaptureEvents(
      diagnostics.cameraTelemetry?.recentCaptureEvents,
    );
    const runtimeSourceModeText = formatRuntimeSourceModeText(
      diagnostics.cameraTelemetry,
    );
    const runtimeSourceNameText = formatRuntimeSourceNameText(
      diagnostics.cameraTelemetry,
    );
    const bridgeModeText = formatBridgeModeText(diagnostics.cameraTelemetry);
    const captureBackendText = formatCaptureBackendText(
      diagnostics.cameraTelemetry,
    );
    const frameSizeText = formatFrameSizeText(diagnostics.cameraTelemetry);
    const frameIntervalText = formatFrameIntervalText(diagnostics.cameraTelemetry);
    const fallbackActive = diagnostics.cameraTelemetry?.fallbackActive ?? false;
    const fallbackReasonText = diagnostics.cameraTelemetry?.fallbackReason;
    const fallbackStateText =
      diagnostics.cameraTelemetry === undefined
        ? "Pending"
        : fallbackActive
          ? "Active"
          : "Inactive";
    const runtimeOperationText = formatRuntimeOperationText(
      runtimeSourceModeText,
      fallbackActive,
    );
    const thermalAvailabilityText = formatAvailabilityText(
      diagnostics.thermalTelemetry.thermalAvailable,
    );
    const thermalBackendIdentityText = formatThermalBackendText(
      diagnostics.thermalTelemetry,
    );
    const thermalOverlayModeText = formatThermalOverlayModeText(
      diagnostics.thermalTelemetry,
    );
    const thermalHealthText = formatThermalHealthText(diagnostics.thermalTelemetry);
    const thermalSelectedVsReportedText = formatThermalSelectedVsReportedText(
      settings.thermalOverlayMode,
      diagnostics.thermalTelemetry,
    );
    const thermalControlAvailable =
      diagnostics.thermalTelemetry.thermalAvailable &&
      diagnostics.thermalTelemetry.thermalOverlaySupported;
    const thermalControlDisabledReason = thermalControlAvailable
      ? undefined
      : !diagnostics.thermalTelemetry.thermalAvailable
        ? "Thermal hardware unavailable."
        : "Thermal overlay control unavailable.";
    const thermalOverlayModeOptions =
      diagnostics.thermalTelemetry.supportedThermalOverlayModes.length > 0
        ? diagnostics.thermalTelemetry.supportedThermalOverlayModes
        : THERMAL_OVERLAY_MODES;
    const irAvailabilityText = formatAvailabilityText(
      diagnostics.irIlluminatorTelemetry.irAvailable,
    );
    const irControlAvailable =
      diagnostics.irIlluminatorTelemetry.irAvailable &&
      diagnostics.irIlluminatorTelemetry.irControlSupported &&
      diagnostics.irIlluminatorTelemetry.irMaxLevel > 0;
    const irEnabledText = formatIrEnabledText(
      diagnostics.irIlluminatorTelemetry,
    );
    const irLevelText = formatIrLevelText(
      diagnostics.irIlluminatorTelemetry,
    );
    const irSelectedVsReportedText = formatIrSelectedVsReportedText(
      settings.irEnabled,
      settings.irLevel,
      diagnostics.irIlluminatorTelemetry,
    );
    const irControlDisabledReason = irControlAvailable
      ? undefined
      : !diagnostics.irIlluminatorTelemetry.irAvailable
        ? "IR illuminator unavailable."
        : !diagnostics.irIlluminatorTelemetry.irControlSupported
          ? "IR control unsupported."
          : "IR level unavailable.";
    const hearingAvailabilityText = formatAvailabilityText(
      diagnostics.hearingEnhancementTelemetry.hearingEnhancementAvailable,
    );
    const hearingBackendIdentityText = formatHearingBackendText(
      diagnostics.hearingEnhancementTelemetry,
    );
    const hearingModeText = formatHearingModeText(
      diagnostics.hearingEnhancementTelemetry,
    );
    const hearingGainText = formatHearingGainText(
      diagnostics.hearingEnhancementTelemetry,
    );
    const hearingHealthText = formatHearingHealthText(
      diagnostics.hearingEnhancementTelemetry,
    );
    const hearingModeOptions =
      diagnostics.hearingEnhancementTelemetry.hearingModesSupported.length > 0
        ? diagnostics.hearingEnhancementTelemetry.hearingModesSupported
        : HEARING_ENHANCEMENT_MODES;
    const hearingControlAvailable =
      diagnostics.hearingEnhancementTelemetry.hearingEnhancementAvailable &&
      diagnostics.hearingEnhancementTelemetry.microphoneArrayAvailable &&
      hearingModeOptions.length > 0;
    const hearingControlDisabledReason = hearingControlAvailable
      ? undefined
      : !diagnostics.hearingEnhancementTelemetry.hearingEnhancementAvailable
        ? "Hearing enhancement unavailable."
        : !diagnostics.hearingEnhancementTelemetry.microphoneArrayAvailable
          ? "Microphone array unavailable."
          : "Hearing controls unavailable.";
    const phoneAudioAvailabilityText = formatAvailabilityText(
      diagnostics.phoneMediaAudioTelemetry.phoneAudioAvailable,
    );
    const bluetoothAudioConnectionText = formatBluetoothConnectionText(
      diagnostics.phoneMediaAudioTelemetry,
    );
    const mediaPlaybackStateText = formatMediaPlaybackStateText(
      diagnostics.phoneMediaAudioTelemetry,
    );
    const mediaControlAvailable =
      diagnostics.phoneMediaAudioTelemetry.phoneAudioAvailable &&
      diagnostics.phoneMediaAudioTelemetry.mediaPlaybackControlSupported;
    const mediaControlDisabledReason = mediaControlAvailable
      ? undefined
      : !diagnostics.phoneMediaAudioTelemetry.phoneAudioAvailable
        ? "Phone/media audio unavailable."
        : "Media playback controls unsupported.";
    const normalizedHearingGain = clamp(
      settings.hearingGain,
      diagnostics.hearingEnhancementTelemetry.hearingGainMin,
      diagnostics.hearingEnhancementTelemetry.hearingGainMax,
    );
    const normalizedMediaVolume = clamp(
      settings.mediaVolume,
      diagnostics.phoneMediaAudioTelemetry.mediaVolumeMin,
      diagnostics.phoneMediaAudioTelemetry.mediaVolumeMax,
    );
    const jetsonControlModeText = formatJetsonControlModeText(settings, diagnostics);
    const jetsonOperatorControlState = resolveJetsonOperatorControlState(
      settings,
      diagnostics,
    );
    const jetsonRuntimeStatusText = diagnostics.sourceStatusText ?? "Pending";
    const jetsonRuntimeProfileText =
      diagnostics.cameraTelemetry?.runtimeProfileName ?? "Pending";
    const jetsonProfileOptions =
      settings.sourceMode === "live" &&
      settings.liveTransportAdapterType === "jetson_stub" &&
      diagnostics.cameraTelemetry?.availableProfileNames
        ? diagnostics.cameraTelemetry.availableProfileNames
        : [];
    const jetsonSelectedProfileName = diagnostics.cameraTelemetry?.runtimeProfileName;
    const jetsonPreflightText = formatJetsonPreflightText(
      diagnostics.cameraTelemetry,
    );
    const jetsonRecordingActive = diagnostics.cameraTelemetry?.recordingActive ?? false;
    const jetsonRecordingStateText = formatJetsonRecordingStateText(
      diagnostics.cameraTelemetry,
    );
    const jetsonArtifactText = formatJetsonArtifactText(diagnostics.cameraTelemetry);

    return {
      visible: this.visible,
      title: "Samsung XR Status",
      connectionStatusText,
      sourceModeText: settings.sourceMode.toUpperCase(),
      statusText: settings.statusText,
      sourceLifecycleText: diagnostics.sourceLifecycleState ?? "detached",
      sourceConnectionStatusText: diagnostics.sourceConnectionStatusText,
      sourceHealthText: diagnostics.sourceHealthText,
      sourceHealthTone: diagnostics.sourceHealthState,
      runtimeSourceModeText,
      runtimeSourceNameText,
      bridgeModeText,
      captureBackendText,
      frameSizeText,
      frameIntervalText,
      fallbackStateText,
      fallbackReasonText,
      fallbackActive,
      runtimeOperationText,
      lastFrameIdText,
      lastFrameTimestampText,
      telemetryFreshnessText,
      lastTelemetryUpdateText,
      telemetryStaleThresholdText,
      recentCaptureEventsText,
      sourceErrorText: diagnostics.sourceErrorText,
      thermalAvailabilityText,
      thermalBackendIdentityText,
      thermalOverlayModeText,
      thermalHealthText,
      thermalSelectedVsReportedText,
      thermalControlAvailable,
      thermalControlDisabledReason,
      thermalOverlayModeOptions,
      selectedThermalOverlayMode: settings.thermalOverlayMode,
      irAvailabilityText,
      irEnabledText,
      irLevelText,
      irSelectedVsReportedText,
      irControlAvailable,
      irControlDisabledReason,
      irEnabled: settings.irEnabled,
      irLevel: settings.irLevel,
      irMaxLevel: diagnostics.irIlluminatorTelemetry.irMaxLevel,
      hearingAvailabilityText,
      hearingBackendIdentityText,
      hearingModeText,
      hearingGainText,
      hearingHealthText,
      hearingControlAvailable,
      hearingControlDisabledReason,
      hearingModeOptions,
      selectedHearingMode: settings.hearingMode,
      hearingGain: normalizedHearingGain,
      hearingGainMin: diagnostics.hearingEnhancementTelemetry.hearingGainMin,
      hearingGainMax: diagnostics.hearingEnhancementTelemetry.hearingGainMax,
      phoneAudioAvailabilityText,
      bluetoothAudioConnectionText,
      mediaPlaybackStateText,
      mediaControlAvailable,
      mediaControlDisabledReason,
      mediaVolume: normalizedMediaVolume,
      mediaVolumeText: formatMediaVolumeText(
        diagnostics.phoneMediaAudioTelemetry,
        normalizedMediaVolume,
      ),
      mediaVolumeMin: diagnostics.phoneMediaAudioTelemetry.mediaVolumeMin,
      mediaVolumeMax: diagnostics.phoneMediaAudioTelemetry.mediaVolumeMax,
      mediaMuted: settings.mediaMuted,
      mediaMutedText: settings.mediaMuted ? "Muted" : "Live",
      transportAdapterType: settings.liveTransportAdapterType,
      transportAdapterDisplayName: settings.liveTransportAdapterDisplayName,
      transportConnectionStatusText: diagnostics.transportConnectionStatusText,
      transportLifecycleText: diagnostics.transportLifecycleText,
      transportStatusText: diagnostics.transportStatusText,
      transportHost: settings.liveTransportConfig.host,
      transportPort: settings.liveTransportConfig.port,
      transportReconnectEnabled: settings.liveTransportConfig.reconnectEnabled,
      transportPath: settings.liveTransportConfig.path,
      transportStreamName: settings.liveTransportConfig.streamName,
      transportWebSocketUrl: buildTransportWebSocketUrl(settings.liveTransportConfig),
      transportParseErrorText: diagnostics.transportParseErrorText,
      transportCapabilitiesText,
      transportImageModesText,
      transportSequenceHealthText: formatSequenceHealth(
        diagnostics.transportSequenceHealth,
      ),
      transportLastMessageSizeText: formatByteSize(
        diagnostics.transportLastMessageSizeBytes,
      ),
      transportPayloadLimitsText: `${formatByteSize(
        settings.liveTransportConfig.maxMessageBytes,
      )} max message / ${formatByteSize(
        settings.liveTransportConfig.maxImagePayloadBytes,
      )} max image`,
      transportStereoFormatNoteText: diagnostics.transportCapabilities?.stereoFormatNote,
      transportLastMessageTypeText,
      transportLastSequenceText,
      transportLastMessageTimestampText,
      liveTransportDemoFeedActive: settings.liveTransportDemoFeedActive,
      jetsonControlModeText,
      jetsonOperatorControlsAvailable: jetsonOperatorControlState.available,
      jetsonOperatorControlsDisabledReason: jetsonOperatorControlState.reason,
      jetsonRuntimeStatusText,
      jetsonRuntimeProfileText,
      jetsonProfileOptions,
      jetsonSelectedProfileName,
      jetsonPreflightText,
      jetsonRecordingActive,
      jetsonRecordingStateText,
      jetsonArtifactText,
      brightness: settings.brightness,
      overlayEnabled: settings.overlayEnabled,
      modeToggleValue: settings.sourceMode,
      connectButtonLabel: settings.isConnected ? "Disconnect" : "Connect",
      lines: [
        `Control: ${connectionStatusText}`,
        `Source mode: ${settings.sourceMode}`,
        `Source state: ${diagnostics.sourceLifecycleState ?? "detached"}`,
        `Source link: ${diagnostics.sourceConnectionStatusText}`,
        `Source health: ${diagnostics.sourceHealthText}`,
        `Runtime source mode: ${runtimeSourceModeText}`,
        `Runtime source name: ${runtimeSourceNameText}`,
        `Bridge mode: ${bridgeModeText}`,
        `Capture backend: ${captureBackendText}`,
        `Frame size: ${frameSizeText}`,
        `Frame interval: ${frameIntervalText}`,
        `Fallback: ${
          fallbackActive && fallbackReasonText
            ? `${fallbackStateText} (${fallbackReasonText})`
            : fallbackStateText
        }`,
        `Runtime operation: ${runtimeOperationText}`,
        `Last frame: ${lastFrameIdText}`,
        `Last frame time: ${lastFrameTimestampText}`,
        `Telemetry freshness: ${telemetryFreshnessText}`,
        `Last telemetry update: ${lastTelemetryUpdateText}`,
        `Telemetry stale threshold: ${telemetryStaleThresholdText}`,
        `Recent capture issues: ${recentCaptureEventsText}`,
        ...buildReplayStatusLines(diagnostics.cameraTelemetry),
        `Thermal: ${thermalAvailabilityText}`,
        `Thermal control: ${thermalControlAvailable ? "Available" : thermalControlDisabledReason ?? "Unavailable"}`,
        `Thermal backend: ${thermalBackendIdentityText}`,
        `Thermal mode reported: ${thermalOverlayModeText}`,
        `Thermal mode selected: ${settings.thermalOverlayMode}`,
        `Thermal health: ${thermalHealthText}`,
        `IR illuminator: ${irAvailabilityText}`,
        `IR control: ${irControlAvailable ? "Available" : irControlDisabledReason ?? "Unavailable"}`,
        `IR enabled reported: ${irEnabledText}`,
        `IR level reported: ${irLevelText}`,
        `IR target selected: ${settings.irEnabled ? "Enabled" : "Disabled"} @ ${settings.irLevel}`,
        `Hearing enhancement: ${hearingAvailabilityText}`,
        `Hearing control: ${hearingControlAvailable ? "Available" : hearingControlDisabledReason ?? "Unavailable"}`,
        `Hearing backend: ${hearingBackendIdentityText}`,
        `Hearing mode selected: ${settings.hearingMode}`,
        `Hearing mode reported: ${hearingModeText}`,
        `Hearing gain selected: ${(normalizedHearingGain * 100).toFixed(0)}%`,
        `Hearing gain reported: ${hearingGainText}`,
        `Hearing health: ${hearingHealthText}`,
        `Phone audio: ${phoneAudioAvailabilityText}`,
        `Bluetooth audio: ${bluetoothAudioConnectionText}`,
        `Media playback: ${mediaPlaybackStateText}`,
        `Media control: ${mediaControlAvailable ? "Available" : mediaControlDisabledReason ?? "Unavailable"}`,
        `Media volume selected: ${(normalizedMediaVolume * 100).toFixed(0)}%`,
        `Media muted: ${settings.mediaMuted ? "Yes" : "No"}`,
        `Transport adapter: ${settings.liveTransportAdapterDisplayName}`,
        `Transport connection: ${diagnostics.transportConnectionStatusText}`,
        `Transport lifecycle: ${diagnostics.transportLifecycleText}`,
        `Transport: ${diagnostics.transportStatusText}`,
        `Transport host: ${settings.liveTransportConfig.host}:${settings.liveTransportConfig.port}`,
        `Transport path: ${settings.liveTransportConfig.path}`,
        `Transport URL: ${buildTransportWebSocketUrl(settings.liveTransportConfig)}`,
        `Sender capabilities: ${transportCapabilitiesText}`,
        `Image modes: ${transportImageModesText}`,
        `Last message type: ${transportLastMessageTypeText}`,
        `Last sequence: ${transportLastSequenceText}`,
        `Last message time: ${transportLastMessageTimestampText}`,
        `Sequence health: ${formatSequenceHealth(diagnostics.transportSequenceHealth)}`,
        `Last message size: ${formatByteSize(diagnostics.transportLastMessageSizeBytes)}`,
        `Payload limits: ${formatByteSize(
          settings.liveTransportConfig.maxMessageBytes,
        )} max message / ${formatByteSize(
          settings.liveTransportConfig.maxImagePayloadBytes,
        )} max image`,
        `Transport reconnect: ${
          settings.liveTransportConfig.reconnectEnabled ? "enabled" : "disabled"
        }`,
        `Transport error: ${diagnostics.transportErrorText ?? "none"}`,
        `Protocol parse/validation error: ${
          diagnostics.transportParseErrorText ?? "none"
        }`,
        `Jetson control plane: ${jetsonControlModeText}`,
        `Jetson runtime status: ${jetsonRuntimeStatusText}`,
        `Jetson profile: ${jetsonRuntimeProfileText}`,
        `Jetson preflight: ${jetsonPreflightText}`,
        `Jetson recording: ${jetsonRecordingStateText}`,
        `Jetson artifact: ${jetsonArtifactText}`,
        diagnostics.transportCapabilities?.stereoFormatNote
          ? `Stereo format note: ${diagnostics.transportCapabilities.stereoFormatNote}`
          : "Stereo format note: none",
        `Brightness: ${settings.brightness.toFixed(2)}`,
        `Overlay: ${settings.overlayEnabled ? "enabled" : "disabled"}`,
        diagnostics.sourceErrorText
          ? `Source error: ${diagnostics.sourceErrorText}`
          : "Source error: none",
      ],
    };
  }

  subscribe(listener: StatusPanelListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  show(): void {
    this.visible = true;
    this.emit();
  }

  hide(): void {
    this.visible = false;
    this.emit();
  }

  async pressConnect(): Promise<void> {
    await this.actions.connect();
  }

  async pressDisconnect(): Promise<void> {
    await this.actions.disconnect();
  }

  async pressConnectionButton(): Promise<void> {
    if (this.settingsStore.getSnapshot().isConnected) {
      await this.pressDisconnect();
      return;
    }

    await this.pressConnect();
  }

  async setSourceMode(mode: SourceMode): Promise<void> {
    await this.actions.setSourceMode(mode);
  }

  async setLiveTransportAdapterType(
    type: LiveTransportAdapterType,
  ): Promise<void> {
    await this.actions.setLiveTransportAdapterType(type);
  }

  async connectLiveTransport(): Promise<void> {
    await this.actions.connectLiveTransport();
  }

  async disconnectLiveTransport(): Promise<void> {
    await this.actions.disconnectLiveTransport();
  }

  async toggleSourceMode(): Promise<void> {
    const currentMode = this.settingsStore.getSnapshot().sourceMode;
    await this.setSourceMode(currentMode === "mock" ? "live" : "mock");
  }

  setBrightness(value: number): void {
    this.settingsStore.setBrightness(value);
  }

  setUiAudioEnabled(enabled: boolean): void {
    this.settingsStore.setUiAudioEnabled(enabled);
  }

  setUiClickVolume(volume: number): void {
    this.settingsStore.setUiClickVolume(volume);
  }

  setUiBootVolume(volume: number): void {
    this.settingsStore.setUiBootVolume(volume);
  }

  updateTransportConfig(patch: Partial<LiveTransportConfig>): void {
    this.settingsStore.updateLiveTransportConfig(patch);
  }

  async applyTransportConfig(): Promise<void> {
    await this.actions.applyLiveTransportConfig();
  }

  async toggleLiveTransportDemoFeed(): Promise<void> {
    await this.actions.toggleLiveTransportDemoFeed();
  }

  async injectLiveTransportSamplePayload(): Promise<void> {
    await this.actions.injectLiveTransportSamplePayload();
  }

  async runJetsonPreflight(): Promise<void> {
    await this.actions.runJetsonPreflight();
  }

  async refreshJetsonEffectiveConfig(): Promise<void> {
    await this.actions.refreshJetsonEffectiveConfig();
  }

  async captureJetsonSnapshot(): Promise<void> {
    await this.actions.captureJetsonSnapshot();
  }

  async selectJetsonProfile(profileName: string): Promise<void> {
    await this.actions.selectJetsonProfile(profileName);
  }

  async startJetsonRecording(): Promise<void> {
    await this.actions.startJetsonRecording();
  }

  async stopJetsonRecording(): Promise<void> {
    await this.actions.stopJetsonRecording();
  }

  toggleOverlayEnabled(): void {
    const currentState = this.settingsStore.getSnapshot().overlayEnabled;
    this.settingsStore.setOverlayEnabled(!currentState);
  }

  setThermalOverlayMode(mode: ThermalOverlayMode): void {
    if (!this.getSnapshot().thermalControlAvailable) {
      return;
    }

    const nextMode = this.getSnapshot().thermalOverlayModeOptions.includes(mode)
      ? mode
      : THERMAL_OVERLAY_MODES[0];
    this.settingsStore.setThermalOverlayMode(nextMode);
  }

  toggleIrEnabled(): void {
    const snapshot = this.getSnapshot();
    if (!snapshot.irControlAvailable) {
      return;
    }

    this.settingsStore.setIrEnabled(!this.settingsStore.getSnapshot().irEnabled);
  }

  setIrLevel(level: number): void {
    const snapshot = this.getSnapshot();
    if (!snapshot.irControlAvailable) {
      return;
    }

    const maxLevel = Math.max(0, snapshot.irMaxLevel);
    const clampedLevel = maxLevel > 0 ? Math.min(maxLevel, level) : 0;
    this.settingsStore.setIrLevel(clampedLevel);
  }

  setHearingMode(mode: HearingEnhancementMode): void {
    const snapshot = this.getSnapshot();
    if (!snapshot.hearingControlAvailable) {
      return;
    }

    const nextMode = snapshot.hearingModeOptions.includes(mode)
      ? mode
      : snapshot.hearingModeOptions[0] ?? HEARING_ENHANCEMENT_MODES[0];
    this.settingsStore.setHearingMode(nextMode);
  }

  setHearingGain(gain: number): void {
    const snapshot = this.getSnapshot();
    if (!snapshot.hearingControlAvailable) {
      return;
    }

    const clampedGain = clamp(gain, snapshot.hearingGainMin, snapshot.hearingGainMax);
    this.settingsStore.setHearingGain(clampedGain);
  }

  setMediaVolume(volume: number): void {
    const snapshot = this.getSnapshot();
    if (!snapshot.mediaControlAvailable) {
      return;
    }

    const clampedVolume = clamp(
      volume,
      snapshot.mediaVolumeMin,
      snapshot.mediaVolumeMax,
    );
    this.settingsStore.setMediaVolume(clampedVolume);
  }

  toggleMediaMuted(): void {
    const snapshot = this.getSnapshot();
    if (!snapshot.mediaControlAvailable) {
      return;
    }

    this.settingsStore.setMediaMuted(!this.settingsStore.getSnapshot().mediaMuted);
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

function buildTransportWebSocketUrl(config: LiveTransportConfig): string {
  const normalizedPath = config.path.startsWith("/") ? config.path : `/${config.path}`;
  if (/^wss?:\/\//i.test(config.host)) {
    const url = new URL(config.host);
    if (config.port > 0) {
      url.port = String(config.port);
    }
    url.pathname = normalizedPath;
    return url.toString();
  }

  return `ws://${config.host}:${config.port}${normalizedPath}`;
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

function buildReplayStatusLines(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
): string[] {
  if (!cameraTelemetry?.replaySourceIdentity) {
    return [];
  }

  const replayPairText =
    typeof cameraTelemetry.replayCurrentIndex === "number"
      ? `${cameraTelemetry.replayCurrentIndex}/${cameraTelemetry.replayFrameCount ?? "?"}`
      : "Pending";
  const replayEntryDetails = [
    `pair ${replayPairText}`,
    typeof cameraTelemetry.replayFrameId === "number"
      ? `frameId ${cameraTelemetry.replayFrameId}`
      : undefined,
    cameraTelemetry.replayLabel ? `label "${cameraTelemetry.replayLabel}"` : undefined,
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" | ");
  const replayManifestPath =
    cameraTelemetry.replayManifestSource &&
    cameraTelemetry.replayManifestSource !== "not_configured"
      ? cameraTelemetry.replayManifestSource
      : undefined;

  return [
    `Replay entry: ${replayEntryDetails}`,
    `Replay source: ${formatCompactStatusText(cameraTelemetry.replaySourceIdentity)}`,
    `Replay timing: ${cameraTelemetry.replayTimingMode ?? "Pending"} @ ${
      typeof cameraTelemetry.replayTimeScale === "number"
        ? `${cameraTelemetry.replayTimeScale.toFixed(2)}x`
        : "Pending"
    }`,
    ...(replayManifestPath
      ? [
          `Replay manifest path: ${formatCompactStatusText(replayManifestPath)}`,
        ]
      : []),
  ];
}

function formatRuntimeSourceModeText(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
): string {
  return cameraTelemetry?.frameSourceMode ?? "Pending";
}

function formatRuntimeSourceNameText(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
): string {
  return (
    cameraTelemetry?.frameSourceName ??
    cameraTelemetry?.captureBackendName ??
    "Pending"
  );
}

function formatBridgeModeText(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
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

function formatCaptureBackendText(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
): string {
  return (
    cameraTelemetry?.captureBackendName ??
    cameraTelemetry?.frameSourceName ??
    "Pending"
  );
}

function formatFrameSizeText(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
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
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
): string {
  const intervalMs =
    cameraTelemetry?.frameIntervalMs ?? cameraTelemetry?.effectiveFrameIntervalMs;
  return typeof intervalMs === "number" ? `${intervalMs.toFixed(1)} ms` : "Pending";
}

function formatJetsonControlModeText(
  settings: XrAppSettingsState,
  diagnostics: DiagnosticsSnapshot,
): string {
  if (settings.sourceMode !== "live") {
    return "Inactive (switch source mode to Live)";
  }

  if (settings.liveTransportAdapterType !== "jetson_stub") {
    return "Inactive (Jetson transport adapter not selected)";
  }

  if (isJetsonRuntimeBridgeMode(diagnostics.cameraTelemetry?.bridgeMode)) {
    return diagnostics.cameraTelemetry?.bridgeMode === "jetson_runtime_preview_bridge"
      ? "Active (preview bridge)"
      : "Active (control-plane only)";
  }

  if (!settings.liveTransportConnected) {
    return "Waiting for Jetson WebSocket transport";
  }

  if (!settings.isConnected) {
    return "Waiting for Jetson control connection";
  }

  return "Waiting for Jetson control-plane telemetry";
}

function resolveJetsonOperatorControlState(
  settings: XrAppSettingsState,
  diagnostics: DiagnosticsSnapshot,
): {
  readonly available: boolean;
  readonly reason?: string;
} {
  if (settings.sourceMode !== "live") {
    return {
      available: false,
      reason: "Switch source mode to Live to access Jetson runtime controls.",
    };
  }

  if (settings.liveTransportAdapterType !== "jetson_stub") {
    return {
      available: false,
      reason: "Select the Jetson transport adapter to access Jetson runtime controls.",
    };
  }

  if (!settings.liveTransportConnected) {
    return {
      available: false,
      reason: "Connect the Jetson WebSocket transport to access runtime controls.",
    };
  }

  if (!settings.isConnected) {
    return {
      available: false,
      reason: "Connect Jetson control to access runtime controls.",
    };
  }

  if (!isJetsonRuntimeBridgeMode(diagnostics.cameraTelemetry?.bridgeMode)) {
    return {
      available: false,
      reason: "Waiting for Jetson control-plane telemetry from the sender bridge.",
    };
  }

  return {
    available: true,
  };
}

function formatJetsonPreflightText(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
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

function formatJetsonRecordingStateText(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
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

function formatJetsonArtifactText(
  cameraTelemetry: CameraTelemetrySnapshot | undefined,
): string {
  if (!cameraTelemetry?.artifactPath) {
    return "None";
  }

  const sizeText =
    typeof cameraTelemetry.artifactSizeBytes === "number"
      ? ` (${formatArtifactByteSize(cameraTelemetry.artifactSizeBytes)})`
      : "";
  return `${cameraTelemetry.artifactPath}${sizeText}`;
}

function formatArtifactByteSize(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function isJetsonRuntimeBridgeMode(bridgeMode: string | undefined): boolean {
  return (
    bridgeMode === "jetson_runtime_control_plane" ||
    bridgeMode === "jetson_runtime_preview_bridge"
  );
}

function formatRuntimeOperationText(
  runtimeSourceModeText: string,
  fallbackActive: boolean,
): string {
  if (fallbackActive) {
    return "Fallback to simulated";
  }

  if (runtimeSourceModeText === "camera") {
    return "Camera runtime";
  }

  if (runtimeSourceModeText === "simulated") {
    return "Intentional simulation";
  }

  if (runtimeSourceModeText === "control_plane") {
    return "Control-plane only";
  }

  return "Runtime pending";
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

function formatThermalOverlayModeText(
  thermalTelemetry: ThermalTelemetrySnapshot,
): string {
  if (!thermalTelemetry.thermalAvailable) {
    return "Unavailable";
  }

  return thermalTelemetry.currentOverlayMode;
}

function formatThermalHealthText(thermalTelemetry: ThermalTelemetrySnapshot): string {
  return thermalTelemetry.thermalAvailable
    ? thermalTelemetry.thermalHealthState
    : "Unavailable";
}

function formatThermalSelectedVsReportedText(
  selectedMode: ThermalOverlayMode,
  thermalTelemetry: ThermalTelemetrySnapshot,
): string {
  const reportedMode = formatThermalOverlayModeText(thermalTelemetry);
  if (reportedMode === "Unavailable") {
    return `Selected ${selectedMode}. Reported unavailable.`;
  }

  if (selectedMode === reportedMode) {
    return `Applied ${reportedMode}.`;
  }

  return `Selected ${selectedMode}. Reported ${reportedMode}.`;
}

function formatIrEnabledText(irTelemetry: IrIlluminatorTelemetrySnapshot): string {
  if (!irTelemetry.irAvailable) {
    return "Unavailable";
  }

  return irTelemetry.irEnabled ? "Enabled" : "Disabled";
}

function formatIrLevelText(irTelemetry: IrIlluminatorTelemetrySnapshot): string {
  if (!irTelemetry.irAvailable) {
    return "Unavailable";
  }

  if (irTelemetry.irMaxLevel > 0) {
    return `${irTelemetry.irLevel}/${irTelemetry.irMaxLevel}`;
  }

  return String(irTelemetry.irLevel);
}

function formatIrSelectedVsReportedText(
  selectedEnabled: boolean,
  selectedLevel: number,
  irTelemetry: IrIlluminatorTelemetrySnapshot,
): string {
  const selectedText = `${selectedEnabled ? "enabled" : "disabled"} @ ${selectedLevel}`;
  const reportedEnabledText = formatIrEnabledText(irTelemetry);
  const reportedLevelText = formatIrLevelText(irTelemetry);

  if (!irTelemetry.irAvailable) {
    return `Selected ${selectedText}. Reported unavailable.`;
  }

  const reportedText = `${irTelemetry.irEnabled ? "enabled" : "disabled"} @ ${
    irTelemetry.irMaxLevel > 0
      ? `${irTelemetry.irLevel}/${irTelemetry.irMaxLevel}`
      : irTelemetry.irLevel
  }`;
  if (
    selectedEnabled === irTelemetry.irEnabled &&
    selectedLevel === irTelemetry.irLevel
  ) {
    return `Applied ${reportedText}.`;
  }

  return `Selected ${selectedText}. Reported ${reportedEnabledText.toLowerCase()} @ ${reportedLevelText}.`;
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

function formatHearingHealthText(
  hearingTelemetry: HearingEnhancementTelemetrySnapshot,
): string {
  return hearingTelemetry.hearingEnhancementAvailable
    ? hearingTelemetry.hearingHealthState
    : "Unavailable";
}

function formatBluetoothConnectionText(
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

function formatMediaVolumeText(
  mediaTelemetry: PhoneMediaAudioTelemetrySnapshot,
  selectedVolume: number,
): string {
  if (!mediaTelemetry.phoneAudioAvailable) {
    return "Unavailable";
  }

  return `${Math.round(selectedVolume * 100)}%`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatCompactStatusText(value: string, maximumLength = 72): string {
  if (value.length <= maximumLength) {
    return value;
  }

  const prefixLength = Math.max(18, Math.floor(maximumLength * 0.45));
  const suffixLength = Math.max(18, maximumLength - prefixLength - 3);
  return `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`;
}
