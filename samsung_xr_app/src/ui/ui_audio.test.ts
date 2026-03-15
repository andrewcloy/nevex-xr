import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UI_AUDIO_ASSETS,
  DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS,
  UiAudioController,
  type UiAudioPlayable,
} from "./ui_audio";

describe("UiAudioController", () => {
  it("uses the centralized production audio asset paths", () => {
    expect(DEFAULT_UI_AUDIO_ASSETS).toEqual({
      uiClickUrl: "/assets/audio/ui/ui_click.wav",
      bootSoundUrl: "/assets/audio/system/boot_startup.wav",
    });
  });

  it("suppresses click playback while UI audio is muted", async () => {
    const createAudio = vi.fn(() => createFakeAudio(vi.fn(async () => undefined)));
    const controller = new UiAudioController({
      createAudio,
      getPlaybackSettings: () => ({
        enabled: false,
        clickVolume: 0.42,
        bootVolume: 0.58,
      }),
    });

    controller.playUiClick();
    await flushAsyncWork();

    expect(createAudio).not.toHaveBeenCalled();
  });

  it("plays the UI click sound through the configured asset path", async () => {
    const createdSources: string[] = [];
    const play = vi.fn(async () => undefined);
    const controller = new UiAudioController({
      createAudio: (sourceUrl) => {
        createdSources.push(sourceUrl);
        return createFakeAudio(play);
      },
    });

    controller.playUiClick();
    await flushAsyncWork();

    expect(createdSources).toEqual(["/assets/audio/ui/ui_click.wav"]);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("suppresses boot playback while UI audio is muted", async () => {
    const createAudio = vi.fn(() => createFakeAudio(vi.fn(async () => undefined)));
    const controller = new UiAudioController({
      createAudio,
      getPlaybackSettings: () => ({
        enabled: false,
        clickVolume: DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS.clickVolume,
        bootVolume: DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS.bootVolume,
      }),
    });

    controller.playBootSound();
    await flushAsyncWork();

    expect(createAudio).not.toHaveBeenCalled();
    expect(controller.resumeDeferredBootSound()).toBe(false);
  });

  it("applies the configured click and boot volumes", async () => {
    const createdAudio: Array<{
      readonly sourceUrl: string;
      readonly audio: UiAudioPlayable;
    }> = [];
    const controller = new UiAudioController({
      createAudio: (sourceUrl) => {
        const audio = createFakeAudio(vi.fn(async () => undefined));
        createdAudio.push({
          sourceUrl,
          audio,
        });
        return audio;
      },
      getPlaybackSettings: () => ({
        enabled: true,
        clickVolume: 0.15,
        bootVolume: 0.82,
      }),
    });

    controller.playUiClick();
    controller.playBootSound();
    await flushAsyncWork();

    expect(createdAudio).toHaveLength(2);
    expect(createdAudio[0]).toMatchObject({
      sourceUrl: DEFAULT_UI_AUDIO_ASSETS.uiClickUrl,
    });
    expect(createdAudio[0]?.audio.volume).toBe(0.15);
    expect(createdAudio[1]).toMatchObject({
      sourceUrl: DEFAULT_UI_AUDIO_ASSETS.bootSoundUrl,
    });
    expect(createdAudio[1]?.audio.volume).toBe(0.82);
  });

  it("defers blocked boot playback and respects later mute state", async () => {
    const createdSources: string[] = [];
    let bootAttemptCount = 0;
    let enabled = true;
    const controller = new UiAudioController({
      createAudio: (sourceUrl) => {
        createdSources.push(sourceUrl);
        return createFakeAudio(
          vi.fn().mockImplementation(() => {
            if (sourceUrl === DEFAULT_UI_AUDIO_ASSETS.bootSoundUrl) {
              bootAttemptCount += 1;
              if (bootAttemptCount === 1) {
                return Promise.reject(new Error("Autoplay blocked."));
              }
            }

            return Promise.resolve();
          }),
        );
      },
      getPlaybackSettings: () => ({
        enabled,
        clickVolume: DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS.clickVolume,
        bootVolume: DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS.bootVolume,
      }),
    });

    controller.playBootSound();
    await flushAsyncWork();

    enabled = false;
    expect(controller.resumeDeferredBootSound()).toBe(false);
    await flushAsyncWork();

    expect(controller.resumeDeferredBootSound()).toBe(false);

    expect(
      createdSources.filter((source) => source === DEFAULT_UI_AUDIO_ASSETS.bootSoundUrl),
    ).toHaveLength(1);
  });
});

function createFakeAudio(
  play: UiAudioPlayable["play"],
): UiAudioPlayable {
  return {
    currentTime: 0,
    volume: 1,
    preload: "auto",
    play,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
