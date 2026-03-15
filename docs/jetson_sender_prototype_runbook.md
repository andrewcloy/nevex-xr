# Jetson Sender Runtime Runbook

This runbook covers the canonical Jetson sender runtime path for the Samsung XR
browser viewer. The runtime remains intentionally simple, but it now includes a
clean sender-side frame-provider seam so frame production can be swapped without
rewriting protocol logic.

The canonical CLI entry is now `node ./scripts/jetson_sender_runtime.mjs` or
`npm run sender:runtime`. The older `jetson_sender_prototype.mjs` and
`sender:prototype` commands remain available as compatibility aliases, so older
notes in this document still work if they have not been rewritten yet.

For the shortest first live Jetson-to-XR bring-up checklist, use
`docs/jetson_first_live_bringup.md`.

Available provider types:

- `still`: repeatedly serves one configured left/right image pair
- `generated`: generates dynamic left/right labeled SVG test imagery
- `sequence`: steps through left/right image sequences from folders or file lists
- `camera`: future Jetson camera path through a capture-backend seam

## What It Sends

The sender prototype emits messages in this order for each browser connection:

1. `capabilities`
2. `transport_status`
3. `source_status`
4. immediate first `stereo_frame`
5. repeated `source_status` + `stereo_frame` loop at the configured FPS, or at
   replay-manifest timing when the replay backend is in recorded mode, optionally
   scaled by `--replay-time-scale`

When enabled, the sender now also advertises optional thermal and IR subsystem
state through `capabilities`, `source_status`, and additive `stereo_frame`
thermal payloads.

The current implementation runs as a WebSocket server so it stays compatible
with the existing browser Jetson WebSocket transport flow.

## Default Local Images

The repo includes two default sample images:

- `scripts/assets/left_eye_sample.svg`
- `scripts/assets/right_eye_sample.svg`

These are real local image inputs read from disk by the sender prototype. You
can replace them with your own `png`, `jpg`, `jpeg`, `webp`, or `svg` files.

The repo also includes sample sequence folders:

- `scripts/assets/sequence/left/`
- `scripts/assets/sequence/right/`
- `scripts/assets/sequence/replay_manifest.json`

## Run The Browser App

From the project root:

```powershell
npm run dev
```

## Run The Sender Runtime

### Default still-image mode

This is the easiest path and remains the default. It is the best first choice
for Jetson bring-up when you only need to prove protocol and browser rendering.

With the default local sample images:

```powershell
npm run sender:runtime
```

Equivalent direct command:

```powershell
node ./scripts/jetson_sender_runtime.mjs
```

### Still-image mode with your own files

```powershell
node ./scripts/jetson_sender_runtime.mjs `
  --provider still `
  --left-image "C:\path\to\left_eye.png" `
  --right-image "C:\path\to\right_eye.png"
```

### Generated test-pattern mode

This is best when you want an obvious changing frame without managing files.

```powershell
node ./scripts/jetson_sender_runtime.mjs `
  --provider generated `
  --fps 2 `
  --image-mode data_url
```

### Binary frame mode for Jetson preview

Use this when the Jetson preview bridge is active and you want the sender to
forward JPEG bytes over WebSocket without converting them to base64 or
`data:` URLs first.

```powershell
node ./scripts/jetson_sender_runtime.mjs `
  --provider camera `
  --capture-backend jetson `
  --jetson-preview-enabled true `
  --image-mode binary_frame `
  --fps 5
```

Current `binary_frame` behavior:

- status/control messages still travel as JSON envelopes
- `stereo_frame` metadata still follows the same protocol contract
- left/right JPEG bytes ride in one binary WebSocket message
- the XR client reconstructs `blob:` URLs and keeps using the existing image
  viewer path
- legacy `base64` and `data_url` modes remain available for compatibility and
  debugging

### Image-sequence mode using the bundled sample folders

This is best for replaying saved left/right snapshots or staged demos.

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider sequence `
  --left-sequence-dir ".\scripts\assets\sequence\left" `
  --right-sequence-dir ".\scripts\assets\sequence\right"
```

