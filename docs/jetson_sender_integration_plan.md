# Jetson Sender Integration Plan

This plan defines the bring-up-ready path for first live Jetson-to-XR stereo
delivery using the canonical sender runtime.

## Milestone Target

Deliver first live `stereo_frame` traffic from Jetson runtime into the XR app
without changing sender architecture or UI structure.

## Scope Guardrails

For this milestone:

- keep runtime architecture additive and unchanged
- keep existing UI structure and controls unchanged
- do not begin thermal integration work
- do not begin AI integration work

## Canonical Entrypoints

- sender runtime:
  `samsung_xr_app/scripts/jetson_sender_runtime.mjs`
- package scripts:
  - `npm run sender:runtime`
  - `npm run sender:runtime:simulated`
  - `npm run sender:runtime:jetson`
- sender preflight:
  `npm run sender:preflight`

`sender:prototype` remains compatibility-oriented only and is not the primary
bring-up path.

## Required Startup Message Contract

For each new transport connection, sender startup must preserve:

1. `capabilities`
2. `transport_status`
3. `source_status`
4. first `stereo_frame` (only when frame streaming is enabled)

Control-plane Jetson bridge mode intentionally stops at status traffic and does
not auto-stream `stereo_frame`.

## Bring-Up Lanes (Narrow To Wide)

Use the smallest lane that answers the current question.

### Lane A: Local camera-path rehearsal (no Jetson hardware)

From `NEVEX_XR/samsung_xr_app`:

```powershell
npm run sender:runtime:simulated -- `
  --health-log-interval-ms 3000
```

### Lane B: Replay rehearsal with recorded timing

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

### Lane C: First live Jetson control-plane bring-up

From `NEVEX_XR/samsung_xr_app` on the Jetson host:

```bash
npm run sender:runtime -- \
  --provider camera \
  --capture-backend jetson \
  --jetson-run-preflight-on-start true \
  --health-log \
  --health-log-interval-ms 3000
```

Expected outcome:

- Jetson profile/preflight/artifact telemetry is visible in XR diagnostics
- continuous `stereo_frame` streaming is still intentionally disabled

### Lane D: Live Jetson preview bridge

From `NEVEX_XR/samsung_xr_app` on the Jetson host:

```bash
npm run sender:runtime:jetson -- \
  --jetson-run-preflight-on-start true \
  --jetson-profile headset_preview_720p60 \
  --health-log \
  --health-log-interval-ms 3000
```

Expected outcome:

- bridge mode is `jetson_runtime_preview_bridge`
- runtime source mode is `camera`
- `stereo_frame` sequence and frame time advance continuously

## Validation Evidence Required Per Bring-Up Session

Capture all of the following in bring-up notes:

- sender command used (full CLI)
- XR transport host/port/path used
- first message ordering confirmation (`capabilities` -> `transport_status` ->
  `source_status` -> `stereo_frame` when streaming)
- bridge mode and runtime source mode observed
- profile and preflight summary observed
- first successful frame timestamp and advancing sequence confirmation
- any warnings/failures and exact remediation attempted

## Focused Automated Validation

Run from `NEVEX_XR/samsung_xr_app`:

```powershell
npx vitest run `
  .\scripts\sender\sender_runtime.test.mjs `
  .\scripts\sender\capture_backends\jetson_runtime_capture_backend.test.mjs `
  .\src\stereo_viewer\jetson_sender_runtime_end_to_end.test.ts
```

## Known Hardware Blockers (Track Explicitly)

Treat these as hardware/environment blockers, not runtime-architecture tasks:

- camera nodes missing or unstable (`/dev/video*`)
- `gst-launch-1.0`/plugins missing on target host
- `nvargus-daemon` unhealthy
- Jetson runtime preflight failures
- network path between Jetson host and XR host unavailable
