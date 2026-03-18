# NEVEX XR Mode Tools And Priorities

## Purpose

This document defines how each operational mode behaves in practice without breaking the shared 4-layer structure and 7-category menu backbone.

## Shared Rule

Every mode has:

- `Live HUD`
- `Quick Tools`
- `Mode Tools`
- `Deep Settings Emphasis`

The quick menu should still stay around 6 to 8 tools. Mode tools are mission-specific shortcuts or grouped actions, not a second full settings tree.

## Military / Threat

### Mission purpose

- detect human threats or suspicious movement and heat
- maintain situational awareness
- preserve low-distraction operation
- support disciplined evidence capture
- support tactical navigation assistance

### Default live HUD behavior

- sparse HUD by default
- current mode visible
- battery visible
- record state visible when active
- bearing or heading visible
- link state only when degraded or tactically relevant
- threat markers only when detection is active

### Quick tools

- brightness
- gain_exposure
- zoom
- thermal_blend
- threat_sensitivity
- overlay_level
- record
- standby_blackout

### Mode tools

- threat sensitivity
- detection discipline preset
- evidence tag
- waypoint mark
- return-to-start cue

### Deep settings emphasis

- `Vision` image tuning
- `Thermal` blend and hotspot behavior
- `Capture` quick evidence defaults
- `System` alert discipline

### Capture behavior

- fast evidence capture prioritized
- recording should be easy to arm and confirm
- metadata overlays may be enabled by policy, but should stay visually restrained

### Alert behavior

- disciplined alerts
- fewer nuisance alerts
- stronger escalation for critical link or thermal faults

### Navigation behavior

- heading and bearing support
- waypoint cue
- route marker
- return-to-start cue

## Hunting / Game

### Mission purpose

- detect animals or game
- reduce false positives
- support outdoor spotting and tracking
- allow optional game-relevant alerting
- support return navigation to trail, camp, or vehicle

### Default live HUD behavior

- cleaner outdoor overlay style
- prey markers only when enabled
- heading visible
- battery visible
- recording state visible when active
- optional range cue if available

### Quick tools

- brightness
- gain
- zoom
- thermal_toggle_or_blend
- prey_sensitivity
- audible_alert
- overlay_level
- snapshot_record

### Mode tools

- prey sensitivity
- waypoint mark
- trail-back toggle
- camp or vehicle return marker
- prey alert profile

### Deep settings emphasis

- `Vision` outdoor image tuning
- `Thermal` animal spotting behavior
- `Capture` snapshot and quick record defaults
- `System` alert behavior

### Capture behavior

- snapshot is especially important
- short-form clip capture should be easy
- review of latest capture should remain simple but not dominate live use

### Alert behavior

- optional audible or haptic game cues if supported
- suppress unnecessary technical alerts unless they affect use

### Navigation behavior

- compass
- waypoint mark
- trail-back
- camp or vehicle return

## Inspection / Search

### Mission purpose

- inspect structures, terrain, equipment, and anomalies
- prioritize detail and clarity
- support documentation
- support breadcrumb and return-path search assistance

### Default live HUD behavior

- zoom state visible
- mode indicator visible
- battery visible
- annotation or capture state visible when active
- optional breadcrumb cue when search assist is active

### Quick tools

- brightness
- gain_exposure
- zoom
- edge_enhance
- thermal_blend
- capture
- annotation
- overlay_level

### Mode tools

- annotation
- anomaly mark
- breadcrumb toggle
- area mark
- return path cue

### Deep settings emphasis

- `Vision` clarity and enhancement
- `Thermal` anomaly emphasis
- `Capture` annotation and documentation defaults
- `Playback` quick review of latest findings

### Capture behavior

- capture and annotate should feel tightly coupled
- snapshots and short clips are both useful
- tags and notes should be fast

### Alert behavior

- lower urgency overall than threat mode
- emphasize state confirmation more than alarm behavior

### Navigation behavior

- breadcrumb trail
- return path cue
- area markers
- sweep or grid assist if supported later

## Navigation / Patrol

### Mission purpose

- move safely
- preserve heading and orientation
- follow route or patrol path
- mark checkpoints and events
- maintain awareness while moving

### Default live HUD behavior

- heading or compass visible
- waypoint cue visible when active
- route or breadcrumb cue visible when active
- battery visible
- current mode visible
- obstacle or horizon assist optional

### Quick tools

- brightness
- zoom
- overlay_density
- compass_toggle
- waypoint_toggle
- route_breadcrumb_toggle
- thermal_toggle
- event_mark_record

### Mode tools

- checkpoint mark
- route toggle
- patrol marker
- return-to-origin
- waypoint cycle

### Deep settings emphasis

- `Vision` overlay options and movement visibility
- `Capture` event capture
- `System` route and patrol preferences
- `Device` local sensor and power health

### Capture behavior

- event mark is more important than long-form recording
- recording remains available, but patrol state and markers are more primary

### Alert behavior

- emphasize obstacle, route-loss, and link warnings relevant to movement
- suppress unrelated detection noise when it harms mobility

### Navigation behavior

- full route and waypoint logic
- checkpoints
- patrol path save
- return-to-origin
- path review handoff to playback

## Review / Playback

### Mission purpose

- review photos, videos, tagged events, and route data
- separate playback intent from live capture behavior

### Default live HUD behavior

- not a scene-first HUD
- use playback status header instead
- current file or session state visible
- protect, favorite, and export state visible where useful

### Quick tools

- recent
- filter
- scrub
- tag_event_jump
- protect_favorite
- export
- delete
- back_to_live

### Mode tools

- tagged event review
- route replay
- compare captures
- export queue
- protect or favorite

### Deep settings emphasis

- `Playback` filters and actions
- `Capture` metadata interpretation
- `System` storage and export behavior

### Capture behavior

- capture is secondary
- playback context should support latest file review and handoff actions

### Alert behavior

- minimal alerts
- avoid interruptive operational warning style unless storage or device state blocks playback

### Navigation behavior

- route or path review
- tagged waypoint review
- map or breadcrumb playback if supported

## Cross-Mode Priority Summary

### Most image-centric modes

- `Military / Threat`
- `Hunting / Game`
- `Inspection / Search`

### Most navigation-centric mode

- `Navigation / Patrol`

### Most media-centric mode

- `Review / Playback`

## Implementation Rule

When Android XR integration starts, treat these definitions as behavior presets layered over the same underlying menu structure. The categories remain stable. The surfaced quick tools, HUD defaults, alert profiles, and navigation support change by mode.
