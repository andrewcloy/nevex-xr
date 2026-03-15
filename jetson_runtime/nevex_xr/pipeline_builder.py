from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .config import AppConfig

SUPPORTED_APP_MODES = (
    "headless",
    "snapshot",
    "stereo-test",
    "stereo-smoke",
    "stereo-snapshot",
    "stereo-record",
)

SNAPSHOT_MODES = {"snapshot", "stereo-snapshot"}


@dataclass(frozen=True)
class PipelinePlan:
    mode: str
    output_mode: str
    command: list[str]
    description: str
    output_path: Path | None
    run_duration_seconds: int | None
    artifact_expected: bool
    single_frame_capture: bool
    success_classification: str

    def render_command(self) -> str:
        return " ".join(self.command)


def build_pipeline_plan(
    config: AppConfig,
    mode: str,
    output_mode_override: str | None = None,
    output_path_override: str | Path | None = None,
    duration_override: int | None = None,
) -> PipelinePlan:
    if mode not in SUPPORTED_APP_MODES:
        supported_modes = ", ".join(SUPPORTED_APP_MODES)
        raise ValueError(f"Unsupported app mode '{mode}'. Expected one of: {supported_modes}")

    requested_output_mode = output_mode_override or config.output.mode
    if requested_output_mode not in {"fakesink", "file"}:
        raise ValueError("output_mode must be either 'fakesink' or 'file'.")

    if mode in SNAPSHOT_MODES:
        if output_mode_override not in (None, "file"):
            raise ValueError(f"{mode} only supports file output.")
        return build_stereo_snapshot_plan(
            config=config,
            output_path_override=output_path_override,
            mode_name=mode,
        )

    if mode == "stereo-smoke":
        if output_mode_override not in (None, "fakesink"):
            raise ValueError("stereo-smoke only supports fakesink output.")
        return build_stereo_smoke_plan(
            config=config,
            duration_override=duration_override,
            mode_name=mode,
        )

    if mode == "stereo-record":
        if output_mode_override not in (None, "file"):
            raise ValueError("stereo-record only supports file output.")
        return build_stereo_record_plan(
            config=config,
            output_path_override=output_path_override,
            duration_override=duration_override,
            mode_name=mode,
        )

    if mode == "stereo-test":
        return build_stereo_test_plan(
            config=config,
            requested_output_mode=requested_output_mode,
            output_path_override=output_path_override,
            duration_override=duration_override,
        )

    return build_headless_plan(
        config=config,
        requested_output_mode=requested_output_mode,
        output_path_override=output_path_override,
        duration_override=duration_override,
    )


def build_headless_plan(
    config: AppConfig,
    requested_output_mode: str,
    output_path_override: str | Path | None = None,
    duration_override: int | None = None,
) -> PipelinePlan:
    run_duration_seconds = _resolve_optional_duration(
        duration_override,
        mode_name="headless",
    )
    output_path: Path | None = None

    if requested_output_mode == "file":
        output_path = _resolve_output_path(
            config=config,
            output_path_override=output_path_override,
            prefix=config.output.recording_filename_prefix,
            extension=config.output.recording_container,
        )
        command = [config.runtime.gst_launch_binary, "-e"]
        command.extend(build_stereo_record_pipeline(config, output_path))
    else:
        command = [config.runtime.gst_launch_binary, "-e"]
        command.extend(build_stereo_smoke_pipeline(config))

    if run_duration_seconds is not None:
        description = (
            "Run the headless stereo runtime for "
            f"{run_duration_seconds} second(s) using {requested_output_mode} output."
        )
    else:
        description = (
            "Run the headless stereo runtime until interrupted using "
            f"{requested_output_mode} output."
        )

    return PipelinePlan(
        mode="headless",
        output_mode=requested_output_mode,
        command=command,
        description=description,
        output_path=output_path,
        run_duration_seconds=run_duration_seconds,
        artifact_expected=output_path is not None,
        single_frame_capture=False,
        success_classification=(
            "headless_stereo_record_created"
            if output_path is not None
            else "headless_stereo_runtime_completed_cleanly"
        ),
    )


