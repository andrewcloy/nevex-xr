import path from "node:path";
import { createFrameProviderStatus } from "../frame_provider_contract.mjs";
import { loadImageFrameFromFile } from "../frame_provider_support.mjs";

export class StillImageFrameProvider {
  constructor(options) {
    this.options = options;
    this.leftImageFrame = undefined;
    this.rightImageFrame = undefined;
    this.frameIndex = 0;
    this.status = createFrameProviderStatus({
      providerType: "still",
      providerDisplayName: "Still Image Frame Provider",
      detailText: "Waiting to load left/right still images.",
    });
  }

  async start() {
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "starting",
      detailText: "Loading left/right still images.",
      lastError: undefined,
    });

    try {
      this.leftImageFrame = await loadImageFrameFromFile(this.options.leftImagePath, {
        width: this.options.frameWidth,
        height: this.options.frameHeight,
        sourceLabel: "still-left",
        title: "Still Image Provider",
        backgroundHex: "#0f385d",
        accentHex: "#9ee6ff",
        metadata: {
          providerType: "still",
        },
      });
      this.rightImageFrame = await loadImageFrameFromFile(this.options.rightImagePath, {
        width: this.options.frameWidth,
        height: this.options.frameHeight,
        sourceLabel: "still-right",
        title: "Still Image Provider",
        backgroundHex: "#46185d",
        accentHex: "#f0c8ff",
        metadata: {
          providerType: "still",
        },
      });
      this.frameIndex = 0;
      this.status = createFrameProviderStatus({
        ...this.status,
        state: "running",
        detailText: `Serving still images ${path.basename(this.options.leftImagePath)} and ${path.basename(this.options.rightImagePath)}.`,
      });
    } catch (error) {
      this.status = createFrameProviderStatus({
        ...this.status,
        state: "error",
        detailText: "Failed to load still images.",
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stop() {
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "stopped",
      detailText: "Still image provider stopped.",
    });
  }

  getStatus() {
    return this.status;
  }

  async getNextStereoFrame() {
    if (this.status.state !== "running" || !this.leftImageFrame || !this.rightImageFrame) {
      throw new Error("Still image provider is not running.");
    }

    this.frameIndex += 1;
    const timestampMs = Date.now();
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "running",
      lastFrameIndex: this.frameIndex,
      lastFrameTimestampMs: timestampMs,
      detailText: "Serving configured still-image stereo pair.",
    });

    return {
      frameIndex: this.frameIndex,
      timestampMs,
      providerType: "still",
      overlayLabel: `Still Pair ${String(this.frameIndex).padStart(4, "0")}`,
      tags: ["sender-prototype", "still-provider"],
      extras: {
        providerType: "still",
        leftFileName: path.basename(this.options.leftImagePath),
        rightFileName: path.basename(this.options.rightImagePath),
      },
      left: {
        ...this.leftImageFrame,
        markerText: `LEFT ${String(this.frameIndex).padStart(4, "0")}`,
      },
      right: {
        ...this.rightImageFrame,
        markerText: `RIGHT ${String(this.frameIndex).padStart(4, "0")}`,
      },
    };
  }
}