### Image-sequence mode using explicit file lists

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider sequence `
  --left-sequence-files "C:\frames\left_001.png,C:\frames\left_002.png" `
  --right-sequence-files "C:\frames\right_001.png,C:\frames\right_002.png" `
  --sequence-loop false
```

### Camera provider mode

Camera mode now supports three useful bring-up backends:

- `simulated`: cross-platform camera-mode rehearsal on Windows, macOS, or Linux
- `replay`: camera-mode replay of recorded left/right snapshot sequences
- `gstreamer`: real snapshot capture on Linux/Jetson with `gst-launch-1.0`

Use `simulated` when you want the full camera provider path without Jetson,
Linux, `/dev/video*`, or any real recorded scene content. Use `replay` when you
already have saved left/right snapshots and want more realistic scene content
while keeping the same camera-mode telemetry and retry behavior. Use
`gstreamer` when you are ready to validate real capture hardware.

#### Simulated camera backend

This is the best local rehearsal path before Jetson hardware is ready.

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend simulated `
  --capture-width 1280 `
  --capture-height 720 `
  --capture-retry-count 2 `
  --capture-retry-delay-ms 500 `
  --health-log `
  --health-log-interval-ms 3000
```

Current behavior with `--capture-backend simulated`:

- runs on Windows, macOS, and Linux
- uses the real camera provider path, not the generic generated frame provider
- produces left/right simulated camera snapshots with camera-style metadata
- publishes camera-mode `source_status` telemetry including retry history,
  health state, startup validation, capture counters, and virtual device labels
- works with the existing fault-injection flags and heartbeat-drop rehearsal
- keeps browser diagnostics and the visible health badge exercising the same
  camera-mode state transitions expected later from the real backend

#### Simulated thermal + IR bring-up

Use this when you want to rehearse:

- ENVG-style fused thermal presentation
- thermal capability/status reporting without a FLIR Lepton device
- IR illuminator capability/status reporting without GPIO/PWM hardware

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend simulated `
  --thermal-simulated `
  --thermal-overlay-mode thermal_fusion_envg `
  --ir-simulated `
  --ir-enabled true `
  --ir-level 3 `
  --ir-max-level 5
```

What this adds on top of the normal simulated camera path:

- `capabilities` advertises thermal and IR support
- `source_status` carries thermal health/mode and IR enabled/level state
- `stereo_frame` carries an additive `thermalFrame` payload plus
  `thermalOverlayMode`
- the browser eye panels render a minimal thermal fusion layer when connected
- the browser status panel exposes operator controls for:
  - thermal mode selection
  - IR enable/disable
  - IR level adjustment
- thermal mode changes update the local renderer immediately
- IR changes update the local browser status/diagnostics immediately
- when the live WebSocket control path is connected, those controls also apply to
  the sender/runtime live without restart

#### Live browser-to-sender control rehearsal

When the browser is connected to the Jetson WebSocket transport, the
thermal/IR controls now send live outbound `settings_patch` messages over that
same socket.

For this bounded pass, the sender applies these fields live:

- `thermalOverlayMode`
- `irEnabled`
- `irLevel`

Current behavior:

- browser thermal mode changes still update local rendering immediately
- the sender applies the supported change live without restart
- the applied runtime state then flows back through `source_status`
- IR enable/level updates also flow back through refreshed capability/status
  reporting
- if the live control path is not connected, the browser keeps the selected
  value locally and the reported state does not change

#### Replay camera backend

This is the best middle ground when you want realistic scene content but do not
yet have Linux, Jetson, `/dev/video*`, or live camera instability available.

Fixed timing replay using the current sender cadence:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend replay `
  --left-replay-dir ".\scripts\assets\sequence\left" `
  --right-replay-dir ".\scripts\assets\sequence\right" `
  --replay-loop true `
  --replay-fps-mode fixed `
  --capture-retry-count 2 `
  --capture-retry-delay-ms 500 `
  --health-log `
  --health-log-interval-ms 3000
