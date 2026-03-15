import type { JetsonMessageEnvelopeBase } from "./jetson_message_envelope";
import type { JetsonStereoFramePayload } from "./jetson_transport_payloads";

export const JETSON_BINARY_STEREO_FRAME_MAGIC = "JSBF";
export const JETSON_BINARY_STEREO_FRAME_MESSAGE_VERSION = 1;
export const JETSON_BINARY_STEREO_FRAME_MESSAGE_TYPE = 1;
export const JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE = 20;

const textDecoder = new TextDecoder();

export interface JetsonBinaryStereoFrameMessageDecodeOptions {
  readonly maxHeaderBytes?: number;
  readonly maxImagePayloadBytes?: number;
  readonly createObjectUrl?: (blob: Blob) => string;
}

export interface DecodedJetsonBinaryStereoFrameMessage {
  readonly envelope: JetsonMessageEnvelopeBase<"stereo_frame">;
  readonly objectUrls: readonly string[];
  readonly messageSizeBytes: number;
  readonly leftByteLength: number;
  readonly rightByteLength: number;
}

export function decodeJetsonBinaryStereoFrameMessage(
  messageBytes: ArrayBuffer | Uint8Array,
  options: JetsonBinaryStereoFrameMessageDecodeOptions = {},
): DecodedJetsonBinaryStereoFrameMessage {
  const normalizedBytes = normalizeBinaryBytes(messageBytes);
  if (normalizedBytes.byteLength < JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE) {
    throw new Error(
      `Binary stereo frame message must be at least ${JETSON_BINARY_STEREO_FRAME_FIXED_HEADER_SIZE} bytes.`,
    );
  }

  const magic = textDecoder.decode(
    normalizedBytes.subarray(0, JETSON_BINARY_STEREO_FRAME_MAGIC.length),
  );
  if (magic !== JETSON_BINARY_STEREO_FRAME_MAGIC) {
    throw new Error("Binary stereo frame message has an invalid magic header.");
  }

  const version = normalizedBytes[4];
  if (version !== JETSON_BINARY_STEREO_FRAME_MESSAGE_VERSION) {
    throw new Error(`Unsupported binary stereo frame message version ${version}.`);
  }

  const messageType = normalizedBytes[5];
  if (messageType !== JETSON_BINARY_STEREO_FRAME_MESSAGE_TYPE) {
    throw new Error(
      `Unsupported binary stereo frame message type ${messageType}.`,
    );
  }

  const headerByteLength = readUint32BE(normalizedBytes, 8);
  const leftByteLength = readUint32BE(normalizedBytes, 12);
  const rightByteLength = readUint32BE(normalizedBytes, 16);

  if (
    options.maxHeaderBytes !== undefined &&
    options.maxHeaderBytes > 0 &&
    headerByteLength > options.maxHeaderBytes
  ) {
    throw new Error(
      `payload.header: serialized payload size ${headerByteLength} bytes exceeds limit ${options.maxHeaderBytes} bytes.`,
    );
  }

  if (
    options.maxImagePayloadBytes !== undefined &&
    options.maxImagePayloadBytes > 0
  ) {
    if (leftByteLength > options.maxImagePayloadBytes) {
      throw new Error(
        `payload.left.image: serialized payload size ${leftByteLength} bytes exceeds limit ${options.maxImagePayloadBytes} bytes.`,
      );
    }
    if (rightByteLength > options.maxImagePayloadBytes) {
      throw new Error(
        `payload.right.image: serialized payload size ${rightByteLength} bytes exceeds limit ${options.maxImagePayloadBytes} bytes.`,
      );
    }
  }

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

  const rawEnvelope = parseHeaderEnvelope(
    normalizedBytes.subarray(headerStartOffset, headerEndOffset),
  );
  const payloadRecord = ensureRecord(rawEnvelope.payload, "envelope.payload");
  const leftRecord = ensureRecord(payloadRecord.left, "envelope.payload.left");
  const rightRecord = ensureRecord(payloadRecord.right, "envelope.payload.right");
  const leftMimeType = resolveEyeMimeType(leftRecord, "envelope.payload.left");
  const rightMimeType = resolveEyeMimeType(rightRecord, "envelope.payload.right");
  const createObjectUrl = options.createObjectUrl ?? defaultCreateObjectUrl;
  const leftPayload = leftRecord as unknown as JetsonStereoFramePayload["left"];
  const rightPayload = rightRecord as unknown as JetsonStereoFramePayload["right"];
  const createdObjectUrls: string[] = [];
  try {
    const leftUrl = createObjectUrl(
      new Blob([Uint8Array.from(normalizedBytes.subarray(leftStartOffset, leftEndOffset))], {
        type: leftMimeType,
      }),
    );
    createdObjectUrls.push(leftUrl);
    const rightUrl = createObjectUrl(
      new Blob([
        Uint8Array.from(normalizedBytes.subarray(rightStartOffset, rightEndOffset)),
      ], {
        type: rightMimeType,
      }),
    );
    createdObjectUrls.push(rightUrl);

    return {
      envelope: {
        ...rawEnvelope,
        messageType: "stereo_frame",
        payload: {
          ...(payloadRecord as Omit<JetsonStereoFramePayload, "left" | "right">),
          left: {
            ...leftPayload,
            image: {
              imageUrl: leftUrl,
              mimeType: leftMimeType,
            },
          },
          right: {
            ...rightPayload,
            image: {
              imageUrl: rightUrl,
              mimeType: rightMimeType,
            },
          },
        },
      } as JetsonMessageEnvelopeBase<"stereo_frame">,
      objectUrls: [leftUrl, rightUrl],
      messageSizeBytes: normalizedBytes.byteLength,
      leftByteLength,
      rightByteLength,
    };
  } catch (error) {
    revokeJetsonBinaryStereoFrameObjectUrls(createdObjectUrls);
    throw error;
  }
}

