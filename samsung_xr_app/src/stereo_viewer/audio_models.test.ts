import { describe, expect, it } from "vitest";
import {
  HEARING_ENHANCEMENT_MODES,
  MEDIA_PLAYBACK_COMMANDS,
  MEDIA_PLAYBACK_STATES,
  createDefaultHearingEnhancementCapabilitySnapshot,
  createDefaultPhoneMediaAudioCapabilitySnapshot,
} from "./audio_models";

describe("audio subsystem models", () => {
  it("exposes the full supported hearing enhancement mode set", () => {
    expect(HEARING_ENHANCEMENT_MODES).toEqual([
      "off",
      "ambient_boost",
      "balanced",
      "voice_focus",
      "hearing_protection",
    ]);
  });

  it("creates unavailable hearing defaults when the subsystem is absent", () => {
    expect(createDefaultHearingEnhancementCapabilitySnapshot()).toEqual({
      hearingEnhancementAvailable: false,
      microphoneArrayAvailable: false,
      hearingModesSupported: ["off"],
      hearingHealthState: "unavailable",
      hearingGainMin: 0,
      hearingGainMax: 1,
    });
  });

  it("creates unavailable phone/media defaults when the subsystem is absent", () => {
    expect(createDefaultPhoneMediaAudioCapabilitySnapshot()).toEqual({
      phoneAudioAvailable: false,
      bluetoothAudioConnected: false,
      mediaPlaybackControlSupported: false,
      mediaPlaybackState: "unavailable",
      mediaVolumeMin: 0,
      mediaVolumeMax: 1,
    });
    expect(MEDIA_PLAYBACK_STATES).toEqual([
      "unavailable",
      "idle",
      "playing",
      "paused",
    ]);
    expect(MEDIA_PLAYBACK_COMMANDS).toEqual([
      "play",
      "pause",
      "next",
      "previous",
      "volume_up",
      "volume_down",
    ]);
  });
});
