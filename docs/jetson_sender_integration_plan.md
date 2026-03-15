# Jetson Sender Integration Plan

This note defines the first real Jetson-side sender target for the Samsung XR
browser viewer. The goal is a small proof-of-life sender that works with the
current WebSocket JSON protocol before any codec or media transport work starts.

The current repo now includes an additive runtime implementation at
`scripts/jetson_sender_runtime.mjs`. See
`docs/jetson_sender_runtime_runbook.md` for the exact bring-up flow.

That prototype now routes frame production through a sender-side frame-provider
seam so future still-image, generated, sequence-replay, or camera-backed
providers can reuse the same protocol sender core.

The sender also now includes a `camera` provider mode backed by a separate
capture-backend seam. The current backend is placeholder-only, but it defines
the future integration point for Jetson stereo capture.

## First Sender Goal

Build a sender that can:

1. Expose a WebSocket message endpoint that the current browser XR app can connect to.
2. Immediately send a `capabilities` message.
3. Send `transport_status` and `source_status` updates as state changes.
4. Periodically send `stereo_frame` messages with image-backed left/right eye
   payloads.
5. Increment `sequence` monotonically across the session.

## Recommended Startup Order

After the WebSocket is open, send:

1. `capabilities`
2. `transport_status`
3. `source_status`
4. first `stereo_frame`

That order gives the XR app enough context to display sender identity, current
transport health, source health, and then actual eye content.

## Capabilities Expectations

The first sender should advertise:

- `senderName`
- `senderVersion`
- `supportedMessageVersion: 1`
- `supportedImagePayloadModes`
- `maxRecommendedPayloadBytes`
- `stereoFormatNote`

Recommended first announcement:

- Image mode: `data_url`
- Recommended max payload: `262144` bytes
- Stereo note: side-by-side proof-of-life frames with explicit left/right labels

## Status Expectations

Use `transport_status` for connection and transport lifecycle changes:

- connecting
- running
- reconnecting
- stopped
- error

Use `source_status` for frame-source health:

- running
- idle
- reconnecting
- stopped
- error

If frames stall or capture fails, continue sending `source_status` updates even
before richer media recovery logic exists.

For the new camera-oriented path, `source_status` should be treated as the
primary health signal for:

- backend unavailable
- capture not implemented
- capture failed
- last capture timestamp
- last capture error

## Sequence Expectations

- Use non-negative integer `sequence` values.
- Increment by `1` for every outgoing message in the session.
- Resetting the sequence when a brand-new sender session starts is acceptable.
- Avoid repeats unless retransmission is intentional.

Current browser diagnostics track:

- repeated sequence count
- out-of-order count
- dropped-message estimate from gaps

## Payload Size Expectations

Current receiver defaults:

- `maxMessageBytes`: `524288`
- `maxImagePayloadBytes`: `262144`

Recommended sender behavior:

- stay comfortably under the advertised `maxRecommendedPayloadBytes`
- keep proof-of-life images small and simple
- avoid embedding unnecessarily large SVG or base64 content

If a message exceeds limits, the browser receiver rejects it and reports a
protocol validation error.

## Recommended First Image Format

For the first real Jetson proof-of-life, use:

- `data:image/svg+xml` data URLs if generating test frames in software
- or a small `image/png` base64 payload if raster images are easier on the
  sender side

Prefer the simplest image generation path that lets the sender prove:

- left/right eye messages are distinct
- sequence is advancing
- timestamps are current
- the XR viewer can render real image-backed content

## Sender Helper Target

For local reference and message construction:

- `jetson_sender_helpers.mjs`
- `src/stereo_viewer/jetson_sender_contract.ts`

These define the current canonical envelope builders and the minimal sender
contract expected by the XR-side receiver.

## Planned First Camera Backend

Expected first Jetson backend to try:

- `gstreamer`

Why:

- it matches common Jetson CSI and hardware-camera bring-up patterns
- it can provide snapshot-style left/right capture without redesigning the
  sender runtime
- it keeps the provider/backend split clean for later evolution
