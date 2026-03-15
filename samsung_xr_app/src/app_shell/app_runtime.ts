import type { HandInputRuntime, Unsubscribe } from "../hand_input/contracts";
import type { HandInteractionEvent } from "../hand_input/events";
import type {
  ControlClient,
  ControlClientConnectionState,
} from "../control_client/control_client";
import {
  createSelectProfileCommand,
  createSessionCommand,
} from "../control_client/control_client";
import { MockRuntime } from "../mock_mode/mock_runtime";
import type { ViewerSurface } from "../stereo_viewer/viewer_surface";
import {
  hasLiveTransportDebugControls,
  hasLiveTransportSampleIngressControls,
  hasLiveTransportControlChannel,
  DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
  type LiveTransportAdapter,
  type LiveTransportAdapterType,
  type LiveTransportStatusSnapshot,
} from "../stereo_viewer/transport_adapter";
import {
  SettingsStore,
  type SourceMode,
  type XrAppSettingsPatch,
  type XrAppSettingsState,
} from "../settings_state/settings_store";

/**
 * Top-level lifecycle states managed by the XR application shell.
 */
export type AppLifecycleState =
  | "idle"
  | "starting"
  | "running_live"
  | "running_mock"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Snapshot of app-shell state that UI and diagnostics layers can observe.
 */
export interface AppRuntimeSnapshot {
  readonly lifecycleState: AppLifecycleState;
  readonly activeMode: "offline" | "live" | "mock";
  readonly connectionState: ControlClientConnectionState;
  readonly menuVisible: boolean;
  readonly sourceMode: SourceMode;
  readonly handInputSourceId?: string;
  readonly handInputSourceName?: string;
  readonly lastHandEventType?: HandInteractionEvent["type"];
  readonly lastError?: string;
}

/**
 * Listener invoked whenever the application shell snapshot changes.
 */
export type AppRuntimeListener = (snapshot: AppRuntimeSnapshot) => void;

const LIVE_TRANSPORT_STATUS_SYNC_INTERVAL_MS = 120;

/**
 * Dependencies required to boot the app scaffold.
 *
 * The live hand input runtime remains optional because a real XR SDK adapter
 * does not exist yet. During development, the shell defaults to mock mode and
 * can later switch to live mode when a control transport exists.
 */
export interface AppRuntimeDependencies {
  readonly controlClient: ControlClient;
  readonly viewerSurface: ViewerSurface;
  readonly liveHandInput?: HandInputRuntime;
  readonly liveTransportAdapters?: Readonly<
    Partial<Record<LiveTransportAdapterType, LiveTransportAdapter>>
  >;
  readonly settingsStore?: SettingsStore;
  readonly mockRuntime?: MockRuntime;
}

/**
 * Coordinates subsystem startup and high-level lifecycle state.
 *
 * Responsibilities in this scaffold:
 * - initialize subsystem state
 * - register hand-input listeners
 * - boot mock mode by default
 * - expose live/mock switching through a control-safe seam
 * - push runtime status into the shared settings store
 */
export class AppRuntime {
  readonly settingsStore: SettingsStore;

  private readonly controlClient: ControlClient;

  private readonly viewerSurface: ViewerSurface;

  private readonly liveHandInput?: HandInputRuntime;

  private readonly liveTransportAdapters: Readonly<
    Partial<Record<LiveTransportAdapterType, LiveTransportAdapter>>
  >;

  private readonly mockRuntime?: MockRuntime;

  private readonly listeners = new Set<AppRuntimeListener>();

  private snapshot: AppRuntimeSnapshot;

  private activeHandInput?: HandInputRuntime;

  private handInputUnsubscribe?: Unsubscribe;

  private controlConnectionUnsubscribe?: Unsubscribe;

  private liveTransportStatusUnsubscribe?: Unsubscribe;

  private settingsChangeUnsubscribe?: Unsubscribe;

  private liveTransportStatusSyncTimer?: ReturnType<typeof setTimeout>;

  private pendingLiveTransportStatus?: LiveTransportStatusSnapshot;

  private lastAppliedLiveTransportStatus?: LiveTransportStatusSnapshot;

  private lastSettingsSnapshot: XrAppSettingsState;

