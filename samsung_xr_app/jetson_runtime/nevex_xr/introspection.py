from __future__ import annotations

from typing import Any

from .config import AppConfig, load_app_config
from .pipeline_builder import PipelinePlan, SUPPORTED_APP_MODES
from .preflight import detect_host_details
from .preview_capture import PREVIEW_FRAME_MODE
from .preview_publisher import PREVIEW_PUBLISHER_MODE

MODE_DESCRIPTIONS: dict[str, dict[str, Any]] = {
    "preflight": {
        "category": "validation",
        "artifact_expected": False,
        "description": "Validate the Jetson runtime environment before starting capture.",
    },
    PREVIEW_FRAME_MODE: {
        "category": "preview",
        "artifact_expected": False,
        "description": "Capture one Jetson-authored left/right preview pair for the XR preview bridge.",
    },
    PREVIEW_PUBLISHER_MODE: {
        "category": "preview",
        "artifact_expected": False,
        "description": "Run a persistent Jetson-owned preview publisher that emits continuous synchronized preview events.",
    },
    "headless": {
        "category": "runtime",
        "artifact_expected": False,
        "description": "Run the stereo runtime continuously or for an optional bounded duration.",
    },
    "snapshot": {
        "category": "artifact",
        "artifact_expected": True,
        "description": "Legacy alias for stereo-snapshot.",
    },
    "stereo-test": {
        "category": "validation",
        "artifact_expected": True,
        "description": "Bounded validation mode using fakesink by default or file output when requested.",
    },
    "stereo-smoke": {
        "category": "validation",
        "artifact_expected": False,
        "description": "Run the true composed stereo pipeline for a bounded smoke test.",
    },
    "stereo-snapshot": {
        "category": "artifact",
        "artifact_expected": True,
        "description": "Capture a real side-by-side stereo image artifact.",
    },
    "stereo-record": {
        "category": "artifact",
        "artifact_expected": True,
        "description": "Capture a bounded side-by-side stereo video artifact.",
    },
}


def build_mode_listing() -> dict[str, Any]:
    ordered_mode_names = [
        "preflight",
        PREVIEW_FRAME_MODE,
        PREVIEW_PUBLISHER_MODE,
        *SUPPORTED_APP_MODES,
    ]
    return {
        "modes": [
            {
                "name": mode_name,
                "category": MODE_DESCRIPTIONS[mode_name]["category"],
                "artifact_expected": MODE_DESCRIPTIONS[mode_name]["artifact_expected"],
                "description": MODE_DESCRIPTIONS[mode_name]["description"],
            }
            for mode_name in ordered_mode_names
        ],
    }


def build_profile_listing(config_path: str) -> dict[str, Any]:
    config = load_app_config(config_path)
    profiles = [
        build_profile_description_payload(
            load_app_config(config_path, selected_profile_name=profile_name),
        )
        for profile_name in config.available_profile_names
    ]
    return {
        "config_path": str(config.config_path),
        "default_profile_name": config.default_profile_name,
        "profiles": profiles,
    }


def build_profile_description_payload(config: AppConfig) -> dict[str, Any]:
    return {
        "name": config.active_profile.name,
        "profile_type": config.active_profile.profile_type,
        "description": config.active_profile.description,
        "extends": config.active_profile.extends,
        "inheritance_chain": list(config.active_profile.inheritance_chain),
        "is_default": config.active_profile.is_default,
        "left_sensor_id": config.camera.left_sensor_id,
        "right_sensor_id": config.camera.right_sensor_id,
        "input_resolution": {
            "width": config.camera.width,
            "height": config.camera.height,
        },
        "output_resolution": {
            "width": config.camera.output_width,
            "height": config.camera.output_height,
        },
        "fps": config.camera.fps,
        "queue_max_size_buffers": config.camera.queue_max_size_buffers,
        "output_mode": config.output.mode,
        "preview_filename_prefix": config.output.preview_filename_prefix,
        "preview_jpeg_quality": config.output.preview_jpeg_quality,
        "test_duration_seconds": config.output.test_duration_seconds,
        "record_duration_seconds": config.output.record_duration_seconds,
        "recording_container": config.output.recording_container,
        "h264_bitrate": config.output.h264_bitrate,
    }


