from __future__ import annotations

import json
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import AppConfig
from .preview_capture import PREVIEW_FRAME_MODE
from .preview_publisher import PREVIEW_PUBLISHER_MODE

MINIMUM_PYTHON_VERSION = (3, 10)
ARGUS_DAEMON_NAME = "nvargus-daemon"
SNAPSHOT_TARGET_MODES = {"snapshot", "stereo-snapshot"}
PREVIEW_FILE_TARGET_MODES = {PREVIEW_FRAME_MODE}
PREVIEW_STREAM_TARGET_MODES = {PREVIEW_PUBLISHER_MODE}
RECORD_TARGET_MODES = {"stereo-record"}
HEADLESS_TARGET_MODES = {"headless", "stereo-smoke"}
PLUGIN_CHECKS = (
    ("nvarguscamerasrc", "Argus camera source", "core"),
    ("nvcompositor", "stereo compositor", "core"),
    ("nvvidconv", "Jetson video converter", "core"),
    ("fakesink", "headless sink", "headless"),
    ("jpegenc", "snapshot JPEG encoder", "snapshot"),
    ("filesink", "file writer", "file"),
    ("fdsink", "file-descriptor preview sink", "preview-stream"),
    ("nvv4l2h264enc", "H.264 hardware encoder", "recording"),
    ("h264parse", "H.264 parser", "recording"),
    ("matroskamux", "Matroska muxer", "recording-mkv"),
    ("qtmux", "MP4 muxer", "recording-mp4"),
)


@dataclass(frozen=True)
class HostDetails:
    system: str
    release: str
    machine: str
    python_version: str
    is_jetson: bool
    device_model: str | None
    l4t_version: str | None
    jetpack_version: str | None


