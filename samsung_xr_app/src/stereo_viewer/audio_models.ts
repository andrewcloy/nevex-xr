export const HEARING_ENHANCEMENT_MODES = [
  "off",
  "ambient_boost",
  "balanced",
  "voice_focus",
  "hearing_protection",
] as const;

export type HearingEnhancementMode =
  (typeof HEARING_ENHANCEMENT_MODES)[number];

export const DEFAULT_HEARING_ENHANCEMENT_MODE: HearingEnhancementMode = "off";

export type HearingEnhancementHealthState =
  | "unavailable"
  | "idle"
  | "healthy"
  | "degraded"
  | "error";

export interface HearingEnhancementCapabilitySnapshot {
  readonly hearingEnhancementAvailable: boolean;
  readonly microphoneArrayAvailable: boolean;
  readonly audioEnhancementBackendIdentity?: string;
  readonly hearingModesSupported: readonly HearingEnhancementMode[];
  readonly hearingHealthState: HearingEnhancementHealthState;
  readonly hearingErrorText?: string;
  readonly hearingGainMin: number;
  readonly hearingGainMax: number;
  readonly hearingLatencyEstimateMs?: number;
}

export const MEDIA_PLAYBACK_STATES = [
  "unavailable",
  "idle",
  "playing",
  "paused",
] as const;

export type MediaPlaybackState = (typeof MEDIA_PLAYBACK_STATES)[number];

export const MEDIA_PLAYBACK_COMMANDS = [
  "play",
  "pause",
  "next",
  "previous",
  "volume_up",
  "volume_down",
] as const;

export type MediaPlaybackCommand = (typeof MEDIA_PLAYBACK_COMMANDS)[number];

export interface PhoneMediaAudioCapabilitySnapshot {
  readonly phoneAudioAvailable: boolean;
  readonly bluetoothAudioConnected: boolean;
  readonly mediaPlaybackControlSupported: boolean;
  readonly mediaPlaybackState: MediaPlaybackState;
  readonly mediaVolumeMin: number;
  readonly mediaVolumeMax: number;
}

export function createDefaultHearingEnhancementCapabilitySnapshot(
  overrides: Partial<HearingEnhancementCapabilitySnapshot> = {},
): HearingEnhancementCapabilitySnapshot {
  return {
    hearingEnhancementAvailable: false,
    microphoneArrayAvailable: false,
    hearingModesSupported: [DEFAULT_HEARING_ENHANCEMENT_MODE],
    hearingHealthState: "unavailable",
    hearingGainMin: 0,
    hearingGainMax: 1,
    ...overrides,
  };
}

export function createDefaultPhoneMediaAudioCapabilitySnapshot(
  overrides: Partial<PhoneMediaAudioCapabilitySnapshot> = {},
): PhoneMediaAudioCapabilitySnapshot {
  return {
    phoneAudioAvailable: false,
    bluetoothAudioConnected: false,
    mediaPlaybackControlSupported: false,
    mediaPlaybackState: "unavailable",
    mediaVolumeMin: 0,
    mediaVolumeMax: 1,
    ...overrides,
  };
}
