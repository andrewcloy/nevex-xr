import type { AppRuntime } from "../app_shell/app_runtime";
import type { Unsubscribe } from "../hand_input/contracts";
import type { ViewerSurface } from "../stereo_viewer/viewer_surface";
import { uiAssets } from "./assets/uiAssets";

export type HandMenuAnchorSide = "left";
export type HandMenuLayout = "floating_two_row";
export type HandMenuTriggerGesture = "left_thumb_index_pinch";
export type HandMenuSelectionGesture = "either_hand_pinch";
export type HandMenuPreviewMode = "gesture_only" | "idle_preview";
export type HandMenuItemTier = "primary" | "secondary";
export type HandMenuInteractionSource = "pointer_preview" | "future_pinch";
export type HandMenuSelectionHand = "left" | "right";
export type HandMenuRuntimeSource = "samsung_xr_runtime";

export type HandMenuItemId =
  | "camera"
  | "zoom"
  | "ai"
  | "thermal_fusion"
  | "illuminator"
  | "search"
  | "record"
  | "battery"
  | "day_night"
  | "thermal_target"
  | "exit";

export type HandMenuPrimaryItemId = Extract<
  HandMenuItemId,
  "camera" | "zoom" | "ai" | "thermal_fusion" | "illuminator" | "search"
>;
export type HandMenuSecondaryItemId = Exclude<HandMenuItemId, HandMenuPrimaryItemId>;

export type HandMenuCommandRoute =
  | "camera_panel"
  | "zoom_panel"
  | "ai_panel"
  | "thermal_panel"
  | "illuminator_panel"
  | "search_panel";

export interface HandMenuItemDefinition {
  readonly id: HandMenuItemId;
  readonly label: string;
  readonly tier: HandMenuItemTier;
  readonly iconAssetPath: string;
  readonly description: string;
}

export interface HandMenuSelectionContext {
  readonly interactionSource: HandMenuInteractionSource;
  readonly triggerGesture: HandMenuTriggerGesture;
  readonly selectionGesture: HandMenuSelectionGesture;
  readonly selectionHand?: HandMenuSelectionHand;
}

export interface HandMenuRuntimeInput {
  readonly source: HandMenuRuntimeSource;
  readonly menuIntent?: "open" | "close" | "toggle";
  readonly targetedItemId?: HandMenuItemId;
  readonly targetedHand?: HandMenuSelectionHand;
  readonly selectPinchTriggered?: boolean;
  readonly selectionHand?: HandMenuSelectionHand;
}

export interface HandMenuCommandPanelSnapshot {
  readonly visible: boolean;
  readonly route?: HandMenuCommandRoute;
  readonly title: string;
  readonly actionLabel: string;
  readonly statusText: string;
  readonly bodyText: string;
  readonly selectedItemId?: HandMenuPrimaryItemId;
}

export interface HandMenuSupportPanelSnapshot {
  readonly visible: boolean;
  readonly title: string;
  readonly statusText: string;
  readonly detailText: string;
  readonly focusedItemId?: HandMenuSecondaryItemId;
}

export interface HandMenuRuntimeInputSnapshot {
  readonly source: HandMenuRuntimeSource;
  readonly menuOpenRequested: boolean;
  readonly targetedItemId?: HandMenuItemId;
  readonly targetedHand?: HandMenuSelectionHand;
  readonly statusText: string;
}

export interface HandMenuSnapshot {
  readonly visible: boolean;
  readonly open: boolean;
  readonly anchorSide: HandMenuAnchorSide;
  readonly layout: HandMenuLayout;
  readonly triggerGesture: HandMenuTriggerGesture;
  readonly selectionGesture: HandMenuSelectionGesture;
  readonly previewMode: HandMenuPreviewMode;
  readonly highlightedItemId?: HandMenuItemId;
  readonly lastSelectedItemId?: HandMenuItemId;
  readonly selectedPrimaryItemId?: HandMenuPrimaryItemId;
  readonly selectedSecondaryItemId?: HandMenuSecondaryItemId;
  readonly primaryItems: readonly HandMenuItemDefinition[];
  readonly secondaryItems: readonly HandMenuItemDefinition[];
  readonly guidanceText: string;
  readonly interactionHintText: string;
  readonly commandPanel: HandMenuCommandPanelSnapshot;
  readonly supportPanel: HandMenuSupportPanelSnapshot;
  readonly runtimeInput: HandMenuRuntimeInputSnapshot;
}

