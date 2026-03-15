import type { SamsungXrAppSession } from "../app_shell/bootstrap";
import type { DiagnosticsSnapshot } from "../diagnostics/diagnostics_store";
import type { Unsubscribe } from "../hand_input/contracts";
import type {
  SourceMode,
} from "../settings_state/settings_store";
import type { LiveTransportAdapterType } from "../stereo_viewer/transport_adapter";
import type { HearingEnhancementMode } from "../stereo_viewer/audio_models";
import type { ThermalOverlayMode } from "../stereo_viewer/thermal_models";
import type {
  ViewerEyePresentation,
  ViewerPresentationModel,
} from "../stereo_viewer/viewer_surface";
import { uiAssetBrowserUrls } from "../ui/assets/uiAssets";
import type {
  HandMenuItemDefinition,
  HandMenuItemId,
  HandMenuSnapshot,
} from "../ui/hand_menu";
import { NEVEX_UI_TOKENS } from "../ui/presentation_tokens";
import {
  DEFAULT_SPLASH_VARIANT,
  SUPPORTED_SPLASH_VARIANTS,
  createSplashPresentationSnapshot,
} from "../ui/splash_screen";
import { UiAudioController } from "../ui/ui_audio";

const HAND_MENU_ICON_URLS: Record<HandMenuItemId, string> = {
  camera: uiAssetBrowserUrls.icons.camera,
  zoom: uiAssetBrowserUrls.icons.zoomSlider,
  ai: uiAssetBrowserUrls.icons.ai,
  thermal_fusion: uiAssetBrowserUrls.icons.thermalFusion,
  illuminator: uiAssetBrowserUrls.icons.illuminator,
  search: uiAssetBrowserUrls.productionIcons.sensors.scanMode,
  record: uiAssetBrowserUrls.icons.record,
  battery: uiAssetBrowserUrls.icons.battery,
  day_night: uiAssetBrowserUrls.icons.dayNight,
  thermal_target: uiAssetBrowserUrls.productionIcons.detection.targetLock,
  exit: uiAssetBrowserUrls.productionIcons.menu.exitMenu,
};

/**
 * Options for mounting the local DOM-based mock renderer.
 */
export interface DomRendererOptions {
  readonly root: HTMLElement;
  readonly app: SamsungXrAppSession;
}

/**
 * Browser renderer adapter that sits on top of the framework-agnostic app
 * scaffold and makes the mock experience visibly runnable in a local browser.
 *
 * A future Samsung XR or OpenXR renderer can replace this adapter without
 * changing the app shell, viewer, UI controllers, or control client seam.
 */
export class DomRendererAdapter {
  private readonly root: HTMLElement;

  private readonly app: SamsungXrAppSession;

  private readonly uiAudio: UiAudioController;

  private readonly unsubscribes: Unsubscribe[] = [];

  private pendingActionText?: string;

  private disposed = false;

  constructor(options: DomRendererOptions) {
    this.root = options.root;
    this.app = options.app;
    this.uiAudio = new UiAudioController({
      getPlaybackSettings: () => {
        const settings = this.app.settingsStore.getSnapshot();
        return {
          enabled: settings.uiAudioEnabled,
          clickVolume: settings.uiClickVolume,
          bootVolume: settings.uiBootVolume,
        };
      },
    });

    this.unsubscribes.push(
      this.app.scene.subscribe(() => {
        this.render();
      }),
      this.app.viewerSurface.subscribe(() => {
        this.render();
      }),
      this.app.settingsStore.subscribe(() => {
        this.render();
      }),
      this.app.diagnosticsStore.subscribe(() => {
        this.render();
      }),
      this.app.ui.handMenu.subscribe(() => {
        this.render();
      }),
    );

    this.render();
    this.uiAudio.playBootSound();
  }

  dispose(): void {
    this.disposed = true;
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
    this.root.innerHTML = "";
  }

  private render(): void {
    if (this.disposed) {
      return;
    }

    const scene = this.app.scene.getSnapshot();
    const viewer = this.app.viewerSurface.getSnapshot();
    const settings = this.app.settingsStore.getSnapshot();
    const diagnostics = this.app.diagnosticsStore.getSnapshot();
    const presentation = viewer.presentation;
    const handMenu = this.app.ui.handMenu.getSnapshot();
    const splash = createSplashPresentationSnapshot({
      appRunning: scene.running,
      lifecycleState: scene.lifecycleState,
      frameReady: typeof presentation.frameId === "number",
      detailText: scene.statusPanel.panel.statusText,
      variant: DEFAULT_SPLASH_VARIANT,
    });
    const noFeed = createNoFeedPresentation({
      sourceMode: settings.sourceMode,
      connectionStatusText: scene.statusPanel.panel.connectionStatusText,
      transportStatusText: scene.statusPanel.panel.transportStatusText,
      adapterDisplayName: diagnostics.transportAdapterDisplayName,
      hasEyeImages:
        presentation.leftEye.hasImageContent || presentation.rightEye.hasImageContent,
      splashVisible: splash.visible,
      handMenuOpen: handMenu.open,
    });

    this.root.innerHTML = `
      <div class="mock-app-shell" style="${renderThemeVariables()}">
        <header class="mock-app-shell__header">
          <div class="brand-lockup">
            <img
              class="brand-lockup__logo"
              src="${escapeHtml(uiAssetBrowserUrls.logos.primary)}"
              alt="NEVEX logo"
            />
            <div>
            <p class="mock-app-shell__eyebrow">Samsung XR Mock Runtime</p>
              <h1 class="mock-app-shell__title">NEVEX Stereo Viewer</h1>
              <p class="mock-app-shell__subtitle">Advanced Vision Systems</p>
            </div>
          </div>
          <div class="status-pill ${
            scene.running ? "status-pill--online" : "status-pill--offline"
          }">
            ${scene.running ? "App Running" : "App Idle"}
          </div>
        </header>

        <main class="mock-app-shell__body">
          <section class="card viewer-card">
            <div class="card__header">
              <div>
                <h2>Stereo Viewer</h2>
                <p>Mock stereo presentation driven by the existing viewer surface.</p>
              </div>
              <div class="viewer-meta">
                <span class="chip">Source: ${escapeHtml(scene.viewerArea.source)}</span>
                <span class="chip">Frame: ${
                  typeof presentation.frameId === "number"
                    ? `#${presentation.frameId}`
                    : "Pending"
                }</span>
                <span class="chip">Brightness: ${presentation.brightness.toFixed(2)}</span>
                <span class="chip">Overlay: ${
                  presentation.overlayEnabled ? "On" : "Off"
                }</span>
                <span class="chip">Adapter: ${escapeHtml(
                  diagnostics.transportAdapterDisplayName,
                )}</span>
                ${renderHealthBadge(
                  `Health: ${scene.statusPanel.panel.sourceHealthText}`,
                  scene.statusPanel.panel.sourceHealthTone,
                )}
                <span class="chip">Telemetry: ${escapeHtml(
                  scene.statusPanel.panel.telemetryFreshnessText,
                )}</span>
                <span class="chip">Source Link: ${escapeHtml(
                  diagnostics.sourceConnectionStatusText,
                )}</span>
                <span class="chip">Frame Source: ${
                  viewer.frameSourceStatus?.state ?? "detached"
                }</span>
                <span class="chip">Eye Images: ${
                  presentation.leftEye.hasImageContent || presentation.rightEye.hasImageContent
                    ? "Available"
                    : "Fallback"
                }</span>
              </div>
            </div>

            <div class="viewer-stage">
              <div class="stereo-grid">
                ${renderEyePanel(
                  presentation.leftEye,
                  presentation,
                  "Left Eye",
                )}
                ${renderEyePanel(
                  presentation.rightEye,
                  presentation,
                  "Right Eye",
                )}
              </div>
              ${renderFloatingHandMenu(handMenu, splash.visible)}
              ${renderNoFeedOverlay(noFeed)}
              ${renderSplashOverlay(splash)}
            </div>
          </section>

          <section class="panel-column">
            <section class="card">
              <div class="card__header">
                <div class="panel-brand">
                  <img
                    class="panel-brand__logo"
                    src="${escapeHtml(uiAssetBrowserUrls.logos.dark)}"
                    alt="NEVEX logo"
                  />
                  <div>
                    <h2 class="title-with-icon">
                      ${renderInlineIcon(
                        uiAssetBrowserUrls.productionIcons.settings.settings,
                        "Settings",
                      )}
                      <span>${escapeHtml(scene.statusPanel.panel.title)}</span>
                    </h2>
                    <p>Visible mock control surface for connection and display state.</p>
                  </div>
                </div>
              </div>

