import { describe, expect, it } from "vitest";
import {
  encodePreviewSharedMemoryFrameMessage,
  encodePreviewStatusMessage,
  JetsonPreviewPublisherStreamParser,
} from "./jetson_preview_publisher_stream_protocol.mjs";

describe("JetsonPreviewPublisherStreamParser", () => {
  it("parses status and frame messages across fragmented chunks", () => {
    const parser = new JetsonPreviewPublisherStreamParser();
    const statusMessage = encodePreviewStatusMessage({
      event_type: "preview_status",
      preview_state: "starting",
      status_text: "Starting Jetson preview publisher.",
      timestamp_ms: 1710201600000,
      profile_name: "headset_preview_720p60",
      publish_fps: 5,
      frames_emitted: 0,
      last_frame_id: null,
    });
    const frameMessage = encodePreviewSharedMemoryFrameMessage({
      event_type: "preview_frame",
      mode: "stereo-preview-publisher",
      transport_mode: "shared_memory",
      frame_id: 3,
      timestamp_ms: 1710201600123,
      profile_name: "headset_preview_720p60",
      publish_fps: 5,
      left: {
        eye: "left",
        sequence_id: 7,
        received_at_ms: 1710201600100,
        mime_type: "image/jpeg",
        image_width: 1280,
        image_height: 720,
        byte_size: 16,
      },
      right: {
        eye: "right",
        sequence_id: 8,
        received_at_ms: 1710201600110,
        mime_type: "image/jpeg",
        image_width: 1280,
        image_height: 720,
        byte_size: 17,
      },
      shared_memory: {
        slot_index: 1,
        slot_generation: 9,
        slot_size_bytes: 8388608,
        slot_count: 3,
        slot_header_size_bytes: 64,
        left_offset_bytes: 64,
        left_byte_size: 16,
        right_offset_bytes: 80,
        right_byte_size: 17,
      },
    });

    const combined = Buffer.concat([statusMessage, frameMessage]);
    const firstChunk = combined.subarray(0, 9);
    const secondChunk = combined.subarray(9, statusMessage.byteLength + 17);
    const thirdChunk = combined.subarray(statusMessage.byteLength + 17);

    expect(parser.pushChunk(firstChunk)).toEqual([]);

    const partialMessages = parser.pushChunk(secondChunk);
    expect(partialMessages).toHaveLength(1);
    expect(partialMessages[0]).toMatchObject({
      event_type: "preview_status",
      preview_state: "starting",
    });

    const remainingMessages = parser.pushChunk(thirdChunk);
    expect(remainingMessages).toHaveLength(1);
    expect(remainingMessages[0]).toMatchObject({
      event_type: "preview_frame",
      frame_id: 3,
      profile_name: "headset_preview_720p60",
      transport_mode: "shared_memory",
    });
    expect(remainingMessages[0].shared_memory).toMatchObject({
      slot_index: 1,
      slot_generation: 9,
      left_byte_size: 16,
      right_byte_size: 17,
    });
  });
});