```

Recorded timing replay using the bundled sample manifest:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 1.0 `
  --replay-loop true `
  --capture-retry-count 2 `
  --capture-retry-delay-ms 500 `
  --health-log `
  --health-log-interval-ms 3000
```

Recorded timing replay slowed to `0.5x`:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 0.5 `
  --replay-loop true
```

Recorded timing replay sped up to `2.0x`:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 2.0 `
  --replay-loop true
```

Current behavior with `--capture-backend replay`:

- runs on Windows, macOS, and Linux
- still uses the real camera provider path and camera-mode `source_status`
  telemetry
- reads left/right replay inputs from directories or explicit file lists
- validates a JSON replay manifest when `--replay-manifest` is provided
- in `fixed` timing mode, a missing manifest file produces a warning and falls
  back to directory or file-list pairing
- in `recorded` timing mode, a missing manifest, malformed manifest, missing
  referenced asset, or missing `timestampMs` fails replay validation before
  runtime starts
- supports `--replay-fps-mode fixed|recorded`
- supports `--replay-time-scale <value>` in recorded mode:
  - `1.0` uses recorded timing as-is
  - values greater than `1.0` speed playback up by dividing delays
  - values less than `1.0` slow playback down by multiplying delays
  - fixed timing mode ignores the scale and warns during replay validation
- reports replay-specific camera telemetry such as replay source identity, loop
  mode, current replay index, total replay pair count, timing mode, manifest
  loaded state, manifest validation state/counts/source/summary, recorded
  timestamp, time scale, nominal/scaled delay-until-next-frame, nominal/scaled
  loop duration, and timing offset
- supports the same retry/fault-injection and heartbeat-drop rehearsal path as
  the simulated and gstreamer backends
- replays real recorded or staged scene snapshots, so viewer content is more
  realistic than the synthetic simulated backend

Replay timing modes:

- `fixed`:
  advances using the sender's current frame cadence, which is usually the
  configured `--fps` rate
- `recorded`:
  uses per-entry timing from the replay manifest when available, including
  variable frame spacing and intentional pauses; this mode requires a validated
  manifest with `timestampMs` on every entry
- `--replay-time-scale`:
  applies only to `recorded` timing. `2.0` means faster playback by halving the
  wait between frames; `0.5` means slower playback by doubling the wait between
  frames.

Replay manifest format:

```json
{
  "version": 1,
  "entries": [
    {
      "leftFile": "left/frame_001.svg",
      "rightFile": "right/frame_001.svg",
      "timestampMs": 1000,
      "frameId": 101,
      "label": "Replay sample pair 1",
      "notes": "Optional operator note."
    },
    {
      "leftFile": "left/frame_002.svg",
      "rightFile": "right/frame_002.svg",
      "timestampMs": 1180,
      "frameId": 102,
      "delayUntilNextMs": 90
    }
  ]
}
```

Manifest notes:

- `leftFile` and `rightFile` are required.
- Paths can be absolute, or relative to the manifest file.
- `timestampMs` lets recorded mode derive variable frame spacing from adjacent
  entries and is required for every entry in recorded timing mode.
- `delayUntilNextMs` explicitly overrides the next-frame delay for that entry.
- `frameId`, `label`, and `notes` are optional metadata that ride along with the
  replayed frame.
- malformed JSON, invalid field types, or missing referenced files fail replay
  validation before the sender starts.
- if `--replay-loop true` and recorded timing mode is enabled, add
  `delayUntilNextMs` to the last entry when you want a precise wrap-around delay;
  otherwise the sender warns and uses fixed cadence only for the final-to-first
  wrap.

Replay preflight for manifest-backed replay:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 0.5 `
  --replay-loop true
```

Replay preflight now doubles as a replay dry-run inspection mode. It validates
inputs without starting the sender runtime or opening transport, then reports:

- replay source identity and whether a manifest was loaded
- timing mode and configured time scale
- replay entry count and the first few entry previews
- min / max / average nominal delays
- min / max / average scaled delays
- nominal and scaled loop durations
- wrap behavior and wrap delay
- warnings for zero-delay boundaries or very large timing gaps

Limit the dry-run preview to just the first replay entry:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-preview-count 1 `
  --replay-loop true
