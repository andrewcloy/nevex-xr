import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagnosticsStore } from "../diagnostics/diagnostics_store";
import { SettingsStore } from "../settings_state/settings_store";
import { StatusPanelController } from "./status_panel";
import type { ViewerSurfaceSnapshot } from "../stereo_viewer/viewer_surface";

describe("StatusPanelController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates the visible health badge across healthy, retrying, degraded, terminal, and stale states", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T13:00:00.000Z"));

    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore, {
      staleThresholdMs: 1000,
      pollIntervalMs: 100,
    });
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot("running", "healthy", Date.now()),
    );
    expect(statusPanel.getSnapshot().sourceHealthTone).toBe("healthy");
    expect(statusPanel.getSnapshot().sourceHealthText).toBe("Healthy");

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot("reconnecting", "retrying", Date.now()),
    );
    expect(statusPanel.getSnapshot().sourceHealthTone).toBe("retrying");

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot("running", "recovered", Date.now()),
    );
    expect(statusPanel.getSnapshot().sourceHealthTone).toBe("degraded");

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot("error", "terminal_failure", Date.now()),
    );
    expect(statusPanel.getSnapshot().sourceHealthTone).toBe("terminal_failure");

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot("running", "healthy", Date.now()),
    );
    vi.advanceTimersByTime(1500);
    expect(statusPanel.getSnapshot().sourceHealthTone).toBe("telemetry_stale");
    expect(statusPanel.getSnapshot().telemetryFreshnessText).toBe("Stale");

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("surfaces compact replay entry details in the always-visible status area", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );
    const telemetryReceivedAtMs = Date.now();

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot("running", "healthy", telemetryReceivedAtMs, {
        replaySourceIdentity: "manifest:C:\\replays\\sample_manifest.json (5 entries)",
        replayCurrentIndex: 2,
        replayFrameCount: 5,
        replayTimingMode: "recorded",
        replayTimeScale: 0.5,
        replayManifestSource: "C:\\replays\\sample_manifest.json",
      }, {
        replayFrameId: 102,
        replayLabel: "Doorway sweep",
      }),
    );

    expect(statusPanel.getSnapshot().lines).toContain(
      'Replay entry: pair 2/5 | frameId 102 | label "Doorway sweep"',
    );
    expect(statusPanel.getSnapshot().lines).toContain(
      "Replay timing: recorded @ 0.50x",
    );
    expect(statusPanel.getSnapshot().lines).toContain(
      "Replay source: manifest:C:\\replays\\sample_manifest.json (5 entries)",
    );
    expect(statusPanel.getSnapshot().lines).toContain(
      "Replay manifest path: C:\\replays\\sample_manifest.json",
    );

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("shows runtime source mode, bridge mode, backend, frame geometry, and fallback state", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );
    const telemetryReceivedAtMs = Date.now();

    diagnosticsStore.recordViewerSnapshot({
      ...createViewerSnapshot(
        "running",
        "healthy",
        telemetryReceivedAtMs,
        {
          captureBackendName: "simulated_frame_source",
          frameSourceMode: "simulated",
          frameSourceName: "simulated_frame_source",
          frameWidth: 1280,
          frameHeight: 720,
          frameIntervalMs: 100,
        },
        {
          captureBackend: "simulated_frame_source",
          bridgeMode: "simulated",
          frameWidth: 1280,
          frameHeight: 720,
        },
      ),
      frameSourceStatus: {
        ...createViewerSnapshot(
          "running",
          "healthy",
          telemetryReceivedAtMs,
        ).frameSourceStatus!,
        statusText:
          "Visible simulated stereo active via simulated_frame_source; fallback='camera read failed after 2 attempt(s): unavailable'.",
        cameraTelemetry: {
          captureBackendName: "simulated_frame_source",
          captureHealthState: "healthy",
          frameSourceMode: "simulated",
          frameSourceName: "simulated_frame_source",
          frameWidth: 1280,
          frameHeight: 720,
          frameIntervalMs: 100,
          recentCaptureEvents: [],
        },
      },
    });

    const snapshot = statusPanel.getSnapshot();

    expect(snapshot.runtimeSourceModeText).toBe("simulated");
    expect(snapshot.runtimeSourceNameText).toBe("simulated_frame_source");
    expect(snapshot.bridgeModeText).toBe("simulated");
    expect(snapshot.captureBackendText).toBe("simulated_frame_source");
    expect(snapshot.frameSizeText).toBe("1280 x 720");
    expect(snapshot.frameIntervalText).toBe("100.0 ms");
    expect(snapshot.fallbackActive).toBe(true);
    expect(snapshot.fallbackStateText).toBe("Active");
    expect(snapshot.fallbackReasonText).toContain(
      "camera read failed after 2 attempt(s)",
    );
    expect(snapshot.runtimeOperationText).toBe("Fallback to simulated");
    expect(snapshot.lines).toContain("Runtime source mode: simulated");
    expect(snapshot.lines).toContain("Bridge mode: simulated");
    expect(snapshot.lines).toContain("Frame size: 1280 x 720");

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("treats intentional simulated mode as non-fault operation when no fallback is present", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );
    const telemetryReceivedAtMs = Date.now();

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot(
        "running",
        "healthy",
        telemetryReceivedAtMs,
        {
          captureBackendName: "simulated_frame_source",
          frameSourceMode: "simulated",
          frameSourceName: "simulated_frame_source",
          frameWidth: 1280,
          frameHeight: 720,
          frameIntervalMs: 100,
        },
        {
          captureBackend: "simulated_frame_source",
          bridgeMode: "simulated",
          frameWidth: 1280,
          frameHeight: 720,
        },
      ),
    );

    const snapshot = statusPanel.getSnapshot();

    expect(snapshot.fallbackActive).toBe(false);
    expect(snapshot.runtimeOperationText).toBe("Intentional simulation");

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("trims very long replay paths only in the visible status area", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );
    const telemetryReceivedAtMs = Date.now();
    const longManifestPath =
      "C:\\very\\long\\operator\\replay\\directory\\with\\multiple\\nested\\segments\\session_alpha\\recordings\\sample_manifest.json";

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot(
        "running",
        "healthy",
        telemetryReceivedAtMs,
        {
          replaySourceIdentity: `manifest:${longManifestPath} (12 entries)`,
          replayCurrentIndex: 3,
          replayFrameCount: 12,
          replayTimingMode: "recorded",
          replayTimeScale: 1,
          replayManifestSource: longManifestPath,
        },
        {
          replayFrameId: 103,
          replayLabel: "Long path test",
        },
      ),
    );

    const replaySourceLine = statusPanel
      .getSnapshot()
      .lines.find((line) => line.startsWith("Replay source: "));
    const replayManifestLine = statusPanel
      .getSnapshot()
      .lines.find((line) => line.startsWith("Replay manifest path: "));

    expect(replaySourceLine).toContain("...");
    expect(replayManifestLine).toContain("...");
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replaySourceIdentity).toBe(
      `manifest:${longManifestPath} (12 entries)`,
    );
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replayManifestSource).toBe(
      longManifestPath,
    );

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("shows optional subsystems as unavailable when no capability data is present", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );

    const snapshot = statusPanel.getSnapshot();

    expect(snapshot.thermalAvailabilityText).toBe("Unavailable");
    expect(snapshot.thermalHealthText).toBe("Unavailable");
    expect(snapshot.thermalControlAvailable).toBe(false);
    expect(snapshot.irAvailabilityText).toBe("Unavailable");
    expect(snapshot.irEnabledText).toBe("Unavailable");
    expect(snapshot.irControlAvailable).toBe(false);
    expect(snapshot.hearingAvailabilityText).toBe("Unavailable");
    expect(snapshot.hearingModeText).toBe("Unavailable");
    expect(snapshot.hearingControlAvailable).toBe(false);
    expect(snapshot.phoneAudioAvailabilityText).toBe("Unavailable");
    expect(snapshot.mediaPlaybackStateText).toBe("Unavailable");
    expect(snapshot.mediaControlAvailable).toBe(false);
    expect(snapshot.lines).toContain("Thermal: Unavailable");
    expect(snapshot.lines).toContain("IR illuminator: Unavailable");
    expect(snapshot.lines).toContain("Hearing enhancement: Unavailable");
    expect(snapshot.lines).toContain("Phone audio: Unavailable");
    statusPanel.setThermalOverlayMode("hot_edges");
    statusPanel.toggleIrEnabled();
    statusPanel.setIrLevel(4);
    statusPanel.setHearingMode("voice_focus");
    statusPanel.setHearingGain(0.9);
    statusPanel.setMediaVolume(0.8);
    statusPanel.toggleMediaMuted();
    expect(settingsStore.getSnapshot().thermalOverlayMode).toBe("thermal_fusion_envg");
    expect(settingsStore.getSnapshot().irEnabled).toBe(false);
    expect(settingsStore.getSnapshot().irLevel).toBe(0);
    expect(settingsStore.getSnapshot().hearingMode).toBe("off");
    expect(settingsStore.getSnapshot().hearingGain).toBe(0.5);
    expect(settingsStore.getSnapshot().mediaVolume).toBe(0.5);
    expect(settingsStore.getSnapshot().mediaMuted).toBe(false);

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("clamps IR level to the advertised max and surfaces selected thermal mode", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
      liveTransportCapabilities: createAvailableThermalAndIrCapabilities(),
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );

    statusPanel.setThermalOverlayMode("full_thermal");
    statusPanel.setIrLevel(99);

    const snapshot = statusPanel.getSnapshot();

    expect(snapshot.thermalControlAvailable).toBe(true);
    expect(snapshot.selectedThermalOverlayMode).toBe("full_thermal");
    expect(snapshot.thermalOverlayModeText).toBe("thermal_fusion_envg");
    expect(snapshot.thermalSelectedVsReportedText).toContain("Selected full_thermal");
    expect(snapshot.irControlAvailable).toBe(true);
    expect(snapshot.irEnabledText).toBe("Disabled");
    expect(snapshot.irLevelText).toBe("0/3");
    expect(snapshot.irSelectedVsReportedText).toContain("Selected enabled @ 3");
    expect(settingsStore.getSnapshot().irLevel).toBe(3);
    expect(snapshot.lines).toContain("Thermal mode selected: full_thermal");
    expect(snapshot.lines).toContain("Thermal mode reported: thermal_fusion_envg");
    expect(snapshot.lines).toContain("IR level reported: 0/3");

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("updates hearing and media selections when capabilities are available", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
      liveTransportCapabilities: createAvailableThermalAndIrCapabilities(),
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );

    statusPanel.setHearingMode("voice_focus");
    statusPanel.setHearingGain(0.82);
    statusPanel.setMediaVolume(0.76);
    statusPanel.toggleMediaMuted();

    const snapshot = statusPanel.getSnapshot();

    expect(snapshot.hearingControlAvailable).toBe(true);
    expect(snapshot.hearingModeText).toBe("voice_focus");
    expect(snapshot.hearingGainText).toBe("82%");
    expect(snapshot.mediaControlAvailable).toBe(true);
    expect(snapshot.mediaPlaybackStateText).toBe("paused");
    expect(snapshot.mediaMutedText).toBe("Muted");
    expect(snapshot.mediaVolumeText).toBe("76%");
    expect(settingsStore.getSnapshot().hearingMode).toBe("voice_focus");
    expect(settingsStore.getSnapshot().hearingGain).toBeCloseTo(0.82);
    expect(settingsStore.getSnapshot().mediaVolume).toBeCloseTo(0.76);
    expect(settingsStore.getSnapshot().mediaMuted).toBe(true);
    expect(snapshot.lines).toContain("Hearing mode selected: voice_focus");
    expect(snapshot.lines).toContain("Media playback: paused");

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("surfaces Jetson control-plane operator state and delegates Jetson actions", async () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
      liveTransportAdapterType: "jetson_stub",
      liveTransportConnected: true,
      isConnected: true,
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const actions = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      setSourceMode: vi.fn(async () => {}),
      setLiveTransportAdapterType: vi.fn(async () => {}),
      connectLiveTransport: vi.fn(async () => {}),
      disconnectLiveTransport: vi.fn(async () => {}),
      applyLiveTransportConfig: vi.fn(async () => {}),
      toggleLiveTransportDemoFeed: vi.fn(async () => {}),
      injectLiveTransportSamplePayload: vi.fn(async () => {}),
      runJetsonPreflight: vi.fn(async () => {}),
      refreshJetsonEffectiveConfig: vi.fn(async () => {}),
      captureJetsonSnapshot: vi.fn(async () => {}),
      selectJetsonProfile: vi.fn(async () => {}),
      startJetsonRecording: vi.fn(async () => {}),
      stopJetsonRecording: vi.fn(async () => {}),
    };
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      actions,
    );
    const telemetryReceivedAtMs = Date.now();
    const baseSnapshot = createViewerSnapshot(
      "running",
      "healthy",
      telemetryReceivedAtMs,
      {
        captureBackendName: "jetson",
        bridgeMode: "jetson_runtime_control_plane",
        frameSourceMode: "control_plane",
        frameSourceName: "jetson_runtime_bridge",
        runtimeProfileName: "low_latency_720p60",
        availableProfileNames: ["quality_1080p30", "low_latency_720p60"],
        recordingActive: false,
        artifactPath: "/tmp/nevex/stereo_snapshot_001.jpg",
        artifactSizeBytes: 123456,
        preflightOverallStatus: "pass",
        preflightPassCount: 14,
        preflightWarnCount: 0,
        preflightFailCount: 0,
        preflightCriticalFailCount: 0,
      },
      {
        captureBackend: "jetson",
        bridgeMode: "jetson_runtime_control_plane",
      },
    );

    diagnosticsStore.recordViewerSnapshot({
      ...baseSnapshot,
      frameSourceStatus: {
        ...baseSnapshot.frameSourceStatus!,
        statusText: "Jetson profile switched to low_latency_720p60.",
        cameraTelemetry: {
          ...baseSnapshot.frameSourceStatus!.cameraTelemetry,
          captureBackendName: "jetson",
          bridgeMode: "jetson_runtime_control_plane",
          frameSourceMode: "control_plane",
          frameSourceName: "jetson_runtime_bridge",
          runtimeProfileName: "low_latency_720p60",
          availableProfileNames: ["quality_1080p30", "low_latency_720p60"],
          recordingActive: false,
          artifactPath: "/tmp/nevex/stereo_snapshot_001.jpg",
          artifactSizeBytes: 123456,
          preflightOverallStatus: "pass",
          preflightPassCount: 14,
          preflightWarnCount: 0,
          preflightFailCount: 0,
          preflightCriticalFailCount: 0,
        },
      },
    });

    const snapshot = statusPanel.getSnapshot();

    expect(snapshot.jetsonControlModeText).toBe("Active (control-plane only)");
    expect(snapshot.jetsonOperatorControlsAvailable).toBe(true);
    expect(snapshot.runtimeOperationText).toBe("Control-plane only");
    expect(snapshot.jetsonRuntimeStatusText).toBe(
      "Jetson profile switched to low_latency_720p60.",
    );
    expect(snapshot.jetsonRuntimeProfileText).toBe("low_latency_720p60");
    expect(snapshot.jetsonProfileOptions).toEqual([
      "quality_1080p30",
      "low_latency_720p60",
    ]);
    expect(snapshot.jetsonPreflightText).toBe(
      "PASS (pass=14 warn=0 fail=0 critical=0)",
    );
    expect(snapshot.jetsonRecordingStateText).toBe("Idle");
    expect(snapshot.jetsonArtifactText).toContain(
      "/tmp/nevex/stereo_snapshot_001.jpg",
    );
    expect(snapshot.lines).toContain(
      "Jetson control plane: Active (control-plane only)",
    );

    await statusPanel.runJetsonPreflight();
    await statusPanel.refreshJetsonEffectiveConfig();
    await statusPanel.captureJetsonSnapshot();
    await statusPanel.selectJetsonProfile("quality_1080p30");
    await statusPanel.startJetsonRecording();
    await statusPanel.stopJetsonRecording();

    expect(actions.runJetsonPreflight).toHaveBeenCalledTimes(1);
    expect(actions.refreshJetsonEffectiveConfig).toHaveBeenCalledTimes(1);
    expect(actions.captureJetsonSnapshot).toHaveBeenCalledTimes(1);
    expect(actions.selectJetsonProfile).toHaveBeenCalledWith("quality_1080p30");
    expect(actions.startJetsonRecording).toHaveBeenCalledTimes(1);
    expect(actions.stopJetsonRecording).toHaveBeenCalledTimes(1);

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("keeps Jetson operator controls available while the preview bridge is active", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
      liveTransportAdapterType: "jetson_stub",
      liveTransportConnected: true,
      isConnected: true,
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );
    const telemetryReceivedAtMs = Date.now();
    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot(
        "running",
        "healthy",
        telemetryReceivedAtMs,
        {
          captureBackendName: "jetson",
          bridgeMode: "jetson_runtime_preview_bridge",
          frameSourceMode: "camera",
          frameSourceName: "jetson_runtime_preview",
          runtimeProfileName: "headset_preview_720p60",
          availableProfileNames: ["headset_preview_720p60"],
        },
        {
          captureBackend: "jetson",
          bridgeMode: "jetson_runtime_preview_bridge",
        },
      ),
    );

    const snapshot = statusPanel.getSnapshot();

    expect(snapshot.jetsonControlModeText).toBe("Active (preview bridge)");
    expect(snapshot.jetsonOperatorControlsAvailable).toBe(true);
    expect(snapshot.runtimeOperationText).toBe("Camera runtime");

    statusPanel.dispose();
    diagnosticsStore.dispose();
  });
});

