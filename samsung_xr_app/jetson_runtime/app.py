from __future__ import annotations

import argparse
import json
import platform
import sys
from pathlib import Path
from typing import Any

from nevex_xr.config import load_app_config
from nevex_xr.introspection import (
    build_effective_config_payload,
    build_mode_listing,
    build_profile_description_payload,
    build_system_summary,
    emit_effective_config,
    emit_mode_listing,
    emit_profile_description,
    emit_profile_listing,
    emit_system_summary,
    load_profile_listing_payload,
)
from nevex_xr.pipeline_builder import SUPPORTED_APP_MODES, build_pipeline_plan
from nevex_xr.pipeline_runner import GStreamerPipelineRunner
from nevex_xr.preflight import emit_preflight_report, run_preflight
from nevex_xr.preview_capture import (
    PREVIEW_FRAME_MODE,
    build_preview_capture_plan,
    capture_stereo_preview_frame,
    emit_preview_frame_result,
)
from nevex_xr.preview_publisher import PREVIEW_PUBLISHER_MODE, run_preview_publisher
from nevex_xr.utils.logging_utils import configure_logging, get_logger

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "camera_config.json"
SUPPORTED_CLI_MODES = SUPPORTED_APP_MODES + (
    "preflight",
    PREVIEW_FRAME_MODE,
    PREVIEW_PUBLISHER_MODE,
)


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="NEVEX XR Jetson stereo camera runtime.",
    )
    parser.add_argument(
        "--mode",
        choices=SUPPORTED_CLI_MODES,
        help="Application mode to run.",
    )
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG_PATH),
        help="Path to the JSON configuration file.",
    )
    parser.add_argument(
        "--profile",
        help="Optional named runtime profile override from the config file.",
    )
    parser.add_argument(
        "--list-profiles",
        action="store_true",
        help="List available runtime profiles and exit.",
    )
    parser.add_argument(
        "--describe-profile",
        help="Describe one runtime profile in detail and exit.",
    )
    parser.add_argument(
        "--show-effective-config",
        action="store_true",
        help="Show the effective resolved runtime configuration.",
    )
    parser.add_argument(
        "--list-modes",
        action="store_true",
        help="List supported runtime modes and exit.",
    )
    parser.add_argument(
        "--show-system-summary",
        action="store_true",
        help="Show a concise system/runtime summary.",
    )
    parser.add_argument(
        "--output-mode",
        choices=("fakesink", "file"),
        help="Optional override for the configured output mode.",
    )
    parser.add_argument(
        "--output-path",
        help="Optional explicit output file path for snapshot or recording modes.",
    )
    parser.add_argument(
        "--duration-seconds",
        type=int,
        help="Optional run duration override for timed modes.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        help="Python log level. Example: DEBUG, INFO, WARNING.",
    )
    parser.add_argument(
        "--log-file",
        help="Optional file to write Python runtime logs to.",
    )
    parser.add_argument(
        "--run-preflight",
        action="store_true",
        help="Run Jetson preflight checks before starting non-preflight modes.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help=(
            "Emit machine-readable output for standalone introspection commands, "
            "preflight, preview runtime modes, or successful artifact summaries "
            "when supported."
        ),
    )
    parser.add_argument(
        "--preview-publish-fps",
        type=float,
        help="Optional publish FPS override for the persistent preview publisher mode.",
    )
    parser.add_argument(
        "--preview-shm-path",
        help="Optional shared-memory file path for the persistent preview publisher bridge.",
    )
    parser.add_argument(
        "--preview-shm-slot-count",
        type=int,
        help="Optional shared-memory ring slot count for the persistent preview publisher bridge.",
    )
    parser.add_argument(
        "--preview-shm-slot-size-bytes",
        type=int,
        help="Optional shared-memory ring slot size in bytes for the persistent preview publisher bridge.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the resolved pipeline command without starting GStreamer.",
    )
    return parser