```

Emit machine-readable JSON for tooling or CI:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 0.5 `
  --replay-preview-count 2 `
  --preflight-output json `
  --replay-loop true
```

JSON mode is intended for scripts or CI checks that need to inspect replay
validation, preview entries, timing summaries, warnings, and errors without
parsing human-readable log lines.

The JSON report now includes:

- `reportVersion`: stable preflight-report contract version for tooling
- `generatedAt`: ISO-8601 UTC timestamp showing when the report was produced

Treat `reportVersion` as the compatibility marker for automation and use
`generatedAt` for artifact auditing or CI logs.

Write the same JSON report to disk while still printing it to the console:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 0.5 `
  --replay-preview-count 2 `
  --preflight-output json `
  --preflight-output-file ".\artifacts\preflight\replay_preflight.json" `
  --replay-loop true
```

Write the normal text report to disk:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --preflight-output text `
  --preflight-output-file ".\artifacts\preflight\replay_preflight.txt" `
  --replay-loop true
```

`--preflight-output-file` creates parent directories when needed and writes the
same final report that was printed to the console. This is useful when CI,
bring-up scripts, or manual rehearsal runs need an artifact to archive or
inspect later.

Write the JSON report to disk quietly for CI or scripted bring-up:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 0.5 `
  --replay-preview-count 2 `
  --preflight-output json `
  --preflight-output-file ".\artifacts\preflight\replay_preflight.json" `
  --preflight-output-quiet `
  --replay-loop true
```

Write the text report to disk quietly:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --preflight-output text `
  --preflight-output-file ".\artifacts\preflight\replay_preflight.txt" `
  --preflight-output-quiet `
  --replay-loop true
```

`--preflight-output-quiet` suppresses normal successful console output. It is
most useful when paired with `--preflight-output-file` so CI or automation can
archive the report artifact without echoing the full report to the terminal.
Failures still surface clearly on stderr.

Quick CI/tooling checks for a written JSON artifact:

```powershell
$report = Get-Content ".\artifacts\preflight\replay_preflight.json" | ConvertFrom-Json
$report | Select-Object reportVersion, ok, generatedAt
```

```bash
jq '{reportVersion, ok, generatedAt}' ./artifacts/preflight/replay_preflight.json
```

Replay validation and fallback rules:

- missing manifest file:
  - `fixed` mode warns and falls back to directory/file-list pairing
  - `recorded` mode fails preflight/startup
- malformed manifest JSON:
  fails preflight/startup
- valid manifest with a missing referenced file:
  fails preflight/startup
- recorded mode with missing `timestampMs`:
  fails preflight/startup
- fixed mode with a valid manifest:
  uses manifest pairing and metadata, but keeps sender-driven cadence

How replay differs from the other camera backends:

- compared with `simulated`:
  - uses real left/right files instead of generated SVG scene content
  - keeps the same camera-mode health, retry, heartbeat, and status flow
  - can now rehearse recorded variable timing instead of only synthetic cadence
- compared with `gstreamer`:
  - avoids Linux, `/dev/video*`, and `gst-launch-1.0`
  - does not exercise real camera I/O timing or device bring-up
  - still exercises camera provider telemetry, retries, health logging, and
    browser diagnostics with more realistic imagery than `simulated`
  - recorded mode can approximate pauses and irregular timing, but it still does
    not validate live-device jitter, camera sync, or real transport stalls

#### Real GStreamer camera backend

On Linux/Jetson hosts with `gst-launch-1.0` available, camera mode uses the real
`gstreamer` snapshot backend. Unsupported hosts, or Linux systems without
`gst-launch-1.0`, still fall back to the placeholder backend when you request
`gstreamer`.

Linux/Jetson prerequisites:

- `gst-launch-1.0` available on `PATH`
- `gst-inspect-1.0` available on `PATH`
- GStreamer elements needed for snapshot capture:
  - `v4l2src`
  - `jpegenc`
  - `fdsink` or a `/dev/stdout` filesink fallback
- accessible camera devices such as `/dev/video0` and `/dev/video1`
- permission to open those devices from the sender process

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend gstreamer `
  --camera-profile hardware_safe `
  --left-camera-device /dev/video0 `
  --right-camera-device /dev/video1 `
  --capture-retry-count 2 `
  --capture-retry-delay-ms 750 `
  --health-log `
  --health-log-interval-ms 5000
