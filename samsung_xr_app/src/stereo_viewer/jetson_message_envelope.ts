import type {
  JetsonCapabilitiesPayload,
  JetsonRemoteConfigPayload,
  JetsonEyeFramePayload,
  JetsonEyeImagePayload,
  JetsonOverlayAnnotationPayload,
  JetsonOverlayPayload,
  JetsonSourceStatusPayload,
  JetsonStereoFramePayload,
  JetsonTransportErrorPayload,
  JetsonTransportStatusPayload,
} from "./jetson_transport_payloads";
import {
  HEARING_ENHANCEMENT_MODES,
  MEDIA_PLAYBACK_STATES,
} from "./audio_models";
import {
  DEFAULT_THERMAL_OVERLAY_MODE,
  THERMAL_OVERLAY_MODES,
} from "./thermal_models";

/**
 * First supported Jetson message envelope version.
 */
export const JETSON_MESSAGE_ENVELOPE_VERSION = 1;

/**
 * Message types supported by the first protocol-facing Jetson seam.
 */
export type JetsonMessageType =
  | "capabilities"
  | "transport_status"
  | "source_status"
  | "stereo_frame"
  | "error"
  | "remote_config";

/**
 * Protocol issue kinds surfaced by the parser/validator layer.
 */
export type JetsonProtocolIssueKind =
  | "malformed_envelope"
  | "unsupported_message_type"
  | "invalid_payload"
  | "mapping_failure";

/**
 * Mapping from message type to payload model.
 */
export interface JetsonMessagePayloadMap {
  readonly capabilities: JetsonCapabilitiesPayload;
  readonly transport_status: JetsonTransportStatusPayload;
  readonly source_status: JetsonSourceStatusPayload;
  readonly stereo_frame: JetsonStereoFramePayload;
  readonly error: JetsonTransportErrorPayload;
  readonly remote_config: JetsonRemoteConfigPayload;
}

/**
 * Generic, versioned Jetson message envelope.
 */
export interface JetsonMessageEnvelopeBase<
  T extends JetsonMessageType = JetsonMessageType,
> {
  readonly version: typeof JETSON_MESSAGE_ENVELOPE_VERSION;
  readonly messageType: T;
  readonly timestampMs: number;
  readonly sequence?: number;
  readonly payload: JetsonMessagePayloadMap[T];
}

export type JetsonMessageEnvelope = {
  [T in JetsonMessageType]: JetsonMessageEnvelopeBase<T>;
}[JetsonMessageType];

/**
 * Structured protocol error used by the Jetson message parser/validator.
 */
export class JetsonProtocolIssueError extends Error {
  readonly kind: Exclude<JetsonProtocolIssueKind, "mapping_failure">;

  readonly fieldPath: string;

  readonly detail: string;

  constructor(
    kind: Exclude<JetsonProtocolIssueKind, "mapping_failure">,
    fieldPath: string,
    detail: string,
  ) {
    super(`${fieldPath}: ${detail}`);
    this.name = "JetsonProtocolIssueError";
    this.kind = kind;
    this.fieldPath = fieldPath;
    this.detail = detail;
  }
}

/**
 * Validation limits used by the protocol ingest path.
 */
export interface JetsonProtocolValidationOptions {
  readonly maxMessageBytes: number;
  readonly maxImagePayloadBytes: number;
}

export const DEFAULT_JETSON_PROTOCOL_VALIDATION_OPTIONS: JetsonProtocolValidationOptions =
  {
    maxMessageBytes: 512 * 1024,
    maxImagePayloadBytes: 256 * 1024,
  };

export function normalizeJetsonProtocolValidationOptions(
  options: Partial<JetsonProtocolValidationOptions> = {},
): JetsonProtocolValidationOptions {
  return {
    maxMessageBytes: Math.max(
      0,
      Math.round(
        options.maxMessageBytes ??
          DEFAULT_JETSON_PROTOCOL_VALIDATION_OPTIONS.maxMessageBytes,
      ),
    ),
    maxImagePayloadBytes: Math.max(
      0,
      Math.round(
        options.maxImagePayloadBytes ??
          DEFAULT_JETSON_PROTOCOL_VALIDATION_OPTIONS.maxImagePayloadBytes,
      ),
    ),
  };
}

export function isJetsonProtocolIssueError(
  error: unknown,
): error is JetsonProtocolIssueError {
  return error instanceof JetsonProtocolIssueError;
}

/**
 * Creates a typed Jetson message envelope.
 */
export function createJetsonMessageEnvelope<T extends JetsonMessageType>(
  messageType: T,
  payload: JetsonMessagePayloadMap[T],
  options: {
    readonly timestampMs?: number;
    readonly sequence?: number;
  } = {},
): JetsonMessageEnvelopeBase<T> {
  const timestampMs = validateNonNegativeNumber(
    options.timestampMs ?? Date.now(),
    "timestampMs",
    "malformed_envelope",
  );
  const sequence =
    options.sequence === undefined
      ? undefined
      : validateNonNegativeInteger(
          options.sequence,
          "sequence",
          "malformed_envelope",
        );

  return {
    version: JETSON_MESSAGE_ENVELOPE_VERSION,
    messageType,
    timestampMs,
    sequence,
    payload: validateJetsonMessagePayload(
      messageType,
      payload,
      DEFAULT_JETSON_PROTOCOL_VALIDATION_OPTIONS,
    ),
  };
}

export function buildCapabilitiesEnvelope(
  payload: JetsonCapabilitiesPayload,
  options?: {
    readonly timestampMs?: number;
    readonly sequence?: number;
  },
): JetsonMessageEnvelopeBase<"capabilities"> {
  return createJetsonMessageEnvelope("capabilities", payload, options);
}

export function buildTransportStatusEnvelope(
  payload: JetsonTransportStatusPayload,
  options?: {
    readonly timestampMs?: number;
    readonly sequence?: number;
  },
): JetsonMessageEnvelopeBase<"transport_status"> {
  return createJetsonMessageEnvelope("transport_status", payload, options);
}

export function buildSourceStatusEnvelope(
  payload: JetsonSourceStatusPayload,
  options?: {
    readonly timestampMs?: number;
    readonly sequence?: number;
  },
): JetsonMessageEnvelopeBase<"source_status"> {
  return createJetsonMessageEnvelope("source_status", payload, options);
}

export function buildStereoFrameEnvelope(
  payload: JetsonStereoFramePayload,
  options?: {
    readonly timestampMs?: number;
    readonly sequence?: number;
  },
): JetsonMessageEnvelopeBase<"stereo_frame"> {
  return createJetsonMessageEnvelope("stereo_frame", payload, options);
}

export function buildErrorEnvelope(
  payload: JetsonTransportErrorPayload,
  options?: {
    readonly timestampMs?: number;
    readonly sequence?: number;
  },
): JetsonMessageEnvelopeBase<"error"> {
  return createJetsonMessageEnvelope("error", payload, options);
}

export function buildRemoteConfigEnvelope(
  payload: JetsonRemoteConfigPayload,
  options?: {
    readonly timestampMs?: number;
    readonly sequence?: number;
  },
): JetsonMessageEnvelopeBase<"remote_config"> {
  return createJetsonMessageEnvelope("remote_config", payload, options);
}

/**
 * Parses and validates the top-level envelope shape from an incoming message.
 *
 * Message-specific payload validation happens here so protocol issues are
 * rejected before the adapter mapping layer runs.
 */
