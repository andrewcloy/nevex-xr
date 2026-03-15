import { describe, expect, it } from "vitest";
import {
  buildCapabilitiesEnvelope,
  buildSourceStatusEnvelope,
  buildStereoFrameEnvelope,
  parseJetsonMessageEnvelope,
} from "./jetson_message_envelope";
import {
  JetsonMessageDispatcher,
  type JetsonMessageDispatchTarget,
} from "./jetson_message_dispatcher";
import { JetsonSequenceMonitor } from "./jetson_sequence_monitor";
import {
  createSampleJetsonCapabilitiesPayload,
  createSampleJetsonStereoFramePayload,
  type JetsonCapabilitiesPayload,
  type JetsonRemoteConfigPayload,
  type JetsonSourceStatusPayload,
  type JetsonStereoFramePayload,
  type JetsonTransportErrorPayload,
  type JetsonTransportStatusPayload,
} from "./jetson_transport_payloads";
import type { JetsonMessageEnvelope } from "./jetson_message_envelope";
import { THERMAL_OVERLAY_MODES } from "./thermal_models";

describe("Jetson protocol fixtures", () => {
  it("parses a valid capabilities envelope", () => {
    const envelope = buildCapabilitiesEnvelope(
      createSampleJetsonCapabilitiesPayload("fixture_sender", "fixture_stream"),
      {
        timestampMs: 1000,
        sequence: 1,
      },
    );

    const parsed = parseJetsonMessageEnvelope(envelope);

    expect(parsed.messageType).toBe("capabilities");
    if (parsed.messageType !== "capabilities") {
      throw new Error("Expected a capabilities envelope.");
    }

    expect(parsed.payload.senderName).toBe("fixture_sender");
    expect(parsed.payload.supportedImagePayloadModes).toContain("data_url");
    expect(parsed.payload.supportedImagePayloadModes).toContain("binary_frame");
    expect(parsed.payload.thermalAvailable).toBe(false);
    expect(parsed.payload.irAvailable).toBe(false);
    expect(parsed.payload.hearingEnhancementAvailable).toBe(false);
    expect(parsed.payload.phoneAudioAvailable).toBe(false);
    expect(parsed.payload.supportedThermalOverlayModes).toEqual([
      "thermal_fusion_envg",
    ]);
    expect(parsed.payload.hearingModesSupported).toEqual(["off"]);
    expect(parsed.payload.mediaPlaybackState).toBe("unavailable");
  });

  it("parses richer source_status camera telemetry without changing the protocol shape", () => {
    const envelope = buildSourceStatusEnvelope(
      {
        sourceState: "running",
        statusText: "Visible camera stereo active via jetson_opencv_gstreamer_imx219.",
        telemetryUpdatedAtMs: 3000,
        cameraTelemetry: {
          captureBackendName: "jetson_opencv_gstreamer_imx219",
          startupValidated: true,
          frameWidth: 1280,
          frameHeight: 720,
          frameIntervalMs: 100,
          frameSourceMode: "camera",
          frameSourceName: "camera_frame_source",
          capturesAttempted: 12,
          capturesSucceeded: 11,
          capturesFailed: 1,
          consecutiveFailureCount: 0,
        },
      },
      {
        timestampMs: 3000,
        sequence: 2,
      },
    );

    const parsed = parseJetsonMessageEnvelope(envelope);

    expect(parsed.messageType).toBe("source_status");
    if (parsed.messageType !== "source_status") {
      throw new Error("Expected a source_status envelope.");
    }

    expect(parsed.payload.cameraTelemetry?.captureBackendName).toBe(
      "jetson_opencv_gstreamer_imx219",
    );
    expect(parsed.payload.cameraTelemetry?.frameWidth).toBe(1280);
    expect(parsed.payload.cameraTelemetry?.frameHeight).toBe(720);
    expect(parsed.payload.cameraTelemetry?.frameIntervalMs).toBe(100);
    expect(parsed.payload.cameraTelemetry?.frameSourceMode).toBe("camera");
    expect(parsed.payload.cameraTelemetry?.frameSourceName).toBe(
      "camera_frame_source",
    );
  });

  it("dispatches a valid image-backed stereo frame", () => {
    const target = createDispatchTarget();
    const dispatcher = new JetsonMessageDispatcher(target);
    const envelope = buildStereoFrameEnvelope(
      createSampleJetsonStereoFramePayload(12, "fixture_stream"),
      {
        timestampMs: 2000,
        sequence: 2,
      },
    );

    const result = dispatcher.dispatchMessageObject(envelope);

    expect(result.ok).toBe(true);
    expect(target.frames).toHaveLength(1);
    expect(target.frames[0]?.left.image?.dataUrl).toContain("data:image/svg+xml");
  });

  it("rejects a malformed envelope", () => {
    const target = createDispatchTarget();
    const dispatcher = new JetsonMessageDispatcher(target);

    const result = dispatcher.dispatchMessageObject({
      messageType: "stereo_frame",
      timestampMs: 1,
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.errorKind).toBe("malformed_envelope");
    expect(target.errors[target.errors.length - 1]?.message).toContain(
      "envelope.version",
    );
  });

  it("rejects an invalid payload field", () => {
    const invalidEnvelope = {
      version: 1,
      messageType: "capabilities",
      timestampMs: 1,
      sequence: 1,
      payload: {
        senderName: "fixture_sender",
        supportedMessageVersion: 1,
        supportedImagePayloadModes: ["not_real_mode"],
      },
    };

    expect(() => parseJetsonMessageEnvelope(invalidEnvelope)).toThrowError(
      /payload\.supportedImagePayloadModes\[0\]/,
    );
  });

  it("rejects an invalid thermal overlay mode", () => {
    const invalidEnvelope = {
      version: 1,
      messageType: "capabilities",
      timestampMs: 1,
      sequence: 2,
      payload: {
        senderName: "fixture_sender",
        supportedMessageVersion: 1,
        supportedImagePayloadModes: ["data_url"],
        supportedThermalOverlayModes: ["lava_vision"],
      },
    };

    expect(() => parseJetsonMessageEnvelope(invalidEnvelope)).toThrowError(
      /payload\.supportedThermalOverlayModes\[0\]/,
    );
  });

  it("accepts thermal frame payloads with hotspot annotations", () => {
    const envelope = buildStereoFrameEnvelope(
      {
        ...createSampleJetsonStereoFramePayload(7, "thermal_fixture_stream"),
        thermalOverlayMode: "thermal_fusion_envg",
        thermalFrame: {
          frameId: 70,
          timestamp: 7123,
          width: 2,
          height: 2,
          thermalValues: [21.2, 24.8, 28.5, 33.1],
          minTemperature: 21.2,
          maxTemperature: 33.1,
          hotspotAnnotations: [
            {
              id: "hotspot-1",
              normalizedX: 0.5,
              normalizedY: 0.5,
              normalizedRadius: 0.2,
              intensityNormalized: 0.9,
            },
          ],
          paletteHint: "envg_heat",
        },
      },
      {
        timestampMs: 4000,
        sequence: 4,
      },
    );

    const parsed = parseJetsonMessageEnvelope(envelope);
    if (parsed.messageType !== "stereo_frame") {
      throw new Error("Expected a stereo_frame envelope.");
    }

    expect(parsed.payload.thermalOverlayMode).toBe("thermal_fusion_envg");
    expect(parsed.payload.thermalFrame?.thermalValues).toHaveLength(4);
    expect(parsed.payload.thermalFrame?.hotspotAnnotations?.[0]?.id).toBe(
      "hotspot-1",
    );
  });

  it("rejects an oversize payload", () => {
    const envelope = buildStereoFrameEnvelope(
      createSampleJetsonStereoFramePayload(21, "oversize_stream"),
      {
        timestampMs: 3000,
        sequence: 3,
      },
    );

    expect(() =>
      parseJetsonMessageEnvelope(envelope, {
        maxMessageBytes: 1024 * 1024,
        maxImagePayloadBytes: 64,
      }),
    ).toThrowError(/image payload size/i);
  });

  it("rejects an unsupported message type", () => {
    const target = createDispatchTarget();
    const dispatcher = new JetsonMessageDispatcher(target);

    const result = dispatcher.dispatchMessageObject({
      version: 1,
      messageType: "future_magic",
      timestampMs: 1,
      sequence: 1,
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.errorKind).toBe("unsupported_message_type");
    expect(target.errors[target.errors.length - 1]?.code).toBe(
      "unsupported_message_type",
    );
  });

  it("tracks repeated, dropped, and out-of-order sequences", () => {
    const monitor = new JetsonSequenceMonitor();

    monitor.record(1);
    monitor.record(1);
    monitor.record(4);
    const snapshot = monitor.record(3);

    expect(snapshot.repeatedCount).toBe(1);
    expect(snapshot.droppedCountEstimate).toBe(2);
    expect(snapshot.outOfOrderCount).toBe(1);
    expect(snapshot.lastAnomalyText).toContain("Out-of-order");
  });

  it("exposes the full supported thermal overlay mode set", () => {
    expect(THERMAL_OVERLAY_MODES).toEqual([
      "off",
      "thermal_fusion_envg",
      "hotspot_highlight",
      "hot_edges",
      "full_thermal",
      "hot_target_boxes_optional",
    ]);
  });
});

function createDispatchTarget(): TestDispatchTarget {
  return {
    envelopes: [],
    capabilities: [],
    transportStatuses: [],
    sourceStatuses: [],
    frames: [],
    errors: [],
    remoteConfigs: [],
    recordEnvelopeReceipt(envelope, _metadata) {
      this.envelopes.push(envelope);
    },
    ingestCapabilitiesPayload(payload) {
      this.capabilities.push(payload);
    },
    ingestTransportStatusPayload(payload) {
      this.transportStatuses.push(payload);
    },
    ingestSourceStatusPayload(payload) {
      this.sourceStatuses.push(payload);
    },
    ingestFramePayload(payload) {
      this.frames.push(payload);
    },
    ingestError(payload) {
      this.errors.push(payload);
    },
    applyRemoteConfig(payload) {
      this.remoteConfigs.push(payload);
    },
  };
}

interface TestDispatchTarget extends JetsonMessageDispatchTarget {
  envelopes: JetsonMessageEnvelope[];
  capabilities: JetsonCapabilitiesPayload[];
  transportStatuses: JetsonTransportStatusPayload[];
  sourceStatuses: JetsonSourceStatusPayload[];
  frames: JetsonStereoFramePayload[];
  errors: JetsonTransportErrorPayload[];
  remoteConfigs: JetsonRemoteConfigPayload[];
}
