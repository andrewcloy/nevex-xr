# Jetson Protocol Reference

This document defines the current browser-facing Jetson message contract used by
the Samsung XR app. It is intentionally small, versioned, and mostly
JSON-friendly so the current WebSocket path stays simple while the protocol
hardens.

## Envelope

Every control/status message, and the compatibility form of `stereo_frame`, uses
this top-level JSON envelope:

```json
{
  "version": 1,
  "messageType": "stereo_frame",
  "timestampMs": 1762555000123,
  "sequence": 42,
  "payload": {}
}
```

Required fields:

- `version`: protocol version. Current value is `1`.
- `messageType`: one of `capabilities`, `transport_status`, `source_status`, `stereo_frame`, `error`, `remote_config`.
- `timestampMs`: non-negative numeric millisecond timestamp.
- `payload`: message-specific object payload.

Optional fields:

- `sequence`: non-negative integer sender sequence number.

Notes:

- Senders should emit `timestampMs`. The client still accepts legacy `timestamp`
  on ingest, but it is not the preferred field.
- Unknown `version` values and unsupported `messageType` values are rejected.
- The receiver tracks repeated, out-of-order, and missing-sequence estimates from
  the optional `sequence` field.

## Binary `stereo_frame` Transport

When the sender runs with image mode `binary_frame`, `stereo_frame` may arrive as
one binary WebSocket message instead of a JSON string. The logical envelope
stays the same:

- the header still describes a `version: 1` / `messageType: "stereo_frame"`
  envelope
- the header JSON carries frame metadata, overlays, thermal data, and both eye
  objects without inline `dataUrl` or `base64Data` strings
- the left and right JPEG bytes are appended after the header in the same binary
  message
- the XR receiver reconstructs `blob:` URLs from those byte ranges and injects
  them back into the standard `imageUrl` eye-image variant before normal payload
  validation and mapping run

Current binary wire layout:

- bytes `0..3`: ASCII magic `JSBF`
- byte `4`: binary message version (`1`)
- byte `5`: binary message type (`1` for `stereo_frame`)
- bytes `6..7`: reserved
- bytes `8..11`: unsigned big-endian JSON header byte length
- bytes `12..15`: unsigned big-endian left-image byte length
- bytes `16..19`: unsigned big-endian right-image byte length
- bytes `20..`: UTF-8 JSON header, then left JPEG bytes, then right JPEG bytes

Notes:

- `binary_frame` is additive. Existing JSON `data_url` and `base64` paths still
  work unchanged.
- The sender still writes the same high-level `stereo_frame` metadata fields.
- The XR-side viewer continues to consume standard `imageUrl`/`blob:` image
  sources after decode.

## Message Types

### `capabilities`

Handshake-style sender advertisement. A future Jetson sender should send this
immediately after opening the message channel.

Required payload fields:

- `senderName`: non-empty string
- `supportedMessageVersion`: non-negative integer
- `supportedImagePayloadModes`: non-empty array of `data_url`, `base64`, `image_url`, `binary_frame`

Optional payload fields:

- `senderVersion`: string
- `maxRecommendedPayloadBytes`: non-negative integer
- `stereoFormatNote`: string
- thermal capability fields:
  - `thermalAvailable`
  - `thermalBackendIdentity`
  - `thermalFrameWidth`
  - `thermalFrameHeight`
  - `thermalFrameRate`
  - `thermalOverlaySupported`
  - `supportedThermalOverlayModes`
  - `thermalHealthState`: `unavailable`, `idle`, `healthy`, `degraded`, `error`
  - `thermalErrorText`
- IR capability fields:
  - `irAvailable`
  - `irBackendIdentity`
  - `irEnabled`
  - `irLevel`
  - `irMaxLevel`
  - `irControlSupported`
  - `irFaultState`
  - `irErrorText`

Default behavior when these fields are omitted:

- `thermalAvailable = false`
- `thermalOverlaySupported = false`
- `supportedThermalOverlayModes = ["thermal_fusion_envg"]`
- `thermalHealthState = "unavailable"`
- `irAvailable = false`
- `irEnabled = false`
- `irLevel = 0`
- `irMaxLevel = 0`
- `irControlSupported = false`

Example:

