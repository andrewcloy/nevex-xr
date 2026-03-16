// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSamsungXrApp } from "../app_shell/bootstrap";
import { NullControlClient } from "../control_client/control_client";
import { mountDomRenderer } from "./dom_renderer";
import { SettingsStore } from "../settings_state/settings_store";
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

describe("DomRendererAdapter transport settings", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the active Jetson transport field focused while typing", async () => {
    const { root, dispose } = createTransportRendererHarness();

    try {
      const hostInput = getInput(root, "transport-host");
      hostInput.focus();
      hostInput.setSelectionRange(0, hostInput.value.length);
      hostInput.value = "192.168.1.56";
      hostInput.dispatchEvent(new Event("input", { bubbles: true }));

      expect(document.activeElement).toBe(hostInput);
      expect(getInput(root, "transport-host")).toBe(hostInput);
      expect(hostInput.value).toBe("192.168.1.56");
    } finally {
      await dispose();
    }
  });

  it("applies edited Jetson transport config and connects using the current draft", async () => {
    const { root, jetsonAdapter, settingsStore, dispose } =
      createTransportRendererHarness();

    try {
      const hostInput = getInput(root, "transport-host");
      const portInput = getInput(root, "transport-port");
      const pathInput = getInput(root, "transport-path");

      hostInput.value = "192.168.1.56";
      hostInput.dispatchEvent(new Event("input", { bubbles: true }));
      portInput.value = "8090";
      portInput.dispatchEvent(new Event("input", { bubbles: true }));
      pathInput.value = "/jetson/messages";
      pathInput.dispatchEvent(new Event("input", { bubbles: true }));

      getButton(root, "apply-transport-config").click();
      await flushAsyncWork();

      expect(jetsonAdapter.updateConfigCalls).toHaveLength(1);
      expect(jetsonAdapter.updateConfigCalls[0]).toMatchObject({
        host: "192.168.1.56",
        port: 8090,
        path: "/jetson/messages",
      });
      expect(settingsStore.getSnapshot().liveTransportConfig.host).toBe(
        "192.168.1.56",
      );

      const refreshedHostInput = getInput(root, "transport-host");
      refreshedHostInput.value = "192.168.1.99";
      refreshedHostInput.dispatchEvent(new Event("input", { bubbles: true }));
      getButton(root, "connect-live-transport").click();
      await flushAsyncWork();

      expect(jetsonAdapter.updateConfigCalls).toHaveLength(2);
      expect(jetsonAdapter.updateConfigCalls[1]).toMatchObject({
        host: "192.168.1.99",
        port: 8090,
        path: "/jetson/messages",
      });
      expect(jetsonAdapter.startCalls).toBe(1);
      expect(settingsStore.getSnapshot().liveTransportConfig.host).toBe(
        "192.168.1.99",
      );
    } finally {
      await dispose();
    }
  });

  it("batches subscription-driven redraws onto a single animation frame", async () => {
    const queuedFrames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const { root, settingsStore, dispose } = createTransportRendererHarness();

    try {
      expect(requestAnimationFrame).not.toHaveBeenCalled();

      settingsStore.setStatusText("Queued transport refresh A");
      settingsStore.setStatusText("Queued transport refresh B");

      expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(root.textContent).not.toContain("Queued transport refresh B");

      const nextFrame = queuedFrames.shift();
      if (!nextFrame) {
        throw new Error("Expected a queued animation frame callback.");
      }
      nextFrame(16.67);
      await flushAsyncWork();

      expect(root.textContent).toContain("Queued transport refresh B");
    } finally {
      await dispose();
    }
  });
});

function createTransportRendererHarness() {
  const root = document.createElement("div");
  document.body.appendChild(root);

  vi.stubGlobal(
    "Audio",
    class {
      currentTime = 0;
      volume = 1;
      preload = "auto";

      async play(): Promise<void> {}
    },
  );
  vi.stubGlobal("scrollTo", vi.fn());

  const settingsStore = new SettingsStore({
    sourceMode: "live",
    liveTransportAdapterType: "jetson_stub",
    liveTransportAdapterDisplayName: "Jetson WebSocket Transport Adapter",
    liveTransportConfig: normalizeLiveTransportConfig({
      ...DEFAULT_LIVE_TRANSPORT_CONFIG,
      host: "127.0.0.1",
      port: 8090,
      path: "/jetson/messages",
      protocolType: "websocket_json",
      streamName: "jetson_sender_runtime_stream",
    }),
  });
  const devAdapter = new FakeTransportAdapter(
    "dev",
    "Development Transport Adapter",
  );
  const jetsonAdapter = new FakeTransportAdapter(
    "jetson_stub",
    "Jetson WebSocket Transport Adapter",
    {
      host: "127.0.0.1",
      port: 8090,
      path: "/jetson/messages",
      protocolType: "websocket_json",
      streamName: "jetson_sender_runtime_stream",
    },
  );
  const app = createSamsungXrApp({
    settingsStore,
    controlClient: new NullControlClient(),
    liveTransportAdapters: {
      dev: devAdapter,
      jetson_stub: jetsonAdapter,
    },
  });
  const renderer = mountDomRenderer({
    root,
    app,
  });

  return {
    root,
    settingsStore,
    devAdapter,
    jetsonAdapter,
    dispose: async () => {
      renderer.dispose();
      await app.dispose();
    },
  };
}

class FakeTransportAdapter implements LiveTransportAdapter {
  readonly id: string;

  readonly frameSource: PushStereoFrameSource;

  startCalls = 0;

  readonly updateConfigCalls: Partial<LiveTransportConfig>[] = [];

  private readonly statusListeners = new Set<LiveTransportStatusListener>();

  private config: LiveTransportConfig;

  private status: LiveTransportStatusSnapshot;

  constructor(
    readonly adapterType: LiveTransportAdapterType,
    readonly displayName: string,
    configOverrides: Partial<LiveTransportConfig> = {},
  ) {
    this.id = `renderer-test-${adapterType}`;
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
      state: "connecting",
      connected: false,
      statusText: `Connecting ${this.displayName}...`,
    });
  }

  async stop(): Promise<void> {
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

  private emitStatus(patch: Partial<LiveTransportStatusSnapshot>): void {
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

function getInput(
  root: HTMLElement,
  control: string,
): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(
    `input[data-control='${control}']`,
  );
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input for ${control}.`);
  }
  return input;
}

function getButton(
  root: HTMLElement,
  action: string,
): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(
    `button[data-action='${action}']`,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button for ${action}.`);
  }
  return button;
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