export function parseJetsonMessageEnvelope(
  rawMessage: unknown,
  validationOptions: Partial<JetsonProtocolValidationOptions> = {},
): JetsonMessageEnvelope {
  const normalizedValidationOptions =
    normalizeJetsonProtocolValidationOptions(validationOptions);
  const record = expectRecord(
    rawMessage,
    "envelope",
    "malformed_envelope",
  );
  const version = validateNonNegativeInteger(
    record.version,
    "envelope.version",
    "malformed_envelope",
  );
  if (version !== JETSON_MESSAGE_ENVELOPE_VERSION) {
    throw new JetsonProtocolIssueError(
      "malformed_envelope",
      "envelope.version",
      `unsupported version ${version}; expected ${JETSON_MESSAGE_ENVELOPE_VERSION}.`,
    );
  }

  const messageType = expectMessageType(record.messageType, "envelope.messageType");
  const timestampMs = validateNonNegativeNumber(
    record.timestampMs ?? record.timestamp,
    "envelope.timestampMs",
    "malformed_envelope",
  );
  const sequence =
    record.sequence === undefined
      ? undefined
      : validateNonNegativeInteger(
          record.sequence,
          "envelope.sequence",
          "malformed_envelope",
        );

  if (record.payload === undefined) {
    throw new JetsonProtocolIssueError(
      "malformed_envelope",
      "envelope.payload",
      "is required.",
    );
  }

  return {
    version: JETSON_MESSAGE_ENVELOPE_VERSION,
    messageType,
    timestampMs,
    sequence,
    payload: validateJetsonMessagePayload(
      messageType,
      record.payload,
      normalizedValidationOptions,
    ),
  } as JetsonMessageEnvelope;
}

function expectRecord(
  value: unknown,
  fieldPath: string,
  kind: Exclude<JetsonProtocolIssueKind, "mapping_failure">,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JetsonProtocolIssueError(kind, fieldPath, "must be an object.");
  }

  return value as Record<string, unknown>;
}

function expectMessageType(
  value: unknown,
  fieldPath: string,
): JetsonMessageType {
  if (
    value === "capabilities" ||
    value === "transport_status" ||
    value === "source_status" ||
    value === "stereo_frame" ||
    value === "error" ||
    value === "remote_config"
  ) {
    return value;
  }

  throw new JetsonProtocolIssueError(
    "unsupported_message_type",
    fieldPath,
    `unsupported message type ${JSON.stringify(value)}.`,
  );
}

function validateJetsonMessagePayload<T extends JetsonMessageType>(
  messageType: T,
  payload: unknown,
  validationOptions: JetsonProtocolValidationOptions,
): JetsonMessagePayloadMap[T] {
  switch (messageType) {
    case "capabilities":
      return validateCapabilitiesPayload(
        payload,
        validationOptions,
      ) as JetsonMessagePayloadMap[T];
    case "transport_status":
      return validateTransportStatusPayload(
        payload,
        validationOptions,
      ) as JetsonMessagePayloadMap[T];
    case "source_status":
      return validateSourceStatusPayload(
        payload,
        validationOptions,
      ) as JetsonMessagePayloadMap[T];
    case "stereo_frame":
      return validateStereoFramePayload(
        payload,
        validationOptions,
      ) as JetsonMessagePayloadMap[T];
    case "error":
      return validateErrorPayload(
        payload,
        validationOptions,
      ) as JetsonMessagePayloadMap[T];
    case "remote_config":
      return validateRemoteConfigPayload(
        payload,
        validationOptions,
      ) as JetsonMessagePayloadMap[T];
  }

  throw new JetsonProtocolIssueError(
    "unsupported_message_type",
    "envelope.messageType",
    `unsupported message type ${String(messageType)}.`,
  );
}

function validateCapabilitiesPayload(
  payload: unknown,
  validationOptions: JetsonProtocolValidationOptions,
): JetsonCapabilitiesPayload {
  const record = expectRecord(payload, "payload", "invalid_payload");
  validatePayloadByteSize(
    record,
    "payload",
    validationOptions.maxMessageBytes,
  );

  const supportedImagePayloadModes = validateRequiredArray(
    record.supportedImagePayloadModes,
    "payload.supportedImagePayloadModes",
  ).map((mode, index) =>
    validateRequiredEnum(
      mode,
      `payload.supportedImagePayloadModes[${index}]`,
      IMAGE_PAYLOAD_MODES,
    ),
  );

  if (supportedImagePayloadModes.length === 0) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      "payload.supportedImagePayloadModes",
      "must include at least one supported image payload mode.",
    );
  }

  const supportedThermalOverlayModes =
    validateOptionalArray(
      record.supportedThermalOverlayModes,
      "payload.supportedThermalOverlayModes",
    )?.map((mode, index) =>
      validateRequiredEnum(
        mode,
        `payload.supportedThermalOverlayModes[${index}]`,
        THERMAL_OVERLAY_MODES,
      ),
    ) ?? [DEFAULT_THERMAL_OVERLAY_MODE];

  if (supportedThermalOverlayModes.length === 0) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      "payload.supportedThermalOverlayModes",
      "must include at least one supported thermal overlay mode when provided.",
    );
  }

  const thermalAvailable = validateOptionalBoolean(
    record.thermalAvailable,
    "payload.thermalAvailable",
  ) ?? false;
  const thermalOverlaySupported = validateOptionalBoolean(
    record.thermalOverlaySupported,
    "payload.thermalOverlaySupported",
  ) ?? false;
  const irAvailable =
    validateOptionalBoolean(record.irAvailable, "payload.irAvailable") ?? false;
  const irEnabled =
    validateOptionalBoolean(record.irEnabled, "payload.irEnabled") ?? false;
  const irLevel =
    validateOptionalNonNegativeInteger(record.irLevel, "payload.irLevel") ?? 0;
  const irMaxLevel =
    validateOptionalNonNegativeInteger(record.irMaxLevel, "payload.irMaxLevel") ?? 0;
  const hearingModesSupported =
    validateOptionalArray(
      record.hearingModesSupported,
      "payload.hearingModesSupported",
    )?.map((mode, index) =>
      validateRequiredEnum(
        mode,
        `payload.hearingModesSupported[${index}]`,
        HEARING_ENHANCEMENT_MODES,
      ),
    ) ?? ["off"];
  const hearingEnhancementAvailable =
    validateOptionalBoolean(
      record.hearingEnhancementAvailable,
      "payload.hearingEnhancementAvailable",
    ) ?? false;
  const hearingGainMin =
    validateOptionalNonNegativeNumber(
      record.hearingGainMin,
      "payload.hearingGainMin",
    ) ?? 0;
  const hearingGainMax =
    validateOptionalNonNegativeNumber(
      record.hearingGainMax,
      "payload.hearingGainMax",
    ) ?? 1;
  const phoneAudioAvailable =
    validateOptionalBoolean(
      record.phoneAudioAvailable,
      "payload.phoneAudioAvailable",
    ) ?? false;
  const mediaVolumeMin =
    validateOptionalNonNegativeNumber(
      record.mediaVolumeMin,
      "payload.mediaVolumeMin",
    ) ?? 0;
  const mediaVolumeMax =
    validateOptionalNonNegativeNumber(
      record.mediaVolumeMax,
      "payload.mediaVolumeMax",
    ) ?? 1;

  if (irMaxLevel > 0 && irLevel > irMaxLevel) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      "payload.irLevel",
      "must be less than or equal to payload.irMaxLevel.",
    );
  }

  if (hearingGainMax < hearingGainMin) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      "payload.hearingGainMax",
      "must be greater than or equal to payload.hearingGainMin.",
    );
  }

  if (mediaVolumeMax < mediaVolumeMin) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      "payload.mediaVolumeMax",
      "must be greater than or equal to payload.mediaVolumeMin.",
    );
  }

  return {
    senderName: validateRequiredString(record.senderName, "payload.senderName"),
    senderVersion: validateOptionalString(
      record.senderVersion,
      "payload.senderVersion",
    ),
    supportedMessageVersion: validateNonNegativeInteger(
      record.supportedMessageVersion,
      "payload.supportedMessageVersion",
      "invalid_payload",
    ),
    supportedImagePayloadModes,
    maxRecommendedPayloadBytes: validateOptionalNonNegativeInteger(
      record.maxRecommendedPayloadBytes,
      "payload.maxRecommendedPayloadBytes",
    ),
    stereoFormatNote: validateOptionalString(
      record.stereoFormatNote,
      "payload.stereoFormatNote",
    ),
    thermalAvailable,
    thermalBackendIdentity: validateOptionalString(
      record.thermalBackendIdentity,
      "payload.thermalBackendIdentity",
    ),
    thermalFrameWidth: validateOptionalPositiveInteger(
      record.thermalFrameWidth,
      "payload.thermalFrameWidth",
    ),
    thermalFrameHeight: validateOptionalPositiveInteger(
      record.thermalFrameHeight,
      "payload.thermalFrameHeight",
    ),
    thermalFrameRate: validateOptionalPositiveNumber(
      record.thermalFrameRate,
      "payload.thermalFrameRate",
    ),
    thermalOverlaySupported,
    supportedThermalOverlayModes,
    thermalHealthState:
      validateOptionalEnum(
        record.thermalHealthState,
        "payload.thermalHealthState",
        THERMAL_HEALTH_STATES,
      ) ?? "unavailable",
    thermalErrorText: validateOptionalString(
      record.thermalErrorText,
      "payload.thermalErrorText",
    ),
    irAvailable,
    irBackendIdentity: validateOptionalString(
      record.irBackendIdentity,
      "payload.irBackendIdentity",
    ),
    irEnabled,
    irLevel,
    irMaxLevel,
    irControlSupported:
      validateOptionalBoolean(
        record.irControlSupported,
        "payload.irControlSupported",
      ) ?? false,
    irFaultState: validateOptionalString(
      record.irFaultState,
      "payload.irFaultState",
    ),
    irErrorText: validateOptionalString(
      record.irErrorText,
      "payload.irErrorText",
    ),
    hearingEnhancementAvailable,
    microphoneArrayAvailable:
      validateOptionalBoolean(
        record.microphoneArrayAvailable,
        "payload.microphoneArrayAvailable",
      ) ?? false,
    audioEnhancementBackendIdentity: validateOptionalString(
      record.audioEnhancementBackendIdentity,
      "payload.audioEnhancementBackendIdentity",
    ),
    hearingModesSupported,
    hearingHealthState:
      validateOptionalEnum(
        record.hearingHealthState,
        "payload.hearingHealthState",
        HEARING_HEALTH_STATES,
      ) ?? "unavailable",
    hearingErrorText: validateOptionalString(
      record.hearingErrorText,
      "payload.hearingErrorText",
    ),
    hearingGainMin,
    hearingGainMax,
    hearingLatencyEstimateMs: validateOptionalNonNegativeNumber(
      record.hearingLatencyEstimateMs,
      "payload.hearingLatencyEstimateMs",
    ),
    phoneAudioAvailable,
    bluetoothAudioConnected:
      validateOptionalBoolean(
        record.bluetoothAudioConnected,
        "payload.bluetoothAudioConnected",
      ) ?? false,
    mediaPlaybackControlSupported:
      validateOptionalBoolean(
        record.mediaPlaybackControlSupported,
        "payload.mediaPlaybackControlSupported",
      ) ?? false,
    mediaPlaybackState:
      validateOptionalEnum(
        record.mediaPlaybackState,
        "payload.mediaPlaybackState",
        MEDIA_PLAYBACK_STATES,
      ) ?? "unavailable",
    mediaVolumeMin,
    mediaVolumeMax,
  };
}