export type HandMenuListener = (snapshot: HandMenuSnapshot) => void;
export type HandMenuSelectionHandler = (
  item: HandMenuItemDefinition,
  context: HandMenuSelectionContext,
) => void;
export type HandMenuCommandRouteHandler = (
  route: HandMenuCommandRoute,
  item: HandMenuItemDefinition,
  context: HandMenuSelectionContext,
) => void;

export const HAND_MENU_PRIMARY_ITEMS: readonly HandMenuItemDefinition[] = [
  {
    id: "camera",
    label: "Camera",
    tier: "primary",
    iconAssetPath: uiAssets.icons.camera,
    description: "Future camera source and device controls.",
  },
  {
    id: "zoom",
    label: "Zoom",
    tier: "primary",
    iconAssetPath: uiAssets.icons.zoomSlider,
    description: "Future pinch-adjusted zoom shortcuts.",
  },
  {
    id: "ai",
    label: "AI",
    tier: "primary",
    iconAssetPath: uiAssets.icons.ai,
    description: "Future AI overlay activation and visibility tools.",
  },
  {
    id: "thermal_fusion",
    label: "Thermal Fusion",
    tier: "primary",
    iconAssetPath: uiAssets.icons.thermalFusion,
    description: "Future thermal fusion blending and scene mix controls.",
  },
  {
    id: "illuminator",
    label: "Illuminator",
    tier: "primary",
    iconAssetPath: uiAssets.icons.illuminator,
    description: "Future illuminator controls and quick lighting presets.",
  },
  {
    id: "search",
    label: "Search",
    tier: "primary",
    iconAssetPath: uiAssets.productionIcons.sensors.scanMode,
    description: "Future search and target scan shortcuts.",
  },
] as const;

export const HAND_MENU_SECONDARY_ITEMS: readonly HandMenuItemDefinition[] = [
  {
    id: "record",
    label: "Record",
    tier: "secondary",
    iconAssetPath: uiAssets.icons.record,
    description: "Future recording actions and status.",
  },
  {
    id: "battery",
    label: "Battery",
    tier: "secondary",
    iconAssetPath: uiAssets.icons.battery,
    description: "Future battery and power telemetry shortcuts.",
  },
  {
    id: "day_night",
    label: "Day/Night",
    tier: "secondary",
    iconAssetPath: uiAssets.icons.dayNight,
    description: "Future day and night display mode switching.",
  },
  {
    id: "thermal_target",
    label: "Thermal Target",
    tier: "secondary",
    iconAssetPath: uiAssets.productionIcons.detection.targetLock,
    description: "Future thermal target emphasis and lock controls.",
  },
  {
    id: "exit",
    label: "Exit Menu",
    tier: "secondary",
    iconAssetPath: uiAssets.productionIcons.menu.exitMenu,
    description: "Future menu-dismiss or exit affordance when a dedicated flow exists.",
  },
] as const;

const HAND_MENU_PRIMARY_COMMAND_STUBS: Record<
  HandMenuPrimaryItemId,
  {
    readonly route: HandMenuCommandRoute;
    readonly title: string;
    readonly actionLabel: string;
    readonly statusText: string;
    readonly bodyText: string;
  }
