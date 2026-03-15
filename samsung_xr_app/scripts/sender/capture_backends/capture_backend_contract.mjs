export const SUPPORTED_CAPTURE_BACKEND_TYPES = [
  "placeholder",
  "simulated",
  "replay",
  "opencv",
  "gstreamer",
  "jetson",
];

export const CAPTURE_BACKEND_STATES = [
  "idle",
  "starting",
  "running",
  "stopped",
  "unavailable",
  "not_implemented",
  "error",
];

/**
 * Creates a normalized sender capture-backend status snapshot.
 *
 * @param {object} options
 * @param {"placeholder"|"simulated"|"replay"|"opencv"|"gstreamer"|"jetson"} options.backendType
 * @param {string} options.backendDisplayName
 * @param {"idle"|"starting"|"running"|"stopped"|"unavailable"|"not_implemented"|"error"} [options.state]
 * @param {string} [options.detailText]
 * @param {number} [options.lastCaptureTimestampMs]
 * @param {string} [options.lastError]
 * @returns {{
 *   backendType: "placeholder"|"simulated"|"replay"|"opencv"|"gstreamer"|"jetson",
 *   backendDisplayName: string,
 *   state: "idle"|"starting"|"running"|"stopped"|"unavailable"|"not_implemented"|"error",
 *   detailText?: string,
 *   lastCaptureTimestampMs?: number,
 *   lastError?: string
 * }}
 */
export function createCaptureBackendStatus(options) {
  return {
    backendType: options.backendType,
    backendDisplayName: options.backendDisplayName,
    state: options.state ?? "idle",
    detailText: options.detailText,
    lastCaptureTimestampMs: options.lastCaptureTimestampMs,
    lastError: options.lastError,
  };
}

/**
 * Runtime assertion for sender capture backends.
 *
 * @param {unknown} backend
 * @returns {asserts backend is {
 *   start: () => Promise<void>,
 *   stop: () => Promise<void>,
 *   getStatus: () => ReturnType<typeof createCaptureBackendStatus>,
 *   captureStereoPair: () => Promise<{
 *     timestampMs: number,
 *     left: object,
 *     right: object
 *   }>
 * }}
 */
export function assertCaptureBackend(backend) {
  if (
    !backend ||
    typeof backend !== "object" ||
    typeof backend.start !== "function" ||
    typeof backend.stop !== "function" ||
    typeof backend.getStatus !== "function" ||
    typeof backend.captureStereoPair !== "function"
  ) {
    throw new Error("Invalid stereo capture backend contract.");
  }
}
