# NEVEX XR Audio Event Model

## Purpose

This document defines how the generated audio pack should be consumed by the runtime audio layer in the Android XR project. The WAV files are not enough on their own. The app also needs stable event IDs, routing rules, cooldown behavior, and suppression logic.

## Core Rule

The runtime should trigger `event IDs`, not raw filenames.

That gives the app:

- stable integration contracts
- swap-friendly assets later
- mode-aware behavior without changing call sites
- central cooldown and suppression logic

## Runtime Audio Layers

Recommended runtime buses:

- `master`
- `critical_alerts`
- `alerts`
- `detections`
- `navigation`
- `capture_system`
- `ui`
- `playback`

Recommended priority relationship:

- `critical_alerts` sits highest
- `alerts` below critical
- `detections` below urgent warnings
- `navigation` below detections
- `capture_system` below navigation
- `ui` lowest
- `playback` can share lower-priority behavior with `capture_system` but should stay calmer

## Event Model Structure

Each runtime event should define:

- `event_id`
- `asset_id` or filename
- `priority`
- `bus`
- `cooldown_group`
- `cooldown_ms`
- `mode_behavior`
- `silent_mode_behavior`
- `low_signature_behavior`
- `visual_dependency`
- `interrupt_policy`

## Global Event Rules

### 1. Runtime calls event IDs

Example:

- good: `audio.trigger("nav.waypoint_arrival")`
- avoid: `play("waypoint_arrival.wav")`

### 2. Cooldowns are enforced centrally

The runtime audio layer should own cooldown enforcement. UI code should not manually debounce sounds in scattered places.

### 3. Mode emphasis is applied by policy, not duplicate event trees

The same event can behave differently by operational mode:

- enabled
- suppressed
- rate-limited more aggressively
- routed at lower gain
- replaced later with an alternate cue if needed

### 4. Visual-first events may stay silent when redundant

Some events should only play if they add value beyond what the user already sees.

Examples:

- repeated focus shifts
- repeated low-confidence detections
- repeated heading ticks when route is stable

### 5. Faults remain globally protected

Critical faults should survive silent-adjacent behavior unless the product explicitly supports a hard-silent diagnostic exception.

## Recommended Event Families

### UI

- `ui.click_soft`
- `ui.back`
- `ui.focus_shift`
- `ui.toggle_on`
- `ui.toggle_off`
- `ui.confirm`
- `ui.dismiss`

### Mode And Readiness

- `mode.readiness_ready`
- `mode.readiness_limited`
- `mode.readiness_fault`
- `mode.standby_enter`
- `mode.standby_exit`
- `mode.blackout_enter`
- `mode.blackout_exit`

### System

- `system.boot_complete`
- `system.nightvision_activate`
- `system.shutdown`
- `system.link_reconnect`
- `system.link_disconnect`
- `system.calibration_complete`
- `system.calibration_fail`

### Detection

- `detection.new_target`
- `detection.high_confidence`
- `detection.target_lock`
- `detection.target_lost`
- `detection.prey_detected`
- `detection.prey_reacquire`
- `detection.anomaly_mark`

### Navigation

- `nav.waypoint_set`
- `nav.waypoint_arrival`
- `nav.route_deviation`
- `nav.return_path`
- `nav.heading_adjust`

### Capture

- `capture.photo`
- `capture.record_start`
- `capture.record_stop`

### Playback

- `playback.open`
- `playback.select`

### Alerts

- `alert.warning`
- `alert.critical_fault`
- `alert.low_battery`
- `alert.storage_near_full`
- `alert.sensor_error`

## Cooldown Groups

Recommended cooldown group names:

- `ui_focus`
- `ui_confirm`
- `readiness_state`
- `system_link`
- `detection_general`
- `detection_track`
- `detection_prey`
- `navigation_general`
- `navigation_heading`
- `capture_events`
- `playback_ui`
- `warning_general`
- `critical_faults`

## Silent And Low-Signature Policy

### Silent mode

Default behavior:

- suppress priorities 3 to 5
- allow Priority 0
- allow selected Priority 1 safety warnings

### Low-signature mode

Default behavior:

- reduce gains for priorities 2 to 5
- suppress low-value confirms
- keep detection sparse
- keep navigation minimal and mission-relevant

### Mode interaction

- `Military / Threat` should default closest to low-signature behavior
- `Navigation / Patrol` may allow more navigation cues
- `Review / Playback` can allow calm transport audio without operational urgency

## Visual Dependency Guidance

### Always allowed

- critical faults
- urgent power or sensor warnings
- readiness fault

### Context-dependent

- detection events
- navigation heading cues
- playback selections

### Often suppressible

- focus shifts
- repeated toggles
- redundant route hints

## Middleware Behavior Suggestion

Recommended runtime entry point:

```ts
audioEngine.trigger({
  eventId: "nav.waypoint_arrival",
  mode: "navigation_patrol",
  signatureMode: "normal",
  context: {
    headingErrorDeg: 0,
    routeId: "alpha-01",
  },
});
```

The middleware should then:

1. resolve event metadata
2. decide whether the event is allowed in the current signature mode
3. apply cooldown logic
4. apply ducking and interruption logic
5. route to the correct bus
6. play the mapped asset

## Why This Matters

Without a runtime event model, the pack is just a collection of WAVs. With event IDs and policy mapping, it becomes a real XR audio system that can survive iteration, mode-aware behavior, and future asset replacement.

## Boot-Screen Recommendation

If the product wants the classic night-vision activation feel during startup, use:

1. `system.boot_complete` for the overall system bring-up signature
2. `system.nightvision_activate` when the imaging channel visually comes online
3. `mode.readiness_ready` once the headset is genuinely ready for live use

This keeps the activation sound tied to the visual night-vision transition rather than treating it as a generic chime.