@dataclass(frozen=True)
class PreflightCheckResult:
    key: str
    status: str
    summary: str
    detail: str | None = None
    hint: str | None = None
    critical: bool = False
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class PreflightReport:
    generated_at: str
    project_name: str
    validation_scope: str
    target_mode: str
    target_output_mode: str
    target_output_path: str | None
    host: HostDetails
    overall_status: str
    ok: bool
    pass_count: int
    warn_count: int
    fail_count: int
    critical_fail_count: int
    checks: tuple[PreflightCheckResult, ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


@dataclass(frozen=True)
class CommandExecutionResult:
    ok: bool
    returncode: int | None
    stdout: str
    stderr: str
    error_message: str | None = None


def run_preflight(
    config: AppConfig,
    target_mode: str | None = None,
    target_output_mode: str | None = None,
    target_output_path: str | Path | None = None,
) -> PreflightReport:
    host = detect_host_details()
    validation_scope = "targeted_startup" if target_mode is not None else "full_runtime"
    effective_target_mode = target_mode or "preflight"
    effective_output_mode, resolved_output_path = _resolve_output_target(
        config=config,
        target_mode=target_mode,
        target_output_mode=target_output_mode,
        target_output_path=target_output_path,
    )

    checks: list[PreflightCheckResult] = []
    checks.append(_check_python_version())
    checks.append(_check_linux_host(host))
    checks.append(_check_jetson_host(host))
    checks.append(_check_l4t_release(host))

    gst_launch_path = shutil.which(config.runtime.gst_launch_binary)
    gst_inspect_path = shutil.which(config.runtime.gst_inspect_binary)
    checks.append(
        _check_binary_available(
            key="gst-launch",
            binary_name=config.runtime.gst_launch_binary,
            resolved_path=gst_launch_path,
            required=True,
            hint="Install the GStreamer runtime/tools package and make sure the binary is on PATH.",
        ),
    )
    checks.append(
        _check_binary_available(
            key="gst-inspect",
            binary_name=config.runtime.gst_inspect_binary,
            resolved_path=gst_inspect_path,
            required=True,
            hint="Install the GStreamer inspection tools package and make sure the binary is on PATH.",
        ),
    )

    plugin_results: dict[str, PreflightCheckResult] = {}
    for plugin_name, plugin_purpose, plugin_scope in PLUGIN_CHECKS:
        plugin_required = _is_plugin_required(
            scope=validation_scope,
            target_mode=target_mode,
            target_output_mode=effective_output_mode,
            recording_container=config.output.recording_container,
            plugin_scope=plugin_scope,
        )
        result = _check_gstreamer_plugin(
            gst_inspect_path=gst_inspect_path,
            plugin_name=plugin_name,
            plugin_purpose=plugin_purpose,
            required=plugin_required,
            timeout_seconds=config.runtime.preflight_timeout_seconds,
        )
        plugin_results[plugin_name] = result
        checks.append(result)

    argus_daemon_result = _check_argus_daemon(
        host=host,
        timeout_seconds=config.runtime.preflight_timeout_seconds,
    )
    checks.append(argus_daemon_result)

    for expected_device in config.camera.expected_video_devices:
        checks.append(
            _check_video_device_node(
                device_path=expected_device,
                host=host,
            ),
        )

    sensor_config_result = _check_sensor_ids(config)
    checks.append(sensor_config_result)

    output_required = _is_output_directory_required(
        scope=validation_scope,
        target_mode=target_mode,
        target_output_mode=effective_output_mode,
    )
    checks.append(
        _check_output_writable(
            output_path=resolved_output_path,
            required=output_required,
        ),
    )

    smoke_test_ready = (
        host.system == "Linux"
        and gst_launch_path is not None
        and plugin_results["nvarguscamerasrc"].status == "pass"
        and argus_daemon_result.status == "pass"
        and sensor_config_result.status == "pass"
    )
    smoke_test_skip_reason = None
    if not smoke_test_ready:
        smoke_test_skip_reason = _derive_smoke_test_skip_reason(
            host=host,
            gst_launch_path=gst_launch_path,
            plugin_result=plugin_results["nvarguscamerasrc"],
            argus_daemon_result=argus_daemon_result,
            sensor_config_result=sensor_config_result,
        )

    for eye_label, sensor_id in (
        ("left", config.camera.left_sensor_id),
        ("right", config.camera.right_sensor_id),
    ):
        if smoke_test_ready:
            checks.append(
                _check_argus_sensor_capture(
                    config=config,
                    eye_label=eye_label,
                    sensor_id=sensor_id,
                    gst_launch_path=gst_launch_path,
                    timeout_seconds=config.runtime.preflight_timeout_seconds,
                ),
            )
        else:
            checks.append(
                _skipped_sensor_capture_check(
                    eye_label=eye_label,
                    sensor_id=sensor_id,
                    reason=smoke_test_skip_reason or "preflight prerequisites did not pass",
                ),
            )

    pass_count = sum(result.status == "pass" for result in checks)
    warn_count = sum(result.status == "warn" for result in checks)
    fail_count = sum(result.status == "fail" for result in checks)
    critical_fail_count = sum(
        result.status == "fail" and result.critical for result in checks
    )
    overall_status = _resolve_overall_status(
        warn_count=warn_count,
        fail_count=fail_count,
        critical_fail_count=critical_fail_count,
    )

    return PreflightReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        project_name=config.project_name,
        validation_scope=validation_scope,
        target_mode=effective_target_mode,
        target_output_mode=effective_output_mode,
        target_output_path=str(resolved_output_path) if resolved_output_path else None,
        host=host,
        overall_status=overall_status,
        ok=critical_fail_count == 0,
        pass_count=pass_count,
        warn_count=warn_count,
        fail_count=fail_count,
        critical_fail_count=critical_fail_count,
        checks=tuple(checks),
    )


