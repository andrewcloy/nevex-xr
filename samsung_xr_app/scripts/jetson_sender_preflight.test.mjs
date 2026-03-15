import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  SENDER_PREFLIGHT_REPORT_VERSION,
  createSenderPreflightTextReport,
  createSenderPreflightJsonReport,
  runSenderPreflight,
  writeSenderPreflightOutputFile,
} from "./jetson_sender_preflight.mjs";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPTS_DIR, "..");
const PREFLIGHT_SCRIPT_PATH = path.resolve(SCRIPTS_DIR, "jetson_sender_preflight.mjs");
const ASSETS_DIR = path.resolve(SCRIPTS_DIR, "assets");
const LEFT_REPLAY_DIR = path.resolve(ASSETS_DIR, "sequence", "left");
const RIGHT_REPLAY_DIR = path.resolve(ASSETS_DIR, "sequence", "right");
const REPLAY_MANIFEST_PATH = path.resolve(
  ASSETS_DIR,
  "sequence",
  "replay_manifest.json",
);
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const tempPaths = [];

describe("runSenderPreflight", () => {
  afterEach(async () => {
    while (tempPaths.length > 0) {
      const tempPath = tempPaths.pop();
      await fs.rm(tempPath, {
        recursive: true,
        force: true,
      });
    }
  });

  it("passes replay preflight for a valid recorded-timing manifest", async () => {
    const preflight = await runSenderPreflight(
      createPreflightConfig({
        captureBackend: "replay",
        replayManifestPath: REPLAY_MANIFEST_PATH,
        replayFpsMode: "recorded",
        replayTimeScale: 0.5,
      }),
    );

    expect(preflight.ok).toBe(true);
    expect(preflight.failedCount).toBe(0);
    expect(preflight.warningCount).toBe(0);
    expect(preflight.details.validationSummary).toContain("Validated replay manifest");
    expect(preflight.details.timingSummary?.timeScale).toBe(0.5);
    expect(preflight.details.timingSummary?.nominalLoopDurationMs).toBe(270);
    expect(preflight.details.timingSummary?.scaledLoopDurationMs).toBe(540);
    expect(preflight.details.timingSummary?.previewEntries[0]).toMatchObject({
      frameId: 101,
      label: "Replay sample pair 1",
      nominalDelayUntilNextMs: 180,
      scaledDelayUntilNextMs: 360,
    });
  });

  it("limits replay preview entries when preview count is overridden", async () => {
    const preflight = await runSenderPreflight(
      createPreflightConfig({
        captureBackend: "replay",
        replayManifestPath: REPLAY_MANIFEST_PATH,
        replayFpsMode: "recorded",
        replayPreviewCount: 1,
      }),
    );

    expect(preflight.ok).toBe(true);
    expect(preflight.details.timingSummary?.previewEntries).toHaveLength(1);
    expect(preflight.details.timingSummary?.previewEntries[0]?.frameId).toBe(101);
  });

  it("creates machine-readable JSON output for replay preflight", async () => {
    const preflight = await runSenderPreflight(
      createPreflightConfig({
        captureBackend: "replay",
        replayManifestPath: REPLAY_MANIFEST_PATH,
        replayFpsMode: "recorded",
        replayTimeScale: 2,
        replayPreviewCount: 1,
      }),
    );

    const report = createSenderPreflightJsonReport(preflight);

    expect(report.reportVersion).toBe(SENDER_PREFLIGHT_REPORT_VERSION);
    expectValidIsoTimestamp(report.generatedAt);
    expect(report.ok).toBe(true);
    expect(report.validationSummary).toContain("Validated replay manifest");
    expect(report.replaySource).toMatchObject({
      sourceIdentity: expect.stringContaining("manifest:"),
    });
    expect(report.manifestValidation).toMatchObject({
      loaded: true,
      validated: true,
    });
    expect(report.timingSummary).toMatchObject({
      timingMode: "recorded",
      timeScale: 2,
      previewCountRequested: 1,
      previewCountIncluded: 1,
      entryCount: 2,
      loopDurationMs: {
        nominal: 270,
        scaled: 135,
      },
    });
    expect(report.timingSummary.previewEntries).toHaveLength(1);
    expect(report.timingSummary.previewEntries[0]).toMatchObject({
      frameId: 101,
      label: "Replay sample pair 1",
      nominalDelayUntilNextMs: 180,
      scaledDelayUntilNextMs: 90,
    });
    expect(report.warnings).toEqual([]);
    expect(report.errors).toEqual([]);
  });

  it("matches a stable snapshot view for replay preflight JSON output", async () => {
    const preflight = await runSenderPreflight(
      createPreflightConfig({
        captureBackend: "replay",
        replayManifestPath: REPLAY_MANIFEST_PATH,
        replayFpsMode: "recorded",
        replayTimeScale: 0.5,
        replayPreviewCount: 2,
      }),
    );

    const stableView = createStableJsonSnapshotView(
      createSenderPreflightJsonReport(preflight),
    );

    expect(stableView).toMatchInlineSnapshot(`
      {
        "errors": [],
        "generatedAt": "<generated-at>",
        "manifestValidation": {
          "failedCount": 0,
          "loaded": true,
          "source": "<manifest-path>",
          "validated": true,
          "warningCount": 0,
        },
        "mode": "replay",
        "ok": true,
        "replaySource": {
          "leftSource": "files:2 (frame_001.svg..frame_002.svg)",
          "rightSource": "files:2 (frame_001.svg..frame_002.svg)",
          "sourceIdentity": "manifest:<manifest-path> (2 entries)",
        },
        "reportVersion": 1,
        "summary": {
          "failedCount": 0,
          "passedCount": 7,
          "resultText": "replay inputs are fully validated and ready for sender testing.",
          "warningCount": 0,
        },
        "timingSummary": {
          "delaySummary": {
            "nominal": {
              "averageMs": 135,
              "maxMs": 180,
              "minMs": 90,
            },
            "scaled": {
              "averageMs": 270,
              "maxMs": 360,
              "minMs": 180,
            },
          },
          "entryCount": 2,
          "loopDurationMs": {
            "nominal": 270,
            "scaled": 540,
          },
          "previewCountIncluded": 2,
          "previewCountRequested": 2,
          "previewEntries": [
            {
              "delaySource": "timestamp_delta",
              "frameId": 101,
              "index": 0,
              "label": "Replay sample pair 1",
              "leftFileName": "frame_001.svg",
              "nominalDelayUntilNextMs": 180,
              "recordedTimestampMs": 1000,
              "rightFileName": "frame_001.svg",
              "scaledDelayUntilNextMs": 360,
            },
            {
              "delaySource": "explicit_delay",
              "frameId": 102,
              "index": 1,
              "label": "Replay sample pair 2",
              "leftFileName": "frame_002.svg",
              "nominalDelayUntilNextMs": 90,
              "recordedTimestampMs": 1180,
              "rightFileName": "frame_002.svg",
              "scaledDelayUntilNextMs": 180,
            },
          ],
          "suspiciousGapCount": 0,
          "timeScale": 0.5,
          "timingMode": "recorded",
          "wrapBehavior": "loop_to_first_with_explicit_delay",
          "wrapDelayMs": {
            "nominal": 90,
            "scaled": 180,
          },
          "zeroDelayCount": 0,
        },
        "validationSummary": "Validated replay manifest <manifest-path> with 2 entries at 0.5x recorded timing.",
        "warnings": [],
      }
    `);
  });

  it("writes JSON and text preflight reports to disk and creates parent directories", async () => {
    const preflight = await runSenderPreflight(
      createPreflightConfig({
        captureBackend: "replay",
        replayManifestPath: REPLAY_MANIFEST_PATH,
        replayFpsMode: "recorded",
      }),
    );
    const tempDir = await createTempDirectory();
    const jsonOutputPath = path.resolve(tempDir, "reports", "preflight.json");
    const textOutputPath = path.resolve(tempDir, "reports", "preflight.txt");

    await writeSenderPreflightOutputFile(
      JSON.stringify(createSenderPreflightJsonReport(preflight), null, 2),
      jsonOutputPath,
    );
    await writeSenderPreflightOutputFile(
      createSenderPreflightTextReport(preflight),
      textOutputPath,
    );

    const jsonText = await fs.readFile(jsonOutputPath, "utf8");
    const textReport = await fs.readFile(textOutputPath, "utf8");

    expect(JSON.parse(jsonText)).toMatchObject({
      reportVersion: SENDER_PREFLIGHT_REPORT_VERSION,
      ok: true,
      mode: "replay",
    });
    expectValidIsoTimestamp(JSON.parse(jsonText).generatedAt);
    expect(textReport).toContain("[sender-preflight] Samsung XR Jetson camera preflight");
    expect(textReport).toContain("[sender-preflight] replay validation:");
  });

  it("suppresses successful console output in quiet mode while still writing the output file", async () => {
    const tempDir = await createTempDirectory();
    const outputPath = path.resolve(tempDir, "reports", "quiet-preflight.json");

    const result = await runPreflightCli([
      "--provider",
      "camera",
      "--capture-backend",
      "replay",
      "--replay-manifest",
      REPLAY_MANIFEST_PATH,
      "--replay-fps-mode",
      "recorded",
      "--replay-time-scale",
      "0.5",
      "--replay-preview-count",
      "2",
      "--preflight-output",
      "json",
      "--preflight-output-file",
      outputPath,
      "--preflight-output-quiet",
      "--replay-loop",
      "true",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");

    const report = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(report).toMatchObject({
      reportVersion: SENDER_PREFLIGHT_REPORT_VERSION,
      ok: true,
      mode: "replay",
    });
    expectValidIsoTimestamp(report.generatedAt);
  });

  it("emits failure details on stderr for quiet-mode replay validation failures", async () => {
    const tempDir = await createTempDirectory();
    const manifestPath = await writeTempManifestFile(
      "quiet_invalid_replay_manifest.json",
      JSON.stringify({
        version: 1,
        entries: [
          {
            leftFile: "./missing_left.svg",
            rightFile: "./missing_right.svg",
          },
        ],
      }),
      tempDir,
    );

    const result = await runPreflightCli([
      "--provider",
      "camera",
      "--capture-backend",
      "replay",
      "--replay-manifest",
      manifestPath,
      "--replay-fps-mode",
      "recorded",
      "--preflight-output",
      "text",
      "--preflight-output-quiet",
      "--replay-loop",
      "true",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("[sender-preflight] FAIL");
    expect(result.stderr).toContain("fix the replay validation failures before starting replay mode.");
    expect(result.stderr).not.toContain(
      "replay inputs are fully validated and ready for sender testing.",
    );
  });

  it("fails clearly when the requested preflight output path cannot be written", async () => {
    const tempDir = await createTempDirectory();
    const result = await runPreflightCli([
      "--provider",
      "camera",
      "--capture-backend",
      "replay",
      "--replay-manifest",
      REPLAY_MANIFEST_PATH,
      "--replay-fps-mode",
      "recorded",
      "--preflight-output",
      "json",
      "--preflight-output-file",
      tempDir,
      "--replay-loop",
      "true",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Failed to write preflight output file");
  });

  it("includes generatedAt in fatal JSON output when preflight cannot run", async () => {
    const result = await runPreflightCli([
      "--provider",
      "camera",
      "--capture-backend",
      "simulated",
      "--preflight-output",
      "json",
      "--preflight-output-quiet",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");

    const fatalReport = JSON.parse(result.stderr);
    expect(fatalReport).toMatchObject({
      reportVersion: SENDER_PREFLIGHT_REPORT_VERSION,
      ok: false,
    });
    expectValidIsoTimestamp(fatalReport.generatedAt);
    expect(fatalReport.fatalError).toContain(
      "Preflight currently supports only --capture-backend gstreamer or replay",
    );
  });

  it("fails replay preflight when recorded timing metadata is incomplete", async () => {
    const tempDir = await createTempDirectory();
    await fs.copyFile(
      path.resolve(LEFT_REPLAY_DIR, "frame_001.svg"),
      path.resolve(tempDir, "left.svg"),
    );
    await fs.copyFile(
      path.resolve(RIGHT_REPLAY_DIR, "frame_001.svg"),
      path.resolve(tempDir, "right.svg"),
    );
    const manifestPath = await writeTempManifestFile(
      "invalid_replay_manifest.json",
      JSON.stringify({
        version: 1,
        entries: [
          {
            leftFile: "./left.svg",
            rightFile: "./right.svg",
          },
        ],
      }),
      tempDir,
    );

    const preflight = await runSenderPreflight(
      createPreflightConfig({
        captureBackend: "replay",
        replayManifestPath: manifestPath,
        replayFpsMode: "recorded",
      }),
    );

    expect(preflight.ok).toBe(false);
    expect(preflight.failedCount).toBeGreaterThan(0);
    expect(preflight.results.some((result) => result.status === "fail")).toBe(true);
    expect(preflight.details.validationSummary).toContain("must provide timestampMs");
    expect(createSenderPreflightJsonReport(preflight)).toMatchObject({
      reportVersion: SENDER_PREFLIGHT_REPORT_VERSION,
      ok: false,
      errors: [
        expect.objectContaining({
          status: "fail",
        }),
      ],
    });
  });
});

function createPreflightConfig(overrides = {}) {
  return {
    host: "127.0.0.1",
    port: 8090,
    path: "/jetson/messages",
    fps: 1,
    senderName: "preflight_test_sender",
    senderVersion: "0.1.0-test",
    streamName: "preflight_test_stream",
    imageMode: "base64",
    provider: "camera",
    cameraProfile: "default",
    captureBackend: "replay",
    leftCameraId: "0",
    rightCameraId: "1",
    leftCameraDevice: undefined,
    rightCameraDevice: undefined,
    captureWidth: 1280,
    captureHeight: 720,
    captureTimeoutMs: 3000,
    captureJpegQuality: 85,
    captureWarmupFrames: 0,
    captureRetryCount: 2,
    captureRetryDelayMs: 500,
    faultInjectEveryNCaptures: 0,
    faultInjectFailureCount: 1,
    faultInjectMode: "transient",
    faultInjectStartAfterCaptures: 0,
    faultInjectHeartbeatDrop: false,
    faultInjectHeartbeatDropAfterMs: 3000,
    healthLog: false,
    healthLogIntervalMs: 5000,
    leftReplayDir: LEFT_REPLAY_DIR,
    rightReplayDir: RIGHT_REPLAY_DIR,
    leftReplayFiles: [],
    rightReplayFiles: [],
    replayLoop: true,
    replayFpsMode: "fixed",
    replayTimeScale: 1,
    replayPreviewCount: 5,
    replayManifestPath: undefined,
    preflightOutput: "text",
    preflightOutputFile: undefined,
    preflightOutputQuiet: false,
    maxRecommendedPayloadBytes: 256 * 1024,
    ...overrides,
  };
}

async function createTempDirectory() {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "samsung-xr-replay-preflight-"),
  );
  tempPaths.push(tempDir);
  return tempDir;
}

async function writeTempManifestFile(fileName, fileContents, targetDir) {
  const tempDir = targetDir ?? (await createTempDirectory());
  const manifestPath = path.resolve(tempDir, fileName);
  await fs.writeFile(manifestPath, fileContents, "utf8");
  return manifestPath;
}

function createStableJsonSnapshotView(report) {
  return {
    reportVersion: report.reportVersion,
    generatedAt: "<generated-at>",
    ok: report.ok,
    mode: report.mode,
    validationSummary: sanitizeManifestPathText(report.validationSummary),
    summary: report.summary,
    replaySource: report.replaySource
      ? omitUndefinedFields({
          ...report.replaySource,
          sourceIdentity: sanitizeManifestPathText(report.replaySource.sourceIdentity),
        })
      : undefined,
    manifestValidation: report.manifestValidation
      ? omitUndefinedFields({
          ...report.manifestValidation,
          source: sanitizeManifestPathText(report.manifestValidation.source),
        })
      : undefined,
    timingSummary: report.timingSummary,
    warnings: report.warnings,
    errors: report.errors,
  };
}

function sanitizeManifestPathText(value) {
  return typeof value === "string"
    ? value.replaceAll(REPLAY_MANIFEST_PATH, "<manifest-path>")
    : value;
}

function omitUndefinedFields(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function expectValidIsoTimestamp(value) {
  expect(value).toMatch(ISO_TIMESTAMP_PATTERN);
  expect(new Date(value).toISOString()).toBe(value);
}

async function runPreflightCli(args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PREFLIGHT_SCRIPT_PATH, ...args], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}
