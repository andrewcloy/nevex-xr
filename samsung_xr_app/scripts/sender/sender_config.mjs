import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { JETSON_SUPPORTED_THERMAL_OVERLAY_MODES } from "../../jetson_sender_helpers.mjs";
import {
  DEFAULT_FRAME_DIMENSIONS,
  SUPPORTED_FRAME_PROVIDER_TYPES,
} from "./frame_provider_contract.mjs";
import { SUPPORTED_CAPTURE_BACKEND_TYPES } from "./capture_backends/capture_backend_contract.mjs";
import { DEFAULT_REPLAY_PREVIEW_ENTRY_COUNT } from "./capture_backends/replay_timing_support.mjs";
import {
  DEFAULT_FAULT_INJECT_FAILURE_COUNT,
  DEFAULT_FAULT_INJECT_HEARTBEAT_DROP_AFTER_MS,
  SUPPORTED_FAULT_INJECTION_MODES,
} from "./fault_injection.mjs";

const SENDER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(SENDER_DIR, "..");
const XR_APP_ROOT = path.resolve(SCRIPTS_DIR, "..");
const UNIFIED_PROJECT_ROOT = path.resolve(XR_APP_ROOT, "..");
const ASSETS_DIR = path.resolve(SCRIPTS_DIR, "assets");
const DEFAULT_JETSON_RUNTIME_ROOT = resolvePreferredExistingPath(
  path.resolve(UNIFIED_PROJECT_ROOT, "jetson_runtime"),
  path.resolve(XR_APP_ROOT, "jetson_runtime"),
);

export const SUPPORTED_SENDER_IMAGE_MODES = [
  "base64",
  "data_url",
  "binary_frame",
];
export const SUPPORTED_CAMERA_PROFILES = ["default", "hardware_safe"];
export const SUPPORTED_REPLAY_FPS_MODES = ["fixed", "recorded"];
export const SUPPORTED_PREFLIGHT_OUTPUT_MODES = ["text", "json"];
export const DEFAULT_REPLAY_TIME_SCALE = 1;
export const HARDWARE_SAFE_CAMERA_PROFILE = Object.freeze({
  fps: 0.5,
  captureWidth: 1280,
  captureHeight: 720,
  captureTimeoutMs: 5000,
  captureJpegQuality: 70,
  captureWarmupFrames: 2,
  captureRetryCount: 2,
  captureRetryDelayMs: 750,
});