  constructor(dependencies: AppRuntimeDependencies) {
    this.controlClient = dependencies.controlClient;
    this.viewerSurface = dependencies.viewerSurface;
    this.liveHandInput = dependencies.liveHandInput;
    this.liveTransportAdapters = dependencies.liveTransportAdapters ?? {};
    this.mockRuntime = dependencies.mockRuntime;
    this.settingsStore = dependencies.settingsStore ?? new SettingsStore();

    this.snapshot = {
      lifecycleState: "idle",
      activeMode: "offline",
      connectionState: this.controlClient.getConnectionSnapshot().state,
      menuVisible: false,
      sourceMode: this.settingsStore.getSnapshot().sourceMode,
    };
    this.lastSettingsSnapshot = this.settingsStore.getSnapshot();
  }

  getSnapshot(): AppRuntimeSnapshot {
    return this.snapshot;
  }

  subscribe(listener: AppRuntimeListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (
      this.snapshot.lifecycleState === "starting" ||
      this.snapshot.lifecycleState === "running_live" ||
      this.snapshot.lifecycleState === "running_mock"
    ) {
      return;
    }

    this.updateSnapshot({
      lifecycleState: "starting",
      lastError: undefined,
    });

    this.settingsStore.update({
      appRunning: true,
      isConnected: false,
      sourceMode: "mock",
      statusText: "Starting Samsung XR app in mock mode.",
    });

    await this.viewerSurface.initialize();
    this.registerControlConnectionListener();
    this.registerLiveTransportStatusListener();
    this.registerSettingsListener();

    await this.activateMockMode("Mock mode active by default.");
  }

  async stop(): Promise<void> {
    if (
      this.snapshot.lifecycleState === "idle" ||
      this.snapshot.lifecycleState === "stopped"
    ) {
      return;
    }

    this.updateSnapshot({
      lifecycleState: "stopping",
    });

    await this.stopActiveMode();
    this.controlConnectionUnsubscribe?.();
    this.controlConnectionUnsubscribe = undefined;
    this.liveTransportStatusUnsubscribe?.();
    this.liveTransportStatusUnsubscribe = undefined;
    this.clearLiveTransportStatusSyncTimer();
    this.pendingLiveTransportStatus = undefined;
    this.lastAppliedLiveTransportStatus = undefined;
    this.settingsChangeUnsubscribe?.();
    this.settingsChangeUnsubscribe = undefined;
    await this.controlClient.disconnect();

    this.settingsStore.update({
      appRunning: false,
      isConnected: false,
      sourceMode: "mock",
      statusText: "Samsung XR app stopped.",
    });

    this.updateSnapshot({
      lifecycleState: "stopped",
      activeMode: "offline",
      connectionState: "disconnected",
      menuVisible: false,
      sourceMode: "mock",
    });
  }

  /**
   * Applies a settings patch to local state.
   *
   * Control-relevant fields are forwarded to the control client via the store
   * subscription handler.
   */
  updateSettings(patch: XrAppSettingsPatch): XrAppSettingsState {
    return this.settingsStore.update(patch);
  }

  updateLiveTransportConfig(
    configPatch: Partial<XrAppSettingsState["liveTransportConfig"]>,
  ): XrAppSettingsState {
    return this.settingsStore.updateLiveTransportConfig(configPatch);
  }

  async applyLiveTransportConfig(): Promise<void> {
    const liveTransportAdapter = this.getSelectedLiveTransportAdapter();
    if (!liveTransportAdapter) {
      return;
    }

    const appliedConfig = liveTransportAdapter.updateConfig(
      this.settingsStore.getSnapshot().liveTransportConfig,
    );
    this.settingsStore.setLiveTransportConfig(appliedConfig);
    this.syncLiveTransportDebugState(liveTransportAdapter);
  }

  async toggleLiveTransportDemoFeed(): Promise<void> {
    const liveTransportAdapter = this.getSelectedLiveTransportAdapter();
    if (!hasLiveTransportDebugControls(liveTransportAdapter)) {
      return;
    }

    await liveTransportAdapter.toggleDemoFeed();
    this.syncLiveTransportDebugState(liveTransportAdapter);

    if (this.settingsStore.getSnapshot().sourceMode === "live") {
      this.settingsStore.setStatusText(
        liveTransportAdapter.getDebugSnapshot().demoFeedActive
          ? "Live transport demo feed running."
          : "Live transport demo feed paused.",
      );
    }
  }

