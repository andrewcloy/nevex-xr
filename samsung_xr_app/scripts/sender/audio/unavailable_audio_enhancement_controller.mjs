import { createAudioEnhancementStatus } from "./audio_enhancement_controller_contract.mjs";

export class UnavailableAudioEnhancementController {
  constructor() {
    this.status = createAudioEnhancementStatus({
      hearingEnhancementAvailable: false,
      microphoneArrayAvailable: false,
      hearingHealthState: "unavailable",
      currentHearingMode: "off",
      currentHearingGain: 0,
    });
  }

  async start() {}

  async stop() {}

  async setMode() {}

  async setGain() {}

  getStatus() {
    return this.status;
  }
}