export const DEFAULT_SENDER_CONFIG = {
  host: "0.0.0.0",
  port: 8090,
  path: "/jetson/messages",
  fps: 1,
  senderName: "jetson_sender_runtime",
  senderVersion: "0.1.0-dev",
  streamName: "jetson_sender_runtime_stream",
  imageMode: "base64",
  provider: "still",
  cameraProfile: "default",
  captureBackend: "gstreamer",
  leftCameraId: "0",
  rightCameraId: "1",
  leftCameraDevice: undefined,
  rightCameraDevice: undefined,
  captureWidth: DEFAULT_FRAME_DIMENSIONS.width,
  captureHeight: DEFAULT_FRAME_DIMENSIONS.height,
  captureTimeoutMs: 3000,
  captureJpegQuality: 85,
  captureWarmupFrames: 1,
  captureRetryCount: 2,
  captureRetryDelayMs: 500,
  faultInjectEveryNCaptures: 0,
  faultInjectFailureCount: DEFAULT_FAULT_INJECT_FAILURE_COUNT,
  faultInjectMode: "transient",
  faultInjectStartAfterCaptures: 0,
  faultInjectHeartbeatDrop: false,
  faultInjectHeartbeatDropAfterMs: DEFAULT_FAULT_INJECT_HEARTBEAT_DROP_AFTER_MS,
  healthLog: false,
  healthLogIntervalMs: 5000,
  leftImagePath: path.resolve(ASSETS_DIR, "left_eye_sample.svg"),
  rightImagePath: path.resolve(ASSETS_DIR, "right_eye_sample.svg"),
  leftSequenceDir: path.resolve(ASSETS_DIR, "sequence", "left"),
  rightSequenceDir: path.resolve(ASSETS_DIR, "sequence", "right"),
  leftSequenceFiles: [],
  rightSequenceFiles: [],
  sequenceLoop: true,
  leftReplayDir: path.resolve(ASSETS_DIR, "sequence", "left"),
  rightReplayDir: path.resolve(ASSETS_DIR, "sequence", "right"),
  leftReplayFiles: [],
  rightReplayFiles: [],
  replayLoop: true,
  replayFpsMode: "fixed",
  replayTimeScale: DEFAULT_REPLAY_TIME_SCALE,
  replayPreviewCount: DEFAULT_REPLAY_PREVIEW_ENTRY_COUNT,
  replayManifestPath: undefined,
  jetsonRuntimePythonBin: process.platform === "win32" ? "python" : "python3",
  jetsonRuntimeAppPath: path.resolve(DEFAULT_JETSON_RUNTIME_ROOT, "app.py"),
  jetsonRuntimeConfigPath: path.resolve(
    DEFAULT_JETSON_RUNTIME_ROOT,
    "config",
    "camera_config.json",
  ),
  jetsonRuntimeWorkingDirectory: path.resolve(DEFAULT_JETSON_RUNTIME_ROOT),
  jetsonRuntimeProfile: undefined,
  jetsonPreviewEnabled: false,
  jetsonRunPreflightOnStart: true,
  preflightOutput: "text",
  preflightOutputFile: undefined,
  preflightOutputQuiet: false,
  thermalSimulated: false,
  thermalOverlayMode: "thermal_fusion_envg",
  thermalFrameWidth: 32,
  thermalFrameHeight: 24,
  thermalFrameRate: 9,
  irSimulated: false,
  irEnabled: false,
  irLevel: 0,
  irMaxLevel: 5,
  frameWidth: DEFAULT_FRAME_DIMENSIONS.width,
  frameHeight: DEFAULT_FRAME_DIMENSIONS.height,
  maxRecommendedPayloadBytes: 256 * 1024,
};

