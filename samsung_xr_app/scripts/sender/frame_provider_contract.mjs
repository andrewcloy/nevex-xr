export const SUPPORTED_FRAME_PROVIDER_TYPES = [
  "still",
  "generated",
  "sequence",
  "camera",
];

export const FRAME_PROVIDER_STATES = [
  "idle",
  "starting",
  "running",
  "stopped",
  "error",
];

export const DEFAULT_FRAME_DIMENSIONS = {
  width: 1920,
  height: 1080,
};

/**
 * Creates a normalized sender frame-provider status snapshot.
 *
 * @param {object} options
 * @param {"still"|"generated"|"sequence"|"camera"} options.providerType
 * @param {string} options.providerDisplayName
 * @param {"idle"|"starting"|"running"|"stopped"|"error"} [options.state]
 * @param {string} [options.detailText]
 * @param {number} [options.lastFrameIndex]
 * @param {number} [options.lastFrameTimestampMs]
 * @param {string} [options.lastError]
 * @param {string} [options.backendType]
 * @param {string} [options.backendDisplayName]
 * @param {string} [options.backendState]
 * @param {number} [options.lastCaptureTimestampMs]
 * @param {string} [options.lastCaptureError]
 * @param {string} [options.leftDevice]
 * @param {string} [options.rightDevice]
 * @param {number} [options.capturesAttempted]
 * @param {number} [options.capturesSucceeded]
 * @param {number} [options.capturesFailed]
 * @param {number} [options.lastSuccessfulCaptureTime]
 * @param {number} [options.lastCaptureDurationMs]
 * @param {number} [options.averageCaptureDurationMs]
 * @param {number} [options.effectiveFrameIntervalMs]
 * @param {number} [options.consecutiveFailureCount]
 * @param {boolean} [options.startupValidated]
 * @param {string|null} [options.gstLaunchPath]
 * @param {"idle"|"healthy"|"retrying"|"recovered"|"terminal_failure"} [options.captureHealthState]
 * @param {number} [options.captureRetryCount]
 * @param {number} [options.captureRetryDelayMs]
 * @param {number} [options.recentRetryAttempts]
 * @param {number} [options.currentRetryAttempt]
 * @param {number} [options.transientFailureCount]
 * @param {number} [options.recoveryCount]
 * @param {number} [options.lastRecoveryTime]
 * @param {number} [options.lastTerminalFailureTime]
 * @param {number} [options.telemetryUpdatedAtMs]
 * @param {string} [options.replaySourceIdentity]
 * @param {boolean} [options.replayLoopEnabled]
 * @param {number} [options.replayCurrentIndex]
 * @param {number} [options.replayFrameCount]
 * @param {string} [options.replayLeftSource]
 * @param {string} [options.replayRightSource]
 * @param {"fixed"|"recorded"} [options.replayTimingMode]
 * @param {number} [options.replayTimeScale]
 * @param {boolean} [options.replayManifestLoaded]
 * @param {boolean} [options.replayManifestValidated]
 * @param {number} [options.replayManifestErrorCount]
 * @param {number} [options.replayManifestWarningCount]
 * @param {string} [options.replayManifestSource]
 * @param {string} [options.replayValidationSummary]
 * @param {number} [options.replayRecordedTimestamp]
 * @param {number} [options.replayDelayUntilNextMs]
 * @param {number} [options.replayScaledDelayUntilNextMs]
 * @param {number} [options.replayTimingOffsetMs]
 * @param {number} [options.replayNominalLoopDurationMs]
 * @param {number} [options.replayScaledLoopDurationMs]
 * @param {readonly {
 *   timestampMs: number,
 *   eventType: "retrying"|"recovered"|"terminal_failure",
 *   retryAttempt?: number,
 *   eye?: "left"|"right",
 *   summary: string
 * }[]} [options.recentCaptureEvents]
 * @returns {{
 *   providerType: "still"|"generated"|"sequence"|"camera",
 *   providerDisplayName: string,
 *   state: "idle"|"starting"|"running"|"stopped"|"error",
 *   detailText?: string,
 *   lastFrameIndex?: number,
 *   lastFrameTimestampMs?: number,
 *   lastError?: string,
 *   backendType?: string,
 *   backendDisplayName?: string,
 *   backendState?: string,
 *   lastCaptureTimestampMs?: number,
 *   lastCaptureError?: string,
 *   leftDevice?: string,
 *   rightDevice?: string,
 *   capturesAttempted?: number,
 *   capturesSucceeded?: number,
 *   capturesFailed?: number,
 *   lastSuccessfulCaptureTime?: number,
 *   lastCaptureDurationMs?: number,
 *   averageCaptureDurationMs?: number,
 *   effectiveFrameIntervalMs?: number,
 *   consecutiveFailureCount?: number,
 *   startupValidated?: boolean,
 *   gstLaunchPath?: string | null,
 *   captureHealthState?: "idle"|"healthy"|"retrying"|"recovered"|"terminal_failure",
 *   captureRetryCount?: number,
 *   captureRetryDelayMs?: number,
 *   recentRetryAttempts?: number,
 *   currentRetryAttempt?: number,
 *   transientFailureCount?: number,
 *   recoveryCount?: number,
 *   lastRecoveryTime?: number,
 *   lastTerminalFailureTime?: number,
 *   telemetryUpdatedAtMs?: number,
 *   replaySourceIdentity?: string,
 *   replayLoopEnabled?: boolean,
 *   replayCurrentIndex?: number,
 *   replayFrameCount?: number,
 *   replayLeftSource?: string,
 *   replayRightSource?: string,
 *   replayTimingMode?: "fixed"|"recorded",
 *   replayTimeScale?: number,
 *   replayManifestLoaded?: boolean,
 *   replayManifestValidated?: boolean,
 *   replayManifestErrorCount?: number,
 *   replayManifestWarningCount?: number,
 *   replayManifestSource?: string,
 *   replayValidationSummary?: string,
 *   replayRecordedTimestamp?: number,
 *   replayDelayUntilNextMs?: number,
 *   replayScaledDelayUntilNextMs?: number,
 *   replayTimingOffsetMs?: number,
 *   replayNominalLoopDurationMs?: number,
 *   replayScaledLoopDurationMs?: number,
 *   recentCaptureEvents?: readonly {
 *     timestampMs: number,
 *     eventType: "retrying"|"recovered"|"terminal_failure",
 *     retryAttempt?: number,
 *     eye?: "left"|"right",
 *     summary: string
 *   }[]
 * }}
 */
