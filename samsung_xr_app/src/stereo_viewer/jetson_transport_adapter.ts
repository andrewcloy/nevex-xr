import type { Unsubscribe } from "../hand_input/contracts";
import {
  buildCapabilitiesEnvelope,
  buildSourceStatusEnvelope,
  buildStereoFrameEnvelope,
  buildTransportStatusEnvelope,
  type JetsonMessageEnvelope,
} from "./jetson_message_envelope";
import {
  JetsonMessageDispatcher,
  type JetsonMessageReceiptMetadata,
  type JetsonMessageDispatchTarget,
} from "./jetson_message_dispatcher";
import { JetsonSequenceMonitor } from "./jetson_sequence_monitor";
import {
  buildJetsonWebSocketUrl,
  JetsonWebSocketTransportClient,
  type JetsonPrototypeWebSocketFactory,
} from "./jetson_ws_transport_client";
import { PushStereoFrameSource } from "./push_frame_source";
import {
  createSampleJetsonCapabilitiesPayload,
  createSampleJetsonStereoFramePayload,
  mapJetsonCapabilitiesPayload,
  mapJetsonErrorPayload,
  mapJetsonFramePayloadToStereoFrame,
  mapJetsonRemoteConfigPayload,
  mapJetsonSourceStatusPayload,
  mapJetsonTransportStatusPayload,
  type JetsonCapabilitiesPayload,
  type JetsonRemoteConfigPayload,
  type JetsonSourceStatusPayload,
  type JetsonStereoFramePayload,
  type JetsonTransportErrorPayload,
  type JetsonTransportStatusPayload,
} from "./jetson_transport_payloads";
import {
  DEFAULT_LIVE_TRANSPORT_CONFIG,
  DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
  type LiveTransportControlChannel,
  normalizeLiveTransportConfig,
  type LiveTransportAdapter,
  type LiveTransportConfig,
  type LiveTransportSampleIngressControls,
  type LiveTransportStatusListener,
  type LiveTransportStatusSnapshot,
} from "./transport_adapter";

/**
 * Protocol-facing ingress seam for future Jetson transport implementations.
 *
 * Real network code should parse remote messages and hand the resulting payloads
 * into this interface rather than touching viewer or frame-source code directly.
 */
export interface JetsonTransportIngress {
  ingestCapabilitiesPayload(payload: JetsonCapabilitiesPayload): void;
  ingestFramePayload(payload: JetsonStereoFramePayload): void;
  ingestTransportStatusPayload(payload: JetsonTransportStatusPayload): void;
  ingestSourceStatusPayload(payload: JetsonSourceStatusPayload): void;
  ingestError(payload: JetsonTransportErrorPayload): void;
  applyRemoteConfig(payload: JetsonRemoteConfigPayload): LiveTransportConfig;
  recordEnvelopeReceipt(envelope: JetsonMessageEnvelope): void;
}

/**
 * Options for constructing the Jetson WebSocket transport adapter.
 */
export interface JetsonTransportAdapterOptions {
  readonly config?: Partial<LiveTransportConfig>;
  readonly createWebSocket?: JetsonPrototypeWebSocketFactory;
}

/**
 * Protocol-facing live adapter for Jetson WebSocket ingress.
 *
 * This class owns transport lifecycle state and external-ingress mapping while
 * using a push-based stereo frame source underneath to feed the viewer path.
 */