```json
{
  "version": 1,
  "messageType": "capabilities",
  "timestampMs": 1762554999123,
  "sequence": 1,
  "payload": {
    "senderName": "jetson_sender",
    "senderVersion": "0.1.0",
    "supportedMessageVersion": 1,
    "supportedImagePayloadModes": ["data_url", "base64", "image_url", "binary_frame"],
    "maxRecommendedPayloadBytes": 262144,
    "stereoFormatNote": "Send side-by-side proof-of-life frames first.",
    "thermalAvailable": true,
    "thermalBackendIdentity": "simulated_thermal_backend",
    "thermalFrameWidth": 32,
    "thermalFrameHeight": 24,
    "thermalFrameRate": 9,
    "thermalOverlaySupported": true,
    "supportedThermalOverlayModes": [
      "thermal_fusion_envg",
      "hotspot_highlight",
      "hot_edges",
      "full_thermal",
      "hot_target_boxes_optional"
    ],
    "thermalHealthState": "healthy",
    "irAvailable": true,
    "irBackendIdentity": "simulated_ir_illuminator_controller",
    "irEnabled": true,
    "irLevel": 3,
    "irMaxLevel": 5,
    "irControlSupported": true
  }
}
```

### `transport_status`

Reports transport-level health.

Payload fields:

- Optional `transportState`: `idle`, `starting`, `connecting`, `running`, `reconnecting`, `stopped`, `error`
- Optional `connected`: boolean
- Optional `statusText`: string
- Optional `lastError`: string
- Optional `parseErrorText`: string

Example:

```json
{
  "version": 1,
  "messageType": "transport_status",
  "timestampMs": 1762555000123,
  "sequence": 1,
  "payload": {
    "transportState": "running",
    "connected": true,
    "statusText": "Jetson sender connected."
  }
}
```

### `source_status`

Reports frame-source state independently from transport state.

Payload fields:

- Optional `sourceState`: `idle`, `starting`, `running`, `reconnecting`, `stopped`, `error`
- Optional `lastFrameId`: non-negative integer
- Optional `lastTimestampMs`: non-negative numeric millisecond timestamp
- Optional `lastError`: string
- Optional `statusText`: human-readable source status summary
- Optional `telemetryUpdatedAtMs`: sender-side camera telemetry snapshot timestamp
- Optional `cameraTelemetry`: camera-health snapshot object. Current fields include:
  - `captureBackendName`
  - `startupValidated`
  - `capturesAttempted`, `capturesSucceeded`, `capturesFailed`
  - `consecutiveFailureCount`
  - `lastSuccessfulCaptureTime`
  - `lastCaptureDurationMs`, `averageCaptureDurationMs`, `effectiveFrameIntervalMs`
  - `leftCameraDevice`, `rightCameraDevice`, `gstLaunchPath`
  - `captureHealthState`: `idle`, `healthy`, `retrying`, `recovered`, `terminal_failure`
  - `captureRetryCount`, `captureRetryDelayMs`
  - `recentRetryAttempts`, `currentRetryAttempt`
  - `transientFailureCount`, `recoveryCount`
  - `lastRecoveryTime`, `lastTerminalFailureTime`
  - replay-oriented fields when `captureBackendName` is `replay`:
    `replaySourceIdentity`, `replayLoopEnabled`, `replayCurrentIndex`,
    `replayFrameCount`, optional `replayLeftSource`, optional
    `replayRightSource`, optional `replayTimingMode`, optional
    `replayTimeScale`,
    optional `replayManifestLoaded`, optional `replayManifestValidated`,
    optional `replayManifestErrorCount`, optional
    `replayManifestWarningCount`, optional `replayManifestSource`, optional
    `replayValidationSummary`, optional `replayRecordedTimestamp`, optional
    `replayDelayUntilNextMs`, optional `replayScaledDelayUntilNextMs`, optional
    `replayTimingOffsetMs`, optional `replayNominalLoopDurationMs`, optional
    `replayScaledLoopDurationMs`
  - `recentCaptureEvents`: array of compact retry/error history entries with
    `timestampMs`, `eventType`, optional `retryAttempt`, optional `eye`, and
    `summary`
