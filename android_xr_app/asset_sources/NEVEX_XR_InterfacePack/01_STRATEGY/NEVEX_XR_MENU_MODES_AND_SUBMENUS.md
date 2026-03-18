# NEVEX XR Menu Modes And Submenus

## Purpose

This document turns the top-level architecture into concrete submenu behavior. Every panel should answer one clear question and keep visible choices within a manageable XR scan range.

## Interface State Modes

### 1. Live Mode

The user is actively viewing the world. Only the minimal HUD and contextual overlays are present.

Allowed interactions:

- direct capture actions
- quick menu open
- temporary warning acknowledgement
- mode or overlay changes with immediate feedback

### 2. Quick Adjust Mode

The user opens the quick menu to make an in-use change without leaving the operational context.

Behavior:

- small panel or strip
- direct sliders and segmented controls
- no deep nesting
- return to live view immediately after action or timeout

### 3. Browse Settings Mode

The user opens the main menu to enter one of the broad system areas.

Behavior:

- labeled categories
- stable entry points
- broad rather than feature-granular organization

### 4. Advanced / Service Mode

The user deliberately enters calibration, diagnostics, or expert tools.

Behavior:

- visually quieter entry
- explicit sectioning
- stronger confirmation for risky actions
- no accidental overlap with routine live controls

## Operational Mission Modes

The interface state modes above describe the user's interaction state. NEVEX XR also supports operational mission modes that sit above the stable architecture and change behavior without replacing it.

Supported operational mission modes:

- `Military / Threat`
- `Hunting / Game`
- `Inspection / Search`
- `Navigation / Patrol`
- `Review / Playback`

These mission modes affect:

- HUD defaults
- quick tool order and content emphasis
- mode tools
- alert discipline
- navigation exposure
- capture defaults

They do not replace the 7-category menu backbone.

## Main Mode Select

Recommended readiness flow:

`Boot / Readiness` -> `Main Mode Select` -> selected mission mode

Recommended mode select entries:

- `Military / Threat`
- `Hunting / Game`
- `Inspection / Search`
- `Navigation / Patrol`
- `Review / Playback`
- `Profiles / Presets`
- `Global Settings`

## Main Menu Structure

### Vision

Suggested subgroups:

- `Image`
- `Enhancement`
- `Overlays`
- `Mode`

Suggested contents:

#### Image

- brightness
- contrast
- gain
- exposure
- focus assist if user-facing

#### Enhancement

- edge enhancement
- noise reduction if implemented later
- clarity boost if implemented later

#### Overlays

- reticle
- compass
- level or horizon line if applicable
- detection overlay visibility
- overlay density

#### Mode

- low-light view
- fusion view
- navigation-safe view if retained

Design note:

Do not expose every image variable as an equal tile. Use grouped rows or section cards.

### Thermal

Suggested subgroups:

- `Thermal View`
- `Palette`
- `Blend`
- `Hotspot`

Suggested contents:

#### Thermal View

- thermal on/off
- thermal as full view or overlay

#### Palette

- white hot
- black hot
- future palettes if truly needed

#### Blend

- blend amount
- thermal prominence

#### Hotspot

- hotspot emphasis
- thermal alert sensitivity if user-facing

Design note:

Thermal should feel self-contained. Do not scatter thermal options across `Vision`, `System`, and `Device`.

### Capture

Suggested subgroups:

- `Quick Capture`
- `Recording Defaults`
- `Media Metadata`

Suggested contents:

#### Quick Capture

- photo
- video
- record state

#### Recording Defaults

- clip behavior
- quality preset
- auto-record options

#### Media Metadata

- overlay metadata on/off
- timestamp policy if needed

Design note:

The top of `Capture` should prioritize starting and managing current capture behavior. Longer-term media browsing belongs in `Playback`.

### Playback

Suggested subgroups:

- `Recent`
- `Filter`
- `Actions`

Suggested contents:

#### Recent

- latest photo
- latest clip
- last session

#### Filter

- all
- photos
- videos
- flagged items

#### Actions

- favorite
- delete
- export queue

Design note:

Keep playback visually calmer than live operation. It is a review flow, not a flight deck.

### Device

Suggested subgroups:

- `Power`
- `Storage`
- `Sensors`
- `Input And Fit`

Suggested contents:

#### Power

- battery detail
- charging state
- power saving behavior
- standby timeout

#### Storage

- free space
- capture storage location if applicable

#### Sensors

- sensor availability
- thermal sensor state
- link health summary

#### Input And Fit

- controller pairing
- input mode
- user-facing display fit or comfort alignment if appropriate

Design note:

`Device` is for status and local hardware configuration, not engineering diagnostics.

### System

Suggested subgroups:

- `Connectivity`
- `Profiles`
- `Notifications`
- `Privacy And UI`

Suggested contents:

#### Connectivity

- Wi-Fi
- Bluetooth
- Jetson link pairing summary

#### Profiles

- tactical
- hunter
- police_patrol
- search_and_rescue
- recreational

#### Notifications

- alert behavior
- audio or haptic alert policies if applicable

#### Privacy And UI

- language
- date/time
- general interface preferences

Design note:

Profiles belong here because they alter system behavior broadly rather than serving as a high-frequency live control.

### Advanced

Suggested subgroups:

- `Calibration`
- `Diagnostics`
- `Service`
- `Recovery`
- `Developer`

Suggested contents:

#### Calibration

- stereo align
- thermal align
- recenter tools
- guided checks

#### Diagnostics

- stream diagnostics
- render diagnostics
- FPS
- latency
- sensor trace summaries

#### Service

- firmware
- module health
- import/export config

#### Recovery

- reconnect procedures
- safe reset
- fallback tools

#### Developer

- developer toggles
- raw debug overlays

Design note:

If an item sounds like something support staff would ask the user to open during troubleshooting, it probably belongs here.

## Quick Menu Detail

### Recommended quick menu items

- `brightness`
- `gain_exposure`
- `zoom`
- `view_mode`
- `thermal_blend`
- `record`
- `overlay_level`
- `standby_blackout`

### Mode-aware quick menu variants

The quick menu should stay constrained to roughly 6 to 8 items, but operational modes may substitute the last one or two slots.

Examples:

- `Military / Threat` -> `threat_sensitivity` can replace generic `view_mode` secondary behavior
- `Hunting / Game` -> `prey_sensitivity` or `snapshot_record`
- `Inspection / Search` -> `annotation`
- `Navigation / Patrol` -> `compass_toggle` or `route_breadcrumb_toggle`
- `Review / Playback` -> `recent`, `filter`, `scrub`, `protect_favorite`, `export`

### Quick menu item behavior

#### brightness

Direct slider.

#### gain_exposure

Compact two-control flyout or split row. Do not expose a separate top-level tile for both unless testing proves users need that split.

#### zoom

Single slider or stepped controls.

#### view_mode

Segmented control for low-light, fusion, and thermal-linked view options.

#### thermal_blend

Direct slider plus thermal on/off state.

#### record

Single tap toggles recording. Optional secondary action can open capture options.

#### overlay_level

Cycles between minimal, standard, and reduced-off states.

#### standby_blackout

Short path to conceal the display without burying the feature.

## Mode Tools

Mode tools are a small set of mission-specific actions that sit between the quick menu and deep settings. They should never become a second main menu.

### Military / Threat mode tools

- threat sensitivity
- evidence tag
- waypoint mark
- return-to-start cue

### Hunting / Game mode tools

- prey sensitivity
- audible alert
- waypoint mark
- trail-back

### Inspection / Search mode tools

- annotation
- anomaly mark
- breadcrumb toggle
- return path cue

### Navigation / Patrol mode tools

- checkpoint mark
- waypoint cycle
- route toggle
- return-to-origin

### Review / Playback mode tools

- tagged event jump
- route replay
- protect or favorite
- export

## Focus And Interaction Behavior

### Focus rules

- opening quick menu should preserve scene context behind it
- opening main menu should dim or simplify live overlays
- submenu entry should maintain clear back behavior
- avoid multi-hop modal stacks

### Input behavior

- one primary confirm action
- one universal back action
- long-press reserved for advanced alternates, not essential flows

### Return behavior

- quick menu closes back to live view
- main menu returns to previous scene state
- advanced screens should preserve the path back to safety

### Mode-switch behavior

- switching operational modes should preserve the stable location of settings
- the system should announce the new mode clearly but briefly
- mode changes should update defaults, not explode the UI into a new menu tree

## Icons vs Labels

### Icons alone are acceptable for

- repeat-use HUD indicators
- quick menu controls the user learns through repetition
- transient alert chips with strong familiarity

### Icon plus label is required for

- top-level main menu categories
- first-level submenu entries
- destructive actions
- uncommon settings
- advanced and service tools

### Optional helper text is useful for

- `Advanced`
- calibration utilities
- profiles
- export and recovery actions
- mode descriptions during readiness and mode switching

## Density Rules

- prefer 5 to 7 visible rows or actions on a settings panel
- if a panel exceeds 7 meaningful actions, split it into grouped sections
- avoid more than 2 levels below the main menu for routine tasks
- anything deeper than that should be in `Advanced`