function validateTransportStatusPayload(
  payload: unknown,
  validationOptions: JetsonProtocolValidationOptions,
): JetsonTransportStatusPayload {
  const record = expectRecord(payload, "payload", "invalid_payload");
  validatePayloadByteSize(
    record,
    "payload",
    validationOptions.maxMessageBytes,
  );

  return {
    transportState: validateOptionalEnum(
      record.transportState,
      "payload.transportState",
      TRANSPORT_STATES,
    ),
    connected: validateOptionalBoolean(record.connected, "payload.connected"),
    statusText: validateOptionalString(record.statusText, "payload.statusText"),
    lastError: validateOptionalString(record.lastError, "payload.lastError"),
    parseErrorText: validateOptionalString(
      record.parseErrorText,
      "payload.parseErrorText",
    ),
  };
}

function validateSourceStatusPayload(
  payload: unknown,
  validationOptions: JetsonProtocolValidationOptions,
): JetsonSourceStatusPayload {
  const record = expectRecord(payload, "payload", "invalid_payload");
  validatePayloadByteSize(
    record,
    "payload",
    validationOptions.maxMessageBytes,
  );

  return {
    sourceState: validateOptionalEnum(
      record.sourceState,
      "payload.sourceState",
      SOURCE_STATES,
    ),
    lastFrameId: validateOptionalNonNegativeInteger(
      record.lastFrameId,
      "payload.lastFrameId",
    ),
    lastTimestampMs: validateOptionalNonNegativeNumber(
      record.lastTimestampMs,
      "payload.lastTimestampMs",
    ),
    lastError: validateOptionalString(record.lastError, "payload.lastError"),
    statusText: validateOptionalString(record.statusText, "payload.statusText"),
    telemetryUpdatedAtMs: validateOptionalNonNegativeNumber(
      record.telemetryUpdatedAtMs,
      "payload.telemetryUpdatedAtMs",
    ),
    cameraTelemetry:
      record.cameraTelemetry === undefined
        ? undefined
        : validateSourceStatusCameraTelemetryPayload(
            record.cameraTelemetry,
            "payload.cameraTelemetry",
          ),
    thermalTelemetry:
      record.thermalTelemetry === undefined
        ? undefined
        : validateSourceStatusThermalTelemetryPayload(
            record.thermalTelemetry,
            "payload.thermalTelemetry",
          ),
    irIlluminatorStatus:
      record.irIlluminatorStatus === undefined
        ? undefined
        : validateSourceStatusIrIlluminatorStatusPayload(
            record.irIlluminatorStatus,
            "payload.irIlluminatorStatus",
          ),
  };
}