- Optional `thermalTelemetry`: thermal-status snapshot object with:
  - `thermalAvailable`
  - `thermalBackendIdentity`
  - `thermalFrameWidth`, `thermalFrameHeight`, `thermalFrameRate`
  - `thermalOverlaySupported`
  - `supportedThermalOverlayModes`
  - `thermalHealthState`
  - `thermalErrorText`
  - `currentOverlayMode`
  - optional `lastThermalFrameId`
  - optional `lastThermalTimestamp`
  - optional `hotspotCount`
  - optional `paletteHint`
- Optional `irIlluminatorStatus`: IR illuminator status object with:
  - `irAvailable`
  - `irBackendIdentity`
  - `irEnabled`
  - `irLevel`
  - `irMaxLevel`
  - `irControlSupported`
  - `irFaultState`
  - `irErrorText`

Replay timing notes:

- `replayTimeScale: 1.0` means recorded timing is used as-is
- values greater than `1.0` speed playback up by dividing recorded delays
- values less than `1.0` slow playback down by multiplying recorded delays
- `replayDelayUntilNextMs` is the nominal manifest-derived delay
- `replayScaledDelayUntilNextMs` is the actual sender-side delay after applying
  the time scale

Example:

```json
{
  "version": 1,
  "messageType": "source_status",
  "timestampMs": 1762555001123,
  "sequence": 2,
  "payload": {
    "sourceState": "reconnecting",
    "lastFrameId": 1204,
    "lastTimestampMs": 1762555001100,
    "statusText": "Retrying capture 1/2 after a transient timeout.",
    "telemetryUpdatedAtMs": 1762555001120,
    "cameraTelemetry": {
      "captureBackendName": "gstreamer",
      "captureHealthState": "retrying",
      "captureRetryCount": 2,
      "captureRetryDelayMs": 750,
      "recentRetryAttempts": 1,
      "currentRetryAttempt": 1,
      "transientFailureCount": 1,
      "replayTimeScale": 0.5,
      "replayScaledDelayUntilNextMs": 360,
      "replayScaledLoopDurationMs": 540,
      "recentCaptureEvents": [
        {
          "timestampMs": 1762555001120,
          "eventType": "retrying",
          "retryAttempt": 1,
          "eye": "left",
          "summary": "Injected timeout fault for left eye on capture 3 retry 1."
        }
      ]
    },
    "thermalTelemetry": {
      "thermalAvailable": true,
      "thermalBackendIdentity": "simulated_thermal_backend",
      "thermalFrameWidth": 32,
      "thermalFrameHeight": 24,
      "thermalFrameRate": 9,
      "thermalOverlaySupported": true,
      "supportedThermalOverlayModes": [
        "thermal_fusion_envg",
        "hotspot_highlight",
        "hot_edges",
        "full_thermal",
        "hot_target_boxes_optional"
      ],
      "thermalHealthState": "healthy",
      "currentOverlayMode": "thermal_fusion_envg",
      "lastThermalFrameId": 77,
      "lastThermalTimestamp": 1762555001118,
      "hotspotCount": 3,
      "paletteHint": "envg_heat"
    },
    "irIlluminatorStatus": {
      "irAvailable": true,
      "irBackendIdentity": "simulated_ir_illuminator_controller",
      "irEnabled": true,
      "irLevel": 3,
      "irMaxLevel": 5,
      "irControlSupported": true
    }
  }
}
```

### `stereo_frame`

Carries one stereo frame with a `left` and `right` eye payload.

Required payload fields:

- `frameId`: non-negative integer
- `left`: eye payload object with `eye: "left"`
- `right`: eye payload object with `eye: "right"`

Optional payload fields:

- `timestampMs`: non-negative numeric millisecond timestamp
- `sourceId`: string
- `sceneId`: string
- `streamName`: string
- `tags`: string array
- `extras`: flat record of primitive values (`string`, `number`, `boolean`, `null`)
- `overlay`: overlay payload
- `thermalOverlayMode`: `off`, `thermal_fusion_envg`, `hotspot_highlight`, `hot_edges`, `full_thermal`, `hot_target_boxes_optional`
- `thermalFrame`: thermal frame payload

Eye payload fields:

