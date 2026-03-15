import type { Unsubscribe } from "../hand_input/contracts";
import type {
  StereoEye,
  StereoEyeDebugPattern,
  StereoEyeFrame,
  StereoFrame,
  StereoFrameFormat,
  StereoEyeImageContent,
  StereoFrameMetadata,
  StereoOverlayPayload,
  ViewerContentSource,
} from "./frame_models";
import {
  DEFAULT_THERMAL_OVERLAY_MODE,
  type ThermalFrame,
  type ThermalOverlayMode,
} from "./thermal_models";
import type {
  StereoFrameSource,
  StereoFrameSourceStatusSnapshot,
} from "./frame_source";

export type {
  StereoEye,
  StereoEyeDebugPattern,
  StereoEyeFrame,
  StereoEyeImageContent,
  StereoFrame,
  StereoFrameFormat,
  StereoFrameMetadata,
  StereoOverlayPayload,
  ViewerContentSource,
} from "./frame_models";
export type { ThermalFrame, ThermalOverlayMode } from "./thermal_models";
export type {
  StereoFrameListener,
  StereoFrameSource,
  StereoFrameSourceInfo,
  StereoFrameSourceStatusListener,
  StereoFrameSourceState,
  StereoFrameSourceStatusSnapshot,
} from "./frame_source";

/**
 * Presentation options applied after a frame reaches the viewer.
 *
 * These options represent local display behavior rather than transport-level
 * frame content.
 */
export interface ViewerPresentationOptions {
  readonly brightness: number;
  readonly overlayEnabled: boolean;
  readonly thermalOverlayMode: ThermalOverlayMode;
}

/**
 * Render-agnostic presentation data for one eye.
 */
export interface ViewerEyePresentation {
  readonly eye: StereoEye;
  readonly label: string;
  readonly title: string;
  readonly markerText: string;
  readonly backgroundHex: string;
  readonly accentHex: string;
  readonly width: number;
  readonly height: number;
  readonly format: StereoFrameFormat;
  readonly imageSrc?: string;
  readonly imageSourceKind?: StereoEyeImageContent["sourceKind"];
  readonly hasImageContent: boolean;
}

/**
 * Current viewer-facing presentation model derived from the latest frame and
 * local presentation settings.
 */
export interface ViewerPresentationModel {
  readonly source: ViewerContentSource;
  readonly frameId?: number;
  readonly timestampMs?: number;
  readonly brightness: number;
  readonly overlayEnabled: boolean;
  readonly metadata?: StereoFrameMetadata;
  readonly overlay?: StereoOverlayPayload;
  readonly thermalFrame?: ThermalFrame;
  readonly thermalOverlayMode: ThermalOverlayMode;
  readonly thermalOverlayVisible: boolean;
  readonly leftEye: ViewerEyePresentation;
  readonly rightEye: ViewerEyePresentation;
}

/**
 * Snapshot of the viewer surface state.
 */
export interface ViewerSurfaceSnapshot {
  readonly initialized: boolean;
  readonly source: ViewerContentSource;
  readonly renderStatusText: string;
  readonly frameSourceId?: string;
  readonly frameSourceStatus?: StereoFrameSourceStatusSnapshot;
  readonly activeSceneId?: string;
  readonly currentFrame?: StereoFrame;
  readonly presentation: ViewerPresentationModel;
}

/**
 * Listener invoked whenever the viewer state changes.
 */
export type ViewerSurfaceListener = (snapshot: ViewerSurfaceSnapshot) => void;

/**
 * Abstract surface for stereo presentation.
 *
 * The viewer accepts structured stereo frames through a frame-source seam and
 * exposes a presentation model for renderer adapters such as the DOM mock
 * renderer or a future Samsung XR/OpenXR renderer.
 */
export interface ViewerSurface {
  initialize(): Promise<void>;
  getSnapshot(): ViewerSurfaceSnapshot;
  subscribe(listener: ViewerSurfaceListener): Unsubscribe;
  setPresentationOptions(options: Partial<ViewerPresentationOptions>): void;
  presentFrame(frame: StereoFrame): void;
  attachFrameSource(frameSource: StereoFrameSource): void;
  detachFrameSource(): void;
}

/**
 * In-memory placeholder viewer implementation used by the scaffold.
 *
 * This class remains transport-agnostic. It knows how to store the latest
 * structured stereo frame and derive a presentation model from it, but it does
 * not know where the frame originated.
 */
