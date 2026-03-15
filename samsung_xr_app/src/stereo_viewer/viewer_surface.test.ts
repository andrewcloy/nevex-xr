import { describe, expect, it } from "vitest";
import { PlaceholderViewerSurface } from "./viewer_surface";

describe("PlaceholderViewerSurface", () => {
  it("skips redundant presentation updates", async () => {
    const viewerSurface = new PlaceholderViewerSurface();
    const snapshots = [viewerSurface.getSnapshot()];
    const unsubscribe = viewerSurface.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    await viewerSurface.initialize();
    const snapshotAfterInitialize = viewerSurface.getSnapshot();
    const emissionsAfterInitialize = snapshots.length;

    viewerSurface.setPresentationOptions({
      brightness: snapshotAfterInitialize.presentation.brightness,
      overlayEnabled: snapshotAfterInitialize.presentation.overlayEnabled,
      thermalOverlayMode: snapshotAfterInitialize.presentation.thermalOverlayMode,
    });

    expect(snapshots).toHaveLength(emissionsAfterInitialize);

    viewerSurface.setPresentationOptions({
      brightness: snapshotAfterInitialize.presentation.brightness + 0.1,
    });

    expect(snapshots).toHaveLength(emissionsAfterInitialize + 1);
    expect(viewerSurface.getSnapshot().presentation.brightness).toBeCloseTo(
      snapshotAfterInitialize.presentation.brightness + 0.1,
    );

    unsubscribe();
  });
});