function createNoopActions() {
  return {
    async connect() {},
    async disconnect() {},
    async setSourceMode() {},
    async setLiveTransportAdapterType() {},
    async connectLiveTransport() {},
    async disconnectLiveTransport() {},
    async applyLiveTransportConfig() {},
    async toggleLiveTransportDemoFeed() {},
    async injectLiveTransportSamplePayload() {},
    async runJetsonPreflight() {},
    async refreshJetsonEffectiveConfig() {},
    async captureJetsonSnapshot() {},
    async selectJetsonProfile() {},
    async startJetsonRecording() {},
    async stopJetsonRecording() {},
  };
}

function createViewerSnapshot(
  sourceState: "running" | "reconnecting" | "error",
  captureHealthState:
    | "healthy"
    | "retrying"
    | "recovered"
    | "terminal_failure",
  telemetryReceivedAtMs: number,
  cameraTelemetryOverrides: Record<string, unknown> = {},
  frameExtras: Record<string, unknown> | undefined = undefined,
): ViewerSurfaceSnapshot {
  return {
    initialized: true,
    source: "live",
    renderStatusText: "Viewer rendering live source.",
    frameSourceId: "status-panel-source",
    frameSourceStatus: {
      state: sourceState,
      info: {
        id: "status-panel-source",
        displayName: "Status Panel Source",
        sourceKind: "live",
      },
      lastFrameId: 1,
      lastTimestampMs: telemetryReceivedAtMs,
      statusText: "Source telemetry received.",
      telemetryUpdatedAtMs: telemetryReceivedAtMs,
      telemetryReceivedAtMs: telemetryReceivedAtMs,
      cameraTelemetry: {
        captureBackendName: "simulated",
        captureHealthState,
        recentCaptureEvents: [],
        ...cameraTelemetryOverrides,
      },
    },
    activeSceneId: "status-scene",
    currentFrame: frameExtras
      ? {
          frameId: 1,
          timestampMs: telemetryReceivedAtMs,
          source: "live",
          metadata: {
            extras: {
              providerType: "camera",
              captureBackend: "replay",
              ...frameExtras,
            },
          },
          left: createFrameEye("left"),
          right: createFrameEye("right"),
        }
      : undefined,
    presentation: {
      source: "live",
      frameId: 1,
      timestampMs: telemetryReceivedAtMs,
      brightness: 0.75,
      overlayEnabled: false,
      thermalOverlayMode: "thermal_fusion_envg",
      thermalOverlayVisible: false,
      leftEye: createEyePresentation("left"),
      rightEye: createEyePresentation("right"),
    },
  };
}