function validateSourceStatusCameraTelemetryPayload(
  payload: unknown,
  fieldPath: string,
) {
  const record = expectRecord(payload, fieldPath, "invalid_payload");

  return {
    captureBackendName: validateOptionalString(
      record.captureBackendName,
      `${fieldPath}.captureBackendName`,
    ),
    bridgeMode: validateOptionalString(
      record.bridgeMode,
      `${fieldPath}.bridgeMode`,
    ),
    startupValidated: validateOptionalBoolean(
      record.startupValidated,
      `${fieldPath}.startupValidated`,
    ),
    frameWidth: validateOptionalNonNegativeInteger(
      record.frameWidth,
      `${fieldPath}.frameWidth`,
    ),
    frameHeight: validateOptionalNonNegativeInteger(
      record.frameHeight,
      `${fieldPath}.frameHeight`,
    ),
    frameIntervalMs: validateOptionalNonNegativeNumber(
      record.frameIntervalMs,
      `${fieldPath}.frameIntervalMs`,
    ),
    frameSourceMode: validateOptionalString(
      record.frameSourceMode,
      `${fieldPath}.frameSourceMode`,
    ),
    frameSourceName: validateOptionalString(
      record.frameSourceName,
      `${fieldPath}.frameSourceName`,
    ),
    capturesAttempted: validateOptionalNonNegativeInteger(
      record.capturesAttempted,
      `${fieldPath}.capturesAttempted`,
    ),
    capturesSucceeded: validateOptionalNonNegativeInteger(
      record.capturesSucceeded,
      `${fieldPath}.capturesSucceeded`,
    ),
    capturesFailed: validateOptionalNonNegativeInteger(
      record.capturesFailed,
      `${fieldPath}.capturesFailed`,
    ),
    consecutiveFailureCount: validateOptionalNonNegativeInteger(
      record.consecutiveFailureCount,
      `${fieldPath}.consecutiveFailureCount`,
    ),
    lastSuccessfulCaptureTime: validateOptionalNonNegativeNumber(
      record.lastSuccessfulCaptureTime,
      `${fieldPath}.lastSuccessfulCaptureTime`,
    ),
    lastCaptureDurationMs: validateOptionalNonNegativeNumber(
      record.lastCaptureDurationMs,
      `${fieldPath}.lastCaptureDurationMs`,
    ),
    averageCaptureDurationMs: validateOptionalNonNegativeNumber(
      record.averageCaptureDurationMs,
      `${fieldPath}.averageCaptureDurationMs`,
    ),
    effectiveFrameIntervalMs: validateOptionalNonNegativeNumber(
      record.effectiveFrameIntervalMs,
      `${fieldPath}.effectiveFrameIntervalMs`,
    ),
    leftCameraDevice: validateOptionalString(
      record.leftCameraDevice,
      `${fieldPath}.leftCameraDevice`,
    ),
    rightCameraDevice: validateOptionalString(
      record.rightCameraDevice,
      `${fieldPath}.rightCameraDevice`,
    ),
    gstLaunchPath: validateOptionalString(
      record.gstLaunchPath,
      `${fieldPath}.gstLaunchPath`,
    ),
    captureHealthState: validateOptionalEnum(
      record.captureHealthState,
      `${fieldPath}.captureHealthState`,
      CAPTURE_HEALTH_STATES,
    ),
    captureRetryCount: validateOptionalNonNegativeInteger(
      record.captureRetryCount,
      `${fieldPath}.captureRetryCount`,
    ),
    captureRetryDelayMs: validateOptionalNonNegativeInteger(
      record.captureRetryDelayMs,
      `${fieldPath}.captureRetryDelayMs`,
    ),
    recentRetryAttempts: validateOptionalNonNegativeInteger(
      record.recentRetryAttempts,
      `${fieldPath}.recentRetryAttempts`,
    ),
    currentRetryAttempt: validateOptionalNonNegativeInteger(
      record.currentRetryAttempt,
      `${fieldPath}.currentRetryAttempt`,
    ),
    transientFailureCount: validateOptionalNonNegativeInteger(
      record.transientFailureCount,
      `${fieldPath}.transientFailureCount`,
    ),
    recoveryCount: validateOptionalNonNegativeInteger(
      record.recoveryCount,
      `${fieldPath}.recoveryCount`,
    ),
    lastRecoveryTime: validateOptionalNonNegativeNumber(
      record.lastRecoveryTime,
      `${fieldPath}.lastRecoveryTime`,
    ),
    lastTerminalFailureTime: validateOptionalNonNegativeNumber(
      record.lastTerminalFailureTime,
      `${fieldPath}.lastTerminalFailureTime`,
    ),
    replaySourceIdentity: validateOptionalString(
      record.replaySourceIdentity,
      `${fieldPath}.replaySourceIdentity`,
    ),
    replayLoopEnabled: validateOptionalBoolean(
      record.replayLoopEnabled,
      `${fieldPath}.replayLoopEnabled`,
    ),
    replayCurrentIndex: validateOptionalNonNegativeInteger(
      record.replayCurrentIndex,
      `${fieldPath}.replayCurrentIndex`,
    ),
    replayFrameCount: validateOptionalNonNegativeInteger(
      record.replayFrameCount,
      `${fieldPath}.replayFrameCount`,
    ),
    replayLeftSource: validateOptionalString(
      record.replayLeftSource,
      `${fieldPath}.replayLeftSource`,
    ),
    replayRightSource: validateOptionalString(
      record.replayRightSource,
      `${fieldPath}.replayRightSource`,
    ),
    replayTimingMode: validateOptionalEnum(
      record.replayTimingMode,
      `${fieldPath}.replayTimingMode`,
      ["fixed", "recorded"] as const,
    ),
    replayTimeScale: validateOptionalPositiveNumber(
      record.replayTimeScale,
      `${fieldPath}.replayTimeScale`,
    ),
    replayManifestLoaded: validateOptionalBoolean(
      record.replayManifestLoaded,
      `${fieldPath}.replayManifestLoaded`,
    ),
    replayManifestValidated: validateOptionalBoolean(
      record.replayManifestValidated,
      `${fieldPath}.replayManifestValidated`,
    ),
    replayManifestErrorCount: validateOptionalNonNegativeInteger(
      record.replayManifestErrorCount,
      `${fieldPath}.replayManifestErrorCount`,
    ),
    replayManifestWarningCount: validateOptionalNonNegativeInteger(
      record.replayManifestWarningCount,
      `${fieldPath}.replayManifestWarningCount`,
    ),
    replayManifestSource: validateOptionalString(
      record.replayManifestSource,
      `${fieldPath}.replayManifestSource`,
    ),
    replayValidationSummary: validateOptionalString(
      record.replayValidationSummary,
      `${fieldPath}.replayValidationSummary`,
    ),
    replayRecordedTimestamp: validateOptionalNonNegativeNumber(
      record.replayRecordedTimestamp,
      `${fieldPath}.replayRecordedTimestamp`,
    ),
    replayDelayUntilNextMs: validateOptionalNonNegativeNumber(
      record.replayDelayUntilNextMs,
      `${fieldPath}.replayDelayUntilNextMs`,
    ),
    replayScaledDelayUntilNextMs: validateOptionalNonNegativeNumber(
      record.replayScaledDelayUntilNextMs,
      `${fieldPath}.replayScaledDelayUntilNextMs`,
    ),
    replayTimingOffsetMs: validateOptionalFiniteNumber(
      record.replayTimingOffsetMs,
      `${fieldPath}.replayTimingOffsetMs`,
    ),
    replayNominalLoopDurationMs: validateOptionalNonNegativeNumber(
      record.replayNominalLoopDurationMs,
      `${fieldPath}.replayNominalLoopDurationMs`,
    ),
    replayScaledLoopDurationMs: validateOptionalNonNegativeNumber(
      record.replayScaledLoopDurationMs,
      `${fieldPath}.replayScaledLoopDurationMs`,
    ),
    recentCaptureEvents:
      record.recentCaptureEvents === undefined
        ? undefined
        : validateSourceStatusCaptureEvents(
            record.recentCaptureEvents,
            `${fieldPath}.recentCaptureEvents`,
          ),
    runtimeProfileName: validateOptionalString(
      record.runtimeProfileName,
      `${fieldPath}.runtimeProfileName`,
    ),
    runtimeProfileType: validateOptionalString(
      record.runtimeProfileType,
      `${fieldPath}.runtimeProfileType`,
    ),
    runtimeProfileDescription: validateOptionalString(
      record.runtimeProfileDescription,
      `${fieldPath}.runtimeProfileDescription`,
    ),
    defaultProfileName: validateOptionalString(
      record.defaultProfileName,
      `${fieldPath}.defaultProfileName`,
    ),
    availableProfileNames: validateOptionalStringArray(
      record.availableProfileNames,
      `${fieldPath}.availableProfileNames`,
    ),
    leftSensorId: validateOptionalStringOrNumber(
      record.leftSensorId,
      `${fieldPath}.leftSensorId`,
    ),
    rightSensorId: validateOptionalStringOrNumber(
      record.rightSensorId,
      `${fieldPath}.rightSensorId`,
    ),
    inputWidth: validateOptionalNonNegativeInteger(
      record.inputWidth,
      `${fieldPath}.inputWidth`,
    ),
    inputHeight: validateOptionalNonNegativeInteger(
      record.inputHeight,
      `${fieldPath}.inputHeight`,
    ),
    outputWidth: validateOptionalNonNegativeInteger(
      record.outputWidth,
      `${fieldPath}.outputWidth`,
    ),
    outputHeight: validateOptionalNonNegativeInteger(
      record.outputHeight,
      `${fieldPath}.outputHeight`,
    ),
    outputMode: validateOptionalString(
      record.outputMode,
      `${fieldPath}.outputMode`,
    ),
    effectiveFps: validateOptionalPositiveNumber(
      record.effectiveFps,
      `${fieldPath}.effectiveFps`,
    ),
    recordingContainer: validateOptionalString(
      record.recordingContainer,
      `${fieldPath}.recordingContainer`,
    ),
    recordDurationSeconds: validateOptionalNonNegativeInteger(
      record.recordDurationSeconds,
      `${fieldPath}.recordDurationSeconds`,
    ),
    testDurationSeconds: validateOptionalNonNegativeInteger(
      record.testDurationSeconds,
      `${fieldPath}.testDurationSeconds`,
    ),
    queueMaxSizeBuffers: validateOptionalNonNegativeInteger(
      record.queueMaxSizeBuffers,
      `${fieldPath}.queueMaxSizeBuffers`,
    ),
    outputDirectory: validateOptionalString(
      record.outputDirectory,
      `${fieldPath}.outputDirectory`,
    ),
    recordingActive: validateOptionalBoolean(
      record.recordingActive,
      `${fieldPath}.recordingActive`,
    ),
    recordingOutputPath: validateOptionalString(
      record.recordingOutputPath,
      `${fieldPath}.recordingOutputPath`,
    ),
    artifactType: validateOptionalString(
      record.artifactType,
      `${fieldPath}.artifactType`,
    ),
    artifactPath: validateOptionalString(
      record.artifactPath,
      `${fieldPath}.artifactPath`,
    ),
    artifactSizeBytes: validateOptionalNonNegativeInteger(
      record.artifactSizeBytes,
      `${fieldPath}.artifactSizeBytes`,
    ),
    artifactCapturedAt: validateOptionalString(
      record.artifactCapturedAt,
      `${fieldPath}.artifactCapturedAt`,
    ),
    artifactMetadataSource: validateOptionalString(
      record.artifactMetadataSource,
      `${fieldPath}.artifactMetadataSource`,
    ),
    preflightOverallStatus: validateOptionalString(
      record.preflightOverallStatus,
      `${fieldPath}.preflightOverallStatus`,
    ),
    preflightOk: validateOptionalBoolean(
      record.preflightOk,
      `${fieldPath}.preflightOk`,
    ),
    preflightPassCount: validateOptionalNonNegativeInteger(
      record.preflightPassCount,
      `${fieldPath}.preflightPassCount`,
    ),
    preflightWarnCount: validateOptionalNonNegativeInteger(
      record.preflightWarnCount,
      `${fieldPath}.preflightWarnCount`,
    ),
    preflightFailCount: validateOptionalNonNegativeInteger(
      record.preflightFailCount,
      `${fieldPath}.preflightFailCount`,
    ),
    preflightCriticalFailCount: validateOptionalNonNegativeInteger(
      record.preflightCriticalFailCount,
      `${fieldPath}.preflightCriticalFailCount`,
    ),
    systemIsJetson: validateOptionalBoolean(
      record.systemIsJetson,
      `${fieldPath}.systemIsJetson`,
    ),
    jetpackVersion: validateOptionalString(
      record.jetpackVersion,
      `${fieldPath}.jetpackVersion`,
    ),
    l4tVersion: validateOptionalString(
      record.l4tVersion,
      `${fieldPath}.l4tVersion`,
    ),
    projectName: validateOptionalString(
      record.projectName,
      `${fieldPath}.projectName`,
    ),
    configPath: validateOptionalString(
      record.configPath,
      `${fieldPath}.configPath`,
    ),
    gstLaunchBinary: validateOptionalString(
      record.gstLaunchBinary,
      `${fieldPath}.gstLaunchBinary`,
    ),
  };
}

