import type { Unsubscribe } from "../hand_input/contracts";
import type { StereoEye, StereoFrame, ViewerContentSource } from "./frame_models";
import type {
  IrIlluminatorCapabilitySnapshot,
  ThermalCapabilitySnapshot,
  ThermalOverlayMode,
} from "./thermal_models";

/**
 * Runtime states for a stereo frame source.
 */
export type StereoFrameSourceState =
  | "idle"
  | "starting"
  | "running"
  | "reconnecting"
  | "stopped"
  | "error";

/**
 * Metadata describing a frame source implementation.
 */
export interface StereoFrameSourceInfo {
  readonly id: string;
  readonly displayName: string;
  readonly sourceKind: Exclude<ViewerContentSource, "none">;
  readonly isMock?: boolean;
}

/**
 * Optional camera-oriented telemetry surfaced through source-status updates.
 *
 * This allows the browser to keep receiving retry/recovery health snapshots even
 * when no new stereo frame has arrived yet.
 */
export interface StereoFrameSourceCameraTelemetrySnapshot {
  readonly captureBackendName?: string;
  readonly frameSourceMode?: string;
  readonly frameSourceName?: string;
  readonly bridgeMode?: string;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly frameIntervalMs?: number;
  readonly fallbackActive?: boolean;
  readonly fallbackReason?: string;
  readonly startupValidated?: boolean;
  readonly capturesAttempted?: number;
  readonly capturesSucceeded?: number;
  readonly capturesFailed?: number;
  readonly consecutiveFailureCount?: number;
  readonly lastSuccessfulCaptureTime?: number;
  readonly lastCaptureDurationMs?: number;
  readonly averageCaptureDurationMs?: number;
  readonly effectiveFrameIntervalMs?: number;
  readonly leftCameraDevice?: string;
  readonly rightCameraDevice?: string;
  readonly gstLaunchPath?: string;
  readonly captureHealthState?:
    | "idle"
    | "healthy"
    | "retrying"
    | "recovered"
    | "terminal_failure";
  readonly captureRetryCount?: number;
  readonly captureRetryDelayMs?: number;
  readonly recentRetryAttempts?: number;
  readonly currentRetryAttempt?: number;
  readonly transientFailureCount?: number;
  readonly recoveryCount?: number;
  readonly lastRecoveryTime?: number;
  readonly lastTerminalFailureTime?: number;
  readonly recentCaptureEvents?: readonly StereoFrameSourceCaptureEventSnapshot[];
  readonly replaySourceIdentity?: string;
  readonly replayLoopEnabled?: boolean;
  readonly replayCurrentIndex?: number;
  readonly replayFrameCount?: number;
  readonly replayLeftSource?: string;
  readonly replayRightSource?: string;
  readonly replayTimingMode?: "fixed" | "recorded";
  readonly replayTimeScale?: number;
  readonly replayManifestLoaded?: boolean;
  readonly replayManifestValidated?: boolean;
  readonly replayManifestErrorCount?: number;
  readonly replayManifestWarningCount?: number;
  readonly replayManifestSource?: string;
  readonly replayValidationSummary?: string;
  readonly replayRecordedTimestamp?: number;
  readonly replayDelayUntilNextMs?: number;
  readonly replayScaledDelayUntilNextMs?: number;
  readonly replayTimingOffsetMs?: number;
  readonly replayNominalLoopDurationMs?: number;
  readonly replayScaledLoopDurationMs?: number;
  readonly runtimeProfileName?: string;
  readonly runtimeProfileType?: string;
  readonly runtimeProfileDescription?: string;
  readonly defaultProfileName?: string;
  readonly availableProfileNames?: readonly string[];
  readonly leftSensorId?: string | number;
  readonly rightSensorId?: string | number;
  readonly inputWidth?: number;
  readonly inputHeight?: number;
  readonly outputWidth?: number;
  readonly outputHeight?: number;
  readonly outputMode?: string;
  readonly effectiveFps?: number;
  readonly recordingContainer?: string;
  readonly recordDurationSeconds?: number;
  readonly testDurationSeconds?: number;
  readonly queueMaxSizeBuffers?: number;
  readonly outputDirectory?: string;
  readonly recordingActive?: boolean;
  readonly recordingOutputPath?: string;
  readonly artifactType?: string;
  readonly artifactPath?: string;
  readonly artifactSizeBytes?: number;
  readonly artifactCapturedAt?: string;
  readonly artifactMetadataSource?: string;
  readonly preflightOverallStatus?: string;
  readonly preflightOk?: boolean;
  readonly preflightPassCount?: number;
  readonly preflightWarnCount?: number;
  readonly preflightFailCount?: number;
  readonly preflightCriticalFailCount?: number;
  readonly systemIsJetson?: boolean;
  readonly jetpackVersion?: string;
  readonly l4tVersion?: string;
  readonly projectName?: string;
  readonly configPath?: string;
  readonly gstLaunchBinary?: string;
}

/**
 * Optional thermal-oriented telemetry surfaced through source-status updates.
 */
export interface StereoFrameSourceThermalTelemetrySnapshot
  extends ThermalCapabilitySnapshot {
  readonly currentOverlayMode: ThermalOverlayMode;
  readonly lastThermalFrameId?: number;
  readonly lastThermalTimestampMs?: number;
  readonly hotspotCount?: number;
  readonly paletteHint?: string;
}

/**
 * Optional IR illuminator telemetry surfaced through source-status updates.
 */
export interface StereoFrameSourceIrIlluminatorTelemetrySnapshot
  extends IrIlluminatorCapabilitySnapshot {}

/**
 * Compact retry/error history entry surfaced by camera-oriented sources.
 */
export interface StereoFrameSourceCaptureEventSnapshot {
  readonly timestampMs: number;
  readonly eventType: "retrying" | "recovered" | "terminal_failure";
  readonly retryAttempt?: number;
  readonly eye?: StereoEye;
  readonly summary: string;
}

/**
 * Snapshot of a frame source's current health and activity.
 */
export interface StereoFrameSourceStatusSnapshot {
  readonly state: StereoFrameSourceState;
  readonly info: StereoFrameSourceInfo;
  readonly lastFrameId?: number;
  readonly lastTimestampMs?: number;
  readonly lastError?: string;
  readonly statusText?: string;
  readonly telemetryUpdatedAtMs?: number;
  readonly telemetryReceivedAtMs?: number;
  readonly cameraTelemetry?: StereoFrameSourceCameraTelemetrySnapshot;
  readonly thermalTelemetry?: StereoFrameSourceThermalTelemetrySnapshot;
  readonly irIlluminatorTelemetry?: StereoFrameSourceIrIlluminatorTelemetrySnapshot;
}

/**
 * Listener invoked for every stereo frame emitted by a source.
 */
export type StereoFrameListener = (frame: StereoFrame) => void;

/**
 * Listener invoked whenever a source's health or lifecycle status changes.
 */
export type StereoFrameSourceStatusListener = (
  status: StereoFrameSourceStatusSnapshot,
) => void;

/**
 * Transport-agnostic seam for future live stereo frame input.
 *
 * The viewer surface depends on this boundary rather than on any particular
 * networking or media transport implementation.
 */
export interface StereoFrameSource {
  readonly info: StereoFrameSourceInfo;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribeFrame(listener: StereoFrameListener): Unsubscribe;
  subscribeStatus(listener: StereoFrameSourceStatusListener): Unsubscribe;
  getStatus(): StereoFrameSourceStatusSnapshot;
}
