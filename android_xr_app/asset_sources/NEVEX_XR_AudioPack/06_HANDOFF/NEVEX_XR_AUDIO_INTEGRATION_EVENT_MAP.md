# NEVEX XR Audio Integration Event Map

## Purpose

This file tells the Android XR integration agent how to connect runtime app events to the audio pack.

## Use This Manifest

Primary machine-readable source:

- `02_MANIFESTS/audio_runtime_event_map.json`

Primary strategy source:

- `01_STRATEGY/NEVEX_XR_AUDIO_EVENT_MODEL.md`

## Integration Rule

Do not trigger audio by filename from UI code.

Instead:

- app code emits `event_id`
- audio middleware resolves policy
- middleware selects the mapped asset

## Example Flow

1. UI or service emits:

   - `capture.record_start`
   - `nav.waypoint_arrival`
   - `alert.low_battery`
   - `system.nightvision_activate`

2. Middleware reads event metadata:

   - priority
   - bus
   - cooldown group
   - mode behavior
   - silent and low-signature behavior
   - interrupt policy

3. Middleware decides whether to play, suppress, duck, or defer.

## Suggested Android XR Middleware Shape

Recommended inputs:

- `eventId`
- `operationalMode`
- `signatureMode`
- `screenState`
- `context`

Recommended `signatureMode` values:

- `normal`
- `low_signature`
- `silent`

Recommended `operationalMode` values:

- `military_threat`
- `hunting_game`
- `inspection_search`
- `navigation_patrol`
- `review_playback`

## Required Middleware Behaviors

### Cooldown enforcement

Cooldowns should be centralized and keyed by `cooldown_group`.

### Priority-aware ducking

Respect the hierarchy already defined in the pack:

- critical faults highest
- urgent alerts next
- detections next
- navigation next
- capture/system confirms next
- UI lowest

### Mode-aware suppression

Examples:

- suppress most prey cues outside `hunting_game`
- suppress review transport sounds during live operational modes unless the user explicitly enters playback
- suppress or reduce nonessential confirms in `military_threat` low-signature behavior

### Visual dependency checks

Events tagged as highly visually redundant should be easiest to suppress when the scene is already clear.

## Recommended First Integration Pass

Wire these first:

- `ui.confirm`
- `ui.back`
- `capture.photo`
- `capture.record_start`
- `capture.record_stop`
- `alert.warning`
- `alert.critical_fault`
- `alert.low_battery`
- `system.link_disconnect`
- `system.link_reconnect`
- `system.nightvision_activate`
- `nav.waypoint_set`
- `nav.waypoint_arrival`

Then add:

- detection events
- mode-state transitions
- playback transport events
- low-signature and silent behavior

## Most Important Warning

The biggest audio integration mistake would be treating every event as always playable. This pack is designed to be filtered by:

- priority
- cooldown
- mode
- signature state
- visual redundancy

If those rules are ignored, the headset will become noisy very quickly.

## Boot-Screen Hook

For the classic night-vision startup feel:

- trigger `system.boot_complete` for the general system startup signature
- trigger `system.nightvision_activate` when the imaging feed visually powers on
- trigger `mode.readiness_ready` only when boot is complete and the user can enter live view
