import type { Unsubscribe } from "../hand_input/contracts";
import type {
  StereoDisplayMode,
  XrAppSettingsPatch,
} from "../settings_state/settings_store";
import type { ThermalOverlayMode } from "../stereo_viewer/thermal_models";

/**
 * Connection states for the future Jetson control path.
 */
export type ControlClientConnectionState =
  | "disconnected"
  | "connecting"
  | "connected";

/**
 * Snapshot describing the current control client status.
 */
export interface ControlClientConnectionSnapshot {
  readonly state: ControlClientConnectionState;
  readonly endpoint?: string;
  readonly available: boolean;
  readonly lastError?: string;
}

/**
 * Shared envelope for commands that will later be sent to the Jetson.
 *
 * The transport is intentionally unimplemented here. These message contracts
 * let the XR app define what it intends to send before the networking layer
 * exists.
 */
export interface ControlCommandEnvelope<
  TType extends string,
  TPayload extends Record<string, unknown>,
> {
  readonly type: TType;
  readonly timestampMs: number;
  readonly payload: TPayload;
}

/**
 * Sends a partial settings update to the Jetson-side control stack.
 */
export type SettingsPatchCommand = ControlCommandEnvelope<
  "settings_patch",
  {
    changes: XrAppSettingsPatch;
  }
>;

/**
 * Simple brightness command exposed as a stable future integration seam.
 */
export type BrightnessCommand = ControlCommandEnvelope<
  "brightness_command",
  {
    value: number;
  }
>;

/**
 * Simple overlay toggle command exposed as a stable future integration seam.
 */
export type OverlayCommand = ControlCommandEnvelope<
  "overlay_command",
  {
    enabled: boolean;
  }
>;

/**
 * Viewer-specific control command.
 *
 * This provides a future hook for viewer changes that may need to be mirrored
 * on the Jetson, such as display mode updates or stream-specific controls.
 */
export type ViewerCommand = ControlCommandEnvelope<
  "viewer_command",
  {
    action: "set_display_mode" | "set_zoom";
    stereoDisplayMode?: StereoDisplayMode;
    digitalZoom?: number;
  }
>;

/**
 * Diagnostics-related control command.
 */
export type DiagnosticsCommand = ControlCommandEnvelope<
  "diagnostics_command",
  {
    diagnosticsModeEnabled?: boolean;
    thermalOverlayEnabled?: boolean;
    thermalOverlayMode?: ThermalOverlayMode;
    aiOverlayEnabled?: boolean;
    irEnabled?: boolean;
    irLevel?: number;
  }
>;

/**
 * Session-level control command placeholder.
 */
export type SessionCommand = ControlCommandEnvelope<
  "session_command",
  {
    action:
      | "start_recording"
      | "stop_recording"
      | "ping"
      | "run_preflight"
      | "show_effective_config"
      | "capture_snapshot"
      | "select_profile";
    profileName?: string;
  }
>;

/**
 * Union of all outgoing XR-to-Jetson control messages.
 */
export type ControlCommand =
  | SettingsPatchCommand
  | BrightnessCommand
  | OverlayCommand
  | ViewerCommand
  | DiagnosticsCommand
  | SessionCommand;

/**
 * Listener invoked when the connection snapshot changes.
 */
export type ControlConnectionListener = (
  snapshot: ControlClientConnectionSnapshot,
) => void;

/**
 * Abstract control client boundary for future Jetson transport code.
 *
 * The application shell can depend on this interface now, while transport,
 * protocol serialization, and reconnect policy are implemented later.
 */
export interface ControlClient {
  connect(): Promise<ControlClientConnectionSnapshot>;
  disconnect(): Promise<void>;
  getConnectionSnapshot(): ControlClientConnectionSnapshot;
  subscribeConnection(listener: ControlConnectionListener): Unsubscribe;
  sendCommand(command: ControlCommand): Promise<void>;
  syncSettings(changes: XrAppSettingsPatch): Promise<void>;
  setBrightness(value: number): Promise<void>;
  setOverlayEnabled(enabled: boolean): Promise<void>;
  dispose?(): void;
}

/**
 * Placeholder control client used until a real Jetson transport exists.
 *
 * `connect()` intentionally reports that no live transport is available so the
 * application shell can keep mock mode as the default runtime source.
 */
export class NullControlClient implements ControlClient {
  private snapshot: ControlClientConnectionSnapshot;

  private readonly listeners = new Set<ControlConnectionListener>();

  private readonly commandHistory: ControlCommand[] = [];

  constructor(endpoint?: string) {
    this.snapshot = {
      state: "disconnected",
      endpoint,
      available: false,
    };
  }

  async connect(): Promise<ControlClientConnectionSnapshot> {
    this.snapshot = {
      ...this.snapshot,
      state: "connecting",
      lastError: undefined,
    };
    this.emit();

    await delay(350);

    this.snapshot = {
      ...this.snapshot,
      state: "disconnected",
      available: false,
      lastError: "Jetson control transport is not implemented yet.",
    };
    this.emit();

    return this.snapshot;
  }

  async disconnect(): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      state: "disconnected",
    };
    this.emit();
  }

  getConnectionSnapshot(): ControlClientConnectionSnapshot {
    return this.snapshot;
  }

  subscribeConnection(listener: ControlConnectionListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async sendCommand(command: ControlCommand): Promise<void> {
    this.commandHistory.push(command);
    // Transport is intentionally unimplemented in this scaffold.
  }

  async syncSettings(changes: XrAppSettingsPatch): Promise<void> {
    await this.sendCommand(createSettingsPatchCommand(changes));
  }

  async setBrightness(value: number): Promise<void> {
    await this.sendCommand(createBrightnessCommand(value));
  }

  async setOverlayEnabled(enabled: boolean): Promise<void> {
    await this.sendCommand(createOverlayCommand(enabled));
  }

  getCommandHistory(): readonly ControlCommand[] {
    return this.commandHistory;
  }

  dispose(): void {
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

export function createSettingsPatchCommand(
  changes: XrAppSettingsPatch,
): SettingsPatchCommand {
  return {
    type: "settings_patch",
    timestampMs: Date.now(),
    payload: { changes },
  };
}

export function createBrightnessCommand(value: number): BrightnessCommand {
  return {
    type: "brightness_command",
    timestampMs: Date.now(),
    payload: { value },
  };
}

export function createOverlayCommand(enabled: boolean): OverlayCommand {
  return {
    type: "overlay_command",
    timestampMs: Date.now(),
    payload: { enabled },
  };
}

export function createSessionCommand(
  action: SessionCommand["payload"]["action"],
  options: {
    readonly profileName?: string;
  } = {},
): SessionCommand {
  return {
    type: "session_command",
    timestampMs: Date.now(),
    payload: {
      action,
      ...(options.profileName === undefined
        ? {}
        : { profileName: options.profileName }),
    },
  };
}

export function createSelectProfileCommand(profileName: string): SessionCommand {
  return createSessionCommand("select_profile", { profileName });
}

export function createViewerDisplayModeCommand(
  stereoDisplayMode: StereoDisplayMode,
): ViewerCommand {
  return {
    type: "viewer_command",
    timestampMs: Date.now(),
    payload: {
      action: "set_display_mode",
      stereoDisplayMode,
    },
  };
}

export function createViewerZoomCommand(digitalZoom: number): ViewerCommand {
  return {
    type: "viewer_command",
    timestampMs: Date.now(),
    payload: {
      action: "set_zoom",
      digitalZoom,
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