def emit_preflight_report(report: PreflightReport, logger: Any) -> None:
    headline = (
        "NEVEX XR preflight summary: "
        f"{report.overall_status.upper()} | PASS={report.pass_count} "
        f"WARN={report.warn_count} FAIL={report.fail_count} "
        f"CRITICAL_FAIL={report.critical_fail_count}"
    )
    _log_with_status(logger, report.overall_status, headline)
    logger.info(
        "Environment: system=%s release=%s machine=%s python=%s jetson=%s",
        report.host.system,
        report.host.release,
        report.host.machine,
        report.host.python_version,
        report.host.is_jetson,
    )
    if report.host.device_model:
        logger.info("Device model: %s", report.host.device_model)
    if report.host.l4t_version or report.host.jetpack_version:
        logger.info(
            "Platform release info: jetpack=%s l4t=%s",
            report.host.jetpack_version or "unknown",
            report.host.l4t_version or "unknown",
        )
    logger.info(
        "Validation scope: %s | target_mode=%s | target_output_mode=%s",
        report.validation_scope,
        report.target_mode,
        report.target_output_mode,
    )
    if report.target_output_path:
        logger.info("Target output path: %s", report.target_output_path)

    for result in report.checks:
        critical_suffix = " [critical]" if result.critical and result.status == "fail" else ""
        _log_with_status(
            logger,
            result.status,
            f"[{result.status.upper()}] {result.key}: {result.summary}{critical_suffix}",
        )
        if result.detail:
            _log_with_status(logger, result.status, f"  detail: {result.detail}")
        if result.hint:
            _log_with_status(logger, result.status, f"  hint: {result.hint}")


def detect_host_details() -> HostDetails:
    system = platform.system()
    release = platform.release()
    machine = platform.machine()
    python_version = platform.python_version()
    device_model = _read_text_file(Path("/proc/device-tree/model"))
    l4t_version, jetpack_version = _detect_nv_tegra_release()
    is_jetson = bool(
        (device_model and "jetson" in device_model.lower())
        or l4t_version
        or Path("/etc/nv_tegra_release").exists()
    )

    return HostDetails(
        system=system,
        release=release,
        machine=machine,
        python_version=python_version,
        is_jetson=is_jetson,
        device_model=device_model,
        l4t_version=l4t_version,
        jetpack_version=jetpack_version,
    )


def _check_python_version() -> PreflightCheckResult:
    running_version = sys.version_info[:3]
    if running_version >= MINIMUM_PYTHON_VERSION:
        return PreflightCheckResult(
            key="python-version",
            status="pass",
            summary=(
                f"Python {platform.python_version()} satisfies the runtime requirement "
                f"(>= {MINIMUM_PYTHON_VERSION[0]}.{MINIMUM_PYTHON_VERSION[1]})."
            ),
            metadata={"pythonVersion": platform.python_version()},
        )

    return PreflightCheckResult(
        key="python-version",
        status="fail",
        summary=(
            f"Python {platform.python_version()} is too old for this runtime. "
            f"Need >= {MINIMUM_PYTHON_VERSION[0]}.{MINIMUM_PYTHON_VERSION[1]}."
        ),
        hint="Install a newer Python 3 build on the Jetson before running the runtime.",
        critical=True,
        metadata={"pythonVersion": platform.python_version()},
    )


def _check_linux_host(host: HostDetails) -> PreflightCheckResult:
    if host.system == "Linux":
        return PreflightCheckResult(
            key="linux-host",
            status="pass",
            summary=f"Linux host detected ({host.release}).",
            metadata={"system": host.system, "release": host.release},
        )

    return PreflightCheckResult(
        key="linux-host",
        status="fail",
        summary=f"Unsupported host platform: {host.system}.",
        detail="The Jetson runtime requires Linux for Argus, /dev/video*, and Jetson GStreamer elements.",
        hint="Run this preflight directly on the Jetson over SSH.",
        critical=True,
        metadata={"system": host.system, "release": host.release},
    )


def _check_jetson_host(host: HostDetails) -> PreflightCheckResult:
    if host.is_jetson:
        summary = "Jetson platform indicators detected."
        if host.device_model:
            summary = f"Jetson platform detected ({host.device_model})."
        return PreflightCheckResult(
            key="jetson-platform",
            status="pass",
            summary=summary,
            metadata={"deviceModel": host.device_model},
        )

    return PreflightCheckResult(
        key="jetson-platform",
        status="warn",
        summary="Jetson platform indicators were not detected.",
        detail="The runtime can still be dry-run on other hosts, but Argus capture checks are intended for Jetson hardware.",
        hint="On the Jetson, verify `/proc/device-tree/model` and `/etc/nv_tegra_release` are available.",
    )