def build_stereo_test_plan(
    config: AppConfig,
    requested_output_mode: str,
    output_path_override: str | Path | None = None,
    duration_override: int | None = None,
) -> PipelinePlan:
    if requested_output_mode == "file":
        return build_stereo_record_plan(
            config=config,
            output_path_override=output_path_override,
            duration_override=duration_override,
            mode_name="stereo-test",
            success_classification="stereo_test_record_created",
            description_prefix="Run the stereo test pipeline as a bounded recorded artifact",
        )

    return build_stereo_smoke_plan(
        config=config,
        duration_override=duration_override,
        mode_name="stereo-test",
        success_classification="stereo_test_smoke_passed",
        description_prefix="Run the stereo test pipeline against the composed stereo runtime",
    )


def build_stereo_smoke_plan(
    config: AppConfig,
    duration_override: int | None = None,
    mode_name: str = "stereo-smoke",
    success_classification: str = "stereo_smoke_passed",
    description_prefix: str = "Run the true composed stereo pipeline for validation",
) -> PipelinePlan:
    run_duration_seconds = _resolve_bounded_duration(
        duration_override,
        config.output.test_duration_seconds,
        mode_name=mode_name,
    )
    command = [config.runtime.gst_launch_binary, "-e"]
    command.extend(build_stereo_smoke_pipeline(config))
    description = (
        f"{description_prefix} for {run_duration_seconds} second(s) using fakesink output."
    )
    return PipelinePlan(
        mode=mode_name,
        output_mode="fakesink",
        command=command,
        description=description,
        output_path=None,
        run_duration_seconds=run_duration_seconds,
        artifact_expected=False,
        single_frame_capture=False,
        success_classification=success_classification,
    )


def build_stereo_snapshot_plan(
    config: AppConfig,
    output_path_override: str | Path | None = None,
    mode_name: str = "stereo-snapshot",
    success_classification: str = "stereo_snapshot_created",
) -> PipelinePlan:
    output_path = _resolve_output_path(
        config=config,
        output_path_override=output_path_override,
        prefix=config.output.snapshot_filename_prefix,
        extension="jpg",
    )
    command = [config.runtime.gst_launch_binary, "-e"]
    command.extend(build_stereo_snapshot_pipeline(config, output_path))
    description = "Capture a real side-by-side stereo image artifact from both cameras."
    return PipelinePlan(
        mode=mode_name,
        output_mode="file",
        command=command,
        description=description,
        output_path=output_path,
        run_duration_seconds=None,
        artifact_expected=True,
        single_frame_capture=True,
        success_classification=success_classification,
    )


def build_stereo_record_plan(
    config: AppConfig,
    output_path_override: str | Path | None = None,
    duration_override: int | None = None,
    mode_name: str = "stereo-record",
    success_classification: str = "stereo_record_created",
    description_prefix: str = "Record a bounded side-by-side stereo video artifact",
) -> PipelinePlan:
    output_path = _resolve_output_path(
        config=config,
        output_path_override=output_path_override,
        prefix=config.output.recording_filename_prefix,
        extension=config.output.recording_container,
    )
    run_duration_seconds = _resolve_bounded_duration(
        duration_override,
        config.output.record_duration_seconds,
        mode_name=mode_name,
    )
    command = [config.runtime.gst_launch_binary, "-e"]
    command.extend(build_stereo_record_pipeline(config, output_path))
    description = (
        f"{description_prefix} for {run_duration_seconds} second(s) using file output."
    )
    return PipelinePlan(
        mode=mode_name,
        output_mode="file",
        command=command,
        description=description,
        output_path=output_path,
        run_duration_seconds=run_duration_seconds,
        artifact_expected=True,
        single_frame_capture=False,
        success_classification=success_classification,
    )


def build_stereo_smoke_pipeline(config: AppConfig) -> list[str]:
    return _build_stereo_pipeline(
        config=config,
        single_frame=False,
        sink_elements=_build_fakesink(config),
    )


def build_stereo_snapshot_pipeline(config: AppConfig, output_path: Path) -> list[str]:
    return _build_stereo_pipeline(
        config=config,
        single_frame=True,
        sink_elements=_build_snapshot_sink(output_path),
    )


def build_stereo_record_pipeline(config: AppConfig, output_path: Path) -> list[str]:
    return _build_stereo_pipeline(
        config=config,
        single_frame=False,
        sink_elements=_build_recording_sink(config, output_path),
    )