export function createFrameProviderStatus(options) {
  return {
    providerType: options.providerType,
    providerDisplayName: options.providerDisplayName,
    state: options.state ?? "idle",
    detailText: options.detailText,
    lastFrameIndex: options.lastFrameIndex,
    lastFrameTimestampMs: options.lastFrameTimestampMs,
    lastError: options.lastError,
    backendType: options.backendType,
    backendDisplayName: options.backendDisplayName,
    backendState: options.backendState,
    lastCaptureTimestampMs: options.lastCaptureTimestampMs,
    lastCaptureError: options.lastCaptureError,
    leftDevice: options.leftDevice,
    rightDevice: options.rightDevice,
    capturesAttempted: options.capturesAttempted,
    capturesSucceeded: options.capturesSucceeded,
    capturesFailed: options.capturesFailed,
    lastSuccessfulCaptureTime: options.lastSuccessfulCaptureTime,
    lastCaptureDurationMs: options.lastCaptureDurationMs,
    averageCaptureDurationMs: options.averageCaptureDurationMs,
    effectiveFrameIntervalMs: options.effectiveFrameIntervalMs,
    consecutiveFailureCount: options.consecutiveFailureCount,
    startupValidated: options.startupValidated,
    gstLaunchPath: options.gstLaunchPath,
    captureHealthState: options.captureHealthState,
    captureRetryCount: options.captureRetryCount,
    captureRetryDelayMs: options.captureRetryDelayMs,
    recentRetryAttempts: options.recentRetryAttempts,
    currentRetryAttempt: options.currentRetryAttempt,
    transientFailureCount: options.transientFailureCount,
    recoveryCount: options.recoveryCount,
    lastRecoveryTime: options.lastRecoveryTime,
    lastTerminalFailureTime: options.lastTerminalFailureTime,
    telemetryUpdatedAtMs: options.telemetryUpdatedAtMs,
    replaySourceIdentity: options.replaySourceIdentity,
    replayLoopEnabled: options.replayLoopEnabled,
    replayCurrentIndex: options.replayCurrentIndex,
    replayFrameCount: options.replayFrameCount,
    replayLeftSource: options.replayLeftSource,
    replayRightSource: options.replayRightSource,
    replayTimingMode: options.replayTimingMode,
    replayTimeScale: options.replayTimeScale,
    replayManifestLoaded: options.replayManifestLoaded,
    replayManifestValidated: options.replayManifestValidated,
    replayManifestErrorCount: options.replayManifestErrorCount,
    replayManifestWarningCount: options.replayManifestWarningCount,
    replayManifestSource: options.replayManifestSource,
    replayValidationSummary: options.replayValidationSummary,
    replayRecordedTimestamp: options.replayRecordedTimestamp,
    replayDelayUntilNextMs: options.replayDelayUntilNextMs,
    replayScaledDelayUntilNextMs: options.replayScaledDelayUntilNextMs,
    replayTimingOffsetMs: options.replayTimingOffsetMs,
    replayNominalLoopDurationMs: options.replayNominalLoopDurationMs,
    replayScaledLoopDurationMs: options.replayScaledLoopDurationMs,
    recentCaptureEvents: options.recentCaptureEvents,
  };
}

/**
 * Runtime assertion for sender-side frame providers.
 *
 * @param {unknown} provider
 * @returns {asserts provider is {
 *   start: () => Promise<void>,
 *   stop: () => Promise<void>,
 *   getStatus: () => ReturnType<typeof createFrameProviderStatus>,
 *   getNextStereoFrame: () => Promise<{
 *     frameIndex: number,
 *     timestampMs: number,
 *     left: object,
 *     right: object
 *   }>
 * }}
 */
export function assertFrameProvider(provider) {
  if (
    !provider ||
    typeof provider !== "object" ||
    typeof provider.start !== "function" ||
    typeof provider.stop !== "function" ||
    typeof provider.getStatus !== "function" ||
    typeof provider.getNextStereoFrame !== "function"
  ) {
    throw new Error("Invalid sender frame provider contract.");
  }
}
