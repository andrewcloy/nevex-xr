import {
  closeSync,
  openSync,
  writeSync,
} from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  encodePreviewFrameMessage,
  encodePreviewSharedMemoryFrameMessage,
  encodePreviewStatusMessage,
} from "./jetson_preview_publisher_stream_protocol.mjs";
import { JetsonRuntimeCaptureBackend } from "./jetson_runtime_capture_backend.mjs";

describe("JetsonRuntimeCaptureBackend", () => {
  it("hydrates Jetson introspection state and supports profile selection", async () => {
    const calls = [];
    const execFileImpl = createExecFileStub(calls);
    const backend = new JetsonRuntimeCaptureBackend(
      {
        jetsonRuntimeAppPath: "/repo/jetson_runtime/app.py",
        jetsonRuntimeConfigPath: "/repo/jetson_runtime/config/camera_config.json",
        jetsonRuntimePythonBin: "python3",
      },
      {
        execFileImpl,
        spawnImpl: createSpawnStub(),
      },
    );

    await backend.start();
    const startupStatus = backend.getStatus();
    expect(backend.shouldAutoSendFrames()).toBe(false);
    expect(startupStatus.runtimeProfileName).toBe("quality_1080p30");
    expect(startupStatus.preflightOverallStatus).toBe("pass");
    expect(startupStatus.captureHealthState).toBe("healthy");
    expect(startupStatus.availableProfileNames).toEqual([
      "quality_1080p30",
      "low_latency_720p60",
    ]);
    expect(
      calls.some((args) => {
        return (
          args.includes("--config") &&
          args.some((entry) => entry.endsWith("camera_config.json"))
        );
      }),
    ).toBe(true);

    const result = await backend.handleControlCommand({
      type: "session_command",
      payload: {
        action: "select_profile",
        profileName: "low_latency_720p60",
      },
    });
    const selectedStatus = backend.getStatus();

    expect(result.handled).toBe(true);
    expect(result.refreshCapabilities).toBe(true);
    expect(selectedStatus.runtimeProfileName).toBe("low_latency_720p60");
    expect(selectedStatus.outputWidth).toBe(2560);
    expect(selectedStatus.outputHeight).toBe(720);
    expect(
      calls.some((args) => {
        return (
          args.includes("--show-effective-config") &&
          args.includes("--profile") &&
          args.includes("low_latency_720p60")
        );
      }),
    ).toBe(true);
  });

  it("maps snapshot and recording actions into bridge artifact status", async () => {
    const backend = new JetsonRuntimeCaptureBackend(
      {
        jetsonRuntimeAppPath: "/repo/jetson_runtime/app.py",
        jetsonRuntimeConfigPath: "/repo/jetson_runtime/config/camera_config.json",
        jetsonRuntimePythonBin: "python3",
      },
      {
        execFileImpl: createExecFileStub([]),
        spawnImpl: createSpawnStub(),
      },
    );

    await backend.start();
    const snapshotResult = await backend.handleControlCommand({
      type: "session_command",
      payload: {
        action: "capture_snapshot",
      },
    });
    const snapshotStatus = backend.getStatus();

    expect(snapshotResult.handled).toBe(true);
    expect(snapshotStatus.artifactType).toBe("image");
    expect(snapshotStatus.artifactPath).toContain("stereo_snapshot");
    expect(snapshotStatus.capturesSucceeded).toBe(1);
    expect(snapshotStatus.recordingActive).toBe(false);

    const recordStartResult = await backend.handleControlCommand({
      type: "settings_patch",
      payload: {
        changes: {
          recordingEnabled: true,
        },
      },
    });
    expect(recordStartResult.handled).toBe(true);
    expect(backend.getStatus().recordingActive).toBe(true);

    const recordStopResult = await backend.handleControlCommand({
      type: "settings_patch",
      payload: {
        changes: {
          recordingEnabled: false,
        },
      },
    });
    const recordingStatus = backend.getStatus();

    expect(recordStopResult.handled).toBe(true);
    expect(recordingStatus.recordingActive).toBe(false);
    expect(recordingStatus.artifactType).toBe("video");
    expect(recordingStatus.artifactPath).toContain("stereo_record");
    expect(recordingStatus.capturesSucceeded).toBe(2);
  });

  it("pulls Jetson-authored preview frames from the persistent preview publisher", async () => {
    const backend = new JetsonRuntimeCaptureBackend(
      {
        jetsonRuntimeAppPath: "/repo/jetson_runtime/app.py",
        jetsonRuntimeConfigPath: "/repo/jetson_runtime/config/camera_config.json",
        jetsonRuntimePythonBin: "python3",
        jetsonPreviewEnabled: true,
        fps: 2,
      },
      {
        execFileImpl: createExecFileStub([]),
        spawnImpl: createSpawnStub({
          previewPublisherEvents: [
            createPreviewPublisherStatusEvent("starting"),
            createPreviewPublisherFramePayload(),
          ],
        }),
      },
    );

    await backend.start();
    const capturedPair = await backend.captureStereoPair();
    const status = backend.getStatus();

    expect(backend.shouldAutoSendFrames()).toBe(true);
    expect(capturedPair.left.byteSize).toBeGreaterThan(0);
    expect(capturedPair.right.byteSize).toBeGreaterThan(0);
    expect(capturedPair.tags).toContain("runtime_preview");
    expect(status.bridgeMode).toBe("jetson_runtime_preview_bridge");
    expect(status.frameSourceMode).toBe("camera");
    expect(status.detailText).toContain("Jetson preview live.");
    expect(status.capturesSucceeded).toBe(1);

    await backend.stop();
  });

  it("releases and restores preview publisher ownership around recording", async () => {
    const backend = new JetsonRuntimeCaptureBackend(
      {
        jetsonRuntimeAppPath: "/repo/jetson_runtime/app.py",
        jetsonRuntimeConfigPath: "/repo/jetson_runtime/config/camera_config.json",
        jetsonRuntimePythonBin: "python3",
        jetsonPreviewEnabled: true,
        fps: 2,
      },
      {
        execFileImpl: createExecFileStub([]),
        spawnImpl: createSpawnStub(),
      },
    );

    await backend.start();
    expect(backend.getStatus().detailText).toContain("Jetson preview live.");

    await backend.handleControlCommand({
      type: "settings_patch",
      payload: {
        changes: {
          recordingEnabled: true,
        },
      },
    });
    expect(backend.getStatus().recordingActive).toBe(true);
    expect(backend.getStatus().detailText).toContain("recording started");

    await backend.handleControlCommand({
      type: "settings_patch",
      payload: {
        changes: {
          recordingEnabled: false,
        },
      },
    });
    expect(backend.getStatus().recordingActive).toBe(false);
    expect(backend.getStatus().artifactType).toBe("video");
    expect(backend.getStatus().detailText).toContain("Jetson preview live.");

    await backend.stop();
  });
});