  async injectLiveTransportSamplePayload(): Promise<void> {
    const liveTransportAdapter = this.getSelectedLiveTransportAdapter();
    if (!hasLiveTransportSampleIngressControls(liveTransportAdapter)) {
      return;
    }

    await liveTransportAdapter.injectSamplePayload();
    this.syncLiveTransportDebugState(liveTransportAdapter);
  }

  async connectLiveTransport(): Promise<void> {
    const liveTransportAdapter = this.getSelectedLiveTransportAdapter();
    if (!liveTransportAdapter) {
      return;
    }

    if (this.snapshot.activeMode === "live") {
      this.viewerSurface.attachFrameSource(liveTransportAdapter.frameSource);
    }

    await liveTransportAdapter.start();
    this.syncLiveTransportDebugState(liveTransportAdapter);
  }

  async disconnectLiveTransport(): Promise<void> {
    const liveTransportAdapter = this.getSelectedLiveTransportAdapter();
    if (!liveTransportAdapter) {
      return;
    }

    await liveTransportAdapter.stop();
    this.syncLiveTransportDebugState(liveTransportAdapter);
  }

  async setLiveTransportAdapterType(
    type: LiveTransportAdapterType,
  ): Promise<void> {
    const nextAdapter = this.resolveLiveTransportAdapter(type);
    if (!nextAdapter) {
      return;
    }

    const previousAdapter = this.getSelectedLiveTransportAdapter();
    const previousType = this.settingsStore.getSnapshot().liveTransportAdapterType;
    if (previousType === nextAdapter.adapterType && previousAdapter?.id === nextAdapter.id) {
      return;
    }

    if (this.snapshot.activeMode === "live" && previousAdapter) {
      await this.stopLiveSource(previousAdapter);
      this.viewerSurface.detachFrameSource();
    }

    this.settingsStore.update({
      liveTransportAdapterType: nextAdapter.adapterType,
      liveTransportAdapterDisplayName: nextAdapter.displayName,
      liveTransportConfig: nextAdapter.getConfig(),
      liveTransportConnected: false,
      liveTransportErrorText: undefined,
      liveTransportParseErrorText: undefined,
      liveTransportLastMessageType: undefined,
      liveTransportLastSequence: undefined,
      liveTransportLastMessageTimestampMs: undefined,
      liveTransportLastMessageSizeBytes: undefined,
      liveTransportSequenceHealth: DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
      liveTransportCapabilities: undefined,
      liveTransportDemoFeedActive: false,
      statusText: `Live adapter selected: ${nextAdapter.displayName}.`,
    });

    this.registerLiveTransportStatusListener();

    if (this.snapshot.activeMode === "live") {
      await this.startLiveSource(nextAdapter);
      this.settingsStore.setStatusText(this.resolveLiveModeStatusText());
    }
  }

  /**
   * Attempts to switch the app into the requested content mode.
   */
  async setSourceMode(mode: SourceMode): Promise<void> {
    if (mode === "mock") {
      await this.activateMockMode("Mock mode selected.");
      return;
    }

    this.settingsStore.update({
      sourceMode: "live",
      statusText: "Live source mode selected.",
    });
    this.updateSnapshot({
      sourceMode: "live",
    });

    await this.activateLiveMode();
  }

  /**
   * Attempts to connect to the future Jetson control path.
   */
  async connect(): Promise<void> {
    this.settingsStore.update({
      statusText: "Attempting Jetson control connection...",
    });

    await this.controlClient.connect();
  }

  /**
   * Disconnects from the future live control path and returns to mock mode.
   */
  async disconnect(): Promise<void> {
    await this.controlClient.disconnect();

    const sourceMode = this.settingsStore.getSnapshot().sourceMode;
    this.settingsStore.update({
      isConnected: false,
      statusText:
        sourceMode === "live"
          ? "Jetson control disconnected. Live source remains active."
          : "Jetson control disconnected. Mock source remains active.",
    });
  }

  async runJetsonPreflight(): Promise<void> {
    await this.sendJetsonSessionCommand(
      createSessionCommand("run_preflight"),
      "Jetson preflight requested. Waiting for health report...",
    );
  }

