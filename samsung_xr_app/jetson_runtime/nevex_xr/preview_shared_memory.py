from __future__ import annotations

import mmap
import os
import struct
from dataclasses import dataclass
from pathlib import Path

PREVIEW_SHM_SLOT_MAGIC = b"NXSM"
PREVIEW_SHM_SLOT_VERSION = 1
PREVIEW_SHM_SLOT_STATE_EMPTY = 0
PREVIEW_SHM_SLOT_STATE_WRITING = 1
PREVIEW_SHM_SLOT_STATE_READY = 2
PREVIEW_SHM_SLOT_HEADER_STRUCT = struct.Struct(">4sBBHQQQIII20x")
PREVIEW_SHM_SLOT_HEADER_SIZE = PREVIEW_SHM_SLOT_HEADER_STRUCT.size


@dataclass(frozen=True)
class PreviewSharedMemoryConfig:
    path: Path
    slot_count: int
    slot_size_bytes: int

    @property
    def total_size_bytes(self) -> int:
        return self.slot_count * self.slot_size_bytes

    @property
    def slot_payload_capacity_bytes(self) -> int:
        return self.slot_size_bytes - PREVIEW_SHM_SLOT_HEADER_SIZE


class PreviewSharedMemoryWriter:
    def __init__(self, config: PreviewSharedMemoryConfig) -> None:
        if config.slot_count < 2:
            raise ValueError("Preview shared memory slot_count must be at least 2.")
        if config.slot_size_bytes <= PREVIEW_SHM_SLOT_HEADER_SIZE:
            raise ValueError(
                "Preview shared memory slot_size_bytes must be larger than the slot header size.",
            )

        self.config = config
        self.path = config.path
        self._file_handle = None
        self._mapping: mmap.mmap | None = None
        self._next_slot_index = 0
        self._next_generation = 1

    def open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._file_handle = self.path.open("r+b")
        self._mapping = mmap.mmap(
            self._file_handle.fileno(),
            self.config.total_size_bytes,
            access=mmap.ACCESS_WRITE,
        )

    def close(self) -> None:
        if self._mapping is not None:
            self._mapping.close()
            self._mapping = None
        if self._file_handle is not None:
            self._file_handle.close()
            self._file_handle = None

    def write_paired_frame(
        self,
        *,
        frame_id: int,
        timestamp_ms: int,
        left_jpeg_bytes: bytes,
        right_jpeg_bytes: bytes,
    ) -> dict[str, int]:
        if self._mapping is None:
            raise RuntimeError("Preview shared memory writer is not open.")

        left_size = len(left_jpeg_bytes)
        right_size = len(right_jpeg_bytes)
        total_payload_size = left_size + right_size
        if total_payload_size > self.config.slot_payload_capacity_bytes:
            raise RuntimeError(
                "Preview shared memory slot is too small for the current stereo frame. "
                f"capacity={self.config.slot_payload_capacity_bytes} bytes "
                f"required={total_payload_size} bytes",
            )

        slot_index = self._next_slot_index
        slot_generation = self._next_generation
        slot_offset = slot_index * self.config.slot_size_bytes
        payload_offset = slot_offset + PREVIEW_SHM_SLOT_HEADER_SIZE
        left_offset = payload_offset
        right_offset = payload_offset + left_size

        self._write_slot_header(
            slot_offset=slot_offset,
            state=PREVIEW_SHM_SLOT_STATE_WRITING,
            generation=slot_generation,
            frame_id=frame_id,
            timestamp_ms=timestamp_ms,
            left_size=0,
            right_size=0,
        )
        self._mapping[left_offset : left_offset + left_size] = left_jpeg_bytes
        self._mapping[right_offset : right_offset + right_size] = right_jpeg_bytes
        self._write_slot_header(
            slot_offset=slot_offset,
            state=PREVIEW_SHM_SLOT_STATE_READY,
            generation=slot_generation,
            frame_id=frame_id,
            timestamp_ms=timestamp_ms,
            left_size=left_size,
            right_size=right_size,
        )

        self._next_slot_index = (self._next_slot_index + 1) % self.config.slot_count
        self._next_generation += 1
        return {
            "slot_index": slot_index,
            "slot_generation": slot_generation,
            "slot_size_bytes": self.config.slot_size_bytes,
            "slot_count": self.config.slot_count,
            "slot_header_size_bytes": PREVIEW_SHM_SLOT_HEADER_SIZE,
            "left_offset_bytes": PREVIEW_SHM_SLOT_HEADER_SIZE,
            "left_byte_size": left_size,
            "right_offset_bytes": PREVIEW_SHM_SLOT_HEADER_SIZE + left_size,
            "right_byte_size": right_size,
        }

    def _write_slot_header(
        self,
        *,
        slot_offset: int,
        state: int,
        generation: int,
        frame_id: int,
        timestamp_ms: int,
        left_size: int,
        right_size: int,
    ) -> None:
        if self._mapping is None:
            raise RuntimeError("Preview shared memory writer is not open.")

        payload_size = left_size + right_size
        header_bytes = PREVIEW_SHM_SLOT_HEADER_STRUCT.pack(
            PREVIEW_SHM_SLOT_MAGIC,
            PREVIEW_SHM_SLOT_VERSION,
            state,
            0,
            generation,
            frame_id,
            timestamp_ms,
            left_size,
            right_size,
            payload_size,
        )
        self._mapping[slot_offset : slot_offset + PREVIEW_SHM_SLOT_HEADER_SIZE] = header_bytes


def create_preview_shared_memory_file(
    path: Path,
    *,
    slot_count: int,
    slot_size_bytes: int,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    total_size_bytes = slot_count * slot_size_bytes
    with path.open("wb") as file_handle:
        file_handle.truncate(total_size_bytes)