def main() -> int:
    parser = build_argument_parser()
    args = parser.parse_args()
    introspection_requested = _has_introspection_request(args)

    if args.profile and args.describe_profile:
        parser.error("--profile cannot be combined with --describe-profile. Use one profile selector.")

    if args.mode is None and not introspection_requested:
        parser.error(
            "Provide --mode or an introspection command such as --list-profiles, "
            "--describe-profile, --show-effective-config, or --list-modes.",
        )

    if args.mode is not None and (
        args.list_profiles or args.describe_profile or args.list_modes
    ):
        parser.error(
            "--list-profiles, --describe-profile, and --list-modes are standalone "
            "commands and cannot be combined with --mode.",
        )

    if args.json and args.mode is not None and (
        args.show_effective_config or args.show_system_summary
    ):
        parser.error(
            "--json cannot be combined with runtime execution when "
            "--show-effective-config or --show-system-summary is set.",
        )

    configure_logging(
        args.log_level,
        args.log_file,
        console_stream=sys.stderr if args.json else sys.stdout,
    )
    logger = get_logger("nevex_xr.app")

    config = None
    if _requires_config(args):
        selected_profile_name = _resolve_selected_profile_name(args)
        try:
            config = load_app_config(
                args.config,
                selected_profile_name=selected_profile_name,
            )
        except Exception as error:  # pragma: no cover - startup error path
            logger.error("Startup validation failed: %s", error)
            return 1

    plan = None
    if args.mode is not None and args.mode in SUPPORTED_APP_MODES:
        try:
            plan = build_pipeline_plan(
                config=config,
                mode=args.mode,
                output_mode_override=args.output_mode,
                output_path_override=args.output_path,
                duration_override=args.duration_seconds,
            )
        except Exception as error:  # pragma: no cover - startup error path
            logger.error("Startup validation failed: %s", error)
            return 1

    if args.json and args.mode is not None and not _mode_supports_json(args.mode, plan):
        parser.error(
            "--json is only supported with --mode preflight, "
            f"--mode {PREVIEW_FRAME_MODE}, --mode {PREVIEW_PUBLISHER_MODE}, "
            "or artifact-producing modes.",
        )
    if (
        args.json
        and args.dry_run
        and args.mode is not None
        and args.mode != "preflight"
        and _mode_supports_json(args.mode, plan)
    ):
        parser.error("--json is not supported with --dry-run for preview or artifact modes.")
    if args.mode == PREVIEW_PUBLISHER_MODE and not args.json and not args.dry_run:
        parser.error(
            f"--mode {PREVIEW_PUBLISHER_MODE} requires --json so stdout remains machine-readable.",
        )

    if args.mode is None and introspection_requested:
        payloads = _build_introspection_payloads(
            args=args,
            config=config,
            plan=plan,
        )
        if args.json:
            print(_encode_introspection_payloads(payloads))
        else:
            _emit_introspection_payloads(logger, payloads)
        return 0

    if args.mode is not None and (args.show_effective_config or args.show_system_summary):
        payloads = _build_introspection_payloads(
            args=args,
            config=config,
            plan=plan,
            runtime_only=True,
        )
        _emit_introspection_payloads(logger, payloads)

    should_run_preflight = (
        args.mode == "preflight"
        or args.run_preflight
        or config.runtime.run_preflight_on_start
    )
    if should_run_preflight:
        preflight_report = run_preflight(
            config=config,
            target_mode=args.mode if args.mode != "preflight" else None,
            target_output_mode=(
                plan.output_mode
                if plan is not None
                else (
                    "file"
                    if args.mode == PREVIEW_FRAME_MODE
                    else (
                        "publisher" if args.mode == PREVIEW_PUBLISHER_MODE else args.output_mode
                    )
                )
            ),
            target_output_path=plan.output_path if plan is not None else args.output_path,
        )
        if args.mode == "preflight":
            if args.dry_run:
                logger.warning("`--dry-run` has no effect in preflight mode.")
            if args.json:
                print(preflight_report.to_json())
            else:
                emit_preflight_report(preflight_report, logger)
            return 0 if preflight_report.ok else 1

        emit_preflight_report(preflight_report, logger)
        if not preflight_report.ok:
            logger.error("Preflight failed; aborting `%s` mode startup.", args.mode)
            return 1

    if args.mode == "preflight":
        logger.info("No preflight checks were executed.")
        return 0

    logger.info("Loaded config from %s", config.config_path)
    logger.info(
        "Active runtime profile: %s (type=%s, default=%s)",
        config.active_profile.name,
        config.active_profile.profile_type,
        config.active_profile.is_default,
    )
    if config.active_profile.description:
        logger.info("Profile description: %s", config.active_profile.description)
    if config.active_profile.inheritance_chain:
        logger.info(
            "Profile inheritance chain: %s",
            " -> ".join(config.active_profile.inheritance_chain),
        )
    if config.available_profile_names:
        logger.info(
            "Available profiles: %s",
            ", ".join(config.available_profile_names),
        )
    logger.info(
        "Camera summary: left_sensor_id=%s right_sensor_id=%s input_resolution=%sx%s output_resolution=%sx%s fps=%s",
        config.camera.left_sensor_id,
        config.camera.right_sensor_id,
        config.camera.width,
        config.camera.height,
        config.camera.output_width,
        config.camera.output_height,
        config.camera.fps,
    )
    logger.info(
        "Expected video nodes: %s",
        ", ".join(str(path) for path in config.camera.expected_video_devices),
    )
    logger.info(
        "Feature flags: stereo_display=%s thermal_overlay=%s ai_detection=%s xr_transport=%s",
        config.features.stereo_display,
        config.features.thermal_overlay,
        config.features.ai_detection,
        config.features.xr_transport,
    )
    if platform.system() != "Linux":
        logger.warning(
            "This runtime is intended for Linux/Jetson execution. Current host: %s.",
            platform.system(),
        )
    if args.mode == PREVIEW_FRAME_MODE:
        preview_plan = build_preview_capture_plan(config)
        logger.info(
            "Preview summary: mode=%s profile=%s sensors=(%s,%s) input=%sx%s jpeg_quality=%s output_directory=%s",
            PREVIEW_FRAME_MODE,
            config.active_profile.name,
            config.camera.left_sensor_id,
            config.camera.right_sensor_id,
            config.camera.width,
            config.camera.height,
            config.output.preview_jpeg_quality,
            config.output.output_directory,
        )
        if args.dry_run:
            left_command, right_command = preview_plan.render_commands()
            logger.info("Dry run requested; preview capture commands will not be started.")
            logger.info("Preview left output: %s", preview_plan.left_output_path)
            logger.info("Preview left command: %s", left_command)
            logger.info("Preview right output: %s", preview_plan.right_output_path)
            logger.info("Preview right command: %s", right_command)
            return 0

        try:
            preview_result = capture_stereo_preview_frame(config)
        except Exception as error:  # pragma: no cover - runtime error path
            logger.error("Result classification: stereo_preview_frame_failed")
            logger.error("Preview capture failed: %s", error)
            return 1

        if args.json:
            print(preview_result.to_json())
        else:
            emit_preview_frame_result(preview_result, logger)
        return 0

    if args.mode == PREVIEW_PUBLISHER_MODE:
        publish_fps = (
            args.preview_publish_fps
            if args.preview_publish_fps is not None
            else float(config.camera.fps)
        )
        logger.info(
            "Preview publisher summary: mode=%s profile=%s sensors=(%s,%s) input=%sx%s jpeg_quality=%s publish_fps=%s",
            PREVIEW_PUBLISHER_MODE,
            config.active_profile.name,
            config.camera.left_sensor_id,
            config.camera.right_sensor_id,
            config.camera.width,
            config.camera.height,
            config.output.preview_jpeg_quality,
            publish_fps,
        )
        if args.dry_run:
            logger.info(
                "Dry run requested; persistent preview publisher will not be started.",
            )
            logger.info(
                "Publisher keeps one warm Jetson preview pipeline active and emits framed metadata on stdout.",
            )
            if args.preview_shm_path:
                logger.info(
                    "Preview frame bytes will be written into shared-memory slots at %s.",
                    args.preview_shm_path,
                )
            return 0

        try:
            return run_preview_publisher(
                config=config,
                publish_fps=args.preview_publish_fps,
                logger=logger,
                shared_memory_path=args.preview_shm_path,
                shared_memory_slot_count=args.preview_shm_slot_count,
                shared_memory_slot_size_bytes=args.preview_shm_slot_size_bytes,
            )
        except Exception as error:  # pragma: no cover - runtime error path
            logger.error("Result classification: stereo_preview_publisher_failed")
            logger.error("Preview publisher failed: %s", error)
            return 1

    logger.info(
        "Plan summary: mode=%s profile=%s output_mode=%s duration=%s output_path=%s",
        plan.mode,
        config.active_profile.name,
        plan.output_mode,
        (
            "single-frame"
            if plan.single_frame_capture
            else (
                plan.run_duration_seconds
                if plan.run_duration_seconds is not None
                else "continuous"
            )
        ),
        plan.output_path if plan.output_path is not None else "none",
    )
    logger.info(
        "Effective runtime summary: profile=%s sensors=(%s,%s) input=%sx%s output=%sx%s fps=%s output_mode=%s duration=%s",
        config.active_profile.name,
        config.camera.left_sensor_id,
        config.camera.right_sensor_id,
        config.camera.width,
        config.camera.height,
        config.camera.output_width,
        config.camera.output_height,
        config.camera.fps,
        plan.output_mode,
        (
            "single-frame"
            if plan.single_frame_capture
            else (
                str(plan.run_duration_seconds)
                if plan.run_duration_seconds is not None
                else "continuous"
            )
        ),
    )
    logger.info("Planned success classification: %s", plan.success_classification)
    if plan.output_mode != config.output.mode:
        logger.warning(
            "Mode `%s` overrides the active profile output mode `%s` with `%s`.",
            plan.mode,
            config.output.mode,
            plan.output_mode,
        )
    if config.runtime.run_preflight_on_start and not args.run_preflight:
        logger.info("Config requested startup preflight before runtime launch.")

    if args.dry_run:
        logger.info("Dry run requested; pipeline will not be started.")
        logger.info("Resolved pipeline: %s", plan.render_command())
        if plan.output_path is not None:
            logger.info("Resolved output path: %s", plan.output_path)
        logger.info("Dry-run classification target: %s", plan.success_classification)
        return 0

    runner = GStreamerPipelineRunner(config)
    try:
        run_result = runner.run(plan)
        if args.json and run_result.artifact_summary is not None:
            print(run_result.artifact_summary.to_json())
        return run_result.exit_code
    except Exception as error:  # pragma: no cover - runtime error path
        logger.error("Result classification: %s_failed", plan.mode.replace("-", "_"))
        if plan.output_path is not None:
            logger.error("Failed output target: %s", plan.output_path)
        logger.error("Pipeline execution failed: %s", error)
        return 1


