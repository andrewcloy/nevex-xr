import type { Unsubscribe } from "../hand_input/contracts";
import {
  DEFAULT_HEARING_ENHANCEMENT_MODE,
  type HearingEnhancementMode,
} from "../stereo_viewer/audio_models";
import {
  DEFAULT_THERMAL_OVERLAY_MODE,
  type ThermalOverlayMode,
} from "../stereo_viewer/thermal_models";
import {
  DEFAULT_LIVE_TRANSPORT_CONFIG,
  DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
  type LiveTransportCapabilitiesSnapshot,
  type LiveTransportAdapterType,
  normalizeLiveTransportConfig,
  type LiveTransportAdapterState,
  type LiveTransportConfig,
  type LiveTransportSequenceHealthSnapshot,
} from "../stereo_viewer/transport_adapter";

/**
 * Supported stereo presentation layouts for the viewer scaffold.
 *
 * The final set may expand once the streaming path and headset runtime
 * requirements are better defined.
 */
export type StereoDisplayMode = "side_by_side" | "top_bottom" | "mono";

/**
 * Active content source for the XR app.
 *
 * `mock` is the default while the Jetson transport remains unimplemented.
 */
export type SourceMode = "mock" | "live";

/**
 * XR app settings and lightweight runtime state managed locally in memory.
 *
 * The store acts as the central state model for the mock-first application
 * scaffold. Most settings remain session-local, while browser UI audio
 * preferences may be restored from local storage when available.
 */
export interface XrAppSettingsState {
  readonly sourceMode: SourceMode;
  readonly isConnected: boolean;
  readonly appRunning: boolean;
  readonly brightness: number;
  readonly gain: number;
  readonly digitalZoom: number;
  readonly stereoDisplayMode: StereoDisplayMode;
  readonly overlayEnabled: boolean;
  readonly thermalOverlayEnabled: boolean;
  readonly thermalOverlayMode: ThermalOverlayMode;
  readonly irEnabled: boolean;
  readonly irLevel: number;
  readonly hearingMode: HearingEnhancementMode;
  readonly hearingGain: number;
  readonly mediaVolume: number;
  readonly mediaMuted: boolean;
  readonly aiOverlayEnabled: boolean;
  readonly recordingEnabled: boolean;
  readonly diagnosticsModeEnabled: boolean;
  readonly uiAudioEnabled: boolean;
  readonly uiClickVolume: number;
  readonly uiBootVolume: number;
  readonly liveTransportAdapterType: LiveTransportAdapterType;
  readonly liveTransportAdapterDisplayName: string;
  readonly liveTransportConfig: LiveTransportConfig;
  readonly liveTransportStatusState: LiveTransportAdapterState;
  readonly liveTransportConnected: boolean;
  readonly liveTransportStatusText: string;
  readonly liveTransportErrorText?: string;
  readonly liveTransportParseErrorText?: string;
  readonly liveTransportLastMessageType?: string;
  readonly liveTransportLastSequence?: number;
  readonly liveTransportLastMessageTimestampMs?: number;
  readonly liveTransportLastMessageSizeBytes?: number;
  readonly liveTransportSequenceHealth: LiveTransportSequenceHealthSnapshot;
  readonly liveTransportCapabilities?: LiveTransportCapabilitiesSnapshot;
  readonly liveTransportDemoFeedActive: boolean;
  readonly statusText: string;
  readonly renderStatusText: string;
  readonly fpsEstimate: number;
}

/**
 * Partial update to the active settings state.
 */
export type XrAppSettingsPatch = Partial<XrAppSettingsState>;

/**
 * Listener invoked whenever the in-memory settings snapshot changes.
 */
export type SettingsStoreListener = (snapshot: XrAppSettingsState) => void;

/**
 * Normalized value limits used by the initial scaffold.
 */
