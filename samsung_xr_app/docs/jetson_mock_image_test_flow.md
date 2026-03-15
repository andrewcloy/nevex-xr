# Jetson Mock Image Test Flow

This project includes a tiny local WebSocket server that emits versioned
Jetson-style envelopes with image-backed `stereo_frame` payloads.

See `docs/jetson_protocol_reference.md` for the current message contract.

## Start the mock Jetson server

From the project root:

```powershell
npm run mock:jetson
```

Defaults:

- WebSocket URL: `ws://127.0.0.1:8080/jetson/messages`
- Stream name: `jetson_mock_stream`
- Frame interval: `1200 ms`

Optional environment variables:

- `JETSON_WS_PORT`
- `JETSON_WS_PATH`
- `JETSON_FRAME_INTERVAL_MS`
- `JETSON_STREAM_NAME`

Example:

```powershell
$env:JETSON_WS_PORT=8090; $env:JETSON_WS_PATH="/mock"; npm run mock:jetson
```

## Start the browser app

In a second terminal:

```powershell
npm run dev
```

## Verify the end-to-end path

1. Open the Vite app in the browser.
2. Switch `Source mode` to `Live`.
3. Switch the live adapter to `Jetson Stub`.
4. Confirm the transport host, port, and path match the mock server.
5. Click `Apply Transport Config` if you changed the endpoint.
6. Click `Connect WebSocket`.
7. Observe that the left and right eye panels begin rendering actual image-backed
   content from Jetson-style `stereo_frame` envelopes.
8. Confirm the transport panel updates `Sender capabilities`, `Last message type`,
   `Last sequence`, and `Sequence health`.

## Notes

- The `Inject Sample Jetson Payload` button still works without the server and
  uses the same versioned envelope/dispatch path.
- If the WebSocket server is not running, the transport panel will remain in
  a disconnected or error state without affecting mock mode.
