import { describe, expect, it } from "vitest";
import {
  createSettingsPatchCommand,
  type ControlCommand,
} from "./control_client";
import { LiveTransportControlClient } from "./live_transport_control_client";
import { SettingsStore } from "../settings_state/settings_store";
import type {
  LiveTransportAdapter,
  LiveTransportConfig,
  LiveTransportStatusSnapshot,
} from "../stereo_viewer/transport_adapter";

describe("LiveTransportControlClient", () => {
  it("builds outbound settings_patch commands for thermal and IR updates", () => {
    const command = createSettingsPatchCommand({
      thermalOverlayMode: "hot_edges",
      irEnabled: true,
      irLevel: 3,
    });

    expect(command.type).toBe("settings_patch");
    expect(command.payload.changes).toEqual({
      thermalOverlayMode: "hot_edges",
      irEnabled: true,
      irLevel: 3,
    });
  });

  it("sends operator control messages through a connected live adapter", async () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
      liveTransportAdapterType: "jetson_stub",
    });
    const adapter = new FakeControlAdapter({
      adapterType: "jetson_stub",
      connected: true,
    });
    const controlClient = new LiveTransportControlClient({
      settingsStore,
      liveTransportAdapters: {
        jetson_stub: adapter,
      },
    });

    await controlClient.syncSettings({
      thermalOverlayMode: "full_thermal",
      irEnabled: true,
      irLevel: 4,
    });

    expect(adapter.sentMessages).toHaveLength(1);
    expect((adapter.sentMessages[0] as ControlCommand).type).toBe("settings_patch");
    expect(
      (adapter.sentMessages[0] as ControlCommand).payload,
    ).toMatchObject({
      changes: {
        thermalOverlayMode: "full_thermal",
        irEnabled: true,
        irLevel: 4,
      },
    });
    expect(controlClient.getConnectionSnapshot().state).toBe("connected");

    controlClient.dispose();
  });

  it("fails safely when no connected outbound control channel is available", async () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
      liveTransportAdapterType: "jetson_stub",
    });
    const adapter = new FakeControlAdapter({
      adapterType: "jetson_stub",
      connected: false,
      state: "idle",
    });
    const controlClient = new LiveTransportControlClient({
      settingsStore,
      liveTransportAdapters: {
        jetson_stub: adapter,
      },
    });

    await controlClient.syncSettings({
      thermalOverlayMode: "hotspot_highlight",
      irEnabled: true,
      irLevel: 2,
    });

    expect(adapter.sentMessages).toHaveLength(0);
    expect(controlClient.getConnectionSnapshot().state).toBe("disconnected");

    const connectSnapshot = await controlClient.connect();
    expect(connectSnapshot.lastError).toContain("Connect the live WebSocket transport");

    controlClient.dispose();
  });
});

class FakeControlAdapter implements LiveTransportAdapter {
  readonly id = "fake-control-adapter";

  readonly displayName = "Fake Control Adapter";

  readonly frameSource = {} as LiveTransportAdapter["frameSource"];

  readonly sentMessages: unknown[] = [];

  private readonly listeners = new Set<(status: LiveTransportStatusSnapshot) => void>();

  private status: LiveTransportStatusSnapshot;

  constructor(options: {
    readonly adapterType: LiveTransportStatusSnapshot["adapterType"];
    readonly connected: boolean;
    readonly state?: LiveTransportStatusSnapshot["state"];
  }) {
    this.adapterType = options.adapterType;
    this.status = {
      adapterType: options.adapterType,
      adapterDisplayName: this.displayName,
      state: options.state ?? (options.connected ? "running" : "idle"),
      connected: options.connected,
      statusText: options.connected ? "Connected." : "Idle.",
      sequenceHealth: {
        repeatedCount: 0,
        outOfOrderCount: 0,
        droppedCountEstimate: 0,
      },
      config: {
        host: "127.0.0.1",
        port: 8090,
        path: "/jetson/messages",
        protocolType: "websocket_json",
        reconnectEnabled: true,
        reconnectIntervalMs: 1000,
        streamName: "test",
        maxMessageBytes: 512 * 1024,
        maxImagePayloadBytes: 256 * 1024,
        options: {},
      },
    };
  }

  readonly adapterType: LiveTransportStatusSnapshot["adapterType"];

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  getStatus(): LiveTransportStatusSnapshot {
    return this.status;
  }

  subscribeStatus(
    listener: (status: LiveTransportStatusSnapshot) => void,
  ) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  updateConfig(_configPatch: Partial<LiveTransportConfig>) {
    return this.status.config;
  }

  getConfig() {
    return this.status.config;
  }

  async sendControlMessage(message: unknown): Promise<void> {
    this.sentMessages.push(message);
  }
}