def _check_l4t_release(host: HostDetails) -> PreflightCheckResult:
    if host.l4t_version or host.jetpack_version:
        summary = (
            f"Detected platform release: JetPack={host.jetpack_version or 'unknown'}, "
            f"L4T={host.l4t_version or 'unknown'}."
        )
        return PreflightCheckResult(
            key="jetpack-l4t",
            status="pass",
            summary=summary,
            metadata={
                "jetpackVersion": host.jetpack_version,
                "l4tVersion": host.l4t_version,
            },
        )

    return PreflightCheckResult(
        key="jetpack-l4t",
        status="warn",
        summary="Could not detect JetPack / L4T version information.",
        detail="`/etc/nv_tegra_release` was not found or could not be parsed.",
        hint="This is informative only; continue if other Jetson checks pass.",
    )


def _check_binary_available(
    key: str,
    binary_name: str,
    resolved_path: str | None,
    required: bool,
    hint: str,
) -> PreflightCheckResult:
    if resolved_path:
        return PreflightCheckResult(
            key=key,
            status="pass",
            summary=f"Resolved `{binary_name}` at `{resolved_path}`.",
            metadata={"binaryName": binary_name, "resolvedPath": resolved_path},
        )

    status = "fail" if required else "warn"
    return PreflightCheckResult(
        key=key,
        status=status,
        summary=f"`{binary_name}` was not found on PATH.",
        hint=hint,
        critical=required,
        metadata={"binaryName": binary_name},
    )


def _check_gstreamer_plugin(
    gst_inspect_path: str | None,
    plugin_name: str,
    plugin_purpose: str,
    required: bool,
    timeout_seconds: int,
) -> PreflightCheckResult:
    if gst_inspect_path is None:
        status = "fail" if required else "warn"
        return PreflightCheckResult(
            key=f"gst-plugin:{plugin_name}",
            status=status,
            summary=f"Could not validate `{plugin_name}` because `gst-inspect-1.0` is unavailable.",
            hint="Fix the `gst-inspect-1.0` binary first, then rerun preflight.",
            critical=required,
            metadata={"pluginName": plugin_name},
        )

    command_result = _execute_command(
        [gst_inspect_path, plugin_name],
        timeout_seconds=timeout_seconds,
    )
    if command_result.ok:
        return PreflightCheckResult(
            key=f"gst-plugin:{plugin_name}",
            status="pass",
            summary=f"GStreamer plugin `{plugin_name}` is available for {plugin_purpose}.",
            metadata={"pluginName": plugin_name, "pluginPurpose": plugin_purpose},
        )

    status = "fail" if required else "warn"
    detail = _summarize_command_failure(command_result)
    return PreflightCheckResult(
        key=f"gst-plugin:{plugin_name}",
        status=status,
        summary=f"GStreamer plugin `{plugin_name}` is unavailable for {plugin_purpose}.",
        detail=detail,
        hint=f"Run `gst-inspect-1.0 {plugin_name}` directly on the Jetson to inspect the plugin state.",
        critical=required,
        metadata={"pluginName": plugin_name, "pluginPurpose": plugin_purpose},
    )


def _check_argus_daemon(host: HostDetails, timeout_seconds: int) -> PreflightCheckResult:
    if host.system != "Linux":
        return PreflightCheckResult(
            key="argus-daemon",
            status="warn",
            summary="Skipped Argus daemon check on a non-Linux host.",
        )

    systemctl_path = shutil.which("systemctl")
    if systemctl_path:
        command_result = _execute_command(
            [systemctl_path, "is-active", ARGUS_DAEMON_NAME],
            timeout_seconds=timeout_seconds,
        )
        active_state = command_result.stdout.strip()
        if command_result.ok and active_state == "active":
            return PreflightCheckResult(
                key="argus-daemon",
                status="pass",
                summary=f"`{ARGUS_DAEMON_NAME}` is active.",
            )

        detail = _summarize_command_failure(command_result)
        if active_state:
            detail = f"systemctl reported `{active_state}`. {detail}".strip()
        return PreflightCheckResult(
            key="argus-daemon",
            status="fail",
            summary=f"`{ARGUS_DAEMON_NAME}` is not active.",
            detail=detail,
            hint=f"Try `sudo systemctl restart {ARGUS_DAEMON_NAME}` and rerun preflight.",
            critical=True,
        )

    pgrep_path = shutil.which("pgrep")
    if pgrep_path:
        command_result = _execute_command(
            [pgrep_path, "-x", ARGUS_DAEMON_NAME],
            timeout_seconds=timeout_seconds,
        )
        if command_result.ok and command_result.stdout.strip():
            return PreflightCheckResult(
                key="argus-daemon",
                status="pass",
                summary=f"`{ARGUS_DAEMON_NAME}` appears to be running.",
            )

        return PreflightCheckResult(
            key="argus-daemon",
            status="fail",
            summary=f"`{ARGUS_DAEMON_NAME}` does not appear to be running.",
            detail=_summarize_command_failure(command_result),
            hint=f"Start or restart `{ARGUS_DAEMON_NAME}` before running the runtime.",
            critical=True,
        )

    return PreflightCheckResult(
        key="argus-daemon",
        status="warn",
        summary="Could not check Argus daemon state because neither `systemctl` nor `pgrep` is available.",
        hint="Verify the daemon manually if the later sensor smoke test fails.",
    )


