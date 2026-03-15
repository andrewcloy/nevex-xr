# Jetson Camera Validation Runbook

This runbook is the practical bring-up guide for validating the sender on a
real Linux/Jetson host with two cameras.

The canonical sender entry is now `npm run sender:runtime -- ...` or
`node ./scripts/jetson_sender_runtime.mjs ...`. Older `sender:prototype`
examples remain valid as compatibility aliases, but new validation flows should
prefer the runtime entry name.

Before Jetson hardware is ready, you can rehearse the same camera provider path
locally with `--capture-backend simulated` or `--capture-backend replay`. Both
paths are cross-platform and do not require Linux, `/dev/video*`, or
`gst-launch-1.0`, but they still exercise camera-mode telemetry, retry
behavior, heartbeat behavior, and browser diagnostics.

## Goal

Confirm that:

- the host can run the GStreamer snapshot backend
- both camera devices are visible and readable
- one-shot JPEG captures work for each eye
- the sender can emit real `stereo_frame` messages without obviously exceeding
  payload guidance

## Prerequisites

- Linux or Jetson host
- `gst-launch-1.0` on `PATH`
- `gst-inspect-1.0` on `PATH`
- GStreamer elements available:
  - `v4l2src`
  - `jpegenc`
  - `fdsink` or `filesink`
- two readable camera device nodes such as `/dev/video0` and `/dev/video1`
- permission to access those device nodes from the sender process

## Local Rehearsal Before Jetson

Use the simulated backend when you want the full camera-mode sender path on a
development laptop before the real hardware is available and you do not yet
need realistic scene content.

Example:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend simulated \
  --capture-width 1280 \
  --capture-height 720 \
  --capture-retry-count 2 \
  --capture-retry-delay-ms 500 \
  --health-log \
  --health-log-interval-ms 3000
```

This rehearses:

- camera provider startup and repeated capture loop
- camera-mode `source_status` telemetry
- retry and recovery behavior
- heartbeat drop and stale telemetry behavior
- browser diagnostics and the visible source-health badge

What is different from the real GStreamer backend:

- no Linux requirement
- no `/dev/video*` access
- no `gst-launch-1.0`
- virtual simulated device labels instead of real camera nodes
- generated image-backed snapshots instead of camera JPEGs

Use the replay backend when you already have recorded left/right snapshot pairs
and want more realistic scene content through the same camera-mode path.

Fixed timing replay example:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend replay \
  --left-replay-dir ./scripts/assets/sequence/left \
  --right-replay-dir ./scripts/assets/sequence/right \
  --replay-loop true \
  --replay-fps-mode fixed \
  --capture-retry-count 2 \
  --capture-retry-delay-ms 500 \
  --health-log \
  --health-log-interval-ms 3000
```

Recorded timing replay example using the bundled manifest:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --replay-time-scale 1.0 \
  --replay-loop true \
  --capture-retry-count 2 \
  --capture-retry-delay-ms 500 \
  --health-log \
  --health-log-interval-ms 3000
```

Recorded timing replay slowed to `0.5x`:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --replay-time-scale 0.5 \
  --replay-loop true
```

Recorded timing replay sped up to `2.0x`:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --replay-time-scale 2.0 \
  --replay-loop true
