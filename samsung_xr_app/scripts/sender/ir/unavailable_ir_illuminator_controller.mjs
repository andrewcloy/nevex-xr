import { createIrIlluminatorStatus } from "./ir_illuminator_controller_contract.mjs";

export class UnavailableIrIlluminatorController {
  constructor() {
    this.status = createIrIlluminatorStatus({
      irAvailable: false,
      irEnabled: false,
      irLevel: 0,
      irMaxLevel: 0,
      irControlSupported: false,
    });
  }

  async start() {}

  async stop() {}

  async enable() {}

  async disable() {}

  async setLevel() {}

  getStatus() {
    return this.status;
  }
}