def _check_video_device_node(device_path: Path, host: HostDetails) -> PreflightCheckResult:
    if host.system != "Linux":
        return PreflightCheckResult(
            key=f"video-node:{device_path}",
            status="warn",
            summary=f"Skipped device-node check for `{device_path}` on a non-Linux host.",
        )

    if device_path.exists():
        return PreflightCheckResult(
            key=f"video-node:{device_path}",
            status="pass",
            summary=f"Camera node `{device_path}` exists.",
            metadata={"devicePath": str(device_path)},
        )

    return PreflightCheckResult(
        key=f"video-node:{device_path}",
        status="fail",
        summary=f"Camera node `{device_path}` is missing.",
        hint="Re-check camera cabling, Jetson-IO configuration, and device enumeration before running the runtime.",
        critical=True,
        metadata={"devicePath": str(device_path)},
    )


def _check_sensor_ids(config: AppConfig) -> PreflightCheckResult:
    sensor_ids = (config.camera.left_sensor_id, config.camera.right_sensor_id)
    if len(set(sensor_ids)) != len(sensor_ids):
        return PreflightCheckResult(
            key="sensor-ids",
            status="fail",
            summary=(
                "Configured left and right sensor IDs are not distinct: "
                f"{config.camera.left_sensor_id}, {config.camera.right_sensor_id}."
            ),
            hint="Use unique Argus sensor IDs for the left and right cameras.",
            critical=True,
            metadata={
                "leftSensorId": config.camera.left_sensor_id,
                "rightSensorId": config.camera.right_sensor_id,
            },
        )

    return PreflightCheckResult(
        key="sensor-ids",
        status="pass",
        summary=(
            "Configured sensor IDs look sensible: "
            f"left={config.camera.left_sensor_id}, right={config.camera.right_sensor_id}."
        ),
        metadata={
            "leftSensorId": config.camera.left_sensor_id,
            "rightSensorId": config.camera.right_sensor_id,
        },
    )


def _check_output_writable(
    output_path: Path | None,
    required: bool,
) -> PreflightCheckResult:
    if output_path is None:
        status = "warn" if not required else "fail"
        return PreflightCheckResult(
            key="output-path",
            status=status,
            summary="No output path could be resolved for preflight validation.",
            hint="Provide `--output-path` or keep a valid `output_directory` in the config.",
            critical=required,
        )

    target_directory = output_path.parent
    try:
        target_directory.mkdir(parents=True, exist_ok=True)
        if output_path.exists() and output_path.is_dir():
            raise IsADirectoryError(f"Expected a file path but found a directory: {output_path}")
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=target_directory,
            prefix=".nevex_preflight_",
            delete=False,
        ) as handle:
            handle.write("nevex-preflight\n")
            temp_path = Path(handle.name)
        temp_path.unlink(missing_ok=True)
    except Exception as error:
        status = "fail" if required else "warn"
        return PreflightCheckResult(
            key="output-path",
            status=status,
            summary=f"Output directory is not writable for `{output_path}`.",
            detail=str(error),
            hint="Fix directory permissions or choose a writable `--output-path`.",
            critical=required,
            metadata={"outputPath": str(output_path)},
        )

    summary = (
        f"Verified write access for `{target_directory}` using a temporary file."
    )
    return PreflightCheckResult(
        key="output-path",
        status="pass",
        summary=summary,
        metadata={"outputPath": str(output_path), "outputDirectory": str(target_directory)},
    )


