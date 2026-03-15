import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { decodeBinaryStereoFrameMessage } from "./jetson_binary_stereo_frame_message.mjs";

let activeFrameProvider;

vi.mock("./frame_provider_factory.mjs", () => {
  return {
    createFrameProvider: () => {
      if (!activeFrameProvider) {
        throw new Error("No test frame provider configured.");
      }

      return activeFrameProvider;
    },
  };
});

const { startJetsonSenderPrototype } = await import("./sender_runtime.mjs");

describe("sender runtime", () => {
  afterEach(() => {
    activeFrameProvider = undefined;
    vi.restoreAllMocks();
  });

  it("emits source_status telemetry updates while a frame capture is stalled", async () => {
    activeFrameProvider = createStallingCameraProvider();

    const server = await startJetsonSenderPrototype(createRuntimeConfig());
    await waitForServerListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/jetson/messages`);
    const messages = [];

    socket.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    await waitFor(
      () => messages.some((message) => message.messageType === "stereo_frame"),
      3000,
    );

    const retryingStatusIndex = messages.findIndex((message) => {
      return (
        message.messageType === "source_status" &&
        message.payload?.cameraTelemetry?.captureHealthState === "retrying"
      );
    });
    const recoveredStatusIndex = messages.findIndex((message) => {
      return (
        message.messageType === "source_status" &&
        message.payload?.cameraTelemetry?.captureHealthState === "recovered"
      );
    });
    const stereoFrameIndex = messages.findIndex((message) => {
      return message.messageType === "stereo_frame";
    });

    expect(retryingStatusIndex).toBeGreaterThanOrEqual(0);
    expect(recoveredStatusIndex).toBeGreaterThanOrEqual(0);
    expect(stereoFrameIndex).toBeGreaterThan(retryingStatusIndex);
    expect(messages[retryingStatusIndex]?.payload?.telemetryUpdatedAtMs).toBeTypeOf(
      "number",
    );
    expect(
      messages[retryingStatusIndex]?.payload?.cameraTelemetry?.recentRetryAttempts,
    ).toBe(1);
    expect(
      messages[recoveredStatusIndex]?.payload?.cameraTelemetry?.lastRecoveryTime,
    ).toBeTypeOf("number");

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("stops emitting source_status after injected heartbeat drop while frames continue", async () => {
    activeFrameProvider = createHealthyCameraProvider();

    const server = await startJetsonSenderPrototype(
      createRuntimeConfig({
        fps: 4,
        faultInjectHeartbeatDrop: true,
        faultInjectHeartbeatDropAfterMs: 250,
      }),
    );
    await waitForServerListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/jetson/messages`);
    const messages = [];

    socket.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    await waitFor(() => messages.length >= 6, 3000);
    await new Promise((resolve) => {
      setTimeout(resolve, 800);
    });

    const sourceStatusMessages = messages.filter((message) => {
      return message.messageType === "source_status";
    });
    const stereoFrameMessages = messages.filter((message) => {
      return message.messageType === "stereo_frame";
    });

    expect(sourceStatusMessages.length).toBeGreaterThanOrEqual(1);
    expect(stereoFrameMessages.length).toBeGreaterThanOrEqual(2);

    const lastSourceSequence =
      sourceStatusMessages[sourceStatusMessages.length - 1]?.sequence ?? 0;
    const laterStereoFrames = stereoFrameMessages.filter((message) => {
      return typeof message.sequence === "number" && message.sequence > lastSourceSequence;
    });
    expect(laterStereoFrames.length).toBeGreaterThanOrEqual(1);

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("keeps Jetson control-plane providers in status-only mode and forwards bridge commands", async () => {
    activeFrameProvider = createJetsonControlPlaneProvider();

    const server = await startJetsonSenderPrototype(
      createRuntimeConfig({
        captureBackend: "jetson",
      }),
    );
    await waitForServerListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/jetson/messages`);
    const messages = [];

    socket.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    await waitFor(() => {
      return messages.some((message) => {
        return (
          message.messageType === "source_status" &&
          message.payload?.cameraTelemetry?.runtimeProfileName ===
            "quality_1080p30"
        );
      });
    }, 3000);

    await new Promise((resolve) => {
      setTimeout(resolve, 600);
    });

    expect(
      messages.some((message) => {
        return message.messageType === "stereo_frame";
      }),
    ).toBe(false);
    expect(
      messages.some((message) => {
        return (
          message.messageType === "capabilities" &&
          message.payload?.stereoFormatNote?.includes("control-plane bridge")
        );
      }),
    ).toBe(true);

    socket.send(
      JSON.stringify({
        type: "session_command",
        timestampMs: Date.now(),
        payload: {
          action: "select_profile",
          profileName: "low_latency_720p60",
        },
      }),
    );

    await waitFor(() => {
      return messages.some((message) => {
        return (
          message.messageType === "source_status" &&
          message.payload?.cameraTelemetry?.runtimeProfileName ===
            "low_latency_720p60"
        );
      });
    }, 3000);

    expect(
      messages.some((message) => {
        return (
          message.messageType === "source_status" &&
          message.payload?.cameraTelemetry?.bridgeMode ===
            "jetson_runtime_control_plane" &&
          message.payload?.cameraTelemetry?.outputWidth === 2560
        );
      }),
    ).toBe(true);

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("streams Jetson preview bridge frames through the existing stereo_frame contract", async () => {
    activeFrameProvider = createJetsonPreviewBridgeProvider();

    const server = await startJetsonSenderPrototype(
      createRuntimeConfig({
        captureBackend: "jetson",
        jetsonPreviewEnabled: true,
        fps: 2,
      }),
    );
    await waitForServerListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/jetson/messages`);
    const messages = [];

    socket.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    await waitFor(() => {
      return messages.some((message) => message.messageType === "stereo_frame");
    }, 3000);

    expect(
      messages.some((message) => {
        return (
          message.messageType === "capabilities" &&
          message.payload?.stereoFormatNote?.includes("preview bridge active")
        );
      }),
    ).toBe(true);
    expect(
      messages.some((message) => {
        return (
          message.messageType === "source_status" &&
          message.payload?.cameraTelemetry?.bridgeMode ===
            "jetson_runtime_preview_bridge" &&
          message.payload?.cameraTelemetry?.frameSourceMode === "camera"
        );
      }),
    ).toBe(true);
    expect(
      messages.some((message) => {
        return (
          message.messageType === "stereo_frame" &&
          message.payload?.left?.image?.base64Data &&
          message.payload?.right?.image?.base64Data
        );
      }),
    ).toBe(true);

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("emits binary stereo_frame messages when binary_frame image mode is enabled", async () => {
    activeFrameProvider = createJetsonPreviewBridgeProvider();

    const server = await startJetsonSenderPrototype(
      createRuntimeConfig({
        captureBackend: "jetson",
        jetsonPreviewEnabled: true,
        imageMode: "binary_frame",
        fps: 2,
      }),
    );
    await waitForServerListening(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address.");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/jetson/messages`);
    const jsonMessages = [];
    const binaryMessages = [];

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        binaryMessages.push(data);
        return;
      }

      jsonMessages.push(JSON.parse(data.toString("utf8")));
    });

    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    await waitFor(() => binaryMessages.length >= 1, 3000);

    const decodedFrame = decodeBinaryStereoFrameMessage(binaryMessages[0]);

    expect(
      jsonMessages.some((message) => {
        return (
          message.messageType === "capabilities" &&
          message.payload?.supportedImagePayloadModes?.includes("binary_frame")
        );
      }),
    ).toBe(true);
    expect(decodedFrame.envelope.messageType).toBe("stereo_frame");
    expect(decodedFrame.envelope.payload?.left?.image).toBeUndefined();
    expect(decodedFrame.leftImageBytes.toString("utf8")).toBe(
      "jetson-preview-provider-frame",
    );
    expect(decodedFrame.rightImageBytes.toString("utf8")).toBe(
      "jetson-preview-provider-frame",
    );

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });
});

