from __future__ import annotations

import os
import shutil
import signal
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from .artifact_inspector import ArtifactSummary, emit_artifact_summary, inspect_artifact
from .config import AppConfig
from .pipeline_builder import PipelinePlan
from .utils.logging_utils import get_logger


@dataclass(frozen=True)
class PipelineRunResult:
    exit_code: int
    artifact_summary: ArtifactSummary | None = None


class GStreamerPipelineRunner:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.logger = get_logger(__name__)

    def run(self, plan: PipelinePlan) -> PipelineRunResult:
        self._validate_plan(plan)
        environment = self._build_environment()

        self.logger.info("Project: %s", self.config.project_name)
        self.logger.info("Config: %s", self.config.config_path)
        self.logger.info(
            "Runtime profile: %s (type=%s)",
            self.config.active_profile.name,
            self.config.active_profile.profile_type,
        )
        self.logger.info("Mode: %s", plan.mode)
        self.logger.info("Output mode: %s", plan.output_mode)
        self.logger.info("Description: %s", plan.description)
        self.logger.info(
            "Stereo runtime parameters: left_sensor_id=%s right_sensor_id=%s input_resolution=%sx%s output_resolution=%sx%s fps=%s",
            self.config.camera.left_sensor_id,
            self.config.camera.right_sensor_id,
            self.config.camera.width,
            self.config.camera.height,
            self.config.camera.output_width,
            self.config.camera.output_height,
            self.config.camera.fps,
        )
        if plan.run_duration_seconds is not None:
            self.logger.info("Planned duration: %s second(s)", plan.run_duration_seconds)
        if plan.output_path is not None:
            self.logger.info("Output target: %s", plan.output_path)
            self.logger.info(
                "Artifact expectation: file must exist and be non-empty after completion."
            )
        self.logger.info("Expected success classification: %s", plan.success_classification)
        self.logger.info("GStreamer command: %s", plan.render_command())

        process = subprocess.Popen(
            plan.command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=environment,
        )

        output_thread = threading.Thread(
            target=self._stream_process_output,
            args=(process,),
            daemon=True,
        )
        output_thread.start()

        stop_requested = False
        try:
            if plan.single_frame_capture:
                self.logger.info("Waiting for single-frame stereo snapshot capture to complete.")
            elif plan.run_duration_seconds is not None and plan.run_duration_seconds > 0:
                self._wait_for_duration(process, plan.run_duration_seconds)
                if process.poll() is None:
                    stop_requested = True
                    self.logger.info(
                        "Requested duration reached; stopping pipeline cleanly.",
                    )
                    self._stop_process(process)
            else:
                self.logger.info("Pipeline is running. Press Ctrl+C to stop.")

            return_code = process.wait()
        except KeyboardInterrupt:
            stop_requested = True
            self.logger.warning("Keyboard interrupt received; stopping pipeline.")
            self._stop_process(process)
            return_code = process.wait()
        finally:
            if process.stdout is not None:
                process.stdout.close()
            output_thread.join(timeout=1.0)

        if not self._is_successful_exit(return_code, stop_requested):
            raise RuntimeError(
                f"GStreamer pipeline exited with code {return_code}. Review the log output above.",
            )

        artifact_summary: ArtifactSummary | None = None
        if plan.output_path is not None:
            self._validate_output_artifact(plan.output_path)
            artifact_summary = self._inspect_artifact(plan)

        self.logger.info("Result classification: %s", plan.success_classification)
        self.logger.info("Pipeline finished successfully.")
        return PipelineRunResult(
            exit_code=0,
            artifact_summary=artifact_summary,
        )

    def _validate_plan(self, plan: PipelinePlan) -> None:
        gst_binary = shutil.which(self.config.runtime.gst_launch_binary)
        if gst_binary is None:
            raise RuntimeError(
                "Could not find the configured GStreamer launcher "
                f"'{self.config.runtime.gst_launch_binary}' on PATH.",
            )

        self.logger.info("Resolved gst-launch binary: %s", gst_binary)

        if plan.output_path is not None:
            try:
                plan.output_path.parent.mkdir(parents=True, exist_ok=True)
            except OSError as error:
                raise RuntimeError(
                    "Could not create or access the output directory for "
                    f"{plan.output_path}: {error}"
                ) from error

            if plan.output_path.exists() and plan.output_path.is_dir():
                raise RuntimeError(
                    f"Output path points to a directory instead of a file: {plan.output_path}",
                )

    def _build_environment(self) -> dict[str, str]:
        environment = os.environ.copy()
        if self.config.runtime.gst_debug is not None:
            environment["GST_DEBUG"] = str(self.config.runtime.gst_debug)
            self.logger.info("GST_DEBUG=%s", environment["GST_DEBUG"])
        return environment

    def _stream_process_output(self, process: subprocess.Popen[str]) -> None:
        if process.stdout is None:
            return

        for line in process.stdout:
            message = line.rstrip()
            if message:
                self.logger.info("[gst] %s", message)

    def _wait_for_duration(
        self,
        process: subprocess.Popen[str],
        duration_seconds: int,
    ) -> None:
        deadline = time.monotonic() + duration_seconds
        while time.monotonic() < deadline:
            if process.poll() is not None:
                return
            time.sleep(0.25)

    def _stop_process(self, process: subprocess.Popen[str]) -> None:
        if process.poll() is not None:
            return

        try:
            process.send_signal(signal.SIGINT)
            process.wait(timeout=self.config.runtime.shutdown_grace_seconds)
            return
        except (subprocess.TimeoutExpired, ProcessLookupError):
            self.logger.warning("SIGINT shutdown grace period expired; terminating.")
        except ValueError:
            self.logger.warning("SIGINT not supported for this process; terminating.")

        try:
            process.terminate()
            process.wait(timeout=self.config.runtime.shutdown_grace_seconds)
            return
        except (subprocess.TimeoutExpired, ProcessLookupError):
            self.logger.warning("Terminate grace period expired; killing process.")

        process.kill()
        process.wait(timeout=2)

    def _is_successful_exit(self, return_code: int, stop_requested: bool) -> bool:
        if return_code == 0:
            return True

        if not stop_requested:
            return False

        expected_codes = {
            -signal.SIGINT,
            -signal.SIGTERM,
            130,
            143,
        }
        return return_code in expected_codes

    def _validate_output_artifact(self, output_path: os.PathLike[str] | str) -> None:
        artifact_path = os.fspath(output_path)
        if not os.path.exists(artifact_path):
            raise RuntimeError(
                "Expected output artifact was not created. This usually means the "
                "pipeline could not write the requested file output: "
                f"{artifact_path}"
            )

        if os.path.getsize(artifact_path) == 0:
            raise RuntimeError(
                "Output artifact was created but is empty, which usually indicates "
                f"a file-output or encoder failure: {artifact_path}"
            )

        self.logger.info(
            "Created output artifact: %s (%s bytes)",
            artifact_path,
            os.path.getsize(artifact_path),
        )

    def _inspect_artifact(self, plan: PipelinePlan) -> ArtifactSummary | None:
        if plan.output_path is None:
            return None

        artifact_type = "image" if plan.single_frame_capture else "video"
        try:
            inspection_result = inspect_artifact(
                artifact_path=plan.output_path,
                artifact_type=artifact_type,
            )
        except Exception as error:
            self.logger.warning("Artifact inspection failed: %s", error)
            stat_result = plan.output_path.stat()
            fallback_summary = ArtifactSummary(
                path=str(plan.output_path),
                artifact_type=artifact_type,
                file_size_bytes=stat_result.st_size,
                file_size_mb=stat_result.st_size / (1024 * 1024),
                captured_at=datetime.fromtimestamp(
                    stat_result.st_mtime,
                    tz=timezone.utc,
                ).isoformat(),
                metadata_source="filesystem_only",
                metadata_available=False,
                warnings=(f"Artifact inspection fallback was used: {error}",),
            )
            emit_artifact_summary(fallback_summary, self.logger)
            return fallback_summary

        emit_artifact_summary(inspection_result.summary, self.logger)
        return inspection_result.summary
