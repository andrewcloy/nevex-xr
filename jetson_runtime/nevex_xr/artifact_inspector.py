from __future__ import annotations

import json
import shutil
import struct
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

FFPROBE_BINARY = "ffprobe"
GST_DISCOVERER_BINARY = "gst-discoverer-1.0"
DEFAULT_METADATA_TIMEOUT_SECONDS = 10
JPEG_SOF_MARKERS = {
    0xC0,
    0xC1,
    0xC2,
    0xC3,
    0xC5,
    0xC6,
    0xC7,
    0xC9,
    0xCA,
    0xCB,
    0xCD,
    0xCE,
    0xCF,
}


@dataclass(frozen=True)
class ArtifactSummary:
    path: str
    artifact_type: str
    file_size_bytes: int
    file_size_mb: float
    captured_at: str
    metadata_source: str
    metadata_available: bool
    image_width: int | None = None
    image_height: int | None = None
    video_container: str | None = None
    video_codec: str | None = None
    video_duration_seconds: float | None = None
    video_width: int | None = None
    video_height: int | None = None
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


@dataclass(frozen=True)
class ArtifactInspectionResult:
    summary: ArtifactSummary


def inspect_artifact(
    artifact_path: str | Path,
    artifact_type: str,
) -> ArtifactInspectionResult:
    resolved_path = Path(artifact_path).expanduser().resolve()
    if not resolved_path.exists():
        raise FileNotFoundError(f"Artifact does not exist: {resolved_path}")

    stat_result = resolved_path.stat()
    if stat_result.st_size <= 0:
        raise ValueError(f"Artifact is empty: {resolved_path}")

    captured_at = datetime.fromtimestamp(
        stat_result.st_mtime,
        tz=timezone.utc,
    ).isoformat()
    file_size_mb = stat_result.st_size / (1024 * 1024)

    if artifact_type == "image":
        summary = _inspect_image_artifact(
            path=resolved_path,
            file_size_bytes=stat_result.st_size,
            file_size_mb=file_size_mb,
            captured_at=captured_at,
        )
    elif artifact_type == "video":
        summary = _inspect_video_artifact(
            path=resolved_path,
            file_size_bytes=stat_result.st_size,
            file_size_mb=file_size_mb,
            captured_at=captured_at,
        )
    else:
        summary = ArtifactSummary(
            path=str(resolved_path),
            artifact_type=artifact_type,
            file_size_bytes=stat_result.st_size,
            file_size_mb=file_size_mb,
            captured_at=captured_at,
            metadata_source="filesystem_only",
            metadata_available=False,
            warnings=(f"Unsupported artifact type for metadata inspection: {artifact_type}",),
        )

    return ArtifactInspectionResult(summary=summary)


def emit_artifact_summary(summary: ArtifactSummary, logger: Any) -> None:
    logger.info("Artifact summary:")
    logger.info("  path: %s", summary.path)
    logger.info("  type: %s", summary.artifact_type)
    logger.info("  captured_at: %s", summary.captured_at)
    logger.info(
        "  size: %s bytes (%.3f MB)",
        summary.file_size_bytes,
        summary.file_size_mb,
    )
    if summary.artifact_type == "image":
        if summary.image_width is not None and summary.image_height is not None:
            logger.info(
                "  dimensions: %sx%s",
                summary.image_width,
                summary.image_height,
            )
        else:
            logger.warning("  dimensions: unavailable")
    if summary.artifact_type == "video":
        logger.info(
            "  container: %s",
            summary.video_container or "unavailable",
        )
        logger.info(
            "  codec: %s",
            summary.video_codec or "unavailable",
        )
        logger.info(
            "  duration_seconds: %s",
            (
                f"{summary.video_duration_seconds:.3f}"
                if summary.video_duration_seconds is not None
                else "unavailable"
            ),
        )
        if summary.video_width is not None and summary.video_height is not None:
            logger.info(
                "  video_dimensions: %sx%s",
                summary.video_width,
                summary.video_height,
            )
    logger.info("  metadata_source: %s", summary.metadata_source)
    if not summary.metadata_available:
        logger.warning("  metadata availability: partial or unavailable")
    for warning in summary.warnings:
        logger.warning("  artifact warning: %s", warning)