def _check_argus_sensor_capture(
    config: AppConfig,
    eye_label: str,
    sensor_id: int,
    gst_launch_path: str | None,
    timeout_seconds: int,
) -> PreflightCheckResult:
    if gst_launch_path is None:
        return PreflightCheckResult(
            key=f"argus-sensor:{eye_label}",
            status="fail",
            summary=f"Could not validate {eye_label} sensor-id {sensor_id} because gst-launch is unavailable.",
            hint="Fix the gst-launch binary first, then rerun preflight.",
            critical=True,
            metadata={"eye": eye_label, "sensorId": sensor_id},
        )

    command_result = _execute_command(
        _build_argus_smoke_test_command(
            gst_launch_binary=gst_launch_path,
            sensor_id=sensor_id,
            width=config.camera.width,
            height=config.camera.height,
            framerate_fraction=config.camera.framerate_fraction,
        ),
        timeout_seconds=timeout_seconds,
    )
    if command_result.ok:
        return PreflightCheckResult(
            key=f"argus-sensor:{eye_label}",
            status="pass",
            summary=(
                f"Argus one-shot capture succeeded for {eye_label} sensor-id {sensor_id} "
                f"at {config.camera.width}x{config.camera.height}@{config.camera.fps}."
            ),
            metadata={"eye": eye_label, "sensorId": sensor_id},
        )

    summary, hint = _classify_argus_failure(sensor_id, command_result)
    return PreflightCheckResult(
        key=f"argus-sensor:{eye_label}",
        status="fail",
        summary=f"{summary} ({eye_label} eye).",
        detail=_summarize_command_failure(command_result),
        hint=hint,
        critical=True,
        metadata={"eye": eye_label, "sensorId": sensor_id},
    )


def _skipped_sensor_capture_check(
    eye_label: str,
    sensor_id: int,
    reason: str,
) -> PreflightCheckResult:
    return PreflightCheckResult(
        key=f"argus-sensor:{eye_label}",
        status="warn",
        summary=f"Skipped Argus one-shot capture for {eye_label} sensor-id {sensor_id}.",
        detail=reason,
        hint="Fix the earlier prerequisite failure and rerun preflight to validate the sensor ID directly.",
        metadata={"eye": eye_label, "sensorId": sensor_id},
    )


def _resolve_output_target(
    config: AppConfig,
    target_mode: str | None,
    target_output_mode: str | None,
    target_output_path: str | Path | None,
) -> tuple[str, Path]:
    if target_mode in SNAPSHOT_TARGET_MODES or target_mode in PREVIEW_FILE_TARGET_MODES:
        resolved_output_mode = "file"
    elif target_mode in PREVIEW_STREAM_TARGET_MODES:
        resolved_output_mode = "publisher"
    elif target_mode in RECORD_TARGET_MODES:
        resolved_output_mode = "file"
    elif target_mode in HEADLESS_TARGET_MODES:
        resolved_output_mode = "fakesink"
    else:
        resolved_output_mode = target_output_mode or config.output.mode

    if target_output_path is not None:
        resolved_output_path = Path(target_output_path).expanduser().resolve()
    else:
        if target_mode in SNAPSHOT_TARGET_MODES:
            filename = f"{config.output.snapshot_filename_prefix}_preflight.jpg"
        elif target_mode in PREVIEW_FILE_TARGET_MODES:
            filename = f"{config.output.preview_filename_prefix}_preflight.jpg"
        elif target_mode in PREVIEW_STREAM_TARGET_MODES:
            filename = ".preview_publisher_preflight"
        elif target_mode in RECORD_TARGET_MODES:
            filename = (
                f"{config.output.recording_filename_prefix}_preflight."
                f"{config.output.recording_container}"
            )
        elif resolved_output_mode == "file":
            filename = (
                f"{config.output.recording_filename_prefix}_preflight."
                f"{config.output.recording_container}"
            )
        else:
            filename = ".preflight_write_test"
        resolved_output_path = (config.output.output_directory / filename).resolve()

    return resolved_output_mode, resolved_output_path


