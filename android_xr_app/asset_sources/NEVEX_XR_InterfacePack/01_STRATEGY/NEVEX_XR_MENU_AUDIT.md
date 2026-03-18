# NEVEX XR Menu Audit

## Audit Goal

This audit reviews the existing interface pack as a future production XR system rather than a concept asset set. The current package has a solid visual foundation and a reasonable first-pass separation between HUD, quick controls, and deeper settings, but it still needs a stronger task-first menu hierarchy to avoid overload during real headset use.

## What Is Already Strong

- The pack correctly treats live view as the primary experience.
- The visual language is restrained and consistent with a serious optics product.
- HUD and panel thinking already lean toward low clutter.
- The asset families support the right split between live-use glyphs and menu-use tiles.
- Diagnostics and calibration are already described as separate from routine use.

## Main Weaknesses

### 1. The current system is layer-aware, but not menu-rigid enough

The existing docs describe a `live mission layer`, `quick controls layer`, and `full settings layer`, but they do not yet define a production-ready navigation shell for the full product. That creates a risk that app integration will grow organically into a flat collection of panels instead of a controlled XR menu system.

Risk:

- too many sibling panels
- weak distinction between broad categories and one-off panels
- inconsistent entry points during implementation

### 2. Quick controls are too broad for true in-use speed

The current quick controls description includes brightness, gain, exposure, zoom, thermal blend, IR toggle, detection toggle, and profile switching. That is already close to the upper bound for a compact in-headset quick layer, and some of those items do not deserve equal live prominence.

Risk:

- quick menu becomes a mini settings menu
- users need to scan too many peers under pressure
- important actions lose speed because secondary controls compete with them

Specific concern:

- `profile switching` does not belong beside `brightness` and `zoom` for most live operation
- `detection toggle` may belong in quick access only if the product depends on it during active missions
- `IR`, `gain`, and `exposure` may need grouping logic rather than separate always-visible peers

### 3. The current screen inventory is feature-shaped more than task-shaped

The existing inventory lists `sensor_fusion_panel`, `thermal_panel`, `low_light_panel`, `detection_panel`, `record_playback_panel`, `device_status_panel`, `profile_select_panel`, and `connectivity_panel`. These are useful inventory entries, but they follow subsystem boundaries more than user tasks.

Risk:

- engineering ownership leaks into UI architecture
- users must understand feature domains before they can navigate
- similar intents are split across too many screens

Most important examples:

- `record_playback_panel` combines creation and review, which are different user intents
- `profile_select_panel` is currently prominent enough to become a top-level temptation, when it belongs under `System`
- `connectivity_panel` can become a dead-end screen if not folded into a broader `System` or `Device` structure

### 4. The asset set is richer than the live UX should expose

The icon inventory is valuable as a library, but if app integration treats every icon as a user-facing entry point, the result will be symbol overload. Icons such as `fps`, `latency`, `jetson_link`, `diagnostics`, `target_lock`, `person_detect`, and `animal_detect` are important system assets, but they should not become co-equal menu destinations.

Risk:

- icon wall behavior in main menu or settings
- user memorization burden
- service/debug concepts shown too early

Production rule implied by this audit:

- many icons should remain contextual indicators, row-leading symbols, or advanced-only items, not first-order navigation objects

### 5. The current docs do not draw a hard enough line between `Device`, `System`, and `Advanced`

The first-pass pack correctly mentions network, diagnostics, calibration, and device status, but it does not yet provide a production-grade rule for where each class of setting lives.

Risk:

- battery, connectivity, profiles, alignment, and diagnostics drift into the same menu tier
- global platform settings mix with hardware state and service tools
- troubleshoot paths become longer because status and service controls are mixed together

### 6. Icons are too trusted on their own

The visual system correctly separates glyphs and tiles, but the pack does not yet state strongly enough where labels are mandatory. In a real XR headset, many icons are fine as repeated quick-use controls, but category-level navigation should not depend on symbol literacy alone.

Risk:

- novice users hesitate because symbols are ambiguous
- infrequent tasks become slow
- top-level menu scanning becomes visually efficient but semantically weak

### 7. `live_hud_expanded` is a potential clutter trap

The current inventory includes both `live_hud_minimal` and `live_hud_expanded`. Without tighter rules, the expanded state can become a dumping ground for status, targeting, diagnostics, and shortcuts that should instead live in temporary quick panels.

Risk:

- HUD starts absorbing menu responsibilities
- duplicate information appears in both HUD and panels
- scene visibility degrades over time as more status is added

## Overload Risks By Area

### HUD overload risks

- persistent display of low-value metrics like storage, FPS, or latency
- simultaneous mode, detection, and navigation badges
- duplicate link states shown in multiple corners
- too many permanent target overlays when detection is enabled

### Quick menu overload risks

- separate buttons for related image controls that should share one adjustment panel
- too many toggles visible at once
- mixing high-frequency live controls with low-frequency config actions

### Main menu overload risks

- too many top-level categories
- too many tiles per panel
- mixing operational areas with expert/service areas

### Advanced layer overload risks

- lack of gating between normal user configuration and service engineering tools
- calibration screens mixed with raw diagnostics
- recovery tools too close to routine settings

## Icon Overuse Risks

The following assets are useful but should be demoted from first-order navigation in most builds:

- `diagnostics`
- `fps`
- `latency`
- `jetson_link`
- `reconnecting`
- `target_box`
- `target_lock`
- `person_detect`
- `animal_detect`
- `hotspot`
- `warning`
- `critical`

These should generally be:

- contextual indicators
- row-leading symbols with labels
- advanced-only utilities
- temporary overlays during active states

## Recommended Merges Or Repositioning

### Merge into stateful toggles

- `ir_on` + `ir_off` -> one `ir` control with visual state styling
- `detection_on` + `detection_off` -> one `detection` control with state styling
- `warning` + `critical` -> alert severity system, not menu categories

### Reposition as grouped options, not top-level destinations

- `visible_lowlight`, `fusion`, `thermal` -> segmented view-mode control under `Vision` and `Thermal`
- `compass`, `waypoint`, `nav_safe` -> overlay options under `Vision`
- `profiles` -> `System`
- `calibration`, `stereo_align`, `thermal_align` -> `Advanced`
- `storage` -> `Device`
- `playback` stays separate from `Capture`

### Treat as universal UI controls, not information architecture

- `back`
- `close`
- `confirm`
- `save`
- `reset`
- `menu`
- `quick_settings`

## Summary Judgment

The current pack is visually coherent and strategically promising, but it is not yet safe to integrate as a production XR menu model without a firmer hierarchy. The main improvement needed is not more assets. It is stronger control over:

- how many choices the user sees at once
- which functions deserve instant access
- which settings are grouped under broad user-facing intents
- which expert functions are deliberately buried
- where text labels are mandatory

The revised architecture should therefore:

- keep the HUD sparse
- reduce the quick menu to about 6 to 8 live-use actions
- enforce a small top-level main menu
- split `Capture` from `Playback`
- separate `Device`, `System`, and `Advanced`
- require icon-plus-label navigation for most menu destinations
