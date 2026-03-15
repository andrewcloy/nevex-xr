import process from "node:process";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildCapabilitiesEnvelope,
  buildErrorEnvelope,
  buildSourceStatusEnvelope,
  buildStereoFrameEnvelope,
  buildTransportStatusEnvelope,
  createJetsonCapabilitiesPayload,
} from "../../jetson_sender_helpers.mjs";
import { createFrameProvider } from "./frame_provider_factory.mjs";
import { parseSenderControlCommand } from "./control_message_protocol.mjs";
import { createIrIlluminatorController } from "./ir/ir_illuminator_controller_factory.mjs";
import {
  formatRecentCaptureEvent,
  shouldDropHeartbeat,
} from "./fault_injection.mjs";
import { createProtocolImagePayload } from "./frame_provider_support.mjs";
import { encodeBinaryStereoFrameMessage } from "./jetson_binary_stereo_frame_message.mjs";
import { parseSenderCliArgs } from "./sender_config.mjs";
import { createThermalFrameProvider } from "./thermal/thermal_frame_provider_factory.mjs";

const MIN_SOURCE_STATUS_HEARTBEAT_INTERVAL_MS = 250;
const MAX_SOURCE_STATUS_HEARTBEAT_INTERVAL_MS = 1000;
const SOURCE_STATUS_CAMERA_TELEMETRY_NON_NEGATIVE_NUMBER_FIELDS = new Set([
  "capturesAttempted",
  "capturesSucceeded",
  "capturesFailed",
  "consecutiveFailureCount",
  "lastSuccessfulCaptureTime",
  "lastCaptureDurationMs",
  "averageCaptureDurationMs",
  "effectiveFrameIntervalMs",
  "captureRetryCount",
  "captureRetryDelayMs",
  "recentRetryAttempts",
  "currentRetryAttempt",
  "transientFailureCount",
  "recoveryCount",
  "lastRecoveryTime",
  "lastTerminalFailureTime",
  "replayCurrentIndex",
  "replayFrameCount",
  "replayManifestErrorCount",
  "replayManifestWarningCount",
  "replayRecordedTimestamp",
  "replayDelayUntilNextMs",
  "replayScaledDelayUntilNextMs",
  "replayTimingOffsetMs",
  "replayNominalLoopDurationMs",
  "replayScaledLoopDurationMs",
  "inputWidth",
  "inputHeight",
  "outputWidth",
  "outputHeight",
  "effectiveFps",
  "recordDurationSeconds",
  "testDurationSeconds",
  "queueMaxSizeBuffers",
  "artifactSizeBytes",
  "preflightPassCount",
  "preflightWarnCount",
  "preflightFailCount",
  "preflightCriticalFailCount",
]);

export async function startJetsonSenderRuntime(config) {
  const server = new WebSocketServer({
    host: config.host,
    port: config.port,
    path: config.path,
  });

  server.on("connection", (socket, request) => {
    void handleClientConnection({
      socket,
      config,
      remoteLabel: `${request.socket.remoteAddress ?? "unknown"}:${request.socket.remotePort ?? "?"}`,
    }).catch((error) => {
      console.error("[sender-prototype] unhandled client connection error:", error);
    });
  });

  server.on("error", (error) => {
    console.error("[sender-prototype] server error:", error);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      console.log(`[sender-prototype] shutting down on ${signal}`);
      server.close(() => {
        process.exit(0);
      });
    });
  }

  return server;
}

export const startJetsonSenderPrototype = startJetsonSenderRuntime;

export function logJetsonSenderRuntimeStartup(config) {
  console.log(
    `[sender-prototype] listening on ws://${config.host}:${config.port}${config.path}`,
  );
  console.log(
    `[sender-prototype] sender: ${config.senderName} ${config.senderVersion}`,
  );
  console.log(
    `[sender-prototype] provider: ${config.provider} | fps: ${config.fps.toFixed(2)} | image mode: ${config.imageMode}`,
  );
  if (config.healthLog) {
    console.log(
      `[sender-prototype] health logging: enabled (compact, every ${config.healthLogIntervalMs} ms)`,
    );
  }
  if (config.thermalSimulated) {
    console.log(
      `[sender-prototype] thermal simulation: enabled (${config.thermalFrameWidth}x${config.thermalFrameHeight} @ ${config.thermalFrameRate} FPS, mode=${config.thermalOverlayMode})`,
    );
  }
  if (config.irSimulated) {
    console.log(
      `[sender-prototype] IR illuminator simulation: enabled (level=${config.irLevel}/${config.irMaxLevel}, enabled=${config.irEnabled ? "true" : "false"})`,
    );
  }

  if (config.provider === "still") {
    console.log(`[sender-prototype] left image: ${config.leftImagePath}`);
    console.log(`[sender-prototype] right image: ${config.rightImagePath}`);
    return;
  }

  if (config.provider === "sequence") {
    console.log(
      `[sender-prototype] left sequence: ${config.leftSequenceFiles.length > 0 ? config.leftSequenceFiles.join(", ") : config.leftSequenceDir}`,
    );
    console.log(
      `[sender-prototype] right sequence: ${config.rightSequenceFiles.length > 0 ? config.rightSequenceFiles.join(", ") : config.rightSequenceDir}`,
    );
    console.log(
      `[sender-prototype] sequence loop: ${config.sequenceLoop ? "enabled" : "disabled"}`,
    );
    return;
  }

  if (config.provider === "camera") {
    const leftCameraTarget =
      config.captureBackend === "replay"
        ? formatReplayInputConfig(config.leftReplayFiles, config.leftReplayDir)
        : config.leftCameraDevice ?? String(config.leftCameraId);
    const rightCameraTarget =
      config.captureBackend === "replay"
        ? formatReplayInputConfig(config.rightReplayFiles, config.rightReplayDir)
        : config.rightCameraDevice ?? String(config.rightCameraId);
    console.log(
      `[sender-prototype] camera provider: backend=${config.captureBackend}, profile=${config.cameraProfile}, left=${leftCameraTarget}, right=${rightCameraTarget}, capture=${config.captureWidth}x${config.captureHeight}`,
    );
    console.log(
      `[sender-prototype] camera settings: timeout=${config.captureTimeoutMs}ms, jpeg quality=${config.captureJpegQuality}, warm-up=${config.captureWarmupFrames}, retries=${config.captureRetryCount} x ${config.captureRetryDelayMs}ms, fps=${config.fps.toFixed(2)}`,
    );
    if (config.captureBackend === "simulated") {
      console.log(
        "[sender-prototype] simulated camera backend active: camera-mode rehearsal will run without Linux, /dev/video devices, or gst-launch.",
      );
    }
    if (config.captureBackend === "replay") {
      console.log(
        `[sender-prototype] replay camera backend active: left=${formatReplayInputConfig(config.leftReplayFiles, config.leftReplayDir)}, right=${formatReplayInputConfig(config.rightReplayFiles, config.rightReplayDir)}, loop=${config.replayLoop ? "enabled" : "disabled"}, timing=${config.replayFpsMode}, time-scale=${config.replayTimeScale}x${config.replayManifestPath ? `, manifest=${config.replayManifestPath}` : ""}`,
      );
    }
    if (config.captureBackend === "jetson") {
      console.log(
        `[sender-prototype] jetson runtime bridge active: app=${config.jetsonRuntimeAppPath}, config=${config.jetsonRuntimeConfigPath}, profile=${config.jetsonRuntimeProfile ?? "default_from_runtime"}, preflight_on_start=${config.jetsonRunPreflightOnStart ? "true" : "false"}`,
      );
      if (config.jetsonPreviewEnabled) {
        console.log(
          `[sender-prototype] jetson preview bridge active: a persistent Jetson-owned preview publisher will keep one warm preview pipeline active and deliver Jetson-authored left/right JPEG preview pairs through shared-memory ring-buffer slots while stdout carries only framed metadata; the sender now lazily reads slots with reusable scratch buffers at ${config.fps.toFixed(2)} FPS target using ${config.imageMode} payloads${config.imageMode === "binary_frame" ? " so preview JPEGs can cross the sender-to-XR WebSocket hop without base64/data_url string materialization" : ""}.`,
        );
      } else {
        console.log(
          "[sender-prototype] jetson backend mode: diagnostics and bounded snapshot/record actions are live; continuous stereo_frame transport is intentionally disabled in this bridge mode.",
        );
      }
    }
    if (config.faultInjectEveryNCaptures > 0) {
      console.warn(
        `[sender-prototype] fault injection: capture every ${config.faultInjectEveryNCaptures}, failures=${config.faultInjectFailureCount}, mode=${config.faultInjectMode}, start-after=${config.faultInjectStartAfterCaptures}`,
      );
    }
    if (config.faultInjectHeartbeatDrop) {
      console.warn(
        `[sender-prototype] fault injection: dropping source_status after ${config.faultInjectHeartbeatDropAfterMs}ms`,
      );
    }
    return;
  }

  console.log("[sender-prototype] generated provider: dynamic SVG test patterns.");
}

