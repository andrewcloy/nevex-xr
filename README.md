# NEVEX XR

Unified master project folder for the NEVEX XR stereo digital night vision
system.

This Desktop folder was created as a safe consolidation and backup snapshot.
The original working folders were copied, not moved or deleted.

## Purpose

- keep a safe backup of the current working project state
- consolidate Jetson and XR work under one top-level folder
- prepare a future GitHub repository root
- avoid risky application refactors during the consolidation step

## Top-Level Structure

```text
NEVEX_XR/
├── docs/
├── hardware/
├── jetson_runtime/
├── samsung_xr_app/
├── .gitignore
└── README.md
```

## What Lives Where

- `jetson_runtime/`
  Canonical top-level copy of the Jetson-side Python runtime.

- `samsung_xr_app/`
  Safe copy of the current XR application working tree. This copy intentionally
  preserves the existing app-local layout so the current relative-path
  assumptions remain intact.

- `docs/`
  Shared system and architecture documentation copied to the unified root.

- `hardware/`
  Placeholder for hardware notes, BOM details, Jetson wiring, camera mounting,
  enclosure notes, and future deployment references.

## Important Consolidation Note

Path normalization is now in place for XR sender defaults:

- prefer top-level `NEVEX_XR/jetson_runtime/`
- fall back to a nested XR-local copy only if one is present

The intended canonical shared locations are now:

- `NEVEX_XR/jetson_runtime/`
- `NEVEX_XR/docs/`

The temporary nested compatibility copies under `samsung_xr_app/` have now been
removed. The top-level root is the canonical project layout going forward.

What remains is normal validation and Git workflow only, not layout cleanup.

## Recommended Use Going Forward

For immediate zero-risk work:

- open `NEVEX_XR/samsung_xr_app/` if you want the copied project to behave like
  the current working layout

For the future unified repository root:

- treat `NEVEX_XR/` as the intended GitHub root
- use top-level `docs/` and top-level `jetson_runtime/` as the future canonical
  shared locations
- keep XR app work under `NEVEX_XR/samsung_xr_app/`
- keep shared runtime and shared docs at the top level

## Original Safety Net

The original source project remains untouched at:

`C:\Users\andre\samsung_xr_app\samsung_xr_app`

## Suggested Next Administrative Step

When you are ready to make this the repository root, initialize Git from
`C:\Users\andre\Desktop\NEVEX_XR` and review the repository note in
`docs/repository_consolidation_note.md`.
