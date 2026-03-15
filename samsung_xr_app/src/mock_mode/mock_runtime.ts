import type {
  HandInputRuntime,
  HandInteractionListener,
  HandInteractionTranslator,
  HandTrackingFrameListener,
  HandTrackingSource,
  HandTrackingSourceInfo,
  Unsubscribe,
} from "../hand_input/contracts";
import type {
  HandInteractionEvent,
  HandInteractionEventBase,
} from "../hand_input/events";
import type {
  Handedness,
  HandTrackingFrame,
  TrackedHand,
} from "../hand_input/tracking";
import type { StereoFrameSourceStatusSnapshot } from "../stereo_viewer/frame_source";
import { MockStereoFrameSource } from "./mock_stereo_frame_source";

/**
 * Snapshot for the mock runtime coordinator.
 */
export interface MockRuntimeSnapshot {
  readonly active: boolean;
  readonly tickCount: number;
  readonly frameSourceStatus: StereoFrameSourceStatusSnapshot;
  readonly lastFrameId?: number;
  readonly lastGeneratedEventType?: HandInteractionEvent["type"];
  readonly lastFrameSceneId?: string;
}

/**
 * Listener invoked whenever the mock runtime state changes.
 */
export type MockRuntimeListener = (snapshot: MockRuntimeSnapshot) => void;

/**
 * Options for booting the no-Jetson development mode.
 */
export interface MockRuntimeOptions {
  readonly sceneId?: string;
  readonly tickIntervalMs?: number;
}

/**
 * Mock tracking source that publishes normalized frames without a real XR SDK.
 *
 * This keeps the rest of the app talking to the same hand input contracts that
 * a future runtime adapter will implement.
 */
export class MockHandTrackingSource implements HandTrackingSource {
  readonly info: HandTrackingSourceInfo = {
    id: "mock-hand-tracking-source",
    displayName: "Mock Hand Tracking Source",
    isMock: true,
  };

  private readonly listeners = new Set<HandTrackingFrameListener>();

  async start(): Promise<void> {
    // No external runtime is required for the mock source.
  }

  async stop(): Promise<void> {
    // No external runtime is required for the mock source.
  }

  subscribe(listener: HandTrackingFrameListener): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(frame: HandTrackingFrame): void {
    for (const listener of this.listeners) {
      listener(frame);
    }
  }
}

/**
 * Hint-driven translator used by mock mode.
 *
 * This is intentionally not real gesture recognition. Instead, the mock source
 * emits normalized hint flags and this translator turns them into the same
 * application-facing events that future XR-driven input will produce.
 */
export class MockHintTranslator implements HandInteractionTranslator {
  readonly id = "mock-hint-translator";

  private dragSessionCounter = 0;

  private activeDragSessionId?: string;

  reset(): void {
    this.activeDragSessionId = undefined;
  }

  translate(frame: HandTrackingFrame): readonly HandInteractionEvent[] {
    const events: HandInteractionEvent[] = [];
    const menuShowHand = selectHandForHint(frame, "isMenuShowCandidate");
    const menuHideHand = selectHandForHint(frame, "isMenuHideCandidate");
    const dragHand = selectHandForHint(frame, "isDragCandidate");
    const selectHand = selectHandForHint(frame, "isSelectCandidate");

    if (menuShowHand) {
      events.push({
        ...createBaseEvent(frame, menuShowHand),
        type: "show_menu",
        menuId: "main_menu",
      });
    }

    if (dragHand) {
      if (!this.activeDragSessionId) {
        this.activeDragSessionId = `mock-drag-${++this.dragSessionCounter}`;
        events.push({
          ...createBaseEvent(frame, dragHand),
          type: "drag_start",
          dragSessionId: this.activeDragSessionId,
        });
      } else {
        events.push({
          ...createBaseEvent(frame, dragHand),
          type: "drag_update",
          dragSessionId: this.activeDragSessionId,
          currentPose: dragHand.pinchPose ?? dragHand.palmPose,
        });
      }
    } else if (this.activeDragSessionId) {
      events.push({
        ...createBaseEvent(frame, selectHand),
        type: "drag_end",
        dragSessionId: this.activeDragSessionId,
        cancelled: false,
      });
      this.activeDragSessionId = undefined;
    }

    if (selectHand && !dragHand) {
      events.push({
        ...createBaseEvent(frame, selectHand),
        type: "select",
      });
    }

    if (typeof frame.interactionHints?.zoomDeltaHint === "number") {
      events.push({
        ...createBaseEvent(frame),
        type: "adjust_zoom",
        handedness: "both",
        deltaScale: frame.interactionHints.zoomDeltaHint,
        anchorPose: frame.interactionHints.zoomAnchorPose,
      });
    }

    if (menuHideHand) {
      events.push({
        ...createBaseEvent(frame, menuHideHand),
        type: "hide_menu",
        reason: "gesture",
      });
    }

    return events;
  }
}

