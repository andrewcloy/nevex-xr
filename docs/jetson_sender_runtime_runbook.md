# Jetson Sender Runtime Runbook

This runbook defines the exact launch and validation flow for first live Jetson
bring-up into the XR app using the canonical sender runtime.

## Milestone Scope

Current milestone: Jetson bring-up readiness.

In scope:

- bring-up runbooks
- launch command accuracy
- validation documentation
- focused tests for first live bring-up

Out of scope for this pass:

- runtime architecture changes
- UI redesign
- thermal integration
- AI integration

## Canonical Entrypoints

From `NEVEX_XR/samsung_xr_app`:

- `npm run sender:runtime`
- `npm run sender:runtime:simulated`
- `npm run sender:runtime:jetson`
- `npm run sender:preflight`

Direct entrypoint:

- `node ./scripts/jetson_sender_runtime.mjs`

## Host Roles

- Jetson host:
  runs Python runtime checks and sender runtime commands.
- XR host:
  runs the browser app and connects to Jetson over WebSocket.

## Prerequisites

### Jetson host

- Linux/Jetson environment
- working camera mapping for left/right capture
- `python3` available
- `gst-launch-1.0` and `gst-inspect-1.0` available
- repo available with both `jetson_runtime` and `samsung_xr_app`

### XR host

- Node/npm available
- `NEVEX_XR/samsung_xr_app` dependencies installed
- network path to Jetson sender host and port

## Launch Lanes (Narrowest First)

Use these lanes in order and stop on first failure.

### 1) Camera-path rehearsal without Jetson hardware

From `NEVEX_XR/samsung_xr_app`:

```powershell
npm run sender:runtime:simulated -- `
  --health-log-interval-ms 3000
```

### 2) Replay rehearsal with recorded timing

From `NEVEX_XR/samsung_xr_app`:

```powershell
npm run sender:runtime -- `
  --provider camera `
  --capture-backend replay `
  --replay-manifest ".\scripts\assets\sequence\replay_manifest.json" `
  --replay-fps-mode recorded `
  --replay-time-scale 1.0 `
  --replay-loop true `
  --health-log `
  --health-log-interval-ms 3000
```

### 3) Jetson control-plane bring-up (first live lane)

From `NEVEX_XR/samsung_xr_app` on Jetson:

```bash
npm run sender:runtime -- \
  --provider camera \
  --capture-backend jetson \
  --jetson-run-preflight-on-start true \
  --health-log \
  --health-log-interval-ms 3000
```

This lane intentionally keeps continuous preview streaming disabled.

### 4) Jetson preview bridge (live frames)

From `NEVEX_XR/samsung_xr_app` on Jetson:

```bash
npm run sender:runtime:jetson -- \
  --jetson-run-preflight-on-start true \
  --jetson-profile headset_preview_720p60 \
  --health-log \
  --health-log-interval-ms 3000
```

This enables `--capture-backend jetson`, `--jetson-preview-enabled true`, and
`--image-mode binary_frame` through the canonical shortcut.

## Exact First Live Bring-Up Sequence

Follow these steps exactly for first live validation.

### Step 1: Validate Python runtime on Jetson

From `NEVEX_XR` on Jetson:

```bash
python3 ./jetson_runtime/app.py --mode preflight --profile headset_preview_720p60
python3 ./jetson_runtime/app.py --mode stereo-smoke --profile headset_preview_720p60 --run-preflight
```

If either command fails, stop and fix runtime/hardware before sender bridge work.

### Step 2: Start sender in control-plane mode first

From `NEVEX_XR/samsung_xr_app` on Jetson:

```bash
npm run sender:runtime -- \
  --provider camera \
  --capture-backend jetson \
  --jetson-run-preflight-on-start true \
  --health-log \
  --health-log-interval-ms 3000
```

### Step 3: Launch XR app on XR host

From `NEVEX_XR/samsung_xr_app` on XR host:

```powershell
npm run dev
```

In the UI:

1. set `Source mode` to `Live`
2. select `Jetson WebSocket Transport Adapter`
3. set `Host` to Jetson sender host
4. set `Port` to `8090` (unless overridden)
5. set `Path` to `/jetson/messages`
6. click `Apply Transport Config`
7. click `Connect WebSocket`

### Step 4: Validate control-plane telemetry

Confirm:

- `Bridge mode` is `jetson_runtime_control_plane`
- `Runtime source mode` is `control_plane`
- Jetson profile and preflight summary are visible
- no continuous `stereo_frame` stream is expected in this lane

### Step 5: Switch sender to preview bridge

Stop control-plane sender and run:

```bash
npm run sender:runtime:jetson -- \
  --jetson-run-preflight-on-start true \
  --jetson-profile headset_preview_720p60 \
  --health-log \
  --health-log-interval-ms 3000
```

### Step 6: Validate live frame flow

Confirm:

- `Bridge mode` is `jetson_runtime_preview_bridge`
- `Runtime source mode` is `camera`
- `Last message type`, `Last sequence`, and `Last frame` keep advancing
- left/right imagery keeps updating in the viewer

## Startup Ordering Requirement

For each new transport connection, sender startup must preserve:

1. `capabilities`
2. `transport_status`
3. `source_status`
4. first `stereo_frame` (streaming lanes only)

This ordering is validated by focused sender and XR ingest tests.

## Focused Automated Validation

Run from `NEVEX_XR/samsung_xr_app`:

```powershell
npx vitest run `
  .\scripts\sender\sender_runtime.test.mjs `
  .\scripts\sender\capture_backends\jetson_runtime_capture_backend.test.mjs `
  .\src\stereo_viewer\jetson_sender_runtime_end_to_end.test.ts `
  .\src\ui\status_panel.test.ts `
  .\src\ui\diagnostics_panel.test.ts
```

## Failure Isolation Order

When bring-up fails, isolate in this order:

1. Python runtime preflight/smoke on Jetson
2. sender control-plane mode
3. XR transport connection and UI ingest
4. sender preview bridge mode
5. sustained live frame cadence

Do not attempt runtime architecture changes during this milestone while isolating
failures.

## Remaining Hardware Blockers To Track

Track these separately from software correctness:

- missing or unstable `/dev/video*` camera nodes
- unavailable or broken GStreamer binaries/plugins
- `nvargus-daemon` instability
- Jetson runtime preflight failures on target hardware
- network reachability between Jetson and XR host

## Related Docs

- `docs/jetson_camera_validation_runbook.md`
- `docs/jetson_sender_integration_plan.md`
- `docs/milestone_tracker.md`
