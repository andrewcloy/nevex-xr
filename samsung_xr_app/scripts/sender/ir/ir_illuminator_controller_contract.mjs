export function createIrIlluminatorStatus(options = {}) {
  return {
    irAvailable: options.irAvailable ?? false,
    irBackendIdentity: options.irBackendIdentity,
    irEnabled: options.irEnabled ?? false,
    irLevel: options.irLevel ?? 0,
    irMaxLevel: options.irMaxLevel ?? 0,
    irControlSupported: options.irControlSupported ?? false,
    irFaultState: options.irFaultState,
    irErrorText: options.irErrorText,
  };
}

export function assertIrIlluminatorController(controller) {
  if (
    !controller ||
    typeof controller !== "object" ||
    typeof controller.start !== "function" ||
    typeof controller.stop !== "function" ||
    typeof controller.enable !== "function" ||
    typeof controller.disable !== "function" ||
    typeof controller.setLevel !== "function" ||
    typeof controller.getStatus !== "function"
  ) {
    throw new Error("Invalid IR illuminator controller contract.");
  }
}
