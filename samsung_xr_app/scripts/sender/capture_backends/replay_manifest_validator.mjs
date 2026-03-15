import fs from "node:fs/promises";
import path from "node:path";
import {
  SUPPORTED_IMAGE_EXTENSIONS,
  listSupportedImageFiles,
} from "../frame_provider_support.mjs";
import {
  DEFAULT_REPLAY_PREVIEW_ENTRY_COUNT,
  createReplayTimingSummary,
  normalizeReplayTimeScale,
} from "./replay_timing_support.mjs";

export async function validateReplayCaptureInputs(options) {
  const normalizedOptions = normalizeReplayValidationOptions(options);
  const previewLeftSource = createReplaySourcePreview(
    normalizedOptions.leftReplayFiles,
    normalizedOptions.leftReplayDir,
    "left",
  );
  const previewRightSource = createReplaySourcePreview(
    normalizedOptions.rightReplayFiles,
    normalizedOptions.rightReplayDir,
    "right",
  );
  const previewIdentity = normalizedOptions.replayManifestPath
    ? createManifestSourceIdentityPreview(normalizedOptions.replayManifestPath)
    : createReplaySourceIdentity(previewLeftSource, previewRightSource);

  const results = [];
  const manifestPath = normalizedOptions.replayManifestPath
    ? path.resolve(normalizedOptions.replayManifestPath)
    : undefined;

  if (manifestPath) {
    return validateManifestOrFallback(normalizedOptions, {
      results,
      manifestPath,
      previewLeftSource,
      previewRightSource,
      previewIdentity,
    });
  }

  if (normalizedOptions.replayFpsMode === "recorded") {
    results.push(
      createReplayValidationResult(
        "fail",
        "replay-timing:mode",
        "Recorded replay timing requires --replay-manifest with timestampMs metadata for each replay entry.",
      ),
    );
    return finalizeReplayValidation({
      results,
      entries: [],
      manifestLoaded: false,
      manifestValidated: false,
      manifestSource: "not_configured",
      leftSource: previewLeftSource,
      rightSource: previewRightSource,
      sourceIdentity: previewIdentity,
      replayTimeScale: normalizedOptions.replayTimeScale,
      timingMode: normalizedOptions.replayFpsMode,
    });
  }

  results.push(
    createReplayValidationResult(
      "pass",
      "replay-manifest:source",
      "No replay manifest configured; validating directory/file-list replay inputs.",
    ),
  );
  return validateReplayPairingInputs(normalizedOptions, {
    results,
    manifestPath: undefined,
    manifestSource: "not_configured",
    fallbackReason: undefined,
    previewLeftSource,
    previewRightSource,
    previewIdentity,
  });
}