export const MIN_NORMALIZED_CONTROL_VALUE = 0;
export const MAX_NORMALIZED_CONTROL_VALUE = 1;
export const MIN_DIGITAL_ZOOM = 0.5;
export const DEFAULT_DIGITAL_ZOOM = 1;
export const MAX_DIGITAL_ZOOM = 4;
export const DEFAULT_UI_AUDIO_ENABLED = true;
export const DEFAULT_UI_CLICK_VOLUME = 0.38;
export const DEFAULT_UI_BOOT_VOLUME = 0.58;
export const DEFAULT_HEARING_GAIN = 0.5;
export const DEFAULT_MEDIA_VOLUME = 0.5;

const UI_AUDIO_SETTINGS_STORAGE_KEY = "samsung-xr-app.ui-audio-settings";

/**
 * Default settings used until the UI or external control path updates them.
 */
export const DEFAULT_SETTINGS_STATE: XrAppSettingsState = {
  sourceMode: "mock",
  isConnected: false,
  appRunning: false,
  brightness: 0.75,
  gain: 0.5,
  digitalZoom: DEFAULT_DIGITAL_ZOOM,
  stereoDisplayMode: "side_by_side",
  overlayEnabled: false,
  thermalOverlayEnabled: false,
  thermalOverlayMode: DEFAULT_THERMAL_OVERLAY_MODE,
  irEnabled: false,
  irLevel: 0,
  hearingMode: DEFAULT_HEARING_ENHANCEMENT_MODE,
  hearingGain: DEFAULT_HEARING_GAIN,
  mediaVolume: DEFAULT_MEDIA_VOLUME,
  mediaMuted: false,
  aiOverlayEnabled: false,
  recordingEnabled: false,
  diagnosticsModeEnabled: true,
  uiAudioEnabled: DEFAULT_UI_AUDIO_ENABLED,
  uiClickVolume: DEFAULT_UI_CLICK_VOLUME,
  uiBootVolume: DEFAULT_UI_BOOT_VOLUME,
  liveTransportAdapterType: "dev",
  liveTransportAdapterDisplayName: "Development Transport Adapter",
  liveTransportConfig: DEFAULT_LIVE_TRANSPORT_CONFIG,
  liveTransportStatusState: "idle",
  liveTransportConnected: false,
  liveTransportStatusText: "Live transport idle.",
  liveTransportErrorText: undefined,
  liveTransportParseErrorText: undefined,
  liveTransportLastMessageType: undefined,
  liveTransportLastSequence: undefined,
  liveTransportLastMessageTimestampMs: undefined,
  liveTransportLastMessageSizeBytes: undefined,
  liveTransportSequenceHealth: DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
  liveTransportCapabilities: undefined,
  liveTransportDemoFeedActive: false,
  statusText: "Ready",
  renderStatusText: "Viewer idle",
  fpsEstimate: 0,
};

/**
 * In-memory settings store for the XR app scaffold.
 *
 * This class is intentionally lightweight. It provides the state connection
 * points needed by the application shell, UI scaffold, diagnostics, and future
 * control client without introducing persistence or framework-specific state
 * management.
 */
export class SettingsStore {
  private snapshot: XrAppSettingsState;

  private readonly listeners = new Set<SettingsStoreListener>();

  constructor(initialState?: XrAppSettingsPatch) {
    const persistedUiAudioSettings = readPersistedUiAudioSettings();
    this.snapshot = normalizeSettings({
      ...DEFAULT_SETTINGS_STATE,
      ...persistedUiAudioSettings,
      ...initialState,
    });
  }

  getSnapshot(): XrAppSettingsState {
    return this.snapshot;
  }

