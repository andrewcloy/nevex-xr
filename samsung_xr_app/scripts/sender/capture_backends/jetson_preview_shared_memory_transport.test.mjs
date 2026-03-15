import fs from "node:fs/promises";
import { closeSync, openSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JetsonPreviewSharedMemoryTransport } from "./jetson_preview_shared_memory_transport.mjs";

describe("JetsonPreviewSharedMemoryTransport", () => {
  it("reuses scratch payload storage across sequential frame reads", async () => {
    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "jetson-preview-shm-transport-"),
    );
    const transportPath = path.join(tempDirectory, "preview.bin");
    const slotSizeBytes = 4096;
    const slotCount = 3;

    try {
      const fileDescriptor = openSync(transportPath, "w+");
      closeSync(fileDescriptor);
      await fs.truncate(transportPath, slotSizeBytes * slotCount);

      const transport = new JetsonPreviewSharedMemoryTransport({
        path: transportPath,
        slotCount,
        slotSizeBytes,
        fileDescriptor: openSync(transportPath, "r+"),
      });

      try {
        const firstFramePayload = createSharedMemoryFramePayload({
          frameId: 1,
          timestampMs: 1000,
          slotIndex: 0,
          slotGeneration: 1,
          leftBytes: Buffer.from("left-frame-one", "utf8"),
          rightBytes: Buffer.from("right-frame-one", "utf8"),
          slotSizeBytes,
          transportPath,
        });
        const firstFrame = transport.readFramePair(firstFramePayload);
        expect(firstFrame.leftBytes.toString("utf8")).toBe("left-frame-one");
        expect(firstFrame.rightBytes.toString("utf8")).toBe("right-frame-one");

        const firstSharedArrayBuffer = firstFrame.leftBytes.buffer;

        const secondFramePayload = createSharedMemoryFramePayload({
          frameId: 2,
          timestampMs: 2000,
          slotIndex: 1,
          slotGeneration: 2,
          leftBytes: Buffer.from("left-frame-two", "utf8"),
          rightBytes: Buffer.from("right-frame-two", "utf8"),
          slotSizeBytes,
          transportPath,
        });
        const secondFrame = transport.readFramePair(secondFramePayload);
        expect(secondFrame.leftBytes.toString("utf8")).toBe("left-frame-two");
        expect(secondFrame.rightBytes.toString("utf8")).toBe("right-frame-two");
        expect(secondFrame.leftBytes.buffer).toBe(firstSharedArrayBuffer);
        expect(secondFrame.rightBytes.buffer).toBe(firstSharedArrayBuffer);
      } finally {
        transport.close({
          unlink: false,
        });
      }
    } finally {
      await fs.rm(tempDirectory, {
        recursive: true,
        force: true,
      });
    }
  });
});

function createSharedMemoryFramePayload(options) {
  const headerSize = 64;
  const payloadBuffer = Buffer.alloc(options.slotSizeBytes);
  payloadBuffer.write("NXSM", 0, "ascii");
  payloadBuffer[4] = 1;
  payloadBuffer[5] = 2;
  payloadBuffer.writeBigUInt64BE(BigInt(options.slotGeneration), 8);
  payloadBuffer.writeBigUInt64BE(BigInt(options.frameId), 16);
  payloadBuffer.writeBigUInt64BE(BigInt(options.timestampMs), 24);
  payloadBuffer.writeUInt32BE(options.leftBytes.byteLength, 32);
  payloadBuffer.writeUInt32BE(options.rightBytes.byteLength, 36);
  payloadBuffer.writeUInt32BE(
    options.leftBytes.byteLength + options.rightBytes.byteLength,
    40,
  );
  options.leftBytes.copy(payloadBuffer, headerSize);
  options.rightBytes.copy(
    payloadBuffer,
    headerSize + options.leftBytes.byteLength,
  );

  const fileDescriptor = openSync(options.transportPath, "r+");
  try {
    writeSync(
      fileDescriptor,
      payloadBuffer,
      0,
      payloadBuffer.byteLength,
      options.slotIndex * options.slotSizeBytes,
    );
  } finally {
    closeSync(fileDescriptor);
  }

  return {
    frame_id: options.frameId,
    transport_mode: "shared_memory",
    shared_memory: {
      slot_index: options.slotIndex,
      slot_generation: options.slotGeneration,
      slot_size_bytes: options.slotSizeBytes,
      slot_count: 3,
      slot_header_size_bytes: headerSize,
      left_offset_bytes: headerSize,
      left_byte_size: options.leftBytes.byteLength,
      right_offset_bytes: headerSize + options.leftBytes.byteLength,
      right_byte_size: options.rightBytes.byteLength,
    },
  };
}
