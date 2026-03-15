import { createMediaPlaybackStatus } from "./media_playback_controller_contract.mjs";

export class UnavailableMediaPlaybackController {
  constructor() {
    this.status = createMediaPlaybackStatus({
      phoneAudioAvailable: false,
      bluetoothAudioConnected: false,
      mediaPlaybackControlSupported: false,
      mediaPlaybackState: "unavailable",
      currentMediaVolume: 0,
      mediaMuted: true,
    });
  }

  async start() {}

  async stop() {}

  async sendCommand() {}

  async setVolume() {}

  async setMuted() {}

  getStatus() {
    return this.status;
  }
}