export function revokeJetsonBinaryStereoFrameObjectUrls(
  objectUrls: readonly string[],
  revokeObjectUrl: (url: string) => void = defaultRevokeObjectUrl,
): void {
  for (const objectUrl of objectUrls) {
    revokeObjectUrl(objectUrl);
  }
}

function parseHeaderEnvelope(headerBytes: Uint8Array): Record<string, unknown> {
  const headerText = textDecoder.decode(headerBytes);
  let parsed: unknown;

  try {
    parsed = JSON.parse(headerText) as unknown;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to parse binary stereo frame header JSON: ${error.message}`
        : "Failed to parse binary stereo frame header JSON.",
    );
  }

  const envelopeRecord = ensureRecord(parsed, "envelope");
  if (envelopeRecord.messageType !== "stereo_frame") {
    throw new Error("Binary stereo frame header must describe a stereo_frame.");
  }

  return envelopeRecord;
}

function resolveEyeMimeType(
  eyeRecord: Record<string, unknown>,
  fieldPath: string,
): string {
  const metadataRecord = ensureRecord(eyeRecord.metadata, `${fieldPath}.metadata`);
  const mimeType = metadataRecord.mimeType;
  if (typeof mimeType !== "string" || !/^image\/[a-zA-Z0-9.+-]+$/i.test(mimeType)) {
    throw new Error(
      `${fieldPath}.metadata.mimeType must be a valid image MIME type for binary transport.`,
    );
  }

  return mimeType;
}

function ensureRecord(
  value: unknown,
  fieldPath: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldPath} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function normalizeBinaryBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  throw new Error("Binary stereo frame message must be an ArrayBuffer or Uint8Array.");
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dataView.getUint32(offset, false);
}

function defaultCreateObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function defaultRevokeObjectUrl(objectUrl: string): void {
  URL.revokeObjectURL(objectUrl);
}