export class JetsonTransportAdapter
  implements
    LiveTransportAdapter,
    LiveTransportControlChannel,
    JetsonTransportIngress,
    LiveTransportSampleIngressControls,
    JetsonMessageDispatchTarget
{
  readonly id = "jetson-transport-adapter";

  readonly adapterType = "jetson_stub" as const;

  readonly displayName = "Jetson WebSocket Transport Adapter";

  readonly frameSource: PushStereoFrameSource;

  private readonly statusListeners = new Set<LiveTransportStatusListener>();

  private readonly dispatcher: JetsonMessageDispatcher;

  private readonly prototypeClient: JetsonWebSocketTransportClient;

  private readonly sequenceMonitor = new JetsonSequenceMonitor();

  private config: LiveTransportConfig;

  private status: LiveTransportStatusSnapshot;

  private sampleFrameCounter = 0;

  private envelopeSequence = 0;

  constructor(options: JetsonTransportAdapterOptions = {}) {
    this.config = normalizeLiveTransportConfig({
      ...DEFAULT_LIVE_TRANSPORT_CONFIG,
      port: 8090,
      path: "/jetson/messages",
      protocolType: "websocket_json",
      streamName: "jetson_sender_prototype_stream",
      ...options.config,
    });

    this.frameSource = new PushStereoFrameSource({
      id: "jetson-stub-frame-source",
      displayName: "Jetson Live Frame Source",
      sourceKind: "live",
    });

    this.status = {
      adapterType: this.adapterType,
      adapterDisplayName: this.displayName,
      state: "idle",
      connected: false,
      statusText: "Jetson WebSocket transport idle.",
      sequenceHealth: DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
      config: this.config,
    };

    this.dispatcher = new JetsonMessageDispatcher(this, {
      validationOptions: {
        maxMessageBytes: this.config.maxMessageBytes,
        maxImagePayloadBytes: this.config.maxImagePayloadBytes,
      },
    });
    this.prototypeClient = new JetsonWebSocketTransportClient({
      dispatcher: this.dispatcher,
      createWebSocket: options.createWebSocket,
      onTransportStatus: (payload) => {
        this.ingestTransportStatusPayload(payload);
      },
      onTransportError: (payload) => {
        this.ingestError(payload);
      },
    });

    this.frameSource.subscribeStatus((sourceStatus) => {
      if (sourceStatus.state !== "error") {
        return;
      }

      this.updateStatus({
        state: "error",
        connected: this.status.connected,
        statusText: sourceStatus.lastError
          ? `Jetson source error: ${sourceStatus.lastError}`
          : "Jetson source error reported.",
        lastError: sourceStatus.lastError,
      });
    });
  }

  getStatus(): LiveTransportStatusSnapshot {
    return this.status;
  }

  subscribeStatus(listener: LiveTransportStatusListener): Unsubscribe {
    this.statusListeners.add(listener);
    listener(this.status);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getConfig(): LiveTransportConfig {
    return this.config;
  }

  updateConfig(configPatch: Partial<LiveTransportConfig>): LiveTransportConfig {
    this.config = normalizeLiveTransportConfig({
      ...this.config,
      ...configPatch,
    });

    const requiresReconnect = this.prototypeClient.isConnectedOrConnecting();
    this.dispatcher.setValidationOptions({
      maxMessageBytes: this.config.maxMessageBytes,
      maxImagePayloadBytes: this.config.maxImagePayloadBytes,
    });
    this.updateStatus({
      config: this.config,
      statusText:
        requiresReconnect
          ? `Jetson WebSocket transport configuration updated. Reconnect to apply ${buildJetsonWebSocketUrl(
              this.config,
            )}.`
          : `Jetson WebSocket transport configured for ${buildJetsonWebSocketUrl(this.config)}.`,
    });

    return this.config;
  }

  async start(): Promise<void> {
    if (
      this.status.state === "starting" ||
      this.status.state === "connecting" ||
      this.status.state === "reconnecting" ||
      (this.status.state === "running" &&
        (this.status.connected || this.prototypeClient.isConnectedOrConnecting()))
    ) {
      return;
    }

    this.sequenceMonitor.reset();
    this.updateStatus({
      state: "starting",
      connected: false,
      statusText: "Starting Jetson WebSocket transport...",
      lastError: undefined,
      lastParseError: undefined,
      lastMessageType: undefined,
      lastSequence: undefined,
      lastMessageTimestampMs: undefined,
      lastMessageSizeBytes: undefined,
      sequenceHealth: this.sequenceMonitor.getSnapshot(),
      capabilities: undefined,
    });

    await this.frameSource.start();
    this.frameSource.updateStatus({
      state: "idle",
      lastError: undefined,
    });

    await this.prototypeClient.connect(this.config);
  }

  async stop(): Promise<void> {
    await this.prototypeClient.disconnect();
    await this.frameSource.stop();
    this.updateStatus({
      state: "stopped",
      connected: false,
      statusText: "Jetson WebSocket transport stopped.",
    });
  }

  ingestCapabilitiesPayload(payload: JetsonCapabilitiesPayload): void {
    const capabilities = mapJetsonCapabilitiesPayload(payload);
    this.updateStatus({
      capabilities,
      statusText: `Jetson capabilities received from ${capabilities.senderName}.`,
      lastError: undefined,
      lastParseError: undefined,
    });
  }

  ingestFramePayload(payload: JetsonStereoFramePayload): void {
    try {
      const frame = mapJetsonFramePayloadToStereoFrame(payload);
      this.frameSource.pushFrame(frame);
      this.updateStatus({
        state: "running",
        connected: this.status.connected,
        statusText: `Jetson WebSocket transport mapped frame #${frame.frameId}.`,
        lastError: undefined,
        lastParseError: undefined,
      });
    } catch (error) {
      this.ingestError({
        stage: "mapping",
        recoverable: true,
        message: getErrorMessage(error),
      });
    }
  }

  ingestTransportStatusPayload(payload: JetsonTransportStatusPayload): void {
    const transportStatusPatch = mapJetsonTransportStatusPayload(
      payload,
      this.status,
    );
    this.updateStatus(transportStatusPatch);
  }

  ingestSourceStatusPayload(payload: JetsonSourceStatusPayload): void {
    this.frameSource.updateStatus({
      ...mapJetsonSourceStatusPayload(payload),
      telemetryReceivedAtMs: Date.now(),
    });
  }

  ingestError(payload: JetsonTransportErrorPayload): void {
    const mappedError = mapJetsonErrorPayload(payload);

    if (mappedError.sourceErrorText) {
      this.frameSource.setError(mappedError.sourceErrorText);
    }

    this.updateStatus({
      state: mappedError.transportState,
      connected: this.status.connected,
      statusText: mappedError.statusText,
      lastError: mappedError.lastError,
      lastParseError: mappedError.lastParseError,
    });
  }

  applyRemoteConfig(payload: JetsonRemoteConfigPayload): LiveTransportConfig {
    return this.updateConfig(mapJetsonRemoteConfigPayload(payload));
  }

  recordEnvelopeReceipt(
    envelope: JetsonMessageEnvelope,
    metadata: JetsonMessageReceiptMetadata = {},
  ): void {
    const sequenceHealth = this.sequenceMonitor.record(envelope.sequence);
    this.updateStatus({
      lastMessageType: envelope.messageType,
      lastSequence: envelope.sequence,
      lastMessageTimestampMs: envelope.timestampMs,
      lastMessageSizeBytes: metadata.messageSizeBytes,
      sequenceHealth,
    });
  }

  getSamplePayloadActionLabel(): string {
    return "Inject Sample Jetson Payload";
  }

  async injectSamplePayload(): Promise<void> {
    await this.ensureFrameSourceReadyForInjection();

    const frameId = ++this.sampleFrameCounter;
    this.dispatcher.dispatchMessageObject(
      buildCapabilitiesEnvelope(
        createSampleJetsonCapabilitiesPayload(
          "jetson_stub_sender",
          this.config.streamName,
        ),
        {
          sequence: this.nextEnvelopeSequence(),
        },
      ),
    );
    this.dispatcher.dispatchMessageObject(
      buildTransportStatusEnvelope(
        {
          transportState: "running",
          statusText: "Jetson WebSocket transport ingesting a sample envelope.",
        },
        {
          sequence: this.nextEnvelopeSequence(),
        },
      ),
    );
    this.dispatcher.dispatchMessageObject(
      buildSourceStatusEnvelope(
        {
          sourceState: "running",
          lastFrameId: frameId,
          lastTimestampMs: Date.now(),
        },
        {
          sequence: this.nextEnvelopeSequence(),
        },
      ),
    );
    this.dispatcher.dispatchMessageObject(
      buildStereoFrameEnvelope(
        createSampleJetsonStereoFramePayload(frameId, this.config.streamName),
        {
          sequence: this.nextEnvelopeSequence(),
        },
      ),
    );
  }

  async sendControlMessage(message: unknown): Promise<void> {
    await this.prototypeClient.sendMessageObject(message);
  }

  private updateStatus(patch: Partial<LiveTransportStatusSnapshot>): void {
    this.status = {
      ...this.status,
      ...patch,
      adapterType: this.adapterType,
      adapterDisplayName: this.displayName,
      config: patch.config ?? this.config,
    };

    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }

  private async ensureFrameSourceReadyForInjection(): Promise<void> {
    const sourceState = this.frameSource.getStatus().state;
    if (sourceState === "stopped") {
      await this.frameSource.start();
      this.frameSource.updateStatus({
        state: "idle",
        lastError: undefined,
      });
    }
  }

  private nextEnvelopeSequence(): number {
    this.envelopeSequence += 1;
    return this.envelopeSequence;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Jetson mapping error.";
}
