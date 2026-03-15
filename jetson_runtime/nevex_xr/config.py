from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .runtime_profiles import ActiveRuntimeProfile, resolve_profile_payload

SUPPORTED_OUTPUT_MODES = {"fakesink", "file"}
SUPPORTED_RECORDING_CONTAINERS = {"mkv", "mp4"}


@dataclass(frozen=True)
class CameraSettings:
    left_sensor_id: int
    right_sensor_id: int
    width: int
    height: int
    fps: int
    output_width: int
    output_height: int
    expected_video_devices: tuple[Path, ...]
    flip_method: int = 0
    queue_max_size_buffers: int = 4

    @property
    def composed_width(self) -> int:
        return self.output_width

    @property
    def composed_height(self) -> int:
        return self.output_height

    @property
    def framerate_fraction(self) -> str:
        return f"{self.fps}/1"


@dataclass(frozen=True)
class OutputSettings:
    mode: str
    output_directory: Path
    preview_filename_prefix: str
    preview_jpeg_quality: int
    snapshot_filename_prefix: str
    recording_filename_prefix: str
    recording_container: str
    test_duration_seconds: int
    record_duration_seconds: int
    sync: bool
    h264_bitrate: int


@dataclass(frozen=True)
class RuntimeSettings:
    gst_launch_binary: str
    gst_inspect_binary: str
    gst_debug: int | None
    shutdown_grace_seconds: int
    preflight_timeout_seconds: int
    run_preflight_on_start: bool


@dataclass(frozen=True)
class FeatureFlags:
    stereo_display: bool
    thermal_overlay: bool
    ai_detection: bool
    xr_transport: bool


@dataclass(frozen=True)
class AppConfig:
    project_name: str
    config_path: Path
    active_profile: ActiveRuntimeProfile
    default_profile_name: str | None
    available_profile_names: tuple[str, ...]
    camera: CameraSettings
    output: OutputSettings
    runtime: RuntimeSettings
    features: FeatureFlags


def load_config_payload(config_path: str | Path) -> tuple[Path, dict[str, Any]]:
    resolved_config_path = Path(config_path).expanduser().resolve()
    if not resolved_config_path.exists():
        raise FileNotFoundError(f"Config file not found: {resolved_config_path}")

    with resolved_config_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Top-level config payload must be a JSON object.")

    return resolved_config_path, payload


def load_app_config(
    config_path: str | Path,
    selected_profile_name: str | None = None,
) -> AppConfig:
    resolved_config_path, payload = load_config_payload(config_path)

    profile_resolution = resolve_profile_payload(
        payload,
        selected_profile_name=selected_profile_name,
    )
    payload = profile_resolution.merged_payload

    camera_section = _require_mapping(payload, "camera")
    output_section = _require_mapping(payload, "output")
    runtime_section = _require_mapping(payload, "runtime")
    features_section = _require_mapping(payload, "features")

    camera_width = _require_positive_int(camera_section, "width")
    camera_height = _require_positive_int(camera_section, "height")
    camera_fps = _require_positive_int(camera_section, "fps")
    output_width = _optional_positive_int(
        camera_section,
        "output_width",
        camera_width * 2,
    )
    output_height = _optional_positive_int(
        camera_section,
        "output_height",
        camera_height,
    )
    if output_width < camera_width * 2:
        raise ValueError(
            "Config field 'camera.output_width' must be at least twice the input width "
            f"for side-by-side stereo output. Got {output_width} for input width {camera_width}.",
        )
    if output_height < camera_height:
        raise ValueError(
            "Config field 'camera.output_height' must be at least the input height "
            f"for side-by-side stereo output. Got {output_height} for input height {camera_height}.",
        )

    camera = CameraSettings(
        left_sensor_id=_require_non_negative_int(camera_section, "left_sensor_id"),
        right_sensor_id=_require_non_negative_int(camera_section, "right_sensor_id"),
        width=camera_width,
        height=camera_height,
        fps=camera_fps,
        output_width=output_width,
        output_height=output_height,
        expected_video_devices=tuple(
            _resolve_path(resolved_config_path.parent, entry)
            for entry in _optional_string_list(
                camera_section,
                "expected_video_devices",
                ["/dev/video0", "/dev/video1"],
            )
        ),
        flip_method=_optional_non_negative_int(camera_section, "flip_method", 0),
        queue_max_size_buffers=_optional_positive_int(
            camera_section,
            "queue_max_size_buffers",
            4,
        ),
    )

    output_mode = _require_string(output_section, "mode")
    if output_mode not in SUPPORTED_OUTPUT_MODES:
        supported_modes = ", ".join(sorted(SUPPORTED_OUTPUT_MODES))
        raise ValueError(
            f"Unsupported output mode '{output_mode}'. Expected one of: {supported_modes}",
        )

    recording_container = _optional_string(output_section, "recording_container", "mkv")
    if recording_container not in SUPPORTED_RECORDING_CONTAINERS:
        supported_containers = ", ".join(sorted(SUPPORTED_RECORDING_CONTAINERS))
        raise ValueError(
            "Unsupported recording_container "
            f"'{recording_container}'. Expected one of: {supported_containers}",
        )

    output_directory = _resolve_path(
        resolved_config_path.parent,
        _optional_string(output_section, "output_directory", "../artifacts"),
    )

    test_duration_seconds = _optional_positive_int(
        output_section,
        "test_duration_seconds",
        10,
    )
    output = OutputSettings(
        mode=output_mode,
        output_directory=output_directory,
        preview_filename_prefix=_optional_string(
            output_section,
            "preview_filename_prefix",
            "stereo_preview",
        ),
        preview_jpeg_quality=_optional_int_in_range(
            output_section,
            "preview_jpeg_quality",
            70,
            minimum=1,
            maximum=100,
        ),
        snapshot_filename_prefix=_optional_string(
            output_section,
            "snapshot_filename_prefix",
            "stereo_snapshot",
        ),
        recording_filename_prefix=_optional_string(
            output_section,
            "recording_filename_prefix",
            "stereo_capture",
        ),
        recording_container=recording_container,
        test_duration_seconds=test_duration_seconds,
        record_duration_seconds=_optional_positive_int(
            output_section,
            "record_duration_seconds",
            test_duration_seconds,
        ),
        sync=_optional_bool(output_section, "sync", False),
        h264_bitrate=_optional_positive_int(output_section, "h264_bitrate", 8_000_000),
    )

    runtime = RuntimeSettings(
        gst_launch_binary=_optional_string(
            runtime_section,
            "gst_launch_binary",
            "gst-launch-1.0",
        ),
        gst_inspect_binary=_optional_string(
            runtime_section,
            "gst_inspect_binary",
            "gst-inspect-1.0",
        ),
        gst_debug=_optional_nullable_non_negative_int(
            runtime_section,
            "gst_debug",
            None,
        ),
        shutdown_grace_seconds=_optional_positive_int(
            runtime_section,
            "shutdown_grace_seconds",
            5,
        ),
        preflight_timeout_seconds=_optional_positive_int(
            runtime_section,
            "preflight_timeout_seconds",
            10,
        ),
        run_preflight_on_start=_optional_bool(
            runtime_section,
            "run_preflight_on_start",
            False,
        ),
    )

    features = FeatureFlags(
        stereo_display=_optional_bool(features_section, "stereo_display", False),
        thermal_overlay=_optional_bool(features_section, "thermal_overlay", False),
        ai_detection=_optional_bool(features_section, "ai_detection", False),
        xr_transport=_optional_bool(features_section, "xr_transport", False),
    )

    return AppConfig(
        project_name=_optional_string(
            payload,
            "project_name",
            "NEVEX XR stereo runtime",
        ),
        config_path=resolved_config_path,
        active_profile=profile_resolution.active_profile,
        default_profile_name=profile_resolution.default_profile_name,
        available_profile_names=profile_resolution.available_profile_names,
        camera=camera,
        output=output,
        runtime=runtime,
        features=features,
    )