function createExecFileStub(calls, options = {}) {
  return (_command, args, _options, callback) => {
    calls.push(args.slice());
    const joined = args.join(" ");

    if (joined.includes("--list-profiles")) {
      callback(
        null,
        JSON.stringify({
          default_profile_name: "quality_1080p30",
          profiles: [
            createProfileDescription("quality_1080p30", {
              profileType: "validation",
              inputWidth: 1920,
              inputHeight: 1080,
              outputWidth: 3840,
              outputHeight: 1080,
              fps: 30,
              outputMode: "fakesink",
            }),
            createProfileDescription("low_latency_720p60", {
              profileType: "operational",
              inputWidth: 1280,
              inputHeight: 720,
              outputWidth: 2560,
              outputHeight: 720,
              fps: 60,
              outputMode: "fakesink",
            }),
          ],
        }),
        "",
      );
      return;
    }

    if (joined.includes("--describe-profile")) {
      const profileName = args[args.indexOf("--describe-profile") + 1];
      callback(
        null,
        JSON.stringify(
          createProfileDescription(profileName, {
            profileType:
              profileName === "low_latency_720p60" ? "operational" : "validation",
            inputWidth: profileName === "low_latency_720p60" ? 1280 : 1920,
            inputHeight: profileName === "low_latency_720p60" ? 720 : 1080,
            outputWidth: profileName === "low_latency_720p60" ? 2560 : 3840,
            outputHeight: profileName === "low_latency_720p60" ? 720 : 1080,
            fps: profileName === "low_latency_720p60" ? 60 : 30,
            outputMode: "fakesink",
          }),
        ),
        "",
      );
      return;
    }

    if (joined.includes("--show-effective-config")) {
      const profileName =
        args.includes("--profile") ? args[args.indexOf("--profile") + 1] : "quality_1080p30";
      callback(null, JSON.stringify(createEffectiveConfig(profileName)), "");
      return;
    }

    if (joined.includes("--mode preflight")) {
      callback(null, JSON.stringify(createPreflightReport()), "");
      return;
    }

    if (joined.includes("--mode stereo-snapshot")) {
      callback(null, JSON.stringify(createSnapshotArtifactSummary()), "");
      return;
    }

    if (joined.includes("--mode stereo-preview-frame")) {
      callback(
        null,
        JSON.stringify(
          options.previewPayload ??
            createPreviewFramePayload(
              "/tmp/nevex/preview_left.jpg",
              "/tmp/nevex/preview_right.jpg",
            ),
        ),
        "",
      );
      return;
    }

    callback(new Error(`Unhandled Jetson runtime CLI call: ${joined}`), "", "");
  };
}

