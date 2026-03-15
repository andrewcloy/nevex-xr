import {
  isJetsonProtocolIssueError,
  normalizeJetsonProtocolValidationOptions,
  parseJetsonMessageEnvelope,
  type JetsonMessageEnvelope,
  type JetsonProtocolValidationOptions,
  type JetsonProtocolIssueKind,
} from "./jetson_message_envelope";
import type {
  JetsonCapabilitiesPayload,
  JetsonRemoteConfigPayload,
  JetsonSourceStatusPayload,
  JetsonStereoFramePayload,
  JetsonTransportErrorPayload,
  JetsonTransportStatusPayload,
} from "./jetson_transport_payloads";

/**
 * Target interface used by the Jetson envelope dispatcher.
 *
 * The dispatcher owns message framing and routing only. It forwards each
 * payload into the adapter's ingress boundary and reports parse/dispatch
 * failures without embedding adapter logic itself.
 */
export interface JetsonMessageDispatchTarget {
  recordEnvelopeReceipt(
    envelope: JetsonMessageEnvelope,
    metadata?: JetsonMessageReceiptMetadata,
  ): void;
  ingestCapabilitiesPayload(payload: JetsonCapabilitiesPayload): void;
  ingestTransportStatusPayload(payload: JetsonTransportStatusPayload): void;
  ingestSourceStatusPayload(payload: JetsonSourceStatusPayload): void;
  ingestFramePayload(payload: JetsonStereoFramePayload): void;
  ingestError(payload: JetsonTransportErrorPayload): void;
  applyRemoteConfig(payload: JetsonRemoteConfigPayload): void;
}

/**
 * Result returned after attempting to dispatch one parsed message object.
 */
export interface JetsonMessageDispatchResult {
  readonly ok: boolean;
  readonly envelope?: JetsonMessageEnvelope;
  readonly errorText?: string;
  readonly errorKind?: JetsonProtocolIssueKind;
}

export interface JetsonMessageReceiptMetadata {
  readonly messageSizeBytes?: number;
}

export interface JetsonMessageDispatcherOptions {
  readonly validationOptions?: Partial<JetsonProtocolValidationOptions>;
}

/**
 * Validates and routes Jetson envelopes into the adapter ingress seam.
 */
export class JetsonMessageDispatcher {
  private validationOptions: JetsonProtocolValidationOptions;

  constructor(
    private readonly target: JetsonMessageDispatchTarget,
    options: JetsonMessageDispatcherOptions = {},
  ) {
    this.validationOptions = normalizeJetsonProtocolValidationOptions(
      options.validationOptions,
    );
  }

  setValidationOptions(
    validationOptions: Partial<JetsonProtocolValidationOptions>,
  ): void {
    this.validationOptions = normalizeJetsonProtocolValidationOptions(
      validationOptions,
    );
  }

  dispatchMessageObject(
    rawMessage: unknown,
    metadata: JetsonMessageReceiptMetadata = {},
  ): JetsonMessageDispatchResult {
    let envelope: JetsonMessageEnvelope;

    try {
      envelope = parseJetsonMessageEnvelope(rawMessage, this.validationOptions);
    } catch (error) {
      const protocolIssue = getProtocolIssue(error);
      const errorText = protocolIssue.message;
      this.target.ingestError({
        stage: "parse",
        recoverable: true,
        message: errorText,
        code: protocolIssue.kind,
      });
      return {
        ok: false,
        errorText,
        errorKind: protocolIssue.kind,
      };
    }

    this.target.recordEnvelopeReceipt(envelope, metadata);

    try {
      switch (envelope.messageType) {
        case "capabilities":
          this.target.ingestCapabilitiesPayload(envelope.payload);
          break;
        case "transport_status":
          this.target.ingestTransportStatusPayload(envelope.payload);
          break;
        case "source_status":
          this.target.ingestSourceStatusPayload(envelope.payload);
          break;
        case "stereo_frame":
          this.target.ingestFramePayload(envelope.payload);
          break;
        case "error":
          this.target.ingestError(envelope.payload);
          break;
        case "remote_config":
          this.target.applyRemoteConfig(envelope.payload);
          break;
      }
    } catch (error) {
      const errorText = getErrorMessage(error);
      this.target.ingestError({
        stage: "mapping",
        recoverable: true,
        message: errorText,
        code: "mapping_failure",
      });
      return {
        ok: false,
        envelope,
        errorText,
        errorKind: "mapping_failure",
      };
    }

    return {
      ok: true,
      envelope,
    };
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Jetson dispatch error.";
}

function getProtocolIssue(error: unknown): {
  readonly kind: Exclude<JetsonProtocolIssueKind, "mapping_failure">;
  readonly message: string;
} {
  if (isJetsonProtocolIssueError(error)) {
    return {
      kind: error.kind,
      message: error.message,
    };
  }

  return {
    kind: "malformed_envelope",
    message: getErrorMessage(error),
  };
}
