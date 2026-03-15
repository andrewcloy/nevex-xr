import type { Unsubscribe } from "../hand_input/contracts";
import {
  SettingsStore,
  type StereoDisplayMode,
  type XrAppSettingsPatch,
} from "../settings_state/settings_store";
import { HEARING_ENHANCEMENT_MODES } from "../stereo_viewer/audio_models";
import { THERMAL_OVERLAY_MODES } from "../stereo_viewer/thermal_models";

/**
 * Structural description of a field that the future XR settings UI will render.
 */
export interface SettingsPanelField {
  readonly id: string;
  readonly label: string;
  readonly controlType: "slider" | "toggle" | "select";
  readonly value: boolean | number | string;
  readonly options?: readonly string[];
}

/**
 * Section of the settings panel scaffold.
 */
export interface SettingsPanelSection {
  readonly id:
    | "display"
    | "overlays"
    | "audio"
    | "hearingMedia"
    | "diagnostics";
  readonly title: string;
  readonly fields: readonly SettingsPanelField[];
}

/**
 * UI-facing snapshot for the future settings panel.
 */
export interface SettingsPanelSnapshot {
  readonly visible: boolean;
  readonly sections: readonly SettingsPanelSection[];
}

/**
 * Listener invoked when the settings panel structure changes.
 */
export type SettingsPanelListener = (snapshot: SettingsPanelSnapshot) => void;

/**
 * State connector for the future in-headset settings panel.
 *
 * This controller keeps a render-agnostic description of the settings layout
 * so the eventual XR UI implementation can bind to a stable state contract.
 */
export class SettingsPanelController {
  private readonly settingsStore: SettingsStore;

  private readonly listeners = new Set<SettingsPanelListener>();

  private readonly settingsUnsubscribe: Unsubscribe;

  private visible = false;

  constructor(settingsStore: SettingsStore) {
    this.settingsStore = settingsStore;
    this.settingsUnsubscribe = this.settingsStore.subscribe(() => {
      this.emit();
    });
  }

  getSnapshot(): SettingsPanelSnapshot {
    const settings = this.settingsStore.getSnapshot();

    return {
      visible: this.visible,
      sections: [
        {
          id: "display",
          title: "Display",
          fields: [
            {
              id: "brightness",
              label: "Brightness",
              controlType: "slider",
              value: settings.brightness,
            },
            {
              id: "gain",
              label: "Gain",
              controlType: "slider",
              value: settings.gain,
            },
            {
              id: "digitalZoom",
              label: "Digital Zoom",
              controlType: "slider",
              value: settings.digitalZoom,
            },
            {
              id: "stereoDisplayMode",
              label: "Stereo Display Mode",
              controlType: "select",
              value: settings.stereoDisplayMode,
              options: ["side_by_side", "top_bottom", "mono"],
            },
          ],
        },
        {
          id: "overlays",
          title: "Overlays",
          fields: [
            {
              id: "overlayEnabled",
              label: "Overlay Enabled",
              controlType: "toggle",
              value: settings.overlayEnabled,
            },
            {
              id: "thermalOverlayEnabled",
              label: "Thermal Overlay",
              controlType: "toggle",
              value: settings.thermalOverlayEnabled,
            },
            {
              id: "thermalOverlayMode",
              label: "Thermal Overlay Mode",
              controlType: "select",
              value: settings.thermalOverlayMode,
              options: THERMAL_OVERLAY_MODES,
            },
            {
              id: "aiOverlayEnabled",
              label: "AI Overlay",
              controlType: "toggle",
              value: settings.aiOverlayEnabled,
            },
            {
              id: "recordingEnabled",
              label: "Recording",
              controlType: "toggle",
              value: settings.recordingEnabled,
            },
            {
              id: "irEnabled",
              label: "IR Illuminator",
              controlType: "toggle",
              value: settings.irEnabled,
            },
            {
              id: "irLevel",
              label: "IR Level",
              controlType: "slider",
              value: settings.irLevel,
            },
          ],
        },
        {
          id: "audio",
          title: "UI Audio",
          fields: [
            {
              id: "uiAudioEnabled",
              label: "UI Sounds",
              controlType: "toggle",
              value: settings.uiAudioEnabled,
            },
            {
              id: "uiClickVolume",
              label: "Click Volume",
              controlType: "slider",
              value: settings.uiClickVolume,
            },
            {
              id: "uiBootVolume",
              label: "Boot Volume",
              controlType: "slider",
              value: settings.uiBootVolume,
            },
          ],
        },
        {
          id: "hearingMedia",
          title: "Enhanced Audio",
          fields: [
            {
              id: "hearingMode",
              label: "Hearing Enhancement Mode",
              controlType: "select",
              value: settings.hearingMode,
              options: HEARING_ENHANCEMENT_MODES,
            },
            {
              id: "hearingGain",
              label: "Hearing Gain",
              controlType: "slider",
              value: settings.hearingGain,
            },
            {
              id: "mediaVolume",
              label: "Media Volume",
              controlType: "slider",
              value: settings.mediaVolume,
            },
            {
              id: "mediaMuted",
              label: "Media Muted",
              controlType: "toggle",
              value: settings.mediaMuted,
            },
          ],
        },
        {
          id: "diagnostics",
          title: "Diagnostics",
          fields: [
            {
              id: "diagnosticsModeEnabled",
              label: "Diagnostics Mode",
              controlType: "toggle",
              value: settings.diagnosticsModeEnabled,
            },
          ],
        },
      ],
    };
  }

  subscribe(listener: SettingsPanelListener): Unsubscribe {
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

  applyPatch(patch: XrAppSettingsPatch): void {
    this.settingsStore.update(patch);
  }

  setStereoDisplayMode(mode: StereoDisplayMode): void {
    this.settingsStore.setStereoDisplayMode(mode);
  }

  dispose(): void {
    this.settingsUnsubscribe();
    this.listeners.clear();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