  async refreshJetsonEffectiveConfig(): Promise<void> {
    await this.sendJetsonSessionCommand(
      createSessionCommand("show_effective_config"),
      "Jetson runtime refresh requested. Waiting for config update...",
    );
  }

  async captureJetsonSnapshot(): Promise<void> {
    await this.sendJetsonSessionCommand(
      createSessionCommand("capture_snapshot"),
      "Jetson stereo snapshot requested. Waiting for artifact summary...",
    );
  }

  async selectJetsonProfile(profileName: string): Promise<void> {
    const normalizedProfileName = profileName.trim();
    if (normalizedProfileName.length === 0) {
      this.settingsStore.setStatusText("Select a Jetson runtime profile first.");
      return;
    }

    await this.sendJetsonSessionCommand(
      createSelectProfileCommand(normalizedProfileName),
      `Jetson profile change requested: ${normalizedProfileName}. Waiting for runtime update...`,
    );
  }

  async startJetsonRecording(): Promise<void> {
    await this.sendJetsonSessionCommand(
      createSessionCommand("start_recording"),
      "Jetson recording start requested. Waiting for runtime status...",
    );
  }

  async stopJetsonRecording(): Promise<void> {
    await this.sendJetsonSessionCommand(
      createSessionCommand("stop_recording"),
      "Jetson recording stop requested. Waiting for artifact summary...",
    );
  }

  async toggleSourceMode(): Promise<void> {
    const nextMode = this.snapshot.sourceMode === "mock" ? "live" : "mock";
    await this.setSourceMode(nextMode);
  }

  private registerControlConnectionListener(): void {
    this.controlConnectionUnsubscribe?.();
    this.controlConnectionUnsubscribe = this.controlClient.subscribeConnection(
      (connection) => {
        this.handleConnectionSnapshot(connection);
      },
    );
  }

  private registerLiveTransportStatusListener(): void {
    this.liveTransportStatusUnsubscribe?.();
    this.clearLiveTransportStatusSyncTimer();
    this.pendingLiveTransportStatus = undefined;
    this.lastAppliedLiveTransportStatus = undefined;

    const liveTransportAdapter = this.getSelectedLiveTransportAdapter();
    if (!liveTransportAdapter) {
      return;
    }

    this.settingsStore.update({
      liveTransportAdapterType: liveTransportAdapter.adapterType,
      liveTransportAdapterDisplayName: liveTransportAdapter.displayName,
      liveTransportConfig: liveTransportAdapter.getConfig(),
    });
    this.syncLiveTransportDebugState(liveTransportAdapter);

    this.liveTransportStatusUnsubscribe = liveTransportAdapter.subscribeStatus(
      (status) => {
        this.queueLiveTransportStatus(status);
      },
    );
  }

  private registerSettingsListener(): void {
    this.settingsChangeUnsubscribe?.();
    this.lastSettingsSnapshot = this.settingsStore.getSnapshot();
    this.settingsChangeUnsubscribe = this.settingsStore.subscribe((snapshot) => {
      this.handleSettingsSnapshot(snapshot);
    });
  }

  private handleConnectionSnapshot(connection: {
    readonly state: ControlClientConnectionState;
    readonly lastError?: string;
  }): void {
    const wasConnected = this.snapshot.connectionState === "connected";
    this.updateSnapshot({
      connectionState: connection.state,
      lastError: connection.lastError,
    });

    if (connection.state === "connecting") {
      this.settingsStore.update({
        statusText: "Connecting to Jetson control client...",
      });
      return;
    }

    if (connection.state === "connected") {
      if (connection.lastError) {
        this.settingsStore.update({
          isConnected: true,
          statusText: connection.lastError,
        });
        return;
      }

      if (!wasConnected) {
        void this.controlClient.syncSettings(
          createInitialRuntimeControlPatch(this.settingsStore.getSnapshot()),
        );
      }

      this.settingsStore.update({
        isConnected: true,
        statusText:
          this.settingsStore.getSnapshot().sourceMode === "live"
            ? "Jetson control connected. Live source active."
            : "Jetson control connected. Mock source active.",
      });
      return;
    }

    this.settingsStore.update({
      isConnected: false,
      statusText:
        connection.lastError ??
        (this.settingsStore.getSnapshot().sourceMode === "live"
          ? "Jetson control disconnected. Live source active."
          : "Jetson control disconnected. Mock source active."),
    });
  }

