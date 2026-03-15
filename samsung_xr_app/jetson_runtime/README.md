# NEVEX XR Jetson Runtime

This folder is the Jetson-side Python runtime for the NEVEX XR stereo digital
night vision system.

The current scope is still intentionally narrow:

- keep the known-good Argus and GStreamer assumptions
- stay headless-friendly for SSH bring-up
- validate the environment before runtime start
- validate the true composed stereo pipeline, not only per-sensor probes
- produce real image and video artifacts for proof-of-life
- inspect successful artifacts and report useful post-run metadata
- support named runtime operating profiles for validation and future headset-facing work
- add CLI introspection so operators can inspect profiles, modes, and resolved runtime settings without opening JSON files manually

## Current File Tree

```text
jetson_runtime/
├── app.py
├── README.md
├── requirements.txt
├── config/
│   └── camera_config.json
└── nevex_xr/
    ├── __init__.py
    ├── artifact_inspector.py
    ├── config.py
    ├── introspection.py
    ├── pipeline_builder.py
    ├── pipeline_runner.py
    ├── preflight.py
    ├── preview_capture.py
    ├── preview_publisher.py
    ├── preview_shared_memory.py
    ├── preview_stream_protocol.py
    ├── runtime_profiles.py
    └── utils/
        ├── __init__.py
        └── logging_utils.py
```

## Runtime Modes

Primary validation and artifact modes:

- `preflight`
  validates Python, Linux/Jetson environment, GStreamer binaries/plugins,
  Argus daemon, expected camera nodes, sensor IDs, output writability, and
  one-shot Argus sensor probes
- `stereo-smoke`
  runs the true composed side-by-side stereo runtime pipeline for a bounded
  duration using `fakesink`
- `stereo-preview-frame`
  captures one Jetson-authored left/right JPEG preview pair for the XR preview bridge
- `stereo-preview-publisher`
  keeps one Jetson-owned preview pipeline warm and emits continuous synchronized preview events for the sender bridge
- `stereo-snapshot`
  captures a real side-by-side stereo JPEG artifact from both cameras
- `stereo-record`
  records a bounded side-by-side stereo video artifact to disk

Existing modes retained for compatibility:

- `headless`
  continuous runtime, optionally bounded with `--duration-seconds`
- `snapshot`
  legacy alias for `stereo-snapshot`
- `stereo-test`
  bounded validation mode that uses `fakesink` by default and can still record
  to file with `--output-mode file`

## Runtime Profiles

The runtime now supports named operating profiles loaded from
`config/camera_config.json`.

Current built-in profiles:

- `quality_1080p30`
  validation profile for full-resolution 1080p30 side-by-side stereo
- `low_latency_720p60`
  operational profile for faster 720p60 preview with smaller queue depth
- `record_1080p30`
  validation profile tuned for bounded 1080p30 file recording
- `headset_preview_720p60`
  operational 720p60 profile intended to stay close to future headset-preview work

Current profile model:

- `default_profile` in config selects the default profile when `--profile` is not supplied
- `--profile <name>` overrides the config default
- profiles can inherit from other profiles with `extends`
- each profile can override `camera`, `output`, `runtime`, and `features`

## CLI Introspection

The runtime now exposes additive CLI inspection commands so you can understand
what will run before starting capture.

Available inspection commands:

- `--list-modes`
  shows all supported runtime modes with a short description and whether the mode
  is expected to produce an artifact
- `--list-profiles`
  lists available runtime profiles with concise effective geometry and output-mode
  summaries
- `--describe-profile <name>`
  shows one profile in detail including profile type, inheritance, effective
  geometry, FPS, durations, and bitrate
- `--show-effective-config`
  prints the resolved config after profile selection; if combined with `--mode`,
  it also shows the final mode-specific plan that will actually run
- `--show-system-summary`
  prints a concise host/runtime summary including the active profile and any
  detected Jetson platform information

Typical operator examples:

```bash
python3 app.py --list-modes
python3 app.py --list-profiles
python3 app.py --describe-profile low_latency_720p60
python3 app.py --show-effective-config --profile headset_preview_720p60
python3 app.py --show-system-summary
python3 app.py --mode preflight --profile quality_1080p30 --show-effective-config
python3 app.py --mode stereo-smoke --profile low_latency_720p60 --show-effective-config --dry-run
python3 app.py --mode stereo-preview-publisher --profile headset_preview_720p60 --preview-publish-fps 5 --json
```

