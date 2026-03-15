# Jetson First Live Bring-Up

This runbook is the shortest path to the first real Jetson-to-XR stereo frame
delivery attempt from the canonical repository layout.

Use this document when you want:

- the exact Jetson sender launch command
- the exact XR-side launch and connection steps
- a short diagnostics checklist for the first live attempt
- a clear split between software-validated behavior and hardware-only blockers

## Canonical Paths

Repository root:

- `C:\Users\andre\Desktop\NEVEX_XR`

Sender runtime entry:

- `samsung_xr_app/scripts/jetson_sender_runtime.mjs`

Jetson runtime authority:

- `jetson_runtime/app.py`

Default live WebSocket endpoint:

- `ws://<host>:8090/jetson/messages`

## Software-Validated Already

These parts are already validated in software from the canonical repo layout:

- sender runtime starts from `samsung_xr_app/scripts/jetson_sender_runtime.mjs`
- Jetson-backed sender mode resolves the top-level sibling `jetson_runtime`
- XR live transport defaults to port `8090` and path `/jetson/messages`
- XR receiver accepts sender JSON status envelopes and binary `stereo_frame`
  payloads
- sender-to-XR end-to-end runtime flow passes in a software-only test using the
  canonical sender runtime plus the real XR transport adapter
- `npm run test:sender`
- `npm run test:browser`
- `npm run build`

## Still Hardware-Only

These must still be proven on the actual Jetson and XR path:

- Jetson preflight passes on the real device
- the Jetson preview publisher delivers live paired stereo frames from the real
  cameras
- Argus, GStreamer, CSI cameras, and runtime profiles behave correctly on-device
- the network path from Jetson to the XR app host is reachable and stable
- sustained live preview cadence, latency, and payload size are acceptable on
  hardware

## Jetson Host Steps

Run these on the Jetson from `NEVEX_XR/samsung_xr_app`.

Install dependencies if needed:

```bash
cd ~/NEVEX_XR/samsung_xr_app
node --version
npm --version
npm install
```

Optional direct Jetson runtime preflight before opening the sender:

```bash
cd ~/NEVEX_XR/jetson_runtime
python3 app.py --mode preflight
```

Recommended first live sender launch:

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

Equivalent npm alias:

```bash
cd ~/NEVEX_XR/samsung_xr_app
npm run sender:runtime:jetson:bringup
```

Current note:

- the sender console still uses the historical `[sender-prototype]` log prefix
  even when launched through `jetson_sender_runtime.mjs`
- that prefix is expected compatibility naming and does not mean the old nested
  or deprecated path is being used

Software-only rehearsal through the same sender runtime:

```bash
cd ~/NEVEX_XR/samsung_xr_app
npm run sender:runtime:simulated:bringup
```

## XR App Host Steps

Run these on the machine hosting the XR browser app from
`C:\Users\andre\Desktop\NEVEX_XR\samsung_xr_app`.

Install dependencies if needed:

```powershell
cd C:\Users\andre\Desktop\NEVEX_XR\samsung_xr_app
node --version
npm --version
npm install
```

Start the XR app:

```powershell
npm run dev
```

In the XR app UI:

1. Switch `Source mode` to `Live`.
2. Select `Jetson WebSocket`.
3. Set `Host` to the Jetson IP, or `127.0.0.1` if you are tunneling locally.
4. Set `Port` to `8090`.
5. Set `Path` to `/jetson/messages`.
6. Click `Apply Transport Config`.
7. Click `Connect WebSocket`.

If you need an SSH tunnel from the XR app host to the Jetson:

```bash
ssh -L 8090:127.0.0.1:8090 <jetson-user>@<jetson-ip>
```

Then keep the XR app host set to:

- `Host`: `127.0.0.1`
- `Port`: `8090`
- `Path`: `/jetson/messages`

## What Success Looks Like

On the Jetson sender console:

- `listening on ws://...:8090/jetson/messages`
- `jetson runtime bridge active: app=.../jetson_runtime/app.py`
- `provider ready for ...: Camera Snapshot Frame Provider`

On the XR app status or diagnostics panels:

- `Transport connection`: connected
- `Transport status`: running
- `Last message type`: eventually `stereo_frame`
- `Last message time`: keeps updating
- `Last frame`: no longer `Pending`
- `Source health`: not stuck at `Pending`
- `Jetson runtime status`: populated from live telemetry
- `Jetson profile`: populated from live telemetry
- `Jetson preflight`: populated from live telemetry

## Fast Failure Triage

If `Transport connection` never becomes connected:

- verify Jetson sender is running
- verify host, port, and path
- verify firewall, LAN reachability, or SSH tunnel

If transport connects but `Last frame` stays `Pending`:

- verify the sender was started with `--jetson-preview-enabled true`
- watch whether `Last message type` reaches `stereo_frame`
- if only `source_status` appears, the control plane is alive but live preview is
  not reaching the XR app yet
- if `Jetson control mode` shows `Active (control-plane only)`, the sender is
  healthy but continuous preview delivery is intentionally disabled

If `node` or `npm` is missing on the Jetson or XR app host:

- install a current Node.js LTS release
- rerun `npm install` from `NEVEX_XR/samsung_xr_app`
- restart the sender or XR app host process after the install completes

If XR shows `Jetson preflight` fail:

- inspect the Jetson console and run:

```bash
cd ~/NEVEX_XR/jetson_runtime
python3 app.py --mode preflight
```

- fix the Jetson-side camera, Argus, or plugin issue before retrying preview

If XR shows protocol parse/validation errors:

- capture the sender console output
- capture the XR diagnostics `Protocol parse/validation error`
- this should now be unexpected after the current software validation pass

## Minimum Remaining Blockers

The minimum honest blockers before declaring first live bring-up successful are:

- real Jetson preflight success on the device
- real preview publisher frames arriving from both cameras
- XR diagnostics showing repeated `stereo_frame` traffic instead of status-only
  telemetry
- acceptable on-device cadence and stability for more than a momentary proof of
  life