```

Replay backend differences:

- compared with `simulated`:
  - uses real left/right files instead of generated scene content
  - keeps the same retry, heartbeat, health, and browser diagnostics flow
  - can rehearse realistic timing variation when a manifest is available
- compared with `gstreamer`:
  - avoids Linux and live camera/device bring-up
  - does not validate real camera transport, timing, or `/dev/video*`
  - still exercises camera provider telemetry with realistic recorded imagery

Replay timing guidance:

- `--replay-fps-mode fixed`:
  use when you want scene-content realism but still want a simple cadence driven
  by the sender `--fps` setting
- `--replay-fps-mode recorded`:
  use when you have recorded timing metadata and want to rehearse irregular
  frame spacing, pauses, and drift-like offsets in the browser diagnostics
- `--replay-time-scale <value>`:
  applies only to recorded timing. `1.0` uses the manifest timing as-is, values
  greater than `1.0` speed playback up by dividing delays, and values less than
  `1.0` slow playback down by multiplying delays.
- `--replay-manifest <path>`:
  optional JSON file that overrides naive file-order pairing and can provide
  `timestampMs`, `delayUntilNextMs`, `frameId`, `label`, and `notes` per pair

Replay validation rules:

- missing manifest file:
  - `fixed` mode warns and falls back to directory/file-list pairing
  - `recorded` mode fails preflight/startup
- malformed manifest JSON:
  fails preflight/startup
- manifest entry with a missing referenced asset:
  fails preflight/startup
- recorded mode with an entry missing `timestampMs`:
  fails preflight/startup
- fixed mode with a valid manifest:
  still validates the manifest and uses its pairing order, but cadence stays
  tied to the sender timing instead of the recorded timestamps

## Identify Camera Devices

Useful commands on Linux/Jetson:

```bash
ls -l /dev/video*
```

```bash
v4l2-ctl --list-devices
```

If the camera mapping is ambiguous, prefer direct device-path flags over camera
IDs during bring-up:

- `--left-camera-device /dev/video0`
- `--right-camera-device /dev/video1`

## Manual One-Shot GStreamer Tests

Validate each eye independently before running the sender.

Left eye:

```bash
gst-launch-1.0 -q \
  v4l2src device=/dev/video0 num-buffers=1 \
  ! video/x-raw,width=1280,height=720 \
  ! jpegenc quality=70 \
  ! filesink location=/dev/stdout > /tmp/left_eye_test.jpg
```

Right eye:

```bash
gst-launch-1.0 -q \
  v4l2src device=/dev/video1 num-buffers=1 \
  ! video/x-raw,width=1280,height=720 \
  ! jpegenc quality=70 \
  ! filesink location=/dev/stdout > /tmp/right_eye_test.jpg
```

If those commands fail, fix the camera/GStreamer/device issue before testing the
sender.

## Recommended Hardware-Safe Bring-Up Profile

Use this profile first:

- `cameraProfile`: `hardware_safe`
- resolution: `1280x720`
- fps: `0.5`
- JPEG quality: `70`
- timeout: `5000 ms`
- warm-up frames: `2`
- retry count: `2`
- retry delay: `750 ms`

This is intentionally conservative for first hardware validation.

## Sender Preflight Command

Run this before starting the live sender:

```bash
npm run sender:preflight -- \
  --provider camera \
  --capture-backend gstreamer \
  --camera-profile hardware_safe \
  --left-camera-device /dev/video0 \
  --right-camera-device /dev/video1
```

What preflight checks:

- Linux host requirement
- `gst-launch-1.0` resolution and version probe
- `gst-inspect-1.0` resolution
- required elements (`v4l2src`, `jpegenc`, `fdsink` or `filesink`)
- configured left/right device accessibility
- one-shot JPEG capture success for each eye
- sample JPEG byte sizes
- rough `stereo_frame` envelope size versus the recommended payload budget

Replay-mode preflight:

```bash
npm run sender:preflight -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --replay-time-scale 0.5 \
  --replay-loop true
```

Replay preflight checks:

- manifest file existence
- JSON parse validity
- top-level manifest structure
- entry-by-entry `leftFile` / `rightFile` validity
- referenced replay asset existence and supported file type
- `timestampMs` completeness and ordering when recorded timing is enabled
- `delayUntilNextMs` and `frameId` field validity
- whether looped recorded timing is missing an explicit final wrap-around delay
- computed nominal and scaled replay delays for one loop
- min / max / average cadence summary plus first-entry preview lines
- suspicious zero-delay boundaries or large timing gaps before runtime starts

Replay preflight is also the replay dry-run inspection mode. It does not start
the sender runtime or transport; it only validates inputs and prints the
expected replay cadence.

Replay preflight with preview count override:

```bash
npm run sender:preflight -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --replay-preview-count 1 \
  --replay-loop true
```

Replay preflight in JSON mode for tooling or CI:

```bash
npm run sender:preflight -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --replay-time-scale 0.5 \
  --replay-preview-count 2 \
  --preflight-output json \
  --replay-loop true
