import { JETSON_MESSAGE_ENVELOPE_VERSION } from "./jetson_message_envelope";
import type {
  JetsonCapabilitiesPayload,
  JetsonEyeImagePayloadMode,
  JetsonSourceStatusPayload,
  JetsonStereoFramePayload,
  JetsonTransportErrorPayload,
  JetsonTransportStatusPayload,
} from "./jetson_transport_payloads";

/**
 * Minimal sender-facing contract for the first real Jetson proof-of-life.
 *
 * This is intentionally transport-light. A sender only needs a connected
 * message transport and the ability to emit the canonical protocol messages.
 */
export interface JetsonSenderTransportContract {
  sendCapabilities(payload: JetsonCapabilitiesPayload): Promise<void> | void;
  sendTransportStatus(payload: JetsonTransportStatusPayload): Promise<void> | void;
  sendSourceStatus(payload: JetsonSourceStatusPayload): Promise<void> | void;
  sendStereoFrame(payload: JetsonStereoFramePayload): Promise<void> | void;
  sendError?(payload: JetsonTransportErrorPayload): Promise<void> | void;
}

export interface JetsonSenderIntegrationContract {
  readonly protocolVersion: typeof JETSON_MESSAGE_ENVELOPE_VERSION;
  readonly startupMessageOrder: readonly [
    "capabilities",
    "transport_status",
    "source_status",
  ];
  readonly steadyStateMessageTypes: readonly ["stereo_frame", "source_status"];
  readonly recommendedInitialImageMode: JetsonEyeImagePayloadMode;
  readonly recommendedMaxPayloadBytes: number;
}

export const DEFAULT_JETSON_SENDER_INTEGRATION_CONTRACT: JetsonSenderIntegrationContract =
  {
    protocolVersion: JETSON_MESSAGE_ENVELOPE_VERSION,
    startupMessageOrder: ["capabilities", "transport_status", "source_status"],
    steadyStateMessageTypes: ["stereo_frame", "source_status"],
    recommendedInitialImageMode: "data_url",
    recommendedMaxPayloadBytes: 256 * 1024,
  };