function createRuntimeConfig(overrides = {}) {
  return {
    host: "127.0.0.1",
    port: 0,
    path: "/jetson/messages",
    fps: 1,
    senderName: "sender_runtime_test",
    senderVersion: "0.1.0-test",
    streamName: "sender_runtime_test_stream",
    imageMode: "base64",
    provider: "camera",
    cameraProfile: "default",
    captureBackend: "gstreamer",
    jetsonPreviewEnabled: false,
    leftCameraId: "0",
    rightCameraId: "1",
    leftCameraDevice: "/dev/video0",
    rightCameraDevice: "/dev/video1",
    captureWidth: 640,
    captureHeight: 360,
    captureTimeoutMs: 3000,
    captureJpegQuality: 75,
    captureWarmupFrames: 0,
    captureRetryCount: 2,
    captureRetryDelayMs: 200,
    faultInjectEveryNCaptures: 0,
    faultInjectFailureCount: 1,
    faultInjectMode: "transient",
    faultInjectStartAfterCaptures: 0,
    faultInjectHeartbeatDrop: false,
    faultInjectHeartbeatDropAfterMs: 3000,
    healthLog: false,
    healthLogIntervalMs: 5000,
    maxRecommendedPayloadBytes: 256 * 1024,
    ...overrides,
  };
}