def build_effective_config_payload(
    config: AppConfig,
    plan: PipelinePlan | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "project_name": config.project_name,
        "config_path": str(config.config_path),
        "active_profile": build_profile_description_payload(config),
        "default_profile_name": config.default_profile_name,
        "available_profile_names": list(config.available_profile_names),
        "camera": {
            "left_sensor_id": config.camera.left_sensor_id,
            "right_sensor_id": config.camera.right_sensor_id,
            "width": config.camera.width,
            "height": config.camera.height,
            "output_width": config.camera.output_width,
            "output_height": config.camera.output_height,
            "fps": config.camera.fps,
            "expected_video_devices": [
                str(path) for path in config.camera.expected_video_devices
            ],
            "flip_method": config.camera.flip_method,
            "queue_max_size_buffers": config.camera.queue_max_size_buffers,
        },
        "output": {
            "mode": config.output.mode,
            "output_directory": str(config.output.output_directory),
            "preview_filename_prefix": config.output.preview_filename_prefix,
            "preview_jpeg_quality": config.output.preview_jpeg_quality,
            "snapshot_filename_prefix": config.output.snapshot_filename_prefix,
            "recording_filename_prefix": config.output.recording_filename_prefix,
            "recording_container": config.output.recording_container,
            "test_duration_seconds": config.output.test_duration_seconds,
            "record_duration_seconds": config.output.record_duration_seconds,
            "sync": config.output.sync,
            "h264_bitrate": config.output.h264_bitrate,
        },
        "runtime": {
            "gst_launch_binary": config.runtime.gst_launch_binary,
            "gst_inspect_binary": config.runtime.gst_inspect_binary,
            "gst_debug": config.runtime.gst_debug,
            "shutdown_grace_seconds": config.runtime.shutdown_grace_seconds,
            "preflight_timeout_seconds": config.runtime.preflight_timeout_seconds,
            "run_preflight_on_start": config.runtime.run_preflight_on_start,
        },
        "features": {
            "stereo_display": config.features.stereo_display,
            "thermal_overlay": config.features.thermal_overlay,
            "ai_detection": config.features.ai_detection,
            "xr_transport": config.features.xr_transport,
        },
    }
    if plan is not None:
        payload["effective_plan"] = {
            "mode": plan.mode,
            "output_mode": plan.output_mode,
            "output_path": str(plan.output_path) if plan.output_path is not None else None,
            "run_duration_seconds": plan.run_duration_seconds,
            "artifact_expected": plan.artifact_expected,
            "single_frame_capture": plan.single_frame_capture,
            "success_classification": plan.success_classification,
        }
    return payload


def build_system_summary(config: AppConfig | None = None) -> dict[str, Any]:
    host = detect_host_details()
    payload = {
        "host": {
            "system": host.system,
            "release": host.release,
            "machine": host.machine,
            "python_version": host.python_version,
            "is_jetson": host.is_jetson,
            "device_model": host.device_model,
            "l4t_version": host.l4t_version,
            "jetpack_version": host.jetpack_version,
        },
    }
    if config is not None:
        payload["runtime"] = {
            "project_name": config.project_name,
            "config_path": str(config.config_path),
            "active_profile_name": config.active_profile.name,
            "default_profile_name": config.default_profile_name,
            "available_profile_names": list(config.available_profile_names),
        }
    return payload


def emit_mode_listing(logger: Any, payload: dict[str, Any]) -> None:
    logger.info("Supported runtime modes:")
    for mode in payload["modes"]:
        logger.info(
            "- %s [%s] artifact_expected=%s",
            mode["name"],
            mode["category"],
            mode["artifact_expected"],
        )
        logger.info("  %s", mode["description"])


def emit_profile_listing(logger: Any, payload: dict[str, Any]) -> None:
    logger.info(
        "Available runtime profiles (default=%s):",
        payload.get("default_profile_name") or "none",
    )
    for profile in payload["profiles"]:
        default_marker = " [default]" if profile["is_default"] else ""
        logger.info(
            "- %s [%s]%s input=%sx%s output=%sx%s fps=%s output_mode=%s",
            profile["name"],
            profile["profile_type"],
            default_marker,
            profile["input_resolution"]["width"],
            profile["input_resolution"]["height"],
            profile["output_resolution"]["width"],
            profile["output_resolution"]["height"],
            profile["fps"],
            profile["output_mode"],
        )
        if profile["description"]:
            logger.info("  %s", profile["description"])
        if profile["inheritance_chain"]:
            logger.info(
                "  inheritance: %s",
                " -> ".join(profile["inheritance_chain"]),
            )


def emit_profile_description(logger: Any, payload: dict[str, Any]) -> None:
    logger.info("Runtime profile description:")
    logger.info("- name: %s", payload["name"])
    logger.info("- type: %s", payload["profile_type"])
    logger.info("- default: %s", payload["is_default"])
    if payload["description"]:
        logger.info("- description: %s", payload["description"])
    if payload["extends"]:
        logger.info("- extends: %s", payload["extends"])
    if payload["inheritance_chain"]:
        logger.info("- inheritance_chain: %s", " -> ".join(payload["inheritance_chain"]))
    logger.info(
        "- input_resolution: %sx%s",
        payload["input_resolution"]["width"],
        payload["input_resolution"]["height"],
    )
    logger.info(
        "- output_resolution: %sx%s",
        payload["output_resolution"]["width"],
        payload["output_resolution"]["height"],
    )
    logger.info("- fps: %s", payload["fps"])
    logger.info("- output_mode: %s", payload["output_mode"])
    logger.info("- preview_filename_prefix: %s", payload["preview_filename_prefix"])
    logger.info("- preview_jpeg_quality: %s", payload["preview_jpeg_quality"])
    logger.info("- test_duration_seconds: %s", payload["test_duration_seconds"])
    logger.info("- record_duration_seconds: %s", payload["record_duration_seconds"])
    logger.info("- recording_container: %s", payload["recording_container"])
    logger.info("- h264_bitrate: %s", payload["h264_bitrate"])
    logger.info("- queue_max_size_buffers: %s", payload["queue_max_size_buffers"])
    logger.info(
        "- sensors: left=%s right=%s",
        payload["left_sensor_id"],
        payload["right_sensor_id"],
    )


