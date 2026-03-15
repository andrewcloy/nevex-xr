import { uiAssetBrowserUrls } from "./assets/uiAssets";
import {
  DEFAULT_UI_AUDIO_ENABLED,
  DEFAULT_UI_BOOT_VOLUME,
  DEFAULT_UI_CLICK_VOLUME,
} from "../settings_state/settings_store";

export interface UiAudioAssetCatalog {
  readonly uiClickUrl: string;
  readonly bootSoundUrl: string;
}

export interface UiAudioPlaybackSettings {
  readonly enabled: boolean;
  readonly clickVolume: number;
  readonly bootVolume: number;
}

export interface UiAudioPlayable {
  currentTime: number;
  volume: number;
  preload?: string;
  play(): Promise<void>;
}

export type UiAudioFactory = (sourceUrl: string) => UiAudioPlayable | undefined;

export interface UiAudioControllerOptions {
  readonly assets?: Partial<UiAudioAssetCatalog>;
  readonly createAudio?: UiAudioFactory;
  readonly getPlaybackSettings?: () => UiAudioPlaybackSettings;
}

export const DEFAULT_UI_AUDIO_ASSETS: UiAudioAssetCatalog = {
  uiClickUrl: uiAssetBrowserUrls.audio.ui.click,
  bootSoundUrl: uiAssetBrowserUrls.audio.system.bootStartup,
};

export const DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS: UiAudioPlaybackSettings = {
  enabled: DEFAULT_UI_AUDIO_ENABLED,
  clickVolume: DEFAULT_UI_CLICK_VOLUME,
  bootVolume: DEFAULT_UI_BOOT_VOLUME,
};

/**
 * Minimal browser-side audio helper for UI feedback sounds.
 *
 * The helper keeps sound paths centralized, suppresses noisy playback errors,
 * and defers the boot cue until a later user interaction when autoplay is not
 * permitted by the browser.
 */
export class UiAudioController {
  private readonly assets: UiAudioAssetCatalog;

  private readonly createAudio: UiAudioFactory;

  private readonly getPlaybackSettings: () => UiAudioPlaybackSettings;

  private bootSoundPlayed = false;

  private bootSoundDeferred = false;

  constructor(options: UiAudioControllerOptions = {}) {
    this.assets = {
      ...DEFAULT_UI_AUDIO_ASSETS,
      ...options.assets,
    };
    this.createAudio = options.createAudio ?? createBrowserAudio;
    this.getPlaybackSettings =
      options.getPlaybackSettings ?? (() => DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS);
  }

  playUiClick(): void {
    const playbackSettings = this.resolvePlaybackSettings();
    if (!playbackSettings.enabled || playbackSettings.clickVolume <= 0) {
      return;
    }

    this.playTransientSound(this.assets.uiClickUrl, playbackSettings.clickVolume);
  }

  playBootSound(): void {
    if (this.bootSoundPlayed) {
      return;
    }

    const playbackSettings = this.resolvePlaybackSettings();
    if (!playbackSettings.enabled || playbackSettings.bootVolume <= 0) {
      this.skipBootSound();
      return;
    }

    void this.tryPlayBootSound(playbackSettings.bootVolume);
  }

  resumeDeferredBootSound(): boolean {
    if (!this.bootSoundDeferred || this.bootSoundPlayed) {
      return false;
    }

    const playbackSettings = this.resolvePlaybackSettings();
    if (!playbackSettings.enabled) {
      this.skipBootSound();
      return false;
    }

    if (playbackSettings.bootVolume <= 0) {
      this.skipBootSound();
      return false;
    }

    this.bootSoundDeferred = false;
    void this.tryPlayBootSound(playbackSettings.bootVolume);
    return true;
  }

  private async tryPlayBootSound(volume: number): Promise<void> {
    if (this.bootSoundPlayed) {
      return;
    }

    const audio = this.createConfiguredAudio(this.assets.bootSoundUrl, volume);
    if (!audio) {
      return;
    }

    try {
      audio.currentTime = 0;
      await audio.play();
      this.bootSoundPlayed = true;
      this.bootSoundDeferred = false;
    } catch {
      this.bootSoundDeferred = true;
    }
  }

  private resolvePlaybackSettings(): UiAudioPlaybackSettings {
    const nextSettings = this.getPlaybackSettings();

    return {
      enabled: nextSettings.enabled,
      clickVolume: normalizeVolume(
        nextSettings.clickVolume,
        DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS.clickVolume,
      ),
      bootVolume: normalizeVolume(
        nextSettings.bootVolume,
        DEFAULT_UI_AUDIO_PLAYBACK_SETTINGS.bootVolume,
      ),
    };
  }

  private skipBootSound(): void {
    this.bootSoundDeferred = false;
    this.bootSoundPlayed = true;
  }

  private playTransientSound(sourceUrl: string, volume: number): void {
    const audio = this.createConfiguredAudio(sourceUrl, volume);
    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }

  private createConfiguredAudio(
    sourceUrl: string,
    volume: number,
  ): UiAudioPlayable | undefined {
    if (!sourceUrl) {
      return undefined;
    }

    let audio: UiAudioPlayable | undefined;
    try {
      audio = this.createAudio(sourceUrl);
    } catch {
      return undefined;
    }

    if (!audio) {
      return undefined;
    }

    audio.volume = volume;
    return audio;
  }
}

function createBrowserAudio(sourceUrl: string): UiAudioPlayable | undefined {
  if (typeof Audio === "undefined") {
    return undefined;
  }

  const audio = new Audio(sourceUrl);
  audio.preload = "auto";
  return audio;
}

function normalizeVolume(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}
