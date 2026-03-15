# XR App Architecture

## Purpose

The Samsung XR application is the headset-side user experience for viewing stereo content and interacting with the wider system. Its role is to present immersive visuals, provide user controls for runtime configuration, capture hand-based input, and coordinate with an external Jetson-based compute or streaming component.

At a system level, the XR app should remain focused on:

- presenting the XR session and stereo output to the user
- handling local user interaction and in-headset controls
- maintaining UI and runtime settings state
- communicating with the Jetson for remote content, commands, and health information
- supporting a development path that works even when the Jetson is unavailable

The XR app is not intended to replace the Jetson-side processing stack. Instead, it acts as the user-facing client that renders the experience and exposes operational controls.

## System Role In The Overall Architecture

The XR app sits between the end user and the remote Jetson subsystem.

- The Jetson is expected to provide remote compute, stream generation, external control integration, or environment-specific processing that is not hosted directly on the headset.
- The XR app is responsible for session startup, rendering the stereo experience, collecting user intent, and surfacing system state in a way that is usable inside the headset.

A simple conceptual flow is:

1. The XR app starts and initializes the app shell, renderer, input systems, and local settings state.
2. The control client attempts to establish a connection to the Jetson.
3. Once connected, the app exchanges status, configuration, and runtime control messages.
4. The stereo viewer presents streamed or locally provided stereo content.
5. The user adjusts settings and interacts using hand input and XR UI controls.
6. If the Jetson is unavailable, the app can enter a mock or demo mode for local development and testing.

## Connection To The Jetson

The XR app should include a dedicated control and communication layer, represented by the `control_client` area, to isolate network and protocol concerns from rendering and UI logic.

### Connection Responsibilities

The Jetson connection layer should be responsible for:

- discovering or targeting the Jetson endpoint
- establishing and maintaining a session connection
- sending user-driven control commands
- receiving status, configuration, diagnostics, and stream-related metadata
- detecting disconnects, degraded link state, and reconnect opportunities

### Architectural Expectations

The XR app should treat the Jetson as an external dependency that may be unavailable, slow to respond, or temporarily degraded. For that reason:

- connection state should be explicit and observable by the UI
- connection failures should not crash the XR experience
- the app shell should support transitions among disconnected, connecting, connected, and mock-mode states
- viewer and UI modules should depend on abstracted state and events rather than direct networking details

### Data Separation

To keep the architecture maintainable, communication should be separated into logical categories:

- control messages: start, stop, mode changes, runtime actions
- settings/configuration: display options, session preferences, user-adjustable parameters
- health and diagnostics: connection quality, latency, error conditions, subsystem readiness
- stereo session metadata: information needed by the viewer to present content correctly

This separation allows the XR app to evolve message schemas without tightly coupling all features to one transport-specific implementation.

## Stereo Viewer Responsibilities

The `stereo_viewer` module is the immersive presentation layer of the XR app. It is responsible for showing stereo output in a way that is stable, comfortable, and aligned with headset runtime expectations.

Its responsibilities should include:

- initializing and owning the stereo presentation surface or scene components
- consuming stereo content or metadata delivered through the app state and Jetson connection
- handling viewer lifecycle events such as loading, ready, paused, resumed, and error states
- applying presentation settings that affect the viewing experience
- exposing clear status back to the rest of the app when content is unavailable or invalid

The stereo viewer should avoid taking on responsibilities that belong elsewhere. In particular:

- it should not own connection policy
- it should not directly manage user settings persistence
- it should not interpret low-level hand gesture rules

Instead, it should receive already-processed configuration and commands from surrounding application state and controllers.

### Viewer Design Goals

The stereo viewer architecture should optimize for:

- low-latency updates
- predictable rendering behavior
- clean separation between rendering and transport logic
- graceful fallback when data is missing or stale

## Settings UI Responsibilities

The `ui` and `settings_state` areas together define how configuration is presented and managed within the XR app.

### UI Responsibilities

The settings UI should be responsible for:

- presenting current configuration and connection state to the user
- allowing in-headset adjustment of relevant runtime settings
- exposing controls for connection, diagnostics, and development modes
- providing clear feedback when an action succeeds, fails, or is unavailable

