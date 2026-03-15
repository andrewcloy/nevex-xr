import type { Unsubscribe } from "../hand_input/contracts";
import { SettingsStore } from "../settings_state/settings_store";

/**
 * Compact control strip intended for frequently used XR actions.
 *
 * This file only defines UI state and settings bindings. Actual rendering and
 * widget composition will be implemented later by the XR UI layer.
 */
export interface QuickControlsSnapshot {
  readonly visible: boolean;
  readonly brightness: number;
  readonly gain: number;
  readonly diagnosticsModeEnabled: boolean;
  readonly recordingEnabled: boolean;
}

/**
 * Listener invoked when the quick-controls state changes.
 */
export type QuickControlsListener = (snapshot: QuickControlsSnapshot) => void;

/**
 * State connector for the future quick-controls panel.
 */
export class QuickControlsController {
  private readonly settingsStore: SettingsStore;

  private readonly listeners = new Set<QuickControlsListener>();

  private readonly settingsUnsubscribe: Unsubscribe;

  private visible = true;

  constructor(settingsStore: SettingsStore) {
    this.settingsStore = settingsStore;
    this.settingsUnsubscribe = this.settingsStore.subscribe(() => {
      this.emit();
    });
  }

  getSnapshot(): QuickControlsSnapshot {
    const settings = this.settingsStore.getSnapshot();

    return {
      visible: this.visible,
      brightness: settings.brightness,
      gain: settings.gain,
      diagnosticsModeEnabled: settings.diagnosticsModeEnabled,
      recordingEnabled: settings.recordingEnabled,
    };
  }

  subscribe(listener: QuickControlsListener): Unsubscribe {
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

  setBrightness(value: number): void {
    this.settingsStore.setBrightness(value);
  }

  setGain(value: number): void {
    this.settingsStore.setGain(value);
  }

  toggleDiagnosticsMode(): void {
    const settings = this.settingsStore.getSnapshot();
    this.settingsStore.setDiagnosticsModeEnabled(!settings.diagnosticsModeEnabled);
  }

  toggleRecording(): void {
    const settings = this.settingsStore.getSnapshot();
    this.settingsStore.setRecordingEnabled(!settings.recordingEnabled);
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