function createStallingCameraProvider() {
  let started = false;
  let frameIndex = 0;
  let firstCapturePending = true;
  const baseFrameBytes = Buffer.from("sender-runtime-test-frame", "utf8");
  const status = {
    providerType: "camera",
    providerDisplayName: "Stalling Camera Provider",
    state: "idle",
    detailText: "Idle",
    lastError: undefined,
    backendType: "gstreamer",
    backendDisplayName: "Stubbed GStreamer Backend",
    backendState: "running",
    lastCaptureTimestampMs: undefined,
    lastCaptureError: undefined,
    leftDevice: "/dev/video0",
    rightDevice: "/dev/video1",
    capturesAttempted: 0,
    capturesSucceeded: 0,
    capturesFailed: 0,
    lastSuccessfulCaptureTime: undefined,
    lastCaptureDurationMs: undefined,
    averageCaptureDurationMs: undefined,
    effectiveFrameIntervalMs: undefined,
    consecutiveFailureCount: 0,
    startupValidated: true,
    gstLaunchPath: "/usr/bin/gst-launch-1.0",
    captureHealthState: "healthy",
    captureRetryCount: 2,
    captureRetryDelayMs: 200,
    recentRetryAttempts: 0,
    currentRetryAttempt: 0,
    transientFailureCount: 0,
    recoveryCount: 0,
    lastRecoveryTime: undefined,
    lastTerminalFailureTime: undefined,
    telemetryUpdatedAtMs: Date.now(),
  };

  return {
    async start() {
      started = true;
      status.state = "running";
      status.detailText = "Ready for capture.";
      status.telemetryUpdatedAtMs = Date.now();
    },
    async stop() {
      started = false;
      status.state = "stopped";
      status.detailText = "Stopped.";
      status.telemetryUpdatedAtMs = Date.now();
    },
    getStatus() {
      return { ...status };
    },
    async getNextStereoFrame() {
      if (!started) {
        throw new Error("Provider is not started.");
      }

      frameIndex += 1;
      status.capturesAttempted = frameIndex;

      if (firstCapturePending) {
        firstCapturePending = false;
        return new Promise((resolve) => {
          setTimeout(() => {
            status.captureHealthState = "retrying";
            status.detailText = "Retrying capture 1/2 after a transient timeout.";
            status.recentRetryAttempts = 1;
            status.currentRetryAttempt = 1;
            status.transientFailureCount = 1;
            status.lastCaptureError = "Transient timeout";
            status.telemetryUpdatedAtMs = Date.now();
          }, 50);

          setTimeout(() => {
            const timestampMs = Date.now();
            status.captureHealthState = "recovered";
            status.detailText = "Recovered after 1 retry.";
            status.recentRetryAttempts = 1;
            status.currentRetryAttempt = 0;
            status.recoveryCount = 1;
            status.lastRecoveryTime = timestampMs;
            status.capturesSucceeded = 1;
            status.lastSuccessfulCaptureTime = timestampMs;
            status.lastCaptureTimestampMs = timestampMs;
            status.lastFrameIndex = frameIndex;
            status.lastFrameTimestampMs = timestampMs;
            status.lastCaptureDurationMs = 400;
            status.averageCaptureDurationMs = 400;
            status.lastCaptureError = undefined;
            status.lastError = undefined;
            status.telemetryUpdatedAtMs = timestampMs;
            resolve(createProviderFrame(frameIndex, timestampMs, baseFrameBytes));
          }, 450);
        });
      }

      const timestampMs = Date.now();
      status.captureHealthState = "healthy";
      status.detailText = "Captured clean frame.";
      status.recentRetryAttempts = 0;
      status.currentRetryAttempt = 0;
      status.capturesSucceeded += 1;
      status.lastSuccessfulCaptureTime = timestampMs;
      status.lastCaptureTimestampMs = timestampMs;
      status.lastFrameIndex = frameIndex;
      status.lastFrameTimestampMs = timestampMs;
      status.lastCaptureDurationMs = 50;
      status.averageCaptureDurationMs = 225;
      status.telemetryUpdatedAtMs = timestampMs;
      return createProviderFrame(frameIndex, timestampMs, baseFrameBytes);
    },
  };
}