export const logSenderStartup = logJetsonSenderRuntimeStartup;

export async function runJetsonSenderRuntimeCli(
  argv = process.argv.slice(2),
) {
  const config = parseSenderCliArgs(argv);
  logJetsonSenderRuntimeStartup(config);
  await startJetsonSenderRuntime(config);
  return config;
}

async function handleClientConnection(options) {
  const { socket, config, remoteLabel } = options;
  const frameProvider = createFrameProvider(config);
  const thermalFrameProvider = createThermalFrameProvider(config);
  const irIlluminatorController = createIrIlluminatorController(config);
  let sequence = 0;
  let frameId = 0;
  let frameTimer;
  let sourceStatusTimer;
  let healthLogTimer;
  let lastHealthTransitionKey;
  let heartbeatDropLogged = false;
  let warnedOversize = false;
  const connectionStartedAtMs = Date.now();

  console.log(`[sender-prototype] client connected from ${remoteLabel}`);

  const warnIfPayloadOversize = (byteSize) => {
    if (
      warnedOversize ||
      config.maxRecommendedPayloadBytes <= 0 ||
      byteSize <= config.maxRecommendedPayloadBytes
    ) {
      return;
    }

    warnedOversize = true;
    console.warn(
      `[sender-prototype] warning: message size ${byteSize} bytes exceeds recommended ${config.maxRecommendedPayloadBytes} bytes.`,
    );
  };

  const sendEnvelope = (envelope) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const serializedEnvelope = JSON.stringify(envelope);
    const byteSize = Buffer.byteLength(serializedEnvelope, "utf8");
    warnIfPayloadOversize(byteSize);
    socket.send(serializedEnvelope, (error) => {
      if (error) {
        console.error(
          `[sender-prototype] socket send error for ${remoteLabel}:`,
          error,
        );
      }
    });
  };

  const sendBinaryStereoFrameEnvelope = (envelope, providerFrame) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const binaryMessage = encodeBinaryStereoFrameMessage({
      envelope,
      leftImageBytes: providerFrame.left.bytes,
      rightImageBytes: providerFrame.right.bytes,
    });
    warnIfPayloadOversize(binaryMessage.byteLength);
    socket.send(
      binaryMessage,
      {
        binary: true,
      },
      (error) => {
        if (error) {
          console.error(
            `[sender-prototype] binary send error for ${remoteLabel}:`,
            error,
          );
        }
      },
    );
  };

  const nextSequence = () => {
    sequence += 1;
    return sequence;
  };

  const clearScheduledFrame = () => {
    clearTimeout(frameTimer);
    frameTimer = undefined;
  };

  const sendSourceStatus = (overrides = {}, timestampMs = Date.now()) => {
    if (
      shouldDropHeartbeat({
        enabled: Boolean(config.faultInjectHeartbeatDrop),
        connectionStartedAtMs,
        nowMs: timestampMs,
        dropAfterMs: config.faultInjectHeartbeatDropAfterMs,
      })
    ) {
      if (!heartbeatDropLogged) {
        heartbeatDropLogged = true;
        console.warn(
          `[sender-health-event] client=${remoteLabel} event=heartbeat_drop after=${config.faultInjectHeartbeatDropAfterMs}ms`,
        );
      }
      return;
    }

    const providerStatus = frameProvider.getStatus();
    const thermalProviderStatus = thermalFrameProvider?.getStatus();
    const irIlluminatorStatus = irIlluminatorController.getStatus();
    maybeLogHealthTransition(providerStatus, config, remoteLabel, {
      lastHealthTransitionKey,
      setLastHealthTransitionKey: (value) => {
        lastHealthTransitionKey = value;
      },
    });
    sendEnvelope(
      buildSourceStatusEnvelope(
        {
          sourceState: resolveSourceState(providerStatus),
          lastFrameId:
            typeof overrides.lastFrameId === "number"
              ? overrides.lastFrameId
              : providerStatus.lastFrameIndex,
          lastTimestampMs:
            typeof overrides.lastTimestampMs === "number"
              ? overrides.lastTimestampMs
              : providerStatus.lastCaptureTimestampMs ??
                providerStatus.lastFrameTimestampMs,
          lastError:
            overrides.lastError !== undefined
              ? overrides.lastError
              : providerStatus.lastCaptureError ?? providerStatus.lastError,
          statusText:
            overrides.statusText !== undefined
              ? overrides.statusText
              : providerStatus.detailText,
          telemetryUpdatedAtMs: providerStatus.telemetryUpdatedAtMs,
          cameraTelemetry: createSourceStatusCameraTelemetry(providerStatus),
          thermalTelemetry: createSourceStatusThermalTelemetry(
            thermalProviderStatus,
          ),
          irIlluminatorStatus: createSourceStatusIrIlluminatorStatus(
            irIlluminatorStatus,
          ),
        },
        {
          timestampMs,
          sequence: nextSequence(),
        },
      ),
    );
  };

  const sendTransportStatus = (overrides = {}, timestampMs = Date.now()) => {
    sendEnvelope(
      buildTransportStatusEnvelope(
        {
          transportState: "running",
          connected: true,
          ...overrides,
        },
        {
          timestampMs,
          sequence: nextSequence(),
        },
      ),
    );
  };

  const sendProviderError = (error, messagePrefix) => {
    const message = `${messagePrefix}${error instanceof Error ? error.message : String(error)}`;
    sendEnvelope(
      buildErrorEnvelope(
        {
          code: "source_provider_error",
          stage: "source",
          recoverable: false,
          message,
        },
        {
          sequence: nextSequence(),
        },
      ),
    );
    sendSourceStatus(
      {
        lastError: message,
      },
      Date.now(),
    );
  };

  const sendStereoFrame = async () => {
    try {
      const providerFrame = await frameProvider.getNextStereoFrame();
      const thermalFrame = await captureThermalFrameSafely({
        thermalFrameProvider,
        remoteLabel,
      });
      frameId += 1;
      sendSourceStatus(
        {
          lastFrameId: frameId,
          lastTimestampMs: providerFrame.timestampMs,
        },
        providerFrame.timestampMs,
      );
      const stereoFrameEnvelope = buildStereoFrameEnvelope(
        createStereoFramePayload({
          config,
          frameId,
          providerFrame,
          thermalFrame,
          thermalStatus: thermalFrameProvider?.getStatus(),
        }),
        {
          timestampMs: providerFrame.timestampMs,
          sequence: nextSequence(),
        },
      );
      if (config.imageMode === "binary_frame") {
        sendBinaryStereoFrameEnvelope(stereoFrameEnvelope, providerFrame);
      } else {
        sendEnvelope(stereoFrameEnvelope);
      }
      return providerFrame;
    } catch (error) {
      clearScheduledFrame();
      console.error(
        `[sender-prototype] frame provider error for ${remoteLabel}:`,
        error,
      );
      sendProviderError(error, "Frame provider failed: ");
      return undefined;
    }
  };

  const scheduleNextFrame = (delayMs) => {
    clearScheduledFrame();
    frameTimer = setTimeout(() => {
      void sendStereoFrameLoop();
    }, Math.max(0, Math.round(delayMs)));
  };

  const sendStereoFrameLoop = async () => {
    const providerFrame = await sendStereoFrame();
    if (!providerFrame) {
      return;
    }

    scheduleNextFrame(resolveNextStereoFrameDelayMs(config, providerFrame));
  };

  const logHealthSummary = () => {
    const providerStatus = frameProvider.getStatus();
    maybeLogHealthTransition(providerStatus, config, remoteLabel, {
      lastHealthTransitionKey,
      setLastHealthTransitionKey: (value) => {
        lastHealthTransitionKey = value;
      },
    });
    console.log(formatHealthLogLine(providerStatus, config, remoteLabel));
  };

  const sendCapabilitiesSnapshot = () => {
    const providerStatus = frameProvider.getStatus();
    const thermalStatus = thermalFrameProvider?.getStatus();
    const irStatus = irIlluminatorController.getStatus();
    sendEnvelope(
      buildCapabilitiesEnvelope(
        createJetsonCapabilitiesPayload({
          senderName: config.senderName,
          senderVersion: config.senderVersion,
          supportedImagePayloadModes: ["base64", "data_url", "binary_frame"],
          maxRecommendedPayloadBytes: config.maxRecommendedPayloadBytes,
          stereoFormatNote: describeStereoFormatNote(config, providerStatus),
          thermalAvailable: thermalStatus?.thermalAvailable ?? false,
          thermalBackendIdentity: thermalStatus?.thermalBackendIdentity,
          thermalFrameWidth: thermalStatus?.thermalFrameWidth,
          thermalFrameHeight: thermalStatus?.thermalFrameHeight,
          thermalFrameRate: thermalStatus?.thermalFrameRate,
          thermalOverlaySupported: thermalStatus?.thermalOverlaySupported ?? false,
          supportedThermalOverlayModes: thermalStatus?.supportedThermalOverlayModes,
          thermalHealthState: thermalStatus?.thermalHealthState ?? "unavailable",
          thermalErrorText: thermalStatus?.thermalErrorText,
          irAvailable: irStatus.irAvailable,
          irBackendIdentity: irStatus.irBackendIdentity,
          irEnabled: irStatus.irEnabled,
          irLevel: irStatus.irLevel,
          irMaxLevel: irStatus.irMaxLevel,
          irControlSupported: irStatus.irControlSupported,
          irFaultState: irStatus.irFaultState,
          irErrorText: irStatus.irErrorText,
        }),
        {
          sequence: nextSequence(),
        },
      ),
    );
  };

  const applyLiveControlChanges = async (changes = {}) => {
    let appliedLocalChanges = false;
    if (
      typeof changes.thermalOverlayMode === "string" &&
      thermalFrameProvider?.setOverlayMode
    ) {
      thermalFrameProvider.setOverlayMode(changes.thermalOverlayMode);
      config.thermalOverlayMode = changes.thermalOverlayMode;
      appliedLocalChanges = true;
    }

    if (typeof changes.irEnabled === "boolean") {
      if (changes.irEnabled) {
        await irIlluminatorController.enable();
      } else {
        await irIlluminatorController.disable();
      }
      config.irEnabled = changes.irEnabled;
      appliedLocalChanges = true;
    }

    if (typeof changes.irLevel === "number" && changes.irEnabled !== false) {
      await irIlluminatorController.setLevel(changes.irLevel);
      const nextIrStatus = irIlluminatorController.getStatus();
      config.irLevel = nextIrStatus.irLevel;
      config.irEnabled = nextIrStatus.irEnabled;
      appliedLocalChanges = true;
    } else if (typeof changes.irEnabled === "boolean") {
      const nextIrStatus = irIlluminatorController.getStatus();
      config.irLevel = nextIrStatus.irLevel;
      config.irEnabled = nextIrStatus.irEnabled;
    }

    if (appliedLocalChanges) {
      sendCapabilitiesSnapshot();
      sendSourceStatus(
        {
          statusText: "Operator control settings applied.",
        },
        Date.now(),
      );
    }

    return appliedLocalChanges;
  };

  const handleFrameProviderControlCommand = async (command) => {
    if (!supportsFrameProviderControlCommands(frameProvider)) {
      return { handled: false };
    }

    return frameProvider.handleControlCommand(command);
  };

  const sendUnsupportedControlCommand = (commandLabel) => {
    const message = `Unsupported control command: ${commandLabel}.`;
    sendEnvelope(
      buildErrorEnvelope(
        {
          code: "unsupported_control_command",
          stage: "source",
          recoverable: true,
          message,
        },
        {
          sequence: nextSequence(),
        },
      ),
    );
    sendSourceStatus(
      {
        statusText: message,
      },
      Date.now(),
    );
  };

  const handleControlMessage = async (data) => {
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(normalizeSocketMessageData(data));
    } catch (error) {
      sendEnvelope(
        buildErrorEnvelope(
          {
            code: "invalid_control_command",
            stage: "parse",
            recoverable: true,
            message:
              error instanceof Error
                ? error.message
                : "Invalid control command JSON.",
          },
          {
            sequence: nextSequence(),
          },
        ),
      );
      return;
    }

    let command;
    try {
      command = parseSenderControlCommand(parsedMessage);
    } catch (error) {
      sendEnvelope(
        buildErrorEnvelope(
          {
            code: "invalid_control_command",
            stage: "parse",
            recoverable: true,
            message:
              error instanceof Error
                ? error.message
                : "Invalid outbound control command.",
          },
          {
            sequence: nextSequence(),
          },
        ),
      );
      return;
    }

    switch (command.type) {
      case "settings_patch":
        if (Object.keys(command.payload.changes).length === 0) {
          return;
        }
        try {
          const appliedLocalChanges = await applyLiveControlChanges(
            command.payload.changes,
          );
          const providerResult = await handleFrameProviderControlCommand(command);
          if (providerResult.handled) {
            if (providerResult.refreshCapabilities) {
              sendCapabilitiesSnapshot();
            }
            sendSourceStatus(
              {
                statusText: providerResult.statusText,
                lastError: undefined,
              },
              Date.now(),
            );
          } else if (appliedLocalChanges) {
            sendSourceStatus(
              {
                statusText: "Applied local runtime settings.",
                lastError: undefined,
              },
              Date.now(),
            );
          }
        } catch (error) {
          sendEnvelope(
            buildErrorEnvelope(
              {
                code: "jetson_bridge_command_failed",
                stage: "source",
                recoverable: true,
                message:
                  error instanceof Error
                    ? error.message
                    : "Jetson bridge control command failed.",
              },
              {
                sequence: nextSequence(),
              },
            ),
          );
          sendSourceStatus(
            {
              lastError:
                error instanceof Error ? error.message : String(error),
            },
            Date.now(),
          );
        }
        break;
      case "brightness_command":
      case "overlay_command":
      case "viewer_command":
      case "diagnostics_command":
        sendUnsupportedControlCommand(command.type);
        break;
      case "session_command":
        try {
          const providerResult = await handleFrameProviderControlCommand(command);
          if (providerResult.handled) {
            if (providerResult.refreshCapabilities) {
              sendCapabilitiesSnapshot();
            }
            sendSourceStatus(
              {
                statusText: providerResult.statusText,
                lastError: undefined,
              },
              Date.now(),
            );
            break;
          }
        } catch (error) {
          sendEnvelope(
            buildErrorEnvelope(
              {
                code: "jetson_bridge_command_failed",
                stage: "source",
                recoverable: true,
                message:
                  error instanceof Error
                    ? error.message
                    : "Jetson bridge control command failed.",
              },
              {
                sequence: nextSequence(),
              },
            ),
          );
          sendSourceStatus(
            {
              lastError:
                error instanceof Error ? error.message : String(error),
            },
            Date.now(),
          );
          break;
        }
        sendUnsupportedControlCommand(
          `session_command:${command.payload?.action ?? "unknown"}`,
        );
        break;
    }
  };

  socket.on("message", (data) => {
    void handleControlMessage(data);
  });

  sendCapabilitiesSnapshot();
  sendTransportStatus({
    statusText: `Jetson WebSocket connected for ${config.senderName}; starting ${config.provider} provider.`,
  });

  try {
    await frameProvider.start();
    await thermalFrameProvider?.start();
    await irIlluminatorController.start();
    await applyConfiguredOperatorSettings({
      config,
      thermalFrameProvider,
      irIlluminatorController,
    });
    const providerStatus = frameProvider.getStatus();
    console.log(
      `[sender-prototype] provider ready for ${remoteLabel}: ${providerStatus.providerDisplayName}`,
    );
    sourceStatusTimer = setInterval(() => {
      sendSourceStatus({}, Date.now());
    }, resolveSourceStatusHeartbeatIntervalMs(config));
    if (config.healthLog) {
      logHealthSummary();
      healthLogTimer = setInterval(() => {
        logHealthSummary();
      }, Math.max(250, Math.round(config.healthLogIntervalMs)));
    }
    sendSourceStatus({}, Date.now());
    if (shouldAutoSendFrames(frameProvider)) {
      const initialFrame = await sendStereoFrame();
      if (initialFrame) {
        sendTransportStatus({
          statusText:
            config.captureBackend === "jetson" && config.jetsonPreviewEnabled
              ? `Jetson WebSocket connected for ${config.senderName}; preview bridge active and stereo_frame delivery is live.`
              : `Jetson WebSocket connected for ${config.senderName}; stereo_frame delivery is live.`,
        });
        scheduleNextFrame(resolveNextStereoFrameDelayMs(config, initialFrame));
      }
    } else {
      sendTransportStatus({
        statusText: `Jetson WebSocket connected for ${config.senderName}; control-plane telemetry is active and continuous stereo_frame transport is disabled.`,
      });
      console.log(
        `[sender-prototype] provider ${providerStatus.providerDisplayName} is running in control-plane mode without automatic stereo_frame streaming.`,
      );
    }
  } catch (error) {
    console.error(
      `[sender-prototype] provider startup error for ${remoteLabel}:`,
      error,
    );
    sendTransportStatus({
      statusText: `Jetson WebSocket connected for ${config.senderName}; source provider startup failed.`,
      lastError: error instanceof Error ? error.message : String(error),
    });
    sendProviderError(error, "Frame provider failed to start: ");
  }

  socket.on("close", async () => {
    clearScheduledFrame();
    clearInterval(sourceStatusTimer);
    clearInterval(healthLogTimer);
    await frameProvider.stop().catch(() => {});
    await thermalFrameProvider?.stop().catch(() => {});
    await irIlluminatorController.stop().catch(() => {});
    console.log(`[sender-prototype] client disconnected from ${remoteLabel}`);
  });

  socket.on("error", async (error) => {
    clearScheduledFrame();
    clearInterval(sourceStatusTimer);
    clearInterval(healthLogTimer);
    await frameProvider.stop().catch(() => {});
    await thermalFrameProvider?.stop().catch(() => {});
    await irIlluminatorController.stop().catch(() => {});
    console.error(`[sender-prototype] socket error for ${remoteLabel}:`, error);
  });
}

