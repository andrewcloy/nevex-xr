import {
  MEDIA_PLAYBACK_COMMANDS,
  createMediaPlaybackStatus,
} from "./media_playback_controller_contract.mjs";

export class SimulatedMediaPlaybackController {
  constructor(options = {}) {
    this.volumeMin = 0;
    this.volumeMax = normalizeVolumeLimit(options.mediaVolumeMax, 1);
    this.currentVolume = clampVolume(
      options.currentMediaVolume,
      this.volumeMin,
      this.volumeMax,
    );
    this.mediaMuted = Boolean(options.mediaMuted);
    this.mediaPlaybackState = "idle";
    this.bluetoothAudioConnected =
      options.bluetoothAudioConnected === undefined
        ? true
        : Boolean(options.bluetoothAudioConnected);
    this.status = this.createStatus();
  }

  createStatus(overrides = {}) {
    return createMediaPlaybackStatus({
      phoneAudioAvailable: true,
      bluetoothAudioConnected:
        overrides.bluetoothAudioConnected !== undefined
          ? overrides.bluetoothAudioConnected
          : this.bluetoothAudioConnected,
      mediaPlaybackControlSupported: true,
      mediaPlaybackState:
        overrides.mediaPlaybackState !== undefined
          ? overrides.mediaPlaybackState
          : this.mediaPlaybackState,
      mediaVolumeMin: this.volumeMin,
      mediaVolumeMax: this.volumeMax,
      currentMediaVolume:
        overrides.currentMediaVolume !== undefined
          ? overrides.currentMediaVolume
          : this.currentVolume,
      mediaMuted:
        overrides.mediaMuted !== undefined ? overrides.mediaMuted : this.mediaMuted,
    });
  }

  async start() {
    this.status = this.createStatus({
      mediaPlaybackState: this.mediaPlaybackState,
    });
  }

  async stop() {
    this.mediaPlaybackState = "paused";
    this.status = this.createStatus({
      mediaPlaybackState: "paused",
    });
  }

  async sendCommand(command) {
    if (!MEDIA_PLAYBACK_COMMANDS.includes(command)) {
      return;
    }

    if (command === "play") {
      this.mediaPlaybackState = "playing";
    } else if (command === "pause") {
      this.mediaPlaybackState = "paused";
    } else if (command === "volume_up") {
      this.currentVolume = clampVolume(
        this.currentVolume + 0.1,
        this.volumeMin,
        this.volumeMax,
      );
      this.mediaMuted = false;
    } else if (command === "volume_down") {
      this.currentVolume = clampVolume(
        this.currentVolume - 0.1,
        this.volumeMin,
        this.volumeMax,
      );
      if (this.currentVolume === 0) {
        this.mediaMuted = true;
      }
    }

    this.status = this.createStatus();
  }

  async setVolume(volume) {
    this.currentVolume = clampVolume(volume, this.volumeMin, this.volumeMax);
    if (this.currentVolume > 0) {
      this.mediaMuted = false;
    }
    this.status = this.createStatus();
  }

  async setMuted(muted) {
    this.mediaMuted = Boolean(muted);
    this.status = this.createStatus();
  }

  getStatus() {
    return this.status;
  }
}

function normalizeVolumeLimit(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
}

function clampVolume(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, parsed));
}
