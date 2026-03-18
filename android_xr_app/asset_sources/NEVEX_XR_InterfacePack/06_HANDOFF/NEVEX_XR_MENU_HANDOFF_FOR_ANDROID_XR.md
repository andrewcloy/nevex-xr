# NEVEX XR Menu Handoff For Android XR

## Purpose

This handoff captures the revised production-oriented menu architecture for Android XR integration. It does not replace the original visual system or asset pack. It refines how those assets should be used so the eventual headset UI stays shallow, legible, and operationally believable.

## Core Product Decision

The pack should no longer be interpreted as a broad set of equal menu options. It should be implemented as a layered system with strong separation between:

- `Live HUD`
- `Quick Menu`
- `Main Menu`
- `Advanced / Service`

## Main Menu To Implement

Use these seven top-level categories:

- `Vision`
- `Thermal`
- `Capture`
- `Playback`
- `Device`
- `System`
- `Advanced`

Do not add more top-level categories unless a tested user task proves the current model insufficient.

## Recommended Mapping

### Live HUD

Prefer glyphs only:

- `battery`
- `record`
- `visible_lowlight`, `fusion`, or `thermal` as mode indicator
- `zoom`
- `warning` or `critical` only when active
- `wifi_link` or `jetson_link` only when degraded or operationally necessary

### Quick Menu

Use a compact panel, not a dense tile wall. Recommended quick items:

- `brightness`
- grouped `gain` and `exposure`
- `zoom`
- `visible_lowlight` / `fusion` / `thermal` as `view_mode`
- `thermal_blend` behavior
- `record`
- overlay level control using relevant overlay assets
- `power` as standby or blackout path

### Main Menu

Use tile icons plus labels:

- `Vision` -> image, enhancement, overlays, mode
- `Thermal` -> thermal view, palette, blend, hotspot
- `Capture` -> photo, video, defaults, metadata
- `Playback` -> recent, filters, actions
- `Device` -> power, storage, sensors, input and fit
- `System` -> connectivity, profiles, notifications, privacy and UI
- `Advanced` -> calibration, diagnostics, service, recovery, developer

### Advanced / Service

Move these here or keep them here:

- `diagnostics`
- `fps`
- `latency`
- `calibration`
- `stereo_align`
- `thermal_align`
- reconnect and recovery logic

## Asset Usage Recommendations

### Use as top-level category support, not standalone meaning

- `settings`
- `profiles`
- `playback`
- `diagnostics`

These should appear with text labels in category lists or subgroup rows.

### Use as grouped controls

- `brightness`
- `gain`
- `exposure`
- `contrast`
- `zoom`
- `focus`
- `edge_enhance`
- `thermal`
- `fusion`

These are best used inside panels, segmented controls, or grouped rows rather than as separate home-level icons.

### Use as contextual overlays or status indicators

- `target_box`
- `target_lock`
- `person_detect`
- `animal_detect`
- `hotspot`
- `warning`
- `critical`
- `wifi_link`
- `jetson_link`
- `reconnecting`

### Merge conceptually at integration time

- `ir_on` and `ir_off` -> single `IR` toggle with state styling
- `detection_on` and `detection_off` -> single `Detection` toggle with state styling

## Screens To Revise During Integration

- reinterpret `live_hud_expanded` as a temporary contextual state, not a normal dense HUD
- split `record_playback_panel` into `capture_panel` and `playback_panel`
- move `profile_select_panel` under `System`
- move `connectivity_panel` under `System`
- keep `diagnostics_panel` and `calibration_panel` out of routine settings flows

## Implementation Order

1. implement `live_hud_minimal`
2. implement the compact `quick_menu`
3. implement the seven-category `main_menu`
4. build `Vision` and `Thermal` first
5. add `Capture` and `Playback`
6. add `Device` and `System`
7. wire `Advanced` last

## Rules The Android XR Build Should Preserve

- keep labels with icons in menus
- keep glyphs for HUD and quick-use controls
- keep tile icons for browseable menu surfaces
- do not let service features surface in routine operation
- do not convert the icon library into a giant floating icon dashboard
- optimize for glanceability, not visual density

## Most Important Integration Warning

The biggest risk is overusing the icon pack because many assets already exist. The presence of an icon does not mean that function deserves first-order visibility. The Android XR implementation should treat this pack as a controlled design system, not as a menu of everything the headset can do.
