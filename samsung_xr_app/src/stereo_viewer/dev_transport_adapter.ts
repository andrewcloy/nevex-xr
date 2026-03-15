import type { Unsubscribe } from "../hand_input/contracts";
import { LiveFrameBridge } from "./live_frame_bridge";
import type { StereoFrameSource } from "./frame_source";
import {
  DEFAULT_LIVE_TRANSPORT_CONFIG,
  DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
  normalizeLiveTransportConfig,
  type LiveTransportAdapter,
  type LiveTransportConfig,
  type LiveTransportDebugControls,
  type LiveTransportDebugSnapshot,
  type LiveTransportStatusListener,
  type LiveTransportStatusSnapshot,
} from "./transport_adapter";

/**
 * Options for the development transport adapter.
 */
export interface DevTransportAdapterOptions {
  readonly config?: Partial<LiveTransportConfig>;
  readonly autoStartDemoFeed?: boolean;
  readonly tickIntervalMs?: number;
}

/**
 * Development transport adapter that sits above the live frame bridge.
 *
 * This adapter simulates a future Jetson transport integration without
 * committing the app to any particular transport protocol or media stack.
 */
export class DevTransportAdapter
  implements LiveTransportAdapter, LiveTransportDebugControls
{
  readonly id = "dev-transport-adapter";

  readonly adapterType = "dev" as const;

  readonly displayName = "Development Transport Adapter";

  readonly frameSource: StereoFrameSource;

  private readonly bridge: LiveFrameBridge;

  private readonly statusListeners = new Set<LiveTransportStatusListener>();

  private config: LiveTransportConfig;

  private status: LiveTransportStatusSnapshot;

  constructor(options: DevTransportAdapterOptions = {}) {
    this.config = normalizeLiveTransportConfig({
      ...DEFAULT_LIVE_TRANSPORT_CONFIG,
      ...options.config,
    });

    this.bridge = new LiveFrameBridge({
      sceneId: this.resolveSceneId(this.config),
      autoStartDemoFeed: options.autoStartDemoFeed ?? true,
      tickIntervalMs: options.tickIntervalMs,
    });
    this.frameSource = this.bridge.source;

    this.status = {
      adapterType: this.adapterType,
      adapterDisplayName: this.displayName,
      state: "idle",
      connected: false,
      statusText: "Development transport idle.",
      sequenceHealth: DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
      config: this.config,
    };

    this.frameSource.subscribeStatus((sourceStatus) => {
      if (sourceStatus.state === "error") {
        this.updateStatus({
          state: "error",
          connected: false,
          statusText: sourceStatus.lastError
            ? `Transport error: ${sourceStatus.lastError}`
            : "Transport error.",
          lastError: sourceStatus.lastError,
        });
        return;
      }

      if (
        sourceStatus.state === "running" &&
        (this.status.state === "starting" ||
          this.status.state === "connecting" ||
          this.status.state === "reconnecting")
      ) {
        this.updateStatus({
          state: "running",
          connected: true,
          statusText: this.bridge.getSnapshot().demoFeedActive
            ? "Development transport running demo feed."
            : "Development transport running.",
          lastError: undefined,
        });
      }
    });
  }

  getStatus(): LiveTransportStatusSnapshot {
    return this.status;
  }

  subscribeStatus(listener: LiveTransportStatusListener): Unsubscribe {
    this.statusListeners.add(listener);
    listener(this.status);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getConfig(): LiveTransportConfig {
    return this.config;
  }

  updateConfig(configPatch: Partial<LiveTransportConfig>): LiveTransportConfig {
    this.config = normalizeLiveTransportConfig({
      ...this.config,
      ...configPatch,
    });
    this.bridge.updateSceneId(this.resolveSceneId(this.config));

    this.updateStatus({
      config: this.config,
      statusText:
        this.status.state === "running"
          ? `Development transport configured for ${this.config.host}:${this.config.port}.`
          : "Development transport configuration updated.",
    });

    return this.config;
  }

  async start(): Promise<void> {
    if (
      this.status.state === "starting" ||
      this.status.state === "connecting" ||
      this.status.state === "running" ||
      this.status.state === "reconnecting"
    ) {
      return;
    }

    this.updateStatus({
      state: "starting",
      connected: false,
      statusText: "Starting development transport...",
      lastError: undefined,
    });

    await delay(180);

    this.updateStatus({
      state: "connecting",
      connected: false,
      statusText: `Connecting to ${this.config.host}:${this.config.port}${this.config.path}...`,
    });

    await delay(220);
    await this.bridge.start();

    this.updateStatus({
      state: "running",
      connected: true,
      statusText: this.bridge.getSnapshot().demoFeedActive
        ? "Development transport running demo feed."
        : "Development transport ready.",
      lastError: undefined,
    });
  }

  async stop(): Promise<void> {
    await this.bridge.stop();
    this.updateStatus({
      state: "stopped",
      connected: false,
      statusText: "Development transport stopped.",
    });
  }

  getDebugSnapshot(): LiveTransportDebugSnapshot {
    return {
      demoFeedActive: this.bridge.getSnapshot().demoFeedActive,
    };
  }

  async startDemoFeed(): Promise<void> {
    await this.start();
    await this.bridge.startDemoFeed();

    this.updateStatus({
      state: "running",
      connected: true,
      statusText: "Development transport running demo feed.",
      lastError: undefined,
    });
  }

  async stopDemoFeed(): Promise<void> {
    await this.bridge.stopDemoFeed();

    this.updateStatus({
      state: "running",
      connected: true,
      statusText: "Development transport running with demo feed paused.",
    });
  }

  async toggleDemoFeed(): Promise<void> {
    if (this.bridge.getSnapshot().demoFeedActive) {
      await this.stopDemoFeed();
      return;
    }

    await this.startDemoFeed();
  }

  private updateStatus(patch: Partial<LiveTransportStatusSnapshot>): void {
    this.status = {
      ...this.status,
      ...patch,
      adapterType: this.adapterType,
      adapterDisplayName: this.displayName,
      config: patch.config ?? this.config,
    };

    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }

  private resolveSceneId(config: LiveTransportConfig): string {
    return config.streamName || config.path.replace(/\//g, "_") || "live_placeholder";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
