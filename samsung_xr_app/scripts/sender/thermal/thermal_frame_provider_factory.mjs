import { assertThermalFrameProvider } from "./thermal_frame_provider_contract.mjs";
import { SimulatedThermalFrameProvider } from "./simulated_thermal_frame_provider.mjs";

export function createThermalFrameProvider(config) {
  if (!config.thermalSimulated) {
    return undefined;
  }

  const provider = new SimulatedThermalFrameProvider({
    thermalFrameWidth: config.thermalFrameWidth,
    thermalFrameHeight: config.thermalFrameHeight,
    thermalFrameRate: config.thermalFrameRate,
    thermalOverlayMode: config.thermalOverlayMode,
  });
  assertThermalFrameProvider(provider);
  return provider;
}