function createAvailableThermalAndIrCapabilities() {
  return {
    senderName: "sender",
    senderVersion: "0.1.0-test",
    supportedMessageVersion: 1,
    supportedImagePayloadModes: ["base64", "data_url"],
    thermalAvailable: true,
    thermalBackendIdentity: "simulated_thermal_backend",
    thermalFrameWidth: 32,
    thermalFrameHeight: 24,
    thermalFrameRate: 9,
    thermalOverlaySupported: true,
    supportedThermalOverlayModes: [
      "off",
      "thermal_fusion_envg",
      "hotspot_highlight",
      "hot_edges",
      "full_thermal",
      "hot_target_boxes_optional",
    ] as const,
    thermalHealthState: "healthy" as const,
    irAvailable: true,
    irBackendIdentity: "simulated_ir_illuminator_controller",
    irEnabled: false,
    irLevel: 0,
    irMaxLevel: 3,
    irControlSupported: true,
    hearingEnhancementAvailable: true,
    microphoneArrayAvailable: true,
    audioEnhancementBackendIdentity: "simulated_audio_enhancement_controller",
    hearingModesSupported: [
      "off",
      "ambient_boost",
      "balanced",
      "voice_focus",
      "hearing_protection",
    ] as const,
    hearingHealthState: "healthy" as const,
    hearingGainMin: 0,
    hearingGainMax: 1,
    hearingLatencyEstimateMs: 42,
    phoneAudioAvailable: true,
    bluetoothAudioConnected: true,
    mediaPlaybackControlSupported: true,
    mediaPlaybackState: "paused" as const,
    mediaVolumeMin: 0,
    mediaVolumeMax: 1,
    receivedAtMs: Date.now(),
  };
}

function createEyePresentation(eye: "left" | "right") {
  return {
    eye,
    label: eye.toUpperCase(),
    title: `${eye} eye`,
    markerText: eye,
    backgroundHex: "#101820",
    accentHex: "#8fd3ff",
    width: 640,
    height: 360,
    format: "placeholder" as const,
    hasImageContent: false,
  };
}

function createFrameEye(eye: "left" | "right") {
  return {
    eye,
    label: eye.toUpperCase(),
    contentLabel: `${eye}-content`,
    title: `${eye} eye`,
    markerText: eye,
    backgroundHex: "#101820",
    accentHex: "#8fd3ff",
    width: 640,
    height: 360,
    format: "placeholder" as const,
  };
}
