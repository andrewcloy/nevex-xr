from __future__ import annotations

import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .artifact_inspector import inspect_artifact
from .config import AppConfig

PREVIEW_FRAME_MODE = "stereo-preview-frame"
PREVIEW_IMAGE_MIME_TYPE = "image/jpeg"


@dataclass(frozen=True)
class PreviewEyeArtifact:
    eye: str
    path: str
    mime_type: str
    file_size_bytes: int
    file_size_mb: float
    captured_at: str
    image_width: int | None
    image_height: int | None
    metadata_source: str
    metadata_available: bool
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class StereoPreviewFrameResult:
    mode: str
    profile_name: str
    timestamp_ms: int
    capture_duration_ms: int
    output_directory: str
    left: PreviewEyeArtifact
    right: PreviewEyeArtifact

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


@dataclass(frozen=True)
class PreviewCapturePlan:
    profile_name: str
    left_output_path: Path
    right_output_path: Path
    left_command: list[str]
    right_command: list[str]

    def render_commands(self) -> tuple[str, str]:
        return (
            " ".join(self.left_command),
            " ".join(self.right_command),
        )


@dataclass(frozen=True)
class _PreviewCommandResult:
    eye: str
    stdout: str
    stderr: str


def build_preview_capture_plan(config: AppConfig) -> PreviewCapturePlan:
    output_directory = config.output.output_directory.resolve()
    profile_fragment = _sanitize_filename_fragment(config.active_profile.name)
    prefix = _sanitize_filename_fragment(config.output.preview_filename_prefix)
    left_output_path = output_directory / f"{prefix}_{profile_fragment}_left.jpg"
    right_output_path = output_directory / f"{prefix}_{profile_fragment}_right.jpg"
    return PreviewCapturePlan(
        profile_name=config.active_profile.name,
        left_output_path=left_output_path,
        right_output_path=right_output_path,
        left_command=_build_preview_eye_command(
            config=config,
            eye="left",
            sensor_id=config.camera.left_sensor_id,
            output_path=left_output_path,
        ),
        right_command=_build_preview_eye_command(
            config=config,
            eye="right",
            sensor_id=config.camera.right_sensor_id,
            output_path=right_output_path,
        ),
    )


def capture_stereo_preview_frame(config: AppConfig) -> StereoPreviewFrameResult:
    plan = build_preview_capture_plan(config)
    _prepare_preview_output_paths(plan)

    environment = os.environ.copy()
    if config.runtime.gst_debug is not None:
        environment["GST_DEBUG"] = str(config.runtime.gst_debug)

    started_at = time.monotonic()
    timeout_seconds = max(config.runtime.preflight_timeout_seconds, 1)
    with ThreadPoolExecutor(max_workers=2) as executor:
        left_future = executor.submit(
            _run_preview_eye_command,
            "left",
            plan.left_command,
            environment,
            timeout_seconds,
        )
        right_future = executor.submit(
            _run_preview_eye_command,
            "right",
            plan.right_command,
            environment,
            timeout_seconds,
        )
        left_result = left_future.result()
        right_result = right_future.result()

    left_summary = inspect_artifact(plan.left_output_path, artifact_type="image").summary
    right_summary = inspect_artifact(plan.right_output_path, artifact_type="image").summary

    capture_duration_ms = int((time.monotonic() - started_at) * 1000)
    timestamp_ms = int(time.time() * 1000)
    return StereoPreviewFrameResult(
        mode=PREVIEW_FRAME_MODE,
        profile_name=plan.profile_name,
        timestamp_ms=timestamp_ms,
        capture_duration_ms=capture_duration_ms,
        output_directory=str(config.output.output_directory),
        left=_build_preview_eye_artifact("left", left_summary, left_result),
        right=_build_preview_eye_artifact("right", right_summary, right_result),
    )


