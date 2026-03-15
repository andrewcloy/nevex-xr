# Repository Consolidation Note

This note explains the current safe-copy layout inside `NEVEX_XR/`.

## Why The Layout Is Transitional

The original working project root was:

`C:\Users\andre\samsung_xr_app\samsung_xr_app`

That root already contained:

- XR app code and tooling
- `jetson_runtime/`
- `docs/`

Some XR sender/runtime defaults previously resolved the Jetson runtime relative
to the XR app root. Because the consolidation step needed to stay low risk, the
copied `samsung_xr_app/` folder was kept as a self-contained snapshot first.

That path normalization is now in place for the copied XR sender defaults:

- prefer `NEVEX_XR/jetson_runtime/`
- fall back to `NEVEX_XR/samsung_xr_app/jetson_runtime/`

The intended canonical shared folders are now:

- `NEVEX_XR/jetson_runtime/`
- `NEVEX_XR/docs/`

## What Was Copied

- full current working tree copied to `NEVEX_XR/samsung_xr_app/`
- `jetson_runtime/` also copied to `NEVEX_XR/jetson_runtime/`
- `docs/` also copied to `NEVEX_XR/docs/`

This means there are intentional duplicate copies right now:

- `NEVEX_XR/jetson_runtime/`
- `NEVEX_XR/samsung_xr_app/jetson_runtime/`
- `NEVEX_XR/docs/`
- `NEVEX_XR/samsung_xr_app/docs/`

## Why This Was The Safest Choice

- originals remain untouched
- the copied XR app remains runnable with its current path assumptions
- the unified root is already prepared for future GitHub use
- cleanup can happen later with lower risk

## Recommended Cleanup Before Final Canonical Git Layout

1. Validate:
   - control-plane bridge
   - preview bridge
   - sender path resolution
   - docs references that assume the old root
2. Keep the top-level `jetson_runtime/` and `docs/` as canonical.
3. Remove duplicate nested copies from `samsung_xr_app/` only after validation.

## Immediate Working Recommendation

If you want zero layout risk right now, open and use:

`NEVEX_XR/samsung_xr_app`

If you want to finish repository-root normalization next, do that as a focused
follow-up pass from:

`NEVEX_XR`
