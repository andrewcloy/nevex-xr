import type { Unsubscribe } from "../hand_input/contracts";
import type { ViewerSurface } from "../stereo_viewer/viewer_surface";
import type {
  DiagnosticsPanelController,
  DiagnosticsPanelSnapshot,
} from "../ui/diagnostics_panel";
import type {
  StatusPanelController,
  StatusPanelSnapshot,
} from "../ui/status_panel";
import type { AppRuntime, AppRuntimeSnapshot } from "./app_runtime";

/**
 * Simple placement description for future XR scene rendering.
 */
export interface XrPlacement {
  readonly anchor: "center" | "left" | "right";
  readonly distanceMeters: number;
  readonly verticalOffsetMeters: number;
}

/**
 * Scene node describing the stereo viewer area.
 */
export interface StereoViewerSceneNode {
  readonly id: "stereo_viewer";
  readonly placement: XrPlacement;
  readonly source: string;
  readonly frameId?: number;
  readonly frameSourceStatus?: string;
  readonly leftEyeLabel: string;
  readonly rightEyeLabel: string;
}

/**
 * Scene node describing the primary status/settings panel.
 */
export interface StatusPanelSceneNode {
  readonly id: "status_panel";
  readonly placement: XrPlacement;
  readonly panel: StatusPanelSnapshot;
}

/**
 * Scene node describing the diagnostics panel.
 */
export interface DiagnosticsSceneNode {
  readonly id: "diagnostics_panel";
  readonly placement: XrPlacement;
  readonly panel: DiagnosticsPanelSnapshot;
}

/**
 * Render-agnostic description of the current XR scene.
 *
 * A future Samsung XR framework layer can consume this snapshot and map it to
 * real scene objects, panels, and quads without changing the app shell.
 */
export interface MainSceneSnapshot {
  readonly running: boolean;
  readonly lifecycleState: AppRuntimeSnapshot["lifecycleState"];
  readonly viewerArea: StereoViewerSceneNode;
  readonly statusPanel: StatusPanelSceneNode;
  readonly diagnosticsPanel: DiagnosticsSceneNode;
}

/**
 * Listener invoked when the scene model changes.
 */
export type MainSceneListener = (snapshot: MainSceneSnapshot) => void;

/**
 * Main-scene coordinator for the minimum viable XR app foundation.
 */
export class MainSceneController {
  private readonly runtime: AppRuntime;

  private readonly viewerSurface: ViewerSurface;

  private readonly statusPanel: StatusPanelController;

  private readonly diagnosticsPanel: DiagnosticsPanelController;

  private readonly listeners = new Set<MainSceneListener>();

  private readonly unsubscribeCallbacks: Unsubscribe[] = [];

  constructor(options: {
    readonly runtime: AppRuntime;
    readonly viewerSurface: ViewerSurface;
    readonly statusPanel: StatusPanelController;
    readonly diagnosticsPanel: DiagnosticsPanelController;
  }) {
    this.runtime = options.runtime;
    this.viewerSurface = options.viewerSurface;
    this.statusPanel = options.statusPanel;
    this.diagnosticsPanel = options.diagnosticsPanel;

    this.unsubscribeCallbacks.push(
      this.runtime.subscribe(() => {
        this.emit();
      }),
      this.viewerSurface.subscribe(() => {
        this.emit();
      }),
      this.statusPanel.subscribe(() => {
        this.emit();
      }),
      this.diagnosticsPanel.subscribe(() => {
        this.emit();
      }),
    );
  }

  getSnapshot(): MainSceneSnapshot {
    const runtimeSnapshot = this.runtime.getSnapshot();
    const viewerSnapshot = this.viewerSurface.getSnapshot();
    const statusPanelSnapshot = this.statusPanel.getSnapshot();
    const diagnosticsSnapshot = this.diagnosticsPanel.getSnapshot();

    return {
      running:
        runtimeSnapshot.lifecycleState === "running_live" ||
        runtimeSnapshot.lifecycleState === "running_mock",
      lifecycleState: runtimeSnapshot.lifecycleState,
      viewerArea: {
        id: "stereo_viewer",
        placement: {
          anchor: "center",
          distanceMeters: 1.6,
          verticalOffsetMeters: 0,
        },
        source: viewerSnapshot.source,
        frameId: viewerSnapshot.presentation.frameId,
        frameSourceStatus: viewerSnapshot.frameSourceStatus?.state,
        leftEyeLabel: viewerSnapshot.presentation.leftEye.label,
        rightEyeLabel: viewerSnapshot.presentation.rightEye.label,
      },
      statusPanel: {
        id: "status_panel",
        placement: {
          anchor: "right",
          distanceMeters: 1.1,
          verticalOffsetMeters: 0.1,
        },
        panel: statusPanelSnapshot,
      },
      diagnosticsPanel: {
        id: "diagnostics_panel",
        placement: {
          anchor: "left",
          distanceMeters: 1.1,
          verticalOffsetMeters: -0.15,
        },
        panel: diagnosticsSnapshot,
      },
    };
  }

  subscribe(listener: MainSceneListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribeCallbacks) {
      unsubscribe();
    }
    this.listeners.clear();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