> = {
  camera: {
    route: "camera_panel",
    title: "CAMERA selected",
    actionLabel: "open camera panel",
    statusText: "UI-only command routing stub ready.",
    bodyText:
      "Future Samsung XR runtime pinch input can route to camera controls without changing transport or backend behavior.",
  },
  zoom: {
    route: "zoom_panel",
    title: "ZOOM selected",
    actionLabel: "open zoom panel",
    statusText: "UI-only command routing stub ready.",
    bodyText:
      "Future left-hand menu targeting can open a zoom panel and keep digital zoom presentation separate from backend control flow.",
  },
  ai: {
    route: "ai_panel",
    title: "AI selected",
    actionLabel: "open AI panel",
    statusText: "UI-only command routing stub ready.",
    bodyText:
      "Future runtime-provided selection pinch can route into AI presentation controls and overlays from the app-side menu seam.",
  },
  thermal_fusion: {
    route: "thermal_panel",
    title: "THERMAL selected",
    actionLabel: "open thermal panel",
    statusText: "UI-only command routing stub ready.",
    bodyText:
      "Future thermal fusion panels can be opened here without changing protocol, replay, capture, or diagnostics logic.",
  },
  illuminator: {
    route: "illuminator_panel",
    title: "ILLUMINATOR selected",
    actionLabel: "open illuminator panel",
    statusText: "UI-only command routing stub ready.",
    bodyText:
      "Future illuminator controls can route through this app-side panel state while XR runtime hand input stays an external seam.",
  },
  search: {
    route: "search_panel",
    title: "SEARCH selected",
    actionLabel: "open search panel",
    statusText: "UI-only command routing stub ready.",
    bodyText:
      "Future search workflows can be presented here while keeping hand gesture recognition owned by the Samsung XR runtime.",
  },
};

export class HandMenuController {
  private readonly runtime: AppRuntime;

  private readonly viewerSurface: ViewerSurface;

  private readonly listeners = new Set<HandMenuListener>();

  private readonly unsubscribes: Unsubscribe[] = [];

  private readonly visible = true;

  private readonly showIdlePreview: boolean;

  private pointerHighlightedItemId?: HandMenuItemId;

  private runtimeTargetedItemId?: HandMenuItemId;

  private runtimeTargetedHand?: HandMenuSelectionHand;

  private runtimeRequestedOpenState?: boolean;

  private lastSelectedItemId?: HandMenuItemId;

  private selectedPrimaryItemId?: HandMenuPrimaryItemId;

  private selectedSecondaryItemId?: HandMenuSecondaryItemId;

  private selectionHandler?: HandMenuSelectionHandler;

  private commandRouteHandler?: HandMenuCommandRouteHandler;

  constructor(
    runtime: AppRuntime,
    viewerSurface: ViewerSurface,
    options: {
      readonly showIdlePreview?: boolean;
      readonly onSelect?: HandMenuSelectionHandler;
      readonly onCommandRoute?: HandMenuCommandRouteHandler;
    } = {},
  ) {
    this.runtime = runtime;
    this.viewerSurface = viewerSurface;
    this.showIdlePreview = options.showIdlePreview ?? true;
    this.selectionHandler = options.onSelect;
    this.commandRouteHandler = options.onCommandRoute;

    this.unsubscribes.push(
      this.runtime.subscribe(() => {
        this.emit();
      }),
      this.viewerSurface.subscribe(() => {
        this.emit();
      }),
    );
  }

