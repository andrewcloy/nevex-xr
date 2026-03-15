import path from "node:path";

export const DEFAULT_REPLAY_TIME_SCALE = 1;
export const DEFAULT_REPLAY_PREVIEW_ENTRY_COUNT = 5;
export const SUSPICIOUS_REPLAY_DELAY_THRESHOLD_MS = 5000;

export function resolveFixedReplayDelayMs(fps) {
  const normalizedFps =
    typeof fps === "number" && Number.isFinite(fps) && fps > 0 ? fps : 1;
  return Math.max(1, Math.round(1000 / normalizedFps));
}

export function resolveReplayNominalDelayDescriptor(options) {
  const fixedDelayMs = resolveFixedReplayDelayMs(options.fixedFps);
  const currentEntry = options.entries[options.currentIndex];
  if (!currentEntry) {
    return {
      delayMs: fixedDelayMs,
      delaySource: "fixed_cadence",
      fixedDelayMs,
      scaledDelayMs: scaleReplayDelayMs(
        fixedDelayMs,
        options.timeScale,
        options.timingMode,
      ),
    };
  }

  if (options.timingMode !== "recorded") {
    return {
      delayMs: fixedDelayMs,
      delaySource: "fixed_cadence",
      fixedDelayMs,
      scaledDelayMs: fixedDelayMs,
    };
  }

  if (typeof currentEntry.delayUntilNextMs === "number") {
    return {
      delayMs: currentEntry.delayUntilNextMs,
      delaySource: "explicit_delay",
      fixedDelayMs,
      scaledDelayMs: scaleReplayDelayMs(
        currentEntry.delayUntilNextMs,
        options.timeScale,
        options.timingMode,
      ),
    };
  }

  const nextEntry = resolveNextReplayEntry(
    options.entries,
    options.currentIndex,
    options.loopEnabled,
  );
  if (
    nextEntry &&
    typeof currentEntry.recordedTimestampMs === "number" &&
    typeof nextEntry.recordedTimestampMs === "number" &&
    nextEntry.recordedTimestampMs >= currentEntry.recordedTimestampMs
  ) {
    const timestampDeltaMs = Math.max(
      0,
      nextEntry.recordedTimestampMs - currentEntry.recordedTimestampMs,
    );
    return {
      delayMs: timestampDeltaMs,
      delaySource: "timestamp_delta",
      fixedDelayMs,
      scaledDelayMs: scaleReplayDelayMs(
        timestampDeltaMs,
        options.timeScale,
        options.timingMode,
      ),
    };
  }

  return {
    delayMs: fixedDelayMs,
    delaySource:
      options.loopEnabled && options.timingMode === "recorded"
        ? "fixed_cadence_wrap_fallback"
        : "fixed_cadence",
    fixedDelayMs,
    scaledDelayMs: scaleReplayDelayMs(
      fixedDelayMs,
      options.timeScale,
      options.timingMode,
    ),
  };
}

export function scaleReplayDelayMs(delayMs, timeScale, timingMode) {
  const normalizedDelayMs =
    typeof delayMs === "number" && Number.isFinite(delayMs) && delayMs >= 0
      ? delayMs
      : 0;
  const normalizedScale = normalizeReplayTimeScale(timeScale);
  if (timingMode !== "recorded") {
    return normalizedDelayMs;
  }

  return roundReplayDurationMs(normalizedDelayMs / normalizedScale);
}

export function normalizeReplayTimeScale(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REPLAY_TIME_SCALE;
  }

  return parsed;
}

