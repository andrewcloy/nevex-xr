# Repository Consolidation Note

This note explains the current canonical repository layout inside `NEVEX_XR/`.

## Current Canonical Layout

The original working project root was:

`C:\Users\andre\samsung_xr_app\samsung_xr_app`

That root already contained:

- XR app code and tooling
- `jetson_runtime/`
- `docs/`

Some XR sender/runtime defaults previously resolved the Jetson runtime relative
to the XR app root. That path normalization is now complete.

Current XR sender path behavior:

- prefer `NEVEX_XR/jetson_runtime/`
- fall back to an XR-local nested copy only if one exists

The intended canonical shared folders are now:

- `NEVEX_XR/jetson_runtime/`
- `NEVEX_XR/docs/`

The temporary nested compatibility copies under `samsung_xr_app/` have been
removed after validation.

## Current Structure Intent

- `NEVEX_XR/samsung_xr_app/` is the XR application root
- `NEVEX_XR/jetson_runtime/` is the canonical shared Jetson runtime
- `NEVEX_XR/docs/` is the canonical shared documentation root

## Why This Is Now Safe

- originals remain untouched
- the XR app now resolves the top-level sibling runtime by default
- the unified root is already prepared for future GitHub use
- duplicate nested trees are no longer required for normal operation

## Remaining Validation Focus

1. Validate:
   - control-plane bridge
   - preview bridge
   - sender path resolution
   - docs references that assume the old root
2. Keep the top-level `jetson_runtime/` and `docs/` as canonical.

## Immediate Working Recommendation

Open and use:

`NEVEX_XR/samsung_xr_app`

Treat `NEVEX_XR/` as the Git repository root.