function createStereoFramePayload(options) {
  const { config, frameId, providerFrame, thermalFrame, thermalStatus } = options;

  return {
    frameId,
    timestampMs: providerFrame.timestampMs,
    sourceId: `${config.senderName}:${providerFrame.providerType}`,
    sceneId: `jetson_sender_${providerFrame.providerType}_scene`,
    streamName: config.streamName,
    tags: [
      "jetson",
      "sender-prototype",
      `provider:${providerFrame.providerType}`,
      ...(providerFrame.tags ?? []),
    ],
    extras: {
      fpsTarget: Number(config.fps.toFixed(2)),
      imageMode: config.imageMode,
      providerType: providerFrame.providerType,
      ...sanitizePrimitiveMetadataRecord(providerFrame.extras),
    },
    overlay: {
      label:
        providerFrame.overlayLabel ??
        `Prototype Frame ${String(frameId).padStart(4, "0")}`,
      annotations: [
        {
          id: "prototype-crosshair",
          kind: "crosshair",
          normalizedX: 0.5,
          normalizedY: 0.5,
        },
        {
          id: "prototype-text",
          kind: "text",
          normalizedX: 0.16,
          normalizedY: 0.16,
          label: `${config.senderName} F${frameId}`,
        },
      ],
    },
    ...(thermalFrame ? { thermalFrame } : {}),
    ...(thermalStatus?.currentOverlayMode
      ? { thermalOverlayMode: thermalStatus.currentOverlayMode }
      : {}),
    left: createProtocolEyePayload(
      "left",
      providerFrame.left,
      frameId,
      config.streamName,
      config.imageMode,
    ),
    right: createProtocolEyePayload(
      "right",
      providerFrame.right,
      frameId,
      config.streamName,
      config.imageMode,
    ),
  };
}