```

JSON mode emits one stable JSON document to stdout instead of the normal text
summary. This is useful for CI checks, scripted replay validation, or storing a
dry-run timing report before a test session.

The JSON report includes:

- `reportVersion`: stable tooling-facing contract version for preflight artifacts
- `generatedAt`: ISO-8601 UTC timestamp showing when the artifact was created

Replay preflight in JSON mode with the report also written to disk:

```bash
npm run sender:preflight -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --replay-time-scale 0.5 \
  --replay-preview-count 2 \
  --preflight-output json \
  --preflight-output-file ./artifacts/preflight/replay_preflight.json \
  --replay-loop true
```

Replay preflight in text mode with the report written to disk:

```bash
npm run sender:preflight -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --preflight-output text \
  --preflight-output-file ./artifacts/preflight/replay_preflight.txt \
  --replay-loop true
```

`--preflight-output-file` writes the same final text or JSON report that was
printed to the console and creates parent directories when needed. This keeps
the existing console flow intact while making it easy for CI or bring-up
automation to archive replay dry-run artifacts.

Replay preflight in JSON mode, written to disk quietly for CI:

```bash
npm run sender:preflight -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --replay-time-scale 0.5 \
  --replay-preview-count 2 \
  --preflight-output json \
  --preflight-output-file ./artifacts/preflight/replay_preflight.json \
  --preflight-output-quiet \
  --replay-loop true
```

Replay preflight in text mode, written to disk quietly:

```bash
npm run sender:preflight -- \
  --provider camera \
  --capture-backend replay \
  --replay-manifest ./scripts/assets/sequence/replay_manifest.json \
  --replay-fps-mode recorded \
  --preflight-output text \
  --preflight-output-file ./artifacts/preflight/replay_preflight.txt \
  --preflight-output-quiet \
  --replay-loop true
```

`--preflight-output-quiet` suppresses normal successful console output, which is
useful when a CI job or bring-up script is primarily interested in the written
artifact file. Failures still print clearly so unwritable output paths or broken
inputs do not disappear silently.

Quick CI/tooling checks for a written JSON artifact:

```bash
jq '{reportVersion, ok, generatedAt}' ./artifacts/preflight/replay_preflight.json
```

```powershell
$report = Get-Content ".\artifacts\preflight\replay_preflight.json" | ConvertFrom-Json
$report | Select-Object reportVersion, ok, generatedAt
```

Common replay manifest failures:

- typo in one `leftFile` or `rightFile` path
- manifest saved with invalid JSON syntax
- `timestampMs` omitted while using `--replay-fps-mode recorded`
- unsupported file type extension in one referenced asset
- last manifest entry missing `delayUntilNextMs` when you expected a precise
  loop wrap timing

## First Live Camera Sender Command

After preflight passes:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend gstreamer \
  --camera-profile hardware_safe \
  --left-camera-device /dev/video0 \
  --right-camera-device /dev/video1 \
  --capture-retry-count 2 \
  --capture-retry-delay-ms 750 \
  --health-log \
  --health-log-interval-ms 5000
```

If needed, override individual settings explicitly:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend gstreamer \
  --camera-profile hardware_safe \
  --left-camera-device /dev/video0 \
  --right-camera-device /dev/video1 \
  --capture-width 1920 \
  --capture-height 1080 \
  --capture-timeout-ms 7000 \
  --capture-jpeg-quality 75 \
  --capture-warmup-frames 3 \
  --capture-retry-count 3 \
  --capture-retry-delay-ms 1000 \
  --health-log \
  --health-log-interval-ms 3000
```

## Sender Health Logging

Enable recurring sender-side health summaries:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend gstreamer \
  --camera-profile hardware_safe \
  --left-camera-device /dev/video0 \
  --right-camera-device /dev/video1 \
  --health-log \
  --health-log-interval-ms 5000
```

Current behavior:

- prints a compact one-line recurring status summary
- intended for long Jetson runs where the sender terminal is the primary view
- includes backend state, validation state, attempt/success/fail counters,
  consecutive failures, retry budget, retry delay, last/average capture duration,
  effective interval, and active device paths
- also emits one-off retry/recovery/terminal-failure event lines so short retry
  bursts are still visible even if the recurring interval is longer

## Fault-Injection Rehearsal Before Hardware Instability

Before depending on flaky cameras or cable issues, rehearse the browser and
sender diagnostics using the camera fault-injection flags:

