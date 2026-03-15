import { describe, expect, it } from "vitest";
import { createReplayTimingSummary } from "./replay_timing_support.mjs";

const SAMPLE_ENTRIES = [
  {
    leftFilePath: "/tmp/left/frame_001.svg",
    rightFilePath: "/tmp/right/frame_001.svg",
    recordedTimestampMs: 1000,
    frameId: 101,
    label: "Replay sample pair 1",
  },
  {
    leftFilePath: "/tmp/left/frame_002.svg",
    rightFilePath: "/tmp/right/frame_002.svg",
    recordedTimestampMs: 1180,
    frameId: 102,
    label: "Replay sample pair 2",
    delayUntilNextMs: 90,
  },
];

describe("createReplayTimingSummary", () => {
  it("scales recorded timing slower at 0.5x", () => {
    const summary = createReplayTimingSummary({
      entries: SAMPLE_ENTRIES,
      loopEnabled: true,
      timingMode: "recorded",
      fixedFps: 20,
      timeScale: 0.5,
    });

    expect(summary.timeScale).toBe(0.5);
    expect(summary.previewEntries[0]?.nominalDelayUntilNextMs).toBe(180);
    expect(summary.previewEntries[0]?.scaledDelayUntilNextMs).toBe(360);
    expect(summary.previewEntries[1]?.nominalDelayUntilNextMs).toBe(90);
    expect(summary.previewEntries[1]?.scaledDelayUntilNextMs).toBe(180);
    expect(summary.nominalLoopDurationMs).toBe(270);
    expect(summary.scaledLoopDurationMs).toBe(540);
  });

  it("scales recorded timing faster at 2.0x", () => {
    const summary = createReplayTimingSummary({
      entries: SAMPLE_ENTRIES,
      loopEnabled: true,
      timingMode: "recorded",
      fixedFps: 20,
      timeScale: 2,
    });

    expect(summary.timeScale).toBe(2);
    expect(summary.previewEntries[0]?.scaledDelayUntilNextMs).toBe(90);
    expect(summary.previewEntries[1]?.scaledDelayUntilNextMs).toBe(45);
    expect(summary.scaledLoopDurationMs).toBe(135);
  });

  it("keeps fixed timing unchanged even when a time scale is configured", () => {
    const summary = createReplayTimingSummary({
      entries: SAMPLE_ENTRIES,
      loopEnabled: true,
      timingMode: "fixed",
      fixedFps: 4,
      timeScale: 2,
    });

    expect(summary.previewEntries[0]?.nominalDelayUntilNextMs).toBe(250);
    expect(summary.previewEntries[0]?.scaledDelayUntilNextMs).toBe(250);
    expect(summary.nominalLoopDurationMs).toBe(500);
    expect(summary.scaledLoopDurationMs).toBe(500);
  });
});
