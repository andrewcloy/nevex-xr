import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  ftruncateSync,
  openSync,
  readSync,
  unlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const PREVIEW_SHM_SLOT_MAGIC = Buffer.from("NXSM", "ascii");
const PREVIEW_SHM_SLOT_VERSION = 1;
const PREVIEW_SHM_SLOT_STATE_READY = 2;
const PREVIEW_SHM_SLOT_HEADER_SIZE = 64;
const DEFAULT_PREVIEW_SHM_SLOT_COUNT = 3;
const DEFAULT_PREVIEW_SHM_SLOT_SIZE_BYTES = 8 * 1024 * 1024;

export class JetsonPreviewSharedMemoryTransport {
  constructor(options) {
    this.path = options.path;
    this.slotCount = options.slotCount;
    this.slotSizeBytes = options.slotSizeBytes;
    this.fileDescriptor = options.fileDescriptor;
    this.headerScratchBuffer = Buffer.allocUnsafe(PREVIEW_SHM_SLOT_HEADER_SIZE);
    this.payloadScratchBuffer = Buffer.allocUnsafe(0);
  }

  static create(options = {}) {
    const slotCount = resolvePositiveInteger(
      options.slotCount ?? DEFAULT_PREVIEW_SHM_SLOT_COUNT,
      "slotCount",
      {
        minimum: 2,
      },
    );
    const slotSizeBytes = resolvePositiveInteger(
      options.slotSizeBytes ?? DEFAULT_PREVIEW_SHM_SLOT_SIZE_BYTES,
      "slotSizeBytes",
      {
        minimum: PREVIEW_SHM_SLOT_HEADER_SIZE + 1,
      },
    );
    const parentDirectory = resolvePreferredSharedMemoryDirectory(
      options.preferredDirectory,
    );
    const filename = `nevex_preview_${process.pid}_${Date.now()}_${randomUUID()}.bin`;
    const transportPath = path.join(parentDirectory, filename);
    const fileDescriptor = openSync(transportPath, "w+");
    ftruncateSync(fileDescriptor, slotCount * slotSizeBytes);
    return new JetsonPreviewSharedMemoryTransport({
      path: transportPath,
      slotCount,
      slotSizeBytes,
      fileDescriptor,
    });
  }

  buildPublisherArgs() {
    return [
      "--preview-shm-path",
      this.path,
      "--preview-shm-slot-count",
      String(this.slotCount),
      "--preview-shm-slot-size-bytes",
      String(this.slotSizeBytes),
    ];
  }

  readFramePair(framePayload) {
    const sharedMemoryPayload = ensureObjectPayload(
      framePayload?.shared_memory,
      "preview shared-memory metadata",
    );
    const slotIndex = resolvePositiveInteger(
      sharedMemoryPayload.slot_index,
      "slot_index",
      {
        minimum: 0,
        maximum: this.slotCount - 1,
      },
    );
    const slotGeneration = resolvePositiveInteger(
      sharedMemoryPayload.slot_generation,
      "slot_generation",
      {
        minimum: 1,
      },
    );
    const leftByteSize = resolvePositiveInteger(
      sharedMemoryPayload.left_byte_size,
      "left_byte_size",
      {
        minimum: 0,
      },
    );
    const rightByteSize = resolvePositiveInteger(
      sharedMemoryPayload.right_byte_size,
      "right_byte_size",
      {
        minimum: 0,
      },
    );
    const slotHeaderSize = resolvePositiveInteger(
      sharedMemoryPayload.slot_header_size_bytes,
      "slot_header_size_bytes",
      {
        minimum: PREVIEW_SHM_SLOT_HEADER_SIZE,
      },
    );
    const leftOffset = resolvePositiveInteger(
      sharedMemoryPayload.left_offset_bytes,
      "left_offset_bytes",
      {
        minimum: slotHeaderSize,
      },
    );
    const rightOffset = resolvePositiveInteger(
      sharedMemoryPayload.right_offset_bytes,
      "right_offset_bytes",
      {
        minimum: leftOffset + leftByteSize,
      },
    );
    if (rightOffset !== leftOffset + leftByteSize) {
      throw new Error(
        "Preview shared-memory slot metadata must describe a contiguous left/right payload layout.",
      );
    }
    const slotOffset = slotIndex * this.slotSizeBytes;
    const headerBefore = this.readSlotHeader(slotOffset);
    validateSlotHeader(headerBefore, {
      slotGeneration,
      frameId: framePayload?.frame_id,
      leftByteSize,
      rightByteSize,
    });

    const expectedPayloadBytes = leftByteSize + rightByteSize;
    const payloadStartOffset = slotOffset + leftOffset;
    const payloadBytes = this.acquirePayloadScratchBuffer(expectedPayloadBytes);
    if (expectedPayloadBytes > 0) {
      readExactly(
        this.fileDescriptor,
        payloadBytes,
        expectedPayloadBytes,
        payloadStartOffset,
      );
    }

    const headerAfter = this.readSlotHeader(slotOffset);
    validateSlotHeader(headerAfter, {
      slotGeneration,
      frameId: framePayload?.frame_id,
      leftByteSize,
      rightByteSize,
    });

    if (
      headerAfter.generation !== headerBefore.generation ||
      headerAfter.frameId !== headerBefore.frameId ||
      headerAfter.leftByteSize !== headerBefore.leftByteSize ||
      headerAfter.rightByteSize !== headerBefore.rightByteSize
    ) {
      throw new Error(
        "Preview shared-memory slot changed while the sender was reading it.",
      );
    }

    const leftBytes = payloadBytes.subarray(0, leftByteSize);
    const rightBytes = payloadBytes.subarray(leftByteSize, expectedPayloadBytes);
    return {
      leftBytes,
      rightBytes,
    };
  }

