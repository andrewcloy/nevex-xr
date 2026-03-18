# NEVEX XR Navigation Integration Model

## Purpose

Navigation should not be treated as an isolated feature screen. It should function as a shared support capability expressed differently across operational modes.

## Core Navigation Principle

Navigation is integrated across the platform through:

- HUD overlays
- quick tools
- mode tools
- playback and review
- selective deep settings

It should not become a separate competing top-level menu category because that would bloat the front door and fragment the system structure.

## Where Navigation Lives In The Backbone

### Primary home

Navigation display and movement overlays primarily live under:

- `Vision`

Because they directly affect what the user sees while moving.

### Supporting homes

Navigation-related actions and records can also live under:

- `Capture` for event marks and route-linked recording
- `Playback` for route review and tagged event review
- `System` for mission presets and navigation preferences
- `Advanced` for debug and calibration-only route or sensor diagnostics

## Navigation Capability Stack

### Live orientation

- heading
- bearing
- compass
- horizon or level aid if supported

### Route support

- waypoint cue
- route marker
- breadcrumb trail
- return-to-origin
- trail-back

### Mission markers

- checkpoint mark
- patrol marker
- anomaly mark
- event tag
- area marker

### Review support

- path review
- tagged waypoint review
- route replay
- event-by-location filtering

## Mode-Specific Navigation Behavior

### Military / Threat

Preferred navigation elements:

- heading or bearing
- waypoint cue
- route marker
- return-to-start cue

Design rule:

Keep navigation disciplined and low-signature. Do not let route graphics become visually dominant over threat awareness.

### Hunting / Game

Preferred navigation elements:

- compass
- waypoint mark
- trail-back
- camp or vehicle return marker

Design rule:

Navigation should support outdoor wayfinding without making the field view feel like a map screen.

### Inspection / Search

Preferred navigation elements:

- breadcrumb trail
- return path cue
- area marker
- sweep or grid assist

Design rule:

Navigation should support coverage and return logic, not fast movement.

### Navigation / Patrol

Preferred navigation elements:

- heading
- compass
- waypoint cue
- route
- checkpoint logic
- return-to-origin

Design rule:

This is the only mode where navigation should feel continuously foregrounded.

### Review / Playback

Preferred navigation elements:

- route review
- tagged waypoint review
- path replay

Design rule:

Navigation becomes historical and analytical rather than live.

## Navigation In The Quick Menu

Only show the most mission-relevant navigation controls. Do not fill the quick menu with every route feature.

Examples:

- `Military / Threat` -> waypoint mark, return cue if essential
- `Hunting / Game` -> waypoint, trail-back
- `Inspection / Search` -> breadcrumb toggle
- `Navigation / Patrol` -> compass, waypoint, route toggle

## Navigation In The HUD

HUD navigation should be:

- low-clutter
- edge-safe
- glanceable
- suppressible

Preferred HUD forms:

- small heading strip
- quiet waypoint cue
- breadcrumb hint
- directional indicator rather than large persistent route art

Avoid:

- map-heavy overlays
- thick route graphics in the center view
- multiple simultaneous navigation widgets

## Navigation In Playback

Playback should support:

- route-linked media review
- tagged event review
- patrol review
- return-path inspection

This is where route richness can expand, because the user is no longer in live view.

## Asset Guidance

Existing related assets:

- `compass`
- `waypoint`
- `nav_safe`
- `record`
- `snapshot`
- `playback`

Recommended interpretation:

- `compass` -> HUD overlay, quick tool, or labeled row in `Vision`
- `waypoint` -> mode tool or quick tool depending on mission
- `nav_safe` -> movement-assist or safety overlay under `Vision`

## Product Guardrails

- do not create `Navigation` as an eighth backbone category unless testing proves the 7-category model fails
- keep navigation integrated into `Vision`, `Capture`, `Playback`, and `System`
- surface only the mission-relevant subset in each operational mode
- keep live navigation lighter than playback navigation

## Implementation Summary

For Android XR integration, navigation should be treated as a cross-cutting platform capability:

- visible in the HUD when useful
- surfaced in the quick menu when mission-relevant
- configured inside the stable category backbone
- reviewable later in playback