async function validateManifestOrFallback(options, context) {
  const manifestRead = await readReplayManifestText(context.manifestPath);
  if (manifestRead.status === "missing") {
    if (options.replayFpsMode === "fixed") {
      context.results.push(
        createReplayValidationResult(
          "warn",
          "replay-manifest:file",
          `Replay manifest ${context.manifestPath} was not found; fixed timing mode will fall back to directory/file-list pairing.`,
        ),
      );
      return validateReplayPairingInputs(options, {
        ...context,
        manifestSource: context.manifestPath,
        fallbackReason: "missing_manifest",
      });
    }

    context.results.push(
      createReplayValidationResult(
        "fail",
        "replay-manifest:file",
        `Replay manifest ${context.manifestPath} was not found, and recorded timing mode requires a valid manifest.`,
      ),
    );
    return finalizeReplayValidation({
      results: context.results,
      entries: [],
      manifestLoaded: false,
      manifestValidated: false,
      manifestSource: context.manifestPath,
      leftSource: context.previewLeftSource,
      rightSource: context.previewRightSource,
      sourceIdentity: context.previewIdentity,
      replayTimeScale: options.replayTimeScale,
      timingMode: options.replayFpsMode,
    });
  }

  if (manifestRead.status === "error") {
    context.results.push(
      createReplayValidationResult(
        "fail",
        "replay-manifest:file",
        manifestRead.message,
      ),
    );
    return finalizeReplayValidation({
      results: context.results,
      entries: [],
      manifestLoaded: false,
      manifestValidated: false,
      manifestSource: context.manifestPath,
      leftSource: context.previewLeftSource,
      rightSource: context.previewRightSource,
      sourceIdentity: context.previewIdentity,
      replayTimeScale: options.replayTimeScale,
      timingMode: options.replayFpsMode,
    });
  }

  context.results.push(
    createReplayValidationResult(
      "pass",
      "replay-manifest:file",
      `Replay manifest ${context.manifestPath} was found.`,
    ),
  );

  let parsedManifest;
  try {
    parsedManifest = JSON.parse(manifestRead.text);
  } catch (error) {
    context.results.push(
      createReplayValidationResult(
        "fail",
        "replay-manifest:json",
        `Replay manifest ${context.manifestPath} is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    return finalizeReplayValidation({
      results: context.results,
      entries: [],
      manifestLoaded: false,
      manifestValidated: false,
      manifestSource: context.manifestPath,
      leftSource: context.previewLeftSource,
      rightSource: context.previewRightSource,
      sourceIdentity: context.previewIdentity,
      replayTimeScale: options.replayTimeScale,
      timingMode: options.replayFpsMode,
    });
  }

  if (!parsedManifest || typeof parsedManifest !== "object" || Array.isArray(parsedManifest)) {
    context.results.push(
      createReplayValidationResult(
        "fail",
        "replay-manifest:root",
        `Replay manifest ${context.manifestPath} must be a JSON object.`,
      ),
    );
    return finalizeReplayValidation({
      results: context.results,
      entries: [],
      manifestLoaded: false,
      manifestValidated: false,
      manifestSource: context.manifestPath,
      leftSource: context.previewLeftSource,
      rightSource: context.previewRightSource,
      sourceIdentity: context.previewIdentity,
      replayTimeScale: options.replayTimeScale,
      timingMode: options.replayFpsMode,
    });
  }

  const manifestRecord = parsedManifest;
  validateManifestVersion(manifestRecord.version, context.results);
  const manifestBaseDir = validateManifestBaseDir(
    manifestRecord.baseDir,
    context.manifestPath,
    context.results,
  );
  const manifestEntries = validateManifestEntriesRoot(
    manifestRecord.entries,
    context.manifestPath,
    context.results,
  );

  if (hasValidationFailures(context.results)) {
    return finalizeReplayValidation({
      results: context.results,
      entries: [],
      manifestLoaded: false,
      manifestValidated: false,
      manifestSource: context.manifestPath,
      leftSource: context.previewLeftSource,
      rightSource: context.previewRightSource,
      sourceIdentity: context.previewIdentity,
      replayTimeScale: options.replayTimeScale,
      timingMode: options.replayFpsMode,
    });
  }

  const resolvedEntries = [];
  for (let index = 0; index < manifestEntries.length; index += 1) {
    const resolvedEntry = await validateManifestEntry(
      manifestEntries[index],
      index,
      context.manifestPath,
      manifestBaseDir,
      options.replayFpsMode,
      context.results,
    );
    if (resolvedEntry) {
      resolvedEntries.push(resolvedEntry);
    }
  }

  validateRecordedTimingShape(resolvedEntries, options, context.results);

  if (options.replayFpsMode === "fixed") {
    context.results.push(
      createReplayValidationResult(
        "pass",
        "replay-timing:mode",
        "Fixed replay timing mode will use manifest pairing and metadata, but cadence will follow the sender's configured timing.",
      ),
    );
  } else {
    context.results.push(
      createReplayValidationResult(
        "pass",
        "replay-timing:mode",
        "Recorded replay timing metadata is present and valid.",
      ),
    );
  }

  if (hasValidationFailures(context.results)) {
    return finalizeReplayValidation({
      results: context.results,
      entries: [],
      manifestLoaded: false,
      manifestValidated: false,
      manifestSource: context.manifestPath,
      leftSource: context.previewLeftSource,
      rightSource: context.previewRightSource,
      sourceIdentity: context.previewIdentity,
      replayTimeScale: options.replayTimeScale,
      timingMode: options.replayFpsMode,
    });
  }

  context.results.push(
    createReplayValidationResult(
      "pass",
      "replay-manifest:entries",
      `Validated replay manifest with ${resolvedEntries.length} entr${
        resolvedEntries.length === 1 ? "y" : "ies"
      } and ${resolvedEntries.length * 2} referenced image assets.`,
    ),
  );

  const timingSummary = createReplayTimingSummary({
    entries: resolvedEntries,
    loopEnabled: options.replayLoop,
    timingMode: options.replayFpsMode,
    fixedFps: options.fps,
    timeScale: options.replayTimeScale,
    previewCount: options.replayPreviewCount,
  });
  appendReplayTimingValidationResults(context.results, timingSummary, options);

  const leftSource = createManifestEyeSource(resolvedEntries, "left");
  const rightSource = createManifestEyeSource(resolvedEntries, "right");
  return finalizeReplayValidation({
    results: context.results,
    entries: resolvedEntries,
    manifestLoaded: true,
    manifestValidated: true,
    manifestSource: context.manifestPath,
    leftSource,
    rightSource,
    sourceIdentity: createManifestSourceIdentity(
      context.manifestPath,
      resolvedEntries.length,
    ),
    replayTimeScale: options.replayTimeScale,
    timingSummary,
    timingMode: options.replayFpsMode,
  });
}

async function validateReplayPairingInputs(options, context) {
  const leftValidation = await resolveReplayInputFiles({
    replayFiles: options.leftReplayFiles,
    replayDir: options.leftReplayDir,
    eyeLabel: "left",
    results: context.results,
  });
  const rightValidation = await resolveReplayInputFiles({
    replayFiles: options.rightReplayFiles,
    replayDir: options.rightReplayDir,
    eyeLabel: "right",
    results: context.results,
  });

  if (leftValidation.files.length === 0 || rightValidation.files.length === 0) {
    context.results.push(
      createReplayValidationResult(
        "fail",
        "replay-pairs:count",
        "Replay camera backend requires non-empty left/right replay inputs when a manifest is not used.",
      ),
    );
  } else if (leftValidation.files.length !== rightValidation.files.length) {
    context.results.push(
      createReplayValidationResult(
        "fail",
        "replay-pairs:count",
        `Replay left/right input lengths must match (${leftValidation.files.length} !== ${rightValidation.files.length}).`,
      ),
    );
  } else {
    context.results.push(
      createReplayValidationResult(
        "pass",
        "replay-pairs:count",
        `Validated ${leftValidation.files.length} stereo replay pair${
          leftValidation.files.length === 1 ? "" : "s"
        } from directory/file-list inputs.`,
      ),
    );
  }

  const entries = hasValidationFailures(context.results)
    ? []
    : leftValidation.files.map((leftFilePath, index) => {
        return {
          leftFilePath,
          rightFilePath: rightValidation.files[index],
        };
      });

  const timingSummary =
    entries.length > 0
      ? createReplayTimingSummary({
          entries,
          loopEnabled: options.replayLoop,
          timingMode: options.replayFpsMode,
          fixedFps: options.fps,
          timeScale: options.replayTimeScale,
          previewCount: options.replayPreviewCount,
        })
      : undefined;
  if (timingSummary) {
    appendReplayTimingValidationResults(context.results, timingSummary, options);
  }

  return finalizeReplayValidation({
    results: context.results,
    entries,
    manifestLoaded: false,
    manifestValidated: false,
    manifestSource: context.manifestSource,
    leftSource: leftValidation.sourceText ?? context.previewLeftSource,
    rightSource: rightValidation.sourceText ?? context.previewRightSource,
    sourceIdentity: createReplaySourceIdentity(
      leftValidation.sourceText ?? context.previewLeftSource,
      rightValidation.sourceText ?? context.previewRightSource,
    ),
    fallbackReason: context.fallbackReason,
    replayTimeScale: options.replayTimeScale,
    timingSummary,
    timingMode: options.replayFpsMode,
  });
}

async function resolveReplayInputFiles(options) {
  const resolvedFiles = [];
  if (Array.isArray(options.replayFiles) && options.replayFiles.length > 0) {
    const explicitFiles = options.replayFiles.map((filePath) => {
      return path.resolve(filePath);
    });
    for (let index = 0; index < explicitFiles.length; index += 1) {
      const validation = await validateReplayAssetReference(
        explicitFiles[index],
        `replay-${options.eyeLabel}:files[${index}]`,
      );
      if (validation.status === "fail") {
        options.results.push(validation);
        continue;
      }
      resolvedFiles.push(explicitFiles[index]);
    }

    if (resolvedFiles.length > 0) {
      options.results.push(
        createReplayValidationResult(
          "pass",
          `replay-${options.eyeLabel}:source`,
          `Resolved ${resolvedFiles.length} ${options.eyeLabel}-eye replay file${
            resolvedFiles.length === 1 ? "" : "s"
          } from the explicit file list.`,
        ),
      );
    }
    return {
      files: resolvedFiles,
      sourceText: createFileListPreview(resolvedFiles, options.eyeLabel),
    };
  }

  if (typeof options.replayDir !== "string" || options.replayDir.trim().length === 0) {
    options.results.push(
      createReplayValidationResult(
        "fail",
        `replay-${options.eyeLabel}:source`,
        `Replay ${options.eyeLabel}-eye input is not configured.`,
      ),
    );
    return {
      files: [],
      sourceText: `${options.eyeLabel}:unconfigured`,
    };
  }

  const resolvedDirectory = path.resolve(options.replayDir);
  let directoryFiles;
  try {
    directoryFiles = await listSupportedImageFiles(resolvedDirectory);
  } catch (error) {
    options.results.push(
      createReplayValidationResult(
        "fail",
        `replay-${options.eyeLabel}:dir`,
        `Failed to read replay ${options.eyeLabel}-eye directory ${resolvedDirectory}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    return {
      files: [],
      sourceText: `dir:${resolvedDirectory}`,
    };
  }

  if (directoryFiles.length === 0) {
    options.results.push(
      createReplayValidationResult(
        "fail",
        `replay-${options.eyeLabel}:dir`,
        `Replay ${options.eyeLabel}-eye directory ${resolvedDirectory} does not contain any supported image files (${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}).`,
      ),
    );
    return {
      files: [],
      sourceText: `dir:${resolvedDirectory}`,
    };
  }

  options.results.push(
    createReplayValidationResult(
      "pass",
      `replay-${options.eyeLabel}:dir`,
      `Resolved ${directoryFiles.length} ${options.eyeLabel}-eye replay file${
        directoryFiles.length === 1 ? "" : "s"
      } from ${resolvedDirectory}.`,
    ),
  );
  return {
    files: directoryFiles,
    sourceText: createResolvedReplaySourceText(
      directoryFiles,
      undefined,
      resolvedDirectory,
      options.eyeLabel,
    ),
  };
}

async function validateManifestEntry(
  entry,
  index,
  manifestPath,
  manifestBaseDir,
  replayFpsMode,
  results,
) {
  const failureCountBeforeEntry = countValidationFailures(results);
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    results.push(
      createReplayValidationResult(
        "fail",
        `replay-manifest:entries[${index}]`,
        `Replay manifest ${manifestPath} entry ${index} must be an object.`,
      ),
    );
    return undefined;
  }

  const leftFile = readRequiredManifestString(
    entry.leftFile,
    `replay-manifest:entries[${index}].leftFile`,
    results,
  );
  const rightFile = readRequiredManifestString(
    entry.rightFile,
    `replay-manifest:entries[${index}].rightFile`,
    results,
  );

  let recordedTimestampMs = undefined;
  if (entry.timestampMs !== undefined && entry.timestamp !== undefined) {
    if (entry.timestampMs !== entry.timestamp) {
      results.push(
        createReplayValidationResult(
          "fail",
          `replay-manifest:entries[${index}].timestampMs`,
          `Replay manifest entry ${index} provides both timestampMs and timestamp with different values.`,
        ),
      );
    }
  }

  const timestampValue =
    entry.timestampMs !== undefined ? entry.timestampMs : entry.timestamp;
  if (timestampValue === undefined) {
    if (replayFpsMode === "recorded") {
      results.push(
        createReplayValidationResult(
          "fail",
          `replay-manifest:entries[${index}].timestampMs`,
          `Replay manifest entry ${index} must provide timestampMs when recorded timing mode is enabled.`,
        ),
      );
    }
  } else if (
    typeof timestampValue !== "number" ||
    !Number.isFinite(timestampValue) ||
    timestampValue < 0
  ) {
    results.push(
      createReplayValidationResult(
        "fail",
        `replay-manifest:entries[${index}].timestampMs`,
        `Replay manifest entry ${index} has an invalid timestampMs value.`,
      ),
    );
  } else {
    recordedTimestampMs = timestampValue;
  }

  const delayUntilNextMs = readOptionalNonNegativeNumber(
    entry.delayUntilNextMs,
    `replay-manifest:entries[${index}].delayUntilNextMs`,
    results,
  );
  const frameId = readOptionalNonNegativeInteger(
    entry.frameId,
    `replay-manifest:entries[${index}].frameId`,
    results,
  );
  const label = readOptionalString(entry.label, `replay-manifest:entries[${index}].label`, results);
  const notes = readOptionalString(entry.notes, `replay-manifest:entries[${index}].notes`, results);

  if (
    !leftFile ||
    !rightFile ||
    countValidationFailures(results) > failureCountBeforeEntry
  ) {
    return undefined;
  }

  const resolvedLeftFilePath = leftFile
    ? resolveReplayManifestFilePath(manifestBaseDir, leftFile)
    : undefined;
  const resolvedRightFilePath = rightFile
    ? resolveReplayManifestFilePath(manifestBaseDir, rightFile)
    : undefined;

  if (!resolvedLeftFilePath || !resolvedRightFilePath) {
    return undefined;
  }

  const leftValidation = await validateReplayAssetReference(
    resolvedLeftFilePath,
    `replay-manifest:entries[${index}].leftFile`,
  );
  if (leftValidation.status === "fail") {
    results.push(leftValidation);
  }
  const rightValidation = await validateReplayAssetReference(
    resolvedRightFilePath,
    `replay-manifest:entries[${index}].rightFile`,
  );
  if (rightValidation.status === "fail") {
    results.push(rightValidation);
  }

  if (leftValidation.status === "fail" || rightValidation.status === "fail") {
    return undefined;
  }

  return {
    leftFilePath: resolvedLeftFilePath,
    rightFilePath: resolvedRightFilePath,
    recordedTimestampMs,
    frameId,
    label,
    notes,
    delayUntilNextMs,
  };
}

function validateRecordedTimingShape(entries, options, results) {
  if (options.replayFpsMode !== "recorded") {
    return;
  }

  for (let index = 1; index < entries.length; index += 1) {
    const previousTimestampMs = entries[index - 1].recordedTimestampMs;
    const currentTimestampMs = entries[index].recordedTimestampMs;
    if (
      typeof previousTimestampMs === "number" &&
      typeof currentTimestampMs === "number" &&
      currentTimestampMs < previousTimestampMs
    ) {
      results.push(
        createReplayValidationResult(
          "fail",
          `replay-manifest:entries[${index}].timestampMs`,
          `Replay manifest entry ${index} timestampMs must not move backward relative to the previous entry when recorded timing mode is enabled.`,
        ),
      );
    }
  }

  if (
    options.replayLoop &&
    entries.length > 0 &&
    entries[entries.length - 1].delayUntilNextMs === undefined
  ) {
    results.push(
      createReplayValidationResult(
        "warn",
        "replay-timing:loop-wrap",
        "Recorded timing mode is enabled with replay looping, but the last manifest entry has no delayUntilNextMs. The sender will use fixed cadence for the wrap from the last entry back to the first.",
      ),
    );
  }
}

function appendReplayTimingValidationResults(results, timingSummary, options) {
  if (!timingSummary) {
    return;
  }

  if (options.replayFpsMode === "recorded") {
    results.push(
      createReplayValidationResult(
        "pass",
        "replay-time-scale",
        timingSummary.timeScale === 1
          ? "Recorded replay timing will run at 1.0x, using manifest cadence as-is."
          : `Recorded replay timing will run at ${timingSummary.timeScale}x. Values above 1.0 speed playback up by dividing delays; values below 1.0 slow playback down by multiplying delays.`,
      ),
    );
  } else if (timingSummary.timeScale !== 1) {
    results.push(
      createReplayValidationResult(
        "warn",
        "replay-time-scale",
        `Replay time scale ${timingSummary.timeScale}x is configured, but fixed timing mode ignores it and uses the sender FPS cadence instead.`,
      ),
    );
  } else {
    results.push(
      createReplayValidationResult(
        "pass",
        "replay-time-scale",
        "Replay time scale is 1.0x; fixed timing mode will use the sender FPS cadence.",
      ),
    );
  }

  results.push(
    createReplayValidationResult(
      "pass",
      "replay-timing:summary",
      `Replay timing summary: entries=${timingSummary.entryCount}, min/max/avg nominal delay=${timingSummary.minNominalDelayMs}/${timingSummary.maxNominalDelayMs}/${timingSummary.averageNominalDelayMs}ms, min/max/avg scaled delay=${timingSummary.minScaledDelayMs}/${timingSummary.maxScaledDelayMs}/${timingSummary.averageScaledDelayMs}ms, nominal loop=${timingSummary.nominalLoopDurationMs}ms, scaled loop=${timingSummary.scaledLoopDurationMs}ms, wrap=${timingSummary.wrapBehavior}.`,
    ),
  );

  if (timingSummary.zeroDelayCount > 0) {
    results.push(
      createReplayValidationResult(
        "warn",
        "replay-timing:zero-delay",
        `Replay timing contains ${timingSummary.zeroDelayCount} zero-delay entr${
          timingSummary.zeroDelayCount === 1 ? "y" : "ies"
        }; playback may advance frames immediately at those boundaries.`,
      ),
    );
  }

  if (timingSummary.suspiciousGapCount > 0) {
    results.push(
      createReplayValidationResult(
        "warn",
        "replay-timing:suspicious-gap",
        `Replay timing contains ${timingSummary.suspiciousGapCount} large gap${
          timingSummary.suspiciousGapCount === 1 ? "" : "s"
        } of at least 5000ms; inspect the manifest before streaming.`,
      ),
    );
  }
}

async function validateReplayAssetReference(filePath, key) {
  const resolvedPath = path.resolve(filePath);
  const extension = path.extname(resolvedPath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) {
    return createReplayValidationResult(
      "fail",
      key,
      `Replay asset ${resolvedPath} uses unsupported type ${extension || "(no extension)"}. Supported types: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}.`,
    );
  }

  try {
    const fileStat = await fs.stat(resolvedPath);
    if (!fileStat.isFile()) {
      return createReplayValidationResult(
        "fail",
        key,
        `Replay asset ${resolvedPath} is not a file.`,
      );
    }
  } catch (error) {
    return createReplayValidationResult(
      "fail",
      key,
      `Replay asset ${resolvedPath} does not exist or is not accessible: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return createReplayValidationResult(
    "pass",
    key,
    `Replay asset ${resolvedPath} is accessible.`,
  );
}

async function readReplayManifestText(manifestPath) {
  try {
    const text = await fs.readFile(manifestPath, "utf8");
    return {
      status: "ok",
      text,
    };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return {
        status: "missing",
      };
    }

    return {
      status: "error",
      message: `Failed to read replay manifest ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function validateManifestVersion(version, results) {
  if (version === undefined) {
    return;
  }

  if (
    typeof version !== "number" ||
    !Number.isFinite(version) ||
    !Number.isInteger(version) ||
    version <= 0
  ) {
    results.push(
      createReplayValidationResult(
        "fail",
        "replay-manifest:version",
        "Replay manifest version must be a positive integer when provided.",
      ),
    );
    return;
  }

  results.push(
    createReplayValidationResult(
      "pass",
      "replay-manifest:version",
      `Replay manifest version ${version} is valid.`,
    ),
  );
}

function validateManifestBaseDir(baseDir, manifestPath, results) {
  if (baseDir === undefined) {
    return path.dirname(manifestPath);
  }

  if (typeof baseDir !== "string" || baseDir.trim().length === 0) {
    results.push(
      createReplayValidationResult(
        "fail",
        "replay-manifest:baseDir",
        "Replay manifest baseDir must be a non-empty string when provided.",
      ),
    );
    return path.dirname(manifestPath);
  }

  return path.resolve(path.dirname(manifestPath), baseDir);
}

function validateManifestEntriesRoot(entries, manifestPath, results) {
  if (!Array.isArray(entries)) {
    results.push(
      createReplayValidationResult(
        "fail",
        "replay-manifest:entries",
        `Replay manifest ${manifestPath} must contain an "entries" array.`,
      ),
    );
    return [];
  }

  if (entries.length === 0) {
    results.push(
      createReplayValidationResult(
        "fail",
        "replay-manifest:entries",
        `Replay manifest ${manifestPath} must include at least one replay entry.`,
      ),
    );
    return [];
  }

  return entries;
}

function readRequiredManifestString(value, key, results) {
  if (typeof value !== "string" || value.trim().length === 0) {
    results.push(
      createReplayValidationResult(
        "fail",
        key,
        `${key} must be a non-empty string.`,
      ),
    );
    return undefined;
  }

  return value.trim();
}

function readOptionalString(value, key, results) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    results.push(
      createReplayValidationResult(
        "fail",
        key,
        `${key} must be a string when provided.`,
      ),
    );
    return undefined;
  }

  return value.trim();
}

function readOptionalNonNegativeNumber(value, key, results) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    results.push(
      createReplayValidationResult(
        "fail",
        key,
        `${key} must be a non-negative number when provided.`,
      ),
    );
    return undefined;
  }

  return value;
}

