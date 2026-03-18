# Home PC Handoff

This interface pack contains strategy docs, visual rules, prompt manifests, rerunnable OpenAI generation tooling, generated PNG destinations, preview assets, and integration notes for NEVEX XR.

The pack now also contains a production-oriented menu revision. Read these first before Android XR integration:

- `01_STRATEGY/NEVEX_XR_MENU_AUDIT.md`
- `01_STRATEGY/NEVEX_XR_MENU_ARCHITECTURE.md`
- `01_STRATEGY/NEVEX_XR_MENU_MODES_AND_SUBMENUS.md`
- `01_STRATEGY/NEVEX_XR_TASK_PATHS.md`
- `01_STRATEGY/NEVEX_XR_XR_USABILITY_RULES.md`
- `06_HANDOFF/NEVEX_XR_MENU_HANDOFF_FOR_ANDROID_XR.md`

The pack now also contains the operational mode layer. Read these alongside the menu docs:

- `01_STRATEGY/NEVEX_XR_OPERATIONAL_MODE_MODEL.md`
- `01_STRATEGY/NEVEX_XR_MODE_TOOLS_AND_PRIORITIES.md`
- `01_STRATEGY/NEVEX_XR_MODE_TO_CATEGORY_MAPPING.md`
- `01_STRATEGY/NEVEX_XR_NAVIGATION_INTEGRATION_MODEL.md`
- `06_HANDOFF/NEVEX_XR_MODE_HIERARCHY_HANDOFF.md`

## Import targets for the XR app repo

- import `02_MANIFESTS` for tokens, naming, and asset source-of-truth data
- import `03_ASSETS/png/glyph_icons` for HUD and live-view controls
- import `03_ASSETS/png/tile_icons` for menus, quick controls, and settings surfaces
- import `03_ASSETS/png/panels` and `03_ASSETS/png/alerts` only when assembling higher-level panel art
- keep `05_TOOLS` if the app repo should preserve rerunnable asset generation

## Tile vs glyph usage

Use `glyph_icons` inside the live mission view, narrow control strips, status rows, reticles, and tight overlays. Use `tile_icons` for selection surfaces, launcher-like controls inside the app, settings hubs, and panel entry points. Do not substitute tile icons directly into a transparent HUD.

For the revised architecture, top-level and first-level menu navigation should use icons plus text labels rather than icons alone.

## Naming

All asset names use snake_case and stay stable across families. If both `glyph_icons/power.png` and `tile_icons/power.png` exist, they represent the same concept for different placement contexts.

## Missing or incomplete assets

Check `06_HANDOFF/FAILED_ASSETS.md` and `03_ASSETS/logs/generation_log.json` first. P1 assets are scaffolded even if not generated in the first pass.

## Screens to build next

- `live_hud_minimal`
- compact `quick_menu`
- seven-category `main_menu`
- mode-select and readiness flow
- `vision` and `thermal` settings flows
- `capture_panel` and `playback_panel`

## Recommended next implementation order

1. wire theme tokens into the XR app
2. implement mode select and persistence
3. implement `live_hud_minimal`
4. implement the compact mode-aware `quick_menu`
5. implement the seven-category labeled `main_menu`
6. build `Vision`, `Thermal`, and mode-aware overlay behavior first
7. split capture from playback
8. integrate navigation as a cross-mode capability rather than a separate front-door menu
9. finish `Advanced` after the routine user path is stable