def emit_effective_config(logger: Any, payload: dict[str, Any]) -> None:
    active_profile = payload["active_profile"]
    logger.info("Effective runtime configuration:")
    logger.info("- project_name: %s", payload["project_name"])
    logger.info("- config_path: %s", payload["config_path"])
    logger.info(
        "- active_profile: %s [%s]",
        active_profile["name"],
        active_profile["profile_type"],
    )
    logger.info("- active_profile_is_default: %s", active_profile["is_default"])
    if active_profile["description"]:
        logger.info("- active_profile_description: %s", active_profile["description"])
    if active_profile["inheritance_chain"]:
        logger.info(
            "- active_profile_inheritance: %s",
            " -> ".join(active_profile["inheritance_chain"]),
        )
    logger.info(
        "- default_profile_name: %s",
        payload.get("default_profile_name") or "none",
    )
    if payload["available_profile_names"]:
        logger.info(
            "- available_profile_names: %s",
            ", ".join(payload["available_profile_names"]),
        )
    camera = payload["camera"]
    logger.info(
        "- camera: sensors=(%s,%s) input=%sx%s output=%sx%s fps=%s queue_max_size_buffers=%s flip_method=%s",
        camera["left_sensor_id"],
        camera["right_sensor_id"],
        camera["width"],
        camera["height"],
        camera["output_width"],
        camera["output_height"],
        camera["fps"],
        camera["queue_max_size_buffers"],
        camera["flip_method"],
    )
    logger.info(
        "  expected_video_devices: %s",
        ", ".join(camera["expected_video_devices"]),
    )
    output = payload["output"]
    logger.info(
        "- output: mode=%s output_directory=%s preview_prefix=%s snapshot_prefix=%s recording_prefix=%s container=%s",
        output["mode"],
        output["output_directory"],
        output["preview_filename_prefix"],
        output["snapshot_filename_prefix"],
        output["recording_filename_prefix"],
        output["recording_container"],
    )
    logger.info(
        "  durations: test=%ss record=%ss bitrate=%s preview_jpeg_quality=%s sync=%s",
        output["test_duration_seconds"],
        output["record_duration_seconds"],
        output["h264_bitrate"],
        output["preview_jpeg_quality"],
        output["sync"],
    )
    runtime = payload["runtime"]
    logger.info(
        "- runtime: gst_launch=%s gst_inspect=%s gst_debug=%s preflight_timeout=%ss shutdown_grace=%ss run_preflight_on_start=%s",
        runtime["gst_launch_binary"],
        runtime["gst_inspect_binary"],
        runtime["gst_debug"],
        runtime["preflight_timeout_seconds"],
        runtime["shutdown_grace_seconds"],
        runtime["run_preflight_on_start"],
    )
    features = payload["features"]
    logger.info(
        "- features: stereo_display=%s thermal_overlay=%s ai_detection=%s xr_transport=%s",
        features["stereo_display"],
        features["thermal_overlay"],
        features["ai_detection"],
        features["xr_transport"],
    )
    plan = payload.get("effective_plan")
    if isinstance(plan, dict):
        logger.info(
            "- effective_plan: mode=%s output_mode=%s duration=%s output_path=%s single_frame=%s artifact_expected=%s",
            plan["mode"],
            plan["output_mode"],
            (
                "single-frame"
                if plan["single_frame_capture"]
                else (
                    str(plan["run_duration_seconds"])
                    if plan["run_duration_seconds"] is not None
                    else "continuous"
                )
            ),
            plan["output_path"] or "none",
            plan["single_frame_capture"],
            plan["artifact_expected"],
        )


def emit_system_summary(logger: Any, payload: dict[str, Any]) -> None:
    host = payload["host"]
    logger.info("System/runtime summary:")
    logger.info(
        "- host: system=%s release=%s machine=%s python=%s jetson=%s",
        host["system"],
        host["release"],
        host["machine"],
        host["python_version"],
        host["is_jetson"],
    )
    if host.get("device_model"):
        logger.info("- device_model: %s", host["device_model"])
    if host.get("jetpack_version") or host.get("l4t_version"):
        logger.info(
            "- platform_release: jetpack=%s l4t=%s",
            host.get("jetpack_version") or "unknown",
            host.get("l4t_version") or "unknown",
        )
    runtime = payload.get("runtime")
    if isinstance(runtime, dict):
        logger.info(
            "- runtime: project=%s config=%s active_profile=%s default_profile=%s",
            runtime["project_name"],
            runtime["config_path"],
            runtime["active_profile_name"],
            runtime["default_profile_name"] or "none",
        )
        if runtime["available_profile_names"]:
            logger.info(
                "- available_profiles: %s",
                ", ".join(runtime["available_profile_names"]),
            )


def load_profile_listing_payload(config_path: str) -> dict[str, Any]:
    return build_profile_listing(config_path)
