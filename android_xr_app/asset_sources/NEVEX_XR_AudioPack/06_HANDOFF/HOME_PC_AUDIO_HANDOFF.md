# Home PC Audio Handoff

## Purpose

This pack is a reusable procedural audio system for NEVEX XR. It is ready to be copied into the wider project pipeline and iterated later.

## Import targets

- `02_MANIFESTS/audio_asset_manifest.json`
- `02_MANIFESTS/audio_generation_manifest.json`
- `02_MANIFESTS/audio_runtime_event_map.json`
- `03_ASSETS/audio`
- `05_TOOLS`
- `06_HANDOFF`

## Key decisions already made

- WAV is the primary output
- 48 kHz stereo 16-bit PCM is the pack default
- procedural synthesis is the current reliable generation path
- operational modes change emphasis, not the existence of the sound families

## Next implementation agent should do

- map every runtime audio event to `audio_runtime_event_map.json`
- add cooldown and repetition logic from the mixing doc
- connect low-signature and silent behavior
- tune gain staging with real headset listening
- replace individual procedural cues later only if higher-fidelity branded alternatives are needed
