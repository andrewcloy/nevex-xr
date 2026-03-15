export const MEDIA_PLAYBACK_COMMANDS = [
  "play",
  "pause",
  "next",
  "previous",
  "volume_up",
  "volume_down",
];

export function createMediaPlaybackStatus(options = {}) {
  return {
    phoneAudioAvailable: options.phoneAudioAvailable ?? false,
    bluetoothAudioConnected: options.bluetoothAudioConnected ?? false,
    mediaPlaybackControlSupported: options.mediaPlaybackControlSupported ?? false,
    mediaPlaybackState: options.mediaPlaybackState ?? "unavailable",
    mediaVolumeMin: options.mediaVolumeMin ?? 0,
    mediaVolumeMax: options.mediaVolumeMax ?? 1,
    currentMediaVolume: options.currentMediaVolume ?? 0.5,
    mediaMuted: options.mediaMuted ?? false,
  };
}

export function assertMediaPlaybackController(controller) {
  if (
    !controller ||
    typeof controller !== "object" ||
    typeof controller.start !== "function" ||
    typeof controller.stop !== "function" ||
    typeof controller.sendCommand !== "function" ||
    typeof controller.setVolume !== "function" ||
    typeof controller.setMuted !== "function" ||
    typeof controller.getStatus !== "function"
  ) {
    throw new Error("Invalid media playback controller contract.");
  }
}