function createHealthyCameraProvider() {
  let started = false;
  let frameIndex = 0;
  const baseFrameBytes = Buffer.from("sender-runtime-healthy-frame", "utf8");
  const status = {
    providerType: "camera",
    providerDisplayName: "Healthy Camera Provider",
    state: "idle",
    detailText: "Idle",
    lastError: undefined,
    backendType: "gstreamer",
    backendDisplayName: "Stubbed GStreamer Backend",
    backendState: "running",
    lastCaptureTimestampMs: undefined,
    lastCaptureError: undefined,
    leftDevice: "/dev/video0",
    rightDevice: "/dev/video1",
    capturesAttempted: 0,
    capturesSucceeded: 0,
    capturesFailed: 0,
    lastSuccessfulCaptureTime: undefined,
    lastCaptureDurationMs: undefined,
    averageCaptureDurationMs: undefined,
    effectiveFrameIntervalMs: undefined,
    consecutiveFailureCount: 0,
    startupValidated: true,
    gstLaunchPath: "/usr/bin/gst-launch-1.0",
    captureHealthState: "healthy",
    captureRetryCount: 2,
    captureRetryDelayMs: 200,
    recentRetryAttempts: 0,
    currentRetryAttempt: 0,
    transientFailureCount: 0,
    recoveryCount: 0,
    lastRecoveryTime: undefined,
    lastTerminalFailureTime: undefined,
    recentCaptureEvents: [],
    telemetryUpdatedAtMs: Date.now(),
  };

  return {
    async start() {
      started = true;
      status.state = "running";
      status.detailText = "Healthy capture loop running.";
      status.telemetryUpdatedAtMs = Date.now();
    },
    async stop() {
      started = false;
      status.state = "stopped";
      status.detailText = "Stopped.";
      status.telemetryUpdatedAtMs = Date.now();
    },
    getStatus() {
      return { ...status };
    },
    async getNextStereoFrame() {
      if (!started) {
        throw new Error("Provider is not started.");
      }

      frameIndex += 1;
      const timestampMs = Date.now();
      status.capturesAttempted = frameIndex;
      status.capturesSucceeded = frameIndex;
      status.lastSuccessfulCaptureTime = timestampMs;
      status.lastCaptureTimestampMs = timestampMs;
      status.lastFrameIndex = frameIndex;
      status.lastFrameTimestampMs = timestampMs;
      status.lastCaptureDurationMs = 40;
      status.averageCaptureDurationMs = 40;
      status.effectiveFrameIntervalMs = 250;
      status.telemetryUpdatedAtMs = timestampMs;

      return createProviderFrame(frameIndex, timestampMs, baseFrameBytes);
    },
  };
}

