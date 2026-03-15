import type { Unsubscribe } from "../hand_input/contracts";
import type {
  HearingEnhancementCapabilitySnapshot,
  PhoneMediaAudioCapabilitySnapshot,
} from "./audio_models";
import type {
  IrIlluminatorCapabilitySnapshot,
  ThermalCapabilitySnapshot,
} from "./thermal_models";
import type { StereoFrameSource } from "./frame_source";

/**
 * Supported live-transport implementations available to the app shell.
 */
export type LiveTransportAdapterType = "dev" | "jetson_stub";

/**
 * Transport lifecycle states reported independently from frame-source state.
 *
 * The transport may be connecting or reconnecting even when no new frames have
 * arrived yet, which is why this model lives above the frame-source seam.
 */
export type LiveTransportAdapterState =
  | "idle"
  | "starting"
  | "connecting"
  | "running"
  | "reconnecting"
  | "stopped"
  | "error";

/**
 * Lightweight receiver-side sequence health summary.
 */
export interface LiveTransportSequenceHealthSnapshot {
  readonly repeatedCount: number;
  readonly outOfOrderCount: number;
  readonly droppedCountEstimate: number;
  readonly lastAnomalyText?: string;
}

/**
 * Last advertised sender capabilities, when available.
 */
export interface LiveTransportCapabilitiesSnapshot {
  readonly senderName: string;
  readonly senderVersion?: string;
  readonly supportedMessageVersion: number;
  readonly supportedImagePayloadModes: readonly string[];
  readonly maxRecommendedPayloadBytes?: number;
  readonly stereoFormatNote?: string;
  readonly thermalAvailable: ThermalCapabilitySnapshot["thermalAvailable"];
  readonly thermalBackendIdentity?: ThermalCapabilitySnapshot["thermalBackendIdentity"];
  readonly thermalFrameWidth?: ThermalCapabilitySnapshot["thermalFrameWidth"];
  readonly thermalFrameHeight?: ThermalCapabilitySnapshot["thermalFrameHeight"];
  readonly thermalFrameRate?: ThermalCapabilitySnapshot["thermalFrameRate"];
  readonly thermalOverlaySupported: ThermalCapabilitySnapshot["thermalOverlaySupported"];
  readonly supportedThermalOverlayModes: ThermalCapabilitySnapshot["supportedThermalOverlayModes"];
  readonly thermalHealthState: ThermalCapabilitySnapshot["thermalHealthState"];
  readonly thermalErrorText?: ThermalCapabilitySnapshot["thermalErrorText"];
  readonly irAvailable: IrIlluminatorCapabilitySnapshot["irAvailable"];
  readonly irBackendIdentity?: IrIlluminatorCapabilitySnapshot["irBackendIdentity"];
  readonly irEnabled: IrIlluminatorCapabilitySnapshot["irEnabled"];
  readonly irLevel: IrIlluminatorCapabilitySnapshot["irLevel"];
  readonly irMaxLevel: IrIlluminatorCapabilitySnapshot["irMaxLevel"];
  readonly irControlSupported: IrIlluminatorCapabilitySnapshot["irControlSupported"];
  readonly irFaultState?: IrIlluminatorCapabilitySnapshot["irFaultState"];
  readonly irErrorText?: IrIlluminatorCapabilitySnapshot["irErrorText"];
  readonly hearingEnhancementAvailable: HearingEnhancementCapabilitySnapshot["hearingEnhancementAvailable"];
  readonly microphoneArrayAvailable: HearingEnhancementCapabilitySnapshot["microphoneArrayAvailable"];
  readonly audioEnhancementBackendIdentity?: HearingEnhancementCapabilitySnapshot["audioEnhancementBackendIdentity"];
  readonly hearingModesSupported: HearingEnhancementCapabilitySnapshot["hearingModesSupported"];
  readonly hearingHealthState: HearingEnhancementCapabilitySnapshot["hearingHealthState"];
  readonly hearingErrorText?: HearingEnhancementCapabilitySnapshot["hearingErrorText"];
  readonly hearingGainMin: HearingEnhancementCapabilitySnapshot["hearingGainMin"];
  readonly hearingGainMax: HearingEnhancementCapabilitySnapshot["hearingGainMax"];
  readonly hearingLatencyEstimateMs?: HearingEnhancementCapabilitySnapshot["hearingLatencyEstimateMs"];
  readonly phoneAudioAvailable: PhoneMediaAudioCapabilitySnapshot["phoneAudioAvailable"];
  readonly bluetoothAudioConnected: PhoneMediaAudioCapabilitySnapshot["bluetoothAudioConnected"];
  readonly mediaPlaybackControlSupported: PhoneMediaAudioCapabilitySnapshot["mediaPlaybackControlSupported"];
  readonly mediaPlaybackState: PhoneMediaAudioCapabilitySnapshot["mediaPlaybackState"];
  readonly mediaVolumeMin: PhoneMediaAudioCapabilitySnapshot["mediaVolumeMin"];
  readonly mediaVolumeMax: PhoneMediaAudioCapabilitySnapshot["mediaVolumeMax"];
  readonly receivedAtMs: number;
}

/**
 * Transport-agnostic configuration for future live integrations.
 *
 * These fields are generic enough to support several possible transport
 * choices later without locking the app to one protocol family today.
 */
