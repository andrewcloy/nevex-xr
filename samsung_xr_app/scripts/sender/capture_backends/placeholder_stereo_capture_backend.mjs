import {
  createCaptureBackendStatus,
} from "./capture_backend_contract.mjs";

export class PlaceholderStereoCaptureBackend {
  constructor(options) {
    this.options = options;
    this.backendDisplayName = describeBackendDisplayName(options.backendType);
    this.status = createCaptureBackendStatus({
      backendType: options.backendType,
      backendDisplayName: this.backendDisplayName,
      detailText: `Waiting to start ${this.backendDisplayName}.`,
    });
  }

  async start() {
    this.status = createCaptureBackendStatus({
      ...this.status,
      state: "starting",
      detailText: `Starting ${this.backendDisplayName}.`,
      lastError: undefined,
    });

    const message = buildNotImplementedMessage(this.options);
    this.status = createCaptureBackendStatus({
      ...this.status,
      state: "not_implemented",
      detailText: message,
      lastError: message,
    });
  }

  async stop() {
    this.status = createCaptureBackendStatus({
      ...this.status,
      state: "stopped",
      detailText: `${this.backendDisplayName} stopped.`,
    });
  }

  getStatus() {
    return this.status;
  }

  async captureStereoPair() {
    const message =
      this.status.lastError ??
      buildNotImplementedMessage(this.options);
    this.status = createCaptureBackendStatus({
      ...this.status,
      state: "not_implemented",
      detailText: message,
      lastError: message,
    });
    throw new Error(message);
  }
}

function describeBackendDisplayName(backendType) {
  if (backendType === "opencv") {
    return "OpenCV Stereo Capture Backend";
  }

  if (backendType === "gstreamer") {
    return "GStreamer Stereo Capture Backend";
  }

  if (backendType === "jetson") {
    return "Jetson Native Stereo Capture Backend";
  }

  return "Placeholder Stereo Capture Backend";
}

function buildNotImplementedMessage(options) {
  const leftDevice = resolveVideoDeviceLabel(
    options.leftCameraDevice,
    options.leftCameraId,
  );
  const rightDevice = resolveVideoDeviceLabel(
    options.rightCameraDevice,
    options.rightCameraId,
  );
  return `${describeBackendDisplayName(
    options.backendType,
  )} is not implemented yet for left camera ${leftDevice}, right camera ${rightDevice}, ${options.captureWidth}x${options.captureHeight}.`;
}

function resolveVideoDeviceLabel(devicePath, cameraId) {
  if (typeof devicePath === "string" && devicePath.length > 0) {
    return devicePath;
  }

  return String(cameraId);
}
