import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createImageFrameFromBuffer } from "../frame_provider_support.mjs";
import { appendRecentCaptureEvent } from "../fault_injection.mjs";
import { createCaptureBackendStatus } from "./capture_backend_contract.mjs";
import { JetsonPreviewPublisherStreamParser } from "./jetson_preview_publisher_stream_protocol.mjs";
import { JetsonPreviewSharedMemoryTransport } from "./jetson_preview_shared_memory_transport.mjs";

const CAPTURE_BACKENDS_DIR = path.dirname(fileURLToPath(import.meta.url));
const XR_APP_ROOT = path.resolve(CAPTURE_BACKENDS_DIR, "..", "..", "..");
const UNIFIED_PROJECT_ROOT = path.resolve(XR_APP_ROOT, "..");
const DEFAULT_JETSON_RUNTIME_ROOT = resolvePreferredExistingPath(
  path.resolve(UNIFIED_PROJECT_ROOT, "jetson_runtime"),
  path.resolve(XR_APP_ROOT, "jetson_runtime"),
);
const DEFAULT_JETSON_RUNTIME_APP_PATH = path.resolve(
  DEFAULT_JETSON_RUNTIME_ROOT,
  "app.py",
);
const DEFAULT_JETSON_RUNTIME_CONFIG_PATH = path.resolve(
  DEFAULT_JETSON_RUNTIME_ROOT,
  "config",
  "camera_config.json",
);
const DEFAULT_JETSON_RUNTIME_PYTHON_BIN =
  process.platform === "win32" ? "python" : "python3";
const DEFAULT_COMMAND_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

const HANDLED_SESSION_ACTIONS = new Set([
  "start_recording",
  "stop_recording",
  "ping",
  "run_preflight",
  "show_effective_config",
  "capture_snapshot",
  "select_profile",
]);

export class JetsonRuntimeCaptureBackend {
  constructor(options, dependencies = {}) {
    this.options = normalizeJetsonRuntimeOptions(options);
    this.execFileImpl = dependencies.execFileImpl ?? execFile;
    this.spawnImpl = dependencies.spawnImpl ?? spawn;
    this.nowFn = dependencies.nowFn ?? Date.now;
    this.commandMaxBufferBytes =
      dependencies.commandMaxBufferBytes ?? DEFAULT_COMMAND_MAX_BUFFER_BYTES;
    this.commandQueue = Promise.resolve();

    this.isRunning = false;
    this.startupValidated = false;
    this.captureHealthState = "idle";
    this.gstLaunchPath = undefined;
    this.lastCaptureTimestampMs = undefined;
    this.lastSuccessfulCaptureTimestampMs = undefined;
    this.lastCaptureDurationMs = undefined;
    this.averageCaptureDurationMs = undefined;
    this.effectiveFrameIntervalMs = undefined;
    this.successfulCaptures = 0;
    this.failedCaptures = 0;
    this.attemptedCaptures = 0;
    this.consecutiveFailureCount = 0;
    this.recentRetryAttempts = 0;
    this.currentRetryAttempt = 0;
    this.transientFailureCount = 0;
    this.recoveryCount = 0;
    this.lastRecoveryTime = undefined;
    this.lastTerminalFailureTime = undefined;
    this.recentCaptureEvents = [];
    this.totalSuccessfulCaptureDurationMs = 0;
    this.lastError = undefined;
    this.telemetryUpdatedAtMs = this.nowFn();

    this.profileCatalog = undefined;
    this.profileDescription = undefined;
    this.effectiveConfig = undefined;
    this.lastPreflightReport = undefined;
    this.lastArtifactSummary = undefined;
    this.lastPreviewFramePair = undefined;
    this.previewPublisher = createInitialPreviewPublisherState();
    this.recordingState = {
      active: false,
      outputPath: undefined,
      startedAtMs: undefined,
      stdout: "",
      stderr: "",
      exitPromise: undefined,
      child: undefined,
      completionHandled: false,
    };

    this.status = this.createStatus({
      state: "idle",
      detailText:
        this.options.jetsonPreviewEnabled
          ? "Waiting to start the Jetson runtime preview bridge backend."
          : "Waiting to start the Jetson runtime control bridge backend.",
    });
  }

  createStatus(overrides = {}) {
    const previewEnabled = Boolean(this.options.jetsonPreviewEnabled);
    const activeProfile =
      this.profileDescription ?? this.effectiveConfig?.active_profile;
    const cameraConfig = this.effectiveConfig?.camera;
    const outputConfig = this.effectiveConfig?.output;
    const runtimeConfig = this.effectiveConfig?.runtime;
    const availableProfileNames =
      this.profileCatalog?.profiles?.map((profile) => profile.name) ??
      this.effectiveConfig?.available_profile_names ??
      [];
    const expectedDevices = cameraConfig?.expected_video_devices ?? [];
    const defaultStatus = createCaptureBackendStatus({
      backendType: "jetson",
      backendDisplayName: previewEnabled
        ? "Jetson Runtime Preview Bridge Backend"
        : "Jetson Runtime Control Bridge Backend",
      state: overrides.state ?? this.status?.state ?? "idle",
      detailText: overrides.detailText ?? this.status?.detailText,
      lastCaptureTimestampMs:
        overrides.lastCaptureTimestampMs !== undefined
          ? overrides.lastCaptureTimestampMs
          : this.lastCaptureTimestampMs,
      lastError:
        overrides.lastError !== undefined ? overrides.lastError : this.lastError,
    });

    return {
      ...defaultStatus,
      backend: "jetson",
      leftDevice:
        expectedDevices[0] ??
        this.options.leftCameraDevice ??
        resolveSensorLabel(this.options.leftCameraId, "left"),
      rightDevice:
        expectedDevices[1] ??
        this.options.rightCameraDevice ??
        resolveSensorLabel(this.options.rightCameraId, "right"),
      width:
        (previewEnabled
          ? activeProfile?.input_resolution?.width ?? cameraConfig?.width
          : activeProfile?.output_resolution?.width ?? cameraConfig?.output_width) ??
        this.options.captureWidth,
      height:
        (previewEnabled
          ? activeProfile?.input_resolution?.height ?? cameraConfig?.height
          : activeProfile?.output_resolution?.height ?? cameraConfig?.output_height) ??
        this.options.captureHeight,
      lastCaptureDurationMs: this.lastCaptureDurationMs,
      averageCaptureDurationMs: this.averageCaptureDurationMs,
      effectiveFrameIntervalMs: this.effectiveFrameIntervalMs,
      successfulCaptures: this.successfulCaptures,
      failedCaptures: this.failedCaptures,
      capturesAttempted: this.attemptedCaptures,
      capturesSucceeded: this.successfulCaptures,
      capturesFailed: this.failedCaptures,
      lastSuccessfulCaptureTime: this.lastSuccessfulCaptureTimestampMs,
      consecutiveFailureCount: this.consecutiveFailureCount,
      startupValidated:
        overrides.startupValidated !== undefined
          ? overrides.startupValidated
          : this.startupValidated,
      gstLaunchPath:
        overrides.gstLaunchPath !== undefined
          ? overrides.gstLaunchPath
          : this.gstLaunchPath,
      captureHealthState:
        overrides.captureHealthState !== undefined
          ? overrides.captureHealthState
          : this.captureHealthState,
      captureRetryCount: 0,
      captureRetryDelayMs: 0,
      recentRetryAttempts: this.recentRetryAttempts,
      currentRetryAttempt: this.currentRetryAttempt,
      transientFailureCount: this.transientFailureCount,
      recoveryCount: this.recoveryCount,
      lastRecoveryTime: this.lastRecoveryTime,
      lastTerminalFailureTime: this.lastTerminalFailureTime,
      recentCaptureEvents: this.recentCaptureEvents,
      telemetryUpdatedAtMs:
        overrides.telemetryUpdatedAtMs !== undefined
          ? overrides.telemetryUpdatedAtMs
          : this.telemetryUpdatedAtMs,
      bridgeMode: previewEnabled
        ? "jetson_runtime_preview_bridge"
        : "jetson_runtime_control_plane",
      frameSourceMode: previewEnabled ? "camera" : "control_plane",
      frameSourceName: previewEnabled
        ? "jetson_runtime_preview"
        : "jetson_runtime_bridge",
      runtimeProfileName: activeProfile?.name,
      runtimeProfileType: activeProfile?.profile_type,
      runtimeProfileDescription: activeProfile?.description,
      defaultProfileName:
        this.profileCatalog?.default_profile_name ??
        this.effectiveConfig?.default_profile_name,
      availableProfileNames,
      leftSensorId:
        activeProfile?.left_sensor_id ?? cameraConfig?.left_sensor_id,
      rightSensorId:
        activeProfile?.right_sensor_id ?? cameraConfig?.right_sensor_id,
      inputWidth: activeProfile?.input_resolution?.width ?? cameraConfig?.width,
      inputHeight: activeProfile?.input_resolution?.height ?? cameraConfig?.height,
      outputWidth:
        activeProfile?.output_resolution?.width ?? cameraConfig?.output_width,
      outputHeight:
        activeProfile?.output_resolution?.height ?? cameraConfig?.output_height,
      outputMode: activeProfile?.output_mode ?? outputConfig?.mode,
      effectiveFps: activeProfile?.fps ?? cameraConfig?.fps,
      recordingContainer:
        activeProfile?.recording_container ?? outputConfig?.recording_container,
      recordDurationSeconds:
        activeProfile?.record_duration_seconds ??
        outputConfig?.record_duration_seconds,
      testDurationSeconds:
        activeProfile?.test_duration_seconds ?? outputConfig?.test_duration_seconds,
      queueMaxSizeBuffers:
        activeProfile?.queue_max_size_buffers ?? cameraConfig?.queue_max_size_buffers,
      outputDirectory: outputConfig?.output_directory,
      recordingActive: this.recordingState.active,
      recordingOutputPath: this.recordingState.outputPath,
      artifactType: this.lastArtifactSummary?.artifact_type,
      artifactPath: this.lastArtifactSummary?.path,
      artifactSizeBytes: this.lastArtifactSummary?.file_size_bytes,
      artifactCapturedAt: this.lastArtifactSummary?.captured_at,
      artifactMetadataSource: this.lastArtifactSummary?.metadata_source,
      preflightOverallStatus: this.lastPreflightReport?.overall_status,
      preflightOk: this.lastPreflightReport?.ok,
      preflightPassCount: this.lastPreflightReport?.pass_count,
      preflightWarnCount: this.lastPreflightReport?.warn_count,
      preflightFailCount: this.lastPreflightReport?.fail_count,
      preflightCriticalFailCount: this.lastPreflightReport?.critical_fail_count,
      systemIsJetson: this.lastPreflightReport?.host?.is_jetson,
      jetpackVersion: this.lastPreflightReport?.host?.jetpack_version,
      l4tVersion: this.lastPreflightReport?.host?.l4t_version,
      projectName: this.effectiveConfig?.project_name,
      configPath: this.effectiveConfig?.config_path ?? this.options.jetsonRuntimeConfigPath,
      gstLaunchBinary: runtimeConfig?.gst_launch_binary,
    };
  }

