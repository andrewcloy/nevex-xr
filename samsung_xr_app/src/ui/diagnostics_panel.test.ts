import { describe, expect, it } from "vitest";
import { DiagnosticsStore } from "../diagnostics/diagnostics_store";
import { SettingsStore } from "../settings_state/settings_store";
import { DiagnosticsPanelController } from "./diagnostics_panel";
import { StatusPanelController } from "./status_panel";
import type { ViewerSurfaceSnapshot } from "../stereo_viewer/viewer_surface";

describe("DiagnosticsPanelController", () => {
  it("updates operator thermal and IR selections through the shared settings seam", () => {
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
    const diagnosticsPanel = new DiagnosticsPanelController(
      settingsStore,
      diagnosticsStore,
    );

    statusPanel.setThermalOverlayMode("hot_edges");
    statusPanel.setIrLevel(99);
    statusPanel.setHearingMode("voice_focus");
    statusPanel.setHearingGain(0.7);
    statusPanel.setMediaVolume(0.66);
    statusPanel.toggleMediaMuted();

    const snapshot = diagnosticsPanel.getSnapshot();

    expect(snapshot.thermalTelemetry.thermalOverlayModeText).toBe(
      "thermal_fusion_envg",
    );
    expect(snapshot.irIlluminatorTelemetry.irEnabledText).toBe("Disabled");
    expect(snapshot.irIlluminatorTelemetry.irLevelText).toBe("0/4");
    expect(snapshot.hearingEnhancementTelemetry.hearingAvailableText).toBe(
      "Available",
    );
    expect(snapshot.hearingEnhancementTelemetry.hearingModeText).toBe(
      "voice_focus",
    );
    expect(snapshot.phoneMediaAudioTelemetry.phoneAudioAvailableText).toBe(
      "Available",
    );
    expect(snapshot.phoneMediaAudioTelemetry.mediaMutedText).toBe("Muted");
    expect(snapshot.lines).toContain("Operator thermal mode: hot_edges");
    expect(snapshot.lines).toContain("Operator IR target: enabled @ 4");
    expect(snapshot.lines).toContain("Operator hearing target: voice_focus @ 70%");
    expect(snapshot.lines).toContain("Media volume target: 66%");

    diagnosticsPanel.dispose();
    statusPanel.dispose();
    diagnosticsStore.dispose();
  });

  it("formats richer runtime source, bridge, geometry, and fallback telemetry", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const diagnosticsPanel = new DiagnosticsPanelController(
      settingsStore,
      diagnosticsStore,
    );
    const nowMs = Date.now();
    const baseViewerSnapshot = createViewerSnapshot({
      sourceState: "running",
      captureHealthState: "healthy",
      telemetryReceivedAtMs: nowMs,
    });

    diagnosticsStore.recordViewerSnapshot({
      ...baseViewerSnapshot,
      frameSourceStatus: {
        ...baseViewerSnapshot.frameSourceStatus!,
        statusText:
          "Visible simulated stereo active via simulated_frame_source; fallback='camera startup failed: unavailable backend'.",
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
      currentFrame: {
        frameId: 10,
        timestampMs: nowMs,
        source: "live",
        metadata: {
          extras: {
            providerType: "camera",
            captureBackend: "simulated_frame_source",
            bridgeMode: "simulated",
            frameWidth: 1280,
            frameHeight: 720,
          },
        },
        left: createFrameEye("left"),
        right: createFrameEye("right"),
      },
    });

    const snapshot = diagnosticsPanel.getSnapshot();

    expect(snapshot.cameraTelemetry?.frameSourceModeText).toBe("simulated");
    expect(snapshot.cameraTelemetry?.frameSourceNameText).toBe(
      "simulated_frame_source",
    );
    expect(snapshot.cameraTelemetry?.bridgeModeText).toBe("simulated");
    expect(snapshot.cameraTelemetry?.frameSizeText).toBe("1280 x 720");
    expect(snapshot.cameraTelemetry?.frameIntervalText).toBe("100.0 ms");
    expect(snapshot.cameraTelemetry?.fallbackStateText).toBe("Active");
    expect(snapshot.cameraTelemetry?.fallbackReasonText).toContain(
      "camera startup failed: unavailable backend",
    );
    expect(snapshot.lines).toContain("Runtime source mode: simulated");
    expect(snapshot.lines).toContain("Bridge mode: simulated");
    expect(snapshot.lines).toContain("Frame size: 1280 x 720");

    diagnosticsPanel.dispose();
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
    irMaxLevel: 4,
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
    mediaPlaybackState: "playing" as const,
    mediaVolumeMin: 0,
    mediaVolumeMax: 1,
    receivedAtMs: Date.now(),
  };
}

function createViewerSnapshot(options: {
  sourceState: "running" | "reconnecting" | "error";
  captureHealthState:
    | "healthy"
    | "retrying"
    | "recovered"
    | "terminal_failure";
  telemetryReceivedAtMs: number;
}): ViewerSurfaceSnapshot {
  return {
    initialized: true,
    source: "live",
    renderStatusText: "Viewer rendering live source.",
    frameSourceId: "diagnostics-panel-source",
    frameSourceStatus: {
      state: options.sourceState,
      info: {
        id: "diagnostics-panel-source",
        displayName: "Diagnostics Panel Source",
        sourceKind: "live",
      },
      lastFrameId: 1,
      lastTimestampMs: options.telemetryReceivedAtMs,
      statusText: "Source telemetry received.",
      telemetryUpdatedAtMs: options.telemetryReceivedAtMs,
      telemetryReceivedAtMs: options.telemetryReceivedAtMs,
      cameraTelemetry: {
        captureBackendName: "simulated",
        captureHealthState: options.captureHealthState,
        recentCaptureEvents: [],
      },
    },
    activeSceneId: "diagnostics-scene",
    currentFrame: undefined,
    presentation: {
      source: "live",
      frameId: 1,
      timestampMs: options.telemetryReceivedAtMs,
      brightness: 0.75,
      overlayEnabled: false,
      thermalOverlayMode: "thermal_fusion_envg",
      thermalOverlayVisible: false,
      leftEye: createEyePresentation("left"),
      rightEye: createEyePresentation("right"),
    },
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
