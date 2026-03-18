# NEVEX XR Mode Hierarchy Handoff

## Purpose

This handoff explains how the Android XR implementation should combine:

- the stable 4-layer interface model
- the stable 7-category menu backbone
- the new mission-aware operational mode layer

## Core Implementation Rule

Do not build separate apps or separate top-level menu trees for each mode.

Instead:

- keep the 4-layer structure stable
- keep the 7-category backbone stable
- let operational modes change emphasis, defaults, quick tools, HUD behavior, alerts, capture logic, and navigation support

## Required Mental Model

- `backbone categories` = where settings live
- `operational modes` = what the headset prioritizes

The user should always know where `Vision`, `Thermal`, `Capture`, `Playback`, `Device`, `System`, and `Advanced` live. But the same categories should feel different depending on whether the headset is being used for threat detection, hunting, inspection, patrol, or review.

## Recommended User Flow

`Boot / Readiness` -> `Main Mode Select` -> selected operational mode -> `Live HUD`, `Quick Menu`, `Mode Tools`, `Deep Settings`

Recommended mode select entries:

- `Military / Threat`
- `Hunting / Game`
- `Inspection / Search`
- `Navigation / Patrol`
- `Review / Playback`
- `Profiles / Presets`
- `Global Settings`

## Mode Behavior Summary

### Military / Threat

- emphasize `Vision`, `Thermal`, `Capture`
- quick tools should prioritize thermal blend, threat sensitivity, overlay discipline, record, blackout
- HUD should emphasize threat markers, heading, record, battery, current mode

### Hunting / Game

- emphasize `Vision`, `Thermal`, `Capture`
- quick tools should prioritize zoom, thermal toggle, prey sensitivity, snapshot or record
- HUD should emphasize prey markers, heading, battery, clean outdoor overlays

### Inspection / Search

- emphasize `Vision`, `Thermal`, `Capture`
- quick tools should prioritize edge enhancement, capture, annotation, breadcrumb support
- HUD should emphasize zoom, annotation state, mode, battery

### Navigation / Patrol

- emphasize `Vision`, `Capture`, `System`
- quick tools should prioritize compass, waypoint, route or breadcrumb, event mark
- HUD should emphasize heading, waypoint, route cues, battery, current mode

### Review / Playback

- emphasize `Playback`, `Capture`
- quick tools should prioritize recent, filter, scrub, protect, export, delete
- UI should shift away from scene-first operation into review-first controls

## Navigation Rule

Navigation is not a separate top-level backbone category in this revision. Treat it as a cross-cutting platform capability that appears through:

- `Vision` overlays
- quick tools
- mode tools
- `Capture` event marks
- `Playback` route review
- `System` preferences

## Screen And Panel Guidance

### Keep stable

- `live_hud_minimal`
- compact `quick_menu`
- seven-category `main_menu`

### Reinterpret through modes

- `quick_controls_strip` -> changes ordering and surfaced tools by mode
- `sensor_fusion_panel` -> shared settings, but different defaults by mode
- `thermal_panel` -> always under `Thermal`, but emphasized differently by mode
- `low_light_panel` -> always under `Vision`, but tuned differently by mode
- `device_status_panel` -> stable under `Device`

### Continue to revise

- `record_playback_panel` -> keep split into `capture_panel` and `playback_panel`
- `live_hud_expanded` -> treat as temporary contextual HUD, never the normal state

## Android XR Build Priority

1. implement stable `Live HUD`
2. implement mode-aware `Quick Menu`
3. implement stable seven-category `Main Menu`
4. implement mode switching and persistence
5. connect mode defaults to `Vision`, `Thermal`, `Capture`, and navigation overlay behavior
6. implement `Playback` mode and route review
7. wire `Advanced` last

## Most Important Warning

Do not let operational modes become a second menu architecture. If integration creates both:

- a stable seven-category menu
- and a separate mode-specific menu tree

the product will become confusing. Modes should alter emphasis and defaults, not replace structure.
