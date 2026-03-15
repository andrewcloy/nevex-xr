import { describe, expect, it } from "vitest";
import { SimulatedAudioEnhancementController } from "./simulated_audio_enhancement_controller.mjs";
import { SimulatedMediaPlaybackController } from "./simulated_media_playback_controller.mjs";
import { UnavailableAudioEnhancementController } from "./unavailable_audio_enhancement_controller.mjs";
import { UnavailableMediaPlaybackController } from "./unavailable_media_playback_controller.mjs";

describe("sender audio subsystem stubs", () => {
  it("keeps unavailable hearing enhancement inert", async () => {
    const controller = new UnavailableAudioEnhancementController();

    await controller.start();
    await controller.setMode("voice_focus");
    await controller.setGain(0.9);

    expect(controller.getStatus().hearingEnhancementAvailable).toBe(false);
    expect(controller.getStatus().currentHearingMode).toBe("off");
    expect(controller.getStatus().currentHearingGain).toBe(0);
  });

  it("supports simulated hearing mode and gain updates", async () => {
    const controller = new SimulatedAudioEnhancementController();

    await controller.start();
    await controller.setMode("voice_focus");
    await controller.setGain(0.73);

    expect(controller.getStatus().hearingEnhancementAvailable).toBe(true);
    expect(controller.getStatus().currentHearingMode).toBe("voice_focus");
    expect(controller.getStatus().currentHearingGain).toBeCloseTo(0.73);
  });

  it("keeps unavailable media playback inert", async () => {
    const controller = new UnavailableMediaPlaybackController();

    await controller.start();
    await controller.sendCommand("play");
    await controller.setVolume(0.8);

    expect(controller.getStatus().phoneAudioAvailable).toBe(false);
    expect(controller.getStatus().mediaPlaybackState).toBe("unavailable");
  });

  it("models simulated media playback command state", async () => {
    const controller = new SimulatedMediaPlaybackController({
      currentMediaVolume: 0.4,
    });

    await controller.start();
    await controller.sendCommand("play");
    await controller.sendCommand("volume_up");
    await controller.setMuted(true);

    expect(controller.getStatus().phoneAudioAvailable).toBe(true);
    expect(controller.getStatus().mediaPlaybackState).toBe("playing");
    expect(controller.getStatus().currentMediaVolume).toBeGreaterThan(0.4);
    expect(controller.getStatus().mediaMuted).toBe(true);
  });
});