function createSpawnStub(options = {}) {
  return (_command, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    const joined = args.join(" ");
    const previewPublisherEvents = options.previewPublisherEvents ?? [
      createPreviewPublisherStatusEvent("starting"),
      createPreviewPublisherFramePayload(),
    ];
    const previewSharedMemoryArgs = parsePreviewSharedMemoryArgs(args);

    if (joined.includes("stereo-preview-publisher")) {
      process.nextTick(() => {
        for (const event of previewPublisherEvents) {
          child.stdout.write(
            encodePreviewPublisherEvent(event, previewSharedMemoryArgs),
          );
        }
      });
    }

    child.kill = (signal) => {
      child.signalCode = signal;
      process.nextTick(() => {
        if (joined.includes("stereo-record")) {
          child.stdout.write(JSON.stringify(createRecordingArtifactSummary()));
        }
        child.stdout.end();
        child.stderr.end();
        child.exitCode = 0;
        child.emit("close", 0, signal);
      });
      return true;
    };
    return child;
  };
}

function encodePreviewPublisherEvent(event, previewSharedMemoryArgs) {
  if (event?.event_type === "preview_status") {
    return encodePreviewStatusMessage(event);
  }
  if (event?.event_type === "preview_frame") {
    if (previewSharedMemoryArgs) {
      return encodeSharedMemoryPreviewPublisherEvent(
        event,
        previewSharedMemoryArgs,
      );
    }
    return encodePreviewFrameMessage(normalizeInlinePreviewFrameEvent(event));
  }

  throw new Error(`Unsupported preview publisher event in test stub: ${event?.event_type}`);
}

function createProfileDescription(profileName, overrides = {}) {
  return {
    name: profileName,
    profile_type: overrides.profileType ?? "operational",
    description: overrides.description ?? `${profileName} profile`,
    extends: overrides.extends ?? undefined,
    inheritance_chain: overrides.extends ? [overrides.extends, profileName] : [profileName],
    is_default: profileName === "quality_1080p30",
    left_sensor_id: 0,
    right_sensor_id: 1,
    input_resolution: {
      width: overrides.inputWidth ?? 1920,
      height: overrides.inputHeight ?? 1080,
    },
    output_resolution: {
      width: overrides.outputWidth ?? 3840,
      height: overrides.outputHeight ?? 1080,
    },
    fps: overrides.fps ?? 30,
    queue_max_size_buffers: 4,
    output_mode: overrides.outputMode ?? "fakesink",
    test_duration_seconds: 2,
    record_duration_seconds: 12,
    recording_container: "mkv",
    h264_bitrate: 8000000,
  };
}