export interface LiveTransportConfig {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly protocolType: string;
  readonly reconnectEnabled: boolean;
  readonly reconnectIntervalMs: number;
  readonly streamName: string;
  readonly maxMessageBytes: number;
  readonly maxImagePayloadBytes: number;
  readonly options: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Current transport status snapshot.
 */
export interface LiveTransportStatusSnapshot {
  readonly adapterType: LiveTransportAdapterType;
  readonly adapterDisplayName: string;
  readonly state: LiveTransportAdapterState;
  readonly connected: boolean;
  readonly statusText: string;
  readonly lastError?: string;
  readonly lastParseError?: string;
  readonly lastMessageType?: string;
  readonly lastSequence?: number;
  readonly lastMessageTimestampMs?: number;
  readonly lastMessageSizeBytes?: number;
  readonly sequenceHealth: LiveTransportSequenceHealthSnapshot;
  readonly capabilities?: LiveTransportCapabilitiesSnapshot;
  readonly config: LiveTransportConfig;
}

/**
 * Listener invoked whenever the transport lifecycle or configuration changes.
 */
export type LiveTransportStatusListener = (
  status: LiveTransportStatusSnapshot,
) => void;

/**
 * Optional debug controls for dev-only transport implementations.
 *
 * The browser demo can use this when available, while production integrations
 * can simply omit these capabilities.
 */
export interface LiveTransportDebugSnapshot {
  readonly demoFeedActive: boolean;
}

export interface LiveTransportDebugControls {
  getDebugSnapshot(): LiveTransportDebugSnapshot;
  startDemoFeed(): Promise<void>;
  stopDemoFeed(): Promise<void>;
  toggleDemoFeed(): Promise<void>;
}

/**
 * Optional dev-only ingress helper for protocol-facing adapter stubs.
 */
export interface LiveTransportSampleIngressControls {
  injectSamplePayload(): Promise<void>;
  getSamplePayloadActionLabel(): string;
}

/**
 * Optional outbound control channel exposed by transport adapters that can send
 * browser-originated operator commands to the sender/runtime.
 */
export interface LiveTransportControlChannel {
  sendControlMessage(message: unknown): Promise<void>;
}

/**
 * Top-level seam for future live transport integrations.
 *
 * The app runtime depends on this abstraction rather than on a specific
 * transport implementation or on the lower-level frame bridge helper.
 */
export interface LiveTransportAdapter {
  readonly id: string;
  readonly adapterType: LiveTransportAdapterType;
  readonly displayName: string;
  readonly frameSource: StereoFrameSource;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): LiveTransportStatusSnapshot;
  subscribeStatus(listener: LiveTransportStatusListener): Unsubscribe;
  updateConfig(config: Partial<LiveTransportConfig>): LiveTransportConfig;
  getConfig(): LiveTransportConfig;
}

/**
 * Default transport configuration used by the dev placeholder transport.
 */
export const DEFAULT_LIVE_TRANSPORT_CONFIG: LiveTransportConfig = {
  host: "127.0.0.1",
  port: 8554,
  path: "/stereo",
  protocolType: "auto",
  reconnectEnabled: true,
  reconnectIntervalMs: 1500,
  streamName: "live_placeholder",
  maxMessageBytes: 512 * 1024,
  maxImagePayloadBytes: 256 * 1024,
  options: {},
};

/**
 * Default sequence health state before any live messages arrive.
 */
export const DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH: LiveTransportSequenceHealthSnapshot =
  {
    repeatedCount: 0,
    outOfOrderCount: 0,
    droppedCountEstimate: 0,
  };

/**
 * Runtime type guard for dev-only transport debug capabilities.
 */
export function hasLiveTransportDebugControls(
  adapter: LiveTransportAdapter | undefined,
): adapter is LiveTransportAdapter & LiveTransportDebugControls {
  const candidate = adapter as
    | (LiveTransportAdapter & Partial<LiveTransportDebugControls>)
    | undefined;

  return Boolean(
    candidate &&
      typeof candidate.getDebugSnapshot === "function" &&
      typeof candidate.toggleDemoFeed === "function",
  );
}

/**
 * Runtime type guard for adapters that can accept sample ingress injections.
 */
export function hasLiveTransportSampleIngressControls(
  adapter: LiveTransportAdapter | undefined,
): adapter is LiveTransportAdapter & LiveTransportSampleIngressControls {
  const candidate = adapter as
    | (LiveTransportAdapter & Partial<LiveTransportSampleIngressControls>)
    | undefined;

  return Boolean(
    candidate &&
      typeof candidate.injectSamplePayload === "function" &&
      typeof candidate.getSamplePayloadActionLabel === "function",
  );
}

/**
 * Runtime type guard for adapters that can send outbound control messages.
 */
export function hasLiveTransportControlChannel(
  adapter: LiveTransportAdapter | undefined,
): adapter is LiveTransportAdapter & LiveTransportControlChannel {
  const candidate = adapter as
    | (LiveTransportAdapter & Partial<LiveTransportControlChannel>)
    | undefined;

  return Boolean(
    candidate && typeof candidate.sendControlMessage === "function",
  );
}

/**
 * Normalizes a live transport config object.
 */
export function normalizeLiveTransportConfig(
  config: LiveTransportConfig,
): LiveTransportConfig {
  return {
    host: config.host.trim(),
    port: Math.max(0, Math.round(config.port)),
    path: config.path.trim(),
    protocolType: config.protocolType.trim() || "auto",
    reconnectEnabled: config.reconnectEnabled,
    reconnectIntervalMs: Math.max(0, Math.round(config.reconnectIntervalMs)),
    streamName: config.streamName.trim(),
    maxMessageBytes: Math.max(0, Math.round(config.maxMessageBytes)),
    maxImagePayloadBytes: Math.max(0, Math.round(config.maxImagePayloadBytes)),
    options: config.options,
  };
}
