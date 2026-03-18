# Integration Notes

## Recommended mapping

- live HUD: `visible_lowlight`, `thermal`, `fusion`, `record`, `snapshot`, `battery`, `wifi_link`, `jetson_link`, `warning`, `critical`, `recenter`
- quick controls: `brightness`, `gain`, `exposure`, `contrast`, `zoom`, `focus`, `ir_on`, `ir_off`, `detection_on`, `detection_off`
- settings panels: `settings`, `profiles`, `diagnostics`, `calibration`, `storage`, `export`, `playback`
- calibration flow: `calibration`, `stereo_align`, `thermal_align`, `recenter`
- navigation/support: `compass`, `waypoint`, `nav_safe`

## Live HUD recommendations

Keep the HUD sparse. Use glyphs only, edge-safe placement, and limited persistent color. Target cues, current mode, capture state, link state, and high-priority warnings are enough for the baseline HUD.

## Quick controls recommendations

Quick controls can mix glyph buttons and tile-backed buttons depending on panel opacity. Use a narrow strip or compact panel rather than a large modal surface. Sensor toggles and the most frequently adjusted visual controls belong here.

## Settings recommendations

Use tile icons as entry points into grouped settings categories. Keep text labels outside icon art and avoid forcing tile density inside the live view. Diagnostics and calibration should be one step away from the main settings entry, not visible by default during normal use.
