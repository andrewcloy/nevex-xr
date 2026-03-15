/**
 * Vendor-neutral tracking models for the XR hand input module.
 *
 * A future headset SDK adapter should convert raw runtime objects into these
 * shapes before any application-specific gesture logic runs. That keeps the
 * rest of the XR app isolated from Samsung XR, OpenXR, or any other runtime API.
 */

/**
 * Indicates which hand produced a frame, gesture, or event.
 *
 * `both` is primarily used for bilateral gestures such as zoom, while
 * `unknown` is reserved for degraded or inferred interaction states.
 */
export type Handedness = "left" | "right" | "both" | "unknown";

/**
 * Coarse confidence level normalized from the headset runtime.
 *
 * Future XR SDK adapters should translate runtime-specific confidence or
 * validity signals into these values so downstream systems can make simple,
 * implementation-agnostic decisions.
 */
export type TrackingConfidence = "low" | "medium" | "high";

/**
 * Common reference spaces that an XR runtime may expose.
 *
 * The adapter should declare which space it is using so the translator can
 * interpret movement and targeting consistently.
 */
export type TrackingReferenceSpace = "view" | "local" | "stage" | "world" | "unknown";

/**
 * Minimal set of joints required to map hand tracking into app events.
 *
 * This list is intentionally small. A future XR SDK adapter may track more
 * joints internally, but only needs to expose the joints required for app-level
 * interaction, targeting, and gesture interpretation.
 */
export type HandJointId =
  | "wrist"
  | "palm"
  | "thumb_tip"
  | "index_tip"
  | "middle_tip"
  | "ring_tip"
  | "little_tip";

/**
 * Basic 3D vector used by normalized tracking data.
 */
export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Quaternion rotation used by normalized tracking data.
 */
export interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/**
 * Position and optional orientation for a tracked point in space.
 */
export interface Pose {
  readonly position: Vector3;
  readonly rotation?: Quaternion;
}

/**
 * Pointing ray that can later be derived from headset hand aim data.
 *
 * A future SDK adapter may compute this from hand aim, wrist orientation, or
 * another runtime-specific targeting pose. The rest of the app should only need
 * the normalized ray, not the vendor-specific source.
 */
export interface Ray {
  readonly origin: Vector3;
  readonly direction: Vector3;
}

/**
 * Normalized state for a tracked hand joint.
 */
export interface HandJointState {
  readonly pose: Pose;
  readonly radiusMeters?: number;
  readonly confidence?: TrackingConfidence;
}

/**
 * Joint map indexed by normalized joint id.
 */
export type HandJointMap = Partial<Record<HandJointId, HandJointState>>;

/**
 * Optional semantic hints that a future XR SDK adapter may attach to a hand.
 *
 * These hints are not application events. They are intermediate signals that
 * help a translator decide when to emit app-facing events such as `select` or
 * `show_menu`.
 */
export interface HandInteractionHints {
  /**
   * Indicates that the hand currently resembles a select-capable pose.
   *
   * Later, an SDK adapter may set this when a pinch, tap-like pose, or platform
   * select affordance is detected. The translator still decides whether that
   * becomes a `select` or a `drag_start`.
   */
  readonly isSelectCandidate?: boolean;

  /**
   * Indicates that the hand is holding a pose suitable for drag continuation.
   *
   * This will typically be driven by a sustained pinch or grab-like gesture.
   */
  readonly isDragCandidate?: boolean;

  /**
   * Indicates that the hand resembles the future menu invocation gesture.
   */
  readonly isMenuShowCandidate?: boolean;

  /**
   * Indicates that the hand resembles the future menu dismiss gesture.
   */
  readonly isMenuHideCandidate?: boolean;

  /**
   * Optional target identifier inferred by raycast or focus logic.
   *
   * A future adapter or preprocessor may populate this when it can resolve
   * which UI element or viewer object the user is currently targeting.
   */
  readonly targetIdHint?: string;

  /**
   * Optional normalized select strength in the range `[0, 1]`.
   *
   * This can be derived later from pinch strength, joint distance, or another
   * runtime-specific value.
   */
  readonly selectStrength?: number;
}

/**
 * Normalized representation of one tracked hand.
 */
export interface TrackedHand {
  readonly handedness: "left" | "right";
  readonly isTracked: boolean;
  readonly confidence: TrackingConfidence;

  /**
   * Core poses and targeting data that will later be mapped from the XR runtime.
   */
  readonly palmPose?: Pose;
  readonly pinchPose?: Pose;
  readonly aimRay?: Ray;
  readonly joints?: HandJointMap;

  /**
   * Optional normalized analog values from the future headset SDK adapter.
   */
  readonly pinchStrength?: number;
  readonly grabStrength?: number;

  /**
   * Intermediate semantic hints used by the app-level translator.
   */
  readonly interactionHints?: HandInteractionHints;
}

/**
 * Frame-level hints for gestures that depend on both hands or whole-frame state.
 */
export interface HandFrameInteractionHints {
  /**
   * Optional normalized zoom delta produced by a future bilateral gesture model.
   *
   * This is where later XR runtime integration can supply distance-change or
   * spread-change data without exposing raw SDK gesture objects to the app.
   * Positive values typically indicate zoom in, while negative values indicate
   * zoom out.
   */
  readonly zoomDeltaHint?: number;

  /**
   * Optional pose around which a zoom gesture should anchor.
   */
  readonly zoomAnchorPose?: Pose;
}

/**
 * Single frame of normalized hand tracking data.
 *
 * The future XR SDK integration layer should emit these frames into a
 * translator, which will then produce stable application events.
 */
export interface HandTrackingFrame {
  readonly frameId: number;
  readonly timestampMs: number;
  readonly referenceSpace: TrackingReferenceSpace;
  readonly leftHand?: TrackedHand;
  readonly rightHand?: TrackedHand;
  readonly primaryHand?: "left" | "right";
  readonly interactionHints?: HandFrameInteractionHints;
}
