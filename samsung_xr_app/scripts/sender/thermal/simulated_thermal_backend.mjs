import { createThermalBackendStatus } from "./thermal_backend_contract.mjs";

const DEFAULT_THERMAL_FRAME_WIDTH = 32;
const DEFAULT_THERMAL_FRAME_HEIGHT = 24;
const DEFAULT_THERMAL_FRAME_RATE = 9;
const DEFAULT_OVERLAY_MODE = "thermal_fusion_envg";
const SUPPORTED_THERMAL_OVERLAY_MODES = [
  "off",
  "thermal_fusion_envg",
  "hotspot_highlight",
  "hot_edges",
  "full_thermal",
  "hot_target_boxes_optional",
];

export class SimulatedThermalBackend {
  constructor(options = {}) {
    this.options = {
      thermalFrameWidth: normalizePositiveInteger(
        options.thermalFrameWidth,
        DEFAULT_THERMAL_FRAME_WIDTH,
      ),
      thermalFrameHeight: normalizePositiveInteger(
        options.thermalFrameHeight,
        DEFAULT_THERMAL_FRAME_HEIGHT,
      ),
      thermalFrameRate: normalizePositiveNumber(
        options.thermalFrameRate,
        DEFAULT_THERMAL_FRAME_RATE,
      ),
      thermalOverlayMode:
        typeof options.thermalOverlayMode === "string" &&
        SUPPORTED_THERMAL_OVERLAY_MODES.includes(options.thermalOverlayMode)
          ? options.thermalOverlayMode
          : DEFAULT_OVERLAY_MODE,
      supportedThermalOverlayModes:
        Array.isArray(options.supportedThermalOverlayModes) &&
        options.supportedThermalOverlayModes.length > 0
          ? options.supportedThermalOverlayModes.filter((mode) =>
              SUPPORTED_THERMAL_OVERLAY_MODES.includes(mode),
            )
          : [...SUPPORTED_THERMAL_OVERLAY_MODES],
    };
    this.nowFn = options.nowFn ?? Date.now;
    this.backendIdentity = "simulated_thermal_backend";
    this.paletteHint = "envg_heat";
    this.isRunning = false;
    this.frameId = 0;
    this.lastTimestampMs = undefined;
    this.lastError = undefined;
    this.status = this.createStatus({
      state: "idle",
      detailText: "Simulated thermal backend idle.",
    });
  }

  createStatus(overrides = {}) {
    return createThermalBackendStatus({
      backendType: "simulated",
      backendDisplayName: "Simulated Thermal Backend",
      state: overrides.state ?? this.status?.state ?? "idle",
      detailText: overrides.detailText ?? this.status?.detailText,
      lastFrameId:
        overrides.lastFrameId !== undefined
          ? overrides.lastFrameId
          : this.frameId || undefined,
      lastTimestampMs:
        overrides.lastTimestampMs !== undefined
          ? overrides.lastTimestampMs
          : this.lastTimestampMs,
      lastError:
        overrides.lastError !== undefined ? overrides.lastError : this.lastError,
      thermalAvailable: true,
      thermalBackendIdentity: this.backendIdentity,
      thermalFrameWidth: this.options.thermalFrameWidth,
      thermalFrameHeight: this.options.thermalFrameHeight,
      thermalFrameRate: this.options.thermalFrameRate,
      thermalOverlaySupported: true,
      supportedThermalOverlayModes: this.options.supportedThermalOverlayModes,
      thermalHealthState:
        overrides.thermalHealthState ??
        deriveThermalHealthState(overrides.state ?? this.status?.state ?? "idle"),
      thermalErrorText:
        overrides.thermalErrorText !== undefined
          ? overrides.thermalErrorText
          : this.lastError,
      currentOverlayMode:
        overrides.currentOverlayMode ?? this.options.thermalOverlayMode,
    });
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.status = this.createStatus({
      state: "starting",
      detailText: "Starting simulated thermal backend.",
      thermalHealthState: "idle",
      lastError: undefined,
      thermalErrorText: undefined,
    });

    this.isRunning = true;
    this.lastError = undefined;
    this.status = this.createStatus({
      state: "running",
      detailText:
        "Simulated thermal backend running with moving heat blobs and hotspot annotations.",
      thermalHealthState: "healthy",
    });
  }

  async stop() {
    this.isRunning = false;
    this.status = this.createStatus({
      state: "stopped",
      detailText: "Simulated thermal backend stopped.",
      thermalHealthState: "idle",
    });
  }

  getStatus() {
    return this.status;
  }

