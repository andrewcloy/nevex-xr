import { describe, expect, it, vi } from "vitest";
import {
  buildStereoFrameEnvelope,
  parseJetsonMessageEnvelope,
} from "./jetson_message_envelope";
import {
  decodeJetsonBinaryStereoFrameMessage,
  revokeJetsonBinaryStereoFrameObjectUrls,
} from "./jetson_binary_stereo_frame_message";
import {
  createSampleJetsonStereoFramePayload,
  mapJetsonFramePayloadToStereoFrame,
} from "./jetson_transport_payloads";

describe("jetson binary stereo frame message", () => {
  it("decodes a binary stereo_frame message into blob-backed image URLs", () => {
    const sourcePayload = createSampleJetsonStereoFramePayload(
      14,
      "binary_fixture_stream",
    );
    const headerEnvelope = buildStereoFrameEnvelope(
      {
        ...sourcePayload,
        left: {
          ...sourcePayload.left,
          image: undefined,
          metadata: {
            mimeType: "image/jpeg",
            byteSize: 9,
          },
        },
        right: {
          ...sourcePayload.right,
          image: undefined,
          metadata: {
            mimeType: "image/jpeg",
            byteSize: 10,
          },
        },
      },
      {
        timestampMs: 2000,
        sequence: 22,
      },
    );

    const decoded = decodeJetsonBinaryStereoFrameMessage(
      createBinaryMessage({
        envelope: headerEnvelope,
        leftBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
        rightBytes: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
      }),
      {
        createObjectUrl: vi
          .fn<(blob: Blob) => string>()
          .mockImplementation((blob) => `blob:test/${blob.size}`),
      },
    );

    expect(decoded.objectUrls).toEqual(["blob:test/9", "blob:test/10"]);

    const parsedEnvelope = parseJetsonMessageEnvelope(decoded.envelope);
    expect(parsedEnvelope.messageType).toBe("stereo_frame");
    if (parsedEnvelope.messageType !== "stereo_frame") {
      throw new Error("Expected a stereo_frame envelope.");
    }

    const frame = mapJetsonFramePayloadToStereoFrame(parsedEnvelope.payload);
    expect(frame.left.imageContent?.sourceKind).toBe("uri");
    expect(frame.left.imageContent?.src).toBe("blob:test/9");
    expect(frame.right.imageContent?.src).toBe("blob:test/10");
  });

  it("revokes decoded object URLs when asked", () => {
    const revokeObjectUrl = vi.fn<(url: string) => void>();

    revokeJetsonBinaryStereoFrameObjectUrls(
      ["blob:test/1", "blob:test/2"],
      revokeObjectUrl,
    );

    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenNthCalledWith(1, "blob:test/1");
    expect(revokeObjectUrl).toHaveBeenNthCalledWith(2, "blob:test/2");
  });
});

function createBinaryMessage(options: {
  readonly envelope: unknown;
  readonly leftBytes: Uint8Array;
  readonly rightBytes: Uint8Array;
}): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(options.envelope));
  const fixedHeaderSize = 20;
  const output = new Uint8Array(
    fixedHeaderSize +
      headerBytes.byteLength +
      options.leftBytes.byteLength +
      options.rightBytes.byteLength,
  );
  const dataView = new DataView(output.buffer);

  output.set(new TextEncoder().encode("JSBF"), 0);
  dataView.setUint8(4, 1);
  dataView.setUint8(5, 1);
  dataView.setUint16(6, 0, false);
  dataView.setUint32(8, headerBytes.byteLength, false);
  dataView.setUint32(12, options.leftBytes.byteLength, false);
  dataView.setUint32(16, options.rightBytes.byteLength, false);
  output.set(headerBytes, fixedHeaderSize);
  output.set(options.leftBytes, fixedHeaderSize + headerBytes.byteLength);
  output.set(
    options.rightBytes,
    fixedHeaderSize + headerBytes.byteLength + options.leftBytes.byteLength,
  );

  return output;
}
