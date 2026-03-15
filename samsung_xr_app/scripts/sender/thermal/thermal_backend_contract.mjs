export const SUPPORTED_THERMAL_BACKEND_TYPES = ["simulated"];

export const THERMAL_BACKEND_STATES = [
  "idle",
  "starting",
  "running",
  "stopped",
  "error",
  "unavailable",
] ;

export function createThermalBackendStatus(options) {
  return {
    backendType: options.backendType,
    backendDisplayName: options.backendDisplayName,
    state: options.state ?? "idle",
    detailText: options.detailText,
    lastFrameId: options.lastFrameId,
    lastTimestampMs: options.lastTimestampMs,
    lastError: options.lastError,
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

export function assertThermalBackend(backend) {
  if (
    !backend ||
    typeof backend !== "object" ||
    typeof backend.start !== "function" ||
    typeof backend.stop !== "function" ||
    typeof backend.getStatus !== "function" ||
    typeof backend.captureThermalFrame !== "function" ||
    typeof backend.setOverlayMode !== "function"
  ) {
    throw new Error("Invalid thermal backend contract.");
  }
}
