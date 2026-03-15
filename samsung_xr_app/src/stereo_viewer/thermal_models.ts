export const THERMAL_OVERLAY_MODES = [
  "off",
  "thermal_fusion_envg",
  "hotspot_highlight",
  "hot_edges",
  "full_thermal",
  "hot_target_boxes_optional",
] as const;

export type ThermalOverlayMode = (typeof THERMAL_OVERLAY_MODES)[number];

export const DEFAULT_THERMAL_OVERLAY_MODE: ThermalOverlayMode =
  "thermal_fusion_envg";

export type ThermalHealthState =
  | "unavailable"
  | "idle"
  | "healthy"
  | "degraded"
  | "error";

export interface ThermalHotspotAnnotation {
  readonly id: string;
  readonly label?: string;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly normalizedRadius?: number;
  readonly normalizedBoxWidth?: number;
  readonly normalizedBoxHeight?: number;
  readonly temperatureC?: number;
  readonly intensityNormalized?: number;
}

export interface ThermalFrame {
  readonly frameId: number;
  readonly timestampMs: number;
  readonly width: number;
  readonly height: number;
  readonly thermalValues: readonly number[];
  readonly minTemperature: number;
  readonly maxTemperature: number;
  readonly hotspotAnnotations?: readonly ThermalHotspotAnnotation[];
  readonly paletteHint?: string;
}

export interface ThermalCapabilitySnapshot {
  readonly thermalAvailable: boolean;
  readonly thermalBackendIdentity?: string;
  readonly thermalFrameWidth?: number;
  readonly thermalFrameHeight?: number;
  readonly thermalFrameRate?: number;
  readonly thermalOverlaySupported: boolean;
  readonly supportedThermalOverlayModes: readonly ThermalOverlayMode[];
  readonly thermalHealthState: ThermalHealthState;
  readonly thermalErrorText?: string;
}

export interface IrIlluminatorCapabilitySnapshot {
  readonly irAvailable: boolean;
  readonly irBackendIdentity?: string;
  readonly irEnabled: boolean;
  readonly irLevel: number;
  readonly irMaxLevel: number;
  readonly irControlSupported: boolean;
  readonly irFaultState?: string;
  readonly irErrorText?: string;
}

export function createDefaultThermalCapabilitySnapshot(
  overrides: Partial<ThermalCapabilitySnapshot> = {},
): ThermalCapabilitySnapshot {
  return {
    thermalAvailable: false,
    thermalOverlaySupported: false,
    supportedThermalOverlayModes: [DEFAULT_THERMAL_OVERLAY_MODE],
    thermalHealthState: "unavailable",
    ...overrides,
  };
}

export function createDefaultIrIlluminatorCapabilitySnapshot(
  overrides: Partial<IrIlluminatorCapabilitySnapshot> = {},
): IrIlluminatorCapabilitySnapshot {
  return {
    irAvailable: false,
    irEnabled: false,
    irLevel: 0,
    irMaxLevel: 0,
    irControlSupported: false,
    ...overrides,
  };
}
