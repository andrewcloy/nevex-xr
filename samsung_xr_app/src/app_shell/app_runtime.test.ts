import { afterEach, describe, expect, it } from "vitest";
import { NullControlClient } from "../control_client/control_client";
import { MockRuntime } from "../mock_mode/mock_runtime";
import { PushStereoFrameSource } from "../stereo_viewer/push_frame_source";
import {
  DEFAULT_LIVE_TRANSPORT_CONFIG,
  DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
  normalizeLiveTransportConfig,
  type LiveTransportAdapter,
  type LiveTransportAdapterType,
  type LiveTransportConfig,
  type LiveTransportStatusListener,
  type LiveTransportStatusSnapshot,
} from "../stereo_viewer/transport_adapter";
import { PlaceholderViewerSurface } from "../stereo_viewer/viewer_surface";
import { SettingsStore } from "../settings_state/settings_store";
import { AppRuntime } from "./app_runtime";

describe("AppRuntime live transport settings flow", () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (!cleanup) {
        continue;
      }

      await cleanup();
    }
  });

  it("keeps Jetson transport manual-connect and preserves draft config edits", async () => {
    const harness = createRuntimeHarness({
      initialSettings: {
        liveTransportAdapterType: "jetson_stub",
        liveTransportAdapterDisplayName: "Jetson WebSocket Transport Adapter",
      },
      jetsonConfig: {
        port: 8090,
        path: "/jetson/messages",
        protocolType: "websocket_json",
        streamName: "jetson_sender_runtime_stream",
      },
    });
    cleanupTasks.push(async () => {
      await harness.runtime.stop();
    });

    await harness.runtime.start();
    await harness.runtime.setSourceMode("live");

    expect(harness.jetsonAdapter.startCalls).toBe(0);
    expect(harness.settingsStore.getSnapshot().liveTransportAdapterType).toBe(
      "jetson_stub",
    );

    harness.runtime.updateLiveTransportConfig({
      host: "192.168.1.56",
      port: 8090,
      path: "/jetson/messages",
    });

    expect(harness.settingsStore.getSnapshot().liveTransportConfig.host).toBe(
      "192.168.1.56",
    );

    harness.jetsonAdapter.emitStatus({
      state: "connecting",
      connected: false,
      statusText:
        "Connecting WebSocket transport to ws://127.0.0.1:8090/jetson/messages...",
      config: harness.jetsonAdapter.getConfig(),
    });

    expect(harness.settingsStore.getSnapshot().liveTransportConfig.host).toBe(
      "192.168.1.56",
    );
    expect(harness.settingsStore.getSnapshot().liveTransportConfig.port).toBe(8090);
    expect(harness.settingsStore.getSnapshot().liveTransportConfig.path).toBe(
      "/jetson/messages",
    );

    await harness.runtime.applyLiveTransportConfig();

    expect(harness.jetsonAdapter.updateConfigCalls).toHaveLength(1);
    expect(harness.jetsonAdapter.getConfig().host).toBe("192.168.1.56");
    expect(harness.jetsonAdapter.getConfig().port).toBe(8090);
    expect(harness.jetsonAdapter.getConfig().path).toBe("/jetson/messages");

    await harness.runtime.connectLiveTransport();

    expect(harness.jetsonAdapter.startCalls).toBe(1);
    expect(harness.jetsonAdapter.getStatus().connected).toBe(true);
  });

  it("keeps Development transport auto-start behavior in live mode", async () => {
    const harness = createRuntimeHarness();
    cleanupTasks.push(async () => {
      await harness.runtime.stop();
    });

    await harness.runtime.start();
    await harness.runtime.setSourceMode("live");

    expect(harness.devAdapter.startCalls).toBe(1);
    expect(harness.jetsonAdapter.startCalls).toBe(0);
    expect(harness.settingsStore.getSnapshot().liveTransportAdapterType).toBe("dev");
  });
});

function createRuntimeHarness(options: {
  readonly initialSettings?: ConstructorParameters<typeof SettingsStore>[0];
  readonly devConfig?: Partial<LiveTransportConfig>;
  readonly jetsonConfig?: Partial<LiveTransportConfig>;
} = {}) {
  const settingsStore = new SettingsStore(options.initialSettings);
  const viewerSurface = new PlaceholderViewerSurface();
  const devAdapter = new FakeTransportAdapter(
    "dev",
    "Development Transport Adapter",
    options.devConfig,
  );
  const jetsonAdapter = new FakeTransportAdapter(
    "jetson_stub",
    "Jetson WebSocket Transport Adapter",
    options.jetsonConfig,
  );
  const runtime = new AppRuntime({
    controlClient: new NullControlClient(),
    viewerSurface,
    liveTransportAdapters: {
      dev: devAdapter,
      jetson_stub: jetsonAdapter,
    },
    settingsStore,
    mockRuntime: new MockRuntime({
      tickIntervalMs: 10_000,
    }),
  });

  return {
    runtime,
    settingsStore,
    devAdapter,
    jetsonAdapter,
  };
}

class FakeTransportAdapter implements LiveTransportAdapter {
  readonly id: string;

  readonly frameSource: PushStereoFrameSource;

  startCalls = 0;

  stopCalls = 0;

  readonly updateConfigCalls: Partial<LiveTransportConfig>[] = [];

  private readonly statusListeners = new Set<LiveTransportStatusListener>();

  private config: LiveTransportConfig;

  private status: LiveTransportStatusSnapshot;

  constructor(
    readonly adapterType: LiveTransportAdapterType,
    readonly displayName: string,
    configOverrides: Partial<LiveTransportConfig> = {},
  ) {
    this.id = `fake-${adapterType}-transport`;
    this.frameSource = new PushStereoFrameSource({
      id: `${this.id}-source`,
      displayName: `${displayName} Source`,
      sourceKind: "live",
    });
    this.config = normalizeLiveTransportConfig({
      ...DEFAULT_LIVE_TRANSPORT_CONFIG,
      ...configOverrides,
    });
    this.status = {
      adapterType,
      adapterDisplayName: displayName,
      state: "idle",
      connected: false,
      statusText: `${displayName} idle.`,
      sequenceHealth: DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
      config: this.config,
    };
  }

  async start(): Promise<void> {
    this.startCalls += 1;
    this.emitStatus({
      state: "running",
      connected: true,
      statusText: `${this.displayName} running.`,
    });
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
    this.emitStatus({
      state: "stopped",
      connected: false,
      statusText: `${this.displayName} stopped.`,
    });
  }

  getStatus(): LiveTransportStatusSnapshot {
    return this.status;
  }

  subscribeStatus(listener: LiveTransportStatusListener) {
    this.statusListeners.add(listener);
    listener(this.status);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  updateConfig(configPatch: Partial<LiveTransportConfig>): LiveTransportConfig {
    this.updateConfigCalls.push(configPatch);
    this.config = normalizeLiveTransportConfig({
      ...this.config,
      ...configPatch,
    });
    this.emitStatus({
      config: this.config,
      statusText: `${this.displayName} configuration updated.`,
    });
    return this.config;
  }

  getConfig(): LiveTransportConfig {
    return this.config;
  }

  emitStatus(patch: Partial<LiveTransportStatusSnapshot>): void {
    const nextConfig = patch.config ?? this.config;
    this.config = nextConfig;
    this.status = {
      ...this.status,
      ...patch,
      adapterType: this.adapterType,
      adapterDisplayName: this.displayName,
      config: nextConfig,
    };

    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }
}
