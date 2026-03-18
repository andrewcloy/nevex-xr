# NEVEX XR Audio Handoff

## What this pack contains

- production-oriented XR audio system strategy
- priority and ducking model
- mode-aware audio behavior
- runtime audio event model
- machine-readable asset and generation manifests
- procedural WAV generation tooling
- generated audio assets
- preview pages and waveform summaries

## Integration expectations

This pack should be used as the audio foundation for the NEVEX XR app, not as a temporary placeholder library.

## Recommended integration order

1. wire the priority and cooldown system into the audio event layer
2. wire runtime event IDs from `audio_runtime_event_map.json`
3. map generated WAV files through the event manifest, not directly from UI code
4. implement global UI, capture, readiness, and warning cues
5. add mode-aware detection and navigation behavior
6. add low-signature and silent behavior
7. tune volumes in-headset

## Critical guardrails

- do not let UI sounds chatter
- do not play both visual and audio confirmations for everything
- keep warnings rare but unmistakable
- keep navigation cues rate-limited
- keep playback sonically calmer than live operation
- do not let runtime code trigger raw filenames directly

## Boot Screen Note

The pack now includes `nightvision_activate.wav` with runtime event ID `system.nightvision_activate`.

Recommended boot-screen sequence:

1. `system.boot_complete`
2. `system.nightvision_activate`
3. `mode.readiness_ready`

Use `system.nightvision_activate` when the visual night-vision channel actually comes online, not merely when the app process starts.
