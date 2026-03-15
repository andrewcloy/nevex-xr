import { JETSON_SUPPORTED_THERMAL_OVERLAY_MODES } from "../../jetson_sender_helpers.mjs";

const SUPPORTED_CONTROL_COMMAND_TYPES = [
  "settings_patch",
  "brightness_command",
  "overlay_command",
  "viewer_command",
  "diagnostics_command",
  "session_command",
];
const SUPPORTED_SESSION_COMMAND_ACTIONS = [
  "start_recording",
  "stop_recording",
  "ping",
  "run_preflight",
  "show_effective_config",
  "capture_snapshot",
  "select_profile",
];

export function parseSenderControlCommand(rawMessage) {
  const record = expectRecord(rawMessage, "command");
  const type = expectEnum(
    record.type,
    "command.type",
    SUPPORTED_CONTROL_COMMAND_TYPES,
  );
  const payload = expectRecord(record.payload, "command.payload");
  const timestampMs =
    record.timestampMs === undefined
      ? Date.now()
      : validateNonNegativeNumber(record.timestampMs, "command.timestampMs");

  switch (type) {
    case "settings_patch":
      return {
        type,
        timestampMs,
        payload: {
          changes: validateSupportedSettingsPatch(payload.changes),
        },
      };
    case "brightness_command":
      return {
        type,
        timestampMs,
        payload: {
          value: validateFiniteNumber(payload.value, "command.payload.value"),
        },
      };
    case "overlay_command":
      return {
        type,
        timestampMs,
        payload: {
          enabled: validateBoolean(payload.enabled, "command.payload.enabled"),
        },
      };
    case "viewer_command":
      return {
        type,
        timestampMs,
        payload,
      };
    case "diagnostics_command":
      return {
        type,
        timestampMs,
        payload,
      };
    case "session_command": {
      const action = expectEnum(
        payload.action,
        "command.payload.action",
        SUPPORTED_SESSION_COMMAND_ACTIONS,
      );
      return {
        type,
        timestampMs,
        payload: {
          action,
          profileName:
            payload.profileName === undefined
              ? undefined
              : validateNonEmptyString(
                  payload.profileName,
                  "command.payload.profileName",
                ),
        },
      };
    }
  }

  throw new Error("Unsupported control command.");
}

function validateSupportedSettingsPatch(changes) {
  const record = expectRecord(changes, "command.payload.changes");

  const patch = {};
  if (record.thermalOverlayMode !== undefined) {
    patch.thermalOverlayMode = expectEnum(
      record.thermalOverlayMode,
      "command.payload.changes.thermalOverlayMode",
      JETSON_SUPPORTED_THERMAL_OVERLAY_MODES,
    );
  }

  if (record.irEnabled !== undefined) {
    patch.irEnabled = validateBoolean(
      record.irEnabled,
      "command.payload.changes.irEnabled",
    );
  }

  if (record.irLevel !== undefined) {
    patch.irLevel = validateNonNegativeInteger(
      record.irLevel,
      "command.payload.changes.irLevel",
    );
  }

  if (record.recordingEnabled !== undefined) {
    patch.recordingEnabled = validateBoolean(
      record.recordingEnabled,
      "command.payload.changes.recordingEnabled",
    );
  }

  return patch;
}

function expectRecord(value, fieldPath) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldPath} must be an object.`);
  }

  return value;
}

function expectEnum(value, fieldPath, allowedValues) {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw new Error(`${fieldPath} must be one of: ${allowedValues.join(", ")}.`);
  }

  return value;
}

function validateBoolean(value, fieldPath) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldPath} must be a boolean.`);
  }

  return value;
}

function validateFiniteNumber(value, fieldPath) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldPath} must be a finite number.`);
  }

  return parsed;
}

function validateNonEmptyString(value, fieldPath) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldPath} must be a non-empty string.`);
  }

  return value.trim();
}

function validateNonNegativeNumber(value, fieldPath) {
  const parsed = validateFiniteNumber(value, fieldPath);
  if (parsed < 0) {
    throw new Error(`${fieldPath} must be non-negative.`);
  }

  return parsed;
}

function validateNonNegativeInteger(value, fieldPath) {
  const parsed = validateNonNegativeNumber(value, fieldPath);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldPath} must be an integer.`);
  }

  return parsed;
}
