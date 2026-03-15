import { assertIrIlluminatorController } from "./ir_illuminator_controller_contract.mjs";
import { SimulatedIrIlluminatorController } from "./simulated_ir_illuminator_controller.mjs";
import { UnavailableIrIlluminatorController } from "./unavailable_ir_illuminator_controller.mjs";

export function createIrIlluminatorController(config) {
  const controller = config.irSimulated
    ? new SimulatedIrIlluminatorController({
        irEnabled: config.irEnabled,
        irLevel: config.irLevel,
        irMaxLevel: config.irMaxLevel,
      })
    : new UnavailableIrIlluminatorController();

  assertIrIlluminatorController(controller);
  return controller;
}
