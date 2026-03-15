import type { Unsubscribe } from "../hand_input/contracts";
import type {
  StereoEyeDebugPattern,
  StereoFrame,
  StereoOverlayPayload,
} from "../stereo_viewer/frame_models";
import type {
  StereoFrameListener,
  StereoFrameSource,
  StereoFrameSourceInfo,
  StereoFrameSourceStatusListener,
  StereoFrameSourceStatusSnapshot,
} from "../stereo_viewer/frame_source";

/**
 * Options controlling the mock stereo frame generator.
 */
export interface MockStereoFrameSourceOptions {
  readonly sceneId?: string;
  readonly tickIntervalMs?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Mock stereo frame source used by the browser demo and headset-less
 * development flow.
 *
 * It emits formal stereo frames through the same frame-source seam that a
 * future live implementation will use.
 */
export class MockStereoFrameSource implements StereoFrameSource {
  readonly info: StereoFrameSourceInfo = {
    id: "mock-stereo-frame-source",
    displayName: "Mock Stereo Frame Source",
    sourceKind: "mock",
    isMock: true,
  };

  private readonly frameListeners = new Set<StereoFrameListener>();

  private readonly statusListeners = new Set<StereoFrameSourceStatusListener>();

  private readonly sceneId: string;

  private readonly tickIntervalMs: number;

  private readonly width: number;

  private readonly height: number;

  private frameCounter = 0;

  private tickHandle?: ReturnType<typeof setInterval>;

  private status: StereoFrameSourceStatusSnapshot = {
    state: "idle",
    info: this.info,
  };

  constructor(options: MockStereoFrameSourceOptions = {}) {
    this.sceneId = options.sceneId ?? "mock_scene";
    this.tickIntervalMs = options.tickIntervalMs ?? 1000;
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
  }

  getStatus(): StereoFrameSourceStatusSnapshot {
    return this.status;
  }

  subscribeFrame(listener: StereoFrameListener): Unsubscribe {
    this.frameListeners.add(listener);

    return () => {
      this.frameListeners.delete(listener);
    };
  }

  subscribeStatus(listener: StereoFrameSourceStatusListener): Unsubscribe {
    this.statusListeners.add(listener);
    listener(this.status);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (this.tickHandle) {
      return;
    }

    this.updateStatus({
      state: "starting",
      lastError: undefined,
    });

    this.emitFrame();

    this.tickHandle = setInterval(() => {
      this.emitFrame();
    }, this.tickIntervalMs);

    this.updateStatus({
      state: "running",
    });
  }

  async stop(): Promise<void> {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = undefined;
    }

    this.updateStatus({
      state: "stopped",
    });
  }

  private emitFrame(): void {
    const frame = createMockStereoFrame({
      frameId: ++this.frameCounter,
      sceneId: this.sceneId,
      width: this.width,
      height: this.height,
    });

    this.updateStatus({
      state: "running",
      lastFrameId: frame.frameId,
      lastTimestampMs: frame.timestampMs,
    });

    for (const listener of this.frameListeners) {
      listener(frame);
    }
  }

  private updateStatus(
    patch: Partial<StereoFrameSourceStatusSnapshot>,
  ): void {
    this.status = {
      ...this.status,
      ...patch,
    };

    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }
}

/**
 * Creates a structured mock stereo frame for development mode.
 */
export function createMockStereoFrame(options: {
  readonly frameId: number;
  readonly sceneId?: string;
  readonly width?: number;
  readonly height?: number;
}): StereoFrame {
  const frameId = options.frameId;
  const timestampMs = Date.now();
  const sceneId = options.sceneId ?? "mock_scene";
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const animationPhase = frameId % 24;

  return {
    frameId,
    timestampMs,
    source: "mock",
    metadata: {
      sourceId: "mock-stereo-frame-source",
      sceneId,
      tags: ["mock", "stereo", "night-vision"],
      extras: {
        animationPhase,
      },
    },
    overlay: createOverlayPayload(frameId),
    left: {
      eye: "left",
      width,
      height,
      format: "placeholder",
      contentLabel: `${sceneId}:left`,
      debugPattern: createEyePattern("left", sceneId, frameId),
      metadata: {
        eyeGain: 1,
      },
    },
    right: {
      eye: "right",
      width,
      height,
      format: "placeholder",
      contentLabel: `${sceneId}:right`,
      debugPattern: createEyePattern("right", sceneId, frameId),
      metadata: {
        eyeGain: 1,
      },
    },
  };
}

function createEyePattern(
  eye: "left" | "right",
  sceneId: string,
  frameId: number,
): StereoEyeDebugPattern {
  const markerText = `${sceneId.toUpperCase()} F${frameId.toString().padStart(4, "0")}`;

  if (eye === "left") {
    return {
      eyeLabel: "LEFT EYE",
      title: "Structured Stereo Mock Frame",
      backgroundHex: "#143d5b",
      accentHex: "#6ad1ff",
      markerText,
    };
  }

  return {
    eyeLabel: "RIGHT EYE",
    title: "Structured Stereo Mock Frame",
    backgroundHex: "#3b144d",
    accentHex: "#d68aff",
    markerText,
  };
}

function createOverlayPayload(frameId: number): StereoOverlayPayload {
  return {
    label: `Overlay F${frameId.toString().padStart(4, "0")}`,
    annotations: [
      {
        id: "crosshair",
        kind: "crosshair",
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
      {
        id: "frame-label",
        kind: "text",
        normalizedX: 0.16,
        normalizedY: 0.15,
        label: `FRAME ${frameId}`,
      },
    ],
  };
}
