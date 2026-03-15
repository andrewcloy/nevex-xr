import type {
  StereoEyeDebugPattern,
  StereoFrame,
  StereoOverlayPayload,
} from "./frame_models";
import { PushStereoFrameSource } from "./push_frame_source";

/**
 * Snapshot of the live-frame bridge's local dev/demo state.
 */
export interface LiveFrameBridgeSnapshot {
  readonly demoFeedActive: boolean;
  readonly lastGeneratedFrameId?: number;
}

/**
 * Options controlling the placeholder live-source bridge.
 */
export interface LiveFrameBridgeOptions {
  readonly sceneId?: string;
  readonly tickIntervalMs?: number;
  readonly autoStartDemoFeed?: boolean;
}

/**
 * Small live-source adapter service that owns a push-based frame source.
 *
 * Future Jetson transport code should feed frames and status updates here,
 * rather than coupling transport code directly to the viewer surface.
 */
export class LiveFrameBridge {
  readonly source: PushStereoFrameSource;

  private sceneId: string;

  private readonly tickIntervalMs: number;

  private readonly autoStartDemoFeed: boolean;

  private snapshot: LiveFrameBridgeSnapshot = {
    demoFeedActive: false,
  };

  private demoTickHandle?: ReturnType<typeof setInterval>;

  private frameCounter = 0;

  constructor(options: LiveFrameBridgeOptions = {}) {
    this.sceneId = options.sceneId ?? "live_placeholder";
    this.tickIntervalMs = options.tickIntervalMs ?? 900;
    this.autoStartDemoFeed = options.autoStartDemoFeed ?? true;
    this.source = new PushStereoFrameSource({
      id: "live-placeholder-frame-source",
      displayName: "Live Placeholder Frame Source",
      sourceKind: "live",
    });
  }

  getSnapshot(): LiveFrameBridgeSnapshot {
    return this.snapshot;
  }

  updateSceneId(sceneId: string): void {
    this.sceneId = sceneId;
  }

  async start(): Promise<void> {
    await this.source.start();
    this.source.updateStatus({
      state: this.autoStartDemoFeed ? "starting" : "idle",
      lastError: undefined,
    });

    if (this.autoStartDemoFeed) {
      await this.startDemoFeed();
    }
  }

  async stop(): Promise<void> {
    await this.stopDemoFeed();
    await this.source.stop();
  }

  async startDemoFeed(): Promise<void> {
    if (this.demoTickHandle) {
      return;
    }

    await this.source.start();
    this.source.updateStatus({
      state: "starting",
      lastError: undefined,
    });

    this.pushDemoFrame();
    this.demoTickHandle = setInterval(() => {
      this.pushDemoFrame();
    }, this.tickIntervalMs);

    this.snapshot = {
      ...this.snapshot,
      demoFeedActive: true,
    };
  }

  async stopDemoFeed(): Promise<void> {
    if (this.demoTickHandle) {
      clearInterval(this.demoTickHandle);
      this.demoTickHandle = undefined;
    }

    this.snapshot = {
      ...this.snapshot,
      demoFeedActive: false,
    };

    this.source.updateStatus({
      state: "idle",
    });
  }

  /**
   * Pushes a transport-agnostic stereo frame into the live placeholder source.
   */
  pushFrame(frame: StereoFrame): void {
    this.source.pushFrame(frame);
    this.snapshot = {
      ...this.snapshot,
      lastGeneratedFrameId: frame.frameId,
    };
  }

  /**
   * Applies an externally reported status update.
   */
  updateSourceStatus(
    patch: Parameters<PushStereoFrameSource["updateStatus"]>[0],
  ): void {
    this.source.updateStatus(patch);
  }

  setSourceError(message: string): void {
    this.source.setError(message);
  }

  pushDemoFrame(): StereoFrame {
    const frame = createLivePlaceholderStereoFrame({
      frameId: ++this.frameCounter,
      sceneId: this.sceneId,
    });
    this.pushFrame(frame);
    return frame;
  }
}

/**
 * Creates a structured live-placeholder frame for development and seam testing.
 */
export function createLivePlaceholderStereoFrame(options: {
  readonly frameId: number;
  readonly sceneId?: string;
  readonly width?: number;
  readonly height?: number;
}): StereoFrame {
  const frameId = options.frameId;
  const timestampMs = Date.now();
  const sceneId = options.sceneId ?? "live_placeholder";
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const wavePhase = frameId % 18;

  return {
    frameId,
    timestampMs,
    source: "live",
    metadata: {
      sourceId: "live-placeholder-frame-source",
      sceneId,
      tags: ["live", "placeholder", "integration-seam"],
      extras: {
        wavePhase,
      },
    },
    overlay: createLiveOverlayPayload(frameId),
    left: {
      eye: "left",
      width,
      height,
      format: "placeholder",
      contentLabel: `${sceneId}:left`,
      debugPattern: createLivePattern("left", frameId),
    },
    right: {
      eye: "right",
      width,
      height,
      format: "placeholder",
      contentLabel: `${sceneId}:right`,
      debugPattern: createLivePattern("right", frameId),
    },
  };
}

function createLivePattern(
  eye: "left" | "right",
  frameId: number,
): StereoEyeDebugPattern {
  const markerText = `LIVE F${frameId.toString().padStart(4, "0")}`;

  if (eye === "left") {
    return {
      eyeLabel: "LEFT EYE",
      title: "Live Placeholder Frame",
      backgroundHex: "#163f22",
      accentHex: "#8cffb1",
      markerText,
    };
  }

  return {
    eyeLabel: "RIGHT EYE",
    title: "Live Placeholder Frame",
    backgroundHex: "#3f2611",
    accentHex: "#ffcf7a",
    markerText,
  };
}

function createLiveOverlayPayload(frameId: number): StereoOverlayPayload {
  return {
    label: `Live Overlay ${frameId.toString().padStart(4, "0")}`,
    annotations: [
      {
        id: "live-crosshair",
        kind: "crosshair",
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
      {
        id: "live-label",
        kind: "text",
        normalizedX: 0.18,
        normalizedY: 0.2,
        label: `LIVE ${frameId}`,
      },
    ],
  };
}