  private queueLiveTransportStatus(status: LiveTransportStatusSnapshot): void {
    const previousStatus =
      this.pendingLiveTransportStatus ?? this.lastAppliedLiveTransportStatus;
    if (
      previousStatus &&
      areLiveTransportStatusSnapshotsEquivalent(previousStatus, status)
    ) {
      return;
    }

    if (shouldApplyLiveTransportStatusImmediately(previousStatus, status)) {
      this.pendingLiveTransportStatus = undefined;
      this.clearLiveTransportStatusSyncTimer();
      this.applyLiveTransportStatus(status);
      return;
    }

    this.pendingLiveTransportStatus = status;
    if (this.liveTransportStatusSyncTimer) {
      return;
    }

    this.liveTransportStatusSyncTimer = setTimeout(() => {
      this.liveTransportStatusSyncTimer = undefined;
      const pendingStatus = this.pendingLiveTransportStatus;
      this.pendingLiveTransportStatus = undefined;
      if (!pendingStatus) {
        return;
      }

      this.applyLiveTransportStatus(pendingStatus);
    }, LIVE_TRANSPORT_STATUS_SYNC_INTERVAL_MS);
  }

  private applyLiveTransportStatus(
    status: LiveTransportStatusSnapshot,
  ): void {
    this.lastAppliedLiveTransportStatus = status;
    this.settingsStore.update({
      liveTransportAdapterType: status.adapterType,
      liveTransportAdapterDisplayName: status.adapterDisplayName,
      liveTransportStatusState: status.state,
      liveTransportConnected: status.connected,
      liveTransportStatusText: status.statusText,
      liveTransportErrorText: status.lastError,
      liveTransportParseErrorText: status.lastParseError,
      liveTransportLastMessageType: status.lastMessageType,
      liveTransportLastSequence: status.lastSequence,
      liveTransportLastMessageTimestampMs: status.lastMessageTimestampMs,
      liveTransportLastMessageSizeBytes: status.lastMessageSizeBytes,
      liveTransportSequenceHealth: status.sequenceHealth,
      liveTransportCapabilities: status.capabilities,
      ...(this.settingsStore.getSnapshot().sourceMode === "live"
        ? { statusText: status.statusText }
        : {}),
    });
    this.syncLiveTransportDebugState();

    this.updateSnapshot({
      lastError:
        status.state === "error"
          ? status.lastError ?? status.lastParseError
          : undefined,
    });
  }

  private clearLiveTransportStatusSyncTimer(): void {
    if (this.liveTransportStatusSyncTimer) {
      clearTimeout(this.liveTransportStatusSyncTimer);
      this.liveTransportStatusSyncTimer = undefined;
    }
  }

  private handleSettingsSnapshot(snapshot: XrAppSettingsState): void {
    const brightnessChanged =
      this.lastSettingsSnapshot.brightness !== snapshot.brightness;
    const overlayChanged =
      this.lastSettingsSnapshot.overlayEnabled !== snapshot.overlayEnabled;
    const patch = createControlSyncPatch(this.lastSettingsSnapshot, snapshot);
    this.lastSettingsSnapshot = snapshot;

    if (brightnessChanged) {
      void this.controlClient.setBrightness(snapshot.brightness);
    }

    if (overlayChanged) {
      void this.controlClient.setOverlayEnabled(snapshot.overlayEnabled);
    }

    if (Object.keys(patch).length > 0) {
      void this.controlClient.syncSettings(patch);
    }
  }

  private async sendJetsonSessionCommand(
    command: ReturnType<typeof createSessionCommand>,
    requestStatusText: string,
  ): Promise<void> {
    const unavailableReason = this.getJetsonControlUnavailableReason();
    if (unavailableReason) {
      this.settingsStore.setStatusText(unavailableReason);
      this.updateSnapshot({
        lastError: unavailableReason,
      });
      return;
    }

    this.settingsStore.setStatusText(requestStatusText);
    await this.controlClient.sendCommand(command);
  }