export function parseSenderCliArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printSenderHelp();
    process.exit(0);
  }

  const config = {
    ...DEFAULT_SENDER_CONFIG,
  };
  const explicitOverrides = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const key = argument.slice(2);
    if (key === "health-log") {
      config.healthLog = true;
      continue;
    }
    if (key === "fault-inject-heartbeat-drop") {
      config.faultInjectHeartbeatDrop = true;
      continue;
    }
    if (key === "preflight-output-quiet") {
      config.preflightOutputQuiet = true;
      continue;
    }
    if (key === "thermal-simulated") {
      config.thermalSimulated = true;
      continue;
    }
    if (key === "ir-simulated") {
      config.irSimulated = true;
      continue;
    }
    const nextValue = argv[index + 1];
    if (nextValue === undefined || nextValue.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    switch (key) {
      case "host":
        config.host = nextValue;
        break;
      case "port":
        config.port = parsePositiveInteger(nextValue, "--port");
        break;
      case "path":
        config.path = normalizePath(nextValue);
        break;
      case "fps":
        config.fps = parsePositiveNumber(nextValue, "--fps");
        explicitOverrides.fps = config.fps;
        break;
      case "sender-name":
        config.senderName = nextValue;
        break;
      case "sender-version":
        config.senderVersion = nextValue;
        break;
      case "stream-name":
        config.streamName = nextValue;
        break;
      case "image-mode":
        if (!SUPPORTED_SENDER_IMAGE_MODES.includes(nextValue)) {
          throw new Error(
            `--image-mode must be one of: ${SUPPORTED_SENDER_IMAGE_MODES.join(", ")}`,
          );
        }
        config.imageMode = nextValue;
        break;
      case "provider":
        if (!SUPPORTED_FRAME_PROVIDER_TYPES.includes(nextValue)) {
          throw new Error(
            `--provider must be one of: ${SUPPORTED_FRAME_PROVIDER_TYPES.join(", ")}`,
          );
        }
        config.provider = nextValue;
        explicitOverrides.provider = nextValue;
        break;
      case "camera-profile":
        if (!SUPPORTED_CAMERA_PROFILES.includes(nextValue)) {
          throw new Error(
            `--camera-profile must be one of: ${SUPPORTED_CAMERA_PROFILES.join(", ")}`,
          );
        }
        config.cameraProfile = nextValue;
        explicitOverrides.cameraProfile = nextValue;
        break;
      case "capture-backend":
        if (!SUPPORTED_CAPTURE_BACKEND_TYPES.includes(nextValue)) {
          throw new Error(
            `--capture-backend must be one of: ${SUPPORTED_CAPTURE_BACKEND_TYPES.join(", ")}`,
          );
        }
        config.captureBackend = nextValue;
        explicitOverrides.captureBackend = nextValue;
        break;
      case "left-camera-id":
        config.leftCameraId = nextValue;
        explicitOverrides.leftCameraId = nextValue;
        break;
      case "right-camera-id":
        config.rightCameraId = nextValue;
        explicitOverrides.rightCameraId = nextValue;
        break;
      case "left-camera-device":
        config.leftCameraDevice = nextValue;
        explicitOverrides.leftCameraDevice = nextValue;
        break;
      case "right-camera-device":
        config.rightCameraDevice = nextValue;
        explicitOverrides.rightCameraDevice = nextValue;
        break;
      case "capture-width":
        config.captureWidth = parsePositiveInteger(nextValue, "--capture-width");
        explicitOverrides.captureWidth = config.captureWidth;
        break;
      case "capture-height":
        config.captureHeight = parsePositiveInteger(nextValue, "--capture-height");
        explicitOverrides.captureHeight = config.captureHeight;
        break;
      case "capture-timeout-ms":
        config.captureTimeoutMs = parsePositiveInteger(
          nextValue,
          "--capture-timeout-ms",
        );
        explicitOverrides.captureTimeoutMs = config.captureTimeoutMs;
        break;
      case "capture-jpeg-quality":
        config.captureJpegQuality = parseIntegerInRange(
          nextValue,
          "--capture-jpeg-quality",
          1,
          100,
        );
        explicitOverrides.captureJpegQuality = config.captureJpegQuality;
        break;
      case "capture-warmup-frames":
        config.captureWarmupFrames = parseNonNegativeInteger(
          nextValue,
          "--capture-warmup-frames",
        );
        explicitOverrides.captureWarmupFrames = config.captureWarmupFrames;
        break;
      case "capture-retry-count":
        config.captureRetryCount = parseNonNegativeInteger(
          nextValue,
          "--capture-retry-count",
        );
        explicitOverrides.captureRetryCount = config.captureRetryCount;
        break;
      case "capture-retry-delay-ms":
        config.captureRetryDelayMs = parseNonNegativeInteger(
          nextValue,
          "--capture-retry-delay-ms",
        );
        explicitOverrides.captureRetryDelayMs = config.captureRetryDelayMs;
        break;
      case "fault-inject-every-n-captures":
        config.faultInjectEveryNCaptures = parseNonNegativeInteger(
          nextValue,
          "--fault-inject-every-n-captures",
        );
        explicitOverrides.faultInjectEveryNCaptures =
          config.faultInjectEveryNCaptures;
        break;
      case "fault-inject-failure-count":
        config.faultInjectFailureCount = parseNonNegativeInteger(
          nextValue,
          "--fault-inject-failure-count",
        );
        explicitOverrides.faultInjectFailureCount =
          config.faultInjectFailureCount;
        break;
      case "fault-inject-mode":
        if (!SUPPORTED_FAULT_INJECTION_MODES.includes(nextValue)) {
          throw new Error(
            `--fault-inject-mode must be one of: ${SUPPORTED_FAULT_INJECTION_MODES.join(", ")}`,
          );
        }
        config.faultInjectMode = nextValue;
        explicitOverrides.faultInjectMode = config.faultInjectMode;
        break;
      case "fault-inject-start-after-captures":
        config.faultInjectStartAfterCaptures = parseNonNegativeInteger(
          nextValue,
          "--fault-inject-start-after-captures",
        );
        explicitOverrides.faultInjectStartAfterCaptures =
          config.faultInjectStartAfterCaptures;
        break;
      case "fault-inject-heartbeat-drop-after-ms":
        config.faultInjectHeartbeatDropAfterMs = parseNonNegativeInteger(
          nextValue,
          "--fault-inject-heartbeat-drop-after-ms",
        );
        explicitOverrides.faultInjectHeartbeatDropAfterMs =
          config.faultInjectHeartbeatDropAfterMs;
        break;
      case "health-log-interval-ms":
        config.healthLogIntervalMs = parsePositiveInteger(
          nextValue,
          "--health-log-interval-ms",
        );
        explicitOverrides.healthLogIntervalMs = config.healthLogIntervalMs;
        break;
      case "left-image":
        config.leftImagePath = nextValue;
        break;
      case "right-image":
        config.rightImagePath = nextValue;
        break;
      case "left-sequence-dir":
        config.leftSequenceDir = nextValue;
        break;
      case "right-sequence-dir":
        config.rightSequenceDir = nextValue;
        break;
      case "left-sequence-files":
        config.leftSequenceFiles = parseCommaSeparatedValues(nextValue);
        break;
      case "right-sequence-files":
        config.rightSequenceFiles = parseCommaSeparatedValues(nextValue);
        break;
      case "sequence-loop":
        config.sequenceLoop = parseBoolean(nextValue, "--sequence-loop");
        break;
      case "left-replay-dir":
        config.leftReplayDir = nextValue;
        break;
      case "right-replay-dir":
        config.rightReplayDir = nextValue;
        break;
      case "left-replay-files":
        config.leftReplayFiles = parseCommaSeparatedValues(nextValue);
        break;
      case "right-replay-files":
        config.rightReplayFiles = parseCommaSeparatedValues(nextValue);
        break;
      case "replay-loop":
        config.replayLoop = parseBoolean(nextValue, "--replay-loop");
        break;
      case "replay-fps-mode":
        if (!SUPPORTED_REPLAY_FPS_MODES.includes(nextValue)) {
          throw new Error(
            `--replay-fps-mode must be one of: ${SUPPORTED_REPLAY_FPS_MODES.join(", ")}`,
          );
        }
        config.replayFpsMode = nextValue;
        break;
      case "replay-manifest":
        config.replayManifestPath = nextValue;
        break;
      case "replay-time-scale":
        config.replayTimeScale = parsePositiveNumber(
          nextValue,
          "--replay-time-scale",
        );
        break;
      case "replay-preview-count":
        config.replayPreviewCount = parsePositiveInteger(
          nextValue,
          "--replay-preview-count",
        );
        break;
      case "jetson-runtime-python":
        config.jetsonRuntimePythonBin = nextValue;
        break;
      case "jetson-runtime-app":
        config.jetsonRuntimeAppPath = path.resolve(nextValue);
        break;
      case "jetson-runtime-config":
        config.jetsonRuntimeConfigPath = path.resolve(nextValue);
        break;
      case "jetson-runtime-cwd":
        config.jetsonRuntimeWorkingDirectory = path.resolve(nextValue);
        break;
      case "jetson-profile":
        if (nextValue.trim().length === 0) {
          throw new Error("--jetson-profile must be a non-empty string.");
        }
        config.jetsonRuntimeProfile = nextValue.trim();
        break;
      case "jetson-preview-enabled":
        config.jetsonPreviewEnabled = parseBoolean(
          nextValue,
          "--jetson-preview-enabled",
        );
        break;
      case "jetson-run-preflight-on-start":
        config.jetsonRunPreflightOnStart = parseBoolean(
          nextValue,
          "--jetson-run-preflight-on-start",
        );
        break;
      case "preflight-output":
        if (!SUPPORTED_PREFLIGHT_OUTPUT_MODES.includes(nextValue)) {
          throw new Error(
            `--preflight-output must be one of: ${SUPPORTED_PREFLIGHT_OUTPUT_MODES.join(", ")}`,
          );
        }
        config.preflightOutput = nextValue;
        break;
      case "preflight-output-file":
        if (nextValue.trim().length === 0) {
          throw new Error("--preflight-output-file must be a non-empty path.");
        }
        config.preflightOutputFile = nextValue;
        break;
      case "thermal-overlay-mode":
        if (!JETSON_SUPPORTED_THERMAL_OVERLAY_MODES.includes(nextValue)) {
          throw new Error(
            `--thermal-overlay-mode must be one of: ${JETSON_SUPPORTED_THERMAL_OVERLAY_MODES.join(", ")}`,
          );
        }
        config.thermalOverlayMode = nextValue;
        break;
      case "thermal-frame-width":
        config.thermalFrameWidth = parsePositiveInteger(
          nextValue,
          "--thermal-frame-width",
        );
        break;
      case "thermal-frame-height":
        config.thermalFrameHeight = parsePositiveInteger(
          nextValue,
          "--thermal-frame-height",
        );
        break;
      case "thermal-frame-rate":
        config.thermalFrameRate = parsePositiveNumber(
          nextValue,
          "--thermal-frame-rate",
        );
        break;
      case "ir-enabled":
        config.irEnabled = parseBoolean(nextValue, "--ir-enabled");
        break;
      case "ir-level":
        config.irLevel = parseNonNegativeInteger(nextValue, "--ir-level");
        break;
      case "ir-max-level":
        config.irMaxLevel = parseNonNegativeInteger(nextValue, "--ir-max-level");
        break;
      case "max-recommended-payload-bytes":
        config.maxRecommendedPayloadBytes = parsePositiveInteger(
          nextValue,
          "--max-recommended-payload-bytes",
        );
        break;
      default:
        throw new Error(`Unsupported argument: --${key}`);
    }

    index += 1;
  }

  applyCameraProfile(config, explicitOverrides);
  return config;
}