              <div class="status-panel status-panel--${toHealthToneClass(
                scene.statusPanel.panel.sourceHealthTone,
              )}">
                <div class="status-banner">
                  ${renderHealthBadge(
                    `Source Health: ${scene.statusPanel.panel.sourceHealthText}`,
                    scene.statusPanel.panel.sourceHealthTone,
                  )}
                  <span class="chip">Telemetry ${escapeHtml(
                    scene.statusPanel.panel.telemetryFreshnessText,
                  )}</span>
                  ${renderRuntimeOperationBadge(scene.statusPanel.panel)}
                </div>
                <div class="status-row">
                  ${renderLabelWithIcon(
                    uiAssetBrowserUrls.productionIcons.system.wifi,
                    "Connection",
                    "Connection",
                  )}
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.connectionStatusText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span class="status-label">
                    ${renderInlineIcon(uiAssetBrowserUrls.icons.camera, "Viewer mode")}
                    <span>Viewer mode</span>
                  </span>
                  <strong>${escapeHtml(scene.statusPanel.panel.sourceModeText)}</strong>
                </div>
                <div class="status-row">
                  <span class="status-label">
                    ${renderInlineIcon(uiAssetBrowserUrls.icons.camera, "Runtime source")}
                    <span>Runtime source</span>
                  </span>
                  <strong>${escapeHtml(
                    `${scene.statusPanel.panel.runtimeSourceModeText} · ${scene.statusPanel.panel.runtimeSourceNameText}`,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Bridge mode</span>
                  <strong>${escapeHtml(scene.statusPanel.panel.bridgeModeText)}</strong>
                </div>
                <div class="status-row">
                  <span>Capture backend</span>
                  <strong>${escapeHtml(scene.statusPanel.panel.captureBackendText)}</strong>
                </div>
                <div class="status-row">
                  <span>Frame size</span>
                  <strong>${escapeHtml(scene.statusPanel.panel.frameSizeText)}</strong>
                </div>
                <div class="status-row">
                  <span>Frame interval</span>
                  <strong>${escapeHtml(scene.statusPanel.panel.frameIntervalText)}</strong>
                </div>
                <div class="status-row ${
                  scene.statusPanel.panel.fallbackActive ? "status-row--error" : ""
                }">
                  <span>Fallback</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.fallbackActive &&
                      scene.statusPanel.panel.fallbackReasonText
                      ? `${scene.statusPanel.panel.fallbackStateText}: ${scene.statusPanel.panel.fallbackReasonText}`
                      : scene.statusPanel.panel.fallbackStateText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Status</span>
                  <strong>${escapeHtml(scene.statusPanel.panel.statusText)}</strong>
                </div>
                <div class="status-row">
                  <span class="status-label">
                    ${renderInlineIcon(uiAssetBrowserUrls.icons.zoomSlider, "Digital zoom")}
                    <span>Digital zoom</span>
                  </span>
                  <strong>${settings.digitalZoom.toFixed(2)}x</strong>
                </div>
                <div class="status-row">
                  <span class="status-label">
                    ${renderInlineIcon(uiAssetBrowserUrls.icons.ai, "AI overlay")}
                    <span>AI overlay</span>
                  </span>
                  <strong>${settings.aiOverlayEnabled ? "Enabled" : "Disabled"}</strong>
                </div>
                <div class="status-row">
                  <span class="status-label">
                    ${renderInlineIcon(
                      uiAssetBrowserUrls.icons.thermalFusion,
                      "Thermal fusion overlay",
                    )}
                    <span>Thermal overlay</span>
                  </span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.thermalOverlayModeText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Thermal health</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.thermalHealthText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span class="status-label">
                    ${renderInlineIcon(
                      uiAssetBrowserUrls.icons.illuminator,
                      "IR illuminator",
                    )}
                    <span>IR illuminator</span>
                  </span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.irEnabledText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>IR level</span>
                  <strong>${escapeHtml(scene.statusPanel.panel.irLevelText)}</strong>
                </div>
                <div class="status-row">
                  ${renderLabelWithPlaceholderIcon(
                    uiAssetBrowserUrls.placeholderAudioIcons.hearingAmp,
                    "hear",
                    "Hearing enhancement",
                  )}
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.hearingAvailabilityText,
                  )}</strong>
                </div>
                <div class="status-row">
                  ${renderLabelWithPlaceholderIcon(
                    uiAssetBrowserUrls.placeholderAudioIcons.voiceFocus,
                    "mode",
                    "Hearing mode",
                  )}
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.hearingModeText,
                  )}</strong>
                </div>
                <div class="status-row">
                  ${renderLabelWithPlaceholderIcon(
                    uiAssetBrowserUrls.placeholderAudioIcons.bluetoothAudio,
                    "bt",
                    "Phone / Bluetooth audio",
                  )}
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.bluetoothAudioConnectionText,
                  )}</strong>
                </div>
                <div class="status-row">
                  ${renderLabelWithPlaceholderIcon(
                    uiAssetBrowserUrls.placeholderAudioIcons.musicPlayer,
                    "media",
                    "Media playback",
                  )}
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.mediaPlaybackStateText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Jetson control plane</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.jetsonControlModeText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Jetson profile</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.jetsonRuntimeProfileText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Jetson preflight</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.jetsonPreflightText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Jetson runtime status</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.jetsonRuntimeStatusText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span class="status-label">
                    ${renderInlineIcon(uiAssetBrowserUrls.icons.record, "Recording")}
                    <span>Jetson recording</span>
                  </span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.jetsonRecordingStateText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Latest Jetson artifact</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.jetsonArtifactText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Source lifecycle</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.sourceLifecycleText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Source link</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.sourceConnectionStatusText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Last telemetry update</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.lastTelemetryUpdateText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Telemetry stale threshold</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.telemetryStaleThresholdText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Recent capture issues</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.recentCaptureEventsText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Last frame</span>
                  <strong>${escapeHtml(scene.statusPanel.panel.lastFrameIdText)}</strong>
                </div>
                <div class="status-row">
                  <span>Last frame time</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.lastFrameTimestampText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Transport status</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.transportStatusText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Transport connection</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.transportConnectionStatusText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Transport adapter</span>
                  <strong>${escapeHtml(
                    scene.statusPanel.panel.transportAdapterDisplayName,
                  )}</strong>
                </div>
                ${
                  scene.statusPanel.panel.sourceErrorText
                    ? `
                      <div class="status-row status-row--error">
                        <span>Source error</span>
                        <strong>${escapeHtml(
                          scene.statusPanel.panel.sourceErrorText,
                        )}</strong>
                      </div>
                    `
                    : ""
                }
                ${
                  scene.statusPanel.panel.transportParseErrorText
                    ? `
                      <div class="status-row status-row--error">
                        <span>Protocol parse/validation error</span>
                        <strong>${escapeHtml(
                          scene.statusPanel.panel.transportParseErrorText,
                        )}</strong>
                      </div>
                    `
                    : ""
                }

                ${
                  settings.sourceMode === "live"
                    ? `
                      ${renderSectionHeading(
                        uiAssetBrowserUrls.productionIcons.system.wifi,
                        "Advanced connection settings",
                        "Advanced Connection Settings",
                      )}
                      <div class="control-group">
                        <label class="group-label">Live Transport</label>
                        <div class="control-group">
                          <label class="group-label">Adapter Type</label>
                          <div class="toggle-row">
                            ${renderTransportAdapterOption(
                              "dev",
                              scene.statusPanel.panel.transportAdapterType,
                            )}
                            ${renderTransportAdapterOption(
                              "jetson_stub",
                              scene.statusPanel.panel.transportAdapterType,
                            )}
                          </div>
                        </div>
                        <div class="status-row">
                          <span>Host</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportHost,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Port</span>
                          <strong>${scene.statusPanel.panel.transportPort}</strong>
                        </div>
                        <div class="status-row">
                          <span>Reconnect</span>
                          <strong>${scene.statusPanel.panel.transportReconnectEnabled ? "Enabled" : "Disabled"}</strong>
                        </div>
                        <div class="status-row">
                          <span>Path</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportPath,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>WebSocket URL</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportWebSocketUrl,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Sender capabilities</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportCapabilitiesText,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Image modes</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportImageModesText,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Last message type</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportLastMessageTypeText,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Last sequence</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportLastSequenceText,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Last message time</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportLastMessageTimestampText,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Sequence health</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportSequenceHealthText,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Last message size</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportLastMessageSizeText,
                          )}</strong>
                        </div>
                        <div class="status-row">
                          <span>Payload limits</span>
                          <strong>${escapeHtml(
                            scene.statusPanel.panel.transportPayloadLimitsText,
                          )}</strong>
                        </div>
                        ${
                          scene.statusPanel.panel.transportStereoFormatNoteText
                            ? `
                                <div class="status-row">
                                  <span>Stereo note</span>
                                  <strong>${escapeHtml(
                                    scene.statusPanel.panel.transportStereoFormatNoteText,
                                  )}</strong>
                                </div>
                              `
                            : ""
                        }
                        <div class="control-group">
                          <label class="group-label" for="transport-host">
                            Transport Host
                          </label>
                          <input
                            id="transport-host"
                            data-control="transport-host"
                            type="text"
                            value="${escapeHtml(
                              scene.statusPanel.panel.transportHost,
                            )}"
                          />
                        </div>
                        <div class="control-group">
                          <label class="group-label" for="transport-port">
                            Transport Port
                          </label>
                          <input
                            id="transport-port"
                            data-control="transport-port"
                            type="number"
                            min="0"
                            step="1"
                            value="${scene.statusPanel.panel.transportPort}"
                          />
                        </div>
                        <div class="control-group">
                          <label class="group-label" for="transport-path">
                            Transport Path
                          </label>
                          <input
                            id="transport-path"
                            data-control="transport-path"
                            type="text"
                            value="${escapeHtml(
                              scene.statusPanel.panel.transportPath,
                            )}"
                          />
                        </div>
                        <div class="control-group">
                          <label class="checkbox-row">
                            <input
                              data-control="transport-reconnect"
                              type="checkbox"
                              ${
                                scene.statusPanel.panel.transportReconnectEnabled
                                  ? "checked"
                                  : ""
                              }
                            />
                            <span>Reconnect Enabled</span>
                          </label>
                        </div>
                        <button
                          class="button button--secondary"
                          data-action="apply-transport-config"
                          type="button"
                        >
                          Apply Transport Config
                        </button>
                        ${
                          scene.statusPanel.panel.transportAdapterType === "dev"
                            ? `
                                <label class="group-label" for="live-demo-action">
                                  Live Demo Feed
                                </label>
                                <button
                                  id="live-demo-action"
                                  class="button button--secondary"
                                  data-action="live-demo"
                                  type="button"
                                >
                                  ${
                                    scene.statusPanel.panel.liveTransportDemoFeedActive
                                      ? "Stop Live Demo Feed"
                                      : "Start Live Demo Feed"
                                  }
                                </button>
                              `
                            : ""
                        }
                        ${
                          scene.statusPanel.panel.transportAdapterType === "jetson_stub"
                            ? `
                                <label class="group-label">WebSocket Prototype</label>
                                <div class="toggle-row">
                                  <button
                                    class="button button--secondary"
                                    data-action="connect-live-transport"
                                    type="button"
                                  >
                                    Connect WebSocket
                                  </button>
                                  <button
                                    class="button button--secondary"
                                    data-action="disconnect-live-transport"
                                    type="button"
                                  >
                                    Disconnect WebSocket
                                  </button>
                                </div>
                                <label class="group-label" for="jetson-sample-action">
                                  Jetson Stub Ingress
                                </label>
                                <button
                                  id="jetson-sample-action"
                                  class="button button--secondary"
                                  data-action="jetson-sample"
                                  type="button"
                                >
                                  Inject Sample Jetson Payload
                                </button>
                              `
                            : ""
                        }
                      </div>
                    `
                    : ""
                }

                ${renderSectionHeading(
                  uiAssetBrowserUrls.icons.record,
                  "Jetson runtime actions",
                  "Jetson Runtime",
                )}
                <div class="control-group">
                  <div class="status-row">
                    <span>Control plane</span>
                    <strong>${escapeHtml(
                      scene.statusPanel.panel.jetsonControlModeText,
                    )}</strong>
                  </div>
                  <div class="status-row">
                    <span>Active profile</span>
                    <strong>${escapeHtml(
                      scene.statusPanel.panel.jetsonRuntimeProfileText,
                    )}</strong>
                  </div>
                  <div class="status-row">
                    <span>Preflight</span>
                    <strong>${escapeHtml(
                      scene.statusPanel.panel.jetsonPreflightText,
                    )}</strong>
                  </div>
                  <div class="status-row">
                    <span>Recording</span>
                    <strong>${escapeHtml(
                      scene.statusPanel.panel.jetsonRecordingStateText,
                    )}</strong>
                  </div>
                  <div class="status-row">
                    <span>Latest artifact</span>
                    <strong>${escapeHtml(
                      scene.statusPanel.panel.jetsonArtifactText,
                    )}</strong>
                  </div>
                  <div class="status-row">
                    <span>Runtime status</span>
                    <strong>${escapeHtml(
                      scene.statusPanel.panel.jetsonRuntimeStatusText,
                    )}</strong>
                  </div>
                  <div class="control-group">
                    <label class="group-label" for="jetson-profile-select">
                      Runtime Profile
                    </label>
                    <div class="toggle-row">
                      <select
                        id="jetson-profile-select"
                        data-control="jetson-profile"
                        ${
                          scene.statusPanel.panel.jetsonOperatorControlsAvailable &&
                          scene.statusPanel.panel.jetsonProfileOptions.length > 0
                            ? ""
                            : "disabled"
                        }
                      >
                        ${
                          scene.statusPanel.panel.jetsonProfileOptions.length > 0
                            ? scene.statusPanel.panel.jetsonProfileOptions
                                .map(
                                  (profileName) => `
                                    <option
                                      value="${escapeHtml(profileName)}"
                                      ${
                                        scene.statusPanel.panel.jetsonSelectedProfileName ===
                                        profileName
                                          ? "selected"
                                          : ""
                                      }
                                    >
                                      ${escapeHtml(profileName)}
                                    </option>
                                  `,
                                )
                                .join("")
                            : '<option value="">No Jetson profiles received yet</option>'
                        }
                      </select>
                      <button
                        class="button button--secondary"
                        data-action="apply-jetson-profile"
                        type="button"
                        ${
                          scene.statusPanel.panel.jetsonOperatorControlsAvailable &&
                          scene.statusPanel.panel.jetsonProfileOptions.length > 0
                            ? ""
                            : "disabled"
                        }
                      >
                        Apply Profile
                      </button>
                    </div>
                  </div>
                  <div class="toggle-row">
                    <button
                      class="button button--secondary"
                      data-action="jetson-run-preflight"
                      type="button"
                      ${
                        scene.statusPanel.panel.jetsonOperatorControlsAvailable
                          ? ""
                          : "disabled"
                      }
                    >
                      Run Preflight
                    </button>
                    <button
                      class="button button--secondary"
                      data-action="jetson-refresh-runtime"
                      type="button"
                      ${
                        scene.statusPanel.panel.jetsonOperatorControlsAvailable
                          ? ""
                          : "disabled"
                      }
                    >
                      Refresh Runtime
                    </button>
                  </div>
                  <div class="toggle-row">
                    <button
                      class="button button--secondary"
                      data-action="jetson-capture-snapshot"
                      type="button"
                      ${
                        scene.statusPanel.panel.jetsonOperatorControlsAvailable
                          ? ""
                          : "disabled"
                      }
                    >
                      Capture Snapshot
                    </button>
                    <button
                      class="button button--secondary"
                      data-action="jetson-toggle-recording"
                      type="button"
                      ${
                        scene.statusPanel.panel.jetsonOperatorControlsAvailable
                          ? ""
                          : "disabled"
                      }
                    >
                      ${
                        scene.statusPanel.panel.jetsonRecordingActive
                          ? "Stop Recording"
                          : "Start Recording"
                      }
                    </button>
                  </div>
                  <p class="control-note">
                    ${escapeHtml(
                      scene.statusPanel.panel.jetsonOperatorControlsAvailable
                        ? "Jetson runtime control-plane bridge active. Commands route through the existing WebSocket control path and results return through runtime telemetry."
                        : scene.statusPanel.panel.jetsonOperatorControlsDisabledReason ??
                            "Jetson runtime controls unavailable.",
                    )}
                  </p>
                </div>

                ${renderSectionHeading(
                  uiAssetBrowserUrls.productionIcons.settings.quickSettings,
                  "Quick settings",
                  "Quick Settings",
                )}
                <div class="control-group">
                  <label class="group-label">Source Selection</label>
                  <div class="toggle-row">
                    ${renderSourceModeOption("mock", settings.sourceMode)}
                    ${renderSourceModeOption("live", settings.sourceMode)}
                  </div>
                </div>

                <div class="control-group">
                  <label class="group-label" for="connection-action">
                    ${renderLabelWithIcon(
                      uiAssetBrowserUrls.productionIcons.system.power,
                      "Connection action",
                      "Connection Action",
                    )}
                  </label>
                  <button
                    id="connection-action"
                    class="button"
                    data-action="connection"
                    type="button"
                  >
                    ${escapeHtml(scene.statusPanel.panel.connectButtonLabel)}
                  </button>
                </div>

                ${renderSectionHeading(
                  uiAssetBrowserUrls.productionIcons.settings.settings,
                  "UI audio settings",
                  "UI Audio",
                )}
                <div class="control-group">
                  <label class="checkbox-row">
                    <input
                      data-control="ui-audio-enabled"
                      type="checkbox"
                      ${settings.uiAudioEnabled ? "checked" : ""}
                    />
                    <span>UI Sounds Enabled</span>
                  </label>
                </div>

                <div class="control-group">
                  <label class="group-label" for="ui-click-volume-slider">
                    Click Volume
                  </label>
                  <div class="slider-row">
                    <input
                      id="ui-click-volume-slider"
                      data-control="ui-click-volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value="${settings.uiClickVolume.toFixed(2)}"
                    />
                    <span>${Math.round(settings.uiClickVolume * 100)}%</span>
                  </div>
                </div>

                <div class="control-group">
                  <label class="group-label" for="ui-boot-volume-slider">
                    Boot Volume
                  </label>
                  <div class="slider-row">
                    <input
                      id="ui-boot-volume-slider"
                      data-control="ui-boot-volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value="${settings.uiBootVolume.toFixed(2)}"
                    />
                    <span>${Math.round(settings.uiBootVolume * 100)}%</span>
                  </div>
                </div>

                <div class="control-group">
                  <label class="group-label" for="brightness-slider">
                    Brightness
                  </label>
                  <div class="slider-row">
                    <input
                      id="brightness-slider"
                      data-control="brightness"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value="${settings.brightness.toFixed(2)}"
                    />
                    <span>${settings.brightness.toFixed(2)}</span>
                  </div>
                </div>

                <div class="control-group">
                  <label class="checkbox-row">
                    <input
                      data-control="overlay"
                      type="checkbox"
                      ${settings.overlayEnabled ? "checked" : ""}
                    />
                    <span>Overlay Enabled</span>
                  </label>
                </div>

                <div class="control-group">
                  <label class="group-label" for="thermal-overlay-mode">
                    ${renderLabelWithIcon(
                      uiAssetBrowserUrls.icons.thermalFusion,
                      "Thermal overlay mode",
                      "Thermal Overlay Mode",
                    )}
                  </label>
                  <select
                    id="thermal-overlay-mode"
                    data-control="thermal-overlay-mode"
                    ${scene.statusPanel.panel.thermalControlAvailable ? "" : "disabled"}
                  >
                    ${scene.statusPanel.panel.thermalOverlayModeOptions
                      .map(
                        (mode) => `
                          <option
                            value="${escapeHtml(mode)}"
                            ${
                              scene.statusPanel.panel.selectedThermalOverlayMode === mode
                                ? "selected"
                                : ""
                            }
                          >
                            ${escapeHtml(mode)}
                          </option>
                        `,
                      )
                      .join("")}
                  </select>
                  ${
                    scene.statusPanel.panel.thermalControlDisabledReason ||
                    scene.statusPanel.panel.thermalSelectedVsReportedText
                      ? `
                          <p class="control-note">
                            ${escapeHtml(
                              scene.statusPanel.panel.thermalControlDisabledReason
                                ? `${scene.statusPanel.panel.thermalControlDisabledReason} ${scene.statusPanel.panel.thermalSelectedVsReportedText}`
                                : scene.statusPanel.panel.thermalSelectedVsReportedText,
                            )}
                          </p>
                        `
                      : ""
                  }
                </div>

                <div class="control-group">
                  <label class="checkbox-row">
                    <input
                      data-control="ir-enabled"
                      type="checkbox"
                      ${scene.statusPanel.panel.irEnabled ? "checked" : ""}
                      ${scene.statusPanel.panel.irControlAvailable ? "" : "disabled"}
                    />
                    ${renderLabelWithIcon(
                      uiAssetBrowserUrls.icons.illuminator,
                      "IR illuminator enabled",
                      "IR Illuminator Enabled",
                    )}
                  </label>
                  ${
                    scene.statusPanel.panel.irControlDisabledReason ||
                    scene.statusPanel.panel.irSelectedVsReportedText
                      ? `
                          <p class="control-note">
                            ${escapeHtml(
                              scene.statusPanel.panel.irControlDisabledReason
                                ? `${scene.statusPanel.panel.irControlDisabledReason} ${scene.statusPanel.panel.irSelectedVsReportedText}`
                                : scene.statusPanel.panel.irSelectedVsReportedText,
                            )}
                          </p>
                        `
                      : ""
                  }
                </div>

                <div class="control-group">
                  <label class="group-label" for="ir-level-slider">
                    ${renderLabelWithIcon(
                      uiAssetBrowserUrls.icons.illuminator,
                      "IR level",
                      "IR Level",
                    )}
                  </label>
                  <div class="slider-row">
                    <input
                      id="ir-level-slider"
                      data-control="ir-level"
                      type="range"
                      min="0"
                      max="${Math.max(1, scene.statusPanel.panel.irMaxLevel)}"
                      step="1"
                      value="${Math.min(
                        scene.statusPanel.panel.irLevel,
                        Math.max(1, scene.statusPanel.panel.irMaxLevel),
                      )}"
                      ${
                        scene.statusPanel.panel.irControlAvailable &&
                        scene.statusPanel.panel.irMaxLevel > 0
                          ? ""
                          : "disabled"
                      }
                    />
                    <span>${escapeHtml(
                      scene.statusPanel.panel.irMaxLevel > 0
                        ? `${scene.statusPanel.panel.irLevel}/${scene.statusPanel.panel.irMaxLevel}`
                        : String(scene.statusPanel.panel.irLevel),
                    )}</span>
                  </div>
                </div>

                ${renderPlaceholderSectionHeading(
                  uiAssetBrowserUrls.placeholderAudioIcons.hearingAmp,
                  "hear",
                  "Hearing & Media",
                )}
                <div class="control-group">
                  <label class="group-label" for="hearing-mode-select">
                    ${renderLabelWithPlaceholderIcon(
                      uiAssetBrowserUrls.placeholderAudioIcons.voiceFocus,
                      "mode",
                      "Hearing Enhancement Mode",
                    )}
                  </label>
                  <select
                    id="hearing-mode-select"
                    data-control="hearing-mode"
                    ${scene.statusPanel.panel.hearingControlAvailable ? "" : "disabled"}
                  >
                    ${scene.statusPanel.panel.hearingModeOptions
                      .map(
                        (mode) => `
                          <option
                            value="${escapeHtml(mode)}"
                            ${
                              scene.statusPanel.panel.selectedHearingMode === mode
                                ? "selected"
                                : ""
                            }
                          >
                            ${escapeHtml(mode)}
                          </option>
                        `,
                      )
                      .join("")}
                  </select>
                  <p class="control-note">
                    ${escapeHtml(
                      scene.statusPanel.panel.hearingControlAvailable
                        ? `Reported ${scene.statusPanel.panel.hearingModeText} @ ${scene.statusPanel.panel.hearingGainText}.`
                        : scene.statusPanel.panel.hearingControlDisabledReason ??
                            "Hearing controls unavailable.",
                    )}
                  </p>
                </div>

                <div class="control-group">
                  <label class="group-label" for="hearing-gain-slider">
                    ${renderLabelWithPlaceholderIcon(
                      uiAssetBrowserUrls.placeholderAudioIcons.audioPassthrough,
                      "gain",
                      "Hearing Gain",
                    )}
                  </label>
                  <div class="slider-row">
                    <input
                      id="hearing-gain-slider"
                      data-control="hearing-gain"
                      type="range"
                      min="${scene.statusPanel.panel.hearingGainMin}"
                      max="${scene.statusPanel.panel.hearingGainMax}"
                      step="0.01"
                      value="${scene.statusPanel.panel.hearingGain.toFixed(2)}"
                      ${scene.statusPanel.panel.hearingControlAvailable ? "" : "disabled"}
                    />
                    <span>${Math.round(scene.statusPanel.panel.hearingGain * 100)}%</span>
                  </div>
                </div>

                <div class="control-group">
                  <label class="checkbox-row">
                    <input
                      data-control="media-muted"
                      type="checkbox"
                      ${scene.statusPanel.panel.mediaMuted ? "checked" : ""}
                      ${scene.statusPanel.panel.mediaControlAvailable ? "" : "disabled"}
                    />
                    ${renderLabelWithPlaceholderIcon(
                      uiAssetBrowserUrls.placeholderAudioIcons.musicPlayer,
                      "mute",
                      "Mute Phone / Media Audio",
                    )}
                  </label>
                  <p class="control-note">
                    ${escapeHtml(
                      scene.statusPanel.panel.mediaControlAvailable
                        ? `${scene.statusPanel.panel.phoneAudioAvailabilityText}. Bluetooth ${scene.statusPanel.panel.bluetoothAudioConnectionText.toLowerCase()}. Playback ${scene.statusPanel.panel.mediaPlaybackStateText}.`
                        : scene.statusPanel.panel.mediaControlDisabledReason ??
                            "Phone/media controls unavailable.",
                    )}
                  </p>
                </div>

                <div class="control-group">
                  <label class="group-label" for="media-volume-slider">
                    ${renderLabelWithPlaceholderIcon(
                      uiAssetBrowserUrls.placeholderAudioIcons.volume,
                      "vol",
                      "Media Volume",
                    )}
                  </label>
                  <div class="slider-row">
                    <input
                      id="media-volume-slider"
                      data-control="media-volume"
                      type="range"
                      min="${scene.statusPanel.panel.mediaVolumeMin}"
                      max="${scene.statusPanel.panel.mediaVolumeMax}"
                      step="0.01"
                      value="${scene.statusPanel.panel.mediaVolume.toFixed(2)}"
                      ${scene.statusPanel.panel.mediaControlAvailable ? "" : "disabled"}
                    />
                    <span>${Math.round(scene.statusPanel.panel.mediaVolume * 100)}%</span>
                  </div>
                </div>

                <div class="control-group">
                  <label class="group-label">Media Playback Controls</label>
                  <div class="toggle-row">
                    <button
                      class="button button--secondary"
                      type="button"
                      disabled
                      title="${escapeHtml(
                        scene.statusPanel.panel.mediaControlAvailable
                          ? "Media command routing reserved for future runtime integration."
                          : scene.statusPanel.panel.mediaControlDisabledReason ??
                              "Phone/media controls unavailable.",
                      )}"
                    >
                      ${renderPlaceholderIcon(
                        uiAssetBrowserUrls.placeholderAudioIcons.mediaPrev,
                        "prev",
                        "Previous",
                      )}
                    </button>
                    <button
                      class="button button--secondary"
                      type="button"
                      disabled
                      title="${escapeHtml(
                        scene.statusPanel.panel.mediaControlAvailable
                          ? "Media command routing reserved for future runtime integration."
                          : scene.statusPanel.panel.mediaControlDisabledReason ??
                              "Phone/media controls unavailable.",
                      )}"
                    >
                      ${renderPlaceholderIcon(
                        uiAssetBrowserUrls.placeholderAudioIcons.mediaPlay,
                        "play",
                        "Play",
                      )}
                    </button>
                    <button
                      class="button button--secondary"
                      type="button"
                      disabled
                      title="${escapeHtml(
                        scene.statusPanel.panel.mediaControlAvailable
                          ? "Media command routing reserved for future runtime integration."
                          : scene.statusPanel.panel.mediaControlDisabledReason ??
                              "Phone/media controls unavailable.",
                      )}"
                    >
                      ${renderPlaceholderIcon(
                        uiAssetBrowserUrls.placeholderAudioIcons.mediaPause,
                        "pause",
                        "Pause",
                      )}
                    </button>
                    <button
                      class="button button--secondary"
                      type="button"
                      disabled
                      title="${escapeHtml(
                        scene.statusPanel.panel.mediaControlAvailable
                          ? "Media command routing reserved for future runtime integration."
                          : scene.statusPanel.panel.mediaControlDisabledReason ??
                              "Phone/media controls unavailable.",
                      )}"
                    >
                      ${renderPlaceholderIcon(
                        uiAssetBrowserUrls.placeholderAudioIcons.mediaNext,
                        "next",
                        "Next",
                      )}
                    </button>
                  </div>
                </div>

                <ul class="detail-list">
                  ${scene.statusPanel.panel.lines
                    .map((line) => `<li>${escapeHtml(line)}</li>`)
                    .join("")}
                </ul>

                ${
                  this.pendingActionText
                    ? `<p class="pending-text">${escapeHtml(this.pendingActionText)}</p>`
                    : ""
                }
              </div>
            </section>

            <section class="card">
              <div class="card__header">
                <div>
                  <h2>Diagnostics</h2>
                  <p>Live diagnostics model backed by runtime and viewer updates.</p>
                </div>
              </div>
              <div class="diagnostics-panel">
                <div class="status-row">
                  <span>App running</span>
                  <strong>${diagnostics.appRunning ? "Yes" : "No"}</strong>
                </div>
                <div class="status-row">
                  <span>Source mode</span>
                  <strong>${escapeHtml(diagnostics.sourceMode)}</strong>
                </div>
                <div class="status-row">
                  <span>Source health</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceHealthText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Connection</span>
                  <strong>${escapeHtml(diagnostics.connectionStatusText)}</strong>
                </div>
                <div class="status-row">
                  <span>Source lifecycle</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceLifecycleText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Source link</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceConnectionStatusText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Last frame</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceLastFrameText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Last frame time</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceLastFrameTimestampText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Scene ID</span>
                  <strong title="${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceSceneIdText,
                  )}">${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceSceneIdText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Stream name</span>
                  <strong title="${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceStreamNameText,
                  )}">${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceStreamNameText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Source status</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.sourceStatusText ?? "Pending",
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Thermal available</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.thermalTelemetry.thermalAvailableText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Thermal backend</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.thermalTelemetry.thermalBackendText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Thermal mode</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.thermalTelemetry.thermalOverlayModeText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Thermal health</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.thermalTelemetry.thermalHealthStateText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>IR available</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.irIlluminatorTelemetry.irAvailableText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>IR enabled</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.irIlluminatorTelemetry.irEnabledText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>IR level</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.irIlluminatorTelemetry.irLevelText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Hearing enhancement</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.hearingEnhancementTelemetry.hearingAvailableText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Hearing mode</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.hearingEnhancementTelemetry.hearingModeText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Hearing gain</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.hearingEnhancementTelemetry.hearingGainText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Phone audio</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.phoneMediaAudioTelemetry.phoneAudioAvailableText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Bluetooth audio</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.phoneMediaAudioTelemetry.bluetoothAudioConnectedText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Media playback</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.phoneMediaAudioTelemetry.mediaPlaybackStateText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Transport connection</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportConnectionText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Transport status</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportStatusText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Transport adapter</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportAdapterText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>WebSocket URL</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportWebSocketUrlText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Transport host</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportHostText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Sender name</span>
                  <strong title="${escapeHtml(
                    scene.diagnosticsPanel.panel.senderNameText,
                  )}">${escapeHtml(
                    scene.diagnosticsPanel.panel.senderNameText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Transport reconnect</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportReconnectText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Sender capabilities</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportCapabilitiesText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Image modes</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportImageModesText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Last message type</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportLastMessageTypeText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Last sequence</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportLastSequenceText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Last message time</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportLastMessageTimestampText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Sequence health</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportSequenceHealthText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Last message size</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportLastMessageSizeText,
                  )}</strong>
                </div>
                <div class="status-row">
                  <span>Payload limits</span>
                  <strong>${escapeHtml(
                    scene.diagnosticsPanel.panel.transportPayloadLimitsText,
                  )}</strong>
                </div>
                ${
                  scene.diagnosticsPanel.panel.transportStereoFormatNoteText
                    ? `
                      <div class="status-row">
                        <span>Stereo note</span>
                        <strong>${escapeHtml(
                          scene.diagnosticsPanel.panel.transportStereoFormatNoteText,
                        )}</strong>
                      </div>
                    `
                    : ""
                }
                ${renderCameraTelemetryRows(scene.diagnosticsPanel.panel.cameraTelemetry)}
                ${renderThermalTelemetryRows(
                  scene.diagnosticsPanel.panel.thermalTelemetry,
                )}
                ${renderIrIlluminatorTelemetryRows(
                  scene.diagnosticsPanel.panel.irIlluminatorTelemetry,
                )}
                ${
                  scene.diagnosticsPanel.panel.transportErrorText
                    ? `
                      <div class="status-row status-row--error">
                        <span>Transport error</span>
                        <strong>${escapeHtml(
                          scene.diagnosticsPanel.panel.transportErrorText,
                        )}</strong>
                      </div>
                    `
                    : ""
                }
                ${
                  scene.diagnosticsPanel.panel.transportParseErrorText
                    ? `
                      <div class="status-row status-row--error">
                        <span>Protocol parse/validation error</span>
                        <strong>${escapeHtml(
                          scene.diagnosticsPanel.panel.transportParseErrorText,
                        )}</strong>
                      </div>
                    `
                    : ""
                }
                ${
                  scene.diagnosticsPanel.panel.sourceErrorText
                    ? `
                      <div class="status-row status-row--error">
                        <span>Source error</span>
                        <strong>${escapeHtml(
                          scene.diagnosticsPanel.panel.sourceErrorText,
                        )}</strong>
                      </div>
                    `
                    : ""
                }
                <div class="status-row">
                  <span>Render status</span>
                  <strong>${escapeHtml(diagnostics.renderStatusText)}</strong>
                </div>
                <div class="status-row">
                  <span>FPS</span>
                  <strong>${formatFps(diagnostics)}</strong>
                </div>
                ${renderReticlePreview()}
                <ul class="detail-list">
                  ${scene.diagnosticsPanel.panel.lines
                    .map((line) => `<li>${escapeHtml(line)}</li>`)
                    .join("")}
                </ul>
              </div>
            </section>
          </section>
        </main>
      </div>
    `;

    this.bindControls();
  }

  private bindControls(): void {
    const sourceInputs = this.root.querySelectorAll<HTMLInputElement>(
      "input[data-control='source-mode']",
    );
    for (const input of sourceInputs) {
      input.addEventListener("change", () => {
        this.playUiInteractionSound();
        const mode = input.value as SourceMode;
        void this.runPendingAction(`Switching source mode to ${mode}...`, async () => {
          await this.app.ui.statusPanel.setSourceMode(mode);
        });
      });
    }

    const adapterInputs = this.root.querySelectorAll<HTMLInputElement>(
      "input[data-control='transport-adapter']",
    );
    for (const input of adapterInputs) {
      input.addEventListener("change", () => {
        this.playUiInteractionSound();
        const type = input.value as LiveTransportAdapterType;
        void this.runPendingAction(`Switching live adapter to ${type}...`, async () => {
          await this.app.ui.statusPanel.setLiveTransportAdapterType(type);
        });
      });
    }

    const brightnessInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='brightness']",
    );
    brightnessInput?.addEventListener("pointerdown", () => {
      this.playUiInteractionSound();
    });
    brightnessInput?.addEventListener("input", () => {
      const value = Number(brightnessInput.value);
      this.app.ui.statusPanel.setBrightness(value);
    });

    const overlayInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='overlay']",
    );
    overlayInput?.addEventListener("change", () => {
      this.playUiInteractionSound();
      const nextValue = overlayInput.checked;
      const currentValue = this.app.settingsStore.getSnapshot().overlayEnabled;
      if (nextValue !== currentValue) {
        this.app.ui.statusPanel.toggleOverlayEnabled();
      }
    });

    const thermalOverlayModeSelect = this.root.querySelector<HTMLSelectElement>(
      "select[data-control='thermal-overlay-mode']",
    );
    thermalOverlayModeSelect?.addEventListener("change", () => {
      this.playUiInteractionSound();
      this.app.ui.statusPanel.setThermalOverlayMode(
        thermalOverlayModeSelect.value as ThermalOverlayMode,
      );
    });

    const irEnabledInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='ir-enabled']",
    );
    irEnabledInput?.addEventListener("change", () => {
      this.playUiInteractionSound();
      this.app.ui.statusPanel.toggleIrEnabled();
    });

    const irLevelInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='ir-level']",
    );
    irLevelInput?.addEventListener("pointerdown", () => {
      this.playUiInteractionSound();
    });
    irLevelInput?.addEventListener("input", () => {
      this.app.ui.statusPanel.setIrLevel(Number(irLevelInput.value));
    });

    const hearingModeSelect = this.root.querySelector<HTMLSelectElement>(
      "select[data-control='hearing-mode']",
    );
    hearingModeSelect?.addEventListener("change", () => {
      this.playUiInteractionSound();
      this.app.ui.statusPanel.setHearingMode(
        hearingModeSelect.value as HearingEnhancementMode,
      );
    });

    const hearingGainInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='hearing-gain']",
    );
    hearingGainInput?.addEventListener("pointerdown", () => {
      this.playUiInteractionSound();
    });
    hearingGainInput?.addEventListener("input", () => {
      this.app.ui.statusPanel.setHearingGain(Number(hearingGainInput.value));
    });

    const mediaMutedInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='media-muted']",
    );
    mediaMutedInput?.addEventListener("change", () => {
      this.playUiInteractionSound();
      this.app.ui.statusPanel.toggleMediaMuted();
    });

    const mediaVolumeInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='media-volume']",
    );
    mediaVolumeInput?.addEventListener("pointerdown", () => {
      this.playUiInteractionSound();
    });
    mediaVolumeInput?.addEventListener("input", () => {
      this.app.ui.statusPanel.setMediaVolume(Number(mediaVolumeInput.value));
    });

    const uiAudioEnabledInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='ui-audio-enabled']",
    );
    uiAudioEnabledInput?.addEventListener("change", () => {
      this.app.ui.statusPanel.setUiAudioEnabled(uiAudioEnabledInput.checked);
      this.playUiInteractionSound();
    });

    const uiClickVolumeInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='ui-click-volume']",
    );
    uiClickVolumeInput?.addEventListener("pointerdown", () => {
      this.playUiInteractionSound();
    });
    uiClickVolumeInput?.addEventListener("input", () => {
      this.app.ui.statusPanel.setUiClickVolume(Number(uiClickVolumeInput.value));
    });

    const uiBootVolumeInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='ui-boot-volume']",
    );
    uiBootVolumeInput?.addEventListener("pointerdown", () => {
      this.playUiInteractionSound();
    });
    uiBootVolumeInput?.addEventListener("input", () => {
      this.app.ui.statusPanel.setUiBootVolume(Number(uiBootVolumeInput.value));
    });

    const connectionButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='connection']",
    );
    connectionButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      const buttonLabel = this.app.ui.statusPanel.getSnapshot().connectButtonLabel;
      void this.runPendingAction(`${buttonLabel}...`, async () => {
        await this.app.ui.statusPanel.pressConnectionButton();
      });
    });

    const transportHostInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='transport-host']",
    );
    transportHostInput?.addEventListener("input", () => {
      this.app.ui.statusPanel.updateTransportConfig({
        host: transportHostInput.value,
      });
    });

    const transportPortInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='transport-port']",
    );
    transportPortInput?.addEventListener("input", () => {
      this.app.ui.statusPanel.updateTransportConfig({
        port: Number(transportPortInput.value),
      });
    });

    const transportPathInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='transport-path']",
    );
    transportPathInput?.addEventListener("input", () => {
      this.app.ui.statusPanel.updateTransportConfig({
        path: transportPathInput.value,
      });
    });

    const transportReconnectInput = this.root.querySelector<HTMLInputElement>(
      "input[data-control='transport-reconnect']",
    );
    transportReconnectInput?.addEventListener("change", () => {
      this.playUiInteractionSound();
      this.app.ui.statusPanel.updateTransportConfig({
        reconnectEnabled: transportReconnectInput.checked,
      });
    });

    const applyTransportConfigButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='apply-transport-config']",
    );
    applyTransportConfigButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      void this.runPendingAction("Applying transport config...", async () => {
        await this.app.ui.statusPanel.applyTransportConfig();
      });
    });

    const liveDemoButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='live-demo']",
    );
    liveDemoButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      const label = this.app.ui.statusPanel.getSnapshot().liveTransportDemoFeedActive
        ? "Stopping live demo feed..."
        : "Starting live demo feed...";

      void this.runPendingAction(label, async () => {
        await this.app.ui.statusPanel.toggleLiveTransportDemoFeed();
      });
    });

    const connectLiveTransportButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='connect-live-transport']",
    );
    connectLiveTransportButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      void this.runPendingAction("Connecting WebSocket transport...", async () => {
        await this.app.ui.statusPanel.connectLiveTransport();
      });
    });

    const disconnectLiveTransportButton =
      this.root.querySelector<HTMLButtonElement>(
        "button[data-action='disconnect-live-transport']",
      );
    disconnectLiveTransportButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      void this.runPendingAction("Disconnecting WebSocket transport...", async () => {
        await this.app.ui.statusPanel.disconnectLiveTransport();
      });
    });

    const jetsonSampleButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='jetson-sample']",
    );
    jetsonSampleButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      void this.runPendingAction("Injecting sample Jetson payload...", async () => {
        await this.app.ui.statusPanel.injectLiveTransportSamplePayload();
      });
    });

    const jetsonProfileButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='apply-jetson-profile']",
    );
    jetsonProfileButton?.addEventListener("click", () => {
      const jetsonProfileSelect = this.root.querySelector<HTMLSelectElement>(
        "select[data-control='jetson-profile']",
      );
      const selectedProfileName = jetsonProfileSelect?.value?.trim();
      if (!selectedProfileName) {
        return;
      }

      this.playUiInteractionSound();
      void this.runPendingAction(
        `Applying Jetson profile ${selectedProfileName}...`,
        async () => {
          await this.app.ui.statusPanel.selectJetsonProfile(selectedProfileName);
        },
      );
    });

    const jetsonPreflightButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='jetson-run-preflight']",
    );
    jetsonPreflightButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      void this.runPendingAction("Running Jetson preflight...", async () => {
        await this.app.ui.statusPanel.runJetsonPreflight();
      });
    });

    const jetsonRefreshButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='jetson-refresh-runtime']",
    );
    jetsonRefreshButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      void this.runPendingAction("Refreshing Jetson runtime...", async () => {
        await this.app.ui.statusPanel.refreshJetsonEffectiveConfig();
      });
    });

    const jetsonSnapshotButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='jetson-capture-snapshot']",
    );
    jetsonSnapshotButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      void this.runPendingAction("Capturing Jetson snapshot...", async () => {
        await this.app.ui.statusPanel.captureJetsonSnapshot();
      });
    });

    const jetsonRecordingButton = this.root.querySelector<HTMLButtonElement>(
      "button[data-action='jetson-toggle-recording']",
    );
    jetsonRecordingButton?.addEventListener("click", () => {
      this.playUiInteractionSound();
      const recordingActive = this.app.ui.statusPanel.getSnapshot().jetsonRecordingActive;
      void this.runPendingAction(
        recordingActive ? "Stopping Jetson recording..." : "Starting Jetson recording...",
        async () => {
          if (recordingActive) {
            await this.app.ui.statusPanel.stopJetsonRecording();
            return;
          }

          await this.app.ui.statusPanel.startJetsonRecording();
        },
      );
    });

    const handMenuItems = this.root.querySelectorAll<HTMLButtonElement>(
      "button[data-hand-menu-item]",
    );
    for (const itemButton of handMenuItems) {
      const itemId = itemButton.dataset.handMenuItem as HandMenuItemId | undefined;
      if (!itemId) {
        continue;
      }

      itemButton.addEventListener("mouseenter", () => {
        this.app.ui.handMenu.setHighlightedItem(itemId);
      });
      itemButton.addEventListener("focus", () => {
        this.app.ui.handMenu.setHighlightedItem(itemId);
      });
      itemButton.addEventListener("mouseleave", () => {
        this.app.ui.handMenu.clearHighlight();
      });
      itemButton.addEventListener("blur", () => {
        this.app.ui.handMenu.clearHighlight();
      });
      itemButton.addEventListener("click", () => {
        this.playUiInteractionSound();
        this.app.ui.handMenu.selectItem(itemId);
      });
    }
  }

  private playUiInteractionSound(): void {
    const bootResumedFromDeferredState = this.uiAudio.resumeDeferredBootSound();
    if (!bootResumedFromDeferredState) {
      this.uiAudio.playUiClick();
    }
  }

  private async runPendingAction(
    message: string,
    action: () => Promise<void>,
  ): Promise<void> {
    this.pendingActionText = message;
    this.render();

    try {
      await action();
    } finally {
      this.pendingActionText = undefined;
      this.render();
    }
  }
}

/**
 * Mounts the local browser-based renderer.
 */
export function mountDomRenderer(options: DomRendererOptions): DomRendererAdapter {
  return new DomRendererAdapter(options);
}

function renderSourceModeOption(mode: SourceMode, currentMode: SourceMode): string {
  const label = mode === "mock" ? "Mock" : "Live";
  return `
    <label class="mode-option">
      <input
        data-control="source-mode"
        type="radio"
        name="source-mode"
        value="${mode}"
        ${currentMode === mode ? "checked" : ""}
      />
      <span>${label}</span>
    </label>
  `;
}

function renderTransportAdapterOption(
  type: LiveTransportAdapterType,
  currentType: LiveTransportAdapterType,
): string {
  const label = type === "dev" ? "Development" : "Jetson Stub";
  return `
    <label class="mode-option">
      <input
        data-control="transport-adapter"
        type="radio"
        name="transport-adapter"
        value="${type}"
        ${currentType === type ? "checked" : ""}
      />
      <span>${label}</span>
    </label>
  `;
}

function renderThemeVariables(): string {
  return [
    `--nevex-accent-blue: ${NEVEX_UI_TOKENS.color.accentBlue}`,
    `--nevex-accent-blue-strong: ${NEVEX_UI_TOKENS.color.accentBlueStrong}`,
    `--nevex-accent-blue-muted: ${NEVEX_UI_TOKENS.color.accentBlueMuted}`,
    `--nevex-bg-dark: ${NEVEX_UI_TOKENS.color.backgroundDark}`,
    `--nevex-bg-deep: ${NEVEX_UI_TOKENS.color.backgroundDeep}`,
    `--nevex-panel-bg: ${NEVEX_UI_TOKENS.color.panelBackground}`,
    `--nevex-text-primary: ${NEVEX_UI_TOKENS.color.textPrimary}`,
    `--nevex-text-secondary: ${NEVEX_UI_TOKENS.color.textSecondary}`,
    `--nevex-text-silver: ${NEVEX_UI_TOKENS.color.textSilver}`,
    `--nevex-border-color: ${NEVEX_UI_TOKENS.color.border}`,
    `--nevex-border-strong: ${NEVEX_UI_TOKENS.color.borderStrong}`,
    `--nevex-silver-glow: ${NEVEX_UI_TOKENS.color.silverGlow}`,
    `--nevex-danger: ${NEVEX_UI_TOKENS.color.danger}`,
    `--nevex-glow-soft: ${NEVEX_UI_TOKENS.glow.soft}`,
    `--nevex-glow-medium: ${NEVEX_UI_TOKENS.glow.medium}`,
  ].join("; ");
}

function renderFloatingHandMenu(
  handMenu: HandMenuSnapshot,
  splashVisible: boolean,
): string {
  if (!handMenu.visible || splashVisible) {
    return "";
  }

  return `
    <aside class="hand-menu hand-menu--${handMenu.open ? "open" : "closed"}">
      <div class="hand-menu__anchor ${handMenu.open ? "hand-menu__anchor--open" : ""}">
        <span class="hand-menu__anchor-dot"></span>
        <div>
          <p class="hand-menu__anchor-title">Left Hand Menu</p>
          <p class="hand-menu__anchor-subtitle">${escapeHtml(
            handMenu.interactionHintText,
          )}</p>
        </div>
      </div>
      <div class="hand-menu__stack">
        <div class="hand-menu__panel">
          <div class="hand-menu__header">
            <div>
              <p class="hand-menu__eyebrow">Future left-hand pinch</p>
              <h3 class="hand-menu__title hand-menu__title-with-icon">
                ${renderInlineIcon(
                  uiAssetBrowserUrls.productionIcons.settings.quickSettings,
                  "Quick controls",
                )}
                <span>Quick Controls</span>
              </h3>
            </div>
            <span class="chip chip--active">${escapeHtml(
              handMenu.previewMode === "idle_preview" ? "Idle Preview" : "Gesture Ready",
            )}</span>
          </div>
          <div class="hand-menu__primary-grid">
            ${handMenu.primaryItems
              .map((item) =>
                renderHandMenuItem(item, {
                  compact: false,
                  highlighted: handMenu.highlightedItemId === item.id,
                  selected: handMenu.selectedPrimaryItemId === item.id,
                }),
              )
              .join("")}
          </div>
          ${renderHandMenuCommandPanel(handMenu.commandPanel)}
          ${renderHandMenuSupportSection(handMenu)}
          <div class="hand-menu__footer">
            <p class="hand-menu__footer-title">${escapeHtml(handMenu.guidanceText)}</p>
            <p class="hand-menu__footer-text">
              Opens from a future left thumb/index pinch. Selection hook is ready for either-hand pinch.
            </p>
            <p class="hand-menu__runtime-text">${escapeHtml(
              handMenu.runtimeInput.statusText,
            )}</p>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function renderHandMenuItem(
  item: HandMenuItemDefinition,
  state: {
    readonly compact: boolean;
    readonly highlighted: boolean;
    readonly selected: boolean;
  },
): string {
  return `
    <button
      class="hand-menu__item ${
        state.compact ? "hand-menu__item--compact" : "hand-menu__item--primary"
      } ${state.highlighted ? "hand-menu__item--highlighted" : ""} ${
        state.selected ? "hand-menu__item--selected" : ""
      }"
      data-hand-menu-item="${item.id}"
      type="button"
    >
      <span class="hand-menu__item-icon-shell">
        <img
          class="hand-menu__item-icon"
          src="${escapeHtml(resolveHandMenuItemIconUrl(item.id))}"
          alt="${escapeHtml(item.label)}"
        />
      </span>
      <span class="hand-menu__item-label">${escapeHtml(item.label)}</span>
    </button>
  `;
}