- Required `eye`: `left` or `right`
- Required `width`: positive integer
- Required `height`: positive integer
- Optional `format`: `placeholder`, `image`, `rgba8`, `yuv`, `unknown`
- Optional `contentLabel`: string
- Optional `title`: string
- Optional `markerText`: string
- Optional `backgroundHex`: string
- Optional `accentHex`: string
- Optional `metadata`: flat record of primitive values
- Optional `image`: image payload

Eye image payload variants:

- Exactly one of these variants may be present:
- `dataUrl`: image data URL such as `data:image/svg+xml,...`
- `base64Data` plus `mimeType`: raw base64 image bytes with an image MIME type
- `imageUrl`: image URL, blob URL, or relative/absolute path

Binary-mode note:

- when `supportedImagePayloadModes` includes `binary_frame`, a sender may omit
  inline eye-image strings on the wire and instead deliver left/right JPEG bytes
  in the binary WebSocket message format described above
- after the receiver reconstructs those bytes, the frame re-enters the normal
  `imageUrl` eye-image path using `blob:` URLs

Overlay payload:

- Optional `label`: string
- Optional `annotations`: array of annotation objects

Overlay annotation fields:

- Required `id`: string
- Required `kind`: `crosshair` or `text`
- Required `normalizedX`: number between `0` and `1`
- Required `normalizedY`: number between `0` and `1`
- Optional `label`: string

Thermal frame fields:

- Required `frameId`: non-negative integer
- Required `timestamp`: non-negative numeric millisecond timestamp
- Required `width`: positive integer
- Required `height`: positive integer
- Required `thermalValues`: array of finite numbers with exactly `width * height` entries
- Required `minTemperature`: finite number
- Required `maxTemperature`: finite number greater than or equal to `minTemperature`
- Optional `hotspotAnnotations`: array of hotspot objects
- Optional `paletteHint`: string

Thermal hotspot annotation fields:

- Required `id`: string
- Required `normalizedX`: number between `0` and `1`
- Required `normalizedY`: number between `0` and `1`
- Optional `label`: string
- Optional `normalizedRadius`
- Optional `normalizedBoxWidth`
- Optional `normalizedBoxHeight`
- Optional `temperatureC`
- Optional `intensityNormalized`

Example:

```json
{
  "version": 1,
  "messageType": "stereo_frame",
  "timestampMs": 1762555002123,
  "sequence": 3,
  "payload": {
    "frameId": 1205,
    "timestampMs": 1762555002100,
    "sourceId": "jetson-camera-a",
    "sceneId": "night-drive-demo",
    "streamName": "jetson_main",
    "tags": ["jetson", "image-backed"],
    "extras": {
      "gain": 0.92,
      "sensorMode": "wide"
    },
    "overlay": {
      "label": "Target Overlay",
      "annotations": [
        {
          "id": "center",
          "kind": "crosshair",
          "normalizedX": 0.5,
          "normalizedY": 0.5
        }
      ]
    },
    "thermalOverlayMode": "thermal_fusion_envg",
    "thermalFrame": {
      "frameId": 804,
      "timestamp": 1762555002098,
      "width": 2,
      "height": 2,
      "thermalValues": [22.5, 24.1, 31.7, 35.2],
      "minTemperature": 22.5,
      "maxTemperature": 35.2,
      "hotspotAnnotations": [
        {
          "id": "hotspot-1",
          "normalizedX": 0.5,
          "normalizedY": 0.5,
          "normalizedRadius": 0.2,
          "intensityNormalized": 0.94
        }
      ],
      "paletteHint": "envg_heat"
    },
    "left": {
      "eye": "left",
      "width": 1920,
      "height": 1080,
      "format": "image",
      "title": "Left Eye",
      "markerText": "F1205",
      "image": {
        "dataUrl": "data:image/svg+xml;charset=utf-8,%3Csvg..."
      }
    },
    "right": {
      "eye": "right",
      "width": 1920,
      "height": 1080,
      "format": "image",
      "title": "Right Eye",
      "markerText": "F1205",
      "image": {
        "imageUrl": "/assets/right-eye.png"
      }
    }
  }
}
```

### `error`

Reports protocol, transport, source, or mapping errors.

Required payload fields:

- `message`: human-readable error text

Optional payload fields:

- `code`: short machine-readable code such as `invalid_payload`
- `stage`: `transport`, `parse`, `mapping`, `source`
- `recoverable`: boolean
- `details`: flat record of primitive values