- `--fault-inject-every-n-captures`
- `--fault-inject-failure-count`
- `--fault-inject-mode transient|terminal|timeout`
- `--fault-inject-start-after-captures`
- `--fault-inject-heartbeat-drop`
- `--fault-inject-heartbeat-drop-after-ms`

Recommended rehearsals:

Transient timeout with recovery:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend simulated \
  --capture-retry-count 2 \
  --capture-retry-delay-ms 500 \
  --fault-inject-every-n-captures 3 \
  --fault-inject-failure-count 1 \
  --fault-inject-mode timeout \
  --fault-inject-start-after-captures 1 \
  --health-log \
  --health-log-interval-ms 3000
```

Terminal capture failure after retries are exhausted:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend simulated \
  --capture-retry-count 2 \
  --capture-retry-delay-ms 500 \
  --fault-inject-every-n-captures 1 \
  --fault-inject-mode terminal \
  --health-log \
  --health-log-interval-ms 3000
```

Heartbeat loss leading to stale browser telemetry:

```bash
npm run sender:prototype -- \
  --provider camera \
  --capture-backend simulated \
  --fault-inject-heartbeat-drop \
  --fault-inject-heartbeat-drop-after-ms 5000 \
  --health-log \
  --health-log-interval-ms 3000
```

## What Success Looks Like

On the sender side:

- preflight shows all required checks as `PASS`, with at most a payload-size
  `WARN`
- sender startup logs the resolved camera targets and current camera settings
- `source_status` reaches `running`
- stereo frames continue to flow without repeated terminal capture errors
- during transient capture stalls, `source_status` should continue advancing even
  before the next `stereo_frame` arrives

In the XR browser diagnostics:

- `Last message type` keeps advancing through `source_status` and `stereo_frame`
- `Last sequence` keeps increasing
- left/right eye imagery updates from the real cameras
- with the simulated backend, left/right eye imagery still updates and all
  camera telemetry fields remain populated through the camera-mode seam
- with the replay backend, left/right eye imagery advances through recorded
  snapshot pairs while replay source identity, loop mode, replay index, replay
  timing mode, manifest loaded state, manifest validation state/counts/source,
  validation summary, recorded timestamp, delay-until-next value, and timing
  offset stay visible in browser diagnostics
- the always-visible status area also shows the active replay pair, active
  `frameId`, replay label when present, replay source identity, manifest path,
  and replay timing mode/time scale in a compact summary
- very long replay source or manifest paths are shortened only in the visible
  status area so they stay readable; diagnostics still keep the full values
- no repeated source errors
- camera telemetry fields appear explicitly in the diagnostics UI:
  - capture backend
  - capture health (`healthy`, `retrying`, `recovered`, `terminal_failure`)
  - visible source-health badge (`Healthy`, `Retrying`, `Degraded`,
    `Terminal Failure`, `Telemetry Stale`)
  - startup validated
  - attempts / success / fail counters
  - consecutive failure count
  - retry budget / retry delay
  - recent retry attempts / current retry attempt
  - transient failure count / recovery count
  - last successful capture time
  - last recovery time
  - last terminal failure time
  - last / average capture duration
  - effective frame interval
  - telemetry updated time / freshness
  - telemetry stale threshold
  - recent capture issue history
  - replay source identity / replay loop / replay pair index when the replay
    backend is active
  - left/right device paths
  - `gst-launch` path

## Bring-Up Metrics To Watch

During validation, pay attention to:

- `capturesAttempted`
- `capturesSucceeded`
- `capturesFailed`
- `lastSuccessfulCaptureTime`
- `lastCaptureDurationMs`
- `averageCaptureDurationMs`
- `effectiveFrameIntervalMs`
- `consecutiveFailureCount`
- `captureHealthState`
- `captureRetryCount`
- `captureRetryDelayMs`
- `recentRetryAttempts`
- `currentRetryAttempt`
- `transientFailureCount`
- `recoveryCount`
- `lastRecoveryTime`
- `lastTerminalFailureTime`
- `telemetryUpdatedAtMs`
- `recentCaptureEvents`
- `startupValidated`
- `gstLaunchPath`
- `replayTimingMode`
- `replayTimeScale`
- `replayManifestLoaded`
- `replayManifestValidated`
- `replayManifestErrorCount`
- `replayManifestWarningCount`
- `replayManifestSource`
- `replayValidationSummary`
- `replayRecordedTimestamp`
- `replayDelayUntilNextMs`
- `replayScaledDelayUntilNextMs`
- `replayTimingOffsetMs`
- `replayNominalLoopDurationMs`
- `replayScaledLoopDurationMs`