function renderHandMenuCommandPanel(commandPanel: HandMenuSnapshot["commandPanel"]): string {
  if (!commandPanel.visible) {
    return "";
  }

  return `
    <section class="hand-menu__command-panel ${
      commandPanel.route ? "hand-menu__command-panel--active" : ""
    }">
      <div class="hand-menu__section-header">
        <div>
          <p class="hand-menu__section-eyebrow">Primary route</p>
          <h4 class="hand-menu__section-title">${escapeHtml(commandPanel.title)}</h4>
        </div>
        <span class="chip ${commandPanel.route ? "chip--active" : ""}">${escapeHtml(
          commandPanel.actionLabel,
        )}</span>
      </div>
      <p class="hand-menu__panel-status">${escapeHtml(commandPanel.statusText)}</p>
      <p class="hand-menu__panel-body">${escapeHtml(commandPanel.bodyText)}</p>
    </section>
  `;
}

function renderHandMenuSupportSection(handMenu: HandMenuSnapshot): string {
  return `
    <section class="hand-menu__support">
      <div class="hand-menu__section-header">
        <div>
          <p class="hand-menu__section-eyebrow">Support</p>
          <h4 class="hand-menu__section-title">Secondary shortcuts</h4>
        </div>
        <span class="chip">${escapeHtml(handMenu.supportPanel.statusText)}</span>
      </div>
      <div class="hand-menu__secondary-row">
        ${handMenu.secondaryItems
          .map((item) =>
            renderHandMenuItem(item, {
              compact: true,
              highlighted: handMenu.highlightedItemId === item.id,
              selected: handMenu.selectedSecondaryItemId === item.id,
            }),
          )
          .join("")}
      </div>
      <div class="hand-menu__support-panel">
        <p class="hand-menu__panel-status">${escapeHtml(handMenu.supportPanel.title)}</p>
        <p class="hand-menu__panel-body">${escapeHtml(handMenu.supportPanel.detailText)}</p>
      </div>
    </section>
  `;
}

