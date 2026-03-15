import { describe, expect, it } from "vitest";
import { DiagnosticsStore } from "../diagnostics/diagnostics_store";
import { SettingsStore } from "../settings_state/settings_store";
import { DiagnosticsPanelController } from "../ui/diagnostics_panel";
import { StatusPanelController } from "../ui/status_panel";
import {
  buildCapabilitiesEnvelope,
  buildSourceStatusEnvelope,
  buildStereoFrameEnvelope,
  buildTransportStatusEnvelope,
} from "./jetson_message_envelope";
import { JetsonMessageDispatcher } from "./jetson_message_dispatcher";
import { JetsonTransportAdapter } from "./jetson_transport_adapter";
import {
  createSampleJetsonCapabilitiesPayload,
  createSampleJetsonStereoFramePayload,
} from "./jetson_transport_payloads";
import {
  type LiveTransportStatusSnapshot,
} from "./transport_adapter";
import { PlaceholderViewerSurface } from "./viewer_surface";

describe("JetsonTransportAdapter", () => {
  it("defaults to the canonical sender runtime websocket endpoint", () => {
    const adapter = new JetsonTransportAdapter();

    expect(adapter.getConfig().host).toBe("127.0.0.1");
    expect(adapter.getConfig().port).toBe(8090);
    expect(adapter.getConfig().path).toBe("/jetson/messages");
    expect(adapter.getConfig().streamName).toBe(
      "jetson_sender_prototype_stream",
    );
    expect(adapter.getStatus().adapterDisplayName).toBe(
      "Jetson WebSocket Transport Adapter",
    );
  });

  it("feeds richer runtime telemetry through to XR status and diagnostics snapshots", async () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const viewerSurface = new PlaceholderViewerSurface();
    await viewerSurface.initialize();
    const adapter = new JetsonTransportAdapter({
      config: {
        host: "127.0.0.1",
        port: 8090,
        path: "/jetson/messages",
        streamName: "jetson_visible_camera",
      },
    });
    const dispatcher = new JetsonMessageDispatcher(adapter);
    const statusPanel = new StatusPanelController(
      settingsStore,
      diagnosticsStore,
      createNoopActions(),
    );
    const diagnosticsPanel = new DiagnosticsPanelController(
      settingsStore,
      diagnosticsStore,
    );

    const viewerUnsubscribe = viewerSurface.subscribe((snapshot) => {
      diagnosticsStore.recordViewerSnapshot(snapshot);
    });
    viewerSurface.attachFrameSource(adapter.frameSource);
    syncLiveTransportStatus(settingsStore, adapter.getStatus());
    const transportUnsubscribe = adapter.subscribeStatus((status) => {
      syncLiveTransportStatus(settingsStore, status);
    });

    const capabilitiesResult = dispatcher.dispatchMessageObject(
      buildCapabilitiesEnvelope(
        createSampleJetsonCapabilitiesPayload(
          "jetson_app_xr_bridge",
          "jetson_visible_camera",
        ),
        {
          timestampMs: 1000,
          sequence: 1,
        },
      ),
    );
    const transportStatusResult = dispatcher.dispatchMessageObject(
      buildTransportStatusEnvelope(
        {
          transportState: "running",
          connected: true,
          statusText:
            "Jetson XR bridge connected on /jetson/messages with simulated fallback after camera failure.",
        },
        {
          timestampMs: 1001,
          sequence: 2,
        },
      ),
    );
    const sourceStatusResult = dispatcher.dispatchMessageObject(
      buildSourceStatusEnvelope(
        {
          sourceState: "running",
          lastFrameId: 41,
          lastTimestampMs: 1002,
          lastError: "camera read failed after 2 attempt(s): camera unavailable",
          statusText:
            "Visible simulated stereo active via simulated_frame_source; left=available; right=available; resolution=1280x720; fallback='camera read failed after 2 attempt(s): camera unavailable';",
          telemetryUpdatedAtMs: 1002,
          cameraTelemetry: {
            captureBackendName: "jetson",
            bridgeMode: "jetson_runtime_control_plane",
            startupValidated: false,
            frameWidth: 1280,
            frameHeight: 720,
            frameIntervalMs: 100,
            frameSourceMode: "control_plane",
            frameSourceName: "jetson_runtime_bridge",
            capturesAttempted: 4,
            capturesSucceeded: 3,
            capturesFailed: 1,
            consecutiveFailureCount: 0,
            lastSuccessfulCaptureTime: 999,
            lastCaptureDurationMs: 32,
            averageCaptureDurationMs: 34,
            effectiveFrameIntervalMs: 100,
            leftCameraDevice: "simulated:left",
            rightCameraDevice: "simulated:right",
            runtimeProfileName: "low_latency_720p60",
            runtimeProfileType: "operational",
            availableProfileNames: ["quality_1080p30", "low_latency_720p60"],
            inputWidth: 1280,
            inputHeight: 720,
            outputWidth: 2560,
            outputHeight: 720,
            outputMode: "fakesink",
            effectiveFps: 60,
            preflightOverallStatus: "pass",
            preflightOk: true,
            preflightPassCount: 14,
            preflightWarnCount: 0,
            preflightFailCount: 0,
            preflightCriticalFailCount: 0,
            recordingActive: false,
            artifactType: "image",
            artifactPath: "/tmp/nevex/stereo_snapshot_001.jpg",
            artifactSizeBytes: 123456,
            artifactCapturedAt: "2026-03-12T00:00:00Z",
          },
        },
        {
          timestampMs: 1002,
          sequence: 3,
        },
      ),
    );
    const stereoFrameResult = dispatcher.dispatchMessageObject(
      buildStereoFrameEnvelope(
        {
          ...createSampleJetsonStereoFramePayload(41, "jetson_visible_camera"),
          sceneId: "jetson_simulated_scene",
          streamName: "jetson_visible_camera",
          tags: ["jetson", "xr-bridge", "visible", "simulated"],
          extras: {
            bridgeMode: "jetson_runtime_control_plane",
            captureBackend: "jetson",
            frameWidth: 1280,
            frameHeight: 720,
          },
        },
        {
          timestampMs: 1003,
          sequence: 4,
        },
      ),
    );

    expect(capabilitiesResult.ok).toBe(true);
    expect(transportStatusResult.ok).toBe(true);
    expect(sourceStatusResult.ok).toBe(true);
    expect(stereoFrameResult.ok).toBe(true);

    const statusSnapshot = statusPanel.getSnapshot();
    const diagnosticsSnapshot = diagnosticsPanel.getSnapshot();

    expect(statusSnapshot.runtimeSourceModeText).toBe("control_plane");
    expect(statusSnapshot.runtimeSourceNameText).toBe("jetson_runtime_bridge");
    expect(statusSnapshot.bridgeModeText).toBe("jetson_runtime_control_plane");
    expect(statusSnapshot.captureBackendText).toBe("jetson");
    expect(statusSnapshot.frameSizeText).toBe("1280 x 720");
    expect(statusSnapshot.frameIntervalText).toBe("100.0 ms");
    expect(statusSnapshot.fallbackActive).toBe(true);
    expect(statusSnapshot.fallbackReasonText).toContain(
      "camera read failed after 2 attempt(s)",
    );
    expect(statusSnapshot.runtimeOperationText).toBe("Fallback to simulated");
    expect(statusSnapshot.transportLastMessageTimestampText).toBe(
      new Date(1003).toLocaleTimeString(),
    );

    expect(diagnosticsSnapshot.senderNameText).toBe("jetson_app_xr_bridge");
    expect(diagnosticsSnapshot.sourceStreamNameText).toBe(
      "jetson_visible_camera",
    );
    expect(diagnosticsSnapshot.sourceSceneIdText).toBe("jetson_simulated_scene");
    expect(diagnosticsSnapshot.cameraTelemetry?.frameSourceModeText).toBe(
      "control_plane",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.frameSourceNameText).toBe(
      "jetson_runtime_bridge",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.bridgeModeText).toBe(
      "jetson_runtime_control_plane",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.runtimeProfileNameText).toBe(
      "low_latency_720p60",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.runtimeProfileTypeText).toBe(
      "operational",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.availableProfilesText).toBe(
      "quality_1080p30, low_latency_720p60",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.inputResolutionText).toBe(
      "1280 x 720",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.outputResolutionText).toBe(
      "2560 x 720",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.outputModeText).toBe("fakesink");
    expect(diagnosticsSnapshot.cameraTelemetry?.effectiveFpsText).toBe("60.00 FPS");
    expect(diagnosticsSnapshot.cameraTelemetry?.preflightStatusText).toBe(
      "PASS (pass=14 warn=0 fail=0 critical=0)",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.recordingStateText).toBe("Idle");
    expect(diagnosticsSnapshot.cameraTelemetry?.artifactText).toContain(
      "/tmp/nevex/stereo_snapshot_001.jpg",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.frameSizeText).toBe("1280 x 720");
    expect(diagnosticsSnapshot.cameraTelemetry?.frameIntervalText).toBe(
      "100.0 ms",
    );
    expect(diagnosticsSnapshot.cameraTelemetry?.fallbackStateText).toBe("Active");
    expect(diagnosticsSnapshot.cameraTelemetry?.fallbackReasonText).toContain(
      "camera read failed after 2 attempt(s)",
    );
    expect(diagnosticsSnapshot.transportLastMessageTimestampText).toBe(
      new Date(1003).toLocaleTimeString(),
    );

    transportUnsubscribe();
    viewerUnsubscribe();
    diagnosticsPanel.dispose();
    statusPanel.dispose();
    diagnosticsStore.dispose();
  });
});

function syncLiveTransportStatus(
  settingsStore: SettingsStore,
  status: LiveTransportStatusSnapshot,
): void {
  settingsStore.update({
    liveTransportAdapterType: status.adapterType,
    liveTransportAdapterDisplayName: status.adapterDisplayName,
    liveTransportConfig: status.config,
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
    ...(settingsStore.getSnapshot().sourceMode === "live"
      ? { statusText: status.statusText }
      : {}),
  });
}

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