function readOptionalNonNegativeInteger(value, key, results) {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isInteger(value)
  ) {
    results.push(
      createReplayValidationResult(
        "fail",
        key,
        `${key} must be a non-negative integer when provided.`,
      ),
    );
    return undefined;
  }

  return value;
}

function resolveReplayManifestFilePath(baseDir, filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(baseDir, filePath);
}

function normalizeReplayValidationOptions(options) {
  return {
    ...options,
    replayLoop: options.replayLoop !== false,
    replayFpsMode: options.replayFpsMode === "recorded" ? "recorded" : "fixed",
    replayTimeScale: normalizeReplayTimeScale(options.replayTimeScale),
    replayPreviewCount:
      typeof options.replayPreviewCount === "number" &&
      Number.isFinite(options.replayPreviewCount) &&
      options.replayPreviewCount > 0
        ? Math.round(options.replayPreviewCount)
        : DEFAULT_REPLAY_PREVIEW_ENTRY_COUNT,
    replayManifestPath:
      typeof options.replayManifestPath === "string" &&
      options.replayManifestPath.trim().length > 0
        ? options.replayManifestPath.trim()
        : undefined,
    leftReplayDir:
      typeof options.leftReplayDir === "string" &&
      options.leftReplayDir.trim().length > 0
        ? options.leftReplayDir.trim()
        : undefined,
    rightReplayDir:
      typeof options.rightReplayDir === "string" &&
      options.rightReplayDir.trim().length > 0
        ? options.rightReplayDir.trim()
        : undefined,
    leftReplayFiles: Array.isArray(options.leftReplayFiles)
      ? options.leftReplayFiles
      : [],
    rightReplayFiles: Array.isArray(options.rightReplayFiles)
      ? options.rightReplayFiles
      : [],
  };
}

