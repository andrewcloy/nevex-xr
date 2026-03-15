# Thermal And IR Architecture

This note defines the current architecture support for optional thermal overlay
and optional IR illuminator control in the Samsung XR viewer stack.

## Design Principle

Thermal and IR are optional subsystems.

- The stereo visible-light path remains the primary rendering path.
- The system must continue operating normally when thermal hardware is absent.
- The system must continue operating normally when the IR illuminator is absent.
- The system must continue operating normally when both are absent.
- Absence is represented explicitly through capability/status fields instead of
  special-case control flow.

## Thermal Capability Model

The live transport capability payload now supports these thermal fields:

- `thermalAvailable`
- `thermalBackendIdentity`
- `thermalFrameWidth`
- `thermalFrameHeight`
- `thermalFrameRate`
- `thermalOverlaySupported`
- `supportedThermalOverlayModes`
- `thermalHealthState`
- `thermalErrorText`

When thermal is absent:

- `thermalAvailable` is `false`
- `thermalOverlaySupported` is `false`
- `thermalHealthState` is `unavailable`
- the visible stereo viewer still renders normally
- browser diagnostics/status show thermal as unavailable instead of failing

## Thermal Overlay Modes

Supported overlay modes:

- `off`
- `thermal_fusion_envg`
- `hotspot_highlight`
- `hot_edges`
- `full_thermal`
- `hot_target_boxes_optional`

Default mode:

- `thermal_fusion_envg`

Current intent of `thermal_fusion_envg`:

- visible stereo imagery remains primary
- thermal heat is rendered as a semi-transparent fusion layer
- hotter regions glow more strongly
- no bounding boxes are shown
- no reticles are implied
- no object detection is assumed

`hot_target_boxes_optional` remains a separate explicit mode so boxes only appear
when deliberately requested by the sender/runtime state.

## Thermal Frame Model

The protocol-facing thermal frame payload is additive to `stereo_frame` and uses:

- `frameId`
- `timestamp`
- `width`
- `height`
- `thermalValues`
- `minTemperature`
- `maxTemperature`
- `hotspotAnnotations`
- `paletteHint`

The browser maps that payload into an internal thermal frame model without
changing the visible stereo transport envelope shape.

## Simulated Thermal Path

The sender now includes a clean thermal seam:

- `scripts/sender/thermal/thermal_frame_provider_contract.mjs`
- `scripts/sender/thermal/thermal_backend_contract.mjs`
- `scripts/sender/thermal/simulated_thermal_backend.mjs`
- `scripts/sender/thermal/simulated_thermal_frame_provider.mjs`

The simulated backend produces:

- moving heat blobs
- hotspot annotations
- varying thermal gradients
- stable thermal capability/status reporting

This allows browser-side fusion and status UI work to proceed without a FLIR
Lepton device or driver.

## IR Illuminator Architecture

The sender now includes a separate optional IR seam:

- `scripts/sender/ir/ir_illuminator_controller_contract.mjs`
- `scripts/sender/ir/unavailable_ir_illuminator_controller.mjs`
- `scripts/sender/ir/simulated_ir_illuminator_controller.mjs`

IR capability/status fields:

- `irAvailable`
- `irBackendIdentity`
- `irEnabled`
- `irLevel`
- `irMaxLevel`
- `irControlSupported`
- `irFaultState`
- `irErrorText`

Current controllers:

- unavailable stub: explicit no-hardware path
- simulated controller: development/status rehearsal path

The simulated controller supports the clean future command surface:

- `enable()`
- `disable()`
- `setLevel(...)`
- `getStatus()`

Real GPIO/PWM control is intentionally deferred.

## Browser Integration

The browser viewer now consumes thermal/IR data in three layers:

1. Transport capabilities advertise whether thermal or IR exist.
2. `source_status` carries current thermal/IR status when available.
3. `stereo_frame` may carry an additive `thermalFrame` plus `thermalOverlayMode`.

Browser presentation now exposes:

- visible status rows for thermal mode/health and IR state/level
- diagnostics rows for thermal capability/detail and IR controller detail
- a minimal fusion overlay in the eye panels when thermal frames are present

## Operator Controls

The browser UI now exposes operator-facing controls through the existing
settings/control seam:

- thermal overlay mode select:
  - `off`
  - `thermal_fusion_envg`
  - `hotspot_highlight`
  - `hot_edges`
  - `full_thermal`
  - `hot_target_boxes_optional`
- IR enable/disable toggle
- IR level slider

Current behavior:

- thermal mode changes immediately affect local browser rendering when a thermal
  frame is present
- IR enable/level changes immediately update the visible status area and
  diagnostics read-model
- controls are disabled with a clear unavailable note when the corresponding
  subsystem is absent or not control-capable
- when the Jetson Stub live WebSocket path is connected, the browser sends a
  live outbound `settings_patch` control message to the sender/runtime
- the sender/runtime applies supported thermal/IR changes live without restart
- the browser shows operator-selected state separately from sender-reported
  applied state so temporary mismatches remain visible but compact
- if no live control path is connected, the browser retains the selected value
  locally and the reported state remains unchanged

The sender-side simulated seams already support the same operator concepts:

- simulated thermal backend/provider accepts overlay-mode changes through
  `setOverlayMode(...)`
- simulated IR controller reacts to `enable()`, `disable()`, and `setLevel(...)`
- unavailable IR controller safely ignores those commands and keeps reporting
  `irAvailable: false`

## Behavior When Hardware Is Absent

When thermal is absent:

- no thermal frame is required
- diagnostics/status show thermal as unavailable
- the browser thermal-mode selector is disabled
- no fusion layer is rendered
- visible stereo continues unchanged

When IR is absent:

- no IR control path is required
- diagnostics/status show IR as unavailable
- the browser IR toggle/level controls are disabled
- no sender/runtime failure is triggered

When both are absent:

- the sender/browser still exchange normal visible-light stereo frames
- existing camera, replay, and mock flows remain valid
- no thermal/IR-specific code path is required to succeed

## Simulated Bring-Up Command

Example local rehearsal command:

```powershell
node ./scripts/jetson_sender_prototype.mjs `
  --provider camera `
  --capture-backend simulated `
  --thermal-simulated `
  --thermal-overlay-mode thermal_fusion_envg `
  --ir-simulated `
  --ir-enabled true `
  --ir-level 3 `
  --ir-max-level 5
```

With the browser app connected through the Jetson Stub adapter, this produces:

- normal stereo image frames
- simulated thermal capability and source-status telemetry
- simulated IR capability and status telemetry
- visible thermal fusion overlay in the eye panels
