import type { Handedness, Pose, Ray, Vector3 } from "./tracking";

/**
 * Application event names emitted by the hand interaction translator.
 *
 * These event ids are the stable boundary that UI, viewer, and shell code
 * should consume. Future XR SDK integrations may change internally, but these
 * names should remain stable unless the app's interaction contract changes.
 */
export type HandInteractionEventType =
  | "select"
  | "drag_start"
  | "drag_update"
  | "drag_end"
  | "show_menu"
  | "hide_menu"
  | "adjust_zoom";

/**
 * High-level area of the app that an event targets.
 */
export type HandInteractionDomain = "ui" | "viewer" | "system" | "unknown";

/**
 * Normalized target reference resolved before or during translation.
 *
 * Later, the XR app may fill this with UI focus information, viewer hit-test
 * results, or system-level overlay targets. Event consumers should read this
 * instead of trying to interpret raw hand pose data themselves.
 */
export interface HandInteractionTarget {
  readonly domain: HandInteractionDomain;
  readonly targetId?: string;
  readonly hitPoint?: Vector3;
  readonly pose?: Pose;
  readonly ray?: Ray;
}

/**
 * Snapshot of the hand state that triggered an event.
 *
 * This payload is optional but useful when a consumer needs the resolved pose
 * that led to an app action.
 */
export interface HandPoseSnapshot {
  readonly handedness: Handedness;
  readonly palmPose?: Pose;
  readonly pinchPose?: Pose;
  readonly aimRay?: Ray;
}

/**
 * Common fields shared by all hand interaction events.
 */
export interface HandInteractionEventBase {
  readonly type: HandInteractionEventType;
  readonly timestampMs: number;
  readonly sourceFrameId?: number;
  readonly handedness: Handedness;
  readonly target?: HandInteractionTarget;
  readonly pose?: HandPoseSnapshot;
}

/**
 * Discrete selection event.
 *
 * A future XR translator will typically emit this when a short pinch or
 * tap-like gesture is recognized on a focused target and does not evolve into a
 * drag sequence.
 */
export interface SelectEvent extends HandInteractionEventBase {
  readonly type: "select";
}

/**
 * First event in a drag session.
 *
 * This will later map from a held select-capable gesture, usually after target
 * capture has succeeded.
 */
export interface DragStartEvent extends HandInteractionEventBase {
  readonly type: "drag_start";
  readonly dragSessionId: string;
}

/**
 * Continuous drag update for an active drag session.
 *
 * The future translator should emit this as the relevant hand pose changes
 * while the drag gesture remains active.
 */
export interface DragUpdateEvent extends HandInteractionEventBase {
  readonly type: "drag_update";
  readonly dragSessionId: string;
  readonly deltaWorld?: Vector3;
  readonly currentPose?: Pose;
}

/**
 * Terminal event for a drag session.
 *
 * This is emitted when the user releases the drag gesture, tracking is lost,
 * or the current interaction is cancelled by app state.
 */
export interface DragEndEvent extends HandInteractionEventBase {
  readonly type: "drag_end";
  readonly dragSessionId: string;
  readonly cancelled?: boolean;
}

/**
 * Requests that the app shell or UI show a menu.
 *
 * Later XR hand tracking may map this from a dedicated menu gesture such as a
 * palm-up pose, a system gesture, or another runtime-supported affordance.
 */
export interface ShowMenuEvent extends HandInteractionEventBase {
  readonly type: "show_menu";
  readonly menuId?: string;
}

/**
 * Requests that the app shell or UI hide a menu.
 *
 * This can later be mapped from a dismiss gesture, loss of menu focus,
 * selection of a closing action, or another system-level transition.
 */
export interface HideMenuEvent extends HandInteractionEventBase {
  readonly type: "hide_menu";
  readonly reason: "gesture" | "selection" | "focus_loss" | "system" | "unknown";
}

/**
 * Continuous zoom adjustment event.
 *
 * A future translator will typically emit this from a two-hand distance change
 * or another continuous analog gesture selected by the XR integration layer.
 * Consumers should respond to the normalized delta rather than reproducing
 * gesture math themselves.
 */
export interface AdjustZoomEvent extends HandInteractionEventBase {
  readonly type: "adjust_zoom";
  readonly deltaScale: number;
  readonly anchorPose?: Pose;
}

/**
 * Union of all application-facing hand interaction events.
 */
export type HandInteractionEvent =
  | SelectEvent
  | DragStartEvent
  | DragUpdateEvent
  | DragEndEvent
  | ShowMenuEvent
  | HideMenuEvent
  | AdjustZoomEvent;
