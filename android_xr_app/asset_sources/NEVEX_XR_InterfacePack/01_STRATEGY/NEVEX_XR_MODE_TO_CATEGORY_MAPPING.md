# NEVEX XR Mode To Category Mapping

## Purpose

This document shows how operational modes map onto the stable 7-category backbone. The categories remain constant. The mode changes which categories are emphasized, which subgroups move closer to the user, and which panels feel primary.

## Shared Backbone

All modes use the same deep structure:

- `Vision`
- `Thermal`
- `Capture`
- `Playback`
- `Device`
- `System`
- `Advanced`

## Mapping Logic

For each operational mode:

- `Primary` categories should feel closest and most emphasized
- `Secondary` categories remain available but quieter
- `Background` categories stay stable but should not compete for attention

## Military / Threat

### Primary categories

- `Vision`
- `Thermal`
- `Capture`

### Secondary categories

- `Device`
- `System`

### Background categories

- `Playback`
- `Advanced`

### Subgroup emphasis

- `Vision` -> image, overlays, mode
- `Thermal` -> blend, hotspot, threat-relevant emphasis
- `Capture` -> quick evidence defaults
- `System` -> disciplined alert behavior

### Existing panel mapping

- `low_light_panel` -> `Vision`
- `sensor_fusion_panel` -> `Vision` and `Thermal`
- `thermal_panel` -> `Thermal`
- `detection_panel` -> `Vision` overlays with mode-specific threat emphasis
- `device_status_panel` -> `Device`
- `connectivity_panel` -> `System`
- `diagnostics_panel` -> `Advanced`

## Hunting / Game

### Primary categories

- `Vision`
- `Thermal`
- `Capture`

### Secondary categories

- `Playback`
- `System`

### Background categories

- `Device`
- `Advanced`

### Subgroup emphasis

- `Vision` -> outdoor image tuning, overlays
- `Thermal` -> animal spotting and blend
- `Capture` -> snapshot and quick record
- `System` -> alert behavior and presets

### Existing panel mapping

- `low_light_panel` -> `Vision`
- `thermal_panel` -> `Thermal`
- `detection_panel` -> mode-specific game detection behavior
- `capture_panel` target split from old `record_playback_panel`
- `profile_select_panel` -> `System`

## Inspection / Search

### Primary categories

- `Vision`
- `Thermal`
- `Capture`

### Secondary categories

- `Playback`
- `Device`

### Background categories

- `System`
- `Advanced`

### Subgroup emphasis

- `Vision` -> detail, edge enhancement, overlays
- `Thermal` -> anomaly emphasis
- `Capture` -> documentation and annotation
- `Playback` -> quick review of latest findings

### Existing panel mapping

- `low_light_panel` -> `Vision`
- `thermal_panel` -> `Thermal`
- `sensor_fusion_panel` -> shared `Vision` and `Thermal`
- `record_playback_panel` -> split into `capture_panel` and `playback_panel`
- `device_status_panel` -> `Device`

## Navigation / Patrol

### Primary categories

- `Vision`
- `Capture`
- `System`

### Secondary categories

- `Thermal`
- `Device`

### Background categories

- `Playback`
- `Advanced`

### Subgroup emphasis

- `Vision` -> overlays, compass, route, waypoint, density
- `Capture` -> event mark and patrol logging
- `System` -> route preferences and mission presets
- `Thermal` -> assistive secondary visibility

### Existing panel mapping

- `quick_controls_strip` -> mode-specific navigation quick tools
- `device_status_panel` -> `Device`
- `connectivity_panel` -> `System`
- `profile_select_panel` -> `System`

## Review / Playback

### Primary categories

- `Playback`
- `Capture`

### Secondary categories

- `System`
- `Device`

### Background categories

- `Vision`
- `Thermal`
- `Advanced`

### Subgroup emphasis

- `Playback` -> recent, filter, tagged events, route review
- `Capture` -> media metadata interpretation
- `System` -> export and preference behavior

### Existing panel mapping

- `record_playback_panel` -> primarily `Playback` after split
- `device_status_panel` -> `Device`
- `connectivity_panel` -> `System`

## Asset Interpretation Through Modes

### Core view assets

- `visible_lowlight`
- `fusion`
- `thermal`
- `edge_enhance`
- `zoom`
- `brightness`
- `gain`
- `exposure`

These remain shared controls, but move up or down in quick priority by mode.

### Detection and target assets

- `target_box`
- `target_lock`
- `person_detect`
- `animal_detect`
- `hotspot`

These should be contextual overlays or mode tools, not top-level categories.

### Navigation support assets

- `compass`
- `waypoint`
- `nav_safe`

These should become a cross-mode capability surfaced differently by mission, not a separate front-door category.

### Capture and playback assets

- `record`
- `snapshot`
- `playback`
- `export`

These should be separated by intent: create under `Capture`, review under `Playback`.

## Manifest And Screen Revision Guidance

The next integration pass should interpret manifests and screens through both axes:

- `axis 1` = stable system backbone
- `axis 2` = operational mode emphasis

That means a screen can stay structurally located under one category while changing emphasis by mode.

Examples:

- `Vision` overlays show heading and threat markers in `Military / Threat`
- `Vision` overlays show compass and trail-back in `Hunting / Game`
- `Vision` overlays show breadcrumb and annotation context in `Inspection / Search`
- `Vision` overlays show waypoint and route logic in `Navigation / Patrol`
- `Playback` shows route review in `Review / Playback`