```

Equivalent explicit command without the profile helper:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend gstreamer `
  --left-camera-device /dev/video0 `
  --right-camera-device /dev/video1 `
  --capture-width 1280 `
  --capture-height 720 `
  --capture-timeout-ms 5000 `
  --capture-jpeg-quality 70 `
  --capture-warmup-frames 2 `
  --capture-retry-count 2 `
  --capture-retry-delay-ms 750
```

Current behavior:

- connects and sends the normal protocol startup sequence
- with `--capture-backend simulated`, emits synthetic camera-style snapshots and
  camera telemetry through the real camera-mode seam on any development machine
- with `--capture-backend replay`, emits recorded left/right snapshot pairs
  through the same camera-mode seam while reporting replay-specific telemetry
  and either fixed or manifest-derived replay cadence
- on supported Linux/Jetson hosts, captures one JPEG snapshot from each camera
  per iteration and emits real `stereo_frame` messages
- reports richer camera-provider health through `source_status`
- keeps emitting explicit `source_status` telemetry heartbeats during capture
  stalls so browser diagnostics continue to update even before the next frame
- exposes backend diagnostics such as device paths, capture counters, startup
  validation state, retry/recovery state, last recovery/terminal failure times,
  recent capture issue history, last capture duration, and the resolved
  `gst-launch-1.0` path
- applies bounded retry handling for transient capture failures before entering a
  terminal capture error state
- can optionally inject synthetic capture faults and source-status heartbeat loss
  for bring-up rehearsal before real hardware instability is available
- on unsupported hosts or missing `gst-launch-1.0`, cleanly falls back to the
  placeholder backend

Preflight before live sender bring-up:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend gstreamer `
  --camera-profile hardware_safe `
  --left-camera-device /dev/video0 `
  --right-camera-device /dev/video1
```

Replay-input preflight before sender startup:

```powershell
npm run sender:preflight -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 2.0 `
  --replay-loop true
```

Optional recurring health logging:

```powershell
npm run sender:prototype -- `
  --provider camera `
  --capture-backend gstreamer `
  --camera-profile hardware_safe `
  --left-camera-device /dev/video0 `
  --right-camera-device /dev/video1 `
  --capture-retry-count 2 `
  --capture-retry-delay-ms 750 `
  --health-log `
  --health-log-interval-ms 5000
```

The recurring health log uses a compact one-line format so long Jetson runs stay
readable in the terminal. Retry, recovery, and terminal-failure transitions also
emit one-off event lines so short stalls remain visible.

## Fault Injection Rehearsal

These flags are intentionally development-oriented. They let you rehearse retry,
recovery, terminal-failure, and stale-telemetry behavior before depending on a
real camera or real Jetson instability.

Available flags:

- `--fault-inject-every-n-captures`
- `--fault-inject-failure-count`
- `--fault-inject-mode transient|terminal|timeout`
- `--fault-inject-start-after-captures`
- `--fault-inject-heartbeat-drop`
- `--fault-inject-heartbeat-drop-after-ms`

Simulate a transient timeout that should recover inside the retry budget:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend simulated `
  --capture-retry-count 2 `
  --capture-retry-delay-ms 500 `
  --fault-inject-every-n-captures 3 `
  --fault-inject-failure-count 1 `
  --fault-inject-mode timeout `
  --fault-inject-start-after-captures 1 `
  --health-log `
  --health-log-interval-ms 3000
```

Simulate a hard failure that should exhaust retries and surface
`terminal_failure`:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend simulated `
  --capture-retry-count 2 `
  --capture-retry-delay-ms 500 `
  --fault-inject-every-n-captures 1 `
  --fault-inject-mode terminal `
  --health-log `
  --health-log-interval-ms 3000