/**
 * Mock hand-input runtime that satisfies the existing hand-input contracts.
 *
 * The application shell can subscribe to this exactly as it would subscribe to
 * a future live XR hand runtime.
 */
export class MockHandInputRuntime implements HandInputRuntime {
  readonly source: MockHandTrackingSource;

  readonly translator: HandInteractionTranslator;

  private readonly listeners = new Set<HandInteractionListener>();

  private started = false;

  private sourceUnsubscribe?: Unsubscribe;

  private lastEvents: readonly HandInteractionEvent[] = [];

  constructor(
    source = new MockHandTrackingSource(),
    translator: HandInteractionTranslator = new MockHintTranslator(),
  ) {
    this.source = source;
    this.translator = translator;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.sourceUnsubscribe = this.source.subscribe((frame) => {
      this.lastEvents = this.translator.translate(frame);
      for (const event of this.lastEvents) {
        this.emit(event);
      }
    });

    await this.source.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.sourceUnsubscribe?.();
    this.sourceUnsubscribe = undefined;
    this.translator.reset();
    await this.source.stop();
    this.started = false;
    this.lastEvents = [];
  }

  subscribe(listener: HandInteractionListener): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Publishes one synthetic frame into the mock hand-input pipeline.
   */
  injectFrame(frame: HandTrackingFrame): readonly HandInteractionEvent[] {
    this.source.publish(frame);
    return this.lastEvents;
  }

