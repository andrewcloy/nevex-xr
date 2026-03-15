import path from "node:path";
import { createFrameProviderStatus } from "../frame_provider_contract.mjs";
import {
  listSupportedImageFiles,
  loadImageFrameFromFile,
} from "../frame_provider_support.mjs";

export class ImageSequenceFrameProvider {
  constructor(options) {
    this.options = options;
    this.sequenceIndex = 0;
    this.frameIndex = 0;
    this.stereoPairs = [];
    this.frameCache = new Map();
    this.status = createFrameProviderStatus({
      providerType: "sequence",
      providerDisplayName: "Image Sequence Frame Provider",
      detailText: "Waiting to resolve stereo image sequence inputs.",
    });
  }

  async start() {
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "starting",
      detailText: "Resolving image sequence inputs.",
      lastError: undefined,
    });

    try {
      const leftFiles = await resolveSequenceFiles(
        this.options.leftSequenceFiles,
        this.options.leftSequenceDir,
      );
      const rightFiles = await resolveSequenceFiles(
        this.options.rightSequenceFiles,
        this.options.rightSequenceDir,
      );

      if (leftFiles.length === 0 || rightFiles.length === 0) {
        throw new Error("Image sequence provider requires non-empty left/right inputs.");
      }

      if (leftFiles.length !== rightFiles.length) {
        throw new Error(
          `Left/right image sequence lengths must match (${leftFiles.length} !== ${rightFiles.length}).`,
        );
      }

      this.stereoPairs = leftFiles.map((leftFilePath, index) => {
        return {
          leftFilePath,
          rightFilePath: rightFiles[index],
        };
      });
      this.sequenceIndex = 0;
      this.frameIndex = 0;
      this.status = createFrameProviderStatus({
        ...this.status,
        state: "running",
        detailText: `Loaded ${this.stereoPairs.length} stereo sequence pair(s)${
          this.options.sequenceLoop ? " with looping." : " without looping."
        }`,
      });
    } catch (error) {
      this.status = createFrameProviderStatus({
        ...this.status,
        state: "error",
        detailText: "Failed to resolve stereo image sequence inputs.",
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stop() {
    this.status = createFrameProviderStatus({
      ...this.status,
      state: "stopped",
      detailText: "Image sequence provider stopped.",
    });
  }

  getStatus() {
    return this.status;
  }

  async getNextStereoFrame() {
    if (this.status.state !== "running" || this.stereoPairs.length === 0) {
      throw new Error("Image sequence provider is not running.");
    }

    const pairIndex = this.options.sequenceLoop
      ? this.sequenceIndex % this.stereoPairs.length
      : Math.min(this.sequenceIndex, this.stereoPairs.length - 1);
    const stereoPair = this.stereoPairs[pairIndex];
    const leftImageFrame = await this.loadCachedImageFrame(stereoPair.leftFilePath, {
      sourceLabel: `sequence-left-${pairIndex + 1}`,
      title: "Image Sequence Provider",
      backgroundHex: "#0f385d",
      accentHex: "#9ee6ff",
    });
    const rightImageFrame = await this.loadCachedImageFrame(stereoPair.rightFilePath, {
      sourceLabel: `sequence-right-${pairIndex + 1}`,
      title: "Image Sequence Provider",
      backgroundHex: "#46185d",
      accentHex: "#f0c8ff",
    });

    this.sequenceIndex += 1;
    this.frameIndex += 1;
    const timestampMs = Date.now();
    const detailSuffix =
      !this.options.sequenceLoop && this.sequenceIndex > this.stereoPairs.length
        ? " Holding final sequence pair."
        : "";

    this.status = createFrameProviderStatus({
      ...this.status,
      state: "running",
      lastFrameIndex: this.frameIndex,
      lastFrameTimestampMs: timestampMs,
      detailText: `Serving sequence pair ${pairIndex + 1}/${this.stereoPairs.length}.${detailSuffix}`,
    });

    return {
      frameIndex: this.frameIndex,
      timestampMs,
      providerType: "sequence",
      overlayLabel: `Sequence Pair ${String(pairIndex + 1).padStart(2, "0")}`,
      tags: ["sender-prototype", "sequence-provider"],
      extras: {
        providerType: "sequence",
        sequencePairIndex: pairIndex + 1,
        sequencePairCount: this.stereoPairs.length,
        leftFileName: path.basename(stereoPair.leftFilePath),
        rightFileName: path.basename(stereoPair.rightFilePath),
      },
      left: {
        ...leftImageFrame,
        markerText: `LEFT S${String(pairIndex + 1).padStart(2, "0")}`,
      },
      right: {
        ...rightImageFrame,
        markerText: `RIGHT S${String(pairIndex + 1).padStart(2, "0")}`,
      },
    };
  }

  async loadCachedImageFrame(filePath, options) {
    const cacheKey = `${path.resolve(filePath)}::${options.sourceLabel}`;
    const cachedFrame = this.frameCache.get(cacheKey);
    if (cachedFrame) {
      return cachedFrame;
    }

    const loadedFrame = await loadImageFrameFromFile(filePath, {
      width: this.options.frameWidth,
      height: this.options.frameHeight,
      sourceLabel: options.sourceLabel,
      title: options.title,
      backgroundHex: options.backgroundHex,
      accentHex: options.accentHex,
      metadata: {
        providerType: "sequence",
      },
    });
    this.frameCache.set(cacheKey, loadedFrame);
    return loadedFrame;
  }
}

async function resolveSequenceFiles(sequenceFiles, sequenceDir) {
  if (Array.isArray(sequenceFiles) && sequenceFiles.length > 0) {
    return sequenceFiles.map((filePath) => {
      return path.resolve(filePath);
    });
  }

  if (!sequenceDir) {
    return [];
  }

  return listSupportedImageFiles(sequenceDir);
}