Example:

```json
{
  "version": 1,
  "messageType": "error",
  "timestampMs": 1762555003123,
  "sequence": 4,
  "payload": {
    "code": "invalid_payload",
    "stage": "parse",
    "recoverable": true,
    "message": "payload.left.image.mimeType: is required when payload.base64Data is provided."
  }
}
```

### `remote_config`

Allows the sender to suggest transport configuration values.

Payload fields:

- Optional `host`: string
- Optional `port`: non-negative integer
- Optional `path`: string
- Optional `protocolType`: string
- Optional `reconnectEnabled`: boolean
- Optional `reconnectIntervalMs`: non-negative integer
- Optional `streamName`: string
- Optional `maxMessageBytes`: non-negative integer
- Optional `maxImagePayloadBytes`: non-negative integer
- Optional `options`: flat record of string/number/boolean values

Example:

```json
{
  "version": 1,
  "messageType": "remote_config",
  "timestampMs": 1762555004123,
  "sequence": 5,
  "payload": {
    "host": "127.0.0.1",
    "port": 8090,
    "path": "/jetson/messages",
    "protocolType": "websocket_json",
    "reconnectEnabled": true,
    "reconnectIntervalMs": 1200,
    "streamName": "jetson_mock_stream",
    "maxMessageBytes": 524288,
    "maxImagePayloadBytes": 262144,
    "options": {
      "compression": false
    }
  }
}
```

## Validation Behavior

The XR app now distinguishes four protocol issue classes:

- `malformed_envelope`: invalid top-level structure, version, timestamp, or missing payload
- `unsupported_message_type`: valid envelope shape but unsupported `messageType`
- `invalid_payload`: message-specific payload fields failed validation
- `mapping_failure`: payload parsed, but conversion into internal runtime models failed

The UI and diagnostics surface parse/validation issues separately from mapping
errors so sender-side debugging is more direct.

## Browser To Sender Control Messages

Outbound operator control currently uses the existing live WebSocket path, but it
does **not** reuse the Jetson envelope above. The browser sends a small command
object directly over the same socket so the sender/runtime can apply live
operator changes without restarting.

Current supported outbound command:

- `settings_patch`

Current supported fields inside `payload.changes`:

- `thermalOverlayMode`
- `irEnabled`
- `irLevel`

Unknown settings fields may still be present because the browser sends a partial
settings patch, but the current sender runtime only applies the fields above.

Example:

```json
{
  "type": "settings_patch",
  "timestampMs": 1762555005123,
  "payload": {
    "changes": {
      "thermalOverlayMode": "hot_edges",
      "irEnabled": true,
      "irLevel": 4
    }
  }
}
```

Behavior notes:

- the browser can update local rendering immediately for responsiveness
- the sender/runtime applies supported changes live when the WebSocket control
  path is connected
- applied state is reported back through normal `source_status` telemetry and
  refreshed capability snapshots
- if no live sender control channel is connected, the browser keeps running and
  retains the selected values locally

Size guardrails currently enforced by the receiver:

- whole-message payload size limit via transport config `maxMessageBytes`
- image-field size limit via transport config `maxImagePayloadBytes`

If a limit is exceeded, the message is rejected with a field-specific
`invalid_payload` error.

## Sequence Expectations

- Use monotonically increasing non-negative `sequence` values per sender
  session when practical.
- Reusing the same `sequence` is treated as a repeated message.
- Lower-than-last values are treated as out-of-order arrivals.
- Gaps larger than `1` contribute to a dropped-message estimate.
- Sequence anomalies are surfaced in diagnostics but do not currently stop the
  transport.

## Sender Helper

For the local mock server and future Jetson sender work, use
`jetson_sender_helpers.mjs` as the canonical message-builder entry point. It
exports:

- `createJetsonCapabilitiesPayload(...)`
- `buildCapabilitiesEnvelope(...)`
- `buildTransportStatusEnvelope(...)`
- `buildSourceStatusEnvelope(...)`
- `buildStereoFrameEnvelope(...)`
- `buildErrorEnvelope(...)`
- `buildRemoteConfigEnvelope(...)`

For a typed sender-side integration target inside the app scaffold, see
`src/stereo_viewer/jetson_sender_contract.ts`.
