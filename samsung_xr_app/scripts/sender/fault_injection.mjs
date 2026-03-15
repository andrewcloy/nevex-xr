export const SUPPORTED_FAULT_INJECTION_MODES = [
  "transient",
  "terminal",
  "timeout",
];

export const RECENT_CAPTURE_EVENT_LIMIT = 5;
export const DEFAULT_FAULT_INJECT_FAILURE_COUNT = 1;
export const DEFAULT_FAULT_INJECT_HEARTBEAT_DROP_AFTER_MS = 3000;

/**
 * Appends one capture issue event to the rolling history.
 *
 * @param {readonly object[] | undefined} history
 * @param {object} event
 * @param {number} [limit]
 * @returns {readonly object[]}
 */
export function appendRecentCaptureEvent(history, event, limit = RECENT_CAPTURE_EVENT_LIMIT) {
  return [...(history ?? []), event].slice(-limit);
}

/**
 * Determines whether a logical capture should activate fault injection.
 *
 * @param {object} config
 * @param {number} captureIndex
 * @returns {boolean}
 */
export function shouldTriggerCaptureFaultInjection(config, captureIndex) {
  const everyNCaptures = normalizeNonNegativeInteger(
    config.faultInjectEveryNCaptures,
    0,
  );
  const startAfterCaptures = normalizeNonNegativeInteger(
    config.faultInjectStartAfterCaptures,
    0,
  );

  if (everyNCaptures <= 0 || captureIndex <= startAfterCaptures) {
    return false;
  }

  return (captureIndex - startAfterCaptures - 1) % everyNCaptures === 0;
}

/**
 * Resolves how many synthetic failures should be injected for one capture.
 *
 * Terminal mode guarantees retry exhaustion by forcing one more failure than the
 * configured retry budget when needed.
 *
 * @param {object} config
 * @param {number} retryBudget
 * @returns {number}
 */
export function resolveCaptureFaultFailureCount(config, retryBudget) {
  const requestedCount = Math.max(
    1,
    normalizeNonNegativeInteger(
      config.faultInjectFailureCount,
      DEFAULT_FAULT_INJECT_FAILURE_COUNT,
    ),
  );

  if (config.faultInjectMode === "terminal") {
    return Math.max(requestedCount, Math.max(0, retryBudget) + 1);
  }

  return requestedCount;
}

/**
 * Creates a synthetic capture error used by the dev-only fault injector.
 *
 * @param {object} options
 * @param {"transient"|"terminal"|"timeout"} options.mode
 * @param {"left"|"right"} options.eyeLabel
 * @param {number} options.captureIndex
 * @param {number} options.retryAttempt
 * @returns {Error & Record<string, unknown>}
 */
export function createFaultInjectedCaptureError(options) {
  if (options.mode === "timeout") {
    return createFaultInjectedError(
      `Injected timeout fault for ${options.eyeLabel} eye on capture ${options.captureIndex} retry ${options.retryAttempt}.`,
      {
        captureErrorKind: "timeout",
        processErrorKind: "timeout",
        stderrText: "fault injection timeout",
        captureEyeLabel: options.eyeLabel,
        faultInjectionMode: options.mode,
      },
    );
  }

  if (options.mode === "terminal") {
    return createFaultInjectedError(
      `Injected terminal fault for ${options.eyeLabel} eye on capture ${options.captureIndex} retry ${options.retryAttempt}.`,
      {
        captureErrorKind: "process_failure",
        processErrorKind: "process_failure",
        stderrText: "fault injection terminal failure",
        captureEyeLabel: options.eyeLabel,
        faultInjectionMode: options.mode,
      },
    );
  }

  return createFaultInjectedError(
    `Injected transient fault for ${options.eyeLabel} eye on capture ${options.captureIndex} retry ${options.retryAttempt}.`,
    {
      captureErrorKind: "process_failure",
      processErrorKind: "process_failure",
      stderrText: "fault injection transient failure",
      captureEyeLabel: options.eyeLabel,
      faultInjectionMode: options.mode,
    },
  );
}

/**
 * Determines whether source_status heartbeats should be suppressed.
 *
 * @param {object} options
 * @param {boolean} options.enabled
 * @param {number} options.connectionStartedAtMs
 * @param {number} options.nowMs
 * @param {number} options.dropAfterMs
 * @returns {boolean}
 */
export function shouldDropHeartbeat(options) {
  if (!options.enabled) {
    return false;
  }

  return options.nowMs - options.connectionStartedAtMs >= options.dropAfterMs;
}

/**
 * Produces a compact display string for one recent capture event.
 *
 * @param {object} event
 * @returns {string}
 */
export function formatRecentCaptureEvent(event) {
  const parts = [
    new Date(event.timestampMs).toLocaleTimeString(),
    event.eventType,
    event.retryAttempt ? `r${event.retryAttempt}` : undefined,
    event.eye ? event.eye : undefined,
    event.summary,
  ];

  return parts
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}

/**
 * Chooses which eye label a synthetic capture fault should target.
 *
 * The injector alternates eyes across captures so the UI history does not look
 * suspiciously one-sided during bring-up rehearsals.
 *
 * @param {number} captureIndex
 * @returns {"left"|"right"}
 */
export function resolveFaultInjectionEyeLabel(captureIndex) {
  return captureIndex % 2 === 0 ? "right" : "left";
}

/**
 * Shortens a capture error into a diagnostics-friendly summary.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function summarizeCaptureIssue(value) {
  const message = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (message.length <= 96) {
    return message;
  }

  return `${message.slice(0, 93)}...`;
}

function createFaultInjectedError(message, details) {
  return Object.assign(new Error(message), {
    isFaultInjected: true,
    ...details,
  });
}

function normalizeNonNegativeInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackValue;
  }

  return Math.round(parsed);
}
