# NEVEX XR Task Paths

## Purpose

These task paths validate whether the menu hierarchy is genuinely XR-usable. Frequent operational tasks should take one step or two steps maximum.

## Task Path Rules

- if a task is done often during live use, it should be reachable from the quick menu or directly from live controls
- if a task is occasional, it can live in the main menu
- if a task is rare, risky, or diagnostic, it belongs in `Advanced`
- if a task changes priority by mission, operational mode should change its quick-path status without moving its deep settings location

## Primary Live Tasks

### Quickly adjust brightness

Recommended path:

`Live HUD` -> `Quick Menu` -> `Brightness`

Step count:

- 2 steps

### Quickly adjust gain or exposure

Recommended path:

`Live HUD` -> `Quick Menu` -> `Gain / Exposure`

Step count:

- 2 steps

### Switch view mode

Recommended path:

`Live HUD` -> `Quick Menu` -> `View Mode`

Step count:

- 2 steps

### Toggle or tune thermal overlay

Recommended path for fast change:

`Live HUD` -> `Quick Menu` -> `Thermal Blend`

Recommended path for deeper change:

`Live HUD` -> `Main Menu` -> `Thermal`

Step count:

- 2 steps for fast blend adjustment
- 2 steps to enter the thermal settings area

### Start or stop recording

Recommended path:

`Live HUD` -> `Quick Menu` -> `Record`

Alternative:

- direct dedicated capture control if hardware mapping exists

Step count:

- 2 steps

### Capture a photo

Recommended path:

`Live HUD` -> `Quick Menu` -> `Record` secondary capture option

Alternative path:

`Live HUD` -> `Main Menu` -> `Capture`

Design note:

Snapshot should not require hunting through playback or system settings.

### Zoom in or out

Recommended path:

`Live HUD` -> `Quick Menu` -> `Zoom`

Step count:

- 2 steps

### Hide or reduce overlays

Recommended path:

`Live HUD` -> `Quick Menu` -> `Overlay Level`

Step count:

- 2 steps

### Enter standby or blackout mode

Recommended path:

`Live HUD` -> `Quick Menu` -> `Standby / Blackout`

Step count:

- 2 steps

## Mode-Aware Task Priority Changes

The stable backbone remains the same, but certain tasks should become shorter or more visually emphasized depending on operational mode.

### Military / Threat

Fastest tasks should be:

- brightness
- gain or exposure
- thermal blend
- threat sensitivity
- overlay level
- record
- waypoint mark or return cue

### Hunting / Game

Fastest tasks should be:

- brightness
- gain
- zoom
- thermal toggle or blend
- prey sensitivity
- snapshot or record
- trail-back

### Inspection / Search

Fastest tasks should be:

- brightness
- gain or exposure
- zoom
- edge enhancement
- annotation
- capture
- breadcrumb toggle

### Navigation / Patrol

Fastest tasks should be:

- overlay density
- compass
- waypoint toggle
- route or breadcrumb toggle
- event mark
- thermal assist

### Review / Playback

Fastest tasks should be:

- recent review
- filter
- scrub
- tagged event jump
- protect or favorite
- export

## Secondary Routine Tasks

### Review the latest capture

Recommended path:

`Live HUD` -> `Main Menu` -> `Playback` -> `Recent`

Step count:

- 3 steps

Reason:

This is not usually an under-pressure live task, so it can sit in the main menu.

Mode exception:

- in `Review / Playback`, the user can enter directly through mode selection or a fast return-to-review path

### Check battery or storage

Recommended path:

`Live HUD` -> `Main Menu` -> `Device`

Step count:

- 2 steps

### Change profile

Recommended path:

`Live HUD` -> `Main Menu` -> `System` -> `Profiles`

Step count:

- 3 steps

Reason:

Profiles are important, but they should not compete with immediate live image controls in the quick menu.

Mode note:

- profiles and operational modes are related but distinct
- operational mode affects mission behavior
- profiles or presets belong under `System`

### Change network or pairing settings

Recommended path:

`Live HUD` -> `Main Menu` -> `System` -> `Connectivity`

Step count:

- 3 steps

## Rare Or Expert Tasks

### Enter calibration

Recommended path:

`Live HUD` -> `Main Menu` -> `Advanced` -> `Calibration`

Step count:

- 3 steps

### Access diagnostics

Recommended path:

`Live HUD` -> `Main Menu` -> `Advanced` -> `Diagnostics`

Step count:

- 3 steps

### Use recovery tools

Recommended path:

`Live HUD` -> `Main Menu` -> `Advanced` -> `Recovery`

Step count:

- 3 steps

## Path Quality Check

The hierarchy is healthy if:

- live image tasks stay within the quick layer
- broad system tasks start from a small main menu
- advanced tasks are obvious to find but never forced into routine operation
- mission modes shorten the right tasks without creating new top-level menu chaos

The hierarchy is unhealthy if:

- brightness, zoom, and record require main menu navigation
- profiles, diagnostics, and network appear in quick controls
- playback and capture are merged again
- the HUD begins duplicating menu content
- operational modes create separate menu trees instead of mode-aware behavior