  private getJetsonControlUnavailableReason(): string | undefined {
    const settings = this.settingsStore.getSnapshot();
    if (settings.sourceMode !== "live") {
      return "Switch source mode to Live to use Jetson runtime controls.";
    }

    const liveTransportAdapter = this.getSelectedLiveTransportAdapter();
    if (!liveTransportAdapter || liveTransportAdapter.adapterType !== "jetson_stub") {
      return "Select the Jetson transport adapter to use Jetson runtime controls.";
    }

    if (!hasLiveTransportControlChannel(liveTransportAdapter)) {
      return "The selected live transport adapter does not support outbound Jetson control.";
    }

    if (!settings.liveTransportConnected) {
      return "Connect the Jetson WebSocket transport to use Jetson runtime controls.";
    }

    if (this.controlClient.getConnectionSnapshot().state !== "connected") {
      return "Connect Jetson control to use Jetson runtime controls.";
    }

    return undefined;
  }

  private async activateLiveMode(): Promise<void> {
    await this.stopMockModeIfNeeded();

    const handInput = this.liveHandInput ?? this.mockRuntime?.handInput;
    if (!handInput) {
      this.updateSnapshot({
        lifecycleState: "error",
        activeMode: "offline",
        lastError: "No hand input runtime is available for live mode.",
      });
      return;
    }

    await this.attachHandInput(handInput, true);
    await this.startLiveSource();

    this.settingsStore.update({
      sourceMode: "live",
      appRunning: true,
      statusText:
        this.resolveLiveModeStatusText(),
    });

    this.updateSnapshot({
      lifecycleState: "running_live",
      activeMode: "live",
      connectionState: this.controlClient.getConnectionSnapshot().state,
      sourceMode: "live",
      handInputSourceId: handInput.source.info.id,
      handInputSourceName: handInput.source.info.displayName,
      lastError: undefined,
    });
  }

  private async activateMockMode(
    reason: string,
    errorMessage?: string,
  ): Promise<void> {
    if (!this.mockRuntime) {
      this.updateSnapshot({
        lifecycleState: "error",
        activeMode: "offline",
        lastError: errorMessage ?? reason,
      });
      return;
    }

    if (this.snapshot.activeMode === "mock" && this.mockRuntime.getSnapshot().active) {
      if (this.activeHandInput !== this.mockRuntime.handInput) {
        this.attachHandInputWithoutStarting(this.mockRuntime.handInput);
      }

      this.viewerSurface.attachFrameSource(this.mockRuntime.frameSource);

      this.settingsStore.update({
        sourceMode: "mock",
        isConnected: false,
        appRunning: true,
        statusText: reason,
      });

      this.updateSnapshot({
        lifecycleState: "running_mock",
        activeMode: "mock",
        connectionState: "disconnected",
        sourceMode: "mock",
        handInputSourceId: this.mockRuntime.handInput.source.info.id,
        handInputSourceName: this.mockRuntime.handInput.source.info.displayName,
        lastError: errorMessage,
      });
      return;
    }

    if (this.snapshot.activeMode === "live") {
      await this.stopLiveSource();
      await this.controlClient.disconnect();
    }

    await this.detachActiveHandInput(true);
    this.viewerSurface.attachFrameSource(this.mockRuntime.frameSource);
    await this.mockRuntime.start();
    this.attachHandInputWithoutStarting(this.mockRuntime.handInput);

    this.settingsStore.update({
      sourceMode: "mock",
      isConnected: false,
      appRunning: true,
      statusText: reason,
    });

    this.updateSnapshot({
      lifecycleState: "running_mock",
      activeMode: "mock",
      connectionState: "disconnected",
      sourceMode: "mock",
      handInputSourceId: this.mockRuntime.handInput.source.info.id,
      handInputSourceName: this.mockRuntime.handInput.source.info.displayName,
      lastError: errorMessage,
    });
  }

  private async stopActiveMode(): Promise<void> {
    if (this.snapshot.activeMode === "mock" && this.mockRuntime) {
      await this.mockRuntime.stop();
    }

    if (this.snapshot.activeMode === "live") {
      await this.stopLiveSource();
    }

    this.viewerSurface.detachFrameSource();
    await this.detachActiveHandInput(true);
  }

  private async stopMockModeIfNeeded(): Promise<void> {
    if (this.snapshot.activeMode === "mock" && this.mockRuntime) {
      await this.mockRuntime.stop();
      this.viewerSurface.detachFrameSource();
      this.handInputUnsubscribe?.();
      this.handInputUnsubscribe = undefined;
      this.activeHandInput = undefined;
    }
  }