  getSnapshot(): HandMenuSnapshot {
    const runtimeSnapshot = this.runtime.getSnapshot();
    const viewerSnapshot = this.viewerSurface.getSnapshot();
    const hasLiveEyeImages =
      viewerSnapshot.presentation.leftEye.hasImageContent ||
      viewerSnapshot.presentation.rightEye.hasImageContent;
    const idlePreviewActive =
      this.showIdlePreview &&
      runtimeSnapshot.sourceMode === "live" &&
      runtimeSnapshot.lifecycleState !== "starting" &&
      runtimeSnapshot.lifecycleState !== "stopping" &&
      runtimeSnapshot.lifecycleState !== "stopped" &&
      !hasLiveEyeImages;
    const highlightedItemId =
      this.pointerHighlightedItemId ?? this.runtimeTargetedItemId;
    const highlightedItem = this.getItemDefinition(highlightedItemId);
    const selectedItem = this.getItemDefinition(this.lastSelectedItemId);
    const open =
      this.runtimeRequestedOpenState ??
      (runtimeSnapshot.menuVisible || idlePreviewActive);
    const supportFocusItem = this.resolveSupportFocusItem(highlightedItemId);
    const commandPanel = createCommandPanelSnapshot(this.selectedPrimaryItemId);

    return {
      visible: this.visible,
      open,
      anchorSide: "left",
      layout: "floating_two_row",
      triggerGesture: "left_thumb_index_pinch",
      selectionGesture: "either_hand_pinch",
      previewMode: idlePreviewActive ? "idle_preview" : "gesture_only",
      highlightedItemId,
      lastSelectedItemId: this.lastSelectedItemId,
      selectedPrimaryItemId: this.selectedPrimaryItemId,
      selectedSecondaryItemId: this.selectedSecondaryItemId,
      primaryItems: HAND_MENU_PRIMARY_ITEMS,
      secondaryItems: HAND_MENU_SECONDARY_ITEMS,
      guidanceText:
        highlightedItem?.description ??
        selectedItem?.description ??
        commandPanel.bodyText,
      interactionHintText: open
        ? "Future Samsung XR pinch input can target and confirm menu items here."
        : "Future left pinch anchor",
      commandPanel,
      supportPanel: createSupportPanelSnapshot(supportFocusItem),
      runtimeInput: createRuntimeInputSnapshot({
        menuOpenRequested: open,
        targetedItemId: this.runtimeTargetedItemId,
        targetedHand: this.runtimeTargetedHand,
      }),
    };
  }