function renderNoFeedOverlay(noFeed: {
  readonly visible: boolean;
  readonly title: string;
  readonly statusText: string;
  readonly guidanceText: string;
  readonly detailText: string;
  readonly handMenuReadyText: string;
  readonly withHandMenu: boolean;
  readonly availabilityLabels: readonly string[];
}): string {
  if (!noFeed.visible) {
    return "";
  }

  return `
    <section class="viewer-no-feed ${noFeed.withHandMenu ? "viewer-no-feed--with-menu" : ""}">
      <img
        class="viewer-no-feed__logo"
        src="${escapeHtml(uiAssetBrowserUrls.logos.dark)}"
        alt="NEVEX logo"
      />
      <p class="viewer-no-feed__eyebrow">${escapeHtml(noFeed.statusText)}</p>
      <h2 class="viewer-no-feed__title">${escapeHtml(noFeed.title)}</h2>
      <p class="viewer-no-feed__guidance">${escapeHtml(noFeed.guidanceText)}</p>
      <p class="viewer-no-feed__detail">${escapeHtml(noFeed.detailText)}</p>
      <p class="viewer-no-feed__detail">${escapeHtml(noFeed.handMenuReadyText)}</p>
      <div class="viewer-no-feed__availability">
        ${noFeed.availabilityLabels
          .map((label) => `<span class="chip">${escapeHtml(label)}</span>`)
          .join("")}
      </div>
    </section>
  `;
}