  private async attachHandInput(
    handInput: HandInputRuntime,
    startRuntime: boolean,
  ): Promise<void> {
    await this.detachActiveHandInput(true);
    this.attachHandInputWithoutStarting(handInput);

    if (startRuntime) {
      await handInput.start();
    }
  }

  private attachHandInputWithoutStarting(handInput: HandInputRuntime): void {
    this.activeHandInput = handInput;
    this.handInputUnsubscribe?.();
    this.handInputUnsubscribe = handInput.subscribe((event) => {
      this.handleHandInputEvent(event);
    });
  }

  private async detachActiveHandInput(stopRuntime: boolean): Promise<void> {
    if (stopRuntime && this.activeHandInput) {
      await this.activeHandInput.stop();
    }

    this.handInputUnsubscribe?.();
    this.handInputUnsubscribe = undefined;
    this.activeHandInput = undefined;
  }

  private handleHandInputEvent(event: HandInteractionEvent): void {
    if (event.type === "show_menu") {
      this.updateSnapshot({
        menuVisible: true,
        lastHandEventType: event.type,
      });
      return;
    }

    if (event.type === "hide_menu") {
      this.updateSnapshot({
        menuVisible: false,
        lastHandEventType: event.type,
      });
      return;
    }

    if (event.type === "adjust_zoom") {
      this.updateSettings({
        digitalZoom: this.settingsStore.getSnapshot().digitalZoom + event.deltaScale,
      });

      this.updateSnapshot({
        lastHandEventType: event.type,
      });
      return;
    }

    this.updateSnapshot({
      lastHandEventType: event.type,
    });
  }

  private updateSnapshot(patch: Partial<AppRuntimeSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    };

    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private async startLiveSource(
    liveTransportAdapter = this.getSelectedLiveTransportAdapter(),
  ): Promise<void> {
    const liveSource = liveTransportAdapter?.frameSource;

    if (liveSource) {
      this.viewerSurface.attachFrameSource(liveSource);
    } else {
      this.viewerSurface.detachFrameSource();
    }

    // Keep Jetson WebSocket manual-connect so operators can edit/apply transport
    // settings before the browser starts dialing the live sender endpoint.
    if (liveTransportAdapter && liveTransportAdapter.adapterType !== "jetson_stub") {
      await liveTransportAdapter.start();
    }
  }

  private async stopLiveSource(
    liveTransportAdapter = this.getSelectedLiveTransportAdapter(),
  ): Promise<void> {
    if (liveTransportAdapter) {
      await liveTransportAdapter.stop();
    }
  }

  private resolveLiveModeStatusText(): string {
    const liveTransportAdapter = this.getSelectedLiveTransportAdapter();
    const hasLiveSource = Boolean(liveTransportAdapter?.frameSource);
    if (!hasLiveSource) {
      return "Live mode active, but no live stereo frame source is configured.";
    }

    const adapterStatusText = liveTransportAdapter?.getStatus().statusText;
    if (adapterStatusText) {
      return adapterStatusText;
    }

    return this.controlClient.getConnectionSnapshot().state === "connected"
      ? `Live source active through ${liveTransportAdapter?.displayName ?? "selected adapter"}.`
      : `Live source selected through ${liveTransportAdapter?.displayName ?? "selected adapter"}.`;
  }

  private syncLiveTransportDebugState(
    liveTransportAdapter = this.getSelectedLiveTransportAdapter(),
  ): void {
    this.settingsStore.setLiveTransportDemoFeedActive(
      hasLiveTransportDebugControls(liveTransportAdapter)
        ? liveTransportAdapter.getDebugSnapshot().demoFeedActive
        : false,
    );
  }

  private getSelectedLiveTransportAdapter(): LiveTransportAdapter | undefined {
    const selectedType = this.settingsStore.getSnapshot().liveTransportAdapterType;
    return this.resolveLiveTransportAdapter(selectedType);
  }

  private resolveLiveTransportAdapter(
    type: LiveTransportAdapterType,
  ): LiveTransportAdapter | undefined {
    return (
      this.liveTransportAdapters[type] ??
      this.liveTransportAdapters.dev ??
      this.liveTransportAdapters.jetson_stub
    );
  }
}