function validateSourceStatusThermalTelemetryPayload(
  payload: unknown,
  fieldPath: string,
) {
  const record = expectRecord(payload, fieldPath, "invalid_payload");
  const supportedThermalOverlayModes =
    validateOptionalArray(
      record.supportedThermalOverlayModes,
      `${fieldPath}.supportedThermalOverlayModes`,
    )?.map((mode, index) =>
      validateRequiredEnum(
        mode,
        `${fieldPath}.supportedThermalOverlayModes[${index}]`,
        THERMAL_OVERLAY_MODES,
      ),
    ) ?? [DEFAULT_THERMAL_OVERLAY_MODE];

  return {
    thermalAvailable:
      validateOptionalBoolean(
        record.thermalAvailable,
        `${fieldPath}.thermalAvailable`,
      ) ?? false,
    thermalBackendIdentity: validateOptionalString(
      record.thermalBackendIdentity,
      `${fieldPath}.thermalBackendIdentity`,
    ),
    thermalFrameWidth: validateOptionalPositiveInteger(
      record.thermalFrameWidth,
      `${fieldPath}.thermalFrameWidth`,
    ),
    thermalFrameHeight: validateOptionalPositiveInteger(
      record.thermalFrameHeight,
      `${fieldPath}.thermalFrameHeight`,
    ),
    thermalFrameRate: validateOptionalPositiveNumber(
      record.thermalFrameRate,
      `${fieldPath}.thermalFrameRate`,
    ),
    thermalOverlaySupported:
      validateOptionalBoolean(
        record.thermalOverlaySupported,
        `${fieldPath}.thermalOverlaySupported`,
      ) ?? false,
    supportedThermalOverlayModes,
    thermalHealthState:
      validateOptionalEnum(
        record.thermalHealthState,
        `${fieldPath}.thermalHealthState`,
        THERMAL_HEALTH_STATES,
      ) ?? "unavailable",
    thermalErrorText: validateOptionalString(
      record.thermalErrorText,
      `${fieldPath}.thermalErrorText`,
    ),
    currentOverlayMode:
      validateOptionalEnum(
        record.currentOverlayMode,
        `${fieldPath}.currentOverlayMode`,
        THERMAL_OVERLAY_MODES,
      ) ?? DEFAULT_THERMAL_OVERLAY_MODE,
    lastThermalFrameId: validateOptionalNonNegativeInteger(
      record.lastThermalFrameId,
      `${fieldPath}.lastThermalFrameId`,
    ),
    lastThermalTimestamp: validateOptionalNonNegativeNumber(
      record.lastThermalTimestamp,
      `${fieldPath}.lastThermalTimestamp`,
    ),
    hotspotCount: validateOptionalNonNegativeInteger(
      record.hotspotCount,
      `${fieldPath}.hotspotCount`,
    ),
    paletteHint: validateOptionalString(
      record.paletteHint,
      `${fieldPath}.paletteHint`,
    ),
  };
}