def emit_preview_frame_result(result: StereoPreviewFrameResult, logger: Any) -> None:
    logger.info("Preview frame summary:")
    logger.info(
        "  profile=%s capture_duration_ms=%s timestamp_ms=%s",
        result.profile_name,
        result.capture_duration_ms,
        result.timestamp_ms,
    )
    logger.info("  output_directory=%s", result.output_directory)
    logger.info(
        "  left: path=%s size=%s bytes dimensions=%sx%s metadata=%s",
        result.left.path,
        result.left.file_size_bytes,
        result.left.image_width or "unknown",
        result.left.image_height or "unknown",
        result.left.metadata_source,
    )
    logger.info(
        "  right: path=%s size=%s bytes dimensions=%sx%s metadata=%s",
        result.right.path,
        result.right.file_size_bytes,
        result.right.image_width or "unknown",
        result.right.image_height or "unknown",
        result.right.metadata_source,
    )
    for warning in (*result.left.warnings, *result.right.warnings):
        logger.warning("  preview warning: %s", warning)


def _build_preview_eye_command(
    config: AppConfig,
    eye: str,
    sensor_id: int,
    output_path: Path,
) -> list[str]:
    caps = (
        "video/x-raw(memory:NVMM),"
        f"width={config.camera.width},"
        f"height={config.camera.height},"
        f"framerate={config.camera.framerate_fraction}"
    )
    return [
        config.runtime.gst_launch_binary,
        "-e",
        "nvarguscamerasrc",
        f"sensor-id={sensor_id}",
        "num-buffers=1",
        "!",
        caps,
        "!",
        "nvvidconv",
        f"flip-method={config.camera.flip_method}",
        "!",
        "video/x-raw,format=I420",
        "!",
        "jpegenc",
        f"quality={config.output.preview_jpeg_quality}",
        "!",
        "filesink",
        f"location={output_path}",
        "sync=false",
        "async=false",
    ]


def _prepare_preview_output_paths(plan: PreviewCapturePlan) -> None:
    for output_path in (plan.left_output_path, plan.right_output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if output_path.exists() and output_path.is_dir():
            raise RuntimeError(
                f"Preview output path points to a directory instead of a file: {output_path}",
            )
        output_path.unlink(missing_ok=True)


def _run_preview_eye_command(
    eye: str,
    command: list[str],
    environment: dict[str, str],
    timeout_seconds: int,
) -> _PreviewCommandResult:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            env=environment,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            f"{eye} preview capture timed out after {timeout_seconds} second(s).",
        ) from error
    except OSError as error:
        raise RuntimeError(f"{eye} preview capture could not start: {error}") from error

    if result.returncode != 0:
        error_text = _sanitize_command_output(result.stderr or result.stdout)
        raise RuntimeError(
            f"{eye} preview capture failed with exit code {result.returncode}. {error_text}".strip(),
        )

    return _PreviewCommandResult(
        eye=eye,
        stdout=result.stdout,
        stderr=result.stderr,
    )


def _build_preview_eye_artifact(
    eye: str,
    summary,
    command_result: _PreviewCommandResult,
) -> PreviewEyeArtifact:
    warnings = list(summary.warnings)
    command_stderr = _sanitize_command_output(command_result.stderr)
    if command_stderr:
        warnings.append(f"{eye} capture stderr: {command_stderr}")
    return PreviewEyeArtifact(
        eye=eye,
        path=summary.path,
        mime_type=PREVIEW_IMAGE_MIME_TYPE,
        file_size_bytes=summary.file_size_bytes,
        file_size_mb=summary.file_size_mb,
        captured_at=summary.captured_at,
        image_width=summary.image_width,
        image_height=summary.image_height,
        metadata_source=summary.metadata_source,
        metadata_available=summary.metadata_available,
        warnings=tuple(warnings),
    )


def _sanitize_filename_fragment(value: str) -> str:
    normalized = "".join(character if character.isalnum() else "_" for character in value)
    collapsed = "_".join(part for part in normalized.split("_") if part)
    return collapsed or "preview"


def _sanitize_command_output(value: str) -> str:
    return " ".join(value.split())