  subscribe(listener: HandMenuListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  setHighlightedItem(itemId: HandMenuItemId | undefined): void {
    if (this.pointerHighlightedItemId === itemId) {
      return;
    }

    this.pointerHighlightedItemId = itemId;
    this.emit();
  }

  clearHighlight(): void {
    this.setHighlightedItem(undefined);
  }

  setSelectionHandler(handler: HandMenuSelectionHandler | undefined): void {
    this.selectionHandler = handler;
  }

  setCommandRouteHandler(handler: HandMenuCommandRouteHandler | undefined): void {
    this.commandRouteHandler = handler;
  }

  applyRuntimeInput(input: HandMenuRuntimeInput): void {
    if (input.menuIntent) {
      this.runtimeRequestedOpenState = resolveRuntimeOpenState(
        input.menuIntent,
        this.getSnapshot().open,
      );
    }

    if ("targetedItemId" in input) {
      this.runtimeTargetedItemId = input.targetedItemId;
    }

    if ("targetedHand" in input) {
      this.runtimeTargetedHand = input.targetedHand;
    }

    if (input.selectPinchTriggered) {
      const selectionTarget =
        input.targetedItemId ??
        this.runtimeTargetedItemId ??
        this.pointerHighlightedItemId ??
        this.lastSelectedItemId;

      if (selectionTarget) {
        this.selectItem(selectionTarget, "future_pinch", input.selectionHand);
        return;
      }
    }

    this.emit();
  }

  clearRuntimeInputState(): void {
    this.runtimeRequestedOpenState = undefined;
    this.runtimeTargetedItemId = undefined;
    this.runtimeTargetedHand = undefined;
    this.emit();
  }

  selectItem(
    itemId: HandMenuItemId,
    interactionSource: HandMenuInteractionSource = "pointer_preview",
    selectionHand?: HandMenuSelectionHand,
  ): void {
    const item = this.getItemDefinition(itemId);
    if (!item) {
      return;
    }

    this.pointerHighlightedItemId = itemId;
    this.lastSelectedItemId = itemId;

    const selectionContext: HandMenuSelectionContext = {
      interactionSource,
      triggerGesture: "left_thumb_index_pinch",
      selectionGesture: "either_hand_pinch",
      selectionHand,
    };

    if (item.tier === "primary") {
      if (!isPrimaryItemId(item.id)) {
        return;
      }

      this.selectedPrimaryItemId = item.id;
      const commandStub = HAND_MENU_PRIMARY_COMMAND_STUBS[item.id];
      this.commandRouteHandler?.(commandStub.route, item, selectionContext);
    } else {
      if (!isSecondaryItemId(item.id)) {
        return;
      }

      this.selectedSecondaryItemId = item.id;
    }

    this.selectionHandler?.(item, selectionContext);
    this.emit();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) {
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

  private getItemDefinition(
    itemId: HandMenuItemId | undefined,
  ): HandMenuItemDefinition | undefined {
    if (!itemId) {
      return undefined;
    }

    return [...HAND_MENU_PRIMARY_ITEMS, ...HAND_MENU_SECONDARY_ITEMS].find(
      (item) => item.id === itemId,
    );
  }

  private resolveSupportFocusItem(
    highlightedItemId: HandMenuItemId | undefined,
  ): HandMenuItemDefinition | undefined {
    if (highlightedItemId) {
      const highlightedItem = this.getItemDefinition(highlightedItemId);
      if (highlightedItem?.tier === "secondary") {
        return highlightedItem;
      }
    }

    if (this.selectedSecondaryItemId) {
      return this.getItemDefinition(this.selectedSecondaryItemId);
    }

    return HAND_MENU_SECONDARY_ITEMS[0];
  }
}

function createCommandPanelSnapshot(
  selectedItemId: HandMenuPrimaryItemId | undefined,
): HandMenuCommandPanelSnapshot {
  if (!selectedItemId) {
    return {
      visible: true,
      title: "Choose a primary function",
      actionLabel: "routing stub ready",
      statusText: "UI-only selection state active.",
      bodyText:
        "Select Camera, Zoom, AI, Thermal Fusion, Illuminator, or Search to preview a future panel route.",
    };
  }

  const stub = HAND_MENU_PRIMARY_COMMAND_STUBS[selectedItemId];
  return {
    visible: true,
    route: stub.route,
    title: stub.title,
    actionLabel: stub.actionLabel,
    statusText: stub.statusText,
    bodyText: stub.bodyText,
    selectedItemId,
  };
}

function createSupportPanelSnapshot(
  focusedItem: HandMenuItemDefinition | undefined,
): HandMenuSupportPanelSnapshot {
  if (
    !focusedItem ||
    focusedItem.tier !== "secondary" ||
    !isSecondaryItemId(focusedItem.id)
  ) {
    return {
      visible: true,
      title: "Support shortcuts",
      statusText: "Secondary strip ready.",
      detailText:
        "Record, Battery, Day/Night, Thermal Target, and Exit are scaffolded here for later context-specific use.",
    };
  }

  return {
    visible: true,
    title: `${focusedItem.label} ready`,
    statusText: "Secondary support action scaffolded.",
    detailText: focusedItem.description,
    focusedItemId: focusedItem.id,
  };
}

function createRuntimeInputSnapshot(options: {
  readonly menuOpenRequested: boolean;
  readonly targetedItemId?: HandMenuItemId;
  readonly targetedHand?: HandMenuSelectionHand;
}): HandMenuRuntimeInputSnapshot {
  const targetedHandText = options.targetedHand ? `${options.targetedHand} hand` : "runtime";
  const statusText = options.targetedItemId
    ? `Runtime target ready: ${options.targetedItemId} (${targetedHandText}).`
    : "Ready for Samsung XR runtime menu-open, targeting, and select pinch signals.";

  return {
    source: "samsung_xr_runtime",
    menuOpenRequested: options.menuOpenRequested,
    targetedItemId: options.targetedItemId,
    targetedHand: options.targetedHand,
    statusText,
  };
}

function resolveRuntimeOpenState(
  menuIntent: "open" | "close" | "toggle",
  currentlyOpen: boolean,
): boolean {
  if (menuIntent === "toggle") {
    return !currentlyOpen;
  }

  return menuIntent === "open";
}

function isPrimaryItemId(itemId: HandMenuItemId): itemId is HandMenuPrimaryItemId {
  return itemId in HAND_MENU_PRIMARY_COMMAND_STUBS;
}

function isSecondaryItemId(itemId: HandMenuItemId): itemId is HandMenuSecondaryItemId {
  return !isPrimaryItemId(itemId);
}
