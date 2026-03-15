import { assertFrameProvider } from "./frame_provider_contract.mjs";
import { CameraSnapshotFrameProvider } from "./frame_providers/camera_snapshot_frame_provider.mjs";
import { GeneratedTestPatternFrameProvider } from "./frame_providers/generated_test_pattern_frame_provider.mjs";
import { ImageSequenceFrameProvider } from "./frame_providers/image_sequence_frame_provider.mjs";
import { StillImageFrameProvider } from "./frame_providers/still_image_frame_provider.mjs";

export function createFrameProvider(config) {
  let provider;

  switch (config.provider) {
    case "camera":
      provider = new CameraSnapshotFrameProvider({
        fps: config.fps,
        captureBackend: config.captureBackend,
        cameraProfile: config.cameraProfile,
        leftCameraId: config.leftCameraId,
        rightCameraId: config.rightCameraId,
        leftCameraDevice: config.leftCameraDevice,
        rightCameraDevice: config.rightCameraDevice,
        captureWidth: config.captureWidth,
        captureHeight: config.captureHeight,
        captureTimeoutMs: config.captureTimeoutMs,
        captureJpegQuality: config.captureJpegQuality,
        captureWarmupFrames: config.captureWarmupFrames,
        captureRetryCount: config.captureRetryCount,
        captureRetryDelayMs: config.captureRetryDelayMs,
        faultInjectEveryNCaptures: config.faultInjectEveryNCaptures,
        faultInjectFailureCount: config.faultInjectFailureCount,
        faultInjectMode: config.faultInjectMode,
        faultInjectStartAfterCaptures: config.faultInjectStartAfterCaptures,
        leftReplayDir: config.leftReplayDir,
        rightReplayDir: config.rightReplayDir,
        leftReplayFiles: config.leftReplayFiles,
        rightReplayFiles: config.rightReplayFiles,
        replayLoop: config.replayLoop,
        replayFpsMode: config.replayFpsMode,
        replayTimeScale: config.replayTimeScale,
        replayManifestPath: config.replayManifestPath,
      });
      break;
    case "generated":
      provider = new GeneratedTestPatternFrameProvider({
        senderName: config.senderName,
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
      });
      break;
    case "sequence":
      provider = new ImageSequenceFrameProvider({
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
        leftSequenceDir: config.leftSequenceDir,
        rightSequenceDir: config.rightSequenceDir,
        leftSequenceFiles: config.leftSequenceFiles,
        rightSequenceFiles: config.rightSequenceFiles,
        sequenceLoop: config.sequenceLoop,
      });
      break;
    case "still":
      provider = new StillImageFrameProvider({
        frameWidth: config.frameWidth,
        frameHeight: config.frameHeight,
        leftImagePath: config.leftImagePath,
        rightImagePath: config.rightImagePath,
      });
      break;
    default:
      throw new Error(`Unsupported sender frame provider: ${config.provider}`);
  }

  assertFrameProvider(provider);
  return provider;
}
