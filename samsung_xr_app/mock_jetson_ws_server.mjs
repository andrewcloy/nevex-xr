import { WebSocket, WebSocketServer } from "ws";
import {
  buildCapabilitiesEnvelope,
  buildSourceStatusEnvelope,
  buildStereoFrameEnvelope,
  buildTransportStatusEnvelope,
  createJetsonCapabilitiesPayload,
} from "./jetson_sender_helpers.mjs";

const port = parseInteger(process.env.JETSON_WS_PORT, 8080);
const path = process.env.JETSON_WS_PATH ?? "/jetson/messages";
const frameIntervalMs = parseInteger(process.env.JETSON_FRAME_INTERVAL_MS, 1200);
const streamName = process.env.JETSON_STREAM_NAME ?? "jetson_mock_stream";
const recommendedMaxPayloadBytes = parseInteger(
  process.env.JETSON_RECOMMENDED_MAX_PAYLOAD_BYTES,
  256 * 1024,
);

let sequence = 0;
let frameId = 0;

const server = new WebSocketServer({
  port,
  path,
});

console.log(`[mock-jetson] listening on ws://127.0.0.1:${port}${path}`);
console.log(`[mock-jetson] stream name: ${streamName}`);
console.log(`[mock-jetson] frame interval: ${frameIntervalMs} ms`);
console.log(
  `[mock-jetson] recommended max payload: ${recommendedMaxPayloadBytes} bytes`,
);

server.on("connection", (socket, request) => {
  const remoteLabel = `${request.socket.remoteAddress ?? "unknown"}:${request.socket.remotePort ?? "?"}`;
  console.log(`[mock-jetson] client connected from ${remoteLabel}`);

  sendEnvelope(
    socket,
    buildCapabilitiesEnvelope(
      createJetsonCapabilitiesPayload({
        senderName: "mock_jetson_ws_server",
        senderVersion: "0.2.0-dev",
        maxRecommendedPayloadBytes: recommendedMaxPayloadBytes,
        stereoFormatNote:
          "Send side-by-side proof-of-life frames first; upgrade media complexity later.",
      }),
      {
        sequence: nextSequence(),
      },
    ),
  );

  sendEnvelope(
    socket,
    buildTransportStatusEnvelope(
      {
        transportState: "running",
        connected: true,
        statusText: "Mock Jetson WebSocket server connected.",
      },
      {
        sequence: nextSequence(),
      },
    ),
  );

  sendEnvelope(
    socket,
    buildSourceStatusEnvelope(
      {
        sourceState: "running",
      },
      {
        sequence: nextSequence(),
      },
    ),
  );

  const frameTimer = setInterval(() => {
    const nextFrameId = ++frameId;
    const timestampMs = Date.now();

    sendEnvelope(
      socket,
      buildSourceStatusEnvelope(
        {
          sourceState: "running",
          lastFrameId: nextFrameId,
          lastTimestampMs: timestampMs,
        },
        {
          timestampMs,
          sequence: nextSequence(),
        },
      ),
    );

    sendEnvelope(
      socket,
      buildStereoFrameEnvelope(
        createStereoFramePayload({
          frameId: nextFrameId,
          timestampMs,
          streamName,
        }),
        {
          timestampMs,
          sequence: nextSequence(),
        },
      ),
    );
  }, frameIntervalMs);

  socket.on("close", () => {
    clearInterval(frameTimer);
    console.log(`[mock-jetson] client disconnected from ${remoteLabel}`);
  });

  socket.on("error", (error) => {
    console.error(`[mock-jetson] socket error for ${remoteLabel}:`, error);
  });
});

server.on("error", (error) => {
  console.error("[mock-jetson] server error:", error);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[mock-jetson] shutting down on ${signal}`);
    server.close(() => {
      process.exit(0);
    });
  });
}

function sendEnvelope(socket, envelope) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(envelope));
}

function createStereoFramePayload(options) {
  const { frameId, timestampMs, streamName } = options;

  return {
    frameId,
    timestampMs,
    sourceId: "mock-jetson-ws-server",
    sceneId: "mock_jetson_image_scene",
    streamName,
    tags: ["jetson", "mock-server", "image-backed"],
    extras: {
      mockExposureMs: 14,
      mockGain: 0.9,
    },
    overlay: {
      label: `Mock Jetson Overlay ${String(frameId).padStart(4, "0")}`,
      annotations: [
        {
          id: "mock-crosshair",
          kind: "crosshair",
          normalizedX: 0.5,
          normalizedY: 0.5,
        },
        {
          id: "mock-text",
          kind: "text",
          normalizedX: 0.16,
          normalizedY: 0.18,
          label: `WS ${frameId}`,
        },
      ],
    },
    left: createEyePayload("left", frameId, streamName),
    right: createEyePayload("right", frameId, streamName),
  };
}

function createEyePayload(eye, frameId, streamName) {
  const label = eye === "left" ? "LEFT" : "RIGHT";
  const accentHex = eye === "left" ? "#9ee6ff" : "#f0c8ff";
  const backgroundHex = eye === "left" ? "#123e66" : "#4a215c";

  return {
    eye,
    width: 1920,
    height: 1080,
    format: "image",
    contentLabel: `${streamName}:${eye}`,
    title: "Mock Jetson WS Frame",
    markerText: `WS ${label} ${String(frameId).padStart(4, "0")}`,
    backgroundHex,
    accentHex,
    image: {
      dataUrl: createEyeImageDataUrl({
        eye,
        frameId,
        streamName,
      }),
    },
  };
}

function createEyeImageDataUrl(options) {
  const { eye, frameId, streamName } = options;
  const accent = eye === "left" ? "#9ee6ff" : "#f0c8ff";
  const backgroundA = eye === "left" ? "#0f385d" : "#46185d";
  const backgroundB = eye === "left" ? "#2a81bb" : "#9c4cc2";
  const label = eye === "left" ? "LEFT EYE" : "RIGHT EYE";
  const orbitCx = eye === "left" ? 184 : 456;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${backgroundA}" />
          <stop offset="100%" stop-color="${backgroundB}" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)" />
      <circle cx="${orbitCx}" cy="130" r="84" fill="rgba(255,255,255,0.14)" />
      <circle cx="${640 - orbitCx}" cy="230" r="56" fill="rgba(255,255,255,0.10)" />
      <rect x="74" y="230" width="492" height="58" rx="16" fill="rgba(0,0,0,0.28)" />
      <text x="320" y="88" text-anchor="middle" fill="${accent}" font-size="32" font-family="Segoe UI, Arial, sans-serif" font-weight="700">
        ${streamName.toUpperCase()}
      </text>
      <text x="320" y="160" text-anchor="middle" fill="#ffffff" font-size="78" font-family="Segoe UI, Arial, sans-serif" font-weight="800">
        ${label}
      </text>
      <text x="320" y="268" text-anchor="middle" fill="#ffffff" font-size="24" font-family="Segoe UI, Arial, sans-serif">
        Frame ${String(frameId).padStart(4, "0")}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nextSequence() {
  sequence += 1;
  return sequence;
}