function validateSourceStatusIrIlluminatorStatusPayload(
  payload: unknown,
  fieldPath: string,
) {
  const record = expectRecord(payload, fieldPath, "invalid_payload");
  const irLevel =
    validateOptionalNonNegativeInteger(record.irLevel, `${fieldPath}.irLevel`) ?? 0;
  const irMaxLevel =
    validateOptionalNonNegativeInteger(
      record.irMaxLevel,
      `${fieldPath}.irMaxLevel`,
    ) ?? 0;

  if (irMaxLevel > 0 && irLevel > irMaxLevel) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      `${fieldPath}.irLevel`,
      `must be less than or equal to ${fieldPath}.irMaxLevel.`,
    );
  }

  return {
    irAvailable:
      validateOptionalBoolean(record.irAvailable, `${fieldPath}.irAvailable`) ?? false,
    irBackendIdentity: validateOptionalString(
      record.irBackendIdentity,
      `${fieldPath}.irBackendIdentity`,
    ),
    irEnabled:
      validateOptionalBoolean(record.irEnabled, `${fieldPath}.irEnabled`) ?? false,
    irLevel,
    irMaxLevel,
    irControlSupported:
      validateOptionalBoolean(
        record.irControlSupported,
        `${fieldPath}.irControlSupported`,
      ) ?? false,
    irFaultState: validateOptionalString(
      record.irFaultState,
      `${fieldPath}.irFaultState`,
    ),
    irErrorText: validateOptionalString(
      record.irErrorText,
      `${fieldPath}.irErrorText`,
    ),
  };
}

function validateSourceStatusCaptureEvents(payload: unknown, fieldPath: string) {
  const events = validateRequiredArray(payload, fieldPath);

  return events.map((entry: unknown, index: number) => {
    const entryPath = `${fieldPath}[${index}]`;
    const record = expectRecord(entry, entryPath, "invalid_payload");

    return {
      timestampMs: validateNonNegativeNumber(
        record.timestampMs,
        `${entryPath}.timestampMs`,
        "invalid_payload",
      ),
      eventType: validateRequiredEnum(
        record.eventType,
        `${entryPath}.eventType`,
        RECENT_CAPTURE_EVENT_TYPES,
      ),
      retryAttempt: validateOptionalNonNegativeInteger(
        record.retryAttempt,
        `${entryPath}.retryAttempt`,
      ),
      eye: validateOptionalEnum(record.eye, `${entryPath}.eye`, EYES),
      summary: validateRequiredString(record.summary, `${entryPath}.summary`),
    };
  });
}

function validateStereoFramePayload(
  payload: unknown,
  validationOptions: JetsonProtocolValidationOptions,
): JetsonStereoFramePayload {
  const record = expectRecord(payload, "payload", "invalid_payload");
  validatePayloadByteSize(
    record,
    "payload",
    validationOptions.maxMessageBytes,
  );

  return {
    frameId: validateNonNegativeInteger(
      record.frameId,
      "payload.frameId",
      "invalid_payload",
    ),
    timestampMs:
      record.timestampMs === undefined
        ? undefined
        : validateNonNegativeNumber(
            record.timestampMs,
            "payload.timestampMs",
            "invalid_payload",
          ),
    sourceId: validateOptionalString(record.sourceId, "payload.sourceId"),
    sceneId: validateOptionalString(record.sceneId, "payload.sceneId"),
    streamName: validateOptionalString(record.streamName, "payload.streamName"),
    tags: validateOptionalStringArray(record.tags, "payload.tags"),
    extras: validateOptionalPrimitiveRecord(record.extras, "payload.extras"),
    overlay:
      record.overlay === undefined
        ? undefined
        : validateOverlayPayload(record.overlay, "payload.overlay"),
    thermalFrame:
      record.thermalFrame === undefined
        ? undefined
        : validateThermalFramePayload(record.thermalFrame, "payload.thermalFrame"),
    thermalOverlayMode:
      record.thermalOverlayMode === undefined
        ? undefined
        : validateRequiredEnum(
            record.thermalOverlayMode,
            "payload.thermalOverlayMode",
            THERMAL_OVERLAY_MODES,
          ),
    left: validateEyeFramePayload(
      record.left,
      "payload.left",
      "left",
      validationOptions,
    ),
    right: validateEyeFramePayload(
      record.right,
      "payload.right",
      "right",
      validationOptions,
    ),
  };
}

function validateThermalFramePayload(
  payload: unknown,
  fieldPath: string,
) {
  const record = expectRecord(payload, fieldPath, "invalid_payload");
  const width = validatePositiveInteger(record.width, `${fieldPath}.width`);
  const height = validatePositiveInteger(record.height, `${fieldPath}.height`);
  const thermalValues = validateRequiredArray(
    record.thermalValues,
    `${fieldPath}.thermalValues`,
  ).map((entry, index) =>
    validateFiniteNumber(
      entry,
      `${fieldPath}.thermalValues[${index}]`,
      "invalid_payload",
    ),
  );

  if (thermalValues.length !== width * height) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      `${fieldPath}.thermalValues`,
      `must contain exactly width*height entries (${width * height}).`,
    );
  }

  const minTemperature = validateFiniteNumber(
    record.minTemperature,
    `${fieldPath}.minTemperature`,
    "invalid_payload",
  );
  const maxTemperature = validateFiniteNumber(
    record.maxTemperature,
    `${fieldPath}.maxTemperature`,
    "invalid_payload",
  );
  if (maxTemperature < minTemperature) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      `${fieldPath}.maxTemperature`,
      "must be greater than or equal to payload.thermalFrame.minTemperature.",
    );
  }

  return {
    frameId: validateNonNegativeInteger(
      record.frameId,
      `${fieldPath}.frameId`,
      "invalid_payload",
    ),
    timestamp: validateNonNegativeNumber(
      record.timestamp,
      `${fieldPath}.timestamp`,
      "invalid_payload",
    ),
    width,
    height,
    thermalValues,
    minTemperature,
    maxTemperature,
    hotspotAnnotations:
      record.hotspotAnnotations === undefined
        ? undefined
        : validateThermalHotspotAnnotations(
            record.hotspotAnnotations,
            `${fieldPath}.hotspotAnnotations`,
          ),
    paletteHint: validateOptionalString(
      record.paletteHint,
      `${fieldPath}.paletteHint`,
    ),
  };
}

function validateThermalHotspotAnnotations(payload: unknown, fieldPath: string) {
  const annotations = validateRequiredArray(payload, fieldPath);
  return annotations.map((entry, index) => {
    const entryPath = `${fieldPath}[${index}]`;
    const record = expectRecord(entry, entryPath, "invalid_payload");

    return {
      id: validateRequiredString(record.id, `${entryPath}.id`),
      label: validateOptionalString(record.label, `${entryPath}.label`),
      normalizedX: validateNormalizedNumber(
        record.normalizedX,
        `${entryPath}.normalizedX`,
      ),
      normalizedY: validateNormalizedNumber(
        record.normalizedY,
        `${entryPath}.normalizedY`,
      ),
      normalizedRadius: validateOptionalNormalizedNumber(
        record.normalizedRadius,
        `${entryPath}.normalizedRadius`,
      ),
      normalizedBoxWidth: validateOptionalNormalizedNumber(
        record.normalizedBoxWidth,
        `${entryPath}.normalizedBoxWidth`,
      ),
      normalizedBoxHeight: validateOptionalNormalizedNumber(
        record.normalizedBoxHeight,
        `${entryPath}.normalizedBoxHeight`,
      ),
      temperatureC: validateOptionalFiniteNumber(
        record.temperatureC,
        `${entryPath}.temperatureC`,
      ),
      intensityNormalized: validateOptionalNormalizedNumber(
        record.intensityNormalized,
        `${entryPath}.intensityNormalized`,
      ),
    };
  });
}