def _build_argus_smoke_test_command(
    gst_launch_binary: str,
    sensor_id: int,
    width: int,
    height: int,
    framerate_fraction: str,
) -> list[str]:
    caps = (
        "video/x-raw(memory:NVMM),"
        f"width={width},"
        f"height={height},"
        f"framerate={framerate_fraction}"
    )
    return [
        gst_launch_binary,
        "-e",
        "nvarguscamerasrc",
        f"sensor-id={sensor_id}",
        "num-buffers=1",
        "!",
        caps,
        "!",
        "fakesink",
        "sync=false",
        "async=false",
    ]


def _is_plugin_required(
    scope: str,
    target_mode: str | None,
    target_output_mode: str,
    recording_container: str,
    plugin_scope: str,
) -> bool:
    if plugin_scope == "core":
        return True

    if scope == "full_runtime":
        if plugin_scope == "recording-mp4":
            return recording_container == "mp4"
        if plugin_scope == "recording-mkv":
            return recording_container == "mkv"
        return True

    non_recording_file_target_modes = SNAPSHOT_TARGET_MODES | PREVIEW_FILE_TARGET_MODES

    if plugin_scope == "headless":
        return (
            target_mode not in non_recording_file_target_modes
            and target_mode not in PREVIEW_STREAM_TARGET_MODES
            and target_output_mode == "fakesink"
        )
    if plugin_scope == "snapshot":
        return target_mode in SNAPSHOT_TARGET_MODES or target_mode in PREVIEW_FILE_TARGET_MODES
    if plugin_scope == "file":
        return target_mode in non_recording_file_target_modes or target_output_mode == "file"
    if plugin_scope == "preview-stream":
        return target_mode in PREVIEW_STREAM_TARGET_MODES
    if plugin_scope == "recording":
        return target_output_mode == "file" and target_mode not in non_recording_file_target_modes
    if plugin_scope == "recording-mkv":
        return (
            target_output_mode == "file"
            and target_mode not in non_recording_file_target_modes
            and recording_container == "mkv"
        )
    if plugin_scope == "recording-mp4":
        return (
            target_output_mode == "file"
            and target_mode not in non_recording_file_target_modes
            and recording_container == "mp4"
        )
    return False


def _is_output_directory_required(
    scope: str,
    target_mode: str | None,
    target_output_mode: str,
) -> bool:
    if scope == "full_runtime":
        return True
    return (
        target_mode in SNAPSHOT_TARGET_MODES
        or target_mode in PREVIEW_FILE_TARGET_MODES
        or target_output_mode == "file"
    )


def _derive_smoke_test_skip_reason(
    host: HostDetails,
    gst_launch_path: str | None,
    plugin_result: PreflightCheckResult,
    argus_daemon_result: PreflightCheckResult,
    sensor_config_result: PreflightCheckResult,
) -> str:
    if host.system != "Linux":
        return "non-Linux host"
    if gst_launch_path is None:
        return "gst-launch-1.0 is missing"
    if plugin_result.status != "pass":
        return "nvarguscamerasrc plugin is unavailable"
    if argus_daemon_result.status != "pass":
        return "nvargus-daemon is not active"
    if sensor_config_result.status != "pass":
        return "sensor ID configuration is invalid"
    return "an earlier prerequisite failed"


