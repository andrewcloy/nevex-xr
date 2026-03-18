# NEVEX XR Audio Priority And Mixing

## Priority Hierarchy

### Priority 0

- fault or critical warnings
- examples: `critical_fault`, `sensor_error`

Behavior:

- interrupts everything lower
- ducks all lower priorities aggressively

### Priority 1

- safety or urgent system alerts
- examples: `warning_alert`, `low_battery`, `storage_near_full`, `disconnect`, `route_deviation`

Behavior:

- interrupts priorities 3 to 5
- ducks priority 2 if needed

### Priority 2

- high-value detection alerts
- examples: `detection_ping`, `detection_confidence_high`, `target_lock`, `prey_detected`

Behavior:

- ducks low-level UI
- never overrides Priority 0 or 1

### Priority 3

- navigation cues
- examples: `waypoint_set`, `waypoint_arrival`, `return_path`, `heading_adjust`

Behavior:

- ducks priority 5
- yields to Priority 0 to 2

### Priority 4

- capture and system confirmations
- examples: `record_start`, `record_stop`, `capture_photo`, `calibration_complete`, `standby_enter`

Behavior:

- ducks priority 5
- does not interrupt advisory or urgent layers

### Priority 5

- low-level UI interaction sounds
- examples: `ui_click_soft`, `ui_back`, `ui_focus_shift`

Behavior:

- easiest to suppress
- should disappear first in busy situations

## Repetition Control

- repeated detection cues should use cooldown windows
- default detection cooldown guidance: 1.5 to 3.0 seconds per cue family
- repeated navigation cues should be rate-limited to avoid nagging
- route deviation and urgent faults may repeat, but should use controlled intervals

## Ducking Guidance

- Priority 0 ducks everything lower
- Priority 1 ducks priorities 3 to 5
- Priority 2 ducks priority 5
- Priority 3 ducks priority 5 when simultaneous
- Priority 4 may suppress priority 5 when needed

## Silent And Low-Signature Behavior

### Silent mode

- suppress priorities 3 to 5 by default
- allow only Priority 0 and selected Priority 1 alerts

### Low-signature mode

- lower gain on priorities 2 to 5
- suppress nonessential confirmations
- keep critical warnings intact

## Mode Emphasis

- `Military / Threat`: sparse by default, high-confidence alerts only, low-signature friendly
- `Hunting / Game`: optional prey cues, but controlled repetition
- `Inspection / Search`: subtle capture and annotation confirms
- `Navigation / Patrol`: navigation cues become more prominent
- `Review / Playback`: calm transport and review subset

## Loudness Guidance

- normalize outputs conservatively for headset listening
- keep passive cues quieter than navigation and detection
- warnings should be clearly stronger but not painfully louder
- avoid harsh transient peaks
