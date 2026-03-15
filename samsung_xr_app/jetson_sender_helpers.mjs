export const JETSON_MESSAGE_ENVELOPE_VERSION = 1;
export const JETSON_SUPPORTED_IMAGE_PAYLOAD_MODES = [
  "data_url",
  "base64",
  "image_url",
  "binary_frame",
];
export const JETSON_SUPPORTED_THERMAL_OVERLAY_MODES = [
  "off",
  "thermal_fusion_envg",
  "hotspot_highlight",
  "hot_edges",
  "full_thermal",
  "hot_target_boxes_optional",
];
export const JETSON_SUPPORTED_HEARING_ENHANCEMENT_MODES = [
  "off",
  "ambient_boost",
  "balanced",
  "voice_focus",
  "hearing_protection",
];
export const JETSON_FIRST_SENDER_MESSAGE_FLOW = [
  "capabilities",
  "transport_status",
  "source_status",
  "stereo_frame",
];
export const JETSON_DEFAULT_MAX_RECOMMENDED_PAYLOAD_BYTES = 256 * 1024;

/**
 * Builds a versioned Jetson protocol envelope.
 *
 * This helper is intentionally small so a future Jetson-side sender can depend
 * on a stable target without pulling in browser-side runtime code.
 */
export function buildJetsonEnvelope(messageType, payload, options = {}) {
  return {
    version: JETSON_MESSAGE_ENVELOPE_VERSION,
    messageType,
    timestampMs: options.timestampMs ?? Date.now(),
    ...(options.sequence === undefined ? {} : { sequence: options.sequence }),
    payload,
  };
}

/**
 * Minimal sender-facing capabilities payload helper for the first real Jetson
 * proof-of-life implementation.
 */
export function createJetsonCapabilitiesPayload(options = {}) {
  return {
    senderName: options.senderName ?? "jetson_sender",
    senderVersion: options.senderVersion ?? "0.1.0",
    supportedMessageVersion:
      options.supportedMessageVersion ?? JETSON_MESSAGE_ENVELOPE_VERSION,
    supportedImagePayloadModes:
      options.supportedImagePayloadModes ?? JETSON_SUPPORTED_IMAGE_PAYLOAD_MODES,
    maxRecommendedPayloadBytes:
      options.maxRecommendedPayloadBytes ??
      JETSON_DEFAULT_MAX_RECOMMENDED_PAYLOAD_BYTES,
    ...(options.stereoFormatNote === undefined
      ? {}
      : { stereoFormatNote: options.stereoFormatNote }),
    thermalAvailable: options.thermalAvailable ?? false,
    ...(options.thermalBackendIdentity === undefined
      ? {}
      : { thermalBackendIdentity: options.thermalBackendIdentity }),
    ...(options.thermalFrameWidth === undefined
      ? {}
      : { thermalFrameWidth: options.thermalFrameWidth }),
    ...(options.thermalFrameHeight === undefined
      ? {}
      : { thermalFrameHeight: options.thermalFrameHeight }),
    ...(options.thermalFrameRate === undefined
      ? {}
      : { thermalFrameRate: options.thermalFrameRate }),
    thermalOverlaySupported: options.thermalOverlaySupported ?? false,
    supportedThermalOverlayModes:
      options.supportedThermalOverlayModes ??
      JETSON_SUPPORTED_THERMAL_OVERLAY_MODES.slice(1, 2),
    thermalHealthState: options.thermalHealthState ?? "unavailable",
    ...(options.thermalErrorText === undefined
      ? {}
      : { thermalErrorText: options.thermalErrorText }),
    irAvailable: options.irAvailable ?? false,
    ...(options.irBackendIdentity === undefined
      ? {}
      : { irBackendIdentity: options.irBackendIdentity }),
    irEnabled: options.irEnabled ?? false,
    irLevel: options.irLevel ?? 0,
    irMaxLevel: options.irMaxLevel ?? 0,
    irControlSupported: options.irControlSupported ?? false,
    ...(options.irFaultState === undefined
      ? {}
      : { irFaultState: options.irFaultState }),
    ...(options.irErrorText === undefined
      ? {}
      : { irErrorText: options.irErrorText }),
    hearingEnhancementAvailable: options.hearingEnhancementAvailable ?? false,
    microphoneArrayAvailable: options.microphoneArrayAvailable ?? false,
    ...(options.audioEnhancementBackendIdentity === undefined
      ? {}
      : {
          audioEnhancementBackendIdentity:
            options.audioEnhancementBackendIdentity,
        }),
    hearingModesSupported:
      options.hearingModesSupported ?? [JETSON_SUPPORTED_HEARING_ENHANCEMENT_MODES[0]],
    hearingHealthState: options.hearingHealthState ?? "unavailable",
    ...(options.hearingErrorText === undefined
      ? {}
      : { hearingErrorText: options.hearingErrorText }),
    hearingGainMin: options.hearingGainMin ?? 0,
    hearingGainMax: options.hearingGainMax ?? 1,
    ...(options.hearingLatencyEstimateMs === undefined
      ? {}
      : { hearingLatencyEstimateMs: options.hearingLatencyEstimateMs }),
    phoneAudioAvailable: options.phoneAudioAvailable ?? false,
    bluetoothAudioConnected: options.bluetoothAudioConnected ?? false,
    mediaPlaybackControlSupported:
      options.mediaPlaybackControlSupported ?? false,
    mediaPlaybackState: options.mediaPlaybackState ?? "unavailable",
    mediaVolumeMin: options.mediaVolumeMin ?? 0,
    mediaVolumeMax: options.mediaVolumeMax ?? 1,
  };
}

export function buildCapabilitiesEnvelope(payload, options) {
  return buildJetsonEnvelope("capabilities", payload, options);
}

export function buildTransportStatusEnvelope(payload, options) {
  return buildJetsonEnvelope("transport_status", payload, options);
}

export function buildSourceStatusEnvelope(payload, options) {
  return buildJetsonEnvelope("source_status", payload, options);
}

export function buildStereoFrameEnvelope(payload, options) {
  return buildJetsonEnvelope("stereo_frame", payload, options);
}

export function buildErrorEnvelope(payload, options) {
  return buildJetsonEnvelope("error", payload, options);
}

export function buildRemoteConfigEnvelope(payload, options) {
  return buildJetsonEnvelope("remote_config", payload, options);
}
