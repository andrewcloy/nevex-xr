import {
  HEARING_ENHANCEMENT_MODES,
  createAudioEnhancementStatus,
} from "./audio_enhancement_controller_contract.mjs";

const DEFAULT_HEARING_GAIN_MAX = 1;

export class SimulatedAudioEnhancementController {
  constructor(options = {}) {
    this.backendIdentity = "simulated_audio_enhancement_controller";
    this.gainMin = 0;
    this.gainMax = normalizeGainLimit(
      options.hearingGainMax,
      DEFAULT_HEARING_GAIN_MAX,
    );
    this.currentMode = resolveMode(options.currentHearingMode);
    this.currentGain = clampGain(options.currentHearingGain, this.gainMin, this.gainMax);
    this.status = this.createStatus({
      hearingHealthState: "idle",
    });
  }

  createStatus(overrides = {}) {
    return createAudioEnhancementStatus({
      hearingEnhancementAvailable: true,
      microphoneArrayAvailable: true,
      audioEnhancementBackendIdentity: this.backendIdentity,
      hearingModesSupported: HEARING_ENHANCEMENT_MODES,
      hearingHealthState: overrides.hearingHealthState ?? "healthy",
      hearingErrorText: overrides.hearingErrorText,
      hearingGainMin: this.gainMin,
      hearingGainMax: this.gainMax,
      hearingLatencyEstimateMs: overrides.hearingLatencyEstimateMs ?? 42,
      currentHearingMode:
        overrides.currentHearingMode !== undefined
          ? overrides.currentHearingMode
          : this.currentMode,
      currentHearingGain:
        overrides.currentHearingGain !== undefined
          ? overrides.currentHearingGain
          : this.currentGain,
    });
  }

  async start() {
    this.status = this.createStatus({
      hearingHealthState: "healthy",
    });
  }

  async stop() {
    this.status = this.createStatus({
      hearingHealthState: "idle",
      currentHearingMode: "off",
      currentHearingGain: 0,
    });
  }

  async setMode(mode) {
    this.currentMode = resolveMode(mode);
    if (this.currentMode === "off") {
      this.currentGain = 0;
    }
    this.status = this.createStatus();
  }

  async setGain(gain) {
    this.currentGain = clampGain(gain, this.gainMin, this.gainMax);
    if (this.currentGain > 0 && this.currentMode === "off") {
      this.currentMode = "balanced";
    }
    if (this.currentGain === 0) {
      this.currentMode = "off";
    }
    this.status = this.createStatus();
  }

  getStatus() {
    return this.status;
  }
}

function resolveMode(mode) {
  return HEARING_ENHANCEMENT_MODES.includes(mode) ? mode : "off";
}

function normalizeGainLimit(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
}

function clampGain(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, parsed));
}
