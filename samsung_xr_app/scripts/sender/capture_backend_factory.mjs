import { spawnSync } from "node:child_process";
import { assertCaptureBackend } from "./capture_backends/capture_backend_contract.mjs";
import { GStreamerStereoCaptureBackend } from "./capture_backends/gstreamer_stereo_capture_backend.mjs";
import { JetsonRuntimeCaptureBackend } from "./capture_backends/jetson_runtime_capture_backend.mjs";
import { PlaceholderStereoCaptureBackend } from "./capture_backends/placeholder_stereo_capture_backend.mjs";
import { ReplayStereoCaptureBackend } from "./capture_backends/replay_stereo_capture_backend.mjs";
import { SimulatedStereoCaptureBackend } from "./capture_backends/simulated_stereo_capture_backend.mjs";

export function createStereoCaptureBackend(config) {
  let backend;

  if (config.captureBackend === "simulated") {
    backend = new SimulatedStereoCaptureBackend({
      fps: config.fps,
      backendType: config.captureBackend,
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
    });
  } else if (config.captureBackend === "replay") {
    backend = new ReplayStereoCaptureBackend({
      fps: config.fps,
      backendType: config.captureBackend,
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
  } else if (config.captureBackend === "jetson") {
    backend = new JetsonRuntimeCaptureBackend({
      fps: config.fps,
      backendType: config.captureBackend,
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
      jetsonRuntimePythonBin: config.jetsonRuntimePythonBin,
      jetsonRuntimeAppPath: config.jetsonRuntimeAppPath,
      jetsonRuntimeConfigPath: config.jetsonRuntimeConfigPath,
      jetsonRuntimeWorkingDirectory: config.jetsonRuntimeWorkingDirectory,
      jetsonRuntimeProfile: config.jetsonRuntimeProfile,
      jetsonPreviewEnabled: config.jetsonPreviewEnabled,
      jetsonRunPreflightOnStart: config.jetsonRunPreflightOnStart,
    });
  } else if (shouldUseGStreamerBackend(config.captureBackend)) {
    backend = new GStreamerStereoCaptureBackend({
        fps: config.fps,
        backendType: config.captureBackend,
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
      });
  } else {
    backend = new PlaceholderStereoCaptureBackend({
        fps: config.fps,
        backendType: config.captureBackend,
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
      });
  }

  assertCaptureBackend(backend);
  return backend;
}

function shouldUseGStreamerBackend(backendType) {
  if (backendType !== "gstreamer") {
    return false;
  }

  if (process.platform !== "linux") {
    return false;
  }

  const probe = spawnSync("gst-launch-1.0", ["--version"], {
    stdio: "ignore",
  });
  return !probe.error && probe.status === 0;
}