These telemetry fields are emitted by the GStreamer backend and also attached to
camera-frame metadata for diagnostics-friendly inspection later. The simulated
and replay backends emit the same camera-oriented telemetry shape, with replay
adding replay-source identity, loop mode, current replay index, and optional
manifest-driven timing plus manifest-validation fields so local rehearsals match
the browser diagnostics structure used for Jetson bring-up.

Good telemetry patterns:

- `startupValidated: true`
- `capturesSucceeded` keeps increasing
- `capturesFailed` stays at `0`
- `consecutiveFailureCount` stays at `0`
- `lastCaptureDurationMs` and `averageCaptureDurationMs` remain fairly stable
- `effectiveFrameIntervalMs` is close to the expected send cadence
- in recorded replay mode, `replayDelayUntilNextMs` tracks the manifest cadence
  while `replayScaledDelayUntilNextMs` tracks the actual sender wait after the
  time scale is applied
- `replayNominalLoopDurationMs` and `replayScaledLoopDurationMs` match the
  operator's expectation for one full replay loop
- `replayTimeScale` remains at the configured multiplier for the session
- `replayTimingOffsetMs` stays relatively small during clean runs
- occasional `retrying` transitions resolve back to `recovered` or `healthy`
- `telemetryUpdatedAtMs` continues to advance even if `Last frame time` pauses
  briefly during a retry window
- the status panel health badge returns to `Healthy` after clean captures and
  only shows `Degraded` briefly after a recovery event

Bad telemetry patterns:

- `startupValidated: false`
- `capturesAttempted` increases but `capturesSucceeded` does not
- `capturesFailed` or `consecutiveFailureCount` climbs steadily
- `lastCaptureDurationMs` rises until timeouts start appearing
- `captureHealthState` remains `retrying` for long periods without recovery
- `recentRetryAttempts` or `currentRetryAttempt` is frequently at the budget cap
- `lastTerminalFailureTime` keeps updating
- `recentCaptureEvents` keeps filling with the same failure summary
- in recorded replay mode, `replayTimingOffsetMs` drifts farther from zero even
  when you are not intentionally injecting failures or delays
- the main health badge flips to `Telemetry Stale` even though stereo imagery is
  still updating
- browser `Last frame time` stays frozen and `source_status` stops advancing
- browser sequence advances but imagery stalls, or sender counters stall while
  browser diagnostics remain unchanged

How to interpret sender vs browser telemetry together:

- Sender terminal healthy + browser healthy:
  capture and ingest path both look good
- Sender terminal retrying + browser `source_status` still advancing:
  retry path is working; wait to see if it recovers or exhausts
- Sender terminal still producing frames + browser health badge `Telemetry Stale`:
  `source_status` heartbeats are missing; inspect sender heartbeat drop, network
  loss, or browser-side ingest
- Sender healthy + browser stale:
  investigate the WebSocket / receiver / browser-side ingest path
- Sender failing + browser stale:
  fix capture or GStreamer bring-up first
- Sender intermittent + browser intermittent:
  likely capture instability, oversized payloads, or camera device contention

## Common Failure Modes

- `gst-launch-1.0 was not found on PATH`
  - install GStreamer runtime/tools or fix `PATH`
- `gst-inspect-1.0 was not found on PATH`
  - install the inspection tools package
- `camera device ... is not accessible`
  - wrong `/dev/video*` node, permission problem, or camera not enumerated
- `camera capture failed ... (timeout)`
  - camera did not deliver a frame before the configured timeout
- `camera capture failed ... (process failure)`
  - GStreamer pipeline failed; inspect stderr text in the message
- `camera capture failed ... (invalid JPEG)`
  - pipeline returned bytes that were not a valid JPEG frame
- payload-size warning
  - reduce resolution, JPEG quality, or fps and retry

## Still Not Implemented

- continuous streaming pipelines
- camera sync logic
- stereo calibration
- GPU acceleration
- OpenCV backend
- transport/protocol redesign
