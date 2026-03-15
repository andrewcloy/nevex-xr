const PREVIEW_STREAM_MAGIC = Buffer.from("NXPP", "ascii");
const PREVIEW_STREAM_VERSION = 1;
const PREVIEW_STATUS_MESSAGE_TYPE = 1;
const PREVIEW_FRAME_MESSAGE_TYPE = 2;
const PREVIEW_FRAME_SHARED_MEMORY_MESSAGE_TYPE = 3;
const PREVIEW_MESSAGE_HEADER_SIZE = 10;
const FRAME_HEADER_LENGTH_SIZE = 4;
const MAX_PREVIEW_MESSAGE_PAYLOAD_BYTES = 64 * 1024 * 1024;

export class JetsonPreviewPublisherStreamParser {
  constructor(options = {}) {
    this.buffer = Buffer.alloc(0);
    this.maxPayloadBytes =
      typeof options.maxPayloadBytes === "number" &&
      Number.isFinite(options.maxPayloadBytes) &&
      options.maxPayloadBytes > 0
        ? Math.max(1024, Math.round(options.maxPayloadBytes))
        : MAX_PREVIEW_MESSAGE_PAYLOAD_BYTES;
  }

  pushChunk(chunk) {
    const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (normalizedChunk.byteLength === 0) {
      return [];
    }

    this.buffer =
      this.buffer.byteLength === 0
        ? normalizedChunk
        : Buffer.concat([this.buffer, normalizedChunk]);

    const messages = [];
    while (this.buffer.byteLength >= PREVIEW_MESSAGE_HEADER_SIZE) {
      if (!this.buffer.subarray(0, 4).equals(PREVIEW_STREAM_MAGIC)) {
        throw new Error("Jetson preview publisher stream magic header mismatch.");
      }

      const version = this.buffer[4];
      if (version !== PREVIEW_STREAM_VERSION) {
        throw new Error(
          `Unsupported Jetson preview publisher stream version: ${version}.`,
        );
      }

      const messageType = this.buffer[5];
      const payloadLength = this.buffer.readUInt32BE(6);
      if (payloadLength > this.maxPayloadBytes) {
        throw new Error(
          `Jetson preview publisher payload exceeds safety limit: ${payloadLength} bytes.`,
        );
      }

      const totalMessageLength = PREVIEW_MESSAGE_HEADER_SIZE + payloadLength;
      if (this.buffer.byteLength < totalMessageLength) {
        break;
      }

      const payloadBytes = this.buffer.subarray(
        PREVIEW_MESSAGE_HEADER_SIZE,
        totalMessageLength,
      );
      this.buffer = this.buffer.subarray(totalMessageLength);
      messages.push(decodePreviewPublisherMessage(messageType, payloadBytes));
    }

    return messages;
  }
}

export function encodePreviewStatusMessage(payload) {
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  return encodePreviewPublisherMessage(PREVIEW_STATUS_MESSAGE_TYPE, payloadBytes);
}

export function encodePreviewFrameMessage(payload) {
  const leftBytes = normalizeFrameBytes(payload?.left?.bytes, "left");
  const rightBytes = normalizeFrameBytes(payload?.right?.bytes, "right");
  const headerPayload = {
    ...payload,
    left: {
      ...payload.left,
      byte_size: leftBytes.byteLength,
    },
    right: {
      ...payload.right,
      byte_size: rightBytes.byteLength,
    },
  };
  delete headerPayload.left.bytes;
  delete headerPayload.right.bytes;

  const headerBytes = Buffer.from(JSON.stringify(headerPayload), "utf8");
  const headerLengthBytes = Buffer.alloc(FRAME_HEADER_LENGTH_SIZE);
  headerLengthBytes.writeUInt32BE(headerBytes.byteLength, 0);
  const payloadBytes = Buffer.concat([
    headerLengthBytes,
    headerBytes,
    leftBytes,
    rightBytes,
  ]);
  return encodePreviewPublisherMessage(PREVIEW_FRAME_MESSAGE_TYPE, payloadBytes);
}

export function encodePreviewSharedMemoryFrameMessage(payload) {
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  return encodePreviewPublisherMessage(
    PREVIEW_FRAME_SHARED_MEMORY_MESSAGE_TYPE,
    payloadBytes,
  );
}

