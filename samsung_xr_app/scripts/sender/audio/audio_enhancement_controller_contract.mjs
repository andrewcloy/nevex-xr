export const HEARING_ENHANCEMENT_MODES = [
  "off",
  "ambient_boost",
  "balanced",
  "voice_focus",
  "hearing_protection",
];

export function createAudioEnhancementStatus(options = {}) {
  return {
    hearingEnhancementAvailable: options.hearingEnhancementAvailable ?? false,
    microphoneArrayAvailable: options.microphoneArrayAvailable ?? false,
    audioEnhancementBackendIdentity: options.audioEnhancementBackendIdentity,
    hearingModesSupported:
      options.hearingModesSupported ?? [HEARING_ENHANCEMENT_MODES[0]],
    hearingHealthState: options.hearingHealthState ?? "unavailable",
    hearingErrorText: options.hearingErrorText,
    hearingGainMin: options.hearingGainMin ?? 0,
    hearingGainMax: options.hearingGainMax ?? 1,
    hearingLatencyEstimateMs: options.hearingLatencyEstimateMs,
    currentHearingMode: options.currentHearingMode ?? HEARING_ENHANCEMENT_MODES[0],
    currentHearingGain: options.currentHearingGain ?? 0,
  };
}

export function assertAudioEnhancementController(controller) {
  if (
    !controller ||
    typeof controller !== "object" ||
    typeof controller.start !== "function" ||
    typeof controller.stop !== "function" ||
    typeof controller.setMode !== "function" ||
    typeof controller.setGain !== "function" ||
    typeof controller.getStatus !== "function"
  ) {
    throw new Error("Invalid audio enhancement controller contract.");
  }
}