function validateErrorPayload(
  payload: unknown,
  validationOptions: JetsonProtocolValidationOptions,
): JetsonTransportErrorPayload {
  const record = expectRecord(payload, "payload", "invalid_payload");
  validatePayloadByteSize(
    record,
    "payload",
    validationOptions.maxMessageBytes,
  );

  return {
    message: validateRequiredString(record.message, "payload.message"),
    code: validateOptionalString(record.code, "payload.code"),
    stage: validateOptionalEnum(record.stage, "payload.stage", ERROR_STAGES),
    recoverable: validateOptionalBoolean(
      record.recoverable,
      "payload.recoverable",
    ),
    details: validateOptionalPrimitiveRecord(record.details, "payload.details"),
  };
}

function validateRemoteConfigPayload(
  payload: unknown,
  validationOptions: JetsonProtocolValidationOptions,
): JetsonRemoteConfigPayload {
  const record = expectRecord(payload, "payload", "invalid_payload");
  validatePayloadByteSize(
    record,
    "payload",
    validationOptions.maxMessageBytes,
  );

  return {
    host: validateOptionalString(record.host, "payload.host"),
    port: validateOptionalNonNegativeInteger(record.port, "payload.port"),
    path: validateOptionalString(record.path, "payload.path"),
    protocolType: validateOptionalString(
      record.protocolType,
      "payload.protocolType",
    ),
    reconnectEnabled: validateOptionalBoolean(
      record.reconnectEnabled,
      "payload.reconnectEnabled",
    ),
    reconnectIntervalMs: validateOptionalNonNegativeInteger(
      record.reconnectIntervalMs,
      "payload.reconnectIntervalMs",
    ),
    streamName: validateOptionalString(record.streamName, "payload.streamName"),
    maxMessageBytes: validateOptionalNonNegativeInteger(
      record.maxMessageBytes,
      "payload.maxMessageBytes",
    ),
    maxImagePayloadBytes: validateOptionalNonNegativeInteger(
      record.maxImagePayloadBytes,
      "payload.maxImagePayloadBytes",
    ),
    options: validateOptionalOptionRecord(record.options, "payload.options"),
  };
}

function validateEyeFramePayload(
  payload: unknown,
  fieldPath: string,
  expectedEye: "left" | "right",
  validationOptions: JetsonProtocolValidationOptions,
): JetsonEyeFramePayload {
  const record = expectRecord(payload, fieldPath, "invalid_payload");
  const eye = validateRequiredEnum(record.eye, `${fieldPath}.eye`, EYES);
  if (eye !== expectedEye) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      `${fieldPath}.eye`,
      `must be ${JSON.stringify(expectedEye)}.`,
    );
  }

  return {
    eye,
    width: validatePositiveInteger(record.width, `${fieldPath}.width`),
    height: validatePositiveInteger(record.height, `${fieldPath}.height`),
    format: validateOptionalEnum(
      record.format,
      `${fieldPath}.format`,
      EYE_FORMATS,
    ),
    contentLabel: validateOptionalString(
      record.contentLabel,
      `${fieldPath}.contentLabel`,
    ),
    title: validateOptionalString(record.title, `${fieldPath}.title`),
    markerText: validateOptionalString(
      record.markerText,
      `${fieldPath}.markerText`,
    ),
    backgroundHex: validateOptionalString(
      record.backgroundHex,
      `${fieldPath}.backgroundHex`,
    ),
    accentHex: validateOptionalString(
      record.accentHex,
      `${fieldPath}.accentHex`,
    ),
    image:
      record.image === undefined
        ? undefined
        : validateEyeImagePayload(
            record.image,
            `${fieldPath}.image`,
            validationOptions.maxImagePayloadBytes,
          ),
    metadata: validateOptionalPrimitiveRecord(
      record.metadata,
      `${fieldPath}.metadata`,
    ),
  };
}

function validateEyeImagePayload(
  payload: unknown,
  fieldPath: string,
  maxImagePayloadBytes: number,
): JetsonEyeImagePayload {
  const record = expectRecord(payload, fieldPath, "invalid_payload");

  const dataUrl = validateOptionalString(record.dataUrl, `${fieldPath}.dataUrl`);
  const base64Data = validateOptionalString(
    record.base64Data,
    `${fieldPath}.base64Data`,
  );
  const mimeType = validateOptionalString(record.mimeType, `${fieldPath}.mimeType`);
  const imageUrl = validateOptionalString(record.imageUrl, `${fieldPath}.imageUrl`);

  const variantCount =
    Number(Boolean(dataUrl)) + Number(Boolean(base64Data)) + Number(Boolean(imageUrl));
  if (variantCount === 0) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must include exactly one image variant: dataUrl, base64Data + mimeType, or imageUrl.",
    );
  }

  if (variantCount > 1) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must not include multiple image variants at the same time.",
    );
  }

  if (dataUrl && !/^data:image\/[a-zA-Z0-9.+-]+;?/i.test(dataUrl)) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      `${fieldPath}.dataUrl`,
      "must be a valid image data URL.",
    );
  }
  if (dataUrl) {
    validateStringByteSize(
      dataUrl,
      `${fieldPath}.dataUrl`,
      maxImagePayloadBytes,
    );
  }

  if (base64Data) {
    if (!mimeType) {
      throw new JetsonProtocolIssueError(
        "invalid_payload",
        `${fieldPath}.mimeType`,
        "is required when payload.base64Data is provided.",
      );
    }

    if (!/^image\/[a-zA-Z0-9.+-]+$/i.test(mimeType)) {
      throw new JetsonProtocolIssueError(
        "invalid_payload",
        `${fieldPath}.mimeType`,
        "must be a valid image mime type.",
      );
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new JetsonProtocolIssueError(
        "invalid_payload",
        `${fieldPath}.base64Data`,
        "must contain base64 characters only.",
      );
    }

    validateStringByteSize(
      base64Data,
      `${fieldPath}.base64Data`,
      maxImagePayloadBytes,
    );
  }

  if (
    imageUrl &&
    !/^(https?:\/\/|data:image\/|blob:|\/|\.{1,2}\/)/i.test(imageUrl)
  ) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      `${fieldPath}.imageUrl`,
      "must be an absolute URL, relative path, blob URL, or image data URL.",
    );
  }
  if (imageUrl) {
    validateStringByteSize(
      imageUrl,
      `${fieldPath}.imageUrl`,
      maxImagePayloadBytes,
    );
  }

  return {
    dataUrl,
    base64Data,
    mimeType,
    imageUrl,
  };
}

function validateOverlayPayload(
  payload: unknown,
  fieldPath: string,
): JetsonOverlayPayload {
  const record = expectRecord(payload, fieldPath, "invalid_payload");

  return {
    label: validateOptionalString(record.label, `${fieldPath}.label`),
    annotations: validateOptionalArray(record.annotations, `${fieldPath}.annotations`)
      ?.map((annotation, index) =>
        validateOverlayAnnotationPayload(
          annotation,
          `${fieldPath}.annotations[${index}]`,
        ),
      ),
  };
}

function validateOverlayAnnotationPayload(
  payload: unknown,
  fieldPath: string,
): JetsonOverlayAnnotationPayload {
  const record = expectRecord(payload, fieldPath, "invalid_payload");

  return {
    id: validateRequiredString(record.id, `${fieldPath}.id`),
    kind: validateRequiredEnum(record.kind, `${fieldPath}.kind`, ANNOTATION_KINDS),
    normalizedX: validateNormalizedNumber(record.normalizedX, `${fieldPath}.normalizedX`),
    normalizedY: validateNormalizedNumber(record.normalizedY, `${fieldPath}.normalizedY`),
    label: validateOptionalString(record.label, `${fieldPath}.label`),
  };
}

