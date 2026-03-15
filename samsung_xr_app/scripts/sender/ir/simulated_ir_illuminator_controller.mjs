import { createIrIlluminatorStatus } from "./ir_illuminator_controller_contract.mjs";

const DEFAULT_IR_MAX_LEVEL = 5;

export class SimulatedIrIlluminatorController {
  constructor(options = {}) {
    this.backendIdentity = "simulated_ir_illuminator_controller";
    this.irMaxLevel = normalizeNonNegativeInteger(
      options.irMaxLevel,
      DEFAULT_IR_MAX_LEVEL,
    );
    this.irLevel = clampLevel(options.irLevel, this.irMaxLevel);
    this.irEnabled = Boolean(options.irEnabled) && this.irMaxLevel > 0;
    if (this.irEnabled && this.irLevel === 0) {
      this.irLevel = Math.min(1, this.irMaxLevel);
    }
    this.status = this.createStatus();
  }

  createStatus(overrides = {}) {
    return createIrIlluminatorStatus({
      irAvailable: true,
      irBackendIdentity: this.backendIdentity,
      irEnabled:
        overrides.irEnabled !== undefined ? overrides.irEnabled : this.irEnabled,
      irLevel: overrides.irLevel !== undefined ? overrides.irLevel : this.irLevel,
      irMaxLevel: this.irMaxLevel,
      irControlSupported: true,
      irFaultState: overrides.irFaultState,
      irErrorText: overrides.irErrorText,
    });
  }

  async start() {
    this.status = this.createStatus();
  }

  async stop() {
    this.status = this.createStatus({
      irEnabled: false,
      irLevel: 0,
    });
  }

  async enable() {
    this.irEnabled = this.irMaxLevel > 0;
    if (this.irEnabled && this.irLevel === 0) {
      this.irLevel = Math.min(1, this.irMaxLevel);
    }
    this.status = this.createStatus();
  }

  async disable() {
    this.irEnabled = false;
    this.irLevel = 0;
    this.status = this.createStatus();
  }

  async setLevel(level) {
    this.irLevel = clampLevel(level, this.irMaxLevel);
    this.irEnabled = this.irLevel > 0;
    this.status = this.createStatus();
  }

  getStatus() {
    return this.status;
  }
}

function normalizeNonNegativeInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackValue;
  }

  return Math.round(parsed);
}

function clampLevel(level, maxLevel) {
  const parsed = Number(level);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(maxLevel, Math.round(parsed)));
}
