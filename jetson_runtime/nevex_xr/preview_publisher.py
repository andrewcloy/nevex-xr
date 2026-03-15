from __future__ import annotations

import os
import platform
import signal
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .config import AppConfig
from .preview_shared_memory import PreviewSharedMemoryConfig, PreviewSharedMemoryWriter
from .preview_stream_protocol import (
    encode_frame_message,
    encode_shared_memory_frame_message,
    encode_status_message,
)

PREVIEW_PUBLISHER_MODE = "stereo-preview-publisher"
PREVIEW_STATUS_EVENT_TYPE = "preview_status"
PREVIEW_FRAME_EVENT_TYPE = "preview_frame"
PREVIEW_IMAGE_MIME_TYPE = "image/jpeg"
JPEG_START_MARKER = b"\xff\xd8"
JPEG_END_MARKER = b"\xff\xd9"
JPEG_STREAM_BUFFER_LIMIT_BYTES = 16 * 1024 * 1024


@dataclass(frozen=True)
class PreviewPublisherEyeMetadata:
    eye: str
    sequence_id: int
    received_at_ms: int
    mime_type: str
    image_width: int
    image_height: int
    byte_size: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PreviewPublisherFrameHeader:
    event_type: str
    mode: str
    transport_mode: str
    frame_id: int
    timestamp_ms: int
    profile_name: str
    publish_fps: float
    left: PreviewPublisherEyeMetadata
    right: PreviewPublisherEyeMetadata
    shared_memory: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PreviewPublisherStatusEvent:
    event_type: str
    preview_state: str
    status_text: str
    timestamp_ms: int
    profile_name: str
    publish_fps: float
    frames_emitted: int
    last_frame_id: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class _EyeFrame:
    eye: str
    sequence_id: int
    received_at_ms: int
    jpeg_bytes: bytes


@dataclass(frozen=True)
class _PairedPreviewFrame:
    frame_id: int
    timestamp_ms: int
    left: _EyeFrame
    right: _EyeFrame