def _classify_argus_failure(
    sensor_id: int,
    command_result: CommandExecutionResult,
) -> tuple[str, str]:
    combined_output = "\n".join(
        part for part in (command_result.stdout, command_result.stderr, command_result.error_message) if part
    ).lower()

    if "no element" in combined_output and "nvarguscamerasrc" in combined_output:
        return (
            f"Argus capture failed for sensor-id {sensor_id} because `nvarguscamerasrc` is missing",
            "Install or expose the Jetson Argus GStreamer plugin, then rerun preflight.",
        )
    if "nvargus-daemon" in combined_output and (
        "failed" in combined_output or "cannot" in combined_output or "not running" in combined_output
    ):
        return (
            f"Argus capture failed for sensor-id {sensor_id} because the Argus daemon is unavailable",
            "Restart `nvargus-daemon` and rerun the same preflight command.",
        )
    if "invalid camera device specified" in combined_output or "no cameras available" in combined_output:
        return (
            f"Argus capture failed for sensor-id {sensor_id}; the configured sensor ID may be wrong or unavailable",
            "Re-run the known working single-camera Argus command with this sensor ID and verify the left/right mapping.",
        )
    if "resource busy" in combined_output:
        return (
            f"Argus capture failed for sensor-id {sensor_id} because the camera is busy",
            "Stop other camera processes, then rerun preflight.",
        )
    if "permission denied" in combined_output:
        return (
            f"Argus capture failed for sensor-id {sensor_id} because access was denied",
            "Run the runtime as a user with camera and device access on the Jetson.",
        )
    if "timed out" in combined_output or "timeout" in combined_output:
        return (
            f"Argus capture timed out for sensor-id {sensor_id}",
            "Check camera stability, Argus health, and whether the requested mode is supported.",
        )
    if "could not get settings from argus" in combined_output:
        return (
            f"Argus capture failed for sensor-id {sensor_id}; Argus could not apply the requested camera settings",
            "Verify that the configured sensor ID, resolution, and frame rate are valid for this camera.",
        )

    return (
        f"Argus capture failed for sensor-id {sensor_id}",
        "Inspect the captured stderr output above and compare it with the known working single-camera pipeline.",
    )


def _execute_command(command: list[str], timeout_seconds: int) -> CommandExecutionResult:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except FileNotFoundError as error:
        return CommandExecutionResult(
            ok=False,
            returncode=None,
            stdout="",
            stderr="",
            error_message=str(error),
        )
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout if isinstance(error.stdout, str) else ""
        stderr = error.stderr if isinstance(error.stderr, str) else ""
        return CommandExecutionResult(
            ok=False,
            returncode=None,
            stdout=stdout,
            stderr=stderr,
            error_message=f"Command timed out after {timeout_seconds} second(s).",
        )
    except OSError as error:
        return CommandExecutionResult(
            ok=False,
            returncode=None,
            stdout="",
            stderr="",
            error_message=str(error),
        )

    return CommandExecutionResult(
        ok=completed.returncode == 0,
        returncode=completed.returncode,
        stdout=completed.stdout.strip(),
        stderr=completed.stderr.strip(),
        error_message=None,
    )


def _read_text_file(path: Path) -> str | None:
    try:
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8", errors="ignore").replace("\x00", "").strip()
    except OSError:
        return None


def _detect_nv_tegra_release() -> tuple[str | None, str | None]:
    release_text = _read_text_file(Path("/etc/nv_tegra_release"))
    if not release_text:
        return None, None

    match = re.search(r"R(\d+)\s+\(release\),\s+REVISION:\s+([0-9.]+)", release_text)
    if not match:
        return None, None

    l4t_version = _normalize_version(f"{match.group(1)}.{match.group(2)}")
    jetpack_version = _infer_jetpack_family(match.group(1))
    return l4t_version, jetpack_version


def _infer_jetpack_family(l4t_major: str) -> str | None:
    if l4t_major == "36":
        return "6.x (inferred)"
    if l4t_major == "35":
        return "5.x (inferred)"
    return None


def _normalize_version(raw_version: str) -> str:
    parts = raw_version.split(".")
    while parts and parts[-1] == "0":
        parts.pop()
    return ".".join(parts) if parts else raw_version


def _summarize_command_failure(command_result: CommandExecutionResult) -> str:
    segments = []
    if command_result.error_message:
        segments.append(command_result.error_message)
    if command_result.stderr:
        segments.append(command_result.stderr)
    if command_result.stdout:
        segments.append(command_result.stdout)
    if command_result.returncode is not None:
        segments.append(f"exit_code={command_result.returncode}")

    if not segments:
        return "Command failed without additional output."
    return " | ".join(segment.strip() for segment in segments if segment.strip())


def _resolve_overall_status(
    warn_count: int,
    fail_count: int,
    critical_fail_count: int,
) -> str:
    if critical_fail_count > 0:
        return "fail"
    if fail_count > 0 or warn_count > 0:
        return "warn"
    return "pass"


def _log_with_status(logger: Any, status: str, message: str) -> None:
    if status == "fail":
        logger.error(message)
        return
    if status == "warn":
        logger.warning(message)
        return
    logger.info(message)