  subscribe(listener: SettingsStoreListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  update(patch: XrAppSettingsPatch): XrAppSettingsState {
    this.snapshot = normalizeSettings({
      ...this.snapshot,
      ...patch,
    });
    persistUiAudioSettings(this.snapshot);
    this.emit();
    return this.snapshot;
  }

  reset(): XrAppSettingsState {
    this.snapshot = normalizeSettings({ ...DEFAULT_SETTINGS_STATE });
    persistUiAudioSettings(this.snapshot);
    this.emit();
    return this.snapshot;
  }

  setSourceMode(mode: SourceMode): XrAppSettingsState {
    return this.update({ sourceMode: mode });
  }

  setConnected(isConnected: boolean): XrAppSettingsState {
    return this.update({ isConnected });
  }

  setAppRunning(appRunning: boolean): XrAppSettingsState {
    return this.update({ appRunning });
  }

  setBrightness(value: number): XrAppSettingsState {
    return this.update({ brightness: value });
  }

  setGain(value: number): XrAppSettingsState {
    return this.update({ gain: value });
  }

  setStereoDisplayMode(mode: StereoDisplayMode): XrAppSettingsState {
    return this.update({ stereoDisplayMode: mode });
  }

  setOverlayEnabled(enabled: boolean): XrAppSettingsState {
    return this.update({ overlayEnabled: enabled });
  }

  setThermalOverlayEnabled(enabled: boolean): XrAppSettingsState {
    const currentMode = this.snapshot.thermalOverlayMode;
    return this.update({
      thermalOverlayEnabled: enabled,
      thermalOverlayMode: enabled
        ? currentMode === "off"
          ? DEFAULT_THERMAL_OVERLAY_MODE
          : currentMode
        : "off",
    });
  }

  setThermalOverlayMode(mode: ThermalOverlayMode): XrAppSettingsState {
    return this.update({
      thermalOverlayEnabled: mode !== "off",
      thermalOverlayMode: mode,
    });
  }

  setIrEnabled(enabled: boolean): XrAppSettingsState {
    const currentLevel = normalizeNonNegativeInteger(this.snapshot.irLevel);
    return this.update({
      irEnabled: enabled,
      irLevel: enabled ? Math.max(1, currentLevel) : 0,
    });
  }

  setIrLevel(level: number): XrAppSettingsState {
    const normalizedLevel = normalizeNonNegativeInteger(level);
    return this.update({
      irEnabled: normalizedLevel > 0,
      irLevel: normalizedLevel,
    });
  }

  setHearingMode(mode: HearingEnhancementMode): XrAppSettingsState {
    return this.update({ hearingMode: mode });
  }

  setHearingGain(value: number): XrAppSettingsState {
    return this.update({ hearingGain: value });
  }

  setMediaVolume(value: number): XrAppSettingsState {
    return this.update({ mediaVolume: value });
  }

  setMediaMuted(muted: boolean): XrAppSettingsState {
    return this.update({ mediaMuted: muted });
  }

  setAiOverlayEnabled(enabled: boolean): XrAppSettingsState {
    return this.update({ aiOverlayEnabled: enabled });
  }

  setRecordingEnabled(enabled: boolean): XrAppSettingsState {
    return this.update({ recordingEnabled: enabled });
  }

  setDiagnosticsModeEnabled(enabled: boolean): XrAppSettingsState {
    return this.update({ diagnosticsModeEnabled: enabled });
  }

  setUiAudioEnabled(enabled: boolean): XrAppSettingsState {
    return this.update({ uiAudioEnabled: enabled });
  }

  setUiClickVolume(volume: number): XrAppSettingsState {
    return this.update({ uiClickVolume: volume });
  }

  setUiBootVolume(volume: number): XrAppSettingsState {
    return this.update({ uiBootVolume: volume });
  }

  setLiveTransportAdapter(
    type: LiveTransportAdapterType,
    displayName: string,
  ): XrAppSettingsState {
    return this.update({
      liveTransportAdapterType: type,
      liveTransportAdapterDisplayName: displayName,
    });
  }

  setLiveTransportConfig(config: LiveTransportConfig): XrAppSettingsState {
    return this.update({ liveTransportConfig: config });
  }

  updateLiveTransportConfig(
    patch: Partial<LiveTransportConfig>,
  ): XrAppSettingsState {
    return this.update({
      liveTransportConfig: {
        ...this.snapshot.liveTransportConfig,
        ...patch,
      },
    });
  }

  setLiveTransportStatus(
    state: LiveTransportAdapterState,
    connected: boolean,
    statusText: string,
    errorText?: string,
  ): XrAppSettingsState {
    return this.update({
      liveTransportStatusState: state,
      liveTransportConnected: connected,
      liveTransportStatusText: statusText,
      liveTransportErrorText: errorText,
    });
  }

  setLiveTransportParseErrorText(
    parseErrorText?: string,
  ): XrAppSettingsState {
    return this.update({ liveTransportParseErrorText: parseErrorText });
  }

  setLiveTransportLastMessage(
    messageType?: string,
    sequence?: number,
    timestampMs?: number,
  ): XrAppSettingsState {
    return this.update({
      liveTransportLastMessageType: messageType,
      liveTransportLastSequence: sequence,
      liveTransportLastMessageTimestampMs: timestampMs,
    });
  }

  setLiveTransportDemoFeedActive(active: boolean): XrAppSettingsState {
    return this.update({ liveTransportDemoFeedActive: active });
  }

  setStatusText(statusText: string): XrAppSettingsState {
    return this.update({ statusText });
  }

  setRenderStatusText(renderStatusText: string): XrAppSettingsState {
    return this.update({ renderStatusText });
  }

  setFpsEstimate(fpsEstimate: number): XrAppSettingsState {
    return this.update({ fpsEstimate });
  }

  /**
   * Applies a normalized zoom delta to the current zoom value.
   *
   * Future hand gestures can call this with analog scale deltas emitted by the
   * hand interaction layer. The store keeps the resulting zoom within the
   * scaffold's safe operating range.
   */
  adjustDigitalZoom(deltaScale: number): XrAppSettingsState {
    return this.update({
      digitalZoom: this.snapshot.digitalZoom + deltaScale,
    });
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

function normalizeSettings(state: XrAppSettingsState): XrAppSettingsState {
  return {
    sourceMode: state.sourceMode,
    isConnected: state.isConnected,
    appRunning: state.appRunning,
    brightness: clamp(
      state.brightness,
      MIN_NORMALIZED_CONTROL_VALUE,
      MAX_NORMALIZED_CONTROL_VALUE,
    ),
    gain: clamp(
      state.gain,
      MIN_NORMALIZED_CONTROL_VALUE,
      MAX_NORMALIZED_CONTROL_VALUE,
    ),
    digitalZoom: clamp(state.digitalZoom, MIN_DIGITAL_ZOOM, MAX_DIGITAL_ZOOM),
    stereoDisplayMode: state.stereoDisplayMode,
    overlayEnabled: state.overlayEnabled,
    thermalOverlayEnabled: state.thermalOverlayMode !== "off",
    thermalOverlayMode: state.thermalOverlayMode,
    irEnabled: state.irEnabled && normalizeNonNegativeInteger(state.irLevel) > 0,
    irLevel: normalizeNonNegativeInteger(state.irLevel),
    hearingMode: state.hearingMode,
    hearingGain: clamp(
      state.hearingGain,
      MIN_NORMALIZED_CONTROL_VALUE,
      MAX_NORMALIZED_CONTROL_VALUE,
    ),
    mediaVolume: clamp(
      state.mediaVolume,
      MIN_NORMALIZED_CONTROL_VALUE,
      MAX_NORMALIZED_CONTROL_VALUE,
    ),
    mediaMuted: state.mediaMuted,
    aiOverlayEnabled: state.aiOverlayEnabled,
    recordingEnabled: state.recordingEnabled,
    diagnosticsModeEnabled: state.diagnosticsModeEnabled,
    uiAudioEnabled: state.uiAudioEnabled,
    uiClickVolume: normalizeUiAudioVolume(
      state.uiClickVolume,
      DEFAULT_UI_CLICK_VOLUME,
    ),
    uiBootVolume: normalizeUiAudioVolume(
      state.uiBootVolume,
      DEFAULT_UI_BOOT_VOLUME,
    ),
    liveTransportAdapterType: state.liveTransportAdapterType,
    liveTransportAdapterDisplayName: state.liveTransportAdapterDisplayName,
    liveTransportConfig: normalizeLiveTransportConfig(state.liveTransportConfig),
    liveTransportStatusState: state.liveTransportStatusState,
    liveTransportConnected: state.liveTransportConnected,
    liveTransportStatusText: state.liveTransportStatusText,
    liveTransportErrorText: state.liveTransportErrorText,
    liveTransportParseErrorText: state.liveTransportParseErrorText,
    liveTransportLastMessageType: state.liveTransportLastMessageType,
    liveTransportLastSequence: state.liveTransportLastSequence,
    liveTransportLastMessageTimestampMs: state.liveTransportLastMessageTimestampMs,
    liveTransportLastMessageSizeBytes: state.liveTransportLastMessageSizeBytes,
    liveTransportSequenceHealth: {
      repeatedCount: Math.max(0, state.liveTransportSequenceHealth.repeatedCount),
      outOfOrderCount: Math.max(0, state.liveTransportSequenceHealth.outOfOrderCount),
      droppedCountEstimate: Math.max(
        0,
        state.liveTransportSequenceHealth.droppedCountEstimate,
      ),
      lastAnomalyText: state.liveTransportSequenceHealth.lastAnomalyText,
    },
    liveTransportCapabilities: state.liveTransportCapabilities,
    liveTransportDemoFeedActive: state.liveTransportDemoFeedActive,
    statusText: state.statusText,
    renderStatusText: state.renderStatusText,
    fpsEstimate: Math.max(0, state.fpsEstimate),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeUiAudioVolume(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, MIN_NORMALIZED_CONTROL_VALUE, MAX_NORMALIZED_CONTROL_VALUE);
}

function readPersistedUiAudioSettings(): Pick<
  XrAppSettingsState,
  "uiAudioEnabled" | "uiClickVolume" | "uiBootVolume"
> {
  const storage = resolveBrowserStorage();
  if (!storage) {
    return {
      uiAudioEnabled: DEFAULT_UI_AUDIO_ENABLED,
      uiClickVolume: DEFAULT_UI_CLICK_VOLUME,
      uiBootVolume: DEFAULT_UI_BOOT_VOLUME,
    };
  }

  try {
    const rawValue = storage.getItem(UI_AUDIO_SETTINGS_STORAGE_KEY);
    if (!rawValue) {
      return {
        uiAudioEnabled: DEFAULT_UI_AUDIO_ENABLED,
        uiClickVolume: DEFAULT_UI_CLICK_VOLUME,
        uiBootVolume: DEFAULT_UI_BOOT_VOLUME,
      };
    }

    const parsedValue = JSON.parse(rawValue);
    if (
      typeof parsedValue !== "object" ||
      parsedValue === null ||
      Array.isArray(parsedValue)
    ) {
      return {
        uiAudioEnabled: DEFAULT_UI_AUDIO_ENABLED,
        uiClickVolume: DEFAULT_UI_CLICK_VOLUME,
        uiBootVolume: DEFAULT_UI_BOOT_VOLUME,
      };
    }

    return {
      uiAudioEnabled:
        typeof parsedValue.uiAudioEnabled === "boolean"
          ? parsedValue.uiAudioEnabled
          : DEFAULT_UI_AUDIO_ENABLED,
      uiClickVolume:
        typeof parsedValue.uiClickVolume === "number"
          ? parsedValue.uiClickVolume
          : DEFAULT_UI_CLICK_VOLUME,
      uiBootVolume:
        typeof parsedValue.uiBootVolume === "number"
          ? parsedValue.uiBootVolume
          : DEFAULT_UI_BOOT_VOLUME,
    };
  } catch {
    return {
      uiAudioEnabled: DEFAULT_UI_AUDIO_ENABLED,
      uiClickVolume: DEFAULT_UI_CLICK_VOLUME,
      uiBootVolume: DEFAULT_UI_BOOT_VOLUME,
    };
  }
}

function persistUiAudioSettings(state: XrAppSettingsState): void {
  const storage = resolveBrowserStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      UI_AUDIO_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        uiAudioEnabled: state.uiAudioEnabled,
        uiClickVolume: state.uiClickVolume,
        uiBootVolume: state.uiBootVolume,
      }),
    );
  } catch {
    // Ignore storage failures so browser privacy or quota settings do not
    // affect the rest of the app.
  }
}

function resolveBrowserStorage():
  | Pick<Storage, "getItem" | "setItem">
  | undefined {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? undefined
      : globalThis.localStorage;
  } catch {
    return undefined;
  }
}
