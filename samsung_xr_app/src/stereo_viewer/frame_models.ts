import type { ThermalFrame, ThermalOverlayMode } from "./thermal_models";

/**
 * Eye identifiers used across stereo frame input and presentation models.
 */
export type StereoEye = "left" | "right";

/**
 * High-level content origin currently driving the stereo viewer.
 *
 * This remains intentionally generic so a future live source can represent
 * Jetson-fed frames without encoding any transport details here.
 */
export type ViewerContentSource = "none" | "mock" | "live";

/**
 * Generic frame formats that future integrations may map real data into.
 */
export type StereoFrameFormat = "placeholder" | "image" | "rgba8" | "yuv" | "unknown";

/**
 * Primitive metadata value supported by the frame model.
 */
export type StereoMetadataValue = string | number | boolean | null;

/**
 * Debug-facing pattern descriptor used by mock sources and local renderers.
 *
 * A real XR renderer can later replace this with image or texture-backed
 * content while preserving the same outer frame model.
 */
export interface StereoEyeDebugPattern {
  readonly eyeLabel: string;
  readonly title: string;
  readonly backgroundHex: string;
  readonly accentHex: string;
  readonly markerText: string;
}

/**
 * Browser-friendly image payload associated with one eye frame.
 *
 * This lets the early Jetson protocol path deliver still-image content without
 * committing yet to a video codec or production streaming transport.
 */
export interface StereoEyeImageContent {
  readonly sourceKind: "data_url" | "base64" | "uri";
  readonly src: string;
  readonly mimeType?: string;
}

/**
 * Structured content for a single eye of the stereo frame.
 */
export interface StereoEyeFrame {
  readonly eye: StereoEye;
  readonly width: number;
  readonly height: number;
  readonly format: StereoFrameFormat;
  readonly contentLabel?: string;
  readonly imageContent?: StereoEyeImageContent;
  readonly debugPattern?: StereoEyeDebugPattern;
  readonly metadata?: Readonly<Record<string, StereoMetadataValue>>;
}

/**
 * Optional cross-eye metadata describing the frame as a whole.
 */
export interface StereoFrameMetadata {
  readonly sourceId?: string;
  readonly sceneId?: string;
  readonly streamName?: string;
  readonly tags?: readonly string[];
  readonly extras?: Readonly<Record<string, StereoMetadataValue>>;
}

/**
 * Placeholder overlay annotation structure that future live systems can fill.
 *
 * This intentionally avoids assuming any specific overlay protocol or drawing
 * backend while still letting the mock pipeline carry structured overlay data.
 */
export interface StereoOverlayAnnotation {
  readonly id: string;
  readonly kind: "crosshair" | "text";
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly label?: string;
}

/**
 * Optional overlay payload delivered with a stereo frame.
 */
export interface StereoOverlayPayload {
  readonly label?: string;
  readonly annotations?: readonly StereoOverlayAnnotation[];
}

/**
 * Formal stereo frame input delivered to the viewer.
 *
 * Future live sources can emit this same structure regardless of whether the
 * underlying transport is shared memory, sockets, WebRTC, or something else.
 */
export interface StereoFrame {
  readonly frameId: number;
  readonly timestampMs: number;
  readonly source: Exclude<ViewerContentSource, "none">;
  readonly left: StereoEyeFrame;
  readonly right: StereoEyeFrame;
  readonly metadata?: StereoFrameMetadata;
  readonly overlay?: StereoOverlayPayload;
  readonly thermalFrame?: ThermalFrame;
  readonly thermalOverlayMode?: ThermalOverlayMode;
}
