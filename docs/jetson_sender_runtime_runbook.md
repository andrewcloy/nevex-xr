# Jetson Sender Runtime Runbook

This is the canonical operator runbook for the live sender path under the
unified `NEVEX_XR` repository root.

Use this document when you want:

- the canonical sender entry commands
- the shortest sender-side validation checklist
- clear control-plane-only versus preview-bridge expectations
- quick troubleshooting for the first live Jetson-to-XR attempts

For the shortest full bring-up checklist, use
`docs/jetson_first_live_bringup.md`.

For camera backend validation details, use
`docs/jetson_camera_validation_runbook.md`.

The older `docs/jetson_sender_prototype_runbook.md` file remains as a
compatibility reference for older notes, but the runtime entry below is the
canonical path going forward.

## Canonical Entry Points

From `NEVEX_XR/samsung_xr_app`:

```bash
npm run sender:runtime
```

Compatibility alias:

```bash
npm run sender:prototype
```

Useful bring-up aliases:

```bash
npm run sender:runtime:simulated:bringup
npm run sender:runtime:jetson:bringup
```

Direct runtime entry:

```bash
node ./scripts/jetson_sender_runtime.mjs [options]
```

## Quick Environment Checks

Run these before the first live Jetson attempt:

```bash
node --version
npm --version
python3 --version
```

Expected guidance:

- if `node` or `npm` is missing, install a current Node.js LTS release on the
  host that will run `samsung_xr_app`
- if `python3` is missing on the Jetson, the sender can start but the Jetson
  runtime bridge will fail when control-plane or preview commands reach
  `jetson_runtime/app.py`
- if `npm install` has not been run in `samsung_xr_app`, complete that before
  running the sender or XR app host

## Canonical Sender Commands

Software-only sender rehearsal:

```bash
cd ~/NEVEX_XR/samsung_xr_app
npm run sender:runtime:simulated:bringup
```

Canonical live Jetson preview bridge:

```bash
cd ~/NEVEX_XR/samsung_xr_app
npm run sender:runtime:jetson:bringup
```

Equivalent direct command:

```bash
cd ~/NEVEX_XR/samsung_xr_app
node ./scripts/jetson_sender_runtime.mjs \
  --provider camera \
  --capture-backend jetson \
  --jetson-preview-enabled true \
  --image-mode binary_frame \
  --health-log \
  --health-log-interval-ms 3000
```

## Control Plane Vs Preview Bridge

Two Jetson-backed live modes are intentional:

- `control-plane only`: the sender exposes Jetson runtime telemetry and operator
  actions, but continuous `stereo_frame` delivery is intentionally disabled
- `preview bridge active`: the sender exposes Jetson runtime telemetry and also
  forwards Jetson-authored stereo preview frames as `stereo_frame`

What to expect in XR:

- if the WebSocket is connected and `Jetson control mode` shows
  `Active (control-plane only)`, commands should work but the viewer should not
  receive continuous frames
- if the WebSocket is connected and `Jetson control mode` shows
  `Active (preview bridge)`, `Last message type` should eventually become
  `stereo_frame`

## XR Connection Expectations

The canonical endpoint is:

- `ws://<host>:8090/jetson/messages`

XR-side live settings should be:

- `Source mode`: `Live`
- `Transport adapter`: `Jetson WebSocket`
- `Host`: Jetson IP or `127.0.0.1` through an SSH tunnel
- `Port`: `8090`
- `Path`: `/jetson/messages`

## Fast Troubleshooting

If `npm` is missing:

- install Node.js on the host running `samsung_xr_app`
- rerun `npm install` from `samsung_xr_app`

If the XR app connects to the wrong endpoint:

- confirm sender host, port, and path match `ws://<host>:8090/jetson/messages`
- verify any SSH tunnel forwards `8090` to `127.0.0.1:8090` on the Jetson

If XR connects but only status updates arrive:

- confirm the sender was started with `--jetson-preview-enabled true`
- confirm XR diagnostics show `Active (preview bridge)` instead of
  `Active (control-plane only)`
- if control-plane telemetry is updating but `stereo_frame` never arrives, the
  control path is healthy and the preview bridge is the next thing to inspect

If XR connects but `Last message type` never reaches `stereo_frame`:

- inspect the sender console for preview startup or frame-provider errors
- inspect XR diagnostics for `Transport status`, `Last message time`, and source
  error text
- run `python3 app.py --mode preflight` from `NEVEX_XR/jetson_runtime` to rule
  out Jetson-side runtime issues

If Jetson control actions fail:

- confirm `jetson_runtime/app.py` exists at the top-level sibling path
- confirm `python3` can launch the runtime directly
- capture both the sender console output and XR diagnostics status/error text

## Software-Validated Scope

Already validated in software:

- canonical sender runtime entry path
- canonical WebSocket endpoint defaults
- XR receiver handling for JSON status envelopes and binary `stereo_frame`
  messages
- sender end-to-end software path into the XR transport adapter

Still hardware-only:

- real Jetson preview publisher output from both CSI cameras
- on-device cadence and stability over time
- LAN or tunnel reachability between the Jetson and the XR app host