Standalone inspection commands also support JSON output:

```bash
python3 app.py --list-profiles --json
python3 app.py --describe-profile low_latency_720p60 --json
python3 app.py --show-effective-config --profile headset_preview_720p60 --json
python3 app.py --show-system-summary --json
```

Current JSON behavior:

- supported for standalone introspection commands
- supported for `preflight`
- supported for `stereo-preview-frame`
- supported for `stereo-preview-publisher` as a machine-readable framed stdout control stream; when shared-memory args are supplied, large frame bytes live outside the pipe
- supported for successful artifact-producing runs
- not supported when introspection output is combined with an executing runtime mode,
  to keep stdout machine-readable

Current config default:

- `default_profile: quality_1080p30`

Profile categories currently used:

- `validation`
- `operational`

## What Preflight Still Checks

The existing preflight layer remains in place and currently checks:

- Python version
- Linux host
- Jetson platform hints
- JetPack / L4T detection when available
- `gst-launch-1.0`
- `gst-inspect-1.0`
- `nvarguscamerasrc`
- `nvcompositor`
- `nvvidconv`
- `fakesink`
- `jpegenc`
- `filesink`
- `nvv4l2h264enc`
- `h264parse`
- the configured recording muxer
- `nvargus-daemon`
- configured camera nodes such as `/dev/video0` and `/dev/video1`
- configured Argus sensor IDs
- output-directory writability
- one-shot Argus capture for the configured left and right sensor IDs

This means:

- `preflight` proves the environment is sane
- `stereo-smoke` proves the full composed runtime pipeline stays up
- `stereo-snapshot` proves the composed stereo image can be written as a real
  artifact
- `stereo-record` proves the composed stereo video path can be encoded and
  written as a real artifact
- post-run inspection summarizes the artifact path, size, capture timestamp, and
  any discoverable media metadata

## Configuration

Primary config file:

- `config/camera_config.json`

Current config areas:

- default profile selection
- named runtime profiles
- left and right Argus sensor IDs
- expected `/dev/video*` nodes
- capture width, height, and FPS
- composed stereo output width and height
- flip method
- queue depth for latency tuning
- output directory
- preview filename prefix
- preview JPEG quality
- snapshot filename prefix
- recording filename prefix
- recording container
- smoke/test duration
- recording duration
- H.264 bitrate
- GStreamer binary names
- preflight timeout
- optional startup preflight
- optional `GST_DEBUG`

Current defaults:

- `default_profile: quality_1080p30`
- `left_sensor_id: 0`
- `right_sensor_id: 1`
- `expected_video_devices: ["/dev/video0", "/dev/video1"]`
- `width: 1920`
- `height: 1080`
- `output_width: 3840`
- `output_height: 1080`
- `fps: 30`
- `output.mode: fakesink`
- `test_duration_seconds: 10`
- `record_duration_seconds: 10`
- `preview_filename_prefix: stereo_preview`
- `preview_jpeg_quality: 70`
- `snapshot_filename_prefix: stereo_snapshot`
- `recording_filename_prefix: stereo_capture`
- `run_preflight_on_start: false`

Profile selection examples:

```bash
python3 app.py --mode stereo-smoke --profile quality_1080p30
python3 app.py --mode stereo-smoke --profile low_latency_720p60
python3 app.py --mode stereo-record --profile record_1080p30
python3 app.py --mode stereo-smoke --profile headset_preview_720p60
```

## Requirements

Python package requirements:

- none beyond the standard library

Optional post-run metadata tools:

- `ffprobe`
- `gst-discoverer-1.0`

Jetson runtime requirements:

- Jetson Orin Nano
- JetPack 6 / L4T 36.5
- Python 3.10 or newer
- `gst-launch-1.0`
- `gst-inspect-1.0`
- Jetson plugins used by this runtime:
  - `nvarguscamerasrc`
  - `nvcompositor`
  - `nvvidconv`
  - `nvv4l2h264enc`
  - `jpegenc`
  - `filesink`