export function createReplayTimingSummary(options) {
  const entryCount = Array.isArray(options.entries) ? options.entries.length : 0;
  const timeScale = normalizeReplayTimeScale(options.timeScale);
  const descriptors = [];

  for (let index = 0; index < entryCount; index += 1) {
    const descriptor = resolveReplayNominalDelayDescriptor({
      entries: options.entries,
      currentIndex: index,
      loopEnabled: options.loopEnabled,
      timingMode: options.timingMode,
      fixedFps: options.fixedFps,
      timeScale,
    });
    const entry = options.entries[index];
    descriptors.push({
      index,
      frameId: entry.frameId,
      label: entry.label,
      recordedTimestampMs: entry.recordedTimestampMs,
      nominalDelayUntilNextMs: descriptor.delayMs,
      scaledDelayUntilNextMs: descriptor.scaledDelayMs,
      delaySource: descriptor.delaySource,
      leftFileName: path.basename(entry.leftFilePath),
      rightFileName: path.basename(entry.rightFilePath),
    });
  }

  const nominalDelays = descriptors.map((descriptor) => {
    return descriptor.nominalDelayUntilNextMs;
  });
  const scaledDelays = descriptors.map((descriptor) => {
    return descriptor.scaledDelayUntilNextMs;
  });
  const nominalLoopDurationMs = roundReplayDurationMs(sumDurations(nominalDelays));
  const scaledLoopDurationMs = roundReplayDurationMs(sumDurations(scaledDelays));
  const wrapDescriptor =
    descriptors.length > 0 ? descriptors[descriptors.length - 1] : undefined;

  return {
    entryCount,
    timingMode: options.timingMode,
    timeScale,
    previewEntries: descriptors.slice(
      0,
      Math.max(
        1,
        Math.round(options.previewCount ?? DEFAULT_REPLAY_PREVIEW_ENTRY_COUNT),
      ),
    ),
    minNominalDelayMs: descriptors.length > 0 ? Math.min(...nominalDelays) : 0,
    maxNominalDelayMs: descriptors.length > 0 ? Math.max(...nominalDelays) : 0,
    averageNominalDelayMs:
      descriptors.length > 0
        ? roundReplayDurationMs(nominalLoopDurationMs / descriptors.length)
        : 0,
    minScaledDelayMs: descriptors.length > 0 ? Math.min(...scaledDelays) : 0,
    maxScaledDelayMs: descriptors.length > 0 ? Math.max(...scaledDelays) : 0,
    averageScaledDelayMs:
      descriptors.length > 0
        ? roundReplayDurationMs(scaledLoopDurationMs / descriptors.length)
        : 0,
    nominalLoopDurationMs,
    scaledLoopDurationMs,
    wrapBehavior: describeReplayWrapBehavior(
      wrapDescriptor?.delaySource,
      options.loopEnabled,
    ),
    wrapDelayNominalMs: wrapDescriptor?.nominalDelayUntilNextMs ?? 0,
    wrapDelayScaledMs: wrapDescriptor?.scaledDelayUntilNextMs ?? 0,
    zeroDelayCount: descriptors.filter((descriptor) => {
      return descriptor.nominalDelayUntilNextMs === 0;
    }).length,
    suspiciousGapCount: descriptors.filter((descriptor) => {
      return (
        descriptor.nominalDelayUntilNextMs >=
        SUSPICIOUS_REPLAY_DELAY_THRESHOLD_MS
      );
    }).length,
  };
}

function describeReplayWrapBehavior(delaySource, loopEnabled) {
  if (!loopEnabled) {
    return "hold_final_frame_at_last_cadence";
  }

  if (delaySource === "explicit_delay") {
    return "loop_to_first_with_explicit_delay";
  }

  if (delaySource === "timestamp_delta") {
    return "loop_to_first_with_recorded_timestamp_delta";
  }

  if (delaySource === "fixed_cadence_wrap_fallback") {
    return "loop_to_first_with_fixed_cadence_fallback";
  }

  return "loop_to_first_with_fixed_cadence";
}

function resolveNextReplayEntry(entries, currentIndex, loopEnabled) {
  if (currentIndex + 1 < entries.length) {
    return entries[currentIndex + 1];
  }

  if (loopEnabled && entries.length > 0) {
    return entries[0];
  }

  return undefined;
}

function sumDurations(values) {
  return values.reduce((sum, value) => {
    return sum + value;
  }, 0);
}

function roundReplayDurationMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(3));
}
