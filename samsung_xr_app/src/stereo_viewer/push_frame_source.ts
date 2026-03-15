import type { Unsubscribe } from "../hand_input/contracts";
import type { StereoFrame } from "./frame_models";
import type {
  StereoFrameListener,
  StereoFrameSource,
  StereoFrameSourceInfo,
  StereoFrameSourceStatusListener,
  StereoFrameSourceStatusSnapshot,
} from "./frame_source";

/**
 * Mutable update applied to a push-frame source status snapshot.
 */
export type PushStereoFrameSourceStatusPatch = Partial<
  StereoFrameSourceStatusSnapshot
>;

/**
 * Source implementation intended for future live integration.
 *
 * External adapter code can push frames and update lifecycle state without
 * requiring the viewer or app shell to know how the upstream transport works.
 */
export class PushStereoFrameSource implements StereoFrameSource {
  readonly info: StereoFrameSourceInfo;

  private readonly frameListeners = new Set<StereoFrameListener>();

  private readonly statusListeners = new Set<StereoFrameSourceStatusListener>();

  private status: StereoFrameSourceStatusSnapshot;

  constructor(info?: Partial<StereoFrameSourceInfo>) {
    this.info = {
      id: info?.id ?? "push-stereo-frame-source",
      displayName: info?.displayName ?? "Push Stereo Frame Source",
      sourceKind: info?.sourceKind ?? "live",
      isMock: info?.isMock,
    };

    this.status = {
      state: "idle",
      info: this.info,
    };
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
    if (
      this.status.state === "starting" ||
      this.status.state === "running" ||
      this.status.state === "reconnecting"
    ) {
      return;
    }

    this.updateStatus({
      state: "starting",
      lastError: undefined,
    });
  }

  async stop(): Promise<void> {
    this.updateStatus({
      state: "stopped",
    });
  }

  /**
   * Pushes one externally produced stereo frame into the source.
   */
  pushFrame(frame: StereoFrame): void {
    this.updateStatus({
      state: "running",
      lastFrameId: frame.frameId,
      lastTimestampMs: frame.timestampMs,
      lastError: undefined,
    });

    for (const listener of this.frameListeners) {
      listener(frame);
    }
  }

  /**
   * Applies an externally driven status update.
   */
  updateStatus(patch: PushStereoFrameSourceStatusPatch): void {
    this.status = {
      ...this.status,
      ...patch,
      info: this.info,
    };

    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }

  setError(message: string): void {
    this.updateStatus({
      state: "error",
      lastError: message,
    });
  }
}