function finalizeReplayValidation(options) {
  const failedCount = options.results.filter((result) => result.status === "fail").length;
  const warningCount = options.results.filter((result) => result.status === "warn").length;
  const passedCount = options.results.filter((result) => result.status === "pass").length;
  const ok = failedCount === 0;

  return {
    ok,
    failedCount,
    warningCount,
    passedCount,
    results: options.results,
    entries: options.entries,
    manifestLoaded: options.manifestLoaded,
    manifestValidated: options.manifestValidated,
    manifestSource: options.manifestSource,
    fallbackReason: options.fallbackReason,
    leftSource: options.leftSource,
    rightSource: options.rightSource,
    sourceIdentity: options.sourceIdentity,
    replayTimeScale: options.replayTimeScale,
    timingSummary: options.timingSummary,
    validationSummary: ok
      ? createReplayValidationSuccessSummary({
          manifestLoaded: options.manifestLoaded,
          manifestValidated: options.manifestValidated,
          manifestSource: options.manifestSource,
          entryCount: options.entries.length,
          warningCount,
          fallbackReason: options.fallbackReason,
          replayTimeScale: options.replayTimeScale,
          timingMode: options.timingMode,
        })
      : createReplayValidationFailureSummary(options.results),
  };
}

function createReplayValidationSuccessSummary(options) {
  if (options.manifestValidated && options.manifestSource) {
    return `Validated replay manifest ${options.manifestSource} with ${options.entryCount} entr${
      options.entryCount === 1 ? "y" : "ies"
    }${options.warningCount > 0 ? ` and ${options.warningCount} warning(s)` : ""}${
      options.timingMode === "recorded"
        ? ` at ${options.replayTimeScale}x recorded timing.`
        : "."
    }`;
  }

  if (options.fallbackReason === "missing_manifest" && options.manifestSource) {
    return `Replay manifest ${options.manifestSource} was not found; validated ${options.entryCount} stereo replay pair${
      options.entryCount === 1 ? "" : "s"
    } from directory/file-list inputs instead.`;
  }

  return `Validated ${options.entryCount} stereo replay pair${
    options.entryCount === 1 ? "" : "s"
  } from directory/file-list inputs without a replay manifest.`;
}