async function captureThermalFrameSafely(options) {
  const { thermalFrameProvider, remoteLabel } = options;
  if (!thermalFrameProvider) {
    return undefined;
  }

  try {
    return await thermalFrameProvider.getNextThermalFrame();
  } catch (error) {
    console.warn(
      `[sender-prototype] thermal frame provider warning for ${remoteLabel}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

function createProtocolEyePayload(eye, imageFrame, frameId, streamName, imageMode) {
  const eyeLabel = eye === "left" ? "LEFT" : "RIGHT";

  return {
    eye,
    width: imageFrame.width,
    height: imageFrame.height,
    format: "image",
    contentLabel: `${streamName}:${eye}`,
    title: imageFrame.title ?? "Jetson Sender Prototype Frame",
    markerText:
      imageFrame.markerText ?? `${eyeLabel} ${String(frameId).padStart(4, "0")}`,
    backgroundHex:
      imageFrame.backgroundHex ?? (eye === "left" ? "#0f385d" : "#46185d"),
    accentHex:
      imageFrame.accentHex ?? (eye === "left" ? "#9ee6ff" : "#f0c8ff"),
    image: createProtocolImagePayload(imageFrame, imageMode),
    metadata: {
      sourceLabel: imageFrame.sourceLabel,
      mimeType: imageFrame.mimeType,
      byteSize: imageFrame.byteSize,
      ...(imageFrame.metadata ?? {}),
    },
  };
}

function mapProviderStateToSourceState(state) {
  if (
    state === "idle" ||
    state === "starting" ||
    state === "running" ||
    state === "reconnecting" ||
    state === "stopped" ||
    state === "error"
  ) {
    return state;
  }

  return "error";
}

function resolveSourceState(providerStatus) {
  if (providerStatus.captureHealthState === "retrying") {
    return "reconnecting";
  }

  if (providerStatus.captureHealthState === "terminal_failure") {
    return "error";
  }

  return mapProviderStateToSourceState(providerStatus.state);
}

async function applyConfiguredOperatorSettings(options) {
  const { config, thermalFrameProvider, irIlluminatorController } = options;

  thermalFrameProvider?.setOverlayMode(config.thermalOverlayMode);

  if (config.irEnabled) {
    await irIlluminatorController.enable();
    if (config.irLevel > 0) {
      await irIlluminatorController.setLevel(config.irLevel);
    }
    return;
  }

  await irIlluminatorController.disable();
}

function normalizeSocketMessageData(data) {
  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }

  throw new Error("Unsupported control message payload type.");
}

function createSourceStatusCameraTelemetry(providerStatus) {
  if (providerStatus.providerType !== "camera" && !providerStatus.backendType) {
    return undefined;
  }

  return sanitizeSourceStatusCameraTelemetry({
    captureBackendName: providerStatus.backendType,
    bridgeMode: providerStatus.bridgeMode,
    startupValidated: providerStatus.startupValidated,
    frameWidth: providerStatus.width ?? providerStatus.outputWidth ?? providerStatus.inputWidth,
    frameHeight:
      providerStatus.height ?? providerStatus.outputHeight ?? providerStatus.inputHeight,
    frameIntervalMs: providerStatus.effectiveFrameIntervalMs,
    frameSourceMode: providerStatus.frameSourceMode,
    frameSourceName: providerStatus.frameSourceName,
    capturesAttempted: providerStatus.capturesAttempted,
    capturesSucceeded: providerStatus.capturesSucceeded,
    capturesFailed: providerStatus.capturesFailed,
    consecutiveFailureCount: providerStatus.consecutiveFailureCount,
    lastSuccessfulCaptureTime: providerStatus.lastSuccessfulCaptureTime,
    lastCaptureDurationMs: providerStatus.lastCaptureDurationMs,
    averageCaptureDurationMs: providerStatus.averageCaptureDurationMs,
    effectiveFrameIntervalMs: providerStatus.effectiveFrameIntervalMs,
    leftCameraDevice: providerStatus.leftDevice,
    rightCameraDevice: providerStatus.rightDevice,
    gstLaunchPath: providerStatus.gstLaunchPath,
    captureHealthState: providerStatus.captureHealthState,
    captureRetryCount: providerStatus.captureRetryCount,
    captureRetryDelayMs: providerStatus.captureRetryDelayMs,
    recentRetryAttempts: providerStatus.recentRetryAttempts,
    currentRetryAttempt: providerStatus.currentRetryAttempt,
    transientFailureCount: providerStatus.transientFailureCount,
    recoveryCount: providerStatus.recoveryCount,
    lastRecoveryTime: providerStatus.lastRecoveryTime,
    lastTerminalFailureTime: providerStatus.lastTerminalFailureTime,
    recentCaptureEvents: providerStatus.recentCaptureEvents,
    replaySourceIdentity: providerStatus.replaySourceIdentity,
    replayLoopEnabled: providerStatus.replayLoopEnabled,
    replayCurrentIndex: providerStatus.replayCurrentIndex,
    replayFrameCount: providerStatus.replayFrameCount,
    replayLeftSource: providerStatus.replayLeftSource,
    replayRightSource: providerStatus.replayRightSource,
    replayTimingMode: providerStatus.replayTimingMode,
    replayTimeScale: providerStatus.replayTimeScale,
    replayManifestLoaded: providerStatus.replayManifestLoaded,
    replayManifestValidated: providerStatus.replayManifestValidated,
    replayManifestErrorCount: providerStatus.replayManifestErrorCount,
    replayManifestWarningCount: providerStatus.replayManifestWarningCount,
    replayManifestSource: providerStatus.replayManifestSource,
    replayValidationSummary: providerStatus.replayValidationSummary,
    replayRecordedTimestamp: providerStatus.replayRecordedTimestamp,
    replayDelayUntilNextMs: providerStatus.replayDelayUntilNextMs,
    replayScaledDelayUntilNextMs: providerStatus.replayScaledDelayUntilNextMs,
    replayTimingOffsetMs: providerStatus.replayTimingOffsetMs,
    replayNominalLoopDurationMs: providerStatus.replayNominalLoopDurationMs,
    replayScaledLoopDurationMs: providerStatus.replayScaledLoopDurationMs,
    runtimeProfileName: providerStatus.runtimeProfileName,
    runtimeProfileType: providerStatus.runtimeProfileType,
    runtimeProfileDescription: providerStatus.runtimeProfileDescription,
    defaultProfileName: providerStatus.defaultProfileName,
    availableProfileNames: providerStatus.availableProfileNames,
    leftSensorId: providerStatus.leftSensorId,
    rightSensorId: providerStatus.rightSensorId,
    inputWidth: providerStatus.inputWidth,
    inputHeight: providerStatus.inputHeight,
    outputWidth: providerStatus.outputWidth,
    outputHeight: providerStatus.outputHeight,
    outputMode: providerStatus.outputMode,
    effectiveFps: providerStatus.effectiveFps,
    recordingContainer: providerStatus.recordingContainer,
    recordDurationSeconds: providerStatus.recordDurationSeconds,
    testDurationSeconds: providerStatus.testDurationSeconds,
    queueMaxSizeBuffers: providerStatus.queueMaxSizeBuffers,
    outputDirectory: providerStatus.outputDirectory,
    recordingActive: providerStatus.recordingActive,
    recordingOutputPath: providerStatus.recordingOutputPath,
    artifactType: providerStatus.artifactType,
    artifactPath: providerStatus.artifactPath,
    artifactSizeBytes: providerStatus.artifactSizeBytes,
    artifactCapturedAt: providerStatus.artifactCapturedAt,
    artifactMetadataSource: providerStatus.artifactMetadataSource,
    preflightOverallStatus: providerStatus.preflightOverallStatus,
    preflightOk: providerStatus.preflightOk,
    preflightPassCount: providerStatus.preflightPassCount,
    preflightWarnCount: providerStatus.preflightWarnCount,
    preflightFailCount: providerStatus.preflightFailCount,
    preflightCriticalFailCount: providerStatus.preflightCriticalFailCount,
    systemIsJetson: providerStatus.systemIsJetson,
    jetpackVersion: providerStatus.jetpackVersion,
    l4tVersion: providerStatus.l4tVersion,
    projectName: providerStatus.projectName,
    configPath: providerStatus.configPath,
    gstLaunchBinary: providerStatus.gstLaunchBinary,
  });
}

function createSourceStatusThermalTelemetry(thermalProviderStatus) {
  if (!thermalProviderStatus) {
    return undefined;
  }

  return {
    thermalAvailable: thermalProviderStatus.thermalAvailable,
    thermalBackendIdentity: thermalProviderStatus.thermalBackendIdentity,
    thermalFrameWidth: thermalProviderStatus.thermalFrameWidth,
    thermalFrameHeight: thermalProviderStatus.thermalFrameHeight,
    thermalFrameRate: thermalProviderStatus.thermalFrameRate,
    thermalOverlaySupported: thermalProviderStatus.thermalOverlaySupported,
    supportedThermalOverlayModes:
      thermalProviderStatus.supportedThermalOverlayModes,
    thermalHealthState: thermalProviderStatus.thermalHealthState,
    thermalErrorText: thermalProviderStatus.thermalErrorText,
    currentOverlayMode: thermalProviderStatus.currentOverlayMode,
    lastThermalFrameId: thermalProviderStatus.lastFrameId,
    lastThermalTimestamp: thermalProviderStatus.lastTimestampMs,
  };
}

function createSourceStatusIrIlluminatorStatus(irIlluminatorStatus) {
  return {
    irAvailable: irIlluminatorStatus.irAvailable,
    irBackendIdentity: irIlluminatorStatus.irBackendIdentity,
    irEnabled: irIlluminatorStatus.irEnabled,
    irLevel: irIlluminatorStatus.irLevel,
    irMaxLevel: irIlluminatorStatus.irMaxLevel,
    irControlSupported: irIlluminatorStatus.irControlSupported,
    irFaultState: irIlluminatorStatus.irFaultState,
    irErrorText: irIlluminatorStatus.irErrorText,
  };
}

function sanitizeSourceStatusCameraTelemetry(telemetry) {
  const sanitized = {};

  for (const [key, value] of Object.entries(telemetry)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (SOURCE_STATUS_CAMERA_TELEMETRY_NON_NEGATIVE_NUMBER_FIELDS.has(key)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        sanitized[key] = value;
      }
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function sanitizePrimitiveMetadataRecord(record) {
  if (!record || typeof record !== "object") {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === null) {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === "string" || typeof value === "boolean") {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function describeStereoFormatNote(config, providerStatus) {
  const providerType = config.provider;
  if (
    providerStatus?.backendType === "jetson" &&
    providerStatus?.bridgeMode === "jetson_runtime_preview_bridge"
  ) {
    if (config.imageMode === "binary_frame") {
      return "Jetson runtime preview bridge active. XR receives Jetson-authored left/right JPEG preview frames from a persistent Jetson-owned preview publisher through shared-memory ring-buffer slots, and the sender forwards them as binary stereo_frame WebSocket messages so the XR client can render blob-backed images without base64 or data_url materialization.";
    }

    return "Jetson runtime preview bridge active. XR receives Jetson-authored left/right JPEG preview frames from a persistent Jetson-owned preview publisher through shared-memory ring-buffer slots plus framed metadata, with lazy reduced-copy sender access that preserves the existing stereo_frame contract and real Jetson control-plane truth.";
  }

  if (providerStatus?.backendType === "jetson") {
    return "Jetson runtime control-plane bridge active. XR receives real Jetson status, profile, preflight, and bounded snapshot/record results here; continuous stereo_frame transport is intentionally disabled in this mode.";
  }

  if (providerType === "camera") {
    return "Camera snapshot provider active. Future Jetson capture backends should plug in here without changing protocol flow.";
  }

  if (providerType === "generated") {
    return "Generated test-pattern provider active. Future camera providers can replace it without changing protocol flow.";
  }

  if (providerType === "sequence") {
    return "Image-sequence provider active. Future replay or capture providers can replace it without changing protocol flow.";
  }

  return "Still-image provider active. Future Jetson camera providers can replace it without changing protocol flow.";
}

function shouldAutoSendFrames(frameProvider) {
  if (
    frameProvider &&
    typeof frameProvider.shouldAutoSendFrames === "function"
  ) {
    return frameProvider.shouldAutoSendFrames();
  }

  return true;
}

function supportsFrameProviderControlCommands(frameProvider) {
  return Boolean(
    frameProvider &&
      typeof frameProvider.handleControlCommand === "function",
  );
}

function resolveSourceStatusHeartbeatIntervalMs(config) {
  if (config.provider !== "camera") {
    return MAX_SOURCE_STATUS_HEARTBEAT_INTERVAL_MS;
  }

  const retryDelayMs =
    typeof config.captureRetryDelayMs === "number"
      ? config.captureRetryDelayMs
      : MAX_SOURCE_STATUS_HEARTBEAT_INTERVAL_MS;

  return Math.max(
    MIN_SOURCE_STATUS_HEARTBEAT_INTERVAL_MS,
    Math.min(MAX_SOURCE_STATUS_HEARTBEAT_INTERVAL_MS, Math.round(retryDelayMs)),
  );
}

function maybeLogHealthTransition(providerStatus, config, remoteLabel, state) {
  if (!config.healthLog) {
    return;
  }

  const nextKey = createHealthTransitionKey(providerStatus);
  if (!nextKey || nextKey === state.lastHealthTransitionKey) {
    return;
  }

  state.setLastHealthTransitionKey(nextKey);
  const eventLine = formatHealthEventLine(providerStatus, remoteLabel);
  if (!eventLine) {
    return;
  }

  if (providerStatus.captureHealthState === "terminal_failure") {
    console.error(eventLine);
    return;
  }

  if (providerStatus.captureHealthState === "retrying") {
    console.warn(eventLine);
    return;
  }

  console.log(eventLine);
}

function createHealthTransitionKey(providerStatus) {
  if (providerStatus.captureHealthState === "retrying") {
    return `retrying:${providerStatus.currentRetryAttempt ?? providerStatus.recentRetryAttempts ?? 0}:${
      providerStatus.lastCaptureError ?? ""
    }`;
  }

  if (
    providerStatus.captureHealthState === "recovered" &&
    typeof providerStatus.lastRecoveryTime === "number"
  ) {
    return `recovered:${providerStatus.lastRecoveryTime}`;
  }

  if (
    providerStatus.captureHealthState === "terminal_failure" &&
    typeof providerStatus.lastTerminalFailureTime === "number"
  ) {
    return `terminal_failure:${providerStatus.lastTerminalFailureTime}`;
  }

  return undefined;
}

function formatHealthEventLine(providerStatus, remoteLabel) {
  if (providerStatus.captureHealthState === "retrying") {
    return [
      "[sender-health-event]",
      `client=${remoteLabel}`,
      "event=retrying",
      `retry=${formatRetryText(providerStatus)}`,
      `delay=${formatDurationText(providerStatus.captureRetryDelayMs)}`,
      providerStatus.lastCaptureError
        ? `error=${sanitizeHealthValue(providerStatus.lastCaptureError)}`
        : undefined,
    ]
      .filter((part) => typeof part === "string" && part.length > 0)
      .join(" ");
  }

  if (providerStatus.captureHealthState === "recovered") {
    return [
      "[sender-health-event]",
      `client=${remoteLabel}`,
      "event=recovered",
      `retry=${formatRetryText(providerStatus)}`,
      typeof providerStatus.lastRecoveryTime === "number"
        ? `at=${formatTimestampText(providerStatus.lastRecoveryTime)}`
        : undefined,
    ]
      .filter((part) => typeof part === "string" && part.length > 0)
      .join(" ");
  }

  if (providerStatus.captureHealthState === "terminal_failure") {
    return [
      "[sender-health-event]",
      `client=${remoteLabel}`,
      "event=terminal_failure",
      `retry=${formatRetryText(providerStatus)}`,
      typeof providerStatus.lastTerminalFailureTime === "number"
        ? `at=${formatTimestampText(providerStatus.lastTerminalFailureTime)}`
        : undefined,
      providerStatus.lastCaptureError
        ? `error=${sanitizeHealthValue(providerStatus.lastCaptureError)}`
        : undefined,
    ]
      .filter((part) => typeof part === "string" && part.length > 0)
      .join(" ");
  }

  return undefined;
}

function formatHealthLogLine(providerStatus, config, remoteLabel) {
  const deviceSummary =
    providerStatus.leftDevice || providerStatus.rightDevice
      ? `${providerStatus.leftDevice ?? "?"} | ${providerStatus.rightDevice ?? "?"}`
      : `${config.leftCameraDevice ?? config.leftCameraId ?? "?"} | ${
          config.rightCameraDevice ?? config.rightCameraId ?? "?"
        }`;
  const replaySourceSummary =
    providerStatus.replayLeftSource || providerStatus.replayRightSource
      ? `${providerStatus.replayLeftSource ?? "?"} | ${
          providerStatus.replayRightSource ?? "?"
        }`
      : undefined;
  const captureAttemptedText =
    typeof providerStatus.capturesAttempted === "number"
      ? String(providerStatus.capturesAttempted)
      : "-";
  const captureSucceededText =
    typeof providerStatus.capturesSucceeded === "number"
      ? String(providerStatus.capturesSucceeded)
      : "-";
  const captureFailedText =
    typeof providerStatus.capturesFailed === "number"
      ? String(providerStatus.capturesFailed)
      : "-";
  const consecutiveFailureText =
    typeof providerStatus.consecutiveFailureCount === "number"
      ? String(providerStatus.consecutiveFailureCount)
      : "-";

  return [
    "[sender-health]",
    `client=${remoteLabel}`,
    `provider=${providerStatus.providerType}`,
    `state=${providerStatus.state}`,
    providerStatus.captureHealthState
      ? `health=${providerStatus.captureHealthState}`
      : undefined,
    providerStatus.backendType ? `backend=${providerStatus.backendType}` : undefined,
    providerStatus.startupValidated !== undefined
      ? `validated=${providerStatus.startupValidated ? "yes" : "no"}`
      : undefined,
    `attempts=${captureAttemptedText}`,
    `ok=${captureSucceededText}`,
    `fail=${captureFailedText}`,
    `consecutive=${consecutiveFailureText}`,
    `retry=${formatRetryText(providerStatus)}`,
    providerStatus.captureRetryDelayMs !== undefined
      ? `delay=${formatDurationText(providerStatus.captureRetryDelayMs)}`
      : undefined,
    `last=${formatDurationText(providerStatus.lastCaptureDurationMs)}`,
    `avg=${formatDurationText(providerStatus.averageCaptureDurationMs)}`,
    `interval=${formatDurationText(providerStatus.effectiveFrameIntervalMs)}`,
    typeof providerStatus.lastRecoveryTime === "number"
      ? `recovered=${formatTimestampText(providerStatus.lastRecoveryTime)}`
      : undefined,
    typeof providerStatus.lastTerminalFailureTime === "number"
      ? `terminal=${formatTimestampText(providerStatus.lastTerminalFailureTime)}`
      : undefined,
    providerStatus.replayFrameCount
      ? `replay=${providerStatus.replayCurrentIndex ?? 0}/${providerStatus.replayFrameCount}${
          providerStatus.replayLoopEnabled ? ":loop" : ""
        }`
      : undefined,
    providerStatus.replayTimingMode
      ? `timing=${providerStatus.replayTimingMode}`
      : undefined,
    typeof providerStatus.replayTimeScale === "number"
      ? `time_scale=${providerStatus.replayTimeScale}x`
      : undefined,
    providerStatus.replayManifestLoaded !== undefined
      ? `manifest=${providerStatus.replayManifestLoaded ? "yes" : "no"}`
      : undefined,
    providerStatus.replayManifestValidated !== undefined
      ? `manifest_validated=${providerStatus.replayManifestValidated ? "yes" : "no"}`
      : undefined,
    typeof providerStatus.replayManifestErrorCount === "number"
      ? `manifest_errors=${providerStatus.replayManifestErrorCount}`
      : undefined,
    typeof providerStatus.replayManifestWarningCount === "number"
      ? `manifest_warn=${providerStatus.replayManifestWarningCount}`
      : undefined,
    typeof providerStatus.replayRecordedTimestamp === "number"
      ? `recorded=${providerStatus.replayRecordedTimestamp}`
      : undefined,
    typeof providerStatus.replayDelayUntilNextMs === "number"
      ? `next=${formatDurationText(providerStatus.replayDelayUntilNextMs)}`
      : undefined,
    typeof providerStatus.replayScaledDelayUntilNextMs === "number"
      ? `scaled_next=${formatDurationText(providerStatus.replayScaledDelayUntilNextMs)}`
      : undefined,
    typeof providerStatus.replayTimingOffsetMs === "number"
      ? `offset=${formatSignedDurationText(providerStatus.replayTimingOffsetMs)}`
      : undefined,
    typeof providerStatus.replayNominalLoopDurationMs === "number"
      ? `loop=${formatDurationText(providerStatus.replayNominalLoopDurationMs)}`
      : undefined,
    typeof providerStatus.replayScaledLoopDurationMs === "number"
      ? `scaled_loop=${formatDurationText(providerStatus.replayScaledLoopDurationMs)}`
      : undefined,
    providerStatus.replaySourceIdentity
      ? `replay_source="${sanitizeHealthValue(providerStatus.replaySourceIdentity)}"`
      : undefined,
    providerStatus.replayManifestSource &&
    providerStatus.replayManifestSource !== "not_configured"
      ? `manifest_source="${sanitizeHealthValue(providerStatus.replayManifestSource)}"`
      : undefined,
    providerStatus.replayValidationSummary
      ? `validation="${sanitizeHealthValue(providerStatus.replayValidationSummary)}"`
      : undefined,
    providerStatus.recentCaptureEvents?.length
      ? `recent="${sanitizeHealthValue(
          providerStatus.recentCaptureEvents
            .map((event) => {
              return formatRecentCaptureEvent(event);
            })
            .join(" | "),
        )}"`
      : undefined,
    replaySourceSummary
      ? `targets="${sanitizeHealthValue(replaySourceSummary)}"`
      : `targets="${sanitizeHealthValue(deviceSummary)}"`,
    providerStatus.gstLaunchPath ? `gst=${providerStatus.gstLaunchPath}` : undefined,
    providerStatus.lastCaptureError
      ? `error=${sanitizeHealthValue(providerStatus.lastCaptureError)}`
      : undefined,
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}

