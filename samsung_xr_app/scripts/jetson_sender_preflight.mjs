import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseSenderCliArgs } from "./sender/sender_config.mjs";
import { runGStreamerStereoCapturePreflight } from "./sender/capture_backends/gstreamer_stereo_capture_backend.mjs";
import { validateReplayCaptureInputs } from "./sender/capture_backends/replay_manifest_validator.mjs";

export const SENDER_PREFLIGHT_REPORT_VERSION = 1;

export async function runSenderPreflight(inputConfig) {
  const config = {
    ...inputConfig,
    provider: "camera",
    captureBackend: inputConfig.captureBackend ?? "gstreamer",
  };
  const hostResult = createResult(
    "pass",
    "host",
    `Host info recorded for ${os.hostname()} (${process.platform} ${process.arch}, ${os.release()}).`,
  );

  if (config.captureBackend === "gstreamer") {
    const gstreamerPreflight = await runGStreamerStereoCapturePreflight(config);
    const payloadCheck = estimatePayloadBudget(
      gstreamerPreflight.sampleCaptures,
      config,
    );
    const results = [hostResult, ...gstreamerPreflight.results];
    if (payloadCheck) {
      results.push(payloadCheck.result);
    }

    return buildPreflightSummary({
      config,
      mode: "gstreamer",
      results,
      payloadCheck,
      details: gstreamerPreflight,
    });
  }

  if (config.captureBackend === "replay") {
    const replayValidation = await validateReplayCaptureInputs(config);
    const results = [hostResult, ...replayValidation.results];
    return buildPreflightSummary({
      config,
      mode: "replay",
      results,
      payloadCheck: null,
      details: replayValidation,
    });
  }

  throw new Error(
    `Preflight currently supports only --capture-backend gstreamer or replay, received ${config.captureBackend}.`,
  );
}