export class PlaceholderViewerSurface implements ViewerSurface {
  private snapshot: ViewerSurfaceSnapshot = createInitialSnapshot();

  private readonly listeners = new Set<ViewerSurfaceListener>();

  private presentationOptions: ViewerPresentationOptions = {
    brightness: 0.75,
    overlayEnabled: false,
    thermalOverlayMode: DEFAULT_THERMAL_OVERLAY_MODE,
  };

  private activeFrameSource?: StereoFrameSource;

  private frameSourceUnsubscribe?: Unsubscribe;

  private frameSourceStatusUnsubscribe?: Unsubscribe;

  async initialize(): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      initialized: true,
      renderStatusText: "Viewer ready for stereo frame input.",
    };
    this.emit();
  }

  getSnapshot(): ViewerSurfaceSnapshot {
    return this.snapshot;
  }

  subscribe(listener: ViewerSurfaceListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  setPresentationOptions(
    options: Partial<ViewerPresentationOptions>,
  ): void {
    const nextPresentationOptions = {
      ...this.presentationOptions,
      ...options,
    };
    if (
      areViewerPresentationOptionsEqual(
        this.presentationOptions,
        nextPresentationOptions,
      )
    ) {
      return;
    }

    this.presentationOptions = nextPresentationOptions;

    this.snapshot = {
      ...this.snapshot,
      presentation: createPresentationModel(
        this.snapshot.currentFrame,
        this.presentationOptions,
      ),
    };
    this.emit();
  }

  presentFrame(frame: StereoFrame): void {
    const frameSourceStatus = this.activeFrameSource?.getStatus();
    this.snapshot = {
      ...this.snapshot,
      source: frame.source,
      frameSourceId: frameSourceStatus?.info.id ?? frame.metadata?.sourceId,
      frameSourceStatus,
      activeSceneId: frame.metadata?.sceneId,
      currentFrame: frame,
      renderStatusText: createRenderStatusText(frame),
      presentation: createPresentationModel(frame, this.presentationOptions),
    };
    this.emit();
  }

  attachFrameSource(frameSource: StereoFrameSource): void {
    if (this.activeFrameSource?.info.id === frameSource.info.id) {
      this.snapshot = {
        ...this.snapshot,
        frameSourceId: frameSource.info.id,
        frameSourceStatus: frameSource.getStatus(),
        source: frameSource.info.sourceKind,
        renderStatusText: createSourceStatusText(frameSource.getStatus()),
      };
      this.emit();
      return;
    }

    this.detachFrameSource();

    this.activeFrameSource = frameSource;
    this.frameSourceUnsubscribe = frameSource.subscribeFrame((frame) => {
      this.presentFrame(frame);
    });
    this.frameSourceStatusUnsubscribe = frameSource.subscribeStatus((status) => {
      this.handleFrameSourceStatus(status);
    });

    this.snapshot = {
      ...this.snapshot,
      source: frameSource.info.sourceKind,
      frameSourceId: frameSource.info.id,
      frameSourceStatus: frameSource.getStatus(),
      currentFrame: undefined,
      activeSceneId: undefined,
      renderStatusText: createSourceStatusText(frameSource.getStatus()),
      presentation: createPresentationModel(undefined, this.presentationOptions),
    };
    this.emit();
  }

  detachFrameSource(): void {
    const sourceToDetach = this.activeFrameSource;
    this.frameSourceUnsubscribe?.();
    this.frameSourceUnsubscribe = undefined;
    this.frameSourceStatusUnsubscribe?.();
    this.frameSourceStatusUnsubscribe = undefined;
    this.activeFrameSource = undefined;

    this.snapshot = {
      ...this.snapshot,
      source: "none",
      frameSourceId: undefined,
      frameSourceStatus: sourceToDetach?.getStatus(),
      activeSceneId: undefined,
      currentFrame: undefined,
      renderStatusText: sourceToDetach
        ? `Viewer detached from ${sourceToDetach.info.displayName}.`
        : "Viewer has no active frame source.",
      presentation: createPresentationModel(undefined, this.presentationOptions),
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private handleFrameSourceStatus(
    status: StereoFrameSourceStatusSnapshot,
  ): void {
    this.snapshot = {
      ...this.snapshot,
      source: status.info.sourceKind,
      frameSourceId: status.info.id,
      frameSourceStatus: status,
      renderStatusText:
        status.state === "running" && this.snapshot.currentFrame
          ? createRenderStatusText(this.snapshot.currentFrame)
          : createSourceStatusText(status),
    };
    this.emit();
  }
}

function createInitialSnapshot(): ViewerSurfaceSnapshot {
  return {
    initialized: false,
    source: "none",
    renderStatusText: "Viewer not initialized.",
    presentation: createPresentationModel(undefined, {
      brightness: 0.75,
      overlayEnabled: false,
      thermalOverlayMode: DEFAULT_THERMAL_OVERLAY_MODE,
    }),
  };
}

function createPresentationModel(
  frame: StereoFrame | undefined,
  options: ViewerPresentationOptions,
): ViewerPresentationModel {
  return {
    source: frame?.source ?? "none",
    frameId: frame?.frameId,
    timestampMs: frame?.timestampMs,
    brightness: options.brightness,
    overlayEnabled: options.overlayEnabled,
    metadata: frame?.metadata,
    overlay: options.overlayEnabled ? frame?.overlay : undefined,
    thermalFrame: frame?.thermalFrame,
    thermalOverlayMode:
      options.thermalOverlayMode ??
      frame?.thermalOverlayMode ??
      DEFAULT_THERMAL_OVERLAY_MODE,
    thermalOverlayVisible:
      Boolean(frame?.thermalFrame) &&
      (options.thermalOverlayMode ??
        frame?.thermalOverlayMode ??
        DEFAULT_THERMAL_OVERLAY_MODE) !== "off",
    leftEye: createEyePresentation(frame?.left, "left"),
    rightEye: createEyePresentation(frame?.right, "right"),
  };
}

function createEyePresentation(
  eyeFrame: StereoEyeFrame | undefined,
  eye: StereoEye,
): ViewerEyePresentation {
  const fallbackPattern = createFallbackPattern(eye);
  const debugPattern = eyeFrame?.debugPattern ?? fallbackPattern;
  const imageContent = eyeFrame?.imageContent;

  return {
    eye,
    label: debugPattern.eyeLabel,
    title: debugPattern.title,
    markerText: debugPattern.markerText,
    backgroundHex: debugPattern.backgroundHex,
    accentHex: debugPattern.accentHex,
    width: eyeFrame?.width ?? 1280,
    height: eyeFrame?.height ?? 720,
    format: eyeFrame?.format ?? "placeholder",
    imageSrc: imageContent?.src,
    imageSourceKind: imageContent?.sourceKind,
    hasImageContent: Boolean(imageContent?.src),
  };
}

function createFallbackPattern(eye: StereoEye): StereoEyeDebugPattern {
  if (eye === "left") {
    return {
      eyeLabel: "LEFT EYE",
      title: "Awaiting Stereo Frame",
      backgroundHex: "#162231",
      accentHex: "#73d7ff",
      markerText: "No frame",
    };
  }

  return {
    eyeLabel: "RIGHT EYE",
    title: "Awaiting Stereo Frame",
    backgroundHex: "#291a32",
    accentHex: "#dba3ff",
    markerText: "No frame",
  };
}

function createRenderStatusText(frame: StereoFrame): string {
  const leftLabel = frame.left.contentLabel ?? frame.left.debugPattern?.markerText ?? "left";
  const rightLabel =
    frame.right.contentLabel ?? frame.right.debugPattern?.markerText ?? "right";

  return `Rendering ${frame.source} stereo frame #${frame.frameId} (${leftLabel} / ${rightLabel})`;
}

function createSourceStatusText(
  status: StereoFrameSourceStatusSnapshot,
): string {
  if (status.statusText) {
    return status.statusText;
  }

  if (status.state === "running") {
    return `Source ${status.info.displayName} is running.`;
  }

  if (status.state === "reconnecting") {
    return `Source ${status.info.displayName} is reconnecting.`;
  }

  if (status.state === "error") {
    return status.lastError
      ? `Source ${status.info.displayName} error: ${status.lastError}`
      : `Source ${status.info.displayName} reported an error.`;
  }

  if (status.state === "starting") {
    return `Source ${status.info.displayName} is starting.`;
  }

  if (status.state === "stopped") {
    return `Source ${status.info.displayName} is stopped.`;
  }

  return `Source ${status.info.displayName} is idle.`;
}

function areViewerPresentationOptionsEqual(
  left: ViewerPresentationOptions,
  right: ViewerPresentationOptions,
): boolean {
  return (
    left.brightness === right.brightness &&
    left.overlayEnabled === right.overlayEnabled &&
    left.thermalOverlayMode === right.thermalOverlayMode
  );
}
