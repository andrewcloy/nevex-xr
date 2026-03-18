# NEVEX_XR_InterfacePack

This pack is a self-contained desktop handoff package for the NEVEX XR headset interface. It is intentionally focused on strategy, icon generation, asset manifests, and preview tooling rather than direct app integration.

## What this pack contains

- XR interface strategy docs in `01_STRATEGY`
- theme tokens, prompts, and generation manifests in `02_MANIFESTS`
- source prompt files and generated image outputs in `03_ASSETS`
- a lightweight local preview in `04_PREVIEW`
- rerunnable OpenAI image generation and support scripts in `05_TOOLS`
- home-PC import notes for the next Cursor agent in `06_HANDOFF`

## Generation status model

- `P0` assets are the immediate build set for this handoff.
- `P1` assets are prompt-ready and can be generated next if desired.
- This scaffold currently defines `113` total asset variants.
- `85` variants are marked `generate_now` for the first OpenAI generation run.

## Where to look first

- visual direction: `01_STRATEGY/visual_system.md`
- UI architecture: `01_STRATEGY/interface_architecture.md`
- production menu audit: `01_STRATEGY/NEVEX_XR_MENU_AUDIT.md`
- production menu hierarchy: `01_STRATEGY/NEVEX_XR_MENU_ARCHITECTURE.md`
- production submenu behavior: `01_STRATEGY/NEVEX_XR_MENU_MODES_AND_SUBMENUS.md`
- screen map: `01_STRATEGY/screen_inventory.md`
- naming and token system: `02_MANIFESTS/naming_conventions.md` and `02_MANIFESTS/theme_tokens.json`
- full generation inputs: `02_MANIFESTS/generation_manifest.json`
- revision candidate manifest: `02_MANIFESTS/menu_revision_candidate_manifest.json`
- prompt sources: `03_ASSETS/source_prompts`
- local browser preview: `04_PREVIEW/index.html`

## How to rerun generation

Read `00_README/HOW_TO_RERUN.md` for exact commands. The short version on Windows is:

```powershell
cd 05_TOOLS
python -m pip install -r requirements.txt
python generate_openai_icons.py --priority P0
python build_preview_assets.py
```

## What the next agent should do

- verify the generated icons in the preview and replace weak outliers
- use the new menu revision docs before wiring navigation
- import `glyph_icons` into HUD/live-view control surfaces
- import `tile_icons` into menus, quick controls, and settings panels
- start building `live_hud_minimal`, the compact `quick_menu`, and the seven-category `main_menu` first
- keep icon labels outside the image art