export function printSenderHelp() {
  console.log(`
Jetson sender runtime

Usage:
  node ./scripts/jetson_sender_runtime.mjs [options]

Compatibility alias:
  node ./scripts/jetson_sender_prototype.mjs [options]

Common options:
  --host <value>                          Bind host. Default: ${DEFAULT_SENDER_CONFIG.host}
  --port <value>                          Bind port. Default: ${DEFAULT_SENDER_CONFIG.port}
  --path <value>                          WebSocket path. Default: ${DEFAULT_SENDER_CONFIG.path}
  --fps <value>                           Send rate. Default: ${DEFAULT_SENDER_CONFIG.fps}
  --sender-name <value>                   Sender name. Default: ${DEFAULT_SENDER_CONFIG.senderName}
  --sender-version <value>                Sender version. Default: ${DEFAULT_SENDER_CONFIG.senderVersion}
  --stream-name <value>                   Stream name. Default: ${DEFAULT_SENDER_CONFIG.streamName}
  --image-mode <base64|data_url|binary_frame>  Image payload mode. Default: ${DEFAULT_SENDER_CONFIG.imageMode}
  --provider <still|generated|sequence|camera>  Frame provider. Default: ${DEFAULT_SENDER_CONFIG.provider}
  --camera-profile <default|hardware_safe> Camera bring-up profile. Default: ${DEFAULT_SENDER_CONFIG.cameraProfile}
  --max-recommended-payload-bytes <n>     Recommended sender budget. Default: ${DEFAULT_SENDER_CONFIG.maxRecommendedPayloadBytes}
  --health-log                            Enable recurring compact sender health logging
  --health-log-interval-ms <value>        Health log interval. Default: ${DEFAULT_SENDER_CONFIG.healthLogIntervalMs}

Camera provider options:
  --capture-backend <placeholder|simulated|replay|opencv|gstreamer|jetson>  Default: ${DEFAULT_SENDER_CONFIG.captureBackend}
  --left-camera-id <value>                Default: ${DEFAULT_SENDER_CONFIG.leftCameraId}
  --right-camera-id <value>               Default: ${DEFAULT_SENDER_CONFIG.rightCameraId}
  --left-camera-device <path>             Optional direct device path override
  --right-camera-device <path>            Optional direct device path override
  --capture-width <value>                 Default: ${DEFAULT_SENDER_CONFIG.captureWidth}
  --capture-height <value>                Default: ${DEFAULT_SENDER_CONFIG.captureHeight}
  --capture-timeout-ms <value>            Default: ${DEFAULT_SENDER_CONFIG.captureTimeoutMs}
  --capture-jpeg-quality <1-100>          Default: ${DEFAULT_SENDER_CONFIG.captureJpegQuality}
  --capture-warmup-frames <value>         Default: ${DEFAULT_SENDER_CONFIG.captureWarmupFrames}
  --capture-retry-count <value>           Default: ${DEFAULT_SENDER_CONFIG.captureRetryCount}
  --capture-retry-delay-ms <value>        Default: ${DEFAULT_SENDER_CONFIG.captureRetryDelayMs}

Jetson runtime bridge options (used by --capture-backend jetson):
  --jetson-runtime-python <path>          Default: ${DEFAULT_SENDER_CONFIG.jetsonRuntimePythonBin}
  --jetson-runtime-app <path>             Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.jetsonRuntimeAppPath)}
  --jetson-runtime-config <path>          Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.jetsonRuntimeConfigPath)}
  --jetson-runtime-cwd <path>             Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.jetsonRuntimeWorkingDirectory)}
  --jetson-profile <name>                 Optional Jetson runtime profile override
  --jetson-preview-enabled <bool>         Enable the persistent Jetson-owned live preview publisher bridge with shared-memory ring-buffer transport and reduced-copy sender access; pair with --image-mode binary_frame to skip base64/data_url preview materialization. Default: ${String(DEFAULT_SENDER_CONFIG.jetsonPreviewEnabled)}
  --jetson-run-preflight-on-start <bool>  Default: ${String(DEFAULT_SENDER_CONFIG.jetsonRunPreflightOnStart)}

Fault injection options (camera mode / dev only):
  --fault-inject-every-n-captures <value>     Default: ${DEFAULT_SENDER_CONFIG.faultInjectEveryNCaptures}
  --fault-inject-failure-count <value>        Default: ${DEFAULT_SENDER_CONFIG.faultInjectFailureCount}
  --fault-inject-mode <${SUPPORTED_FAULT_INJECTION_MODES.join("|")}>    Default: ${DEFAULT_SENDER_CONFIG.faultInjectMode}
  --fault-inject-start-after-captures <value> Default: ${DEFAULT_SENDER_CONFIG.faultInjectStartAfterCaptures}
  --fault-inject-heartbeat-drop               Stop sending source_status after a delay
  --fault-inject-heartbeat-drop-after-ms <n> Default: ${DEFAULT_SENDER_CONFIG.faultInjectHeartbeatDropAfterMs}

Replay camera backend options:
  --left-replay-dir <path>                Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.leftReplayDir)}
  --right-replay-dir <path>               Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.rightReplayDir)}
  --left-replay-files <a,b,c>             Optional explicit left-eye replay file list
  --right-replay-files <a,b,c>            Optional explicit right-eye replay file list
  --replay-loop <true|false>              Default: ${String(DEFAULT_SENDER_CONFIG.replayLoop)}
  --replay-fps-mode <${SUPPORTED_REPLAY_FPS_MODES.join("|")}>         Default: ${DEFAULT_SENDER_CONFIG.replayFpsMode}
  --replay-time-scale <value>             Recorded replay speed multiplier (>1 faster, <1 slower). Default: ${DEFAULT_SENDER_CONFIG.replayTimeScale}
  --replay-preview-count <n>              Replay dry-run preview entries. Default: ${DEFAULT_SENDER_CONFIG.replayPreviewCount}
  --replay-manifest <path>                Optional JSON manifest with recorded timing metadata

Optional thermal / IR simulation:
  --thermal-simulated                     Enable simulated thermal frame generation
  --thermal-overlay-mode <${JETSON_SUPPORTED_THERMAL_OVERLAY_MODES.join("|")}>  Default: ${DEFAULT_SENDER_CONFIG.thermalOverlayMode}
  --thermal-frame-width <n>               Default: ${DEFAULT_SENDER_CONFIG.thermalFrameWidth}
  --thermal-frame-height <n>              Default: ${DEFAULT_SENDER_CONFIG.thermalFrameHeight}
  --thermal-frame-rate <n>                Default: ${DEFAULT_SENDER_CONFIG.thermalFrameRate}
  --ir-simulated                          Enable simulated IR illuminator status/control
  --ir-enabled <true|false>               Default: ${String(DEFAULT_SENDER_CONFIG.irEnabled)}
  --ir-level <n>                          Default: ${DEFAULT_SENDER_CONFIG.irLevel}
  --ir-max-level <n>                      Default: ${DEFAULT_SENDER_CONFIG.irMaxLevel}

Preflight-only options:
  --preflight-output <text|json>          Sender preflight output mode. Default: ${DEFAULT_SENDER_CONFIG.preflightOutput}
  --preflight-output-file <path>          Optional file path for the final preflight report
  --preflight-output-quiet                Suppress normal successful preflight console output

Still-image provider options:
  --left-image <path>                     Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.leftImagePath)}
  --right-image <path>                    Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.rightImagePath)}

Sequence provider options:
  --left-sequence-dir <path>              Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.leftSequenceDir)}
  --right-sequence-dir <path>             Default: ${relativeToCwd(DEFAULT_SENDER_CONFIG.rightSequenceDir)}
  --left-sequence-files <a,b,c>           Optional explicit left-eye file list
  --right-sequence-files <a,b,c>          Optional explicit right-eye file list
  --sequence-loop <true|false>            Default: ${String(DEFAULT_SENDER_CONFIG.sequenceLoop)}

Provider guidance:
  still       Best first Jetson bring-up with fixed left/right files.
  generated   Best when you want zero file dependencies and obvious frame labels.
  sequence    Best for replaying saved left/right snapshots or staged demos.
  camera      Snapshot-style camera path through the capture-backend seam.

Camera profiles:
  default        Current camera defaults (full-resolution proof-of-life).
  hardware_safe  Low-risk Jetson bring-up profile: 1280x720, 0.5 fps, quality 70, timeout 5000 ms, warm-up 2, retries 2 x 750 ms.
`);
}

