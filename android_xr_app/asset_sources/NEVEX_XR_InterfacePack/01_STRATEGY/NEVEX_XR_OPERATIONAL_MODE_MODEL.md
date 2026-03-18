# NEVEX XR Operational Mode Model

## Purpose

This document adds mission-aware operational behavior on top of the already locked NEVEX XR interface backbone.

The backbone remains:

- `Layer 1 - Live HUD`
- `Layer 2 - Quick Menu`
- `Layer 3 - Main Menu`
- `Layer 4 - Advanced / Service`

The shared main menu backbone also remains:

- `Vision`
- `Thermal`
- `Capture`
- `Playback`
- `Device`
- `System`
- `Advanced`

Operational modes do not replace that structure. They sit above it as mission behavior profiles that change emphasis, defaults, surfaced tools, and task priority.

## Core Product Model

Think about the platform in two parts:

- `menu categories` = stable system structure
- `operational modes` = mission behavior and UI emphasis

That means NEVEX XR should feel like one consistent product, not a different app for every mission type. The user should still know where `Vision`, `Thermal`, or `Device` lives. What changes by mode is what becomes primary, what is suppressed, and which task paths become shortest.

## Top-Level Flow

Recommended high-level flow:

`Boot / Readiness` -> `Main Mode Select` -> chosen operational mode -> `Live HUD`, `Quick Menu`, `Mode Tools`, `Deep Settings`

Recommended mode select entries:

- `Military / Threat`
- `Hunting / Game`
- `Inspection / Search`
- `Navigation / Patrol`
- `Review / Playback`
- `Profiles / Presets`
- `Global Settings`

## Operational Modes

The platform should formally support these mission modes:

### 1. Military / Threat

Purpose:

- detect human threats or suspicious motion and heat
- preserve awareness
- support low-distraction and low-signature use
- keep alerts disciplined
- support tactical navigation assistance

### 2. Hunting / Game

Purpose:

- detect animals or game
- reduce false positives
- support outdoor spotting and tracking
- allow optional prey-relevant alerting
- support field return navigation

### 3. Inspection / Search

Purpose:

- inspect equipment, terrain, structures, and anomalies
- prioritize clarity and detail
- support annotation and documentation
- support breadcrumb and return-path search assistance

### 4. Navigation / Patrol

Purpose:

- move safely
- maintain heading and orientation
- follow route or patrol path
- mark checkpoints and events
- preserve awareness while moving

### 5. Review / Playback

Purpose:

- review photos, videos, tagged events, and route or path data
- separate playback intent from live-use controls

## What Operational Modes Change

Modes should change:

- which quick tools are surfaced first
- which overlays are on by default
- what alert sensitivity and presentation is active
- which categories are visually emphasized
- which task paths are shortest
- which HUD elements are visible by default
- which capture behaviors are primary
- which navigation tools are surfaced

Modes should not change:

- the existence of the 4-layer system
- the existence of the 7-category main menu
- the requirement for labels in main navigation
- the visual language or asset family rules

## Mode-Aware Interface Surfaces

### Live HUD

The HUD remains sparse in every mode, but the visible emphasis changes.

Examples:

- `Military / Threat` -> threat markers, bearing, disciplined alerts
- `Hunting / Game` -> prey cues, heading, optional outdoor tracking hints
- `Inspection / Search` -> zoom and annotation state
- `Navigation / Patrol` -> heading, waypoint, breadcrumb, route status
- `Review / Playback` -> playback scrub, file state, tagged event markers

### Quick Menu

The quick menu stays limited to roughly 6 to 8 actions in all modes, but the ordering and composition changes by mission.

Examples:

- `Military / Threat` prioritizes thermal blend and threat sensitivity
- `Hunting / Game` prioritizes zoom, thermal toggle, prey sensitivity, quick capture
- `Inspection / Search` prioritizes edge enhancement, capture, annotation
- `Navigation / Patrol` prioritizes overlay density, compass, waypoint, route tools
- `Review / Playback` prioritizes recent, filter, protect, export, delete

### Mode Tools

Every operational mode should have a small set of mission-specific tools that are not promoted to top-level backbone categories.

Examples:

- `Military / Threat` -> threat sensitivity, evidence tag, blackout
- `Hunting / Game` -> prey alert, waypoint mark, trail back
- `Inspection / Search` -> annotation, anomaly mark, breadcrumb
- `Navigation / Patrol` -> checkpoint mark, route toggle, return-to-origin
- `Review / Playback` -> tagged event review, route replay, favorite and protect

### Deep Settings

Deep settings still live under the shared category backbone, but each mode should visually emphasize the categories most relevant to that mission.

## Category Emphasis By Mode

### Military / Threat

Primary:

- `Vision`
- `Thermal`
- `Capture`

Secondary:

- `Device`
- `System`

Special handling:

- navigation assist appears inside `Vision` overlays and mode tools
- diagnostics remain buried in `Advanced`

### Hunting / Game

Primary:

- `Vision`
- `Thermal`
- `Capture`

Secondary:

- `System`
- `Playback`

Special handling:

- navigation support is surfaced through field return tools, not a separate front-door category

### Inspection / Search

Primary:

- `Vision`
- `Thermal`
- `Capture`

Secondary:

- `Playback`
- `Device`

Special handling:

- annotation and breadcrumb features are promoted through mode tools and subgroup emphasis

### Navigation / Patrol

Primary:

- `Vision`
- `Capture`
- `System`

Secondary:

- `Thermal`
- `Device`

Special handling:

- navigation overlays, waypoint logic, and route tools are promoted inside `Vision` overlays and mode tools

### Review / Playback

Primary:

- `Playback`
- `Capture`

Secondary:

- `System`
- `Device`

Special handling:

- the live quick menu collapses into review controls
- `Playback` becomes the dominant category

## Mode Selection Philosophy

Operational modes should be explicit and understandable, not hidden profile switches. The user should know what the mode is optimizing for. These modes can be chosen at startup, changed deliberately from `System`, and represented in the live HUD with a quiet but clear mode indicator.

Modes should be able to inherit from broader user presets, but they are not merely cosmetic themes. They should change what is surfaced and what is quieted.

## Product Guardrails

- do not create a separate top-level menu category for every mode
- do not let mission tools duplicate full settings categories
- do not let the quick menu become a second main menu
- do not let mode behavior destabilize the backbone locations of settings
- keep `Capture` separate from `Playback`
- keep `Advanced` buried

## Practical Summary

NEVEX XR should behave like a stable platform with a mission-aware operating layer:

- the user always knows the structure
- the headset adapts to the task
- the live experience stays uncluttered
- navigation becomes a real cross-platform capability instead of an isolated panel