function createNoFeedPresentation(options: {
  readonly sourceMode: SourceMode;
  readonly connectionStatusText: string;
  readonly transportStatusText: string;
  readonly adapterDisplayName: string;
  readonly hasEyeImages: boolean;
  readonly splashVisible: boolean;
  readonly handMenuOpen: boolean;
}): {
  readonly visible: boolean;
  readonly title: string;
  readonly statusText: string;
  readonly guidanceText: string;
  readonly detailText: string;
  readonly handMenuReadyText: string;
  readonly withHandMenu: boolean;
  readonly availabilityLabels: readonly string[];
} {
  const visible =
    !options.splashVisible &&
    options.sourceMode === "live" &&
    !options.hasEyeImages;

  return {
    visible,
    title: "NO LIVE FEED",
    statusText:
      options.connectionStatusText === "Connected" ? "Awaiting source frames" : "Jetson offline",
    guidanceText: "Turn on device or connect source",
    detailText: `Active adapter: ${options.adapterDisplayName} · ${options.transportStatusText}`,
    handMenuReadyText: options.handMenuOpen
      ? "Left-hand quick menu scaffold is visible and ready for future XR runtime pinch input."
      : "Left-hand quick menu scaffold remains available for future XR runtime pinch input.",
    withHandMenu: options.handMenuOpen,
    availabilityLabels: ["Mock", "Demo", "Replay", "Simulated"],
  };
}