function applyCameraProfile(config, explicitOverrides) {
  if (config.cameraProfile === "default") {
    return config;
  }

  if (config.cameraProfile === "hardware_safe") {
    Object.assign(config, HARDWARE_SAFE_CAMERA_PROFILE);
    Object.assign(config, explicitOverrides);
  }

  return config;
}

function relativeToCwd(filePath) {
  return path.relative(process.cwd(), filePath);
}

function resolvePreferredExistingPath(preferredPath, fallbackPath) {
  if (fs.existsSync(preferredPath)) {
    return path.resolve(preferredPath);
  }
  if (fs.existsSync(fallbackPath)) {
    return path.resolve(fallbackPath);
  }

  return path.resolve(preferredPath);
}

function normalizePath(value) {
  return value.startsWith("/") ? value : `/${value}`;
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function parseNonNegativeInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return parsed;
}

function parseIntegerInRange(value, label, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

function parsePositiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return parsed;
}

function parseBoolean(value, label) {
  if (value === "true" || value === "1" || value === "yes") {
    return true;
  }

  if (value === "false" || value === "0" || value === "no") {
    return false;
  }

  throw new Error(`${label} must be true or false.`);
}

function parseCommaSeparatedValues(value) {
  return value
    .split(",")
    .map((entry) => {
      return entry.trim();
    })
    .filter((entry) => {
      return entry.length > 0;
    });
}