def _inspect_image_artifact(
    path: Path,
    file_size_bytes: int,
    file_size_mb: float,
    captured_at: str,
) -> ArtifactSummary:
    warnings: list[str] = []
    width: int | None = None
    height: int | None = None
    metadata_source = "filesystem_only"
    metadata_available = False

    try:
        width, height, metadata_source = _read_image_dimensions(path)
        metadata_available = width is not None and height is not None
    except Exception as error:
        warnings.append(f"Could not read image dimensions: {error}")

    return ArtifactSummary(
        path=str(path),
        artifact_type="image",
        file_size_bytes=file_size_bytes,
        file_size_mb=file_size_mb,
        captured_at=captured_at,
        metadata_source=metadata_source,
        metadata_available=metadata_available,
        image_width=width,
        image_height=height,
        warnings=tuple(warnings),
    )


def _inspect_video_artifact(
    path: Path,
    file_size_bytes: int,
    file_size_mb: float,
    captured_at: str,
) -> ArtifactSummary:
    warnings: list[str] = []

    ffprobe_path = shutil.which(FFPROBE_BINARY)
    if ffprobe_path is not None:
        summary = _inspect_video_with_ffprobe(
            ffprobe_path=ffprobe_path,
            path=path,
            file_size_bytes=file_size_bytes,
            file_size_mb=file_size_mb,
            captured_at=captured_at,
        )
        if summary is not None:
            return summary
        warnings.append("ffprobe was available but metadata parsing failed.")

    discoverer_path = shutil.which(GST_DISCOVERER_BINARY)
    if discoverer_path is not None:
        summary = _inspect_video_with_gst_discoverer(
            discoverer_path=discoverer_path,
            path=path,
            file_size_bytes=file_size_bytes,
            file_size_mb=file_size_mb,
            captured_at=captured_at,
        )
        if summary is not None:
            return summary
        warnings.append("gst-discoverer-1.0 was available but metadata parsing failed.")

    if ffprobe_path is None and discoverer_path is None:
        warnings.append(
            "Neither `ffprobe` nor `gst-discoverer-1.0` was available; reporting filesystem-only metadata.",
        )

    return ArtifactSummary(
        path=str(path),
        artifact_type="video",
        file_size_bytes=file_size_bytes,
        file_size_mb=file_size_mb,
        captured_at=captured_at,
        metadata_source="filesystem_only",
        metadata_available=False,
        video_container=path.suffix.lstrip(".") or None,
        warnings=tuple(warnings),
    )