  updateStatus(overrides = {}) {
    this.telemetryUpdatedAtMs =
      overrides.telemetryUpdatedAtMs !== undefined
        ? overrides.telemetryUpdatedAtMs
        : this.nowFn();
    this.status = this.createStatus(overrides);
  }

  shouldAutoSendFrames() {
    return Boolean(this.options.jetsonPreviewEnabled);
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.previewPublisher = createInitialPreviewPublisherState();
    this.startupValidated = false;
    this.captureHealthState = "idle";
    this.currentRetryAttempt = 0;
    this.lastError = undefined;
    this.lastPreviewFramePair = undefined;
    this.updateStatus({
      state: "starting",
      detailText: this.options.jetsonPreviewEnabled
        ? "Starting the Jetson runtime preview bridge backend."
        : "Starting the Jetson runtime control bridge backend.",
      lastError: undefined,
    });

    try {
      this.isRunning = true;
      await this.refreshRuntimeIntrospection({
        refreshProfileCatalog: true,
        refreshProfileDescription: true,
      });
      if (this.options.jetsonRunPreflightOnStart) {
        await this.runPreflight();
      }
      if (this.options.jetsonPreviewEnabled) {
        await this.startPreviewPublisher({
          reason: "startup",
        });
      }

      this.captureHealthState = resolveHealthStateFromBridge(this);
      this.startupValidated =
        this.lastPreflightReport?.ok ?? Boolean(this.effectiveConfig);
      this.updateStatus({
        state: "running",
        detailText:
          this.options.jetsonPreviewEnabled && this.previewPublisher.statusText
            ? this.previewPublisher.statusText
            : buildBridgeStatusText(this),
        lastError: undefined,
        startupValidated: this.startupValidated,
      });
    } catch (error) {
      await this.stopPreviewPublisher({
        reason: "startup_failure",
        rejectPendingWaiters: true,
      }).catch(() => {});
      this.destroyPreviewSharedMemoryTransport();
      const message = error instanceof Error ? error.message : String(error);
      this.isRunning = false;
      this.startupValidated = false;
      this.captureHealthState = "terminal_failure";
      this.lastTerminalFailureTime = this.nowFn();
      this.lastError = message;
      this.updateStatus({
        state: "error",
        detailText: message,
        lastError: message,
      });
      throw error;
    }
  }

  async stop() {
    if (this.recordingState.active) {
      await this.stopRecording().catch(() => {});
    }

    await this.stopPreviewPublisher({
      reason: "bridge_stop",
      rejectPendingWaiters: true,
    }).catch(() => {});
    this.destroyPreviewSharedMemoryTransport();
    this.isRunning = false;
    this.captureHealthState = "idle";
    this.currentRetryAttempt = 0;
    this.lastPreviewFramePair = undefined;
    this.updateStatus({
      state: "stopped",
      detailText: this.options.jetsonPreviewEnabled
        ? "Jetson runtime preview bridge backend stopped."
        : "Jetson runtime control bridge backend stopped.",
    });
  }

  getStatus() {
    return this.status;
  }

  async captureStereoPair() {
    if (!this.options.jetsonPreviewEnabled) {
      throw new Error(
        "Jetson runtime control bridge backend does not emit live stereo_frame payloads unless jetsonPreviewEnabled is true.",
      );
    }
    if (!this.isRunning || this.status.state !== "running") {
      throw new Error(
        this.status.lastError ??
          "Jetson runtime preview bridge backend is not running.",
      );
    }

    const startedAtMs = this.nowFn();
    this.attemptedCaptures += 1;
    this.updateStatus({
      state: "running",
      detailText: buildBridgePreviewLifecycleText(
        this,
        this.recordingState.active
          ? "Jetson preview unavailable while stereo recording is active."
          : "Waiting for Jetson preview publisher frame.",
      ),
      lastError: undefined,
    });

    try {
      const previewFramePair = await this.waitForNextPreviewFramePair();
      this.lastPreviewFramePair = previewFramePair;
      this.recordCaptureSuccess({
        captureDurationMs: this.nowFn() - startedAtMs,
        recoverySummary:
          "Jetson persistent preview recovered after the previous bridge capture failure.",
      });
      this.updateStatus({
        state: "running",
        detailText: this.previewPublisher.statusText,
        lastError: undefined,
      });
      return previewFramePair;
    } catch (error) {
      this.recordCaptureFailure({
        error,
        captureDurationMs: this.nowFn() - startedAtMs,
        summaryPrefix: "Jetson preview publisher frame failed",
      });
      throw error;
    }
  }

  async handleControlCommand(command) {
    if (command?.type === "settings_patch") {
      return this.handleSettingsPatch(command.payload?.changes ?? {});
    }

    if (command?.type === "session_command") {
      return this.handleSessionCommand(command.payload ?? {});
    }

    return { handled: false };
  }

  async handleSettingsPatch(changes) {
    if (typeof changes.recordingEnabled !== "boolean") {
      return { handled: false };
    }

    if (changes.recordingEnabled) {
      await this.startRecording();
    } else {
      await this.stopRecording();
    }

    return {
      handled: true,
      refreshCapabilities: false,
      statusText: this.status.detailText,
    };
  }