function createJetsonControlPlaneProvider() {
  let started = false;
  const status = {
    providerType: "camera",
    providerDisplayName: "Jetson Control Plane Provider",
    state: "idle",
    detailText: "Idle",
    lastError: undefined,
    backendType: "jetson",
    backendDisplayName: "Jetson Runtime Control Bridge Backend",
    backendState: "running",
    lastCaptureTimestampMs: undefined,
    lastCaptureError: undefined,
    leftDevice: "/dev/video0",
    rightDevice: "/dev/video1",
    capturesAttempted: 0,
    capturesSucceeded: 0,
    capturesFailed: 0,
    lastSuccessfulCaptureTime: undefined,
    lastCaptureDurationMs: undefined,
    averageCaptureDurationMs: undefined,
    effectiveFrameIntervalMs: 33.3,
    consecutiveFailureCount: 0,
    startupValidated: true,
    gstLaunchPath: "gst-launch-1.0",
    captureHealthState: "healthy",
    captureRetryCount: 0,
    captureRetryDelayMs: 0,
    recentRetryAttempts: 0,
    currentRetryAttempt: 0,
    transientFailureCount: 0,
    recoveryCount: 0,
    lastRecoveryTime: undefined,
    lastTerminalFailureTime: undefined,
    recentCaptureEvents: [],
    telemetryUpdatedAtMs: Date.now(),
    bridgeMode: "jetson_runtime_control_plane",
    frameSourceMode: "control_plane",
    frameSourceName: "jetson_runtime_bridge",
    runtimeProfileName: "quality_1080p30",
    runtimeProfileType: "operational",
    availableProfileNames: ["quality_1080p30", "low_latency_720p60"],
    inputWidth: 1920,
    inputHeight: 1080,
    outputWidth: 3840,
    outputHeight: 1080,
    width: 3840,
    height: 1080,
    outputMode: "fakesink",
    effectiveFps: 30,
    preflightOverallStatus: "pass",
    preflightPassCount: 14,
    preflightWarnCount: 0,
    preflightFailCount: 0,
    preflightCriticalFailCount: 0,
  };

  return {
    async start() {
      started = true;
      status.state = "running";
      status.detailText = "Jetson runtime control bridge ready.";
      status.telemetryUpdatedAtMs = Date.now();
    },
    async stop() {
      started = false;
      status.state = "stopped";
      status.detailText = "Jetson runtime control bridge stopped.";
      status.telemetryUpdatedAtMs = Date.now();
    },
    getStatus() {
      return { ...status };
    },
    shouldAutoSendFrames() {
      return false;
    },
    async handleControlCommand(command) {
      if (
        command.type === "session_command" &&
        command.payload?.action === "select_profile"
      ) {
        status.runtimeProfileName = command.payload.profileName;
        status.inputWidth = 1280;
        status.inputHeight = 720;
        status.outputWidth = 2560;
        status.outputHeight = 720;
        status.width = 2560;
        status.height = 720;
        status.effectiveFps = 60;
        status.detailText = "Jetson profile switched to low_latency_720p60.";
        status.telemetryUpdatedAtMs = Date.now();
        return {
          handled: true,
          refreshCapabilities: true,
          statusText: status.detailText,
        };
      }

      return {
        handled: false,
      };
    },
    async getNextStereoFrame() {
      if (started) {
        throw new Error("Control-plane provider should not emit stereo frames.");
      }
      throw new Error("Provider is not started.");
    },
  };
}