### Settings State Responsibilities

The settings state layer should be responsible for:

- storing the currently active settings model
- separating transient session values from persisted user preferences
- validating or normalizing settings before they are applied
- notifying dependent modules when settings change
- synchronizing relevant settings with the Jetson when required

### Architectural Boundary

The UI should remain presentation-focused, while `settings_state` should own the authoritative local model of app configuration. This keeps menus, panels, and widgets simple and prevents business rules from being spread across the interface layer.

Examples of settings categories that may belong here include:

- stereo presentation preferences
- connection endpoint or environment selection
- interaction sensitivity or comfort options
- debug overlays and diagnostics visibility
- mock-mode behavior switches

## Hand Interaction Model

The `hand_input` module represents the XR app's hand-based interaction system. Its purpose is to translate raw hand tracking or gesture input into stable application-level intents.

### Responsibilities

The hand interaction layer should:

- consume platform hand tracking data
- recognize supported gestures, poses, or pointing interactions
- map recognized input into app actions such as select, drag, activate, dismiss, or menu interaction
- provide filtered, debounced interaction signals that are suitable for XR UI use
- expose interaction state in a way that other modules can observe without depending on device-specific APIs

### Interaction Model

Architecturally, the hand input flow should follow this pattern:

1. Raw tracking data enters from the headset runtime.
2. Input interpretation converts raw movement or pose information into higher-level interaction signals.
3. Interaction rules determine whether the user is targeting the UI, controlling viewer behavior, or performing a system-level action.
4. Resulting actions are dispatched to the appropriate UI or application controller.

This layered model reduces coupling and makes it easier to:

- replace or tune gesture recognition later
- support mock input during development
- avoid accidental direct dependencies between UI elements and low-level tracking APIs

### Design Considerations

The hand interaction model should prioritize:

- stability over sensitivity
- clear affordances for UI targeting
- a limited initial gesture set
- compatibility with mock/demo input sources for development and testing

## Mock And Demo Mode

The `mock_mode` module exists to support development, demos, and validation without requiring a live Jetson connection.

This mode is important because it allows work to continue when:

- the Jetson hardware is unavailable
- the network path is not ready
- the external protocol is still under development
- developers need repeatable test content or simulated system states

### Responsibilities

Mock or demo mode should be able to provide:

- simulated connection state transitions
- placeholder stereo content or representative viewer data
- mock settings values and responses
- synthetic diagnostics and health events
- optional simulated hand interaction events when useful for testing

### Architectural Value

Mock mode should plug into the same high-level interfaces used by the live system wherever possible. That means the rest of the app should depend on abstractions, not directly on a live Jetson implementation.

This approach provides several benefits:

- easier parallel development across UI, viewer, and connection work
- safer demos in environments where infrastructure is unreliable
- simpler testing of disconnected and degraded states
- cleaner architecture because live and mock implementations share the same contracts

## Suggested Module Responsibilities

The initial folder structure supports the following architectural ownership:

- `src/app_shell/`: app startup flow, top-level composition, lifecycle coordination, mode transitions
- `src/stereo_viewer/`: stereo presentation components and viewer lifecycle
- `src/ui/`: in-headset panels, menus, overlays, and user-facing controls
- `src/hand_input/`: hand tracking interpretation and interaction intent generation
- `src/control_client/`: Jetson communication, session control, and connection management
- `src/settings_state/`: settings model, local state, validation, and synchronization rules
- `src/diagnostics/`: runtime health, logging surfaces, and debug visibility
- `src/mock_mode/`: simulated backends and development-only behavior without Jetson dependencies

## Non-Goals For This Stage

This document intentionally does not define:

- concrete network protocols
- exact transport choices
- implementation APIs
- rendering technology details
- persistence format details
- production deployment concerns

Those decisions can be made later once the team begins implementation and has clearer requirements from the Jetson-side system and XR runtime constraints.

## Summary

The XR app is the headset-side client that renders stereo content, hosts the settings and diagnostics experience, interprets hand-based user input, and communicates with the Jetson as a remote subsystem. The architecture should keep rendering, UI, input, settings, diagnostics, and connection logic cleanly separated while supporting a mock-mode path that enables development without external hardware.