## Exact Jetson Validation Flow

From the project root:

```bash
cd jetson_runtime
```

### 1. Run Standalone Preflight

```bash
python3 app.py --mode preflight
```

Run preflight against a specific profile:

```bash
python3 app.py --mode preflight --profile low_latency_720p60
```

Use JSON output for automation:

```bash
python3 app.py --mode preflight --json
```

Show the resolved runtime config before running preflight:

```bash
python3 app.py --mode preflight --profile quality_1080p30 --show-effective-config
```

What success looks like:

- overall summary ends in `PASS` or a limited `WARN`
- both Argus sensor smoke tests pass
- `/dev/video0` and `/dev/video1` checks pass
- `nvargus-daemon` is active

### 2. Run True Stereo Full-Pipeline Smoke

```bash
python3 app.py --mode stereo-smoke --run-preflight
```

Override the bounded duration:

```bash
python3 app.py --mode stereo-smoke --run-preflight --duration-seconds 15
```

Profile-specific smoke validation:

```bash
python3 app.py --mode stereo-smoke --run-preflight --profile quality_1080p30
python3 app.py --mode stereo-smoke --run-preflight --profile low_latency_720p60
python3 app.py --mode stereo-smoke --run-preflight --profile headset_preview_720p60
```

What success means:

- preflight passes
- the exact composed stereo runtime pipeline starts
- the pipeline stays healthy for the requested duration
- the pipeline exits cleanly after the bounded run

### 3. Capture A Real Stereo Snapshot Artifact

```bash
python3 app.py --mode stereo-snapshot --run-preflight
```

Capture with the default quality profile:

```bash
python3 app.py --mode stereo-snapshot --run-preflight --profile quality_1080p30
```

Capture with the faster preview-style profile:

```bash
python3 app.py --mode stereo-snapshot --run-preflight --profile low_latency_720p60
```

Write to a specific location:

```bash
python3 app.py --mode stereo-snapshot --run-preflight --output-path /tmp/nevex_stereo_snapshot.jpg
```

Expected result:

- preflight passes
- one JPEG is written
- the JPEG contains the side-by-side stereo composite from both cameras
- the runtime prints a post-run summary including:
  - output path
  - file size in bytes and MB
  - capture timestamp
  - image dimensions when readable

Emit a machine-readable artifact summary:

```bash
python3 app.py --mode stereo-snapshot --run-preflight --json
```

### 3.5. Capture One Preview Pair For The XR Preview Bridge

```bash
python3 app.py --mode stereo-preview-frame --run-preflight --profile headset_preview_720p60 --json
```

Expected result:

- preflight passes when requested
- one left-eye JPEG and one right-eye JPEG are written into `output_directory`
- stdout returns a JSON payload describing both preview files, their sizes, and dimensions
- this mode is meant for the sender/bridge pull loop, not as a user-facing artifact mode

### 3.6. Start The Persistent XR Preview Publisher

```bash
python3 app.py --mode stereo-preview-publisher --run-preflight --profile headset_preview_720p60 --preview-publish-fps 5 --json
```

Expected result:

- preflight passes when requested
- one warm Jetson-owned preview pipeline stays active instead of relaunching per frame
- stdout emits framed status/frame metadata for the local sender bridge
- when the sender supplies `--preview-shm-path`, `--preview-shm-slot-count`, and `--preview-shm-slot-size-bytes`, preview frame bytes are written into a shared-memory ring buffer instead of being carried inline on stdout
- small status/frame metadata remains machine-readable, but the large left/right JPEG payloads live in shared memory
- the sender lazily reads only the selected slot when it is ready to forward the next frame, rather than copying preview bytes eagerly on every metadata event
- when the sender runs with `--image-mode binary_frame`, those JPEG bytes can be forwarded to XR as binary WebSocket `stereo_frame` messages without `base64` or `data:` URL string materialization
- stop the publisher with `Ctrl+C` when running it manually
- this mode is intended for the local sender bridge, not for direct human inspection in a terminal

### 4. Record A Real Stereo Video Artifact

```bash
python3 app.py --mode stereo-record --run-preflight
```

Use the dedicated recording profile:

```bash
python3 app.py --mode stereo-record --run-preflight --profile record_1080p30
```

Override duration:

```bash
python3 app.py --mode stereo-record --run-preflight --duration-seconds 12
```

Write to a specific file:

```bash
python3 app.py --mode stereo-record --run-preflight --output-path /tmp/nevex_stereo_record.mkv
```

Expected result:

- preflight passes
- the composed stereo pipeline starts
- a bounded video file is written
- the file exists and is non-empty after completion
- the runtime prints a post-run summary including:
  - output path
  - file size in bytes and MB
  - capture timestamp
  - container, codec, duration, and dimensions when discoverable

Emit a machine-readable artifact summary:

```bash
python3 app.py --mode stereo-record --run-preflight --json
```

### 5. Legacy-Compatible Timed Test Mode

Headless bounded validation:

```bash
python3 app.py --mode stereo-test --run-preflight
```

Timed file-output validation:

```bash
python3 app.py --mode stereo-test --run-preflight --output-mode file --duration-seconds 15
```

### 6. Continuous Headless Runtime

```bash
python3 app.py --mode headless --run-preflight
```

Headless profile examples:

```bash
python3 app.py --mode headless --run-preflight --profile quality_1080p30
python3 app.py --mode headless --run-preflight --profile low_latency_720p60
python3 app.py --mode headless --run-preflight --profile headset_preview_720p60
```

If you prefer config-driven startup validation, set:

```json
"run_preflight_on_start": true
```

Then a normal runtime launch will preflight first:

```bash
python3 app.py --mode headless
```

## Common Commands

From the repo root without changing directories:

```bash
python3 jetson_runtime/app.py --list-modes
python3 jetson_runtime/app.py --list-profiles
python3 jetson_runtime/app.py --describe-profile low_latency_720p60
python3 jetson_runtime/app.py --show-effective-config --profile headset_preview_720p60
python3 jetson_runtime/app.py --show-system-summary
python3 jetson_runtime/app.py --mode preflight
python3 jetson_runtime/app.py --mode preflight --profile low_latency_720p60
python3 jetson_runtime/app.py --mode stereo-smoke --run-preflight
python3 jetson_runtime/app.py --mode stereo-smoke --run-preflight --profile headset_preview_720p60
python3 jetson_runtime/app.py --mode stereo-snapshot --run-preflight
python3 jetson_runtime/app.py --mode stereo-record --run-preflight --profile record_1080p30
python3 jetson_runtime/app.py --mode headless --run-preflight
```

Print the resolved pipeline without starting it:

```bash
python3 app.py --mode stereo-smoke --dry-run
python3 app.py --mode stereo-smoke --dry-run --profile low_latency_720p60
python3 app.py --mode stereo-smoke --dry-run --profile low_latency_720p60 --show-effective-config
python3 app.py --mode stereo-snapshot --dry-run
python3 app.py --mode stereo-record --dry-run --profile record_1080p30
```

Write Python runtime logs to a file:

```bash
python3 app.py --mode stereo-record --run-preflight --profile record_1080p30 --log-file /tmp/nevex_runtime.log
```

## Artifact Naming And Inspection

By default, artifacts are written under `output_directory` from the config:

- preview bridge pairs:
  `stereo_preview_<profile>_left.jpg` and `stereo_preview_<profile>_right.jpg`
  these are used by the one-shot `stereo-preview-frame` diagnostic mode; the persistent
  `stereo-preview-publisher` keeps preview frames in-memory and does not churn per-frame files
- snapshots:
  `stereo_snapshot_YYYYMMDD_HHMMSS.jpg`
- recordings:
  `stereo_capture_YYYYMMDD_HHMMSS.<container>`

You can override artifact location directly with `--output-path`.

After a successful artifact-producing run, the runtime now prints a summary with:

- artifact path
- file size in bytes
- file size in MB
- capture timestamp from the written file
- image dimensions for snapshots when readable from the file
- video container, codec, duration, and dimensions when discoverable for recordings

The runtime also prints an effective runtime summary before launch with:

- selected profile name
- profile type
- profile inheritance when applicable
- left sensor ID
- right sensor ID
- input resolution
- output resolution
- FPS
- output mode
- duration

