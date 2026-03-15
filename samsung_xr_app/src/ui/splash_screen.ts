export type SplashVariant = "hero" | "forest" | "space";

export type SplashLifecycleState =
  | "idle"
  | "starting"
  | "running_live"
  | "running_mock"
  | "stopping"
  | "stopped"
  | "error";

export interface SplashPresentationSnapshot {
  readonly visible: boolean;
  readonly variant: SplashVariant;
  readonly brandName: string;
  readonly productLine: string;
  readonly statusText: string;
  readonly detailText: string;
}

export const SUPPORTED_SPLASH_VARIANTS = [
  "hero",
  "forest",
  "space",
] as const satisfies readonly SplashVariant[];

export const DEFAULT_SPLASH_VARIANT: SplashVariant = "hero";

export function createSplashPresentationSnapshot(options: {
  readonly appRunning: boolean;
  readonly lifecycleState: SplashLifecycleState;
  readonly frameReady: boolean;
  readonly detailText: string;
  readonly variant?: SplashVariant;
}): SplashPresentationSnapshot {
  const variant = options.variant ?? DEFAULT_SPLASH_VARIANT;
  const visible =
    !options.frameReady &&
    (options.lifecycleState === "idle" || options.lifecycleState === "starting");

  return {
    visible,
    variant,
    brandName: "NEVEX",
    productLine: "Advanced Vision Systems",
    statusText: resolveSplashStatusText(options),
    detailText: options.detailText,
  };
}

function resolveSplashStatusText(options: {
  readonly appRunning: boolean;
  readonly lifecycleState: SplashLifecycleState;
  readonly frameReady: boolean;
}): string {
  if (options.lifecycleState === "error") {
    return "Startup paused";
  }

  if (!options.appRunning || options.lifecycleState === "starting") {
    return "Initializing...";
  }

  if (!options.frameReady) {
    return "Preparing stereo presentation...";
  }

  return "Ready";
}
