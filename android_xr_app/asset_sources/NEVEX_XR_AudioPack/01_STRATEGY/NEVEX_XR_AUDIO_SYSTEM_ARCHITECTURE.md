# NEVEX XR Audio System Architecture

## Purpose

NEVEX XR audio exists to reinforce awareness, confirm important actions, support navigation, and escalate faults with discipline. It should sound like a mission device, not a game interface.

## Audio Categories

### UI

Purpose:

- confirm lightweight interactions
- support focus movement and toggles

Trigger style:

- passive and confirmatory

Interruption:

- should never interrupt higher-priority sounds

### Detection

Purpose:

- surface high-value detections
- differentiate ordinary detections from higher-confidence or reacquired targets

Trigger style:

- advisory to high-value advisory

Interruption:

- may duck low-level UI
- should yield to urgent warnings

### Navigation

Purpose:

- reinforce heading correction, waypoint logic, route changes, and return-path behavior

Trigger style:

- advisory

Interruption:

- should not interrupt urgent warnings
- can suppress passive UI cues when active

### Warnings

Purpose:

- convey faults, safety-relevant problems, and urgent system states

Trigger style:

- urgent

Interruption:

- warnings should interrupt lower-priority audio

### System State

Purpose:

- boot, shutdown, link state, calibration results, readiness state

Trigger style:

- confirmatory to advisory

Interruption:

- usually duck low-level UI

### Capture / Playback

Purpose:

- confirm photo, record, playback, review actions

Trigger style:

- confirmatory

Interruption:

- should stay below warnings and navigation alerts

### Mode / Readiness

Purpose:

- communicate readiness and state transitions such as standby or blackout

Trigger style:

- confirmatory or advisory depending on state

Interruption:

- higher than low-level UI, lower than urgent faults

## Global Behavior

The audio system should be layered, sparse, and rate-limited. Visual information remains primary. Audio adds confidence and urgency only where it improves performance.

## System Design Rules

- do not narrate routine state changes
- do not duplicate every visual change with sound
- keep confirmations short
- keep navigation cues recognizable but not annoying
- keep warnings unmistakable
- keep low-signature and silent behavior available