def _build_stereo_pipeline(
    config: AppConfig,
    single_frame: bool,
    sink_elements: list[str],
) -> list[str]:
    command: list[str] = []
    command.extend(_build_left_branch(config, single_frame=single_frame))
    command.extend(_build_right_branch(config, single_frame=single_frame))
    command.extend(_build_compositor_prefix(config))
    command.extend(sink_elements)
    return command


def _build_left_branch(config: AppConfig, single_frame: bool) -> list[str]:
    return _build_camera_branch(
        sensor_id=config.camera.left_sensor_id,
        sink_index=0,
        config=config,
        single_frame=single_frame,
    )


def _build_right_branch(config: AppConfig, single_frame: bool) -> list[str]:
    return _build_camera_branch(
        sensor_id=config.camera.right_sensor_id,
        sink_index=1,
        config=config,
        single_frame=single_frame,
    )


def _build_camera_branch(
    sensor_id: int,
    sink_index: int,
    config: AppConfig,
    single_frame: bool,
) -> list[str]:
    source_args = ["nvarguscamerasrc", f"sensor-id={sensor_id}"]
    if single_frame:
        source_args.append("num-buffers=1")

    caps = (
        "video/x-raw(memory:NVMM),"
        f"width={config.camera.width},"
        f"height={config.camera.height},"
        f"framerate={config.camera.framerate_fraction}"
    )
    queue_args = [
        "queue",
        f"max-size-buffers={config.camera.queue_max_size_buffers}",
        "leaky=downstream",
    ]

    return [
        *source_args,
        "!",
        caps,
        "!",
        "nvvidconv",
        f"flip-method={config.camera.flip_method}",
        "!",
        *queue_args,
        "!",
        f"comp.sink_{sink_index}",
    ]


def _build_compositor_prefix(config: AppConfig) -> list[str]:
    composite_caps = (
        "video/x-raw(memory:NVMM),"
        f"width={config.camera.composed_width},"
        f"height={config.camera.composed_height},"
        f"framerate={config.camera.framerate_fraction}"
    )
    return [
        "nvcompositor",
        "name=comp",
        "sink_0::xpos=0",
        f"sink_1::xpos={config.camera.width}",
        "!",
        composite_caps,
        "!",
        "nvvidconv",
        "!",
    ]


def _build_fakesink(config: AppConfig) -> list[str]:
    return [
        "queue",
        f"max-size-buffers={config.camera.queue_max_size_buffers}",
        "leaky=downstream",
        "!",
        "fakesink",
        f"sync={_bool_to_gst(config.output.sync)}",
        "async=false",
    ]


def _build_snapshot_sink(output_path: Path) -> list[str]:
    return [
        "video/x-raw,format=I420",
        "!",
        "jpegenc",
        "!",
        "filesink",
        f"location={output_path}",
    ]


def _build_recording_sink(config: AppConfig, output_path: Path) -> list[str]:
    muxer = _resolve_muxer(config.output.recording_container)
    return [
        "video/x-raw(memory:NVMM),format=NV12",
        "!",
        "nvv4l2h264enc",
        f"bitrate={config.output.h264_bitrate}",
        "insert-sps-pps=true",
        f"idrinterval={max(config.camera.fps, 1)}",
        "!",
        "h264parse",
        "!",
        *muxer,
        "!",
        "filesink",
        f"location={output_path}",
        "sync=false",
    ]


def _resolve_muxer(container_name: str) -> list[str]:
    if container_name == "mp4":
        return ["qtmux", "faststart=true"]
    return ["matroskamux"]


def _resolve_output_path(
    config: AppConfig,
    output_path_override: str | Path | None,
    prefix: str,
    extension: str,
) -> Path:
    if output_path_override is not None:
        return Path(output_path_override).expanduser().resolve()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{prefix}_{timestamp}.{extension}"
    return (config.output.output_directory / filename).resolve()


def _bool_to_gst(value: bool) -> str:
    return "true" if value else "false"


def _resolve_bounded_duration(
    duration_override: int | None,
    fallback_duration: int,
    mode_name: str,
) -> int:
    if duration_override is not None:
        if duration_override <= 0:
            raise ValueError(f"{mode_name} requires a positive duration in seconds.")
        return duration_override
    return fallback_duration


def _resolve_optional_duration(
    duration_override: int | None,
    mode_name: str,
) -> int | None:
    if duration_override is None:
        return None
    if duration_override <= 0:
        raise ValueError(f"{mode_name} duration override must be a positive integer.")
    return duration_override