function validateRequiredString(value: unknown, fieldPath: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must be a non-empty string.",
    );
  }

  return value;
}

function validateOptionalString(
  value: unknown,
  fieldPath: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must be a string when provided.",
    );
  }

  return value;
}

function validateOptionalBoolean(
  value: unknown,
  fieldPath: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must be a boolean when provided.",
    );
  }

  return value;
}

function validateRequiredEnum<T extends readonly string[]>(
  value: unknown,
  fieldPath: string,
  allowed: T,
): T[number] {
  if (typeof value === "string" && allowed.includes(value)) {
    return value as T[number];
  }

  throw new JetsonProtocolIssueError(
    "invalid_payload",
    fieldPath,
    `must be one of: ${allowed.join(", ")}.`,
  );
}

function validateOptionalEnum<T extends readonly string[]>(
  value: unknown,
  fieldPath: string,
  allowed: T,
): T[number] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validateRequiredEnum(value, fieldPath, allowed);
}

function validatePositiveInteger(value: unknown, fieldPath: string): number {
  const nextValue = validateNonNegativeInteger(value, fieldPath, "invalid_payload");
  if (nextValue <= 0) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must be greater than 0.",
    );
  }

  return nextValue;
}

function validateOptionalPositiveInteger(
  value: unknown,
  fieldPath: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validatePositiveInteger(value, fieldPath);
}

function validateNonNegativeInteger(
  value: unknown,
  fieldPath: string,
  kind: Exclude<JetsonProtocolIssueKind, "mapping_failure">,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new JetsonProtocolIssueError(
      kind,
      fieldPath,
      "must be a non-negative integer.",
    );
  }

  return value;
}

function validateNonNegativeNumber(
  value: unknown,
  fieldPath: string,
  kind: Exclude<JetsonProtocolIssueKind, "mapping_failure">,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new JetsonProtocolIssueError(
      kind,
      fieldPath,
      "must be a non-negative number.",
    );
  }

  return value;
}

function validateOptionalNonNegativeInteger(
  value: unknown,
  fieldPath: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validateNonNegativeInteger(value, fieldPath, "invalid_payload");
}

function validateOptionalNonNegativeNumber(
  value: unknown,
  fieldPath: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validateNonNegativeNumber(value, fieldPath, "invalid_payload");
}

function validateOptionalFiniteNumber(
  value: unknown,
  fieldPath: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must be a finite number.",
    );
  }

  return value;
}

function validateFiniteNumber(
  value: unknown,
  fieldPath: string,
  kind: Exclude<JetsonProtocolIssueKind, "mapping_failure">,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new JetsonProtocolIssueError(kind, fieldPath, "must be a finite number.");
  }

  return value;
}

function validateOptionalPositiveNumber(
  value: unknown,
  fieldPath: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must be a positive number.",
    );
  }

  return value;
}

function validateNormalizedNumber(value: unknown, fieldPath: string): number {
  const nextValue = validateNonNegativeNumber(
    value,
    fieldPath,
    "invalid_payload",
  );
  if (nextValue > 1) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must be between 0 and 1.",
    );
  }

  return nextValue;
}

function validateOptionalNormalizedNumber(
  value: unknown,
  fieldPath: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return validateNormalizedNumber(value, fieldPath);
}

function validateOptionalArray(
  value: unknown,
  fieldPath: string,
): readonly unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "must be an array when provided.",
    );
  }

  return value;
}

function validateRequiredArray(value: unknown, fieldPath: string): readonly unknown[] {
  const nextValue = validateOptionalArray(value, fieldPath);
  if (!nextValue) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      "is required and must be an array.",
    );
  }

  return nextValue;
}

function validateOptionalStringArray(
  value: unknown,
  fieldPath: string,
): readonly string[] | undefined {
  const nextValue = validateOptionalArray(value, fieldPath);
  return nextValue?.map((entry, index) =>
    validateRequiredString(entry, `${fieldPath}[${index}]`),
  );
}

function validateOptionalStringOrNumber(
  value: unknown,
  fieldPath: string,
): string | number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  throw new JetsonProtocolIssueError(
    "invalid_payload",
    fieldPath,
    "must be a string or number.",
  );
}

function validateOptionalPrimitiveRecord(
  value: unknown,
  fieldPath: string,
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = expectRecord(value, fieldPath, "invalid_payload");
  for (const [key, entry] of Object.entries(record)) {
    if (
      entry !== null &&
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      throw new JetsonProtocolIssueError(
        "invalid_payload",
        `${fieldPath}.${key}`,
        "must be a primitive value (string, number, boolean, or null).",
      );
    }
  }

  return record as Readonly<Record<string, string | number | boolean | null>>;
}

function validateOptionalOptionRecord(
  value: unknown,
  fieldPath: string,
): Readonly<Record<string, string | number | boolean>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = expectRecord(value, fieldPath, "invalid_payload");
  for (const [key, entry] of Object.entries(record)) {
    if (
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      throw new JetsonProtocolIssueError(
        "invalid_payload",
        `${fieldPath}.${key}`,
        "must be a string, number, or boolean.",
      );
    }
  }

  return record as Readonly<Record<string, string | number | boolean>>;
}

function validatePayloadByteSize(
  value: unknown,
  fieldPath: string,
  maxBytes: number,
): void {
  if (maxBytes <= 0) {
    return;
  }

  const byteSize = measureJsonByteSize(value);
  if (byteSize > maxBytes) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      `serialized payload size ${byteSize} bytes exceeds limit ${maxBytes} bytes.`,
    );
  }
}

function validateStringByteSize(
  value: string,
  fieldPath: string,
  maxBytes: number,
): void {
  if (maxBytes <= 0) {
    return;
  }

  const byteSize = measureUtf8ByteSize(value);
  if (byteSize > maxBytes) {
    throw new JetsonProtocolIssueError(
      "invalid_payload",
      fieldPath,
      `image payload size ${byteSize} bytes exceeds limit ${maxBytes} bytes.`,
    );
  }
}

function measureJsonByteSize(value: unknown): number {
  try {
    return measureUtf8ByteSize(JSON.stringify(value));
  } catch {
    throw new JetsonProtocolIssueError(
      "malformed_envelope",
      "envelope",
      "must be JSON-serializable for validation.",
    );
  }
}

function measureUtf8ByteSize(value: string): number {
  return new TextEncoder().encode(value).length;
}

const TRANSPORT_STATES = [
  "idle",
  "starting",
  "connecting",
  "running",
  "reconnecting",
  "stopped",
  "error",
] as const;

const SOURCE_STATES = [
  "idle",
  "starting",
  "running",
  "reconnecting",
  "stopped",
  "error",
] as const;

const CAPTURE_HEALTH_STATES = [
  "idle",
  "healthy",
  "retrying",
  "recovered",
  "terminal_failure",
] as const;

const THERMAL_HEALTH_STATES = [
  "unavailable",
  "idle",
  "healthy",
  "degraded",
  "error",
] as const;

const HEARING_HEALTH_STATES = [
  "unavailable",
  "idle",
  "healthy",
  "degraded",
  "error",
] as const;

const RECENT_CAPTURE_EVENT_TYPES = [
  "retrying",
  "recovered",
  "terminal_failure",
] as const;

const ERROR_STAGES = ["transport", "parse", "mapping", "source"] as const;

const EYES = ["left", "right"] as const;

const EYE_FORMATS = ["placeholder", "image", "rgba8", "yuv", "unknown"] as const;

const IMAGE_PAYLOAD_MODES = [
  "data_url",
  "base64",
  "image_url",
  "binary_frame",
] as const;

const ANNOTATION_KINDS = ["crosshair", "text"] as const;
