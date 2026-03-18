# NEVEX_XR_AudioPack

This package is a production-oriented XR audio handoff pack for NEVEX. It defines the audio system architecture, priority hierarchy, sound design language, operational mode behavior, machine-readable manifests, procedural synthesis tooling, generated WAV assets, preview materials, and handoff guidance.

## What this pack is for

The pack is designed for a serious advanced-vision headset rather than a game UI. The sounds are intended to:

- confirm actions without clutter
- support situational awareness
- surface high-value detections
- support navigation and mission flow
- escalate warnings professionally
- remain sparse and headset-safe

## Pack layout

- strategy docs: `01_STRATEGY`
- manifests: `02_MANIFESTS`
- generated WAV assets: `03_ASSETS/audio`
- preview pages and waveform summaries: `04_PREVIEW`
- generation tooling: `05_TOOLS`
- integration handoff docs: `06_HANDOFF`

## Audio defaults

- sample rate: 48 kHz
- bit depth: 16-bit PCM WAV
- channels: stereo
- generation path: procedural Python synthesis

## Rerun

Windows:

```powershell
cd "c:\Users\acloy\Desktop\NEVEX_XR_AudioPack\05_TOOLS"
python generate_audio_pack.py
python build_audio_preview.py
```

## Start here

Read these first:

- `01_STRATEGY/NEVEX_XR_AUDIO_SYSTEM_ARCHITECTURE.md`
- `01_STRATEGY/NEVEX_XR_AUDIO_DESIGN_LANGUAGE.md`
- `01_STRATEGY/NEVEX_XR_AUDIO_PRIORITY_AND_MIXING.md`
- `01_STRATEGY/NEVEX_XR_MODE_AWARE_AUDIO_MODEL.md`
- `01_STRATEGY/NEVEX_XR_AUDIO_EVENT_MODEL.md`
- `06_HANDOFF/NEVEX_XR_AUDIO_HANDOFF.md`
