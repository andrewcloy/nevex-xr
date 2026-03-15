import type { HandInteractionEvent, HandInteractionTarget } from "./events";
import type { HandTrackingFrame } from "./tracking";

/**
 * Removes a subscription created by a source or event stream.
 */
export type Unsubscribe = () => void;

/**
 * Callback invoked whenever a normalized tracking frame is available.
 */
export type HandTrackingFrameListener = (frame: HandTrackingFrame) => void;

/**
 * Callback invoked whenever an application-facing hand event is emitted.
 */
export type HandInteractionListener = (event: HandInteractionEvent) => void;

/**
 * Metadata describing a hand tracking source implementation.
 *
 * A future real XR runtime adapter and a mock development source should both
 * expose this same shape so the app shell can reason about which source is active.
 */
export interface HandTrackingSourceInfo {
  readonly id: string;
  readonly displayName: string;
  readonly isMock?: boolean;
}

/**
 * Vendor-specific tracking adapter boundary.
 *
 * This is the only interface that a future Samsung XR or OpenXR integration
 * should need to implement for hand tracking input. It produces normalized
 * `HandTrackingFrame` values and intentionally hides all SDK-specific types.
 */
export interface HandTrackingSource {
  readonly info: HandTrackingSourceInfo;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: HandTrackingFrameListener): Unsubscribe;
}

/**
 * Optional app context used during event translation.
 *
 * The translator can use this to distinguish whether the user's hand is
 * interacting with UI, controlling the viewer, or targeting a system overlay,
 * without depending on any specific UI toolkit.
 */
export interface HandInteractionTranslationContext {
  readonly activeTarget?: HandInteractionTarget;
  readonly menuVisible?: boolean;
  readonly viewerZoomEnabled?: boolean;
  readonly dragEnabled?: boolean;
}

/**
 * Converts normalized tracking frames into stable application events.
 *
 * This is where future gesture rules should live. The XR SDK adapter should
 * stop at publishing normalized frames, while select timing, drag thresholds,
 * menu heuristics, and zoom policy belong in this translator layer.
 */
export interface HandInteractionTranslator {
  readonly id: string;

  /**
   * Resets any stateful gesture detection.
   *
   * This should be called when the XR app changes scene, reconnects the input
   * pipeline, or needs to clear gesture state after tracking loss.
   */
  reset(): void;

  /**
   * Translates one normalized tracking frame into zero or more app events.
   *
   * Future implementations may use frame history internally, but consumers only
   * depend on the resulting event stream.
   */
  translate(
    frame: HandTrackingFrame,
    context?: HandInteractionTranslationContext,
  ): readonly HandInteractionEvent[];
}

/**
 * Event sink implemented by app systems that want hand interaction events.
 */
export interface HandInteractionSink {
  handle(event: HandInteractionEvent): void;
}

/**
 * High-level hand input module contract.
 *
 * A future implementation can compose a tracking source, translator, and event
 * fan-out behind this interface without exposing SDK-specific details to the
 * rest of the app.
 */
export interface HandInputRuntime {
  readonly source: HandTrackingSource;
  readonly translator: HandInteractionTranslator;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: HandInteractionListener): Unsubscribe;
}
