# NEVEX XR System Alignment

This repo should be treated as one integrated NEVEX XR system with three
connected layers:

1. `jetson_runtime/`
   Jetson-side runtime for stereo capture, runtime profiles, preflight,
   artifact generation, and future thermal / AI processing.
2. XR application
   The headset/client-side app under `src/`, `renderer`, `ui`, and related
   runtime shell code.
3. Integration / transport layer
   The contract between Jetson and XR for stereo imagery, status, diagnostics,
   and operator control.

This note exists to keep those layers aligned without refactoring the current
working runtime.

## Current Authority Boundaries

`jetson_runtime/` is the source of truth for:

- stereo camera configuration and sensor mapping
- Jetson preflight and health classification
- runtime profiles and effective config resolution
- composed stereo pipeline behavior
- stereo artifacts and post-run artifact inspection

The XR application is the source of truth for:

- stereo viewing and display modes
- HUD, menus, diagnostics panels, and status presentation
- operator interaction and transport UX
- receiver-side protocol validation and diagnostics rendering

The transport layer is the source of truth for:

- message envelope/versioning
- sender-to-XR payload schemas
- transport lifecycle and sequence-health semantics
- outbound operator command formats

Current transport contract references:

- `docs/jetson_protocol_reference.md`
- `src/stereo_viewer/jetson_message_envelope.ts`
- `src/stereo_viewer/jetson_transport_payloads.ts`
- `src/control_client/control_client.ts`

## Important Alignment Rule

Do not let Jetson capture logic evolve in two places.

Today the repo already contains XR-side sender prototype code with its own
camera profiles, GStreamer capture backend, and sender preflight:

- `scripts/sender/capture_backends/gstreamer_stereo_capture_backend.mjs`
- `scripts/jetson_sender_preflight.mjs`
- `scripts/sender/sender_config.mjs`

Those are useful bring-up scaffolds, but they should not become the long-term
authority for Jetson capture behavior now that `jetson_runtime/` exists.

The long-term authority for Jetson capture, preflight, and runtime profiles
should remain `jetson_runtime/`.

## Current Cross-System Boundary

Jetson currently produces:

- JSON introspection for profiles, effective config, and system summary
- JSON preflight reports
- human-readable and JSON artifact summaries
- side-by-side stereo snapshot and recording artifacts
- runtime logs and success/failure classifications

XR currently consumes:

- `capabilities`
- `transport_status`
- `source_status`
- `stereo_frame`
- `error`
- `remote_config`

XR currently sends or is prepared to send:

- `settings_patch`
- `brightness_command`
- `overlay_command`
- `viewer_command`
- `diagnostics_command`
- `session_command`

## Current Mismatch To Keep In Mind

The current Jetson runtime is already a strong control-plane component, but it
is not yet a final XR data-plane service.

Specifically:

- `jetson_runtime/` currently outputs composed side-by-side stereo artifacts and
  runtime results
- the XR transport contract currently expects structured status messages and
  per-eye `left` / `right` frame payloads
- the XR UI already has live transport and outbound control seams
- some XR control fields are future-facing and do not map cleanly onto the
  current Jetson runtime yet

This means the next integration step should connect the two systems through a
small adapter layer, not by duplicating more Jetson logic inside the XR sender
prototype.

## Recommended Next Step

Implement the missing `jetson` integration path behind the existing sender
backend / transport seams instead of extending the prototype `gstreamer`
backend further.

Practical target:

- use the existing sender-side `jetson` backend slot as the bridge point
- call `jetson_runtime/app.py` for:
  - `--mode preflight --json`
  - `--list-profiles --json`
  - `--describe-profile <name> --json`
  - `--show-effective-config --json`
  - bounded capture actions such as `stereo-snapshot` and `stereo-record`
- map Jetson runtime results into the existing XR transport/control contract

Recommended order:

1. Control-plane bridge first.
   Use Jetson runtime JSON/introspection/preflight outputs to populate XR
   diagnostics and status surfaces.
2. Session commands second.
   Add Jetson-backed actions for preflight, profile selection, snapshot,
   recording start/stop, and ping/health checks.
3. Preview data-plane after that.
   Once the bridge is in place, decide whether the first live proof-of-life
   should split a composed Jetson preview into left/right eye payloads or add a
   dedicated Jetson preview mode that is easier to map into the XR frame
   contract.

## What Should Stay Local vs Remote

XR-local for now:

- stereo display mode selection
- zoom and viewer presentation choices
- UI-only diagnostics layout behavior

Jetson-facing next:

- preflight execution
- runtime profile selection
- effective-config inspection
- snapshot capture
- recording start / stop
- runtime health and failure reporting

Future Jetson-facing after live processing exists:

- thermal overlay mode changes
- IR control
- AI overlay toggles

## Short Operational Rule

When a Jetson-side capability already exists in `jetson_runtime/`, prefer
wrapping it for XR integration rather than re-implementing it in
`scripts/sender/`.