function resolveHandMenuItemIconUrl(itemId: HandMenuItemId): string {
  return HAND_MENU_ICON_URLS[itemId];
}

function renderSplashOverlay(splash: {
  readonly visible: boolean;
  readonly variant: "hero" | "forest" | "space";
  readonly brandName: string;
  readonly productLine: string;
  readonly statusText: string;
  readonly detailText: string;
}): string {
  if (!splash.visible) {
    return "";
  }

  const splashImageUrl = uiAssetBrowserUrls.splash[splash.variant];

  return `
    <div
      class="viewer-splash"
      style="background-image: url('${escapeHtml(splashImageUrl)}');"
    >
      <div class="viewer-splash__scrim"></div>
      <div class="viewer-splash__content">
        <img
          class="viewer-splash__logo"
          src="${escapeHtml(uiAssetBrowserUrls.logos.primary)}"
          alt="NEVEX logo"
        />
        <p class="viewer-splash__eyebrow">${escapeHtml(splash.productLine)}</p>
        <h2 class="viewer-splash__title">${escapeHtml(splash.brandName)}</h2>
        <p class="viewer-splash__status">${escapeHtml(splash.statusText)}</p>
        <p class="viewer-splash__detail">${escapeHtml(splash.detailText)}</p>
        <div class="viewer-splash__variants">
          ${SUPPORTED_SPLASH_VARIANTS.map((variant) =>
            renderSplashVariantPill(variant, variant === splash.variant),
          ).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderSplashVariantPill(
  variant: "hero" | "forest" | "space",
  active: boolean,
): string {
  return `
    <span class="chip ${active ? "chip--active" : ""}">
      Splash ${escapeHtml(variant)}
    </span>
  `;
}

function renderInlineIcon(iconUrl: string, altText: string): string {
  return `
    <img
      class="status-label__icon"
      src="${escapeHtml(iconUrl)}"
      alt="${escapeHtml(altText)}"
    />
  `;
}

function renderLabelWithIcon(
  iconUrl: string,
  altText: string,
  text: string,
): string {
  return `
    <span class="status-label">
      ${renderInlineIcon(iconUrl, altText)}
      <span>${escapeHtml(text)}</span>
    </span>
  `;
}

function renderPlaceholderIcon(
  placeholderPath: string,
  fallbackText: string,
  labelText: string,
): string {
  return `
    <span
      class="status-label__icon status-label__icon--placeholder"
      data-placeholder-icon="${escapeHtml(placeholderPath)}"
      title="${escapeHtml(`${labelText} placeholder: ${placeholderPath}`)}"
      aria-hidden="true"
      style="display:inline-flex;align-items:center;justify-content:center;min-width:1.5rem;height:1.5rem;padding:0 0.35rem;border:1px solid rgba(143,211,255,0.32);border-radius:999px;background:rgba(6,14,28,0.85);color:#dff5ff;font-size:0.6rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;"
    >
      ${escapeHtml(fallbackText)}
    </span>
  `;
}

function renderLabelWithPlaceholderIcon(
  placeholderPath: string,
  fallbackText: string,
  text: string,
): string {
  return `
    <span class="status-label">
      ${renderPlaceholderIcon(placeholderPath, fallbackText, text)}
      <span>${escapeHtml(text)}</span>
    </span>
  `;
}

function renderSectionHeading(
  iconUrl: string,
  altText: string,
  text: string,
): string {
  return `
    <div class="control-section-heading">
      ${renderInlineIcon(iconUrl, altText)}
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderPlaceholderSectionHeading(
  placeholderPath: string,
  fallbackText: string,
  text: string,
): string {
  return `
    <div class="control-section-heading">
      ${renderPlaceholderIcon(placeholderPath, fallbackText, text)}
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderReticlePreview(): string {
  return `
    <section class="asset-preview">
      <div class="asset-preview__header">
        <div>
          <h3 class="asset-preview__title">Reticle Preview</h3>
          <p class="asset-preview__subtitle">Presentation-only reference for imported overlays.</p>
        </div>
      </div>
      <div class="reticle-preview-grid">
        ${renderReticlePreviewCard(
          "Primary Reticle",
          uiAssetBrowserUrls.overlays.primaryReticle,
        )}
        ${renderReticlePreviewCard(
          "Tracking Reticle",
          uiAssetBrowserUrls.overlays.trackingReticle,
        )}
      </div>
    </section>
  `;
}

function renderReticlePreviewCard(label: string, imageUrl: string): string {
  return `
    <article class="reticle-preview-card">
      <div
        class="reticle-preview-card__image"
        style="background-image: url('${escapeHtml(imageUrl)}');"
      ></div>
      <p class="reticle-preview-card__label">${escapeHtml(label)}</p>
    </article>
  `;
}

function renderEyePanel(
  eyePresentation: ViewerEyePresentation,
  presentation: ViewerPresentationModel,
  fallbackLabel: string,
): string {
  const title = eyePresentation.label || fallbackLabel;
  const backgroundHex = eyePresentation.backgroundHex;
  const accentHex = eyePresentation.accentHex;
  const markerText = eyePresentation.markerText;
  const brightness = 0.5 + presentation.brightness * 1.35;
  const overlayLabel = presentation.overlay?.label ?? "Overlay";
  const hasImage = Boolean(eyePresentation.imageSrc);

  return `
    <article
      class="eye-panel"
      style="--eye-background: ${backgroundHex}; --eye-accent: ${accentHex}; --eye-brightness: ${brightness};"
    >
      <div class="eye-panel__header">
        <span>${escapeHtml(title)}</span>
        <span>${escapeHtml(markerText)}</span>
      </div>
      <div class="eye-panel__body">
        ${
          hasImage
            ? `
              <div
                class="eye-panel__image"
                style="background-image: url('${escapeHtml(eyePresentation.imageSrc ?? "")}');"
              ></div>
            `
            : ""
        }
        ${renderThermalOverlay(presentation)}
        <div class="eye-panel__grid"></div>
        <div class="eye-panel__content ${hasImage ? "eye-panel__content--image" : ""}">
          <p class="eye-panel__title">${escapeHtml(eyePresentation.title)}</p>
          <p class="eye-panel__marker">${escapeHtml(markerText)}</p>
          <p class="eye-panel__meta">${eyePresentation.width} x ${eyePresentation.height} · ${escapeHtml(
            eyePresentation.format,
          )}</p>
          ${
            hasImage
              ? `<p class="eye-panel__meta">Image source: ${escapeHtml(
                  eyePresentation.imageSourceKind ?? "unknown",
                )}</p>`
              : ""
          }
        </div>
        ${
          presentation.overlayEnabled
            ? `
              <div class="eye-panel__overlay">
                <span class="overlay-tag">${escapeHtml(overlayLabel)}</span>
                <div class="overlay-crosshair"></div>
              </div>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function renderThermalOverlay(presentation: ViewerPresentationModel): string {
  if (!presentation.thermalOverlayVisible || !presentation.thermalFrame) {
    return "";
  }

  const modeClass = presentation.thermalOverlayMode.replace(/_/g, "-");
  const hotspots = presentation.thermalFrame.hotspotAnnotations ?? [];
  const hotspotMarkup = hotspots
    .map((hotspot) => {
      const radius = hotspot.normalizedRadius ?? 0.08;
      const intensity = hotspot.intensityNormalized ?? 0.9;
      const boxWidth = hotspot.normalizedBoxWidth ?? radius * 2.4;
      const boxHeight = hotspot.normalizedBoxHeight ?? radius * 2.4;

      return `
        <div
          class="thermal-overlay__hotspot"
          style="left:${(hotspot.normalizedX * 100).toFixed(2)}%; top:${(
            hotspot.normalizedY * 100
          ).toFixed(2)}%; --thermal-radius:${(radius * 100).toFixed(
            2,
          )}%; --thermal-intensity:${intensity.toFixed(2)};"
        ></div>
        ${
          presentation.thermalOverlayMode === "hot_target_boxes_optional"
            ? `
              <div
                class="thermal-overlay__box"
                style="left:${(hotspot.normalizedX * 100).toFixed(2)}%; top:${(
                  hotspot.normalizedY * 100
                ).toFixed(2)}%; width:${(boxWidth * 100).toFixed(
                  2,
                )}%; height:${(boxHeight * 100).toFixed(2)}%;"
              ></div>
            `
            : ""
        }
      `;
    })
    .join("");

  return `
    <div class="eye-panel__thermal eye-panel__thermal--${escapeHtml(modeClass)}">
      <div class="thermal-overlay__wash"></div>
      ${hotspotMarkup}
    </div>
  `;
}

function formatFps(diagnostics: DiagnosticsSnapshot): string {
  return diagnostics.fpsEstimate > 0
    ? `${diagnostics.fpsEstimate.toFixed(2)} FPS`
    : "FPS pending";
}

function renderHealthBadge(
  label: string,
  tone:
    | "pending"
    | "healthy"
    | "retrying"
    | "degraded"
    | "terminal_failure"
    | "telemetry_stale",
): string {
  const cssTone = toHealthToneClass(tone);

  return `<span class="status-pill status-pill--${cssTone}">${escapeHtml(label)}</span>`;
}

function renderRuntimeOperationBadge(panel: {
  readonly runtimeOperationText: string;
  readonly runtimeSourceModeText: string;
  readonly fallbackActive: boolean;
}): string {
  if (panel.fallbackActive) {
    return renderHealthBadge(panel.runtimeOperationText, "degraded");
  }

  if (panel.runtimeSourceModeText === "camera") {
    return `<span class="chip chip--active">${escapeHtml(panel.runtimeOperationText)}</span>`;
  }

  if (panel.runtimeSourceModeText === "simulated") {
    return `<span class="chip">${escapeHtml(panel.runtimeOperationText)}</span>`;
  }

  return `<span class="chip">${escapeHtml(panel.runtimeOperationText)}</span>`;
}

function toHealthToneClass(
  tone:
    | "pending"
    | "healthy"
    | "retrying"
    | "degraded"
    | "terminal_failure"
    | "telemetry_stale",
): string {
  if (tone === "terminal_failure") {
    return "terminal";
  }

  if (tone === "telemetry_stale") {
    return "stale";
  }

  return tone;
}

function renderCameraTelemetryRows(cameraTelemetry: {
  readonly captureBackendText: string;
  readonly frameSourceModeText: string;
  readonly frameSourceNameText: string;
  readonly bridgeModeText: string;
  readonly runtimeProfileNameText: string;
  readonly runtimeProfileTypeText: string;
  readonly availableProfilesText: string;
  readonly frameSizeText: string;
  readonly frameIntervalText: string;
  readonly inputResolutionText: string;
  readonly outputResolutionText: string;
  readonly outputModeText: string;
  readonly effectiveFpsText: string;
  readonly preflightStatusText: string;
  readonly recordingStateText: string;
  readonly artifactText: string;
  readonly fallbackStateText: string;
  readonly fallbackReasonText: string;
  readonly captureHealthStateText: string;
  readonly startupValidatedText: string;
  readonly capturesAttemptedText: string;
  readonly capturesSucceededText: string;
  readonly capturesFailedText: string;
  readonly consecutiveFailureCountText: string;
  readonly captureRetryCountText: string;
  readonly captureRetryDelayText: string;
  readonly recentRetryAttemptsText: string;
  readonly currentRetryAttemptText: string;
  readonly transientFailureCountText: string;
  readonly recoveryCountText: string;
  readonly lastSuccessfulCaptureTimeText: string;
  readonly lastRecoveryTimeText: string;
  readonly lastTerminalFailureTimeText: string;
  readonly lastCaptureDurationText: string;
  readonly averageCaptureDurationText: string;
  readonly effectiveFrameIntervalText: string;
  readonly telemetryUpdatedAtText: string;
  readonly telemetryCurrentText: string;
  readonly telemetryStaleThresholdText: string;
  readonly recentCaptureEventsText: string;
  readonly replaySourceIdentityText: string;
  readonly replayLoopText: string;
  readonly replayIndexText: string;
  readonly replayTimingModeText: string;
  readonly replayTimeScaleText: string;
  readonly replayManifestLoadedText: string;
  readonly replayManifestValidatedText: string;
  readonly replayManifestErrorCountText: string;
  readonly replayManifestWarningCountText: string;
  readonly replayManifestSourceText: string;
  readonly replayValidationSummaryText: string;
  readonly replayRecordedTimestampText: string;
  readonly replayDelayUntilNextText: string;
  readonly replayScaledDelayUntilNextText: string;
  readonly replayTimingOffsetText: string;
  readonly replayNominalLoopDurationText: string;
  readonly replayScaledLoopDurationText: string;
  readonly replayLeftSourceText: string;
  readonly replayRightSourceText: string;
  readonly leftCameraDeviceText: string;
  readonly rightCameraDeviceText: string;
  readonly gstLaunchPathText: string;
} | undefined): string {
  if (!cameraTelemetry) {
    return "";
  }

  return `
    <div class="status-row">
      <span>Capture backend</span>
      <strong>${escapeHtml(cameraTelemetry.captureBackendText)}</strong>
    </div>
    <div class="status-row">
      <span>Runtime source mode</span>
      <strong>${escapeHtml(cameraTelemetry.frameSourceModeText)}</strong>
    </div>
    <div class="status-row">
      <span>Runtime source name</span>
      <strong>${escapeHtml(cameraTelemetry.frameSourceNameText)}</strong>
    </div>
    <div class="status-row">
      <span>Bridge mode</span>
      <strong>${escapeHtml(cameraTelemetry.bridgeModeText)}</strong>
    </div>
    <div class="status-row">
      <span>Runtime profile</span>
      <strong>${escapeHtml(cameraTelemetry.runtimeProfileNameText)}</strong>
    </div>
    <div class="status-row">
      <span>Profile type</span>
      <strong>${escapeHtml(cameraTelemetry.runtimeProfileTypeText)}</strong>
    </div>
    <div class="status-row">
      <span>Available profiles</span>
      <strong>${escapeHtml(cameraTelemetry.availableProfilesText)}</strong>
    </div>
    <div class="status-row">
      <span>Frame size</span>
      <strong>${escapeHtml(cameraTelemetry.frameSizeText)}</strong>
    </div>
    <div class="status-row">
      <span>Frame interval</span>
      <strong>${escapeHtml(cameraTelemetry.frameIntervalText)}</strong>
    </div>
    <div class="status-row">
      <span>Input resolution</span>
      <strong>${escapeHtml(cameraTelemetry.inputResolutionText)}</strong>
    </div>
    <div class="status-row">
      <span>Output resolution</span>
      <strong>${escapeHtml(cameraTelemetry.outputResolutionText)}</strong>
    </div>
    <div class="status-row">
      <span>Output mode</span>
      <strong>${escapeHtml(cameraTelemetry.outputModeText)}</strong>
    </div>
    <div class="status-row">
      <span>Effective FPS</span>
      <strong>${escapeHtml(cameraTelemetry.effectiveFpsText)}</strong>
    </div>
    <div class="status-row">
      <span>Preflight</span>
      <strong>${escapeHtml(cameraTelemetry.preflightStatusText)}</strong>
    </div>
    <div class="status-row">
      <span>Recording state</span>
      <strong>${escapeHtml(cameraTelemetry.recordingStateText)}</strong>
    </div>
    <div class="status-row">
      <span>Latest artifact</span>
      <strong>${escapeHtml(cameraTelemetry.artifactText)}</strong>
    </div>
    <div class="status-row">
      <span>Fallback state</span>
      <strong>${escapeHtml(cameraTelemetry.fallbackStateText)}</strong>
    </div>
    <div class="status-row">
      <span>Fallback reason</span>
      <strong>${escapeHtml(cameraTelemetry.fallbackReasonText)}</strong>
    </div>
    <div class="status-row">
      <span>Capture health</span>
      <strong>${escapeHtml(cameraTelemetry.captureHealthStateText)}</strong>
    </div>
    <div class="status-row">
      <span>Startup validated</span>
      <strong>${escapeHtml(cameraTelemetry.startupValidatedText)}</strong>
    </div>
    <div class="status-row">
      <span>Captures attempted</span>
      <strong>${escapeHtml(cameraTelemetry.capturesAttemptedText)}</strong>
    </div>
    <div class="status-row">
      <span>Captures succeeded</span>
      <strong>${escapeHtml(cameraTelemetry.capturesSucceededText)}</strong>
    </div>
    <div class="status-row">
      <span>Captures failed</span>
      <strong>${escapeHtml(cameraTelemetry.capturesFailedText)}</strong>
    </div>
    <div class="status-row">
      <span>Consecutive failures</span>
      <strong>${escapeHtml(cameraTelemetry.consecutiveFailureCountText)}</strong>
    </div>
    <div class="status-row">
      <span>Retry budget</span>
      <strong>${escapeHtml(cameraTelemetry.captureRetryCountText)}</strong>
    </div>
    <div class="status-row">
      <span>Retry delay</span>
      <strong>${escapeHtml(cameraTelemetry.captureRetryDelayText)}</strong>
    </div>
    <div class="status-row">
      <span>Recent retry attempts</span>
      <strong>${escapeHtml(cameraTelemetry.recentRetryAttemptsText)}</strong>
    </div>
    <div class="status-row">
      <span>Current retry attempt</span>
      <strong>${escapeHtml(cameraTelemetry.currentRetryAttemptText)}</strong>
    </div>
    <div class="status-row">
      <span>Transient failures</span>
      <strong>${escapeHtml(cameraTelemetry.transientFailureCountText)}</strong>
    </div>
    <div class="status-row">
      <span>Recoveries</span>
      <strong>${escapeHtml(cameraTelemetry.recoveryCountText)}</strong>
    </div>
    <div class="status-row">
      <span>Last successful capture</span>
      <strong>${escapeHtml(cameraTelemetry.lastSuccessfulCaptureTimeText)}</strong>
    </div>
    <div class="status-row">
      <span>Last recovery</span>
      <strong>${escapeHtml(cameraTelemetry.lastRecoveryTimeText)}</strong>
    </div>
    <div class="status-row">
      <span>Last terminal failure</span>
      <strong>${escapeHtml(cameraTelemetry.lastTerminalFailureTimeText)}</strong>
    </div>
    <div class="status-row">
      <span>Last capture duration</span>
      <strong>${escapeHtml(cameraTelemetry.lastCaptureDurationText)}</strong>
    </div>
    <div class="status-row">
      <span>Average capture duration</span>
      <strong>${escapeHtml(cameraTelemetry.averageCaptureDurationText)}</strong>
    </div>
    <div class="status-row">
      <span>Effective frame interval</span>
      <strong>${escapeHtml(cameraTelemetry.effectiveFrameIntervalText)}</strong>
    </div>
    <div class="status-row">
      <span>Telemetry updated</span>
      <strong>${escapeHtml(cameraTelemetry.telemetryUpdatedAtText)}</strong>
    </div>
    <div class="status-row">
      <span>Telemetry freshness</span>
      <strong>${escapeHtml(cameraTelemetry.telemetryCurrentText)}</strong>
    </div>
    <div class="status-row">
      <span>Telemetry stale threshold</span>
      <strong>${escapeHtml(cameraTelemetry.telemetryStaleThresholdText)}</strong>
    </div>
    <div class="status-row">
      <span>Recent capture issues</span>
      <strong>${escapeHtml(cameraTelemetry.recentCaptureEventsText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay source</span>
      <strong>${escapeHtml(cameraTelemetry.replaySourceIdentityText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay loop</span>
      <strong>${escapeHtml(cameraTelemetry.replayLoopText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay pair</span>
      <strong>${escapeHtml(cameraTelemetry.replayIndexText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay timing mode</span>
      <strong>${escapeHtml(cameraTelemetry.replayTimingModeText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay time scale</span>
      <strong>${escapeHtml(cameraTelemetry.replayTimeScaleText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay manifest loaded</span>
      <strong>${escapeHtml(cameraTelemetry.replayManifestLoadedText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay manifest validated</span>
      <strong>${escapeHtml(cameraTelemetry.replayManifestValidatedText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay manifest errors</span>
      <strong>${escapeHtml(cameraTelemetry.replayManifestErrorCountText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay manifest warnings</span>
      <strong>${escapeHtml(cameraTelemetry.replayManifestWarningCountText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay manifest source</span>
      <strong>${escapeHtml(cameraTelemetry.replayManifestSourceText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay validation summary</span>
      <strong>${escapeHtml(cameraTelemetry.replayValidationSummaryText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay recorded timestamp</span>
      <strong>${escapeHtml(cameraTelemetry.replayRecordedTimestampText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay delay until next</span>
      <strong>${escapeHtml(cameraTelemetry.replayDelayUntilNextText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay scaled delay until next</span>
      <strong>${escapeHtml(cameraTelemetry.replayScaledDelayUntilNextText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay timing offset</span>
      <strong>${escapeHtml(cameraTelemetry.replayTimingOffsetText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay nominal loop duration</span>
      <strong>${escapeHtml(cameraTelemetry.replayNominalLoopDurationText)}</strong>
    </div>
    <div class="status-row">
      <span>Replay scaled loop duration</span>
      <strong>${escapeHtml(cameraTelemetry.replayScaledLoopDurationText)}</strong>
    </div>
    <div class="status-row">
      <span>Left replay source</span>
      <strong>${escapeHtml(cameraTelemetry.replayLeftSourceText)}</strong>
    </div>
    <div class="status-row">
      <span>Right replay source</span>
      <strong>${escapeHtml(cameraTelemetry.replayRightSourceText)}</strong>
    </div>
    <div class="status-row">
      <span>Left camera device</span>
      <strong>${escapeHtml(cameraTelemetry.leftCameraDeviceText)}</strong>
    </div>
    <div class="status-row">
      <span>Right camera device</span>
      <strong>${escapeHtml(cameraTelemetry.rightCameraDeviceText)}</strong>
    </div>
    <div class="status-row">
      <span>gst-launch path</span>
      <strong>${escapeHtml(cameraTelemetry.gstLaunchPathText)}</strong>
    </div>
  `;
}

function renderThermalTelemetryRows(thermalTelemetry: {
  readonly thermalAvailableText: string;
  readonly thermalBackendText: string;
  readonly thermalFrameSizeText: string;
  readonly thermalFrameRateText: string;
  readonly thermalOverlaySupportedText: string;
  readonly thermalSupportedModesText: string;
  readonly thermalOverlayModeText: string;
  readonly thermalHealthStateText: string;
  readonly lastThermalFrameText: string;
  readonly lastThermalTimestampText: string;
  readonly hotspotCountText: string;
  readonly paletteHintText: string;
  readonly thermalErrorText: string;
}): string {
  return `
    <div class="status-row">
      <span>Thermal frame size</span>
      <strong>${escapeHtml(thermalTelemetry.thermalFrameSizeText)}</strong>
    </div>
    <div class="status-row">
      <span>Thermal frame rate</span>
      <strong>${escapeHtml(thermalTelemetry.thermalFrameRateText)}</strong>
    </div>
    <div class="status-row">
      <span>Thermal overlay supported</span>
      <strong>${escapeHtml(thermalTelemetry.thermalOverlaySupportedText)}</strong>
    </div>
    <div class="status-row">
      <span>Thermal overlay modes</span>
      <strong>${escapeHtml(thermalTelemetry.thermalSupportedModesText)}</strong>
    </div>
    <div class="status-row">
      <span>Last thermal frame</span>
      <strong>${escapeHtml(thermalTelemetry.lastThermalFrameText)}</strong>
    </div>
    <div class="status-row">
      <span>Last thermal frame time</span>
      <strong>${escapeHtml(thermalTelemetry.lastThermalTimestampText)}</strong>
    </div>
    <div class="status-row">
      <span>Thermal hotspot count</span>
      <strong>${escapeHtml(thermalTelemetry.hotspotCountText)}</strong>
    </div>
    <div class="status-row">
      <span>Thermal palette</span>
      <strong>${escapeHtml(thermalTelemetry.paletteHintText)}</strong>
    </div>
    <div class="status-row">
      <span>Thermal error</span>
      <strong>${escapeHtml(thermalTelemetry.thermalErrorText)}</strong>
    </div>
  `;
}

function renderIrIlluminatorTelemetryRows(irTelemetry: {
  readonly irAvailableText: string;
  readonly irBackendText: string;
  readonly irEnabledText: string;
  readonly irLevelText: string;
  readonly irControlSupportedText: string;
  readonly irFaultStateText: string;
  readonly irErrorText: string;
}): string {
  return `
    <div class="status-row">
      <span>IR backend</span>
      <strong>${escapeHtml(irTelemetry.irBackendText)}</strong>
    </div>
    <div class="status-row">
      <span>IR control supported</span>
      <strong>${escapeHtml(irTelemetry.irControlSupportedText)}</strong>
    </div>
    <div class="status-row">
      <span>IR fault state</span>
      <strong>${escapeHtml(irTelemetry.irFaultStateText)}</strong>
    </div>
    <div class="status-row">
      <span>IR error</span>
      <strong>${escapeHtml(irTelemetry.irErrorText)}</strong>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