function formatDurationText(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value)}ms`;
}

function formatSignedDurationText(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  const roundedValue = Math.round(value);
  return `${roundedValue >= 0 ? "+" : ""}${roundedValue}ms`;
}

function formatRetryText(providerStatus) {
  const retryBudget =
    typeof providerStatus.captureRetryCount === "number"
      ? providerStatus.captureRetryCount
      : undefined;
  const retryAttempt =
    typeof providerStatus.currentRetryAttempt === "number" &&
    providerStatus.currentRetryAttempt > 0
      ? providerStatus.currentRetryAttempt
      : typeof providerStatus.recentRetryAttempts === "number"
        ? providerStatus.recentRetryAttempts
        : undefined;

  if (retryBudget === undefined && retryAttempt === undefined) {
    return "-";
  }

  return `${retryAttempt ?? 0}/${retryBudget ?? "?"}`;
}

function formatTimestampText(value) {
  return new Date(value).toISOString();
}

function sanitizeHealthValue(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function formatReplayInputConfig(replayFiles, replayDir) {
  if (Array.isArray(replayFiles) && replayFiles.length > 0) {
    return replayFiles.join(", ");
  }

  return replayDir ?? "unconfigured";
}

function resolveNextStereoFrameDelayMs(config, providerFrame) {
  const replayDelayMs =
    config.provider === "camera" &&
    config.captureBackend === "replay" &&
    providerFrame?.extras &&
    typeof providerFrame.extras.replayScaledDelayUntilNextMs === "number"
      ? providerFrame.extras.replayScaledDelayUntilNextMs
      : config.provider === "camera" &&
          config.captureBackend === "replay" &&
          providerFrame?.extras &&
          typeof providerFrame.extras.replayDelayUntilNextMs === "number"
        ? providerFrame.extras.replayDelayUntilNextMs
      : undefined;

  if (typeof replayDelayMs === "number" && Number.isFinite(replayDelayMs)) {
    return Math.max(0, replayDelayMs);
  }

  return Math.max(1, Math.round(1000 / config.fps));
}