function createEffectiveConfig(profileName) {
  const profile = createProfileDescription(profileName, {
    profileType:
      profileName === "low_latency_720p60" ? "operational" : "validation",
    inputWidth: profileName === "low_latency_720p60" ? 1280 : 1920,
    inputHeight: profileName === "low_latency_720p60" ? 720 : 1080,
    outputWidth: profileName === "low_latency_720p60" ? 2560 : 3840,
    outputHeight: profileName === "low_latency_720p60" ? 720 : 1080,
    fps: profileName === "low_latency_720p60" ? 60 : 30,
    outputMode: "fakesink",
  });

  return {
    project_name: "NEVEX XR",
    config_path: "/repo/jetson_runtime/config/camera_config.json",
    active_profile: profile,
    default_profile_name: "quality_1080p30",
    available_profile_names: ["quality_1080p30", "low_latency_720p60"],
    camera: {
      left_sensor_id: 0,
      right_sensor_id: 1,
      width: profile.input_resolution.width,
      height: profile.input_resolution.height,
      output_width: profile.output_resolution.width,
      output_height: profile.output_resolution.height,
      fps: profile.fps,
      expected_video_devices: ["/dev/video0", "/dev/video1"],
      flip_method: 0,
      queue_max_size_buffers: 4,
    },
    output: {
      mode: profile.output_mode,
      output_directory: "/tmp/nevex",
      preview_filename_prefix: "stereo_preview",
      preview_jpeg_quality: 70,
      snapshot_filename_prefix: "stereo_snapshot",
      recording_filename_prefix: "stereo_record",
      recording_container: "mkv",
      test_duration_seconds: 2,
      record_duration_seconds: 12,
      sync: false,
      h264_bitrate: 8000000,
    },
    runtime: {
      gst_launch_binary: "gst-launch-1.0",
      gst_inspect_binary: "gst-inspect-1.0",
      gst_debug: null,
      shutdown_grace_seconds: 3,
      preflight_timeout_seconds: 10,
      run_preflight_on_start: true,
    },
    features: {
      stereo_display: false,
      thermal_overlay: false,
      ai_detection: false,
      xr_transport: true,
    },
  };
}

function createPreflightReport() {
  return {
    generated_at: "2026-03-12T00:00:00Z",
    project_name: "NEVEX XR",
    validation_scope: "targeted_startup",
    target_mode: "preflight",
    target_output_mode: "fakesink",
    target_output_path: null,
    overall_status: "pass",
    ok: true,
    pass_count: 14,
    warn_count: 0,
    fail_count: 0,
    critical_fail_count: 0,
    host: {
      system: "Linux",
      release: "6.1.0-tegra",
      machine: "aarch64",
      python_version: "3.10.12",
      is_jetson: true,
      device_model: "Jetson Orin Nano",
      l4t_version: "36.5",
      jetpack_version: "6.0",
    },
    checks: [],
  };
}

function createSnapshotArtifactSummary() {
  return {
    path: "/tmp/nevex/stereo_snapshot_20260312_000000.jpg",
    artifact_type: "image",
    file_size_bytes: 123456,
    file_size_mb: 0.118,
    captured_at: "2026-03-12T00:00:00Z",
    metadata_source: "filesystem_only",
    metadata_available: true,
    image_width: 3840,
    image_height: 1080,
  };
}

function createRecordingArtifactSummary() {
  return {
    path: "/tmp/nevex/stereo_record_20260312_000000.mkv",
    artifact_type: "video",
    file_size_bytes: 456789,
    file_size_mb: 0.436,
    captured_at: "2026-03-12T00:00:12Z",
    metadata_source: "ffprobe",
    metadata_available: true,
    video_container: "matroska",
    video_codec: "h264",
    video_duration_seconds: 12,
    video_width: 3840,
    video_height: 1080,
  };
}

function createPreviewFramePayload(leftPath, rightPath) {
  return {
    mode: "stereo-preview-frame",
    profile_name: "quality_1080p30",
    timestamp_ms: 1710201600000,
    capture_duration_ms: 92,
    output_directory: path.dirname(leftPath),
    left: {
      eye: "left",
      path: leftPath,
      mime_type: "image/jpeg",
      file_size_bytes: 18,
      file_size_mb: 0.00002,
      captured_at: "2026-03-12T00:00:00Z",
      image_width: 1920,
      image_height: 1080,
      metadata_source: "filesystem_only",
      metadata_available: true,
      warnings: [],
    },
    right: {
      eye: "right",
      path: rightPath,
      mime_type: "image/jpeg",
      file_size_bytes: 19,
      file_size_mb: 0.00002,
      captured_at: "2026-03-12T00:00:00Z",
      image_width: 1920,
      image_height: 1080,
      metadata_source: "filesystem_only",
      metadata_available: true,
      warnings: [],
    },
  };
}

function createPreviewPublisherStatusEvent(previewState) {
  return {
    event_type: "preview_status",
    preview_state: previewState,
    status_text:
      previewState === "starting"
        ? "Starting Jetson preview publisher."
        : "Jetson preview live.",
    timestamp_ms: 1710201600000,
    profile_name: "headset_preview_720p60",
    publish_fps: 2,
    frames_emitted: previewState === "live" ? 1 : 0,
    last_frame_id: previewState === "live" ? 1 : null,
  };
}

