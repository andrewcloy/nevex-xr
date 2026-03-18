# NEVEX XR Menu Architecture

## Purpose

This document defines the production-oriented XR menu hierarchy for NEVEX XR. It keeps the visual language already locked in place, but turns the package into a clearer operational system with a shallow navigation model and stronger separation between live use, occasional adjustment, and expert/service behavior.

## Architecture Summary

NEVEX XR should use four layers:

1. `Layer 1 - Live HUD`
2. `Layer 2 - Quick Menu`
3. `Layer 3 - Main Menu`
4. `Layer 4 - Advanced / Service`

The user should spend almost all active time in `Layer 1`, briefly visit `Layer 2`, occasionally use `Layer 3`, and only deliberately enter `Layer 4`.

## Stable Backbone, Mode-Aware Behavior

The 4-layer system and 7-category main menu are the stable backbone of NEVEX XR. They should not be replaced by mission modes.

Instead:

- the backbone provides structural consistency
- operational modes provide mission-specific emphasis

That means the user should still know where `Vision`, `Thermal`, `Capture`, `Playback`, `Device`, `System`, and `Advanced` live regardless of mission. What changes by mode is:

- which quick tools surface first
- which overlays are shown by default
- which alerts are emphasized or suppressed
- which task paths become shortest
- which categories feel visually primary

## Mode Hierarchy

Recommended top-level operational flow:

`Boot / Readiness` -> `Main Mode Select` -> selected operational mode -> `Live HUD`, `Quick Menu`, `Main Menu`, `Advanced / Service`

Recommended mode select entries:

- `Military / Threat`
- `Hunting / Game`
- `Inspection / Search`
- `Navigation / Patrol`
- `Review / Playback`
- `Profiles / Presets`
- `Global Settings`

The operational modes are not extra backbone categories. They are mission presets layered over the stable architecture.

## Layer 1 - Live HUD

### Purpose

Provide only the information needed at a glance during operation.

### Persistent elements

- battery state
- record state
- current view mode
- zoom state
- link state only if degraded or operationally relevant

### Contextual elements

- detection boxes and target cues only when enabled
- warning or critical chips only when active
- recenter hint only when orientation or alignment status makes it relevant

### Explicit exclusions

Do not persistently show:

- storage
- FPS
- latency
- diagnostics
- profiles
- calibration tools
- full connectivity breakdowns
- long text labels

## Layer 2 - Quick Menu

### Purpose

Provide the fastest live-use controls without becoming a mini settings app.

### Recommended quick menu contents

- `brightness`
- `gain_exposure`
- `zoom`
- `view_mode`
- `thermal_blend`
- `record`
- `overlay_level`
- `standby_blackout`

### Why this set

- These controls map directly to likely live tasks.
- They affect the user's immediate perception or recording state.
- They can be understood quickly without entering broader settings categories.

### Mode-aware quick menu rule

The quick menu composition stays limited, but the ordering and one or two mission-specific entries may shift by operational mode.

Examples:

- `Military / Threat` can elevate `threat_sensitivity`
- `Hunting / Game` can elevate `prey_sensitivity` or `snapshot_record`
- `Inspection / Search` can elevate `annotation`
- `Navigation / Patrol` can elevate `compass_toggle` or `route_breadcrumb_toggle`
- `Review / Playback` can swap into review controls rather than live controls

### What does not belong here by default

- profiles
- diagnostics
- network settings
- storage management
- full playback browser
- calibration
- firmware or service items

### Recommended behavior

The quick menu should open as a compact strip or compact panel, not as a dense tile grid. It should allow direct action or one follow-on control only. Example: selecting `gain_exposure` opens a small two-control subpanel rather than a full page of camera tuning.

## Layer 3 - Main Menu

### Top-level categories

Use these seven categories as the default production shell:

- `Vision`
- `Thermal`
- `Capture`
- `Playback`
- `Device`
- `System`
- `Advanced`

Do not expand beyond these without a strong user-task justification.

## Category Definitions

### Vision

This is the primary image presentation area for non-thermal visual behavior.

Put here:

- brightness
- contrast
- gain
- exposure
- focus assist if user-facing
- zoom behavior
- edge enhancement
- view mode switching for low-light and fusion presentation
- overlay options such as reticle, compass, horizon, and detection visibility

Rationale:

These are the controls most tightly connected to what the user is seeing right now.

### Thermal