Video metadata discovery order:

1. `ffprobe`, if available
2. `gst-discoverer-1.0`, if available
3. filesystem-only fallback if neither tool is present or parsing fails

## Failure Interpretation

If validation fails, start here:

- missing `gst-launch-1.0`:
  install or fix the GStreamer runtime tools
- missing `nvarguscamerasrc`:
  verify the Jetson camera stack and plugin availability with `gst-inspect-1.0`
- `nvargus-daemon` inactive:
  restart the daemon and rerun preflight
- missing `/dev/video0` or `/dev/video1`:
  re-check camera cabling, Jetson-IO, and enumeration
- Argus sensor smoke test failure:
  verify the configured `sensor-id` mapping with the known-good single-camera
  pipeline
- composed stereo smoke failure:
  compare the runtime-generated command with the manually verified stereo command
- missing or empty artifact:
  inspect output permissions, encoder availability, and GStreamer stderr from the
  run logs
- partial artifact metadata:
  install `ffprobe` or `gst-discoverer-1.0` if richer media reporting is needed
- missing or incompatible profile:
  verify the requested `--profile` name and confirm the profile output geometry is valid for side-by-side stereo

## Design Notes

The structure remains additive and modular:

- `config.py` owns config loading and validation
- `runtime_profiles.py` owns named profile resolution, inheritance, and default-profile handling
- `introspection.py` owns CLI-readable mode, profile, config, and system summaries
- `preflight.py` owns environment and sensor-level checks
- `preview_capture.py` owns the first Jetson-authored preview-pair capture path used by the XR preview bridge
- `preview_publisher.py` owns the persistent Jetson preview publisher that keeps one preview pipeline warm and emits synchronized left/right preview events for the sender bridge
- `preview_shared_memory.py` owns the shared-memory slot writer used by the persistent preview publisher
- `preview_stream_protocol.py` owns the small framed control/wakeup protocol used between the persistent preview publisher and the local sender bridge
- the sender-side shared-memory transport now uses lazy slot reads plus reusable scratch buffers to reduce per-frame allocation churn while preserving the same `stereo_frame` contract
- the XR-side binary preview transport now reconstructs `blob:` URLs from raw JPEG bytes so the optimized preview path no longer depends on `base64`/`data:` URL materialization
- `pipeline_builder.py` owns dedicated stereo smoke, stereo snapshot, and stereo
  record pipeline builders
- `artifact_inspector.py` owns post-run artifact inspection and reporting
- `pipeline_runner.py` owns process lifecycle, artifact validation, and summary emission
- `app.py` stays the CLI entrypoint and orchestration layer

This keeps future expansion clean:

- stereo display output
- thermal overlay
- AI bounding boxes
- XR transport

Those are still intentionally out of scope for this pass.

## Current Assumptions And Limits

- this runtime still uses `subprocess` and `gst-launch-1.0`
- profiles currently resolve to one effective config before runtime start rather than hot-switching mid-run
- standalone introspection commands support `--json`, but mixed introspection-plus-runtime execution stays human-readable only
- preflight still validates per-sensor Argus health, not stereo sync quality
- `stereo-smoke` validates runtime stability, not calibration correctness
- `stereo-preview-frame` remains useful as a one-shot proof-of-life and fallback diagnostic mode
- `stereo-preview-publisher` keeps preview ownership on Jetson and removes per-frame Python process startup; with shared-memory transport enabled, only small control metadata crosses stdout while JPEG frame bytes live in a ring buffer
- the current optimized sender path still copies bytes once from the shared-memory ring buffer into Node-managed memory before the outbound WebSocket message is written
- the additive `binary_frame` mode removes the dominant `base64`/`data:` URL string materialization cost, but true end-to-end zero-copy is still not practical in the current JS/TS runtime because the sender and browser each still materialize transport-owned byte containers on their side of the WebSocket boundary
- snapshot inspection reads dimensions from the written file using standard-library parsing
- recording inspection depends on `ffprobe` or `gst-discoverer-1.0` for richer
  metadata and falls back gracefully when those tools are not available
- artifact validation and inspection do not judge perceptual image quality
- no thermal, AI, or XR transport logic has been added yet