function encodePreviewPublisherMessage(messageType, payloadBytes) {
  if (payloadBytes.byteLength > MAX_PREVIEW_MESSAGE_PAYLOAD_BYTES) {
    throw new Error(
      `Preview publisher payload exceeds limit: ${payloadBytes.byteLength} bytes.`,
    );
  }

  const headerBytes = Buffer.alloc(PREVIEW_MESSAGE_HEADER_SIZE);
  PREVIEW_STREAM_MAGIC.copy(headerBytes, 0);
  headerBytes[4] = PREVIEW_STREAM_VERSION;
  headerBytes[5] = messageType;
  headerBytes.writeUInt32BE(payloadBytes.byteLength, 6);
  return Buffer.concat([headerBytes, payloadBytes]);
}

function decodePreviewPublisherMessage(messageType, payloadBytes) {
  if (messageType === PREVIEW_STATUS_MESSAGE_TYPE) {
    return decodeStatusMessage(payloadBytes);
  }
  if (messageType === PREVIEW_FRAME_MESSAGE_TYPE) {
    return decodeFrameMessage(payloadBytes);
  }
  if (messageType === PREVIEW_FRAME_SHARED_MEMORY_MESSAGE_TYPE) {
    return decodeSharedMemoryFrameMessage(payloadBytes);
  }

  throw new Error(
    `Unsupported Jetson preview publisher message type: ${messageType}.`,
  );
}

function decodeStatusMessage(payloadBytes) {
  const parsed = parseJsonBuffer(payloadBytes, "preview status payload");
  ensureObjectPayload(parsed, "preview status payload");
  return parsed;
}

function decodeFrameMessage(payloadBytes) {
  if (payloadBytes.byteLength < FRAME_HEADER_LENGTH_SIZE) {
    throw new Error("Preview frame payload is missing the frame header length.");
  }

  const headerLength = payloadBytes.readUInt32BE(0);
  const headerStart = FRAME_HEADER_LENGTH_SIZE;
  const headerEnd = headerStart + headerLength;
  if (payloadBytes.byteLength < headerEnd) {
    throw new Error("Preview frame payload ended before the frame header completed.");
  }

  const headerPayload = parseJsonBuffer(
    payloadBytes.subarray(headerStart, headerEnd),
    "preview frame header",
  );
  ensureObjectPayload(headerPayload, "preview frame header");
  const leftPayload = ensureObjectPayload(
    headerPayload.left,
    "preview frame left header",
  );
  const rightPayload = ensureObjectPayload(
    headerPayload.right,
    "preview frame right header",
  );
  const leftByteSize = resolveByteSize(leftPayload.byte_size, "left");
  const rightByteSize = resolveByteSize(rightPayload.byte_size, "right");

  const expectedPayloadLength = headerEnd + leftByteSize + rightByteSize;
  if (payloadBytes.byteLength !== expectedPayloadLength) {
    throw new Error(
      `Preview frame payload length mismatch. Expected ${expectedPayloadLength} bytes but received ${payloadBytes.byteLength}.`,
    );
  }

  const leftBytes = payloadBytes.subarray(headerEnd, headerEnd + leftByteSize);
  const rightBytes = payloadBytes.subarray(
    headerEnd + leftByteSize,
    expectedPayloadLength,
  );

  return {
    ...headerPayload,
    left: {
      ...leftPayload,
      bytes: Buffer.from(leftBytes),
    },
    right: {
      ...rightPayload,
      bytes: Buffer.from(rightBytes),
    },
  };
}

function decodeSharedMemoryFrameMessage(payloadBytes) {
  const parsed = parseJsonBuffer(payloadBytes, "preview shared-memory frame header");
  ensureObjectPayload(parsed, "preview shared-memory frame header");
  ensureObjectPayload(parsed.left, "preview shared-memory left header");
  ensureObjectPayload(parsed.right, "preview shared-memory right header");
  ensureObjectPayload(
    parsed.shared_memory,
    "preview shared-memory transport metadata",
  );
  return parsed;
}

function parseJsonBuffer(buffer, description) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(
      `${description} did not contain valid UTF-8 JSON. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function ensureObjectPayload(payload, description) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error(`Expected ${description} to be a JSON object.`);
  }

  return payload;
}

function resolveByteSize(value, eyeLabel) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Preview frame ${eyeLabel} byte_size must be a non-negative integer.`);
  }

  return value;
}

function normalizeFrameBytes(value, eyeLabel) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  throw new Error(`Preview frame ${eyeLabel} bytes must be a Buffer or Uint8Array.`);
}