This is the dedicated thermal behavior area. It should hold all thermal-only logic so thermal does not compete with every other image control at the same level.

Put here:

- thermal enable/disable
- blend amount
- palette selection
- hotspot emphasis
- thermal intensity
- thermal overlay tuning
- thermal-specific target behavior if needed

Rationale:

Thermal is important, but it is a specialist mode family with its own logic and vocabulary.

### Capture

This is the content creation area.

Put here:

- photo capture defaults
- video recording defaults
- record quality and clip behavior
- media metadata overlays
- auto-record behavior
- export queue initiation if tied to capture flow

Rationale:

Creating media and tuning how media is created is a different intent from reviewing old captures.

### Playback

This is the media review area.

Put here:

- recent captures
- session review
- filter by type
- favorite
- delete
- review details
- export and share queue

Rationale:

Playback is a browse-and-review task, not a live operational task, and should not be mixed with active recording controls.

### Device

This is the headset hardware and local device health area.

Put here:

- battery details
- storage state
- sensor presence and health summaries
- display fit or user-facing alignment utilities
- input pairing
- local device status

Keep out of `Device`:

- platform-wide privacy and account settings
- advanced diagnostics
- calibration flows intended for service or setup

Rationale:

`Device` answers: how is the headset itself doing right now?

### System

This is the global app/platform behavior area.

Put here:

- network
- Bluetooth
- profiles
- notifications
- privacy
- language
- general UI settings
- date/time if needed

Rationale:

`System` answers: how is the software environment configured?

### Advanced

This is the intentional expert/service layer.

Put here:

- calibration
- stream diagnostics
- render diagnostics
- latency metrics
- sensor debug
- firmware/service
- developer toggles
- recovery tools
- import/export config

Rationale:

These items matter, but routine users should not trip over them during normal operation.

## Main Menu Panel Model

### Recommended presentation

Use a labeled tile menu or labeled list of large category cards. Limit the visible set to the seven top-level categories. Icons support recognition, but labels carry meaning.

### Layout guidance

- 2-column grid or stacked card list
- no more than 6 to 7 visible category targets at once without scrolling
- category tile must show both icon and label
- optional one-line helper text is acceptable in the main menu, but not required in every submenu

### Mode emphasis inside the main menu

Operational modes may visually emphasize certain categories, but they must not reorder the entire product into a new information architecture.

Examples:

- `Military / Threat` emphasizes `Vision`, `Thermal`, and `Capture`
- `Hunting / Game` emphasizes `Vision`, `Thermal`, and `Capture`
- `Inspection / Search` emphasizes `Vision`, `Thermal`, and `Capture`
- `Navigation / Patrol` emphasizes `Vision`, `Capture`, and `System`
- `Review / Playback` emphasizes `Playback` and `Capture`

## Layer 4 - Advanced / Service

### Entry behavior

`Advanced` should be present but visually quieter than the other top-level categories. It should not look equally inviting to `Vision` or `Capture`.

### Internal grouping

Split `Advanced` into:

- `Calibration`
- `Diagnostics`
- `Service`
- `Recovery`
- `Developer`

This avoids a giant expert-only list and makes troubleshooting faster.

## Screen Consolidation Recommendations

Keep:

- `live_hud_minimal`
- `quick_controls_strip`
- `sensor_fusion_panel`
- `thermal_panel`
- `low_light_panel`
- `device_status_panel`
- `calibration_panel`
- `diagnostics_panel`

Revise:

- `live_hud_expanded` -> reinterpret as `live_hud_contextual`, temporary and situational rather than a denser default HUD
- `record_playback_panel` -> split into `capture_panel` and `playback_panel`
- `profile_select_panel` -> position under `System`
- `connectivity_panel` -> position under `System`, with concise status surfaces elsewhere

### Mode-oriented reinterpretation

- `quick_controls_strip` -> stable quick layer whose ordering changes by operational mode
- `sensor_fusion_panel` -> shared settings panel with different defaults by mode
- `detection_panel` -> contextual emphasis tool, not a front-door category
- `device_status_panel` -> stable under `Device` across all modes

## Architecture Rationale

This model works for XR because it keeps the number of mental buckets small:

- live things stay near the scene
- common controls stay in quick access
- broad configuration lives in a simple, labeled main menu
- expert tasks are separated from routine use

That makes the product faster under pressure, easier to learn, and less likely to decay into a dense floating control dashboard.