```

Simulate telemetry going stale while frames continue:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend simulated `
  --fault-inject-heartbeat-drop `
  --fault-inject-heartbeat-drop-after-ms 5000 `
  --health-log `
  --health-log-interval-ms 3000
```

Use the same fault-injection flags with `--capture-backend replay` when you want
retry/recovery rehearsal against recorded scene content instead of synthetic
frames.

Validated startup means:

For the simulated backend:

- the simulated backend started cleanly on the local host
- the configured warm-up capture count completed successfully
- the configured retry budget is available for transient capture failures
- camera-mode telemetry is active with simulated device labels

For the real GStreamer backend:

- Linux host check passed
- `gst-launch-1.0` was resolved and probed successfully
- left/right camera device paths were accessible
- the configured warm-up capture count completed successfully
- the configured retry budget is available for transient capture failures

For the full Jetson hardware bring-up checklist, see
`docs/jetson_camera_validation_runbook.md`.

## Common Sender Overrides

Change endpoint, FPS, sender metadata, and provider:

```powershell
node ./scripts/jetson_sender_runtime.mjs `
  --provider generated `
  --host 127.0.0.1 `
  --port 8090 `
  --path /jetson/messages `
  --fps 2 `
  --sender-name jetson_sender_proto `
  --sender-version 0.1.0 `
  --image-mode base64
```

## Point The Browser XR App At It

In the browser app:

1. Switch `Source mode` to `Live`.
2. Select the `Jetson WebSocket Transport Adapter`.
3. Set the transport host to `127.0.0.1`.
4. Set the transport port to `8090` unless you changed it.
5. Set the transport path to `/jetson/messages` unless you changed it.
6. Click `Apply Transport Config`.
7. Click `Connect WebSocket`.
8. Use the thermal mode selector, IR toggle, and IR level slider in the main
   browser status panel.

## First Live Bring-Up

On the Jetson host, launch the canonical sender runtime from
`NEVEX_XR/samsung_xr_app`:

```bash
node ./scripts/jetson_sender_runtime.mjs \
  --provider camera \
  --capture-backend jetson \
  --jetson-preview-enabled true \
  --image-mode binary_frame \
  --health-log \
  --health-log-interval-ms 3000
```

If you want a software-only rehearsal from the same runtime path before touching
real capture, use:

```bash
node ./scripts/jetson_sender_runtime.mjs \
  --provider camera \
  --capture-backend simulated \
  --image-mode binary_frame \
  --health-log \
  --health-log-interval-ms 3000
```

On the XR app host, launch the app from `NEVEX_XR/samsung_xr_app`:

```bash
npm run dev
```

Then in the UI:

1. Switch `Source mode` to `Live`.
2. Select `Jetson WebSocket Transport Adapter`.
3. Set `Host` to the Jetson sender host or tunnel endpoint.
4. Set `Port` to `8090` unless you changed it on the sender.
5. Set `Path` to `/jetson/messages`.
6. Click `Apply Transport Config`.
7. Click `Connect WebSocket`.

For first live validation, watch these readouts first:

- `Transport connection`
- `Transport status`
- `Last message type`
- `Last message time`
- `Source health`
- `Last frame`
- `Jetson runtime status`
- `Jetson profile`
- `Jetson preflight`

## What To Expect

If the connection is working:

- The viewer renders the active provider output:
  - still-image pair
  - generated test pattern
  - image sequence replay
- In camera mode on Linux/Jetson, diagnostics should show successful source
  status updates and JPEG-backed stereo frames from the configured devices.
- In camera mode with the simulated backend, diagnostics should show
  camera-mode source status updates, virtual simulated device labels, and
  image-backed left/right snapshots without requiring Linux or cameras.
- In camera mode with the replay backend, diagnostics should show replay source
  identity, replay loop/index telemetry, replay timing mode, manifest loaded
  state, recorded timestamp, replay time scale, nominal/scaled next delay,
  nominal/scaled loop duration, timing offset, and left/right snapshots loaded
  from the configured replay inputs.