class PersistentStereoPreviewPublisher:
    def __init__(
        self,
        config: AppConfig,
        publish_fps: float,
        logger: Any,
        shared_memory_config: PreviewSharedMemoryConfig | None = None,
    ) -> None:
        self.config = config
        self.publish_fps = publish_fps
        self.publish_interval_seconds = 1.0 / publish_fps
        self.stall_threshold_seconds = max(self.publish_interval_seconds * 4.0, 1.0)
        self.logger = logger
        self.shared_memory_config = shared_memory_config
        self.shared_memory_writer = (
            PreviewSharedMemoryWriter(shared_memory_config)
            if shared_memory_config is not None
            else None
        )

        self.stop_event = threading.Event()
        self.stdout_lock = threading.Lock()
        self.eye_condition = threading.Condition()
        self.pair_condition = threading.Condition()
        self.state_lock = threading.Lock()

        self.pipeline_process: subprocess.Popen[bytes] | None = None
        self.left_stream_fd: int | None = None
        self.right_stream_fd: int | None = None
        self.threads: list[threading.Thread] = []

        self.left_sequence_id = 0
        self.right_sequence_id = 0
        self.latest_left_frame: _EyeFrame | None = None
        self.latest_right_frame: _EyeFrame | None = None
        self.last_paired_left_sequence_id = 0
        self.last_paired_right_sequence_id = 0

        self.latest_pair_version = 0
        self.latest_pair: _PairedPreviewFrame | None = None
        self.last_pair_received_monotonic: float | None = None
        self.last_emitted_pair_version = 0
        self.last_emitted_frame_id: int | None = None
        self.next_frame_id = 0
        self.frames_emitted = 0
        self.current_state = "unavailable"
        self.current_status_text = "Preview publisher idle."
        self.fatal_error_message: str | None = None

    def run(self) -> int:
        if platform.system() != "Linux":
            self.logger.error("Preview publisher requires Linux. Current host: %s", platform.system())
            return 1

        self._emit_status("starting", "Starting Jetson preview publisher.")
        try:
            if self.shared_memory_writer is not None:
                self.shared_memory_writer.open()
            self._start_pipeline_process()
            self._start_worker_threads()

            while not self.stop_event.is_set():
                if self.fatal_error_message is not None:
                    raise RuntimeError(self.fatal_error_message)
                if self.pipeline_process is not None:
                    return_code = self.pipeline_process.poll()
                    if return_code is not None:
                        raise RuntimeError(
                            f"Jetson preview pipeline exited unexpectedly with code {return_code}.",
                        )
                time.sleep(0.25)
            if self.fatal_error_message is not None:
                raise RuntimeError(self.fatal_error_message)
        except KeyboardInterrupt:
            self.logger.info("Preview publisher interrupted; shutting down.")
            self._try_emit_status("stopped", "Jetson preview publisher stopped.")
            return 0
        except Exception as error:
            self.logger.error("Preview publisher failed: %s", error)
            self._try_emit_status("stopped", f"Jetson preview publisher failed: {error}")
            return 1
        finally:
            self.stop()

        self._try_emit_status("stopped", "Jetson preview publisher stopped.")
        return 0

    def stop(self) -> None:
        self.stop_event.set()
        with self.eye_condition:
            self.eye_condition.notify_all()
        with self.pair_condition:
            self.pair_condition.notify_all()

        if self.pipeline_process is not None and self.pipeline_process.poll() is None:
            try:
                self.pipeline_process.send_signal(signal.SIGINT)
                self.pipeline_process.wait(timeout=self.config.runtime.shutdown_grace_seconds)
            except Exception:
                try:
                    self.pipeline_process.terminate()
                    self.pipeline_process.wait(timeout=self.config.runtime.shutdown_grace_seconds)
                except Exception:
                    self.pipeline_process.kill()
                    self.pipeline_process.wait(timeout=2)

        for stream_fd_name in ("left_stream_fd", "right_stream_fd"):
            stream_fd = getattr(self, stream_fd_name)
            if stream_fd is not None:
                try:
                    os.close(stream_fd)
                except OSError:
                    pass
                setattr(self, stream_fd_name, None)

        for thread in self.threads:
            thread.join(timeout=1.0)
        self.threads.clear()
        if self.shared_memory_writer is not None:
            self.shared_memory_writer.close()

    def _start_pipeline_process(self) -> None:
        left_stream_fd, left_write_fd = os.pipe()
        right_stream_fd, right_write_fd = os.pipe()
        self.left_stream_fd = left_stream_fd
        self.right_stream_fd = right_stream_fd

        environment = os.environ.copy()
        if self.config.runtime.gst_debug is not None:
            environment["GST_DEBUG"] = str(self.config.runtime.gst_debug)

        command = self._build_publisher_command(left_write_fd, right_write_fd)
        self.logger.info("Jetson preview publisher command: %s", " ".join(command))
        try:
            self.pipeline_process = subprocess.Popen(
                command,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                env=environment,
                pass_fds=(left_write_fd, right_write_fd),
            )
        except OSError as error:
            raise RuntimeError(f"Could not start the Jetson preview pipeline: {error}") from error
        finally:
            os.close(left_write_fd)
            os.close(right_write_fd)

    def _start_worker_threads(self) -> None:
        self._start_thread("left-preview-reader", self._read_eye_stream, "left", self.left_stream_fd)
        self._start_thread("right-preview-reader", self._read_eye_stream, "right", self.right_stream_fd)
        self._start_thread("preview-pairer", self._pair_frames_loop)
        self._start_thread("preview-emitter", self._emit_frames_loop)
        self._start_thread("preview-stderr", self._stream_pipeline_stderr)

    def _start_thread(self, name: str, target, *args) -> None:
        thread = threading.Thread(target=target, args=args, name=name, daemon=True)
        thread.start()
        self.threads.append(thread)

    def _build_publisher_command(self, left_fd: int, right_fd: int) -> list[str]:
        caps = (
            "video/x-raw(memory:NVMM),"
            f"width={self.config.camera.width},"
            f"height={self.config.camera.height},"
            f"framerate={self.config.camera.framerate_fraction}"
        )
        return [
            self.config.runtime.gst_launch_binary,
            "-e",
            "nvarguscamerasrc",
            f"sensor-id={self.config.camera.left_sensor_id}",
            "!",
            caps,
            "!",
            "nvvidconv",
            f"flip-method={self.config.camera.flip_method}",
            "!",
            "video/x-raw,format=I420",
            "!",
            "queue",
            "max-size-buffers=1",
            "leaky=downstream",
            "!",
            "jpegenc",
            f"quality={self.config.output.preview_jpeg_quality}",
            "!",
            "queue",
            "max-size-buffers=1",
            "leaky=downstream",
            "!",
            "fdsink",
            f"fd={left_fd}",
            "sync=false",
            "async=false",
            "nvarguscamerasrc",
            f"sensor-id={self.config.camera.right_sensor_id}",
            "!",
            caps,
            "!",
            "nvvidconv",
            f"flip-method={self.config.camera.flip_method}",
            "!",
            "video/x-raw,format=I420",
            "!",
            "queue",
            "max-size-buffers=1",
            "leaky=downstream",
            "!",
            "jpegenc",
            f"quality={self.config.output.preview_jpeg_quality}",
            "!",
            "queue",
            "max-size-buffers=1",
            "leaky=downstream",
            "!",
            "fdsink",
            f"fd={right_fd}",
            "sync=false",
            "async=false",
        ]

    def _read_eye_stream(self, eye: str, stream_fd: int | None) -> None:
        if stream_fd is None:
            self._set_fatal_error(f"{eye} preview stream file descriptor is unavailable.")
            return

        parser = _JpegStreamParser()
        try:
            with os.fdopen(stream_fd, "rb", buffering=0) as stream_handle:
                while not self.stop_event.is_set():
                    chunk = stream_handle.read(65536)
                    if not chunk:
                        if self.stop_event.is_set():
                            return
                        self._set_fatal_error(f"{eye} preview stream closed unexpectedly.")
                        return

                    for jpeg_bytes in parser.feed(chunk):
                        self._record_eye_frame(eye, jpeg_bytes)
        except Exception as error:
            if not self.stop_event.is_set():
                self._set_fatal_error(f"{eye} preview reader failed: {error}")

    def _record_eye_frame(self, eye: str, jpeg_bytes: bytes) -> None:
        received_at_ms = int(time.time() * 1000)
        with self.eye_condition:
            if eye == "left":
                self.left_sequence_id += 1
                self.latest_left_frame = _EyeFrame(
                    eye="left",
                    sequence_id=self.left_sequence_id,
                    received_at_ms=received_at_ms,
                    jpeg_bytes=jpeg_bytes,
                )
            else:
                self.right_sequence_id += 1
                self.latest_right_frame = _EyeFrame(
                    eye="right",
                    sequence_id=self.right_sequence_id,
                    received_at_ms=received_at_ms,
                    jpeg_bytes=jpeg_bytes,
                )
            self.eye_condition.notify_all()

    def _pair_frames_loop(self) -> None:
        while not self.stop_event.is_set():
            with self.eye_condition:
                paired_ready = self.eye_condition.wait_for(
                    lambda: self.stop_event.is_set()
                    or self.fatal_error_message is not None
                    or (
                        self.latest_left_frame is not None
                        and self.latest_right_frame is not None
                        and self.left_sequence_id > self.last_paired_left_sequence_id
                        and self.right_sequence_id > self.last_paired_right_sequence_id
                    ),
                    timeout=0.5,
                )
                if self.stop_event.is_set() or self.fatal_error_message is not None:
                    return
                if not paired_ready:
                    continue

                left_frame = self.latest_left_frame
                right_frame = self.latest_right_frame
                self.last_paired_left_sequence_id = self.left_sequence_id
                self.last_paired_right_sequence_id = self.right_sequence_id

            if left_frame is None or right_frame is None:
                continue

            self.next_frame_id += 1
            paired_frame = _PairedPreviewFrame(
                frame_id=self.next_frame_id,
                timestamp_ms=max(left_frame.received_at_ms, right_frame.received_at_ms),
                left=left_frame,
                right=right_frame,
            )
            with self.pair_condition:
                self.latest_pair = paired_frame
                self.latest_pair_version += 1
                self.last_pair_received_monotonic = time.monotonic()
                self.pair_condition.notify_all()

    def _emit_frames_loop(self) -> None:
        next_emit_deadline = time.monotonic()
        while not self.stop_event.is_set():
            pair_to_emit: _PairedPreviewFrame | None = None
            pair_version = self.last_emitted_pair_version
            now_monotonic = time.monotonic()

            with self.pair_condition:
                timeout_seconds = max(0.05, next_emit_deadline - now_monotonic)
                self.pair_condition.wait(timeout=timeout_seconds)
                if self.stop_event.is_set():
                    return

                now_monotonic = time.monotonic()
                if (
                    self.latest_pair is not None
                    and self.latest_pair_version > self.last_emitted_pair_version
                    and now_monotonic >= next_emit_deadline
                ):
                    pair_to_emit = self.latest_pair
                    pair_version = self.latest_pair_version

                last_pair_age_seconds = (
                    None
                    if self.last_pair_received_monotonic is None
                    else now_monotonic - self.last_pair_received_monotonic
                )

            if pair_to_emit is not None:
                self._emit_frame(pair_to_emit)
                self.last_emitted_pair_version = pair_version
                self.last_emitted_frame_id = pair_to_emit.frame_id
                self.frames_emitted += 1
                next_emit_deadline = time.monotonic() + self.publish_interval_seconds
                self._emit_status(
                    "live",
                    (
                        "Jetson preview publisher live. "
                        f"frame_id={pair_to_emit.frame_id} "
                        f"profile={self.config.active_profile.name}"
                    ),
                )
                continue

            if (
                self.last_pair_received_monotonic is not None
                and last_pair_age_seconds is not None
                and last_pair_age_seconds >= self.stall_threshold_seconds
            ):
                self._emit_status(
                    "degraded",
                    (
                        "Jetson preview publisher is waiting for a fresh synchronized frame pair. "
                        f"age_ms={int(last_pair_age_seconds * 1000)}"
                    ),
                )

    def _emit_frame(self, pair: _PairedPreviewFrame) -> None:
        left_metadata = self._build_eye_metadata(pair.left)
        right_metadata = self._build_eye_metadata(pair.right)
        if self.shared_memory_writer is not None and self.shared_memory_config is not None:
            shared_memory_metadata = self.shared_memory_writer.write_paired_frame(
                frame_id=pair.frame_id,
                timestamp_ms=pair.timestamp_ms,
                left_jpeg_bytes=pair.left.jpeg_bytes,
                right_jpeg_bytes=pair.right.jpeg_bytes,
            )
            header = PreviewPublisherFrameHeader(
                event_type=PREVIEW_FRAME_EVENT_TYPE,
                mode=PREVIEW_PUBLISHER_MODE,
                transport_mode="shared_memory",
                frame_id=pair.frame_id,
                timestamp_ms=pair.timestamp_ms,
                profile_name=self.config.active_profile.name,
                publish_fps=self.publish_fps,
                left=left_metadata,
                right=right_metadata,
                shared_memory=shared_memory_metadata,
            )
            self._write_message(encode_shared_memory_frame_message(header.to_dict()))
            return

        header = PreviewPublisherFrameHeader(
            event_type=PREVIEW_FRAME_EVENT_TYPE,
            mode=PREVIEW_PUBLISHER_MODE,
            transport_mode="inline_bytes",
            frame_id=pair.frame_id,
            timestamp_ms=pair.timestamp_ms,
            profile_name=self.config.active_profile.name,
            publish_fps=self.publish_fps,
            left=left_metadata,
            right=right_metadata,
        )
        self._write_message(
            encode_frame_message(
                header_payload=header.to_dict(),
                left_jpeg_bytes=pair.left.jpeg_bytes,
                right_jpeg_bytes=pair.right.jpeg_bytes,
            ),
        )

    def _build_eye_metadata(self, eye_frame: _EyeFrame) -> PreviewPublisherEyeMetadata:
        return PreviewPublisherEyeMetadata(
            eye=eye_frame.eye,
            sequence_id=eye_frame.sequence_id,
            received_at_ms=eye_frame.received_at_ms,
            mime_type=PREVIEW_IMAGE_MIME_TYPE,
            image_width=self.config.camera.width,
            image_height=self.config.camera.height,
            byte_size=len(eye_frame.jpeg_bytes),
        )

    def _stream_pipeline_stderr(self) -> None:
        if self.pipeline_process is None or self.pipeline_process.stderr is None:
            return

        try:
            while not self.stop_event.is_set():
                line = self.pipeline_process.stderr.readline()
                if not line:
                    return
                message = line.decode("utf-8", errors="replace").strip()
                if message:
                    self.logger.info("[preview-gst] %s", message)
        except Exception as error:
            if not self.stop_event.is_set():
                self._set_fatal_error(f"Preview pipeline stderr reader failed: {error}")

    def _emit_status(self, preview_state: str, status_text: str) -> None:
        with self.state_lock:
            if (
                preview_state == self.current_state
                and status_text == self.current_status_text
            ):
                return
            self.current_state = preview_state
            self.current_status_text = status_text

        event = PreviewPublisherStatusEvent(
            event_type=PREVIEW_STATUS_EVENT_TYPE,
            preview_state=preview_state,
            status_text=status_text,
            timestamp_ms=int(time.time() * 1000),
            profile_name=self.config.active_profile.name,
            publish_fps=self.publish_fps,
            frames_emitted=self.frames_emitted,
            last_frame_id=self.last_emitted_frame_id,
        )
        self._write_message(encode_status_message(event.to_dict()))

    def _try_emit_status(self, preview_state: str, status_text: str) -> None:
        try:
            self._emit_status(preview_state, status_text)
        except RuntimeError:
            pass

    def _write_message(self, payload_bytes: bytes) -> None:
        try:
            with self.stdout_lock:
                sys.stdout.buffer.write(payload_bytes)
                sys.stdout.buffer.flush()
        except OSError as error:
            self._set_fatal_error(
                f"Preview publisher transport write failed: {error}",
            )
            raise RuntimeError(
                f"Preview publisher transport write failed: {error}",
            ) from error

    def _set_fatal_error(self, message: str) -> None:
        with self.state_lock:
            if self.fatal_error_message is not None:
                return
            self.fatal_error_message = message
        self.stop_event.set()
        with self.eye_condition:
            self.eye_condition.notify_all()
        with self.pair_condition:
            self.pair_condition.notify_all()


