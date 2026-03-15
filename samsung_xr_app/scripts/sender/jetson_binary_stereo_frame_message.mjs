import { Buffer } from "node:buffer";

export const JETSON_BINARY_STEREO_FRAME_MAGIC = Buffer.from("JSBF", "ascii");
export const JETSON_BINARY_STEREO_FRAME_MESSAGE_VERSION = 1;
export const JETSON_BINARY_STEREO_FRAME_MESSAGE_TYPE = 1;
export const JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE = 20;

export function encodeBinaryStereoFrameMessage(options) {
  const envelope = options?.envelope;
  const leftImageBytes = normalizeBinaryBytes(
    options?.leftImageBytes,
    "leftImageBytes",
  );
  const rightImageBytes = normalizeBinaryBytes(
    options?.rightImageBytes,
    "rightImageBytes",
  );
  const headerBytes = Buffer.from(JSON.stringify(envelope), "utf8");

  assertFitsUint32(headerBytes.byteLength, "headerBytes");
  assertFitsUint32(leftImageBytes.byteLength, "leftImageBytes");
  assertFitsUint32(rightImageBytes.byteLength, "rightImageBytes");

  const totalByteLength =
    JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE +
    headerBytes.byteLength +
    leftImageBytes.byteLength +
    rightImageBytes.byteLength;
  const output = Buffer.allocUnsafe(totalByteLength);
  let offset = 0;

  JETSON_BINARY_STEREO_FRAME_MAGIC.copy(output, offset);
  offset += JETSON_BINARY_STEREO_FRAME_MAGIC.byteLength;
  output.writeUInt8(JETSON_BINARY_STEREO_FRAME_MESSAGE_VERSION, offset);
  offset += 1;
  output.writeUInt8(JETSON_BINARY_STEREO_FRAME_MESSAGE_TYPE, offset);
  offset += 1;
  output.writeUInt16BE(0, offset);
  offset += 2;
  output.writeUInt32BE(headerBytes.byteLength, offset);
  offset += 4;
  output.writeUInt32BE(leftImageBytes.byteLength, offset);
  offset += 4;
  output.writeUInt32BE(rightImageBytes.byteLength, offset);
  offset += 4;

  headerBytes.copy(output, offset);
  offset += headerBytes.byteLength;
  leftImageBytes.copy(output, offset);
  offset += leftImageBytes.byteLength;
  rightImageBytes.copy(output, offset);

  return output;
}

export function decodeBinaryStereoFrameMessage(messageBytes) {
  const normalizedBytes = normalizeBinaryBytes(messageBytes, "messageBytes");
  if (
    normalizedBytes.byteLength < JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE
  ) {
    throw new Error(
      `Binary stereo frame message must be at least ${JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE} bytes.`,
    );
  }

  const magicBytes = normalizedBytes.subarray(
    0,
    JETSON_BINARY_STEREO_FRAME_MAGIC.byteLength,
  );
  if (!magicBytes.equals(JETSON_BINARY_STEREO_FRAME_MAGIC)) {
    throw new Error("Binary stereo frame message has an invalid magic header.");
  }

  const version = normalizedBytes.readUInt8(4);
  if (version !== JETSON_BINARY_STEREO_FRAME_MESSAGE_VERSION) {
    throw new Error(
      `Unsupported binary stereo frame message version ${version}.`,
    );
  }

  const messageType = normalizedBytes.readUInt8(5);
  if (messageType !== JETSON_BINARY_STEREO_FRAME_MESSAGE_TYPE) {
    throw new Error(
      `Unsupported binary stereo frame message type ${messageType}.`,
    );
  }

  const headerByteLength = normalizedBytes.readUInt32BE(8);
  const leftByteLength = normalizedBytes.readUInt32BE(12);
  const rightByteLength = normalizedBytes.readUInt32BE(16);
  const totalExpectedByteLength =
    JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE +
    headerByteLength +
    leftByteLength +
    rightByteLength;
  if (normalizedBytes.byteLength !== totalExpectedByteLength) {
    throw new Error(
      `Binary stereo frame message length ${normalizedBytes.byteLength} bytes does not match expected ${totalExpectedByteLength} bytes.`,
    );
  }

  const headerStartOffset = JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE;
  const headerEndOffset = headerStartOffset + headerByteLength;
  const leftStartOffset = headerEndOffset;
  const leftEndOffset = leftStartOffset + leftByteLength;
  const rightStartOffset = leftEndOffset;
  const rightEndOffset = rightStartOffset + rightByteLength;

  let envelope;
  try {
    envelope = JSON.parse(
      normalizedBytes.toString("utf8", headerStartOffset, headerEndOffset),
    );
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to parse binary stereo frame header JSON: ${error.message}`
        : "Failed to parse binary stereo frame header JSON.",
    );
  }

  return {
    envelope,
    version,
    messageType,
    headerByteLength,
    leftByteLength,
    rightByteLength,
    leftImageBytes: normalizedBytes.subarray(leftStartOffset, leftEndOffset),
    rightImageBytes: normalizedBytes.subarray(rightStartOffset, rightEndOffset),
    totalByteLength: normalizedBytes.byteLength,
  };
}

function normalizeBinaryBytes(value, fieldName) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  throw new TypeError(`${fieldName} must be a Buffer or Uint8Array.`);
}

function assertFitsUint32(value, fieldName) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(
      `${fieldName} byte length must fit inside an unsigned 32-bit integer.`,
    );
  }
}
