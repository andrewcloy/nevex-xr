import { describe, expect, it } from "vitest";
import { SettingsStore } from "./settings_store";

describe("SettingsStore enhanced audio state", () => {
  it("tracks hearing and media settings separately from UI click/boot audio", () => {
    const store = new SettingsStore();

    store.setHearingMode("voice_focus");
    store.setHearingGain(0.72);
    store.setMediaVolume(0.64);
    store.setMediaMuted(true);

    const snapshot = store.getSnapshot();

    expect(snapshot.hearingMode).toBe("voice_focus");
    expect(snapshot.hearingGain).toBeCloseTo(0.72);
    expect(snapshot.mediaVolume).toBeCloseTo(0.64);
    expect(snapshot.mediaMuted).toBe(true);
    expect(snapshot.uiAudioEnabled).toBe(true);
  });
});