  async handleSessionCommand(payload) {
    const action = payload.action;
    if (!HANDLED_SESSION_ACTIONS.has(action)) {
      return { handled: false };
    }

    switch (action) {
      case "start_recording":
        await this.startRecording();
        break;
      case "stop_recording":
        await this.stopRecording();
        break;
      case "ping":
        await this.ping();
        break;
      case "run_preflight":
        await this.runPreflight();
        break;
      case "show_effective_config":
        await this.refreshRuntimeIntrospection({
          refreshProfileCatalog: false,
          refreshProfileDescription: true,
        });
        this.updateStatus({
          state: "running",
          detailText: buildBridgeStatusText(this),
          lastError: undefined,
        });
        break;
      case "capture_snapshot":
        await this.captureSnapshot();
        break;
      case "select_profile":
        await this.selectProfile(payload.profileName);
        break;
    }

    return {
      handled: true,
      refreshCapabilities: action === "select_profile" || action === "ping",
      statusText: this.status.detailText,
    };
  }

  async ping() {
    await this.refreshRuntimeIntrospection({
      refreshProfileCatalog: false,
      refreshProfileDescription: true,
    });
    this.updateStatus({
      state: "running",
      detailText: `Jetson bridge ping ok. ${buildBridgeStatusText(this)}`,
      lastError: undefined,
    });
  }

  async selectProfile(profileName) {
    if (typeof profileName !== "string" || profileName.trim().length === 0) {
      throw new Error(
        "session_command.select_profile requires a non-empty payload.profileName.",
      );
    }

    this.assertActionAllowedWhileRecording("select a Jetson runtime profile");
    this.options.jetsonRuntimeProfile = profileName.trim();
    this.lastPreviewFramePair = undefined;
    await this.runWithPreviewPublisherReleased(
      "profile switch",
      async () => {
        await this.refreshRuntimeIntrospection({
          refreshProfileCatalog: true,
          refreshProfileDescription: true,
        });
      },
      {
        restartAfter: true,
      },
    );
    this.captureHealthState = resolveHealthStateFromBridge(this);
    this.updateStatus({
      state: "running",
      detailText: this.options.jetsonPreviewEnabled
        ? this.previewPublisher.statusText
        : buildBridgeStatusText(this),
      lastError: undefined,
    });
  }

  async runPreflight() {
    this.assertActionAllowedWhileRecording("run Jetson preflight");
    const commandStartedAtMs = this.nowFn();
    const result = await this.runWithPreviewPublisherReleased(
      "preflight",
      async () =>
        this.executeJsonCommand(
          ["--mode", "preflight", "--json", ...this.buildProfileArgs()],
          {
            description: "Jetson runtime preflight",
            allowNonZeroWithJson: true,
          },
        ),
      {
        restartAfter: true,
      },
    );
    const report = ensureObjectPayload(result.payload, "preflight report");
    this.lastPreflightReport = report;
    this.gstLaunchPath =
      this.effectiveConfig?.runtime?.gst_launch_binary ??
      this.status.gstLaunchPath ??
      undefined;
    this.startupValidated = report.ok;
    this.captureHealthState = resolveHealthStateFromBridge(this);
    this.lastError =
      report.ok || report.overall_status === "warn"
        ? undefined
        : `Jetson preflight reported ${report.overall_status}.`;
    this.lastTerminalFailureTime =
      report.ok || report.overall_status === "warn"
        ? this.lastTerminalFailureTime
        : this.nowFn();
    this.lastCaptureDurationMs = this.nowFn() - commandStartedAtMs;
    this.updateStatus({
      state: "running",
      detailText: this.options.jetsonPreviewEnabled
        ? this.previewPublisher.statusText
        : buildBridgeStatusText(this),
      lastError: this.lastError,
      startupValidated: this.startupValidated,
      captureHealthState: this.captureHealthState,
    });
    return report;
  }

  async refreshRuntimeIntrospection(options = {}) {
    if (options.refreshProfileCatalog) {
      this.profileCatalog = ensureObjectPayload(
        (
          await this.executeJsonCommand(
            ["--list-profiles", "--json"],
            {
              description: "Jetson profile listing",
            },
          )
        ).payload,
        "profile listing",
      );
    }

    this.effectiveConfig = ensureObjectPayload(
      (
        await this.executeJsonCommand(
          ["--show-effective-config", "--json", ...this.buildProfileArgs()],
          {
            description: "Jetson effective config",
          },
        )
      ).payload,
      "effective config",
    );
    this.gstLaunchPath = this.effectiveConfig?.runtime?.gst_launch_binary;

    if (options.refreshProfileDescription) {
      const activeProfileName = this.effectiveConfig?.active_profile?.name;
      if (typeof activeProfileName === "string" && activeProfileName.length > 0) {
        this.profileDescription = ensureObjectPayload(
          (
            await this.executeJsonCommand(
              ["--describe-profile", activeProfileName, "--json"],
              {
                description: "Jetson profile description",
              },
            )
          ).payload,
          "profile description",
        );
      }
    }

    this.effectiveFrameIntervalMs = resolveEffectiveFrameIntervalMs(
      this.effectiveConfig,
      this.profileDescription,
    );
  }

  async captureSnapshot() {
    this.assertActionAllowedWhileRecording("capture a Jetson stereo snapshot");
    const startedAtMs = this.nowFn();
    this.attemptedCaptures += 1;
    this.updateStatus({
      state: "running",
      detailText: "Running Jetson stereo snapshot action.",
      lastError: undefined,
    });

    try {
      const result = await this.runWithPreviewPublisherReleased(
        "snapshot",
        async () =>
          this.executeJsonCommand(
            ["--mode", "stereo-snapshot", "--json", ...this.buildProfileArgs()],
            {
              description: "Jetson stereo snapshot",
            },
          ),
        {
          restartAfter: true,
        },
      );
      const artifactSummary = ensureObjectPayload(
        result.payload,
        "snapshot artifact summary",
      );
      this.recordCaptureSuccess({
        artifactSummary,
        captureDurationMs: this.nowFn() - startedAtMs,
        recoverySummary:
          "Jetson stereo snapshot recovered after the previous bridge capture failure.",
      });
      this.updateStatus({
        state: "running",
        detailText: buildBridgeArtifactText("snapshot", artifactSummary),
        lastError: undefined,
      });
      return artifactSummary;
    } catch (error) {
      this.recordCaptureFailure({
        error,
        captureDurationMs: this.nowFn() - startedAtMs,
        summaryPrefix: "Jetson stereo snapshot failed",
      });
      throw error;
    }
  }

  async startRecording() {
    if (this.recordingState.active && this.recordingState.child) {
      this.updateStatus({
        state: "running",
        detailText: buildBridgeRecordingText(this, "Recording is already active."),
        lastError: undefined,
      });
      return;
    }

    await this.stopPreviewPublisher({
      reason: "recording_active",
    });
    await this.commandQueue;

    const args = [
      this.options.jetsonRuntimeAppPath,
      ...this.buildConfigArgs(),
      "--mode",
      "stereo-record",
      "--json",
      ...this.buildProfileArgs(),
    ];
    const child = this.spawnImpl(this.options.jetsonRuntimePythonBin, args, {
      cwd: this.options.jetsonRuntimeWorkingDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    if (!child || typeof child !== "object") {
      throw new Error("Failed to start the Jetson stereo-record process.");
    }

    let stdout = "";
    let stderr = "";
    const startedAtMs = this.nowFn();
    const outputDirectory =
      this.effectiveConfig?.output?.output_directory ??
      path.dirname(this.options.jetsonRuntimeConfigPath);

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        this.recordingState.stdout = stdout;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        this.recordingState.stderr = stderr;
      });
    }

