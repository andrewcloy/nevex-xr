import type { Unsubscribe } from "../hand_input/contracts";
import {
  DEFAULT_DIGITAL_ZOOM,
  MAX_DIGITAL_ZOOM,
  MIN_DIGITAL_ZOOM,
  SettingsStore,
} from "../settings_state/settings_store";

/**
 * View-model snapshot for the future zoom control surface.
 */
export interface ZoomControlSnapshot {
  readonly currentZoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly stepSize: number;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
}

/**
 * Listener invoked when zoom-control state changes.
 */
export type ZoomControlListener = (snapshot: ZoomControlSnapshot) => void;

/**
 * Render-agnostic connector for the future zoom UI.
 *
 * This controller can be driven by UI buttons now and later by hand gestures
 * routed through the application shell.
 */
export class ZoomControlController {
  private readonly settingsStore: SettingsStore;

  private readonly listeners = new Set<ZoomControlListener>();

  private readonly settingsUnsubscribe: Unsubscribe;

  private readonly stepSize = 0.1;

  constructor(settingsStore: SettingsStore) {
    this.settingsStore = settingsStore;
    this.settingsUnsubscribe = this.settingsStore.subscribe(() => {
      this.emit();
    });
  }

  getSnapshot(): ZoomControlSnapshot {
    const currentZoom = this.settingsStore.getSnapshot().digitalZoom;

    return {
      currentZoom,
      minZoom: MIN_DIGITAL_ZOOM,
      maxZoom: MAX_DIGITAL_ZOOM,
      stepSize: this.stepSize,
      canZoomIn: currentZoom < MAX_DIGITAL_ZOOM,
      canZoomOut: currentZoom > MIN_DIGITAL_ZOOM,
    };
  }

  subscribe(listener: ZoomControlListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  applyZoomDelta(deltaScale: number): void {
    this.settingsStore.adjustDigitalZoom(deltaScale);
  }

  stepZoom(direction: "in" | "out"): void {
    this.applyZoomDelta(direction === "in" ? this.stepSize : -this.stepSize);
  }

  reset(): void {
    this.settingsStore.update({
      digitalZoom: DEFAULT_DIGITAL_ZOOM,
    });
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
