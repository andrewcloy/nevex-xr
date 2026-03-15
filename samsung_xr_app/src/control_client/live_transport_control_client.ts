import type { Unsubscribe } from "../hand_input/contracts";
import { SettingsStore, type XrAppSettingsPatch } from "../settings_state/settings_store";
import {
  hasLiveTransportControlChannel,
  type LiveTransportAdapter,
  type LiveTransportAdapterType,
  type LiveTransportStatusSnapshot,
} from "../stereo_viewer/transport_adapter";
import type {
  ControlClient,
  ControlClientConnectionSnapshot,
  ControlCommand,
  ControlConnectionListener,
} from "./control_client";
import {
  createBrightnessCommand,
  createOverlayCommand,
  createSettingsPatchCommand,
} from "./control_client";

interface LiveTransportControlClientOptions {
  readonly settingsStore: SettingsStore;
  readonly liveTransportAdapters: Readonly<
    Partial<Record<LiveTransportAdapterType, LiveTransportAdapter>>
  >;
}

/**
 * Control client that piggybacks outbound operator commands onto the currently
 * selected live transport adapter when that adapter exposes a control channel.
 */
export class LiveTransportControlClient implements ControlClient {
  private readonly settingsStore: SettingsStore;

  private readonly liveTransportAdapters: Readonly<
    Partial<Record<LiveTransportAdapterType, LiveTransportAdapter>>
  >;

  private readonly listeners = new Set<ControlConnectionListener>();

  private settingsUnsubscribe?: Unsubscribe;

  private adapterStatusUnsubscribe?: Unsubscribe;

  private selectedAdapterType?: LiveTransportAdapterType;

  private controlEnabled = true;

  private snapshot: ControlClientConnectionSnapshot = {
    state: "disconnected",
    available: false,
  };

  constructor(options: LiveTransportControlClientOptions) {
    this.settingsStore = options.settingsStore;
    this.liveTransportAdapters = options.liveTransportAdapters;

    this.settingsUnsubscribe = this.settingsStore.subscribe((settings) => {
      if (this.selectedAdapterType !== settings.liveTransportAdapterType) {
        this.selectedAdapterType = settings.liveTransportAdapterType;
        this.subscribeToSelectedAdapter();
        return;
      }

      this.refreshSnapshot();
    });
  }

  async connect(): Promise<ControlClientConnectionSnapshot> {
    this.controlEnabled = true;
    this.refreshSnapshot({
      explicitError: this.resolveConnectErrorText(),
    });
    return this.snapshot;
  }

  async disconnect(): Promise<void> {
    this.controlEnabled = false;
    this.refreshSnapshot({
      clearError: true,
    });
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
    const adapter = this.getSelectedAdapter();
    if (
      !this.controlEnabled ||
      !adapter ||
      !hasLiveTransportControlChannel(adapter) ||
      !adapter.getStatus().connected
    ) {
      return;
    }

    try {
      await adapter.sendControlMessage(command);
      this.refreshSnapshot({
        clearError: true,
      });
    } catch (error) {
      this.refreshSnapshot({
        explicitError:
          error instanceof Error
            ? error.message
            : "Failed to send outbound control message.",
      });
    }
  }

  async syncSettings(changes: XrAppSettingsPatch): Promise<void> {
    if (Object.keys(changes).length === 0) {
      return;
    }

    await this.sendCommand(createSettingsPatchCommand(changes));
  }

  async setBrightness(value: number): Promise<void> {
    await this.sendCommand(createBrightnessCommand(value));
  }

  async setOverlayEnabled(enabled: boolean): Promise<void> {
    await this.sendCommand(createOverlayCommand(enabled));
  }

  dispose(): void {
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = undefined;
    this.adapterStatusUnsubscribe?.();
    this.adapterStatusUnsubscribe = undefined;
    this.listeners.clear();
  }

  private subscribeToSelectedAdapter(): void {
    this.adapterStatusUnsubscribe?.();
    this.adapterStatusUnsubscribe = undefined;

    const adapter = this.getSelectedAdapter();
    if (!adapter) {
      this.refreshSnapshot();
      return;
    }

    this.refreshSnapshot();
    this.adapterStatusUnsubscribe = adapter.subscribeStatus(() => {
      this.refreshSnapshot();
    });
  }

  private refreshSnapshot(options: {
    readonly explicitError?: string;
    readonly clearError?: boolean;
  } = {}): void {
    const adapter = this.getSelectedAdapter();
    const status = adapter?.getStatus();
    const controlCapable = Boolean(
      adapter && hasLiveTransportControlChannel(adapter),
    );

    let nextState: ControlClientConnectionSnapshot["state"] = "disconnected";
    if (this.controlEnabled && controlCapable) {
      if (status?.connected) {
        nextState = "connected";
      } else if (
        status?.state === "starting" ||
        status?.state === "connecting" ||
        status?.state === "reconnecting"
      ) {
        nextState = "connecting";
      }
    }

    const nextSnapshot: ControlClientConnectionSnapshot = {
      state: nextState,
      endpoint: status ? buildControlEndpoint(status) : undefined,
      available: controlCapable,
      lastError: options.clearError
        ? undefined
        : options.explicitError ??
          (this.controlEnabled && nextState === "disconnected"
            ? status?.lastError
            : undefined),
    };

    if (areConnectionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private resolveConnectErrorText(): string | undefined {
    const adapter = this.getSelectedAdapter();
    if (!adapter) {
      return "No live transport adapter is selected.";
    }

    if (!hasLiveTransportControlChannel(adapter)) {
      return "Selected live transport does not support outbound control messages.";
    }

    const status = adapter.getStatus();
    if (status.connected) {
      return undefined;
    }

    if (
      status.state === "starting" ||
      status.state === "connecting" ||
      status.state === "reconnecting"
    ) {
      return undefined;
    }

    return "Connect the live WebSocket transport to enable outbound operator control.";
  }

  private getSelectedAdapter(): LiveTransportAdapter | undefined {
    const selectedType = this.settingsStore.getSnapshot().liveTransportAdapterType;
    return (
      this.liveTransportAdapters[selectedType] ??
      this.liveTransportAdapters.dev ??
      this.liveTransportAdapters.jetson_stub
    );
  }
}

function buildControlEndpoint(status: LiveTransportStatusSnapshot): string {
  const normalizedPath = status.config.path.startsWith("/")
    ? status.config.path
    : `/${status.config.path}`;
  return `${status.config.host}:${status.config.port}${normalizedPath}`;
}

function areConnectionSnapshotsEqual(
  left: ControlClientConnectionSnapshot,
  right: ControlClientConnectionSnapshot,
): boolean {
  return (
    left.state === right.state &&
    left.endpoint === right.endpoint &&
    left.available === right.available &&
    left.lastError === right.lastError
  );
}
