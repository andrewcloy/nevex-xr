import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsStore } from "../settings_state/settings_store";
import { DiagnosticsStore } from "./diagnostics_store";
import type { ViewerSurfaceSnapshot } from "../stereo_viewer/viewer_surface";

describe("DiagnosticsStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks telemetry stale when source_status heartbeats stop arriving", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));

    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore, {
      staleThresholdMs: 1000,
      pollIntervalMs: 100,
    });

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot({
        sourceState: "running",
        captureHealthState: "healthy",
        telemetryReceivedAtMs: Date.now(),
      }),
    );

    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.telemetryCurrent).toBe(true);
    expect(diagnosticsStore.getSnapshot().sourceHealthState).toBe("healthy");
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.captureBackendName).toBe(
      "simulated",
    );

    vi.advanceTimersByTime(1500);

    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.telemetryCurrent).toBe(false);
    expect(diagnosticsStore.getSnapshot().sourceHealthState).toBe("telemetry_stale");
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.telemetryStaleThresholdMs).toBe(
      1000,
    );

    diagnosticsStore.dispose();
  });

  it("preserves replay validation telemetry from source status snapshots", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const nowMs = Date.now();

    diagnosticsStore.recordViewerSnapshot(
      createViewerSnapshot({
        sourceState: "running",
        captureHealthState: "healthy",
        telemetryReceivedAtMs: nowMs,
        cameraTelemetryOverrides: {
          captureBackendName: "replay",
          replayTimeScale: 0.5,
          replayManifestLoaded: true,
          replayManifestValidated: true,
          replayManifestErrorCount: 0,
          replayManifestWarningCount: 1,
          replayManifestSource: "C:\\replays\\sample_manifest.json",
          replayValidationSummary:
            "Validated replay manifest with one wrap-around timing warning.",
          replayDelayUntilNextMs: 180,
          replayScaledDelayUntilNextMs: 360,
          replayNominalLoopDurationMs: 270,
          replayScaledLoopDurationMs: 540,
        },
      }),
    );

    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.captureBackendName).toBe(
      "replay",
    );
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replayManifestLoaded).toBe(
      true,
    );
    expect(
      diagnosticsStore.getSnapshot().cameraTelemetry?.replayManifestValidated,
    ).toBe(true);
    expect(
      diagnosticsStore.getSnapshot().cameraTelemetry?.replayManifestWarningCount,
    ).toBe(1);
    expect(
      diagnosticsStore.getSnapshot().cameraTelemetry?.replayManifestSource,
    ).toContain("sample_manifest.json");
    expect(
      diagnosticsStore.getSnapshot().cameraTelemetry?.replayValidationSummary,
    ).toContain("Validated replay manifest");
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replayTimeScale).toBe(0.5);
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replayScaledDelayUntilNextMs).toBe(
      360,
    );
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replayScaledLoopDurationMs).toBe(
      540,
    );

    diagnosticsStore.dispose();
  });

  it("merges replay entry metadata from frame extras into camera telemetry", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const nowMs = Date.now();

    diagnosticsStore.recordViewerSnapshot({
      ...createViewerSnapshot({
        sourceState: "running",
        captureHealthState: "healthy",
        telemetryReceivedAtMs: nowMs,
        cameraTelemetryOverrides: {
          captureBackendName: "replay",
          replaySourceIdentity: "manifest:C:\\replays\\session.json",
          replayCurrentIndex: 2,
          replayFrameCount: 5,
          replayTimingMode: "recorded",
          replayTimeScale: 2,
          replayManifestSource: "C:\\replays\\session.json",
        },
      }),
      currentFrame: {
        frameId: 12,
        timestampMs: nowMs,
        source: "live",
        metadata: {
          extras: {
            providerType: "camera",
            captureBackend: "replay",
            replayFrameId: 102,
            replayLabel: "Doorway sweep",
          },
        },
        left: createFrameEye("left"),
        right: createFrameEye("right"),
      },
    });

    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replayFrameId).toBe(102);
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replayLabel).toBe(
      "Doorway sweep",
    );
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.replayManifestSource).toContain(
      "session.json",
    );

    diagnosticsStore.dispose();
  });

  it("surfaces runtime source mode, bridge mode, frame geometry, cadence, and fallback telemetry", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);
    const nowMs = Date.now();

    diagnosticsStore.recordViewerSnapshot({
      ...createViewerSnapshot({
        sourceState: "running",
        captureHealthState: "healthy",
        telemetryReceivedAtMs: nowMs,
        cameraTelemetryOverrides: {
          captureBackendName: "simulated_frame_source",
          frameSourceMode: "simulated",
          frameSourceName: "simulated_frame_source",
          frameWidth: 1280,
          frameHeight: 720,
          frameIntervalMs: 100,
        },
      }),
      frameSourceStatus: {
        ...createViewerSnapshot({
          sourceState: "running",
          captureHealthState: "healthy",
          telemetryReceivedAtMs: nowMs,
        }).frameSourceStatus!,
        statusText:
          "Visible simulated stereo active via simulated_frame_source; fallback='camera read failed after 2 attempt(s): camera unavailable'.",
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
        frameId: 44,
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

    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.frameSourceMode).toBe(
      "simulated",
    );
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.frameSourceName).toBe(
      "simulated_frame_source",
    );
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.bridgeMode).toBe(
      "simulated",
    );
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.frameWidth).toBe(1280);
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.frameHeight).toBe(720);
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.frameIntervalMs).toBe(100);
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.fallbackActive).toBe(
      true,
    );
    expect(diagnosticsStore.getSnapshot().cameraTelemetry?.fallbackReason).toContain(
      "camera read failed after 2 attempt(s)",
    );

    diagnosticsStore.dispose();
  });

  it("defaults optional subsystem telemetry to unavailable when hardware is absent", () => {
    const settingsStore = new SettingsStore({
      sourceMode: "live",
    });
    const diagnosticsStore = new DiagnosticsStore(settingsStore);

    const snapshot = diagnosticsStore.getSnapshot();

    expect(snapshot.thermalTelemetry.thermalAvailable).toBe(false);
    expect(snapshot.thermalTelemetry.thermalHealthState).toBe("unavailable");
    expect(snapshot.thermalTelemetry.currentOverlayMode).toBe(
      "thermal_fusion_envg",
    );
    expect(snapshot.irIlluminatorTelemetry.irAvailable).toBe(false);
    expect(snapshot.irIlluminatorTelemetry.irEnabled).toBe(false);
    expect(snapshot.hearingEnhancementTelemetry.hearingEnhancementAvailable).toBe(
      false,
    );
    expect(snapshot.hearingEnhancementTelemetry.hearingHealthState).toBe(
      "unavailable",
    );
    expect(snapshot.hearingEnhancementTelemetry.currentMode).toBe("off");
    expect(snapshot.phoneMediaAudioTelemetry.phoneAudioAvailable).toBe(false);
    expect(snapshot.phoneMediaAudioTelemetry.mediaPlaybackState).toBe(
      "unavailable",
    );
    expect(snapshot.phoneMediaAudioTelemetry.mediaMuted).toBe(false);

    diagnosticsStore.dispose();
  });
});

function createViewerSnapshot(options: {
  sourceState: "running" | "reconnecting" | "error";
  captureHealthState:
    | "healthy"
    | "retrying"
    | "recovered"
    | "terminal_failure";
  telemetryReceivedAtMs: number;
  cameraTelemetryOverrides?: Record<string, unknown>;
}): ViewerSurfaceSnapshot {
  return {
    initialized: true,
    source: "live",
    renderStatusText: "Viewer rendering live source.",
    frameSourceId: "test-camera-source",
    frameSourceStatus: {
      state: options.sourceState,
      info: {
        id: "test-camera-source",
        displayName: "Test Camera Source",
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
        capturesAttempted: 1,
        capturesSucceeded: 1,
        recentCaptureEvents: [],
        ...(options.cameraTelemetryOverrides ?? {}),
      },
    },
    activeSceneId: "test-scene",
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
