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

The copied `samsung_xr_app/` folder still contains its own nested
`jetson_runtime/` and `docs/` directories because the current XR sender tooling
previously resolved the Jetson runtime relative to the XR app root.

Path normalization is now in place for the copied XR sender defaults:

- prefer top-level `NEVEX_XR/jetson_runtime/`
- fall back to `NEVEX_XR/samsung_xr_app/jetson_runtime/` if the top-level
  sibling is unavailable

The intended canonical shared locations are now:

- `NEVEX_XR/jetson_runtime/`
- `NEVEX_XR/docs/`

That means this master folder is safe and complete today, but there is still one
follow-up cleanup step before the top-level root becomes the only canonical
working layout:

1. Validate the sender bridge and Jetson control/preview flows from the unified
   root.
2. Remove duplicate nested copies from `samsung_xr_app/` only after validation.

## Recommended Use Going Forward

For immediate zero-risk work:

- open `NEVEX_XR/samsung_xr_app/` if you want the copied project to behave like
  the current working layout

For the future unified repository root:

- treat `NEVEX_XR/` as the intended GitHub root
- use top-level `docs/` and top-level `jetson_runtime/` as the future canonical
  shared locations
- keep nested copies only as temporary compatibility backups until validation is
  complete

## Original Safety Net

The original source project remains untouched at:

`C:\Users\andre\samsung_xr_app\samsung_xr_app`

## Suggested Next Administrative Step

When you are ready to make this the repository root, initialize Git from
`C:\Users\andre\Desktop\NEVEX_XR` and review the duplication note in
`docs/repository_consolidation_note.md` before deleting any nested copies.
