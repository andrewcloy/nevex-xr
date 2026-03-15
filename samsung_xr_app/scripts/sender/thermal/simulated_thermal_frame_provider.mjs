import { assertThermalBackend } from "./thermal_backend_contract.mjs";
import { SimulatedThermalBackend } from "./simulated_thermal_backend.mjs";
import { createThermalFrameProviderStatus } from "./thermal_frame_provider_contract.mjs";

export class SimulatedThermalFrameProvider {
  constructor(options = {}) {
    this.backend = new SimulatedThermalBackend(options);
    assertThermalBackend(this.backend);
    this.status = this.createStatus({
      state: "idle",
      detailText: "Simulated thermal frame provider idle.",
    });
  }

  createStatus(overrides = {}) {
    const backendStatus = this.backend.getStatus();
    return createThermalFrameProviderStatus({
      providerType: "simulated",
      providerDisplayName: "Simulated Thermal Frame Provider",
      state: overrides.state ?? this.status?.state ?? "idle",
      detailText: overrides.detailText ?? this.status?.detailText,
      lastFrameId:
        overrides.lastFrameId !== undefined
          ? overrides.lastFrameId
          : backendStatus.lastFrameId,
      lastTimestampMs:
        overrides.lastTimestampMs !== undefined
          ? overrides.lastTimestampMs
          : backendStatus.lastTimestampMs,
      lastError:
        overrides.lastError !== undefined
          ? overrides.lastError
          : backendStatus.lastError,
      backendType: backendStatus.backendType,
      backendDisplayName: backendStatus.backendDisplayName,
      backendState: backendStatus.state,
      thermalAvailable: backendStatus.thermalAvailable,
      thermalBackendIdentity: backendStatus.thermalBackendIdentity,
      thermalFrameWidth: backendStatus.thermalFrameWidth,
      thermalFrameHeight: backendStatus.thermalFrameHeight,
      thermalFrameRate: backendStatus.thermalFrameRate,
      thermalOverlaySupported: backendStatus.thermalOverlaySupported,
      supportedThermalOverlayModes: backendStatus.supportedThermalOverlayModes,
      thermalHealthState: backendStatus.thermalHealthState,
      thermalErrorText: backendStatus.thermalErrorText,
      currentOverlayMode: backendStatus.currentOverlayMode,
    });
  }

  async start() {
    this.status = this.createStatus({
      state: "starting",
      detailText: "Starting simulated thermal frame provider.",
    });
    await this.backend.start();
    this.status = this.createStatus({
      state: "running",
      detailText:
        "Simulated thermal frame provider running through the thermal backend seam.",
    });
  }

  async stop() {
    await this.backend.stop();
    this.status = this.createStatus({
      state: "stopped",
      detailText: "Simulated thermal frame provider stopped.",
    });
  }

  getStatus() {
    return this.status;
  }

  setOverlayMode(mode) {
    this.backend.setOverlayMode(mode);
    this.status = this.createStatus({
      detailText: `Simulated thermal overlay mode set to ${mode}.`,
      currentOverlayMode: this.backend.getStatus().currentOverlayMode,
    });
  }

  async getNextThermalFrame() {
    try {
      const frame = await this.backend.captureThermalFrame();
      this.status = this.createStatus({
        state: "running",
        detailText: `Simulated thermal frame #${frame.frameId} ready for fusion.`,
        lastFrameId: frame.frameId,
        lastTimestampMs: frame.timestamp,
        lastError: undefined,
      });
      return frame;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = this.createStatus({
        state: "error",
        detailText: message,
        lastError: message,
      });
      throw error;
    }
  }
}
