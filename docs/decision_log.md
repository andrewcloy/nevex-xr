# NEVEX XR Decision Log

## Decision 001
Canonical repo layout is top-level only:
- docs
- hardware
- jetson_runtime
- samsung_xr_app

Nested copies under samsung_xr_app are not allowed.

## Decision 002
Canonical sender runtime entrypoint:
samsung_xr_app/scripts/jetson_sender_runtime.mjs

jetson_sender_prototype remains compatibility-oriented only.

## Decision 003
Simulated mode must remain available at all times for development and fallback testing.

## Decision 004
Do not begin thermal or AI integration until live Jetson-to-XR stereo delivery is proven.