def _require_mapping(payload: dict[str, Any], key: str) -> dict[str, Any]:
    value = payload.get(key)
    if not isinstance(value, dict):
        raise ValueError(f"Config field '{key}' must be an object.")
    return value


def _require_string(section: dict[str, Any], key: str) -> str:
    value = section.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Config field '{key}' must be a non-empty string.")
    return value.strip()


def _optional_string(section: dict[str, Any], key: str, default: str) -> str:
    value = section.get(key, default)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Config field '{key}' must be a non-empty string.")
    return value.strip()


def _optional_string_list(
    section: dict[str, Any],
    key: str,
    default: list[str],
) -> list[str]:
    value = section.get(key, default)
    if not isinstance(value, list) or not value:
        raise ValueError(f"Config field '{key}' must be a non-empty array of strings.")

    normalized: list[str] = []
    for entry in value:
        if not isinstance(entry, str) or not entry.strip():
            raise ValueError(f"Config field '{key}' must contain only non-empty strings.")
        normalized.append(entry.strip())
    return normalized


def _require_positive_int(section: dict[str, Any], key: str) -> int:
    value = section.get(key)
    if not _is_plain_int(value) or value <= 0:
        raise ValueError(f"Config field '{key}' must be a positive integer.")
    return value


def _optional_positive_int(section: dict[str, Any], key: str, default: int) -> int:
    value = section.get(key, default)
    if not _is_plain_int(value) or value <= 0:
        raise ValueError(f"Config field '{key}' must be a positive integer.")
    return value


def _optional_int_in_range(
    section: dict[str, Any],
    key: str,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    value = section.get(key, default)
    if not _is_plain_int(value) or value < minimum or value > maximum:
        raise ValueError(
            f"Config field '{key}' must be an integer between {minimum} and {maximum}.",
        )
    return value


def _require_non_negative_int(section: dict[str, Any], key: str) -> int:
    value = section.get(key)
    if not _is_plain_int(value) or value < 0:
        raise ValueError(f"Config field '{key}' must be a non-negative integer.")
    return value


def _optional_non_negative_int(section: dict[str, Any], key: str, default: int) -> int:
    value = section.get(key, default)
    if not _is_plain_int(value) or value < 0:
        raise ValueError(f"Config field '{key}' must be a non-negative integer.")
    return value


def _optional_nullable_non_negative_int(
    section: dict[str, Any],
    key: str,
    default: int | None,
) -> int | None:
    value = section.get(key, default)
    if value is None:
        return None
    if not _is_plain_int(value) or value < 0:
        raise ValueError(
            f"Config field '{key}' must be null or a non-negative integer.",
        )
    return value


def _optional_bool(section: dict[str, Any], key: str, default: bool) -> bool:
    value = section.get(key, default)
    if not isinstance(value, bool):
        raise ValueError(f"Config field '{key}' must be a boolean.")
    return value


def _is_plain_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _resolve_path(base_directory: Path, configured_path: str) -> Path:
    candidate = Path(configured_path).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    return (base_directory / candidate).resolve()
