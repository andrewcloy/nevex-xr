# Android XR Notes

This pack is focused on in-app interface assets and planning, not launcher branding. Keep in-app icons separate from adaptive launcher icon work so XR readability decisions do not get diluted by home-screen constraints.

Rounded geometry is recommended because it survives scaling, motion, and partial transparency well. Simplified assets are strongly preferred for XR because decorative detail that looks good in a still mockup often collapses when the user is moving or scanning the environment.

For later Android XR integration, plan a dedicated adaptive launcher icon separately. For this handoff, treat `glyph_icons` and `tile_icons` as the authoritative in-app asset families.
