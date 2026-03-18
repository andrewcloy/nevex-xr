# NEVEX XR Asset Inventory

This file records the first permanent integration of the loose NEVEX XR asset packs into the native Android XR module.

## Archived source packs

- `asset_sources/NEVEX_XR_AudioPack`
- `asset_sources/NEVEX_XR_InterfacePack`

These archived copies preserve the full original handoff packs, including docs, manifests, preview files, prompts, tools, and logs.

## Runtime destinations

- `app/src/main/res/raw`
  - 43 production WAV files from the audio pack
  - reference in code as `R.raw.nevex_audio_*`
- `app/src/main/res/drawable-nodpi`
  - 53 generated glyph icons as `R.drawable.nevex_glyph_*`
  - 32 generated tile icons as `R.drawable.nevex_tile_*`
  - 28 placeholder and panel PNGs as `R.drawable.nevex_placeholder_*`
- `app/src/main/assets/nevex_asset_catalog`
  - copied pack manifests and naming docs
  - generated `runtime_resource_map.json` with exact old-path to new-resource mapping

## Naming normalization

- audio: `ui_click_soft.wav` -> `R.raw.nevex_audio_ui_click_soft`
- glyph: `power.png` -> `R.drawable.nevex_glyph_power`
- tile: `power.png` -> `R.drawable.nevex_tile_power`
- placeholder: `alert_low_battery__tile.png` -> `R.drawable.nevex_placeholder_tile_alert_low_battery`
- panel placeholder: `detection_panel_shell__panel.png` -> `R.drawable.nevex_placeholder_panel_detection_panel_shell`

All runtime resource names use lowercase snake_case and a NEVEX-specific prefix to avoid collisions with existing Android resources.

## Code reference guidance

- Use audio through `R.raw` resource IDs rather than direct filenames.
- Use the audio event mapping in `app/src/main/assets/nevex_asset_catalog/audio/audio_runtime_event_map.json` as the event-to-sound source of truth.
- Use UI art through `R.drawable` resource IDs.
- Use `app/src/main/assets/nevex_asset_catalog/runtime_resource_map.json` when you need the exact source-pack filename, destination resource, or destination path.

## Imported counts

- audio runtime assets: 43
- interface glyph icons: 53
- interface tile icons: 32
- interface placeholder and panel images: 28
- copied catalog files: 11
