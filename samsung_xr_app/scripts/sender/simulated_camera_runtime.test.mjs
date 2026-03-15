import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { SimulatedIrIlluminatorController } from "./ir/simulated_ir_illuminator_controller.mjs";
import { UnavailableIrIlluminatorController } from "./ir/unavailable_ir_illuminator_controller.mjs";
import { startJetsonSenderPrototype } from "./sender_runtime.mjs";
import { SimulatedThermalBackend } from "./thermal/simulated_thermal_backend.mjs";

describe("sender runtime with simulated camera backend", () => {
  afterEach(() => {
    // no-op; server cleanup happens inside each test
  });

  it("emits camera-mode source_status and stereo_frame messages using the simulated backend", async () => {
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

    await waitFor(() => {
      return messages.some((message) => message.messageType === "stereo_frame");
    }, 4000);

    const sourceStatusMessage = messages.find((message) => {
      return (
        message.messageType === "source_status" &&
        message.payload?.cameraTelemetry?.captureBackendName === "simulated"
      );
    });
    const stereoFrameMessage = messages.find((message) => {
      return message.messageType === "stereo_frame";
    });

    expect(sourceStatusMessage?.payload?.sourceState).toBe("running");
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.startupValidated).toBe(true);
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.capturesSucceeded).toBeTypeOf(
      "number",
    );
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.leftCameraDevice).toContain(
      "simulated://left-camera",
    );
    expect(sourceStatusMessage?.payload?.cameraTelemetry?.rightCameraDevice).toContain(
      "simulated://right-camera",
    );
    expect(stereoFrameMessage?.payload?.left?.image?.base64Data).toBeTruthy();
    expect(stereoFrameMessage?.payload?.right?.image?.base64Data).toBeTruthy();
    expect(stereoFrameMessage?.payload?.left?.title).toBe("Simulated Camera Snapshot");
    expect(stereoFrameMessage?.payload?.right?.title).toBe("Simulated Camera Snapshot");

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("emits optional thermal and IR telemetry when the simulated subsystems are enabled", async () => {
    const server = await startJetsonSenderPrototype(
      createRuntimeConfig({
        thermalSimulated: true,
        thermalOverlayMode: "thermal_fusion_envg",
        irSimulated: true,
        irEnabled: true,
        irLevel: 3,
        irMaxLevel: 5,
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
    }, 4000);

    const capabilitiesMessage = messages.find((message) => {
      return message.messageType === "capabilities";
    });
    const sourceStatusMessage = messages.find((message) => {
      return (
        message.messageType === "source_status" &&
        message.payload?.thermalTelemetry &&
        message.payload?.irIlluminatorStatus
      );
    });
    const stereoFrameMessage = messages.find((message) => {
      return message.messageType === "stereo_frame" && message.payload?.thermalFrame;
    });

    expect(capabilitiesMessage?.payload?.thermalAvailable).toBe(true);
    expect(capabilitiesMessage?.payload?.supportedThermalOverlayModes).toContain(
      "thermal_fusion_envg",
    );
    expect(capabilitiesMessage?.payload?.irAvailable).toBe(true);
    expect(capabilitiesMessage?.payload?.irControlSupported).toBe(true);
    expect(sourceStatusMessage?.payload?.thermalTelemetry?.currentOverlayMode).toBe(
      "thermal_fusion_envg",
    );
    expect(sourceStatusMessage?.payload?.irIlluminatorStatus?.irEnabled).toBe(true);
    expect(sourceStatusMessage?.payload?.irIlluminatorStatus?.irLevel).toBe(3);
    expect(stereoFrameMessage?.payload?.thermalOverlayMode).toBe(
      "thermal_fusion_envg",
    );
    expect(stereoFrameMessage?.payload?.thermalFrame?.thermalValues?.length).toBeGreaterThan(
      0,
    );
    expect(
      stereoFrameMessage?.payload?.thermalFrame?.hotspotAnnotations?.length,
    ).toBeGreaterThan(0);

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("applies live thermal and IR control updates without restarting the sender", async () => {
    const server = await startJetsonSenderPrototype(
      createRuntimeConfig({
        thermalSimulated: true,
        thermalOverlayMode: "thermal_fusion_envg",
        irSimulated: true,
        irEnabled: false,
        irLevel: 0,
        irMaxLevel: 4,
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
          message.payload?.thermalTelemetry?.currentOverlayMode ===
            "thermal_fusion_envg" &&
          message.payload?.irIlluminatorStatus?.irLevel === 0
        );
      });
    }, 4000);

    socket.send(
      JSON.stringify({
        type: "settings_patch",
        timestampMs: Date.now(),
        payload: {
          changes: {
            thermalOverlayMode: "hot_edges",
            irEnabled: true,
            irLevel: 4,
          },
        },
      }),
    );

    await waitFor(() => {
      return messages.some((message) => {
        return (
          message.messageType === "source_status" &&
          message.payload?.thermalTelemetry?.currentOverlayMode === "hot_edges" &&
          message.payload?.irIlluminatorStatus?.irEnabled === true &&
          message.payload?.irIlluminatorStatus?.irLevel === 4
        );
      });
    }, 4000);
    await waitFor(() => {
      return messages.some((message) => {
        return (
          message.messageType === "stereo_frame" &&
          message.payload?.thermalOverlayMode === "hot_edges"
        );
      });
    }, 4000);

    expect(
      messages.some((message) => {
        return (
          message.messageType === "capabilities" &&
          message.payload?.irEnabled === true &&
          message.payload?.irLevel === 4
        );
      }),
    ).toBe(true);
    expect(
      messages.some((message) => {
        return (
          message.messageType === "stereo_frame" &&
          message.payload?.thermalOverlayMode === "hot_edges"
        );
      }),
    ).toBe(true);

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("keeps running safely when live control commands target unavailable thermal and IR subsystems", async () => {
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

    await waitFor(() => {
      return messages.some((message) => message.messageType === "stereo_frame");
    }, 4000);

    const stereoFrameCountBeforeControl = messages.filter((message) => {
      return message.messageType === "stereo_frame";
    }).length;

    socket.send(
      JSON.stringify({
        type: "settings_patch",
        timestampMs: Date.now(),
        payload: {
          changes: {
            thermalOverlayMode: "full_thermal",
            irEnabled: true,
            irLevel: 3,
          },
        },
      }),
    );

    await waitFor(() => {
      return (
        messages.filter((message) => message.messageType === "stereo_frame").length >
        stereoFrameCountBeforeControl
      );
    }, 4000);

    expect(
      messages.some((message) => {
        return (
          message.messageType === "source_status" &&
          message.payload?.irIlluminatorStatus?.irAvailable === false
        );
      }),
    ).toBe(true);
    expect(
      messages.some((message) => {
        return (
          message.messageType === "capabilities" &&
          message.payload?.thermalAvailable === false &&
          message.payload?.irAvailable === false
        );
      }),
    ).toBe(true);

    socket.close();
    await new Promise((resolve) => {
      socket.once("close", resolve);
    });
    await closeServer(server);
  });

  it("updates the simulated thermal and IR control seams through operator settings", async () => {
    const thermalBackend = new SimulatedThermalBackend({
      thermalOverlayMode: "thermal_fusion_envg",
    });
    const irController = new SimulatedIrIlluminatorController({
      irEnabled: false,
      irLevel: 0,
      irMaxLevel: 2,
    });

    thermalBackend.setOverlayMode("full_thermal");
    await irController.enable();
    await irController.setLevel(99);

    expect(thermalBackend.getStatus().currentOverlayMode).toBe("full_thermal");
    expect(irController.getStatus().irEnabled).toBe(true);
    expect(irController.getStatus().irLevel).toBe(2);
    expect(irController.getStatus().irMaxLevel).toBe(2);
  });

  it("ignores IR commands safely when the controller is unavailable", async () => {
    const irController = new UnavailableIrIlluminatorController();

    await irController.enable();
    await irController.setLevel(4);
    await irController.disable();

    expect(irController.getStatus().irAvailable).toBe(false);
    expect(irController.getStatus().irEnabled).toBe(false);
    expect(irController.getStatus().irLevel).toBe(0);
    expect(irController.getStatus().irControlSupported).toBe(false);
  });
});

function createRuntimeConfig(overrides = {}) {
  return {
    host: "127.0.0.1",
    port: 0,
    path: "/jetson/messages",
    fps: 2,
    senderName: "simulated_camera_runtime_test",
    senderVersion: "0.1.0-test",
    streamName: "simulated_camera_runtime_stream",
    imageMode: "base64",
    provider: "camera",
    cameraProfile: "default",
    captureBackend: "simulated",
    leftCameraId: "sim-left",
    rightCameraId: "sim-right",
    leftCameraDevice: undefined,
    rightCameraDevice: undefined,
    captureWidth: 640,
    captureHeight: 360,
    captureTimeoutMs: 3000,
    captureJpegQuality: 75,
    captureWarmupFrames: 0,
    captureRetryCount: 2,
    captureRetryDelayMs: 0,
    faultInjectEveryNCaptures: 0,
    faultInjectFailureCount: 1,
    faultInjectMode: "transient",
    faultInjectStartAfterCaptures: 0,
    faultInjectHeartbeatDrop: false,
    faultInjectHeartbeatDropAfterMs: 3000,
    healthLog: false,
    healthLogIntervalMs: 5000,
    maxRecommendedPayloadBytes: 256 * 1024,
    thermalSimulated: false,
    thermalOverlayMode: "thermal_fusion_envg",
    thermalFrameWidth: 32,
    thermalFrameHeight: 24,
    thermalFrameRate: 9,
    irSimulated: false,
    irEnabled: false,
    irLevel: 0,
    irMaxLevel: 5,
    ...overrides,
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
