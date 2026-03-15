import type { ControlClient } from "../control_client/control_client";
import { LiveTransportControlClient } from "../control_client/live_transport_control_client";
import { DiagnosticsStore } from "../diagnostics/diagnostics_store";
import { MockRuntime } from "../mock_mode/mock_runtime";
import { DevTransportAdapter } from "../stereo_viewer/dev_transport_adapter";
import { JetsonTransportAdapter } from "../stereo_viewer/jetson_transport_adapter";
import {
  PlaceholderViewerSurface,
  type ViewerSurface,
} from "../stereo_viewer/viewer_surface";
import type {
  LiveTransportAdapter,
  LiveTransportAdapterType,
} from "../stereo_viewer/transport_adapter";
import { SettingsStore } from "../settings_state/settings_store";
import { DiagnosticsPanelController } from "../ui/diagnostics_panel";
import { HandMenuController } from "../ui/hand_menu";
import { QuickControlsController } from "../ui/quick_controls";
import { SettingsPanelController } from "../ui/settings_panel";
import { StatusPanelController } from "../ui/status_panel";
import { ZoomControlController } from "../ui/zoom_control";
import { AppRuntime } from "./app_runtime";
import { MainSceneController } from "./main_scene";

/**
 * Top-level container for the minimum viable Samsung XR app scaffold.
 */
export interface SamsungXrAppSession {
  readonly runtime: AppRuntime;
  readonly settingsStore: SettingsStore;
  readonly diagnosticsStore: DiagnosticsStore;
  readonly viewerSurface: ViewerSurface;
  readonly liveTransportAdapters: Readonly<
    Partial<Record<LiveTransportAdapterType, LiveTransportAdapter>>
  >;
  readonly scene: MainSceneController;
  readonly ui: {
    readonly statusPanel: StatusPanelController;
    readonly settingsPanel: SettingsPanelController;
    readonly quickControls: QuickControlsController;
    readonly zoomControl: ZoomControlController;
    readonly diagnosticsPanel: DiagnosticsPanelController;
    readonly handMenu: HandMenuController;
  };
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Options for constructing the app scaffold.
 */
export interface SamsungXrAppOptions {
  readonly controlClient?: ControlClient;
  readonly settingsStore?: SettingsStore;
  readonly viewerSurface?: PlaceholderViewerSurface;
  readonly liveTransportAdapters?: Partial<
    Record<LiveTransportAdapterType, LiveTransportAdapter>
  >;
  readonly mockRuntime?: MockRuntime;
}

/**
 * Creates the mock-first XR app graph without starting it.
 */
export function createSamsungXrApp(
  options: SamsungXrAppOptions = {},
): SamsungXrAppSession {
  const settingsStore = options.settingsStore ?? new SettingsStore();
  const viewerSurface = options.viewerSurface ?? new PlaceholderViewerSurface();
  const liveTransportAdapters: Partial<
    Record<LiveTransportAdapterType, LiveTransportAdapter>
  > = {
    dev:
      options.liveTransportAdapters?.dev ??
      new DevTransportAdapter({
        autoStartDemoFeed: true,
      }),
    jetson_stub:
      options.liveTransportAdapters?.jetson_stub ?? new JetsonTransportAdapter(),
  };
  const mockRuntime = options.mockRuntime ?? new MockRuntime({ tickIntervalMs: 1000 });
  const controlClient =
    options.controlClient ??
    new LiveTransportControlClient({
      settingsStore,
      liveTransportAdapters,
    });

  const runtime = new AppRuntime({
    controlClient,
    viewerSurface,
    liveTransportAdapters,
    settingsStore,
    mockRuntime,
  });

  const diagnosticsStore = new DiagnosticsStore(settingsStore);
  const statusPanel = new StatusPanelController(settingsStore, diagnosticsStore, {
    connect: async () => {
      await runtime.connect();
    },
    disconnect: async () => {
      await runtime.disconnect();
    },
    setSourceMode: async (mode) => {
      await runtime.setSourceMode(mode);
    },
    setLiveTransportAdapterType: async (type) => {
      await runtime.setLiveTransportAdapterType(type);
    },
    connectLiveTransport: async () => {
      await runtime.connectLiveTransport();
    },
    disconnectLiveTransport: async () => {
      await runtime.disconnectLiveTransport();
    },
    applyLiveTransportConfig: async () => {
      await runtime.applyLiveTransportConfig();
    },
    toggleLiveTransportDemoFeed: async () => {
      await runtime.toggleLiveTransportDemoFeed();
    },
    injectLiveTransportSamplePayload: async () => {
      await runtime.injectLiveTransportSamplePayload();
    },
    runJetsonPreflight: async () => {
      await runtime.runJetsonPreflight();
    },
    refreshJetsonEffectiveConfig: async () => {
      await runtime.refreshJetsonEffectiveConfig();
    },
    captureJetsonSnapshot: async () => {
      await runtime.captureJetsonSnapshot();
    },
    selectJetsonProfile: async (profileName) => {
      await runtime.selectJetsonProfile(profileName);
    },
    startJetsonRecording: async () => {
      await runtime.startJetsonRecording();
    },
    stopJetsonRecording: async () => {
      await runtime.stopJetsonRecording();
    },
  });
  const settingsPanel = new SettingsPanelController(settingsStore);
  const quickControls = new QuickControlsController(settingsStore);
  const zoomControl = new ZoomControlController(settingsStore);
  const diagnosticsPanel = new DiagnosticsPanelController(
    settingsStore,
    diagnosticsStore,
  );
  const handMenu = new HandMenuController(runtime, viewerSurface);
  const scene = new MainSceneController({
    runtime,
    viewerSurface,
    statusPanel,
    diagnosticsPanel,
  });

  const viewerPresentationUnsubscribe = settingsStore.subscribe((settings) => {
    viewerSurface.setPresentationOptions({
      brightness: settings.brightness,
      overlayEnabled: settings.overlayEnabled,
      thermalOverlayMode: settings.thermalOverlayMode,
    });
  });

  const viewerDiagnosticsUnsubscribe = viewerSurface.subscribe((snapshot) => {
    diagnosticsStore.recordViewerSnapshot(snapshot);
  });

  return {
    runtime,
    settingsStore,
    diagnosticsStore,
    viewerSurface,
    liveTransportAdapters,
    scene,
    ui: {
      statusPanel,
      settingsPanel,
      quickControls,
      zoomControl,
      diagnosticsPanel,
      handMenu,
    },
    start: async () => {
      await runtime.start();
    },
    stop: async () => {
      await runtime.stop();
    },
    dispose: async () => {
      await runtime.stop();
      viewerPresentationUnsubscribe();
      viewerDiagnosticsUnsubscribe();
      scene.dispose();
      statusPanel.dispose();
      settingsPanel.dispose();
      quickControls.dispose();
      zoomControl.dispose();
      diagnosticsPanel.dispose();
      handMenu.dispose();
      diagnosticsStore.dispose();
      controlClient.dispose?.();
    },
  };
}

/**
 * Creates and immediately starts the default mock-first XR app session.
 */
export async function bootSamsungXrApp(
  options: SamsungXrAppOptions = {},
): Promise<SamsungXrAppSession> {
  const app = createSamsungXrApp(options);
  await app.start();
  return app;
}