function createReplayValidationFailureSummary(results) {
  const firstFailure = results.find((result) => result.status === "fail");
  if (!firstFailure) {
    return "Replay validation failed.";
  }

  return `Replay validation failed: ${firstFailure.message}`;
}

function hasValidationFailures(results) {
  return results.some((result) => result.status === "fail");
}

function countValidationFailures(results) {
  return results.filter((result) => result.status === "fail").length;
}

function createReplayValidationResult(status, key, message) {
  return {
    status,
    key,
    message,
  };
}

function createReplaySourcePreview(replayFiles, replayDir, eyeLabel) {
  if (Array.isArray(replayFiles) && replayFiles.length > 0) {
    return createFileListPreview(replayFiles, eyeLabel);
  }

  if (typeof replayDir === "string" && replayDir.length > 0) {
    return `dir:${path.resolve(replayDir)}`;
  }

  return `${eyeLabel}:unconfigured`;
}

function createResolvedReplaySourceText(
  resolvedFiles,
  configuredFiles,
  configuredDir,
  eyeLabel,
) {
  if (Array.isArray(configuredFiles) && configuredFiles.length > 0) {
    return createFileListPreview(resolvedFiles, eyeLabel);
  }

  if (typeof configuredDir === "string" && configuredDir.length > 0) {
    return `dir:${path.resolve(configuredDir)} (${resolvedFiles.length} file${
      resolvedFiles.length === 1 ? "" : "s"
    })`;
  }

  return createFileListPreview(resolvedFiles, eyeLabel);
}

function createManifestEyeSource(entries, eyeLabel) {
  const filePaths = entries.map((entry) => {
    return eyeLabel === "left" ? entry.leftFilePath : entry.rightFilePath;
  });
  return createFileListPreview(filePaths, eyeLabel);
}

function createManifestSourceIdentity(manifestPath, entryCount) {
  return `manifest:${path.resolve(manifestPath)} (${entryCount} entries)`;
}

function createManifestSourceIdentityPreview(manifestPath) {
  return `manifest:${path.resolve(manifestPath)}`;
}

function createFileListPreview(filePaths, eyeLabel) {
  const resolvedPaths = filePaths.map((filePath) => {
    return path.resolve(filePath);
  });
  if (resolvedPaths.length === 0) {
    return `${eyeLabel}:empty`;
  }

  const firstName = path.basename(resolvedPaths[0]);
  const lastName = path.basename(resolvedPaths[resolvedPaths.length - 1]);
  if (resolvedPaths.length === 1) {
    return `file:${resolvedPaths[0]}`;
  }

  return `files:${resolvedPaths.length} (${firstName}..${lastName})`;
}

function createReplaySourceIdentity(leftSource, rightSource) {
  return `left=${leftSource} | right=${rightSource}`;
}
