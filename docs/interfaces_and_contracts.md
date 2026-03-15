# NEVEX XR Interfaces and Contracts

## Core Flow
Jetson cameras
-> jetson_runtime
-> jetson sender runtime
-> websocket transport
-> XR receiver
-> stereo viewer

## Canonical Sender Entry
samsung_xr_app/scripts/jetson_sender_runtime.mjs

## Canonical Runtime Root
jetson_runtime/

## XR App Root
samsung_xr_app/

## Message Expectations
Preserve protocol shape unless explicitly required.

Expected runtime sequence:
1. capabilities
2. transport_status
3. source_status
4. stereo_frame

## Development Rules
- keep simulated fallback working
- prefer minimal diffs
- do not redesign UI unless needed for diagnostics
- do not recreate nested runtime/docs folders