function createPreviewPublisherFramePayload() {
  return {
    event_type: "preview_frame",
    mode: "stereo-preview-publisher",
    transport_mode: "shared_memory",
    frame_id: 1,
    timestamp_ms: 1710201600000,
    profile_name: "headset_preview_720p60",
    publish_fps: 2,
    left: {
      eye: "left",
      sequence_id: 1,
      received_at_ms: 1710201600000,
      mime_type: "image/jpeg",
      image_width: 1280,
      image_height: 720,
      byte_size: 18,
      bytes: Buffer.from("left-preview-frame", "utf8"),
    },
    right: {
      eye: "right",
      sequence_id: 1,
      received_at_ms: 1710201600000,
      mime_type: "image/jpeg",
      image_width: 1280,
      image_height: 720,
      byte_size: 19,
      bytes: Buffer.from("right-preview-frame", "utf8"),
    },
  };
}

function normalizeInlinePreviewFrameEvent(event) {
  return {
    ...event,
    transport_mode: "inline_bytes",
    left: {
      ...event.left,
      bytes:
        event.left?.bytes ??
        Buffer.from(event.left?.base64_data ?? "", "base64"),
    },
    right: {
      ...event.right,
      bytes:
        event.right?.bytes ??
        Buffer.from(event.right?.base64_data ?? "", "base64"),
    },
  };
}

function encodeSharedMemoryPreviewPublisherEvent(event, previewSharedMemoryArgs) {
  const normalizedEvent = normalizeInlinePreviewFrameEvent(event);
  const sharedMemoryMetadata = writePreviewSharedMemoryFrame(
    previewSharedMemoryArgs,
    normalizedEvent,
  );
  return encodePreviewSharedMemoryFrameMessage({
    ...normalizedEvent,
    transport_mode: "shared_memory",
    left: {
      ...normalizedEvent.left,
      bytes: undefined,
    },
    right: {
      ...normalizedEvent.right,
      bytes: undefined,
    },
    shared_memory: sharedMemoryMetadata,
  });
}

function parsePreviewSharedMemoryArgs(args) {
  if (!args.includes("--preview-shm-path")) {
    return undefined;
  }

  return {
    path: args[args.indexOf("--preview-shm-path") + 1],
    slotCount: Number(args[args.indexOf("--preview-shm-slot-count") + 1]),
    slotSizeBytes: Number(args[args.indexOf("--preview-shm-slot-size-bytes") + 1]),
  };
}

function writePreviewSharedMemoryFrame(previewSharedMemoryArgs, event) {
  const slotIndex = 0;
  const slotGeneration = 1;
  const leftBytes = event.left.bytes;
  const rightBytes = event.right.bytes;
  const headerSize = 64;
  const payloadSize = leftBytes.byteLength + rightBytes.byteLength;
  const slotBuffer = Buffer.alloc(previewSharedMemoryArgs.slotSizeBytes);
  slotBuffer.write("NXSM", 0, "ascii");
  slotBuffer[4] = 1;
  slotBuffer[5] = 2;
  slotBuffer.writeBigUInt64BE(BigInt(slotGeneration), 8);
  slotBuffer.writeBigUInt64BE(BigInt(event.frame_id), 16);
  slotBuffer.writeBigUInt64BE(BigInt(event.timestamp_ms), 24);
  slotBuffer.writeUInt32BE(leftBytes.byteLength, 32);
  slotBuffer.writeUInt32BE(rightBytes.byteLength, 36);
  slotBuffer.writeUInt32BE(payloadSize, 40);
  leftBytes.copy(slotBuffer, headerSize);
  rightBytes.copy(slotBuffer, headerSize + leftBytes.byteLength);

  const fileDescriptor = openSync(previewSharedMemoryArgs.path, "r+");
  try {
    writeSync(fileDescriptor, slotBuffer, 0, slotBuffer.byteLength, 0);
  } finally {
    closeSync(fileDescriptor);
  }

  return {
    slot_index: slotIndex,
    slot_generation: slotGeneration,
    slot_size_bytes: previewSharedMemoryArgs.slotSizeBytes,
    slot_count: previewSharedMemoryArgs.slotCount,
    slot_header_size_bytes: headerSize,
    left_offset_bytes: headerSize,
    left_byte_size: leftBytes.byteLength,
    right_offset_bytes: headerSize + leftBytes.byteLength,
    right_byte_size: rightBytes.byteLength,
  };
}