class _JpegStreamParser:
    def __init__(self) -> None:
        self.buffer = bytearray()

    def feed(self, chunk: bytes) -> list[bytes]:
        self.buffer.extend(chunk)
        frames: list[bytes] = []
        while True:
            start_index = self.buffer.find(JPEG_START_MARKER)
            if start_index < 0:
                if len(self.buffer) > 2:
                    self.buffer = self.buffer[-2:]
                return frames

            if start_index > 0:
                del self.buffer[:start_index]

            end_index = self.buffer.find(JPEG_END_MARKER, 2)
            if end_index < 0:
                if len(self.buffer) > JPEG_STREAM_BUFFER_LIMIT_BYTES:
                    raise RuntimeError(
                        "Preview JPEG stream buffer exceeded the safety limit while waiting for EOI.",
                    )
                return frames

            frame_bytes = bytes(self.buffer[: end_index + 2])
            del self.buffer[: end_index + 2]
            frames.append(frame_bytes)


def run_preview_publisher(
    config: AppConfig,
    publish_fps: float | None,
    logger: Any,
    shared_memory_path: str | None = None,
    shared_memory_slot_count: int | None = None,
    shared_memory_slot_size_bytes: int | None = None,
) -> int:
    resolved_publish_fps = _resolve_publish_fps(config, publish_fps)
    shared_memory_config = _build_shared_memory_config(
        path_value=shared_memory_path,
        slot_count=shared_memory_slot_count,
        slot_size_bytes=shared_memory_slot_size_bytes,
    )
    publisher = PersistentStereoPreviewPublisher(
        config=config,
        publish_fps=resolved_publish_fps,
        logger=logger,
        shared_memory_config=shared_memory_config,
    )
    return publisher.run()


def _resolve_publish_fps(config: AppConfig, publish_fps: float | None) -> float:
    if publish_fps is None:
        return float(config.camera.fps)
    if publish_fps <= 0:
        raise ValueError("preview_publish_fps must be greater than zero.")
    return float(publish_fps)


def _build_shared_memory_config(
    *,
    path_value: str | None,
    slot_count: int | None,
    slot_size_bytes: int | None,
) -> PreviewSharedMemoryConfig | None:
    if path_value is None:
        if slot_count is not None or slot_size_bytes is not None:
            raise ValueError(
                "preview shared memory slot settings require --preview-shm-path.",
            )
        return None

    if slot_count is None or slot_size_bytes is None:
        raise ValueError(
            "preview shared memory transport requires path, slot_count, and slot_size_bytes.",
        )

    if slot_count < 2:
        raise ValueError("preview shared memory slot_count must be at least 2.")
    if slot_size_bytes <= 0:
        raise ValueError("preview shared memory slot_size_bytes must be greater than zero.")

    return PreviewSharedMemoryConfig(
        path=Path(path_value).expanduser().resolve(),
        slot_count=slot_count,
        slot_size_bytes=slot_size_bytes,
    )