function createJetsonPreviewBridgeProvider() {
  let started = false;
  let frameIndex = 0;
  const baseFrameBytes = Buffer.from("jetson-preview-provider-frame", "utf8");
  const status = {
    providerType: "camera",
    providerDisplayName: "Jetson Preview Bridge Provider",
    state: "idle",
    detailText: "Idle",
    lastError: undefined,
    backendType: "jetson",
    backendDisplayName: "Jetson Runtime Preview Bridge Backend",
    backendState: "running",
    lastCaptureTimestampMs: undefined,
    lastCaptureError: undefined,
    leftDevice: "/dev/video0",
    rightDevice: "/dev/video1",
    capturesAttempted: 0,
    capturesSucceeded: 0,
    capturesFailed: 0,
    lastSuccessfulCaptureTime: undefined,
    lastCaptureDurationMs: undefined,
    averageCaptureDurationMs: undefined,
    effectiveFrameIntervalMs: 500,
    consecutiveFailureCount: 0,
    startupValidated: true,
    gstLaunchPath: "gst-launch-1.0",
    captureHealthState: "healthy",
    captureRetryCount: 0,
    captureRetryDelayMs: 0,
    recentRetryAttempts: 0,
    currentRetryAttempt: 0,
    transientFailureCount: 0,
    recoveryCount: 0,
    lastRecoveryTime: undefined,
    lastTerminalFailureTime: undefined,
    recentCaptureEvents: [],
    telemetryUpdatedAtMs: Date.now(),
    bridgeMode: "jetson_runtime_preview_bridge",
    frameSourceMode: "camera",
    frameSourceName: "jetson_runtime_preview",
    runtimeProfileName: "headset_preview_720p60",
    runtimeProfileType: "operational",
    availableProfileNames: ["headset_preview_720p60", "low_latency_720p60"],
    inputWidth: 1280,
    inputHeight: 720,
    outputWidth: 2560,
    outputHeight: 720,
    width: 1280,
    height: 720,
    outputMode: "fakesink",
    effectiveFps: 60,
    preflightOverallStatus: "pass",
    preflightPassCount: 14,
    preflightWarnCount: 0,
    preflightFailCount: 0,
    preflightCriticalFailCount: 0,
  };

  return {
    async start() {
      started = true;
      status.state = "running";
      status.detailText = "Jetson preview live.";
      status.telemetryUpdatedAtMs = Date.now();
    },
    async stop() {
      started = false;
      status.state = "stopped";
      status.detailText = "Jetson preview bridge stopped.";
      status.telemetryUpdatedAtMs = Date.now();
    },
    getStatus() {
      return { ...status };
    },
    shouldAutoSendFrames() {
      return true;
    },
    async handleControlCommand() {
      return {
        handled: false,
      };
    },
    async getNextStereoFrame() {
      if (!started) {
        throw new Error("Provider is not started.");
      }

      frameIndex += 1;
      const timestampMs = Date.now();
      status.capturesAttempted = frameIndex;
      status.capturesSucceeded = frameIndex;
      status.lastCaptureTimestampMs = timestampMs;
      status.lastSuccessfulCaptureTime = timestampMs;
      status.detailText = "Jetson preview live.";
      status.telemetryUpdatedAtMs = timestampMs;
      return createProviderFrame(frameIndex, timestampMs, baseFrameBytes);
    },
  };
}

function createProviderFrame(frameIndex, timestampMs, baseFrameBytes) {
  return {
    frameIndex,
    timestampMs,
    providerType: "camera",
    overlayLabel: `Frame ${frameIndex}`,
    tags: ["camera-provider", "test"],
    extras: {
      providerType: "camera",
      captureBackend: "gstreamer",
      leftCameraDevice: "/dev/video0",
      rightCameraDevice: "/dev/video1",
    },
    left: {
      bytes: baseFrameBytes,
      mimeType: "image/jpeg",
      byteSize: baseFrameBytes.byteLength,
      sourceLabel: "left.jpg",
      width: 640,
      height: 360,
      title: "Left",
      markerText: "LEFT",
      backgroundHex: "#0f385d",
      accentHex: "#9ee6ff",
      metadata: {
        eye: "left",
      },
    },
    right: {
      bytes: baseFrameBytes,
      mimeType: "image/jpeg",
      byteSize: baseFrameBytes.byteLength,
      sourceLabel: "right.jpg",
      width: 640,
      height: 360,
      title: "Right",
      markerText: "RIGHT",
      backgroundHex: "#46185d",
      accentHex: "#f0c8ff",
      metadata: {
        eye: "right",
      },
    },
  };
}

async function waitForServerListening(server) {
  if (server.address()) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
}