def _has_introspection_request(args: argparse.Namespace) -> bool:
    return any(
        (
            args.list_profiles,
            bool(args.describe_profile),
            args.show_effective_config,
            args.list_modes,
            args.show_system_summary,
        ),
    )


def _requires_config(args: argparse.Namespace) -> bool:
    return any(
        (
            args.mode is not None,
            args.list_profiles,
            bool(args.describe_profile),
            args.show_effective_config,
            args.show_system_summary,
        ),
    )


def _mode_supports_json(args_mode: str, plan) -> bool:
    return args_mode in {"preflight", PREVIEW_FRAME_MODE, PREVIEW_PUBLISHER_MODE} or bool(
        plan is not None and plan.artifact_expected,
    )


def _resolve_selected_profile_name(args: argparse.Namespace) -> str | None:
    if args.describe_profile:
        return args.describe_profile
    return args.profile


def _build_introspection_payloads(
    args: argparse.Namespace,
    config,
    plan,
    runtime_only: bool = False,
) -> dict[str, Any]:
    payloads: dict[str, Any] = {}
    if args.list_modes and not runtime_only:
        payloads["mode_listing"] = build_mode_listing()
    if args.list_profiles and not runtime_only:
        payloads["profile_listing"] = load_profile_listing_payload(args.config)
    if args.describe_profile and not runtime_only:
        payloads["profile_description"] = build_profile_description_payload(config)
    if args.show_effective_config:
        payloads["effective_config"] = build_effective_config_payload(config, plan=plan)
    if args.show_system_summary:
        payloads["system_summary"] = build_system_summary(config)
    return payloads


def _emit_introspection_payloads(logger, payloads: dict[str, Any]) -> None:
    if "mode_listing" in payloads:
        emit_mode_listing(logger, payloads["mode_listing"])
    if "profile_listing" in payloads:
        emit_profile_listing(logger, payloads["profile_listing"])
    if "profile_description" in payloads:
        emit_profile_description(logger, payloads["profile_description"])
    if "effective_config" in payloads:
        emit_effective_config(logger, payloads["effective_config"])
    if "system_summary" in payloads:
        emit_system_summary(logger, payloads["system_summary"])


def _encode_introspection_payloads(payloads: dict[str, Any]) -> str:
    if len(payloads) == 1:
        return json.dumps(next(iter(payloads.values())), indent=2)
    return json.dumps(payloads, indent=2)


if __name__ == "__main__":
    sys.exit(main())