  readSlotHeader(slotOffset) {
    const headerBuffer = this.headerScratchBuffer;
    readExactly(
      this.fileDescriptor,
      headerBuffer,
      PREVIEW_SHM_SLOT_HEADER_SIZE,
      slotOffset,
    );
    if (!headerBuffer.subarray(0, 4).equals(PREVIEW_SHM_SLOT_MAGIC)) {
      throw new Error("Preview shared-memory slot magic header mismatch.");
    }

    const version = headerBuffer[4];
    if (version !== PREVIEW_SHM_SLOT_VERSION) {
      throw new Error(
        `Unsupported preview shared-memory slot version: ${version}.`,
      );
    }

    return {
      version,
      state: headerBuffer[5],
      generation: Number(headerBuffer.readBigUInt64BE(8)),
      frameId: Number(headerBuffer.readBigUInt64BE(16)),
      timestampMs: Number(headerBuffer.readBigUInt64BE(24)),
      leftByteSize: headerBuffer.readUInt32BE(32),
      rightByteSize: headerBuffer.readUInt32BE(36),
      payloadByteSize: headerBuffer.readUInt32BE(40),
    };
  }

  close(options = {}) {
    try {
      if (typeof this.fileDescriptor === "number") {
        closeSync(this.fileDescriptor);
      }
    } finally {
      this.fileDescriptor = undefined;
      if (options.unlink !== false) {
        try {
          unlinkSync(this.path);
        } catch {}
      }
    }
  }

  acquirePayloadScratchBuffer(requiredByteLength) {
    if (requiredByteLength <= 0) {
      return Buffer.allocUnsafe(0);
    }
    if (this.payloadScratchBuffer.byteLength < requiredByteLength) {
      this.payloadScratchBuffer = Buffer.allocUnsafe(requiredByteLength);
    }
    return this.payloadScratchBuffer.subarray(0, requiredByteLength);
  }
}

function resolvePreferredSharedMemoryDirectory(preferredDirectory) {
  if (typeof preferredDirectory === "string" && preferredDirectory.trim().length > 0) {
    return preferredDirectory;
  }
  if (process.platform === "linux" && existsSync("/dev/shm")) {
    return "/dev/shm";
  }
  return os.tmpdir();
}

function ensureObjectPayload(payload, description) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error(`Expected ${description} to be a JSON object.`);
  }

  return payload;
}

function resolvePositiveInteger(value, label, options = {}) {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  if (options.minimum !== undefined && value < options.minimum) {
    throw new Error(`${label} must be >= ${options.minimum}.`);
  }
  if (options.maximum !== undefined && value > options.maximum) {
    throw new Error(`${label} must be <= ${options.maximum}.`);
  }
  return value;
}

function validateSlotHeader(header, expected) {
  if (header.state !== PREVIEW_SHM_SLOT_STATE_READY) {
    throw new Error(
      `Preview shared-memory slot is not ready for reading (state=${header.state}).`,
    );
  }
  if (header.generation !== expected.slotGeneration) {
    throw new Error(
      `Preview shared-memory slot generation mismatch. expected=${expected.slotGeneration} actual=${header.generation}`,
    );
  }
  if (
    Number.isInteger(expected.frameId) &&
    header.frameId !== expected.frameId
  ) {
    throw new Error(
      `Preview shared-memory slot frame_id mismatch. expected=${expected.frameId} actual=${header.frameId}`,
    );
  }
  if (
    header.leftByteSize !== expected.leftByteSize ||
    header.rightByteSize !== expected.rightByteSize
  ) {
    throw new Error(
      "Preview shared-memory slot byte sizes do not match the announced frame metadata.",
    );
  }
}

function readExactly(fileDescriptor, targetBuffer, byteCount, filePosition) {
  let totalRead = 0;
  while (totalRead < byteCount) {
    const bytesRead = readSync(
      fileDescriptor,
      targetBuffer,
      totalRead,
      byteCount - totalRead,
      filePosition + totalRead,
    );
    if (bytesRead <= 0) {
      throw new Error(
        `Unexpected EOF while reading preview shared-memory data at position ${filePosition + totalRead}.`,
      );
    }
    totalRead += bytesRead;
  }
}