  setOverlayMode(mode) {
    if (!SUPPORTED_THERMAL_OVERLAY_MODES.includes(mode)) {
      return;
    }

    this.options.thermalOverlayMode = mode;
    this.status = this.createStatus({
      detailText: `Simulated thermal backend overlay mode set to ${mode}.`,
      currentOverlayMode: mode,
    });
  }

  async captureThermalFrame() {
    if (!this.isRunning) {
      throw new Error("Simulated thermal backend is not running.");
    }

    const timestamp = this.nowFn();
    this.frameId += 1;
    const frame = buildSimulatedThermalFrame({
      frameId: this.frameId,
      timestamp,
      width: this.options.thermalFrameWidth,
      height: this.options.thermalFrameHeight,
      paletteHint: this.paletteHint,
    });

    this.lastTimestampMs = timestamp;
    this.status = this.createStatus({
      state: "running",
      detailText: `Generated simulated thermal frame #${this.frameId}.`,
      lastFrameId: this.frameId,
      lastTimestampMs: timestamp,
      thermalHealthState: "healthy",
      lastError: undefined,
      thermalErrorText: undefined,
    });

    return frame;
  }
}

function buildSimulatedThermalFrame(options) {
  const { frameId, timestamp, width, height, paletteHint } = options;
  const phase = frameId * 0.22;
  const hotspotA = {
    x: 0.24 + Math.sin(phase * 0.9) * 0.18,
    y: 0.28 + Math.cos(phase * 0.7) * 0.12,
    radius: 0.13,
    peak: 17,
  };
  const hotspotB = {
    x: 0.68 + Math.cos(phase * 0.6) * 0.16,
    y: 0.58 + Math.sin(phase * 1.1) * 0.14,
    radius: 0.11,
    peak: 13,
  };
  const hotspotC = {
    x: 0.52 + Math.sin(phase * 0.45) * 0.1,
    y: 0.78 + Math.cos(phase * 0.5) * 0.05,
    radius: 0.08,
    peak: 9,
  };

  const thermalValues = [];
  let minTemperature = Number.POSITIVE_INFINITY;
  let maxTemperature = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const normalizedX = x / Math.max(1, width - 1);
      const normalizedY = y / Math.max(1, height - 1);
      const baseTemperature =
        17.5 +
        normalizedY * 5.2 +
        Math.sin((normalizedX + phase * 0.15) * 7.4) * 0.9 +
        Math.cos((normalizedY + phase * 0.08) * 5.8) * 0.7;
      const thermalValue =
        baseTemperature +
        computeHeatContribution(normalizedX, normalizedY, hotspotA) +
        computeHeatContribution(normalizedX, normalizedY, hotspotB) +
        computeHeatContribution(normalizedX, normalizedY, hotspotC);
      const roundedValue = Number(thermalValue.toFixed(2));
      thermalValues.push(roundedValue);
      minTemperature = Math.min(minTemperature, roundedValue);
      maxTemperature = Math.max(maxTemperature, roundedValue);
    }
  }

  const hotspotAnnotations = [hotspotA, hotspotB, hotspotC].map((hotspot, index) => {
    return {
      id: `sim-hotspot-${index + 1}`,
      label: `Hotspot ${index + 1}`,
      normalizedX: clamp01(hotspot.x),
      normalizedY: clamp01(hotspot.y),
      normalizedRadius: hotspot.radius,
      normalizedBoxWidth: hotspot.radius * 2.3,
      normalizedBoxHeight: hotspot.radius * 2.1,
      temperatureC: Number((22 + hotspot.peak).toFixed(1)),
      intensityNormalized: clamp01(hotspot.peak / 18),
    };
  });

  return {
    frameId,
    timestamp,
    width,
    height,
    thermalValues,
    minTemperature: Number(minTemperature.toFixed(2)),
    maxTemperature: Number(maxTemperature.toFixed(2)),
    hotspotAnnotations,
    paletteHint,
  };
}

function computeHeatContribution(normalizedX, normalizedY, hotspot) {
  const distanceX = normalizedX - hotspot.x;
  const distanceY = normalizedY - hotspot.y;
  const distanceSquared =
    distanceX * distanceX + distanceY * distanceY;
  const sigma = Math.max(0.0001, hotspot.radius * hotspot.radius);
  return hotspot.peak * Math.exp(-distanceSquared / (2 * sigma));
}

function normalizePositiveInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.round(parsed);
}

function normalizePositiveNumber(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function deriveThermalHealthState(state) {
  if (state === "running") {
    return "healthy";
  }

  if (state === "error") {
    return "error";
  }

  return "idle";
}
