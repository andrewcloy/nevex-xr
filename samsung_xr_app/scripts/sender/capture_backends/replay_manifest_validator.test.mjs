import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validateReplayCaptureInputs } from "./replay_manifest_validator.mjs";

const BACKENDS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SENDER_DIR = path.resolve(BACKENDS_DIR, "..");
const ASSETS_DIR = path.resolve(SENDER_DIR, "..", "assets");
const LEFT_REPLAY_DIR = path.resolve(ASSETS_DIR, "sequence", "left");
const RIGHT_REPLAY_DIR = path.resolve(ASSETS_DIR, "sequence", "right");
const REPLAY_MANIFEST_PATH = path.resolve(
  ASSETS_DIR,
  "sequence",
  "replay_manifest.json",
);

const tempPaths = [];

describe("validateReplayCaptureInputs", () => {
  afterEach(async () => {
    while (tempPaths.length > 0) {
      const tempPath = tempPaths.pop();
      await fs.rm(tempPath, {
        recursive: true,
        force: true,
      });
    }
  });

  it("accepts a valid replay manifest in recorded mode", async () => {
    const report = await validateReplayCaptureInputs(
      createValidationConfig({
        replayManifestPath: REPLAY_MANIFEST_PATH,
        replayFpsMode: "recorded",
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.manifestLoaded).toBe(true);
    expect(report.manifestValidated).toBe(true);
    expect(report.failedCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.entries).toHaveLength(2);
    expect(report.replayTimeScale).toBe(1);
    expect(report.timingSummary?.nominalLoopDurationMs).toBe(270);
    expect(report.timingSummary?.scaledLoopDurationMs).toBe(270);
    expect(report.timingSummary?.previewEntries).toHaveLength(2);
    expect(report.validationSummary).toContain("Validated replay manifest");
  });

  it("fails when the replay manifest JSON is malformed", async () => {
    const manifestPath = await writeTempManifestFile("replay_manifest.json", "{");
    const report = await validateReplayCaptureInputs(
      createValidationConfig({
        replayManifestPath: manifestPath,
        replayFpsMode: "fixed",
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.results.some((result) => result.key === "replay-manifest:json")).toBe(
      true,
    );
    expect(report.validationSummary).toContain("not valid JSON");
  });

  it("fails when a manifest references a missing replay asset", async () => {
    const tempDir = await createTempDirectory();
    await fs.copyFile(
      path.resolve(LEFT_REPLAY_DIR, "frame_001.svg"),
      path.resolve(tempDir, "left.svg"),
    );
    const manifestPath = await writeTempManifestFile(
      "missing_file_manifest.json",
      JSON.stringify({
        version: 1,
        entries: [
          {
            leftFile: "./left.svg",
            rightFile: "./missing_right.svg",
            timestampMs: 1000,
          },
        ],
      }),
      tempDir,
    );

    const report = await validateReplayCaptureInputs(
      createValidationConfig({
        replayManifestPath: manifestPath,
        replayFpsMode: "recorded",
      }),
    );

    expect(report.ok).toBe(false);
    expect(
      report.results.some((result) => {
        return (
          result.key === "replay-manifest:entries[0].rightFile" &&
          result.message.includes("does not exist")
        );
      }),
    ).toBe(true);
  });

  it("fails when recorded timing mode does not have timestamps", async () => {
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
      "missing_timestamps_manifest.json",
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

    const report = await validateReplayCaptureInputs(
      createValidationConfig({
        replayManifestPath: manifestPath,
        replayFpsMode: "recorded",
      }),
    );

    expect(report.ok).toBe(false);
    expect(
      report.results.some((result) => {
        return (
          result.key === "replay-manifest:entries[0].timestampMs" &&
          result.message.includes("must provide timestampMs")
        );
      }),
    ).toBe(true);
  });

  it("accepts a valid manifest in fixed timing mode", async () => {
    const report = await validateReplayCaptureInputs(
      createValidationConfig({
        replayManifestPath: REPLAY_MANIFEST_PATH,
        replayFpsMode: "fixed",
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.manifestLoaded).toBe(true);
    expect(report.manifestValidated).toBe(true);
    expect(report.warningCount).toBe(0);
    expect(report.timingSummary?.nominalLoopDurationMs).toBe(2000);
    expect(report.timingSummary?.scaledLoopDurationMs).toBe(2000);
    expect(report.validationSummary).toContain("Validated replay manifest");
  });

  it("warns and falls back to directory pairing when the fixed-mode manifest file is missing", async () => {
    const manifestPath = path.resolve(
      ASSETS_DIR,
      "sequence",
      "missing_manifest.json",
    );
    const report = await validateReplayCaptureInputs(
      createValidationConfig({
        replayManifestPath: manifestPath,
        replayFpsMode: "fixed",
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.manifestLoaded).toBe(false);
    expect(report.manifestValidated).toBe(false);
    expect(report.warningCount).toBe(1);
    expect(report.fallbackReason).toBe("missing_manifest");
    expect(report.validationSummary).toContain("was not found");
  });

  it("warns when replay time scale is configured for fixed timing mode", async () => {
    const report = await validateReplayCaptureInputs(
      createValidationConfig({
        replayManifestPath: REPLAY_MANIFEST_PATH,
        replayFpsMode: "fixed",
        replayTimeScale: 2,
      }),
    );

    expect(report.ok).toBe(true);
    expect(
      report.results.some((result) => {
        return (
          result.key === "replay-time-scale" &&
          result.status === "warn" &&
          result.message.includes("fixed timing mode ignores")
        );
      }),
    ).toBe(true);
  });
});

function createValidationConfig(overrides = {}) {
  return {
    leftReplayDir: LEFT_REPLAY_DIR,
    rightReplayDir: RIGHT_REPLAY_DIR,
    leftReplayFiles: [],
    rightReplayFiles: [],
    replayLoop: true,
    replayFpsMode: "fixed",
    fps: 1,
    replayTimeScale: 1,
    replayManifestPath: undefined,
    ...overrides,
  };
}

async function createTempDirectory() {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "samsung-xr-replay-validator-"),
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