- The always-visible status area now also shows a compact replay summary with:
  - current replay index / total
  - active replay `frameId` when present
  - active replay label when present
  - replay source identity
  - manifest path when present
  - replay timing mode and replay time scale
  - very long replay source or manifest paths compacted for readability only;
    the full values remain available in diagnostics/state
- During transient capture stalls, `source_status` should keep advancing with
  retry state, retry counters, recovery/terminal timestamps, and telemetry
  update time even before the next `stereo_frame` arrives.
- The main browser status panel should show a prominent `Source Health` badge
  moving through `Healthy`, `Retrying`, `Degraded`, `Terminal Failure`, or
  `Telemetry Stale`.
- Browser diagnostics should show:
  - telemetry freshness
  - last telemetry update time
  - telemetry stale threshold
  - recent capture issue history
- If camera capture fails, diagnostics should now identify which eye failed,
  which device path was used, and whether the failure was a timeout, process
  failure, or invalid JPEG result.
- Diagnostics show sender capabilities such as sender name/version and supported
  image modes.
- When `--thermal-simulated` is enabled, the visible status area also shows:
  - thermal mode
  - thermal health
  - IR enabled state
  - IR level
- The main browser status panel also exposes:
  - a thermal overlay mode selector using the sender-advertised supported modes
  - an IR enable/disable toggle
  - an IR level slider capped by the advertised `irMaxLevel`
  - clear disabled/unavailable notes when thermal or IR are absent
  - a compact selected-vs-reported note under each thermal/IR control
- Browser diagnostics now also show:
  - thermal available/unavailable
  - thermal backend identity
  - thermal frame size and frame rate
  - supported thermal overlay modes
  - current thermal overlay mode
  - operator-selected thermal mode
  - thermal health and any thermal error text
  - IR available/enabled state
  - IR backend identity
  - IR level / max level
  - operator-selected IR target state/level
  - IR control-supported and fault/error state
- When the live control path is connected:
  - changing thermal mode should update the reported thermal mode on the next
    `source_status`
  - changing IR enable/level should update the reported IR state without
    restarting the sender
- When the live control path is not connected:
  - the selected control value still changes in the browser
  - the reported state remains at the last sender-applied value
- `Last message type` and `Last sequence` keep advancing.
- `Sequence health` stays healthy.
- `Last message size` shows the current serialized envelope size.
- `Payload limits` remain visible so you can compare sender output against the
  receiver guardrails.

## Provider Guidance

- `still` is best for first Jetson bring-up because it minimizes moving parts
  while still using real local image files.
- `generated` is best for transport/protocol debugging when you want clearly
  changing frames without any file or camera dependencies.
- `sequence` is best for replaying captured or staged left/right snapshots.
- `camera` is the best structural starting point for real Jetson integration,
  because it already separates provider logic from backend capture logic.
- `camera` currently supports:
  - `simulated` snapshot rehearsal for local development
  - `replay` snapshot-sequence rehearsal with recorded scene content and
    optional manifest-driven timing
  - `gstreamer` snapshot capture for Linux/Jetson bring-up
- `camera` does not yet provide continuous streaming, sync logic, calibration,
  GPU acceleration, or OpenCV integration.

## Future Camera Provider

The `camera` provider now sits above a capture-backend seam intended to let a
future backend wrap:

- simulated camera rehearsal
- replayed stereo snapshot rehearsal
- OpenCV capture
- GStreamer snapshot capture
- Jetson camera snapshots

The currently implemented backends are:

- `simulated` for cross-platform development and fault rehearsal
- `replay` for camera-mode rehearsal with recorded left/right scene snapshots
- `gstreamer` for bring-up and diagnostics on Linux/Jetson

Still unimplemented:

- continuous streaming pipelines
- stereo sync logic
- calibration
- GPU acceleration
- OpenCV backend
- receiver protocol redesign

## Help

To view the full sender CLI help:

```powershell
node ./scripts/jetson_sender_prototype.mjs --help
```