  private emit(event: HandInteractionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/**
 * Coordinates scripted input and a mock stereo frame source while the Jetson
 * path is unavailable.
 */
export class MockRuntime {
  readonly handInput: MockHandInputRuntime;

  readonly frameSource: MockStereoFrameSource;

  private readonly sceneId: string;

  private readonly tickIntervalMs: number;

  private readonly listeners = new Set<MockRuntimeListener>();

  private snapshot: MockRuntimeSnapshot = {
    active: false,
    tickCount: 0,
    frameSourceStatus: {
      state: "idle",
      info: {
        id: "mock-stereo-frame-source",
        displayName: "Mock Stereo Frame Source",
        sourceKind: "mock",
        isMock: true,
      },
    },
  };

  private tickHandle?: ReturnType<typeof setInterval>;

  constructor(options: MockRuntimeOptions) {
    this.sceneId = options.sceneId ?? "mock_scene";
    this.tickIntervalMs = options.tickIntervalMs ?? 1500;
    this.handInput = new MockHandInputRuntime();
    this.frameSource = new MockStereoFrameSource({
      sceneId: this.sceneId,
      tickIntervalMs: this.tickIntervalMs,
    });

    this.frameSource.subscribeFrame((frame) => {
      this.snapshot = {
        ...this.snapshot,
        frameSourceStatus: this.frameSource.getStatus(),
        lastFrameId: frame.frameId,
        lastFrameSceneId: frame.metadata?.sceneId,
      };
      this.emit();
    });
  }

  getSnapshot(): MockRuntimeSnapshot {
    return this.snapshot;
  }

  subscribe(listener: MockRuntimeListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (this.snapshot.active) {
      return;
    }

    await this.handInput.start();
    await this.frameSource.start();

    this.snapshot = {
      active: true,
      tickCount: 0,
      frameSourceStatus: this.frameSource.getStatus(),
      lastFrameSceneId: this.sceneId,
    };
    this.emit();

    this.tickHandle = setInterval(() => {
      this.advanceScript();
    }, this.tickIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = undefined;
    }

    await this.handInput.stop();
    await this.frameSource.stop();
    this.snapshot = {
      ...this.snapshot,
      active: false,
      frameSourceStatus: this.frameSource.getStatus(),
    };
    this.emit();
  }

  private advanceScript(): void {
    const nextTick = this.snapshot.tickCount + 1;
    const frame = createMockFrameForStep(nextTick);
    const events = this.handInput.injectFrame(frame);

    this.snapshot = {
      active: true,
      tickCount: nextTick,
      frameSourceStatus: this.frameSource.getStatus(),
      lastFrameId: this.snapshot.lastFrameId,
      lastFrameSceneId: this.snapshot.lastFrameSceneId ?? this.sceneId,
      lastGeneratedEventType:
        events.length > 0
          ? events[events.length - 1]?.type
          : this.snapshot.lastGeneratedEventType,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

function createBaseEvent(
  frame: HandTrackingFrame,
  hand?: TrackedHand,
): Pick<
  HandInteractionEventBase,
  "handedness" | "pose" | "sourceFrameId" | "target" | "timestampMs"
> {
  const targetIdHint = hand?.interactionHints?.targetIdHint;
  const handedness: Handedness = hand?.handedness ?? "unknown";
  const target =
    targetIdHint || hand?.palmPose || hand?.pinchPose || hand?.aimRay
      ? {
          domain: "unknown" as const,
          targetId: targetIdHint,
          pose: hand?.pinchPose ?? hand?.palmPose,
          ray: hand?.aimRay,
        }
      : undefined;

  const pose = hand
    ? {
        handedness: hand.handedness,
        palmPose: hand.palmPose,
        pinchPose: hand.pinchPose,
        aimRay: hand.aimRay,
      }
    : undefined;

  return {
    timestampMs: frame.timestampMs,
    sourceFrameId: frame.frameId,
    handedness,
    target,
    pose,
  };
}

function selectHandForHint(
  frame: HandTrackingFrame,
  hint:
    | "isDragCandidate"
    | "isMenuHideCandidate"
    | "isMenuShowCandidate"
    | "isSelectCandidate",
): TrackedHand | undefined {
  if (frame.rightHand?.interactionHints?.[hint]) {
    return frame.rightHand;
  }

  if (frame.leftHand?.interactionHints?.[hint]) {
    return frame.leftHand;
  }

  return undefined;
}

function createMockFrameForStep(step: number): HandTrackingFrame {
  const timestampMs = Date.now();
  const frameId = step;
  const baseHand = createBaseHand(step);
  const phase = step % 7;

  if (phase === 1) {
    return {
      frameId,
      timestampMs,
      referenceSpace: "local",
      leftHand: {
        ...baseHand,
        handedness: "left",
        interactionHints: {
          isMenuShowCandidate: true,
          targetIdHint: "ui.main_menu",
        },
      },
    };
  }

  if (phase === 2) {
    return {
      frameId,
      timestampMs,
      referenceSpace: "local",
      rightHand: {
        ...baseHand,
        handedness: "right",
        interactionHints: {
          isSelectCandidate: true,
          targetIdHint: "ui.quick_controls.primary",
        },
      },
    };
  }

  if (phase === 3 || phase === 4) {
    return {
      frameId,
      timestampMs,
      referenceSpace: "local",
      rightHand: {
        ...baseHand,
        handedness: "right",
        pinchPose: {
          position: {
            x: 0.25 + step * 0.01,
            y: 0.05,
            z: -0.55,
          },
        },
        interactionHints: {
          isSelectCandidate: true,
          isDragCandidate: true,
          targetIdHint: "viewer.drag_target",
        },
      },
    };
  }

  if (phase === 5) {
    return {
      frameId,
      timestampMs,
      referenceSpace: "local",
      interactionHints: {
        zoomDeltaHint: 0.1,
        zoomAnchorPose: {
          position: {
            x: 0,
            y: 0,
            z: -1,
          },
        },
      },
      leftHand: {
        ...baseHand,
        handedness: "left",
      },
      rightHand: {
        ...baseHand,
        handedness: "right",
      },
    };
  }

  if (phase === 6) {
    return {
      frameId,
      timestampMs,
      referenceSpace: "local",
      leftHand: {
        ...baseHand,
        handedness: "left",
        interactionHints: {
          isMenuHideCandidate: true,
          targetIdHint: "ui.main_menu",
        },
      },
    };
  }

  return {
    frameId,
    timestampMs,
    referenceSpace: "local",
    rightHand: {
      ...baseHand,
      handedness: "right",
    },
  };
}

function createBaseHand(step: number): Omit<TrackedHand, "handedness"> {
  return {
    isTracked: true,
    confidence: "high",
    palmPose: {
      position: {
        x: step * 0.01,
        y: 0.05,
        z: -0.5,
      },
    },
    pinchPose: {
      position: {
        x: step * 0.01,
        y: 0.04,
        z: -0.45,
      },
    },
    aimRay: {
      origin: {
        x: 0,
        y: 0,
        z: 0,
      },
      direction: {
        x: 0,
        y: 0,
        z: -1,
      },
    },
    pinchStrength: 0.5,
    grabStrength: 0.25,
  };
}