def _inspect_video_with_ffprobe(
    ffprobe_path: str,
    path: Path,
    file_size_bytes: int,
    file_size_mb: float,
    captured_at: str,
) -> ArtifactSummary | None:
    command = [
        ffprobe_path,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    result = _run_command(command, DEFAULT_METADATA_TIMEOUT_SECONDS)
    if not result.ok:
        return None

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    format_section = payload.get("format", {})
    streams = payload.get("streams", [])
    video_stream = next(
        (stream for stream in streams if stream.get("codec_type") == "video"),
        None,
    )
    duration_seconds = _safe_float(
        format_section.get("duration")
        or (video_stream or {}).get("duration"),
    )
    return ArtifactSummary(
        path=str(path),
        artifact_type="video",
        file_size_bytes=file_size_bytes,
        file_size_mb=file_size_mb,
        captured_at=captured_at,
        metadata_source="ffprobe",
        metadata_available=True,
        video_container=(
            format_section.get("format_long_name")
            or format_section.get("format_name")
            or path.suffix.lstrip(".")
        ),
        video_codec=(video_stream or {}).get("codec_name"),
        video_duration_seconds=duration_seconds,
        video_width=_safe_int((video_stream or {}).get("width")),
        video_height=_safe_int((video_stream or {}).get("height")),
        warnings=(),
    )


def _inspect_video_with_gst_discoverer(
    discoverer_path: str,
    path: Path,
    file_size_bytes: int,
    file_size_mb: float,
    captured_at: str,
) -> ArtifactSummary | None:
    command = [
        discoverer_path,
        path.resolve().as_uri(),
    ]
    result = _run_command(command, DEFAULT_METADATA_TIMEOUT_SECONDS)
    if not result.ok:
        return None

    combined_output = "\n".join(part for part in (result.stdout, result.stderr) if part)
    duration_text = _match_first_group(combined_output, r"Duration:\s+([^\r\n]+)")
    container = _match_first_group(combined_output, r"container #\d+:\s+([^\r\n]+)")
    codec = _match_first_group(combined_output, r"video #\d+:\s+([^\r\n]+)")
    width = _safe_int(_match_first_group(combined_output, r"Width:\s+(\d+)"))
    height = _safe_int(_match_first_group(combined_output, r"Height:\s+(\d+)"))

    return ArtifactSummary(
        path=str(path),
        artifact_type="video",
        file_size_bytes=file_size_bytes,
        file_size_mb=file_size_mb,
        captured_at=captured_at,
        metadata_source="gst-discoverer",
        metadata_available=any(value is not None for value in (duration_text, container, codec)),
        video_container=container or path.suffix.lstrip(".") or None,
        video_codec=codec,
        video_duration_seconds=_parse_gstreamer_duration(duration_text),
        video_width=width,
        video_height=height,
        warnings=(),
    )


def _run_command(command: list[str], timeout_seconds: int) -> _CommandResult:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return _CommandResult(ok=False, stdout="", stderr="")

    return _CommandResult(
        ok=completed.returncode == 0,
        stdout=completed.stdout.strip(),
        stderr=completed.stderr.strip(),
    )


@dataclass(frozen=True)
class _CommandResult:
    ok: bool
    stdout: str
    stderr: str


def _read_image_dimensions(path: Path) -> tuple[int | None, int | None, str]:
    with path.open("rb") as handle:
        signature = handle.read(16)

    if signature.startswith(b"\x89PNG\r\n\x1a\n"):
        return (*_read_png_dimensions(path), "png_parser")
    if signature.startswith(b"\xff\xd8"):
        return (*_read_jpeg_dimensions(path), "jpeg_parser")

    raise ValueError(f"Unsupported image format for dimension parsing: {path.suffix}")


def _read_png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) < 24:
        raise ValueError("PNG header is truncated.")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def _read_jpeg_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        if handle.read(2) != b"\xff\xd8":
            raise ValueError("JPEG SOI marker is missing.")

        while True:
            marker_prefix = handle.read(1)
            if not marker_prefix:
                break
            if marker_prefix != b"\xff":
                continue

            marker = handle.read(1)
            while marker == b"\xff":
                marker = handle.read(1)
            if not marker:
                break

            marker_value = marker[0]
            if marker_value in {0xD8, 0xD9}:
                continue

            segment_length_bytes = handle.read(2)
            if len(segment_length_bytes) != 2:
                raise ValueError("JPEG segment length is truncated.")
            segment_length = struct.unpack(">H", segment_length_bytes)[0]
            if segment_length < 2:
                raise ValueError("JPEG segment length is invalid.")

            if marker_value in JPEG_SOF_MARKERS:
                segment_data = handle.read(segment_length - 2)
                if len(segment_data) < 5:
                    raise ValueError("JPEG SOF segment is truncated.")
                height, width = struct.unpack(">HH", segment_data[1:5])
                return width, height

            handle.seek(segment_length - 2, 1)

    raise ValueError("JPEG dimensions could not be determined.")


def _match_first_group(text: str, pattern: str) -> str | None:
    import re

    match = re.search(pattern, text, re.IGNORECASE)
    if match is None:
        return None
    value = match.group(1).strip()
    return value or None


def _parse_gstreamer_duration(raw_value: str | None) -> float | None:
    if raw_value is None:
        return None

    parts = raw_value.split(":")
    if len(parts) != 3:
        return None

    try:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
    except ValueError:
        return None

    return (hours * 3600) + (minutes * 60) + seconds


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