    const exitPromise = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        resolve({
          code,
          signal,
          stdout,
          stderr,
          elapsedMs: this.nowFn() - startedAtMs,
        });
      });
    });
    exitPromise
      .then((completion) => {
        this.recordingState.completionHandled = true;
        if (this.recordingState.child !== child) {
          return;
        }

        this.recordingState = {
          active: false,
          outputPath: undefined,
          startedAtMs: undefined,
          stdout: "",
          stderr: "",
          child: undefined,
          exitPromise: undefined,
          completionHandled: false,
        };

        const artifactSummary = tryParseJsonPayload(completion.stdout);
        if (artifactSummary) {
          this.recordCaptureSuccess({
            artifactSummary,
            captureDurationMs: completion.elapsedMs,
            recoverySummary:
              "Jetson stereo recording recovered after the previous bridge capture failure.",
          });
          this.updateStatus({
            state: "running",
            detailText: buildBridgeArtifactText("recording", artifactSummary),
            lastError: undefined,
          });
          return;
        }

        if (completion.code === 0) {
          this.updateStatus({
            state: "running",
            detailText:
              sanitizeText(completion.stderr) || "Jetson recording stopped.",
            lastError: undefined,
          });
          return;
        }

        const message = createCommandFailureMessage(
          "Jetson stereo recording",
          completion.code,
          sanitizeText(completion.stderr || completion.stdout),
        );
        this.recordCaptureFailure({
          error: new Error(message),
          captureDurationMs: completion.elapsedMs,
          summaryPrefix: "Jetson stereo recording failed",
        });
      })
      .catch((error) => {
        this.recordingState.completionHandled = true;
        if (this.recordingState.child !== child) {
          return;
        }

        this.recordingState = {
          active: false,
          outputPath: undefined,
          startedAtMs: undefined,
          stdout: "",
          stderr: "",
          child: undefined,
          exitPromise: undefined,
          completionHandled: false,
        };
        this.recordCaptureFailure({
          error,
          captureDurationMs: this.nowFn() - startedAtMs,
          summaryPrefix: "Jetson stereo recording failed",
        });
      });

    this.recordingState = {
      active: true,
      outputPath: outputDirectory,
      startedAtMs,
      stdout,
      stderr,
      child,
      exitPromise,
      completionHandled: false,
    };
    this.updateStatus({
      state: "running",
      detailText: buildBridgeRecordingText(
        this,
        "Jetson stereo recording started. Preview publisher released camera ownership.",
      ),
      lastError: undefined,
    });
  }

  async stopRecording() {
    if (!this.recordingState.active || !this.recordingState.child) {
      this.updateStatus({
        state: "running",
        detailText: "Jetson stereo recording is not active.",
        lastError: undefined,
      });
      return undefined;
    }

    const activeRecording = this.recordingState;
    const child = activeRecording.child;

    try {
      child.kill("SIGINT");
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) {
        throw error;
      }
    }

    const completion = await activeRecording.exitPromise;
    try {
      if (activeRecording.completionHandled) {
        const handledArtifactSummary = tryParseJsonPayload(completion.stdout);
        if (handledArtifactSummary) {
          return handledArtifactSummary;
        }

        if (completion.code === 0) {
          return undefined;
        }

        throw new Error(
          createCommandFailureMessage(
            "Jetson stereo recording",
            completion.code,
            sanitizeText(completion.stderr || completion.stdout),
          ),
        );
      }

      if (this.recordingState.child !== undefined) {
        this.recordingState = {
          active: false,
          outputPath: undefined,
          startedAtMs: undefined,
          stdout: "",
          stderr: "",
          child: undefined,
          exitPromise: undefined,
          completionHandled: false,
        };
      }

      const artifactSummary = tryParseJsonPayload(completion.stdout);
      if (artifactSummary) {
        this.recordCaptureSuccess({
          artifactSummary,
          captureDurationMs: completion.elapsedMs,
          recoverySummary:
            "Jetson stereo recording recovered after the previous bridge capture failure.",
        });
        this.updateStatus({
          state: "running",
          detailText: buildBridgeArtifactText("recording", artifactSummary),
          lastError: undefined,
        });
        return artifactSummary;
      }

      const stderrText = sanitizeText(completion.stderr);
      if (completion.code === 0) {
        this.updateStatus({
          state: "running",
          detailText: stderrText.length > 0 ? stderrText : "Jetson recording stopped.",
          lastError: undefined,
        });
        return undefined;
      }

      const message = createCommandFailureMessage(
        "Jetson stereo recording",
        completion.code,
        stderrText || sanitizeText(completion.stdout),
      );
      this.recordCaptureFailure({
        error: new Error(message),
        captureDurationMs: completion.elapsedMs,
        summaryPrefix: "Jetson stereo recording failed",
      });
      throw new Error(message);
    } finally {
      await this.restartPreviewPublisherIfEnabled("recording stop");
    }
  }

  assertActionAllowedWhileRecording(actionDescription) {
    if (!this.recordingState.active) {
      return;
    }

    throw new Error(
      `Cannot ${actionDescription} while Jetson stereo recording is active.`,
    );
  }

  async runWithPreviewPublisherReleased(reason, action, options = {}) {
    const restartAfter =
      options.restartAfter !== undefined ? Boolean(options.restartAfter) : true;
    if (!this.options.jetsonPreviewEnabled) {
      return action();
    }

    await this.stopPreviewPublisher({
      reason,
    });

    let result;
    let actionError;
    try {
      result = await action();
    } catch (error) {
      actionError = error;
    }

    if (restartAfter && this.isRunning && !this.recordingState.active) {
      await this.startPreviewPublisher({
        reason: `${reason}_restart`,
      }).catch((restartError) => {
        const message =
          restartError instanceof Error
            ? restartError.message
            : String(restartError);
        this.lastError = message;
        this.captureHealthState = "terminal_failure";
        this.lastTerminalFailureTime = this.nowFn();
        this.updateStatus({
          state: "running",
          detailText: buildBridgePreviewLifecycleText(
            this,
            `Jetson preview publisher restart failed after ${reason}. ${message}`,
          ),
          lastError: message,
          captureHealthState: this.captureHealthState,
        });
        if (actionError === undefined && options.restartFailureIsFatal) {
          actionError = restartError;
        }
      });
    }

    if (actionError !== undefined) {
      throw actionError;
    }

    return result;
  }

  async startPreviewPublisher(options = {}) {
    if (!this.options.jetsonPreviewEnabled || this.recordingState.active) {
      return;
    }
    if (this.previewPublisher.child) {
      return;
    }

    const sharedMemoryTransport = this.ensurePreviewSharedMemoryTransport();
    const args = [
      this.options.jetsonRuntimeAppPath,
      ...this.buildConfigArgs(),
      "--mode",
      "stereo-preview-publisher",
      "--json",
      "--preview-publish-fps",
      String(resolvePreviewPublisherFps(this)),
      ...sharedMemoryTransport.buildPublisherArgs(),
      ...this.buildProfileArgs(),
    ];
    const child = this.spawnImpl(this.options.jetsonRuntimePythonBin, args, {
      cwd: this.options.jetsonRuntimeWorkingDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    if (!child || typeof child !== "object") {
      throw new Error("Failed to start the Jetson preview publisher process.");
    }

    let resolveStartup;
    let rejectStartup;
    const startupPromise = new Promise((resolve, reject) => {
      resolveStartup = resolve;
      rejectStartup = reject;
    });
    const exitPromise = new Promise((resolve) => {
      child.once("close", (code, signal) => {
        resolve({
          code,
          signal,
        });
      });
    });

    this.previewPublisher = {
      ...this.previewPublisher,
      child,
      exitPromise,
      stderrBuffer: "",
      state: "starting",
      statusText: "Starting Jetson preview publisher.",
      intentionalStopReason: undefined,
      startupReady: false,
      resolveStartup,
      rejectStartup,
      startupPromise,
      sharedMemoryTransport,
      latestFramePayload: undefined,
      latestFrameId: 0,
      lastConsumedFrameId: 0,
    };
    this.updateStatus({
      state: "running",
      detailText: buildBridgePreviewLifecycleText(
        this,
        this.previewPublisher.statusText,
      ),
      lastError: undefined,
    });

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        this.handlePreviewPublisherStdoutChunk(chunk);
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        this.previewPublisher.stderrBuffer += chunk;
      });
    }
    child.once("error", (error) => {
      if (!this.previewPublisher.startupReady) {
        this.previewPublisher.rejectStartup?.(error);
      }
      void this.handlePreviewPublisherUnexpectedExit(error);
    });
    child.once("close", (code, signal) => {
      void this.handlePreviewPublisherProcessExit(code, signal);
    });

    await Promise.race([
      startupPromise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Jetson preview publisher did not report startup readiness within ${resolvePreviewStartupTimeoutMs(
                this,
              )}ms.`,
            ),
          );
        }, resolvePreviewStartupTimeoutMs(this));
      }),
    ]);
  }

  async stopPreviewPublisher(options = {}) {
    if (!this.options.jetsonPreviewEnabled) {
      return;
    }

    const reason = options.reason ?? "preview_stop";
    const child = this.previewPublisher.child;
    this.previewPublisher.intentionalStopReason = reason;
    this.previewPublisher.state = resolvePreviewPublisherLifecycleState(reason);
    this.previewPublisher.statusText = resolvePreviewPublisherStopText(
      this,
      reason,
    );

    if (options.updateStatus !== false) {
      const captureHealthState =
        reason === "recording_active" ? "idle" : this.captureHealthState;
      this.captureHealthState = captureHealthState;
      this.updateStatus({
        state: "running",
        detailText: buildBridgePreviewLifecycleText(
          this,
          this.previewPublisher.statusText,
        ),
        lastError:
          reason === "recording_active" ? undefined : this.status.lastError,
        captureHealthState,
      });
    }

    if (!child) {
      if (options.rejectPendingWaiters) {
        this.rejectPendingPreviewFrameWaiters(
          new Error(this.previewPublisher.statusText),
        );
      }
      return;
    }

    try {
      child.kill("SIGINT");
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) {
        throw error;
      }
    }

    const exitPromise = this.previewPublisher.exitPromise;
    await exitPromise.catch(() => {});
    if (options.rejectPendingWaiters) {
      this.rejectPendingPreviewFrameWaiters(
        new Error(this.previewPublisher.statusText),
      );
    }
  }

  async restartPreviewPublisherIfEnabled(reason) {
    if (!this.options.jetsonPreviewEnabled || !this.isRunning || this.recordingState.active) {
      return;
    }

    await this.startPreviewPublisher({
      reason,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.captureHealthState = "terminal_failure";
      this.lastTerminalFailureTime = this.nowFn();
      this.updateStatus({
        state: "running",
        detailText: buildBridgePreviewLifecycleText(
          this,
          `Jetson preview publisher restart failed after ${reason}. ${message}`,
        ),
        lastError: message,
        captureHealthState: this.captureHealthState,
      });
    });
  }

  ensurePreviewSharedMemoryTransport() {
    if (this.previewPublisher.sharedMemoryTransport) {
      return this.previewPublisher.sharedMemoryTransport;
    }

    const transport = JetsonPreviewSharedMemoryTransport.create();
    this.previewPublisher.sharedMemoryTransport = transport;
    return transport;
  }

  destroyPreviewSharedMemoryTransport() {
    try {
      this.previewPublisher.sharedMemoryTransport?.close();
    } catch {}
    this.previewPublisher.sharedMemoryTransport = undefined;
  }

  consumeLatestPreviewFramePair() {
    if (
      this.previewPublisher.latestFramePayload === undefined ||
      this.previewPublisher.latestFrameId <= this.previewPublisher.lastConsumedFrameId
    ) {
      return undefined;
    }

    this.previewPublisher.lastConsumedFrameId = this.previewPublisher.latestFrameId;
    return createPreviewFramePairFromPayload(
      this.previewPublisher.latestFramePayload,
      {
        sharedMemoryTransport: this.previewPublisher.sharedMemoryTransport,
      },
    );
  }

  async waitForNextPreviewFramePair() {
    const immediateFrame = this.consumeLatestPreviewFramePair();
    if (immediateFrame) {
      return immediateFrame;
    }

    if (!this.recordingState.active && !this.previewPublisher.child) {
      await this.startPreviewPublisher({
        reason: "capture_request",
      });
      const postStartFrame = this.consumeLatestPreviewFramePair();
      if (postStartFrame) {
        return postStartFrame;
      }
    }

    return new Promise((resolve, reject) => {
      const stallTimer = setTimeout(() => {
        if (this.recordingState.active) {
          this.previewPublisher.state = "unavailable";
          this.previewPublisher.statusText =
            "Jetson preview unavailable while stereo recording is active.";
          this.captureHealthState = "idle";
        } else {
          this.previewPublisher.state = "degraded";
          this.previewPublisher.statusText =
            "Jetson preview publisher is waiting for a fresh synchronized frame pair.";
          this.captureHealthState = "retrying";
        }
        this.updateStatus({
          state: "running",
          detailText: buildBridgePreviewLifecycleText(
            this,
            this.previewPublisher.statusText,
          ),
          lastError: undefined,
          captureHealthState: this.captureHealthState,
        });
      }, resolvePreviewWaitTimeoutMs(this));

      this.previewPublisher.pendingFrameWaiters.push({
        resolve: (framePayload) => {
          clearTimeout(stallTimer);
          resolve(
            createPreviewFramePairFromPayload(framePayload, {
              sharedMemoryTransport: this.previewPublisher.sharedMemoryTransport,
            }),
          );
        },
        reject: (error) => {
          clearTimeout(stallTimer);
          reject(error);
        },
      });
    });
  }

  handlePreviewPublisherStdoutChunk(chunk) {
    let events;
    try {
      events = this.previewPublisher.streamParser.pushChunk(chunk);
    } catch (error) {
      const message =
        error instanceof Error
          ? `Jetson preview publisher stream parse failed. ${error.message}`
          : `Jetson preview publisher stream parse failed. ${String(error)}`;
      this.lastError = message;
      this.captureHealthState = "terminal_failure";
      this.lastTerminalFailureTime = this.nowFn();
      this.updateStatus({
        state: "running",
        detailText: message,
        lastError: message,
        captureHealthState: this.captureHealthState,
      });
      this.previewPublisher.rejectStartup?.(new Error(message));
      this.rejectPendingPreviewFrameWaiters(new Error(message));
      try {
        this.previewPublisher.child?.kill("SIGINT");
      } catch {}
      return;
    }

    for (const event of events) {
      this.handlePreviewPublisherEvent(event);
    }
  }

  handlePreviewPublisherEvent(payload) {
    const event = ensureObjectPayload(payload, "preview publisher event");
    if (!this.previewPublisher.startupReady) {
      this.previewPublisher.startupReady = true;
      this.previewPublisher.resolveStartup?.(event);
      this.previewPublisher.resolveStartup = undefined;
      this.previewPublisher.rejectStartup = undefined;
    }

    if (event.event_type === "preview_status") {
      this.previewPublisher.state =
        typeof event.preview_state === "string" ? event.preview_state : "starting";
      this.previewPublisher.statusText =
        typeof event.status_text === "string" && event.status_text.length > 0
          ? event.status_text
          : "Jetson preview publisher status updated.";
      this.captureHealthState =
        this.previewPublisher.state === "degraded"
          ? "retrying"
          : this.recordingState.active
            ? "idle"
            : this.captureHealthState;
      this.updateStatus({
        state: "running",
        detailText: buildBridgePreviewLifecycleText(
          this,
          this.previewPublisher.statusText,
        ),
        lastError: undefined,
        captureHealthState: this.captureHealthState,
      });
      return;
    }

    if (event.event_type === "preview_frame") {
      const frameId =
        typeof event.frame_id === "number" && Number.isFinite(event.frame_id)
          ? Math.max(0, Math.round(event.frame_id))
          : this.previewPublisher.latestFrameId + 1;
      this.previewPublisher.latestFramePayload = event;
      this.previewPublisher.latestFrameId = frameId;
      this.previewPublisher.state = "live";
      this.previewPublisher.statusText = buildBridgePreviewFrameText(event);
      this.updateStatus({
        state: "running",
        detailText: buildBridgePreviewLifecycleText(
          this,
          this.previewPublisher.statusText,
        ),
        lastError: undefined,
        captureHealthState: "healthy",
      });
      this.resolvePendingPreviewFrameWaiters(event, frameId);
    }
  }

  async handlePreviewPublisherUnexpectedExit(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.previewPublisher.rejectStartup?.(error);
    this.previewPublisher.resolveStartup = undefined;
    this.previewPublisher.rejectStartup = undefined;
    this.previewPublisher.startupReady = false;
    this.previewPublisher.child = undefined;
    this.previewPublisher.exitPromise = undefined;
    this.previewPublisher.state = "stopped";
    this.previewPublisher.statusText = `Jetson preview publisher failed to start. ${message}`;
    this.lastError = this.previewPublisher.statusText;
    this.captureHealthState = "terminal_failure";
    this.lastTerminalFailureTime = this.nowFn();
    this.updateStatus({
      state: "running",
      detailText: buildBridgePreviewLifecycleText(
        this,
        this.previewPublisher.statusText,
      ),
      lastError: this.lastError,
      captureHealthState: this.captureHealthState,
    });
    this.rejectPendingPreviewFrameWaiters(new Error(this.previewPublisher.statusText));
  }

  async handlePreviewPublisherProcessExit(code, signal) {
    const intentionalStopReason = this.previewPublisher.intentionalStopReason;
    const stoppedIntentionally =
      typeof intentionalStopReason === "string" && intentionalStopReason.length > 0;
    const statusText = stoppedIntentionally
      ? resolvePreviewPublisherStopText(this, intentionalStopReason)
      : buildPreviewPublisherExitText(code, signal, this.previewPublisher.stderrBuffer);

    if (!this.previewPublisher.startupReady && !stoppedIntentionally) {
      this.previewPublisher.rejectStartup?.(new Error(statusText));
    }
    this.previewPublisher.resolveStartup = undefined;
    this.previewPublisher.rejectStartup = undefined;
    this.previewPublisher.startupReady = false;
    this.previewPublisher.child = undefined;
    this.previewPublisher.exitPromise = undefined;
    this.previewPublisher.stderrBuffer = "";
    this.previewPublisher.streamParser = new JetsonPreviewPublisherStreamParser();
    this.previewPublisher.intentionalStopReason = undefined;
    this.previewPublisher.latestFramePayload = undefined;
    this.previewPublisher.latestFrameId = 0;
    this.previewPublisher.lastConsumedFrameId = 0;
    this.previewPublisher.state = stoppedIntentionally
      ? resolvePreviewPublisherLifecycleState(intentionalStopReason)
      : "stopped";
    this.previewPublisher.statusText = statusText;

    if (stoppedIntentionally) {
      this.updateStatus({
        state: "running",
        detailText: buildBridgePreviewLifecycleText(this, statusText),
        lastError:
          intentionalStopReason === "recording_active" ? undefined : this.status.lastError,
        captureHealthState:
          intentionalStopReason === "recording_active" ? "idle" : this.captureHealthState,
      });
      return;
    }

    this.lastError = statusText;
    this.captureHealthState = "terminal_failure";
    this.lastTerminalFailureTime = this.nowFn();
    this.updateStatus({
      state: "running",
      detailText: buildBridgePreviewLifecycleText(this, statusText),
      lastError: statusText,
      captureHealthState: this.captureHealthState,
    });
    this.rejectPendingPreviewFrameWaiters(new Error(statusText));
  }

  resolvePendingPreviewFrameWaiters(framePayload, frameId) {
    const waiters = this.previewPublisher.pendingFrameWaiters.splice(0);
    if (
      waiters.length > 0 &&
      typeof frameId === "number" &&
      Number.isFinite(frameId)
    ) {
      this.previewPublisher.lastConsumedFrameId = frameId;
    }
    for (const waiter of waiters) {
      waiter.resolve(framePayload);
    }
  }

  rejectPendingPreviewFrameWaiters(error) {
    const waiters = this.previewPublisher.pendingFrameWaiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  buildProfileArgs() {
    return typeof this.options.jetsonRuntimeProfile === "string" &&
      this.options.jetsonRuntimeProfile.trim().length > 0
      ? ["--profile", this.options.jetsonRuntimeProfile.trim()]
      : [];
  }

  buildConfigArgs() {
    return ["--config", this.options.jetsonRuntimeConfigPath];
  }

  async executeJsonCommand(args, options) {
    const taskPromise = this.commandQueue.then(async () => {
      const result = await executeCommandWithCapturedOutput({
        execFileImpl: this.execFileImpl,
        command: this.options.jetsonRuntimePythonBin,
        args: [this.options.jetsonRuntimeAppPath, ...this.buildConfigArgs(), ...args],
        cwd: this.options.jetsonRuntimeWorkingDirectory,
        maxBuffer: this.commandMaxBufferBytes,
      });
      const payload = tryParseJsonPayload(result.stdout);
      if (!result.ok && !(options.allowNonZeroWithJson && payload)) {
        throw new Error(
          createCommandFailureMessage(
            options.description,
            result.exitCode,
            sanitizeText(result.stderr || result.stdout),
          ),
        );
      }
      if (!payload) {
        throw new Error(
          `${options.description} did not return valid JSON output from jetson_runtime/app.py.`,
        );
      }
      return {
        ...result,
        payload,
      };
    });
    this.commandQueue = taskPromise.catch(() => {});
    return taskPromise;
  }

  recordCaptureFailure(options) {
    const message =
      options.error instanceof Error ? options.error.message : String(options.error);
    this.failedCaptures += 1;
    this.consecutiveFailureCount += 1;
    this.transientFailureCount += 1;
    this.lastCaptureDurationMs = options.captureDurationMs;
    this.lastTerminalFailureTime = this.nowFn();
    this.captureHealthState = "terminal_failure";
    this.lastError = message;
    this.recentCaptureEvents = appendRecentCaptureEvent(this.recentCaptureEvents, {
      timestampMs: this.nowFn(),
      eventType: "terminal_failure",
      summary: `${options.summaryPrefix}: ${message}`,
    });
    this.updateStatus({
      state: "running",
      detailText: `${options.summaryPrefix}: ${message}`,
      lastError: message,
      captureHealthState: this.captureHealthState,
    });
  }

  recordCaptureSuccess(options) {
    const nowMs = this.nowFn();
    const recoveredFromFailure = this.consecutiveFailureCount > 0;
    const previousSuccessfulCaptureTimestampMs = this.lastSuccessfulCaptureTimestampMs;
    this.successfulCaptures += 1;
    this.consecutiveFailureCount = 0;
    this.lastCaptureTimestampMs = nowMs;
    this.lastSuccessfulCaptureTimestampMs = nowMs;
    this.lastCaptureDurationMs = options.captureDurationMs;
    this.effectiveFrameIntervalMs =
      typeof previousSuccessfulCaptureTimestampMs === "number"
        ? Math.max(0, nowMs - previousSuccessfulCaptureTimestampMs)
        : this.effectiveFrameIntervalMs;
    this.totalSuccessfulCaptureDurationMs += options.captureDurationMs;
    this.averageCaptureDurationMs =
      this.successfulCaptures > 0
        ? this.totalSuccessfulCaptureDurationMs / this.successfulCaptures
        : options.captureDurationMs;
    this.captureHealthState = recoveredFromFailure ? "recovered" : "healthy";
    this.lastRecoveryTime = recoveredFromFailure ? nowMs : this.lastRecoveryTime;
    this.recoveryCount = recoveredFromFailure
      ? this.recoveryCount + 1
      : this.recoveryCount;
    this.lastError = undefined;
    if (options.artifactSummary !== undefined) {
      this.lastArtifactSummary = options.artifactSummary;
    }

    if (recoveredFromFailure && options.recoverySummary) {
      this.recentCaptureEvents = appendRecentCaptureEvent(this.recentCaptureEvents, {
        timestampMs: nowMs,
        eventType: "recovered",
        summary: options.recoverySummary,
      });
    }
  }
}

function normalizeJetsonRuntimeOptions(options) {
  const appPath =
    typeof options.jetsonRuntimeAppPath === "string" &&
    options.jetsonRuntimeAppPath.trim().length > 0
      ? path.resolve(options.jetsonRuntimeAppPath)
      : DEFAULT_JETSON_RUNTIME_APP_PATH;
  const configPath =
    typeof options.jetsonRuntimeConfigPath === "string" &&
    options.jetsonRuntimeConfigPath.trim().length > 0
      ? path.resolve(options.jetsonRuntimeConfigPath)
      : DEFAULT_JETSON_RUNTIME_CONFIG_PATH;

  return {
    ...options,
    jetsonRuntimePythonBin:
      typeof options.jetsonRuntimePythonBin === "string" &&
      options.jetsonRuntimePythonBin.trim().length > 0
        ? options.jetsonRuntimePythonBin.trim()
        : DEFAULT_JETSON_RUNTIME_PYTHON_BIN,
    jetsonRuntimeAppPath: appPath,
    jetsonRuntimeConfigPath: configPath,
    jetsonRuntimeWorkingDirectory:
      typeof options.jetsonRuntimeWorkingDirectory === "string" &&
      options.jetsonRuntimeWorkingDirectory.trim().length > 0
        ? path.resolve(options.jetsonRuntimeWorkingDirectory)
        : path.dirname(appPath),
    jetsonRuntimeProfile:
      typeof options.jetsonRuntimeProfile === "string" &&
      options.jetsonRuntimeProfile.trim().length > 0
        ? options.jetsonRuntimeProfile.trim()
        : undefined,
    jetsonPreviewEnabled: Boolean(options.jetsonPreviewEnabled),
    jetsonRunPreflightOnStart:
      options.jetsonRunPreflightOnStart === undefined
        ? true
        : Boolean(options.jetsonRunPreflightOnStart),
  };
}

function resolvePreferredExistingPath(preferredPath, fallbackPath) {
  if (fs.existsSync(preferredPath)) {
    return path.resolve(preferredPath);
  }
  if (fs.existsSync(fallbackPath)) {
    return path.resolve(fallbackPath);
  }

  return path.resolve(preferredPath);
}

function resolveSensorLabel(sensorId, eyeLabel) {
  if (sensorId === undefined || sensorId === null || String(sensorId).length === 0) {
    return `${eyeLabel}:unknown`;
  }

  return `sensor:${String(sensorId)}`;
}

function ensureObjectPayload(payload, description) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error(`Expected ${description} to be a JSON object.`);
  }

  return payload;
}

function createPreviewFramePairFromPayload(previewPayload, options = {}) {
  const leftPayload = ensureObjectPayload(previewPayload.left, "preview left payload");
  const rightPayload = ensureObjectPayload(
    previewPayload.right,
    "preview right payload",
  );
  const timestampMs =
    typeof previewPayload.timestamp_ms === "number" &&
    Number.isFinite(previewPayload.timestamp_ms)
      ? previewPayload.timestamp_ms
      : Date.now();
  const profileName =
    typeof previewPayload.profile_name === "string" &&
    previewPayload.profile_name.length > 0
      ? previewPayload.profile_name
      : "unknown";
  const transportMode =
    typeof previewPayload.transport_mode === "string" &&
    previewPayload.transport_mode.length > 0
      ? previewPayload.transport_mode
      : "inline_bytes";
  const leftWidth = resolvePreviewEyeDimension(leftPayload.image_width);
  const leftHeight = resolvePreviewEyeDimension(leftPayload.image_height);
  const rightWidth = resolvePreviewEyeDimension(rightPayload.image_width);
  const rightHeight = resolvePreviewEyeDimension(rightPayload.image_height);
  const { leftBuffer, rightBuffer } = resolvePreviewFrameBuffers(
    previewPayload,
    transportMode,
    options.sharedMemoryTransport,
  );
  const leftFrame = createImageFrameFromBuffer({
    bytes: leftBuffer,
    mimeType:
      typeof leftPayload.mime_type === "string" && leftPayload.mime_type.length > 0
        ? leftPayload.mime_type
        : "image/jpeg",
    width: leftWidth,
    height: leftHeight,
    sourceLabel: `jetson-preview-left-${profileName}.jpg`,
    title: "Jetson Runtime Preview",
    backgroundHex: "#143958",
    accentHex: "#77d9ff",
    metadata: {
      captureBackend: "jetson",
      previewBridge: "jetson_runtime",
      previewTransport: transportMode,
      previewProfileName: profileName,
      previewCapturedAt:
        leftPayload.captured_at ?? leftPayload.received_at_ms ?? timestampMs,
      previewFileSizeBytes:
        leftPayload.file_size_bytes ?? leftPayload.byte_size ?? leftBuffer.byteLength,
      previewMetadataSource:
        leftPayload.metadata_source ?? "jetson_preview_publisher",
      previewEye: "left",
    },
  });
  const rightFrame = createImageFrameFromBuffer({
    bytes: rightBuffer,
    mimeType:
      typeof rightPayload.mime_type === "string" && rightPayload.mime_type.length > 0
        ? rightPayload.mime_type
        : "image/jpeg",
    width: rightWidth,
    height: rightHeight,
    sourceLabel: `jetson-preview-right-${profileName}.jpg`,
    title: "Jetson Runtime Preview",
    backgroundHex: "#4a2746",
    accentHex: "#f2c0ff",
    metadata: {
      captureBackend: "jetson",
      previewBridge: "jetson_runtime",
      previewTransport: transportMode,
      previewProfileName: profileName,
      previewCapturedAt:
        rightPayload.captured_at ?? rightPayload.received_at_ms ?? timestampMs,
      previewFileSizeBytes:
        rightPayload.file_size_bytes ??
        rightPayload.byte_size ??
        rightBuffer.byteLength,
      previewMetadataSource:
        rightPayload.metadata_source ?? "jetson_preview_publisher",
      previewEye: "right",
    },
  });

  return {
    timestampMs,
    timestamp: timestampMs,
    left: leftFrame,
    right: rightFrame,
    overlayLabel: `Jetson Preview ${new Date(timestampMs).toISOString()}`,
    tags: ["jetson", "runtime_preview", "preview_frame"],
    extras: {
      captureBackend: "jetson",
      previewBridgeMode: "jetson_runtime_preview_bridge",
      previewTransport: transportMode,
      previewMode: previewPayload.mode,
      previewProfileName: profileName,
      previewCaptureDurationMs: previewPayload.capture_duration_ms,
      previewPublishFps: previewPayload.publish_fps,
    },
  };
}

function resolvePreviewEyeDimension(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

function resolvePreviewFrameBuffers(
  previewPayload,
  transportMode,
  sharedMemoryTransport,
) {
  if (transportMode === "shared_memory") {
    if (!sharedMemoryTransport) {
      throw new Error(
        "Jetson preview frame announced shared-memory transport without an attached shared-memory bridge.",
      );
    }
    const sharedMemoryFrame = sharedMemoryTransport.readFramePair(previewPayload);
    return {
      leftBuffer: sharedMemoryFrame.leftBytes,
      rightBuffer: sharedMemoryFrame.rightBytes,
    };
  }

  return {
    leftBuffer: resolvePreviewEyeBytes(previewPayload.left, "left"),
    rightBuffer: resolvePreviewEyeBytes(previewPayload.right, "right"),
  };
}

function resolvePreviewEyeBytes(payload, eyeLabel) {
  if (Buffer.isBuffer(payload?.bytes)) {
    return payload.bytes;
  }
  if (payload?.bytes instanceof Uint8Array) {
    return Buffer.from(payload.bytes);
  }
  if (
    typeof payload?.base64_data === "string" &&
    payload.base64_data.trim().length > 0
  ) {
    return Buffer.from(payload.base64_data, "base64");
  }

  throw new Error(`Preview payload is missing ${eyeLabel} JPEG bytes.`);
}

async function executeCommandWithCapturedOutput(options) {
  return new Promise((resolve) => {
    options.execFileImpl(
      options.command,
      options.args,
      {
        cwd: options.cwd,
        encoding: "utf8",
        maxBuffer: options.maxBuffer,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            exitCode:
              typeof error.code === "number" ? error.code : error.errno ?? 1,
            stdout: stdout ?? "",
            stderr: stderr ?? "",
          });
          return;
        }

        resolve({
          ok: true,
          exitCode: 0,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
        });
      },
    );
  });
}

function createCommandFailureMessage(description, exitCode, errorText) {
  const exitCodeText =
    exitCode === undefined || exitCode === null ? "unknown" : String(exitCode);
  const details = errorText && errorText.length > 0 ? ` ${errorText}` : "";
  return `${description} failed with exit code ${exitCodeText}.${details}`.trim();
}

function tryParseJsonPayload(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function resolveEffectiveFrameIntervalMs(effectiveConfig, profileDescription) {
  const fps =
    profileDescription?.fps ??
    effectiveConfig?.camera?.fps ??
    effectiveConfig?.active_profile?.fps;
  if (typeof fps !== "number" || !Number.isFinite(fps) || fps <= 0) {
    return undefined;
  }

  return 1000 / fps;
}

function resolveHealthStateFromBridge(bridge) {
  if (bridge.lastError) {
    return "terminal_failure";
  }
  if (!bridge.lastPreflightReport) {
    return bridge.effectiveConfig ? "healthy" : "idle";
  }
  if (bridge.lastPreflightReport.ok) {
    return "healthy";
  }
  return "terminal_failure";
}

function buildBridgeStatusText(bridge) {
  const activeProfile =
    bridge.profileDescription ?? bridge.effectiveConfig?.active_profile;
  const inputWidth =
    activeProfile?.input_resolution?.width ?? bridge.effectiveConfig?.camera?.width;
  const inputHeight =
    activeProfile?.input_resolution?.height ?? bridge.effectiveConfig?.camera?.height;
  const outputWidth =
    activeProfile?.output_resolution?.width ??
    bridge.effectiveConfig?.camera?.output_width;
  const outputHeight =
    activeProfile?.output_resolution?.height ??
    bridge.effectiveConfig?.camera?.output_height;
  const fps = activeProfile?.fps ?? bridge.effectiveConfig?.camera?.fps;
  const outputMode = activeProfile?.output_mode ?? bridge.effectiveConfig?.output?.mode;
  const preflight =
    bridge.lastPreflightReport?.overall_status?.toUpperCase() ?? "PENDING";
  const recordingText = bridge.recordingState.active ? "active" : "idle";
  const previewText = bridge.options.jetsonPreviewEnabled
    ? `preview=${bridge.previewPublisher?.state ?? "unavailable"}`
    : "preview=disabled";

  return [
    bridge.options.jetsonPreviewEnabled
      ? "Jetson runtime preview bridge ready."
      : "Jetson runtime control bridge ready.",
    activeProfile?.name ? `profile=${activeProfile.name}` : undefined,
    inputWidth && inputHeight ? `input=${inputWidth}x${inputHeight}` : undefined,
    outputWidth && outputHeight ? `output=${outputWidth}x${outputHeight}` : undefined,
    typeof fps === "number" ? `fps=${fps}` : undefined,
    outputMode ? `output_mode=${outputMode}` : undefined,
    `preflight=${preflight}`,
    `recording=${recordingText}`,
    previewText,
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}

function buildBridgePreviewFrameText(previewPayload) {
  const profileName =
    typeof previewPayload.profile_name === "string" &&
    previewPayload.profile_name.length > 0
      ? previewPayload.profile_name
      : "unknown";
  const frameId =
    typeof previewPayload.frame_id === "number" &&
    Number.isFinite(previewPayload.frame_id)
      ? previewPayload.frame_id
      : undefined;

  return [
    "Jetson preview live.",
    `profile=${profileName}`,
    frameId !== undefined ? `frame_id=${frameId}` : undefined,
    typeof previewPayload.transport_mode === "string"
      ? `transport=${previewPayload.transport_mode}`
      : undefined,
    typeof previewPayload.publish_fps === "number"
      ? `publish_fps=${previewPayload.publish_fps}`
      : undefined,
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}

function buildBridgeArtifactText(actionLabel, artifactSummary) {
  const sizeText =
    typeof artifactSummary.file_size_bytes === "number"
      ? `${artifactSummary.file_size_bytes} bytes`
      : "size unavailable";

  return [
    `Jetson ${actionLabel} completed.`,
    artifactSummary.path ? `path=${artifactSummary.path}` : undefined,
    sizeText,
    artifactSummary.captured_at
      ? `captured_at=${artifactSummary.captured_at}`
      : undefined,
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}

function buildBridgeRecordingText(bridge, prefix) {
  const activeProfile =
    bridge.profileDescription ?? bridge.effectiveConfig?.active_profile;
  return [
    prefix,
    activeProfile?.name ? `profile=${activeProfile.name}` : undefined,
    bridge.recordingState.outputPath
      ? `output=${bridge.recordingState.outputPath}`
      : undefined,
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}

function sanitizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function createInitialPreviewPublisherState() {
  return {
    child: undefined,
    exitPromise: Promise.resolve(),
    stderrBuffer: "",
    streamParser: new JetsonPreviewPublisherStreamParser(),
    sharedMemoryTransport: undefined,
    state: "unavailable",
    statusText: "Jetson preview publisher unavailable.",
    intentionalStopReason: undefined,
    latestFramePayload: undefined,
    latestFrameId: 0,
    lastConsumedFrameId: 0,
    pendingFrameWaiters: [],
    startupReady: false,
    resolveStartup: undefined,
    rejectStartup: undefined,
    startupPromise: undefined,
  };
}

function resolvePreviewPublisherFps(bridge) {
  const requestedFps = bridge.options.fps;
  if (
    typeof requestedFps === "number" &&
    Number.isFinite(requestedFps) &&
    requestedFps > 0
  ) {
    return requestedFps;
  }

  const runtimeFps =
    bridge.profileDescription?.fps ??
    bridge.effectiveConfig?.camera?.fps ??
    bridge.effectiveConfig?.active_profile?.fps;
  if (typeof runtimeFps === "number" && Number.isFinite(runtimeFps) && runtimeFps > 0) {
    return runtimeFps;
  }

  return 1;
}

function resolvePreviewWaitTimeoutMs(bridge) {
  const effectiveFrameIntervalMs =
    typeof bridge.effectiveFrameIntervalMs === "number" &&
    Number.isFinite(bridge.effectiveFrameIntervalMs) &&
    bridge.effectiveFrameIntervalMs > 0
      ? bridge.effectiveFrameIntervalMs
      : 1000 / resolvePreviewPublisherFps(bridge);
  return Math.max(1000, Math.round(effectiveFrameIntervalMs * 4));
}

function resolvePreviewStartupTimeoutMs(bridge) {
  return Math.max(3000, resolvePreviewWaitTimeoutMs(bridge));
}

function buildBridgePreviewLifecycleText(bridge, prefix) {
  const profileName =
    bridge.profileDescription?.name ?? bridge.effectiveConfig?.active_profile?.name;
  return [prefix, profileName ? `profile=${profileName}` : undefined]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}

function resolvePreviewPublisherLifecycleState(reason) {
  if (reason === "recording_active") {
    return "unavailable";
  }
  if (reason === "bridge_stop") {
    return "stopped";
  }
  return "starting";
}

function resolvePreviewPublisherStopText(bridge, reason) {
  switch (reason) {
    case "recording_active":
      return "Jetson preview unavailable while stereo recording is active.";
    case "bridge_stop":
      return "Jetson runtime preview bridge backend stopped.";
    case "snapshot":
      return "Jetson preview publisher paused for a bounded snapshot action.";
    case "preflight":
      return "Jetson preview publisher paused for Jetson preflight.";
    case "profile switch":
      return "Jetson preview publisher paused while the Jetson runtime profile changes.";
    case "startup_failure":
      return "Jetson preview publisher stopped because startup failed.";
    default:
      return "Jetson preview publisher paused.";
  }
}

function buildPreviewPublisherExitText(exitCode, signal, stderr) {
  const exitCodeText =
    exitCode === undefined || exitCode === null ? "unknown" : String(exitCode);
  const signalText =
    typeof signal === "string" && signal.length > 0 ? ` signal=${signal}` : "";
  const detailText = sanitizeText(stderr);
  return [
    `Jetson preview publisher exited unexpectedly (code=${exitCodeText}${signalText}).`,
    detailText.length > 0 ? detailText : undefined,
  ]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}
