export const SUPPORTED_THERMAL_FRAME_PROVIDER_TYPES = ["simulated"];

export const THERMAL_FRAME_PROVIDER_STATES = [
  "idle",
  "starting",
  "running",
  "stopped",
  "error",
];

export function createThermalFrameProviderStatus(options) {
  return {
    providerType: options.providerType,
    providerDisplayName: options.providerDisplayName,
    state: options.state ?? "idle",
    detailText: options.detailText,
    lastFrameId: options.lastFrameId,
    lastTimestampMs: options.lastTimestampMs,
    lastError: options.lastError,
    backendType: options.backendType,
    backendDisplayName: options.backendDisplayName,
    backendState: options.backendState,
    thermalAvailable: options.thermalAvailable ?? false,
    thermalBackendIdentity: options.thermalBackendIdentity,
    thermalFrameWidth: options.thermalFrameWidth,
    thermalFrameHeight: options.thermalFrameHeight,
    thermalFrameRate: options.thermalFrameRate,
    thermalOverlaySupported: options.thermalOverlaySupported ?? false,
    supportedThermalOverlayModes: options.supportedThermalOverlayModes ?? [
      "thermal_fusion_envg",
    ],
    thermalHealthState: options.thermalHealthState ?? "unavailable",
    thermalErrorText: options.thermalErrorText,
    currentOverlayMode: options.currentOverlayMode ?? "thermal_fusion_envg",
  };
}

export function assertThermalFrameProvider(provider) {
  if (
    !provider ||
    typeof provider !== "object" ||
    typeof provider.start !== "function" ||
    typeof provider.stop !== "function" ||
    typeof provider.getStatus !== "function" ||
    typeof provider.getNextThermalFrame !== "function" ||
    typeof provider.setOverlayMode !== "function"
  ) {
    throw new Error("Invalid thermal frame provider contract.");
  }
}
