# Hand Input Module

This module defines the vendor-neutral hand interaction contracts for the XR app.

The design is intentionally split into layers:

1. A future XR SDK adapter will read headset hand tracking and publish normalized `HandTrackingFrame` values.
2. A translator will convert those normalized frames into application-facing events such as `select` and `drag_start`.
3. The rest of the app will subscribe to those events without depending on any headset-specific SDK types.

For now, this module only defines interfaces and event models. It does not connect to a real XR runtime yet.

## Design Goals

- keep headset SDK types out of app-facing code
- define a stable event model for UI, viewer, and system interactions
- support future live and mock tracking sources through the same contracts
- make gesture mapping configurable later without rewriting event consumers

## Event Mapping Notes

These mappings are intentionally conceptual for now:

- `select`: likely emitted from a short pinch or tap-like hand action while the user is targeting a UI or viewer element
- `drag_start`: likely emitted when a select-like gesture is held long enough to capture a draggable target
- `drag_update`: likely emitted while that held gesture continues and the hand pose changes
- `drag_end`: likely emitted when the hold is released, cancelled, or tracking becomes invalid
- `show_menu`: likely emitted from a dedicated menu gesture, such as a palm-up pose or a platform-specific system gesture
- `hide_menu`: likely emitted when the dismiss gesture is recognized, focus changes, or the menu is closed through another action
- `adjust_zoom`: likely emitted from a two-hand distance change or another continuous gesture chosen later by the XR runtime integration

## Files

- `tracking.ts`: normalized tracking frame and pose models
- `events.ts`: application-facing hand interaction events
- `contracts.ts`: source, translator, and subscription interfaces
- `index.ts`: barrel export for the module
