# Hand Menu Design Note

## Purpose

This note captures the current browser-side hand-menu scaffold and the intended future Samsung XR runtime integration seam.

This is an internal UI design reference only. It does not change runtime behavior, sender behavior, transport behavior, or backend logic.

## Primary Hand Menu Items

The current primary hand menu keeps six visually dominant actions:

- Camera
- Zoom
- AI
- Thermal Fusion
- Illuminator
- Search

These are presented as the main floating quick-control targets and currently drive UI-only selection and command-routing stub state.

## Secondary And Support Items

The current secondary/support group is kept separate from the primary six so the main menu remains compact:

- Record
- Battery
- Day/Night
- Thermal Target
- Exit

These are shown in the support section / compact secondary strip and currently drive UI-only support detail state.

## Current No-Feed State Behavior

When the app is in live mode and no eye-image content is available, the viewer shows an intentional no-feed state instead of appearing empty.

Current behavior:

- title: `NO LIVE FEED`
- status text: `Jetson offline` or `Awaiting source frames`
- guidance text: `Turn on device or connect source`
- detail line includes the active adapter and current transport status
- availability chips show `Mock`, `Demo`, `Replay`, and `Simulated`
- the hand-menu scaffold remains visible alongside this state so the UI still feels intentional when the Jetson is offline

## Hand Menu Runtime Input Seam

The current app-side seam for future runtime-provided menu interaction is:

- `HandMenuRuntimeInput`
- `applyRuntimeInput(...)`
- `clearRuntimeInputState()`

Current intent of this seam:

- accept runtime-provided menu-open / menu-close / menu-toggle intent
- accept a runtime-provided targeted item id
- accept left/right hand metadata for future pinch selection
- accept a runtime-provided select-pinch confirmation signal
- keep all gesture recognition outside the app-side menu controller

The app-side hand-menu controller only consumes structured intent/state. It does not attempt to implement custom hand tracking or computer-vision-based gesture detection.

## Intended Future Samsung XR Runtime Mapping

The intended future mapping from Samsung XR runtime hand input into app-side menu state is:

- left-hand menu-open pinch:
  map a runtime-recognized left thumb/index pinch to menu open or menu toggle intent
- either-hand select pinch:
  map a runtime-recognized left or right selection pinch to menu item activation
- targeted-item hover/selection:
  map runtime-provided targeting or hover state to the currently highlighted menu item

The expected ownership boundary is:

- Samsung XR / XR runtime:
  owns hand tracking, pinch recognition, targeting, and confidence filtering
- app-side hand menu:
  owns visual state, highlighted item state, selected item state, and UI-only command routing stubs

## Current Safety Boundary

The current scaffold is intentionally limited to:

- menu structure
- selection/highlight state
- UI-only contextual panels
- runtime input seam preparation

It does not currently:

- execute backend actions
- alter sender or transport behavior
- implement custom gesture detection
- change replay, capture, protocol, or diagnostics behavior