function createControlSyncPatch(
  previous: XrAppSettingsState,
  next: XrAppSettingsState,
): XrAppSettingsPatch {
  const patch: MutableSettingsPatch = {};

  if (previous.gain !== next.gain) {
    patch.gain = next.gain;
  }

  if (previous.digitalZoom !== next.digitalZoom) {
    patch.digitalZoom = next.digitalZoom;
  }

  if (previous.stereoDisplayMode !== next.stereoDisplayMode) {
    patch.stereoDisplayMode = next.stereoDisplayMode;
  }

  if (previous.thermalOverlayEnabled !== next.thermalOverlayEnabled) {
    patch.thermalOverlayEnabled = next.thermalOverlayEnabled;
  }

  if (previous.thermalOverlayMode !== next.thermalOverlayMode) {
    patch.thermalOverlayMode = next.thermalOverlayMode;
  }

  if (previous.aiOverlayEnabled !== next.aiOverlayEnabled) {
    patch.aiOverlayEnabled = next.aiOverlayEnabled;
  }

  if (previous.irEnabled !== next.irEnabled) {
    patch.irEnabled = next.irEnabled;
  }

  if (previous.irLevel !== next.irLevel) {
    patch.irLevel = next.irLevel;
  }

  if (previous.recordingEnabled !== next.recordingEnabled) {
    patch.recordingEnabled = next.recordingEnabled;
  }

  if (previous.diagnosticsModeEnabled !== next.diagnosticsModeEnabled) {
    patch.diagnosticsModeEnabled = next.diagnosticsModeEnabled;
  }

  return patch;
}

type MutableSettingsPatch = {
  -readonly [K in keyof XrAppSettingsState]?: XrAppSettingsState[K];
};

function createInitialRuntimeControlPatch(
  snapshot: XrAppSettingsState,
): XrAppSettingsPatch {
  return {
    thermalOverlayMode: snapshot.thermalOverlayMode,
    irEnabled: snapshot.irEnabled,
    irLevel: snapshot.irLevel,
  };
}

function areLiveTransportStatusSnapshotsEquivalent(
  left: LiveTransportStatusSnapshot,
  right: LiveTransportStatusSnapshot,
): boolean {
  return (
    left.adapterType === right.adapterType &&
    left.adapterDisplayName === right.adapterDisplayName &&
    left.state === right.state &&
    left.connected === right.connected &&
    left.statusText === right.statusText &&
    left.lastError === right.lastError &&
    left.lastParseError === right.lastParseError &&
    left.lastMessageType === right.lastMessageType &&
    left.lastSequence === right.lastSequence &&
    left.lastMessageTimestampMs === right.lastMessageTimestampMs &&
    left.lastMessageSizeBytes === right.lastMessageSizeBytes &&
    areLiveTransportSequenceHealthEquivalent(
      left.sequenceHealth,
      right.sequenceHealth,
    ) &&
    left.capabilities === right.capabilities &&
    left.config === right.config
  );
}

function areLiveTransportSequenceHealthEquivalent(
  left: LiveTransportStatusSnapshot["sequenceHealth"],
  right: LiveTransportStatusSnapshot["sequenceHealth"],
): boolean {
  return (
    left.repeatedCount === right.repeatedCount &&
    left.outOfOrderCount === right.outOfOrderCount &&
    left.droppedCountEstimate === right.droppedCountEstimate &&
    left.lastAnomalyText === right.lastAnomalyText
  );
}

function shouldApplyLiveTransportStatusImmediately(
  previous: LiveTransportStatusSnapshot | undefined,
  next: LiveTransportStatusSnapshot,
): boolean {
  if (!previous) {
    return true;
  }

  if (
    previous.adapterType !== next.adapterType ||
    previous.adapterDisplayName !== next.adapterDisplayName ||
    previous.state !== next.state ||
    previous.connected !== next.connected ||
    previous.statusText !== next.statusText ||
    previous.lastError !== next.lastError ||
    previous.lastParseError !== next.lastParseError ||
    previous.capabilities !== next.capabilities ||
    previous.config !== next.config
  ) {
    return true;
  }

  if (
    previous.sequenceHealth.lastAnomalyText !== next.sequenceHealth.lastAnomalyText &&
    next.sequenceHealth.lastAnomalyText !== undefined
  ) {
    return true;
  }

  return next.lastMessageType !== "stereo_frame";
}