async function main() {
  const inputConfig = parseSenderCliArgs(process.argv.slice(2));
  const config = {
    ...inputConfig,
    provider: "camera",
    captureBackend: inputConfig.captureBackend ?? "gstreamer",
  };
  const outputMode = config.preflightOutput ?? "text";
  const runtimeInfo = createRuntimeInfo();

  const preflight = await runSenderPreflight(config);
  const finalOutputText =
    outputMode === "json"
      ? JSON.stringify(createSenderPreflightJsonReport(preflight), null, 2)
      : createSenderPreflightTextReport(preflight, config, runtimeInfo);

  if (config.preflightOutputFile) {
    try {
      await writeSenderPreflightOutputFile(finalOutputText, config.preflightOutputFile);
    } catch (error) {
      console.error(
        `[sender-preflight] fatal: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exit(1);
      return;
    }
  }
  writePreflightConsoleOutput(finalOutputText, {
    quiet: config.preflightOutputQuiet === true,
    ok: preflight.ok,
  });
  process.exit(preflight.ok ? 0 : 1);
}

function estimatePayloadBudget(sampleCaptures, config) {
  if (!sampleCaptures?.left || !sampleCaptures?.right) {
    return null;
  }

  const estimatedEnvelopeBytes = estimateStereoEnvelopeBytes({
    leftBytes: sampleCaptures.left.byteLength,
    rightBytes: sampleCaptures.right.byteLength,
    imageMode: config.imageMode,
    width: config.captureWidth,
    height: config.captureHeight,
    streamName: config.streamName,
  });
  const recommendedLimitBytes = config.maxRecommendedPayloadBytes;
  const deltaBytes = estimatedEnvelopeBytes - recommendedLimitBytes;
  const status = deltaBytes > 0 ? "warn" : "pass";

  return {
    estimatedEnvelopeBytes,
    recommendedLimitBytes,
    deltaBytes,
    result: createResult(
      status,
      "payload-budget",
      deltaBytes > 0
        ? `Estimated stereo_frame envelope size ${estimatedEnvelopeBytes} bytes exceeds recommended ${recommendedLimitBytes} bytes by ${deltaBytes} bytes.`
        : `Estimated stereo_frame envelope size ${estimatedEnvelopeBytes} bytes is within recommended ${recommendedLimitBytes} bytes.`,
    ),
  };
}

function estimateStereoEnvelopeBytes(options) {
  const leftImagePayload = createSyntheticImagePayload(
    options.leftBytes,
    options.imageMode,
  );
  const rightImagePayload = createSyntheticImagePayload(
    options.rightBytes,
    options.imageMode,
  );

  const envelope = {
    version: 1,
    messageType: "stereo_frame",
    timestampMs: Date.now(),
    sequence: 1,
    payload: {
      frameId: 1,
      timestampMs: Date.now(),
      sourceId: "jetson_sender_preflight",
      sceneId: "jetson_preflight_scene",
      streamName: options.streamName,
      tags: ["jetson", "sender-preflight", "camera"],
      extras: {
        providerType: "camera",
        preflight: true,
      },
      left: {
        eye: "left",
        width: options.width,
        height: options.height,
        format: "image",
        image: leftImagePayload,
      },
      right: {
        eye: "right",
        width: options.width,
        height: options.height,
        format: "image",
        image: rightImagePayload,
      },
    },
  };

  return Buffer.byteLength(JSON.stringify(envelope), "utf8");
}

function createSyntheticImagePayload(byteLength, imageMode) {
  const base64Length = Math.ceil(byteLength / 3) * 4;
  const base64Data = "A".repeat(base64Length);

  if (imageMode === "data_url") {
    return {
      dataUrl: `data:image/jpeg;base64,${base64Data}`,
    };
  }

  return {
    base64Data,
    mimeType: "image/jpeg",
  };
}

function buildPreflightSummary(options) {
  const passedCount = options.results.filter((result) => result.status === "pass").length;
  const warningCount = options.results.filter((result) => result.status === "warn").length;
  const failedCount = options.results.filter((result) => result.status === "fail").length;

  return {
    ok: failedCount === 0,
    passedCount,
    warningCount,
    failedCount,
    results: options.results,
    payloadCheck: options.payloadCheck,
    config: options.config,
    mode: options.mode,
    details: options.details,
  };
}

function createResult(status, key, message) {
  return {
    status,
    key,
    message,
  };
}

function formatPreflightConfig(config) {
  if (config.captureBackend === "replay") {
    return `config: backend=replay, timing=${config.replayFpsMode}, loop=${
      config.replayLoop ? "enabled" : "disabled"
    }, time-scale=${config.replayTimeScale}x, preview=${config.replayPreviewCount}, manifest=${config.replayManifestPath ?? "not_configured"}, left=${formatReplayInputConfig(
      config.leftReplayFiles,
      config.leftReplayDir,
    )}, right=${formatReplayInputConfig(
      config.rightReplayFiles,
      config.rightReplayDir,
    )}, capture=${config.captureWidth}x${config.captureHeight}, fps=${config.fps.toFixed(
      2,
    )}`;
  }

  return `config: profile=${config.cameraProfile}, left=${
    config.leftCameraDevice ?? config.leftCameraId
  }, right=${config.rightCameraDevice ?? config.rightCameraId}, capture=${
    config.captureWidth
  }x${config.captureHeight}, fps=${config.fps.toFixed(2)}, timeout=${
    config.captureTimeoutMs
  }ms, jpeg=${config.captureJpegQuality}, warm-up=${config.captureWarmupFrames}`;
}

function formatReplayInputConfig(replayFiles, replayDir) {
  if (Array.isArray(replayFiles) && replayFiles.length > 0) {
    return replayFiles.join(", ");
  }

  return replayDir ?? "unconfigured";
}

function formatDurationText(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)} ms`
    : "pending";
}

function resolvePreflightResultText(preflight) {
  if (preflight.mode === "replay") {
    if (preflight.failedCount === 0 && preflight.warningCount === 0) {
      return "replay inputs are fully validated and ready for sender testing.";
    }
    if (preflight.failedCount === 0) {
      return "replay inputs are usable but produced warnings; review them before sender testing.";
    }
    return "fix the replay validation failures before starting replay mode.";
  }

  if (preflight.failedCount === 0) {
    return "camera bring-up prerequisites look good for sender testing.";
  }

  return "fix the failed checks before starting live camera mode.";
}

export function createSenderPreflightJsonReport(preflight) {
  const generatedAt = createGeneratedAtIsoString();
  const warnings = preflight.results.filter((result) => result.status === "warn");
  const errors = preflight.results.filter((result) => result.status === "fail");

  return {
    reportVersion: SENDER_PREFLIGHT_REPORT_VERSION,
    generatedAt,
    ok: preflight.ok,
    mode: preflight.mode,
    validationSummary: preflight.details?.validationSummary,
    summary: {
      passedCount: preflight.passedCount,
      warningCount: preflight.warningCount,
      failedCount: preflight.failedCount,
      resultText: resolvePreflightResultText(preflight),
    },
    replaySource:
      preflight.mode === "replay"
        ? {
            sourceIdentity: preflight.details?.sourceIdentity,
            leftSource: preflight.details?.leftSource,
            rightSource: preflight.details?.rightSource,
          }
        : undefined,
    manifestValidation:
      preflight.mode === "replay"
        ? {
            loaded: preflight.details?.manifestLoaded ?? false,
            validated: preflight.details?.manifestValidated ?? false,
            source: preflight.details?.manifestSource,
            fallbackReason: preflight.details?.fallbackReason,
            failedCount: preflight.details?.failedCount ?? 0,
            warningCount: preflight.details?.warningCount ?? 0,
          }
        : undefined,
    timingSummary:
      preflight.mode === "replay" && preflight.details?.timingSummary
        ? {
            timingMode: preflight.details.timingSummary.timingMode,
            timeScale: preflight.details.timingSummary.timeScale,
            previewCountRequested: preflight.config.replayPreviewCount,
            previewCountIncluded: preflight.details.timingSummary.previewEntries.length,
            entryCount: preflight.details.timingSummary.entryCount,
            delaySummary: {
              nominal: {
                minMs: preflight.details.timingSummary.minNominalDelayMs,
                maxMs: preflight.details.timingSummary.maxNominalDelayMs,
                averageMs: preflight.details.timingSummary.averageNominalDelayMs,
              },
              scaled: {
                minMs: preflight.details.timingSummary.minScaledDelayMs,
                maxMs: preflight.details.timingSummary.maxScaledDelayMs,
                averageMs: preflight.details.timingSummary.averageScaledDelayMs,
              },
            },
            loopDurationMs: {
              nominal: preflight.details.timingSummary.nominalLoopDurationMs,
              scaled: preflight.details.timingSummary.scaledLoopDurationMs,
            },
            wrapBehavior: preflight.details.timingSummary.wrapBehavior,
            wrapDelayMs: {
              nominal: preflight.details.timingSummary.wrapDelayNominalMs,
              scaled: preflight.details.timingSummary.wrapDelayScaledMs,
            },
            zeroDelayCount: preflight.details.timingSummary.zeroDelayCount,
            suspiciousGapCount: preflight.details.timingSummary.suspiciousGapCount,
            previewEntries: preflight.details.timingSummary.previewEntries,
          }
        : undefined,
    warnings,
    errors,
    results: preflight.results,
    payloadCheck: preflight.payloadCheck,
  };
}

function createSenderPreflightFatalJsonReport(error) {
  return {
    reportVersion: SENDER_PREFLIGHT_REPORT_VERSION,
    generatedAt: createGeneratedAtIsoString(),
    ok: false,
    fatalError: error instanceof Error ? error.message : String(error),
  };
}

export function createSenderPreflightTextReport(
  preflight,
  config = preflight.config,
  runtimeInfo = createRuntimeInfo(),
) {
  const lines = [
    "[sender-preflight] Samsung XR Jetson camera preflight",
    `[sender-preflight] host: ${runtimeInfo.hostname} | platform=${runtimeInfo.platform} ${runtimeInfo.arch} | release=${runtimeInfo.release}`,
    `[sender-preflight] ${formatPreflightConfig(config)}`,
    ...preflight.results.map((result) => {
      const prefix =
        result.status === "pass"
          ? "PASS"
          : result.status === "warn"
            ? "WARN"
            : "FAIL";
      return `[sender-preflight] ${prefix} ${result.key}: ${result.message}`;
    }),
    `[sender-preflight] summary: ${preflight.passedCount} passed, ${preflight.warningCount} warnings, ${preflight.failedCount} failed.`,
    ...(preflight.payloadCheck
      ? [
          `[sender-preflight] payload: left=${preflight.payloadCheck ? preflight.config.imageMode : "unknown"} estimate included, recommended limit=${preflight.payloadCheck.recommendedLimitBytes} bytes.`,
        ]
      : []),
    ...(preflight.mode === "replay" && preflight.details?.validationSummary
      ? [`[sender-preflight] replay validation: ${preflight.details.validationSummary}`]
      : []),
    ...createReplayTimingSummaryLines(preflight),
    `[sender-preflight] result: ${resolvePreflightResultText(preflight)}`,
  ];

  return ensureTrailingNewline(lines.join("\n"));
}

export async function writeSenderPreflightOutputFile(outputText, outputFilePath) {
  const resolvedOutputPath = path.resolve(outputFilePath);
  try {
    await fs.mkdir(path.dirname(resolvedOutputPath), {
      recursive: true,
    });
    await fs.writeFile(resolvedOutputPath, ensureTrailingNewline(outputText), "utf8");
  } catch (error) {
    throw new Error(
      `Failed to write preflight output file ${resolvedOutputPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return resolvedOutputPath;
}

function createReplayTimingSummaryLines(preflight) {
  const timingSummary = preflight.details?.timingSummary;
  if (!timingSummary) {
    return [];
  }

  const lines = [
    `[sender-preflight] replay source: ${preflight.details?.sourceIdentity ?? "unknown"}`,
    `[sender-preflight] replay timing: mode=${timingSummary.timingMode}, manifest=${preflight.details?.manifestLoaded ? "yes" : "no"}, time-scale=${timingSummary.timeScale}x, entries=${timingSummary.entryCount}, preview=${timingSummary.previewEntries.length}`,
    `[sender-preflight] replay delays: nominal min/max/avg=${formatDurationText(timingSummary.minNominalDelayMs)}/${formatDurationText(timingSummary.maxNominalDelayMs)}/${formatDurationText(timingSummary.averageNominalDelayMs)} | scaled min/max/avg=${formatDurationText(timingSummary.minScaledDelayMs)}/${formatDurationText(timingSummary.maxScaledDelayMs)}/${formatDurationText(timingSummary.averageScaledDelayMs)}`,
    `[sender-preflight] replay loop: nominal=${formatDurationText(timingSummary.nominalLoopDurationMs)}, scaled=${formatDurationText(timingSummary.scaledLoopDurationMs)}, wrap=${timingSummary.wrapBehavior}, wrap-delay=${formatDurationText(timingSummary.wrapDelayScaledMs)}`,
  ];

  if (timingSummary.zeroDelayCount > 0 || timingSummary.suspiciousGapCount > 0) {
    lines.push(
      `[sender-preflight] replay timing warnings: zero-delays=${timingSummary.zeroDelayCount}, suspicious-gaps=${timingSummary.suspiciousGapCount}`,
    );
  }

  for (const previewEntry of timingSummary.previewEntries) {
    const previewParts = [
      `[sender-preflight] replay preview #${previewEntry.index + 1}`,
      previewEntry.frameId !== undefined ? `frameId=${previewEntry.frameId}` : undefined,
      previewEntry.label ? `label="${previewEntry.label}"` : undefined,
      previewEntry.recordedTimestampMs !== undefined
        ? `recorded=${previewEntry.recordedTimestampMs}`
        : undefined,
      `nominal=${formatDurationText(previewEntry.nominalDelayUntilNextMs)}`,
      `scaled=${formatDurationText(previewEntry.scaledDelayUntilNextMs)}`,
      `source=${previewEntry.delaySource}`,
      `left=${previewEntry.leftFileName}`,
      `right=${previewEntry.rightFileName}`,
    ];
    lines.push(
      previewParts
        .filter((part) => typeof part === "string" && part.length > 0)
        .join(" | "),
    );
  }

  return lines;
}

function createRuntimeInfo() {
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
  };
}

function createGeneratedAtIsoString() {
  return new Date().toISOString();
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function writePreflightConsoleOutput(outputText, options) {
  if (options.quiet && options.ok) {
    return;
  }

  const stream = options.quiet ? process.stderr : process.stdout;
  stream.write(ensureTrailingNewline(outputText));
}

function resolveRawPreflightOutputOptions(argv) {
  const flagIndex = argv.indexOf("--preflight-output");
  const outputMode =
    flagIndex >= 0 && (argv[flagIndex + 1] === "json" || argv[flagIndex + 1] === "text")
      ? argv[flagIndex + 1]
      : "text";

  return {
    outputMode,
    quiet: argv.includes("--preflight-output-quiet"),
  };
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }

  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main().catch((error) => {
    const outputOptions = resolveRawPreflightOutputOptions(process.argv.slice(2));
    if (outputOptions.outputMode === "json") {
      const fatalOutputText = JSON.stringify(
        createSenderPreflightFatalJsonReport(error),
        null,
        2,
      );
      const stream = outputOptions.quiet ? process.stderr : process.stdout;
      stream.write(ensureTrailingNewline(fatalOutputText));
      process.exit(1);
      return;
    }
    console.error(
      `[sender-preflight] fatal: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
