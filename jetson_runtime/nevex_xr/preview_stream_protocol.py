from __future__ import annotations

import json
import struct
from typing import Any

PREVIEW_STREAM_MAGIC = b"NXPP"
PREVIEW_STREAM_VERSION = 1
PREVIEW_STATUS_MESSAGE_TYPE = 1
PREVIEW_FRAME_MESSAGE_TYPE = 2
PREVIEW_FRAME_SHARED_MEMORY_MESSAGE_TYPE = 3
PREVIEW_MESSAGE_HEADER_SIZE = 10
FRAME_HEADER_LENGTH_SIZE = 4
MAX_PREVIEW_MESSAGE_PAYLOAD_BYTES = 64 * 1024 * 1024


def encode_status_message(payload: dict[str, Any]) -> bytes:
    payload_bytes = _encode_json_payload(payload)
    return _encode_message(PREVIEW_STATUS_MESSAGE_TYPE, payload_bytes)


def encode_frame_message(
    header_payload: dict[str, Any],
    left_jpeg_bytes: bytes,
    right_jpeg_bytes: bytes,
) -> bytes:
    normalized_header = dict(header_payload)
    normalized_header["left"] = {
        **dict(header_payload.get("left", {})),
        "byte_size": len(left_jpeg_bytes),
    }
    normalized_header["right"] = {
        **dict(header_payload.get("right", {})),
        "byte_size": len(right_jpeg_bytes),
    }
    header_bytes = _encode_json_payload(normalized_header)
    frame_payload = (
        struct.pack(">I", len(header_bytes))
        + header_bytes
        + left_jpeg_bytes
        + right_jpeg_bytes
    )
    return _encode_message(PREVIEW_FRAME_MESSAGE_TYPE, frame_payload)


def encode_shared_memory_frame_message(header_payload: dict[str, Any]) -> bytes:
    payload_bytes = _encode_json_payload(header_payload)
    return _encode_message(PREVIEW_FRAME_SHARED_MEMORY_MESSAGE_TYPE, payload_bytes)


def _encode_json_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def _encode_message(message_type: int, payload_bytes: bytes) -> bytes:
    if len(payload_bytes) > MAX_PREVIEW_MESSAGE_PAYLOAD_BYTES:
        raise ValueError(
            "Preview transport payload exceeds the configured safety limit.",
        )
    if message_type not in {
        PREVIEW_STATUS_MESSAGE_TYPE,
        PREVIEW_FRAME_MESSAGE_TYPE,
        PREVIEW_FRAME_SHARED_MEMORY_MESSAGE_TYPE,
    }:
        raise ValueError(f"Unsupported preview transport message type: {message_type}")

    return (
        PREVIEW_STREAM_MAGIC
        + bytes((PREVIEW_STREAM_VERSION, message_type))
        + struct.pack(">I", len(payload_bytes))
        + payload_bytes
    )
