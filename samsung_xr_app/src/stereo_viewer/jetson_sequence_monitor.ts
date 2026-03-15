import {
  DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH,
  type LiveTransportSequenceHealthSnapshot,
} from "./transport_adapter";

/**
 * Tracks basic sequence continuity for incoming Jetson envelopes.
 *
 * The monitor stays intentionally small: it only tracks duplicates,
 * out-of-order messages, and a rough dropped-message estimate.
 */
export class JetsonSequenceMonitor {
  private lastSequence?: number;

  private snapshot: LiveTransportSequenceHealthSnapshot =
    DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH;

  getSnapshot(): LiveTransportSequenceHealthSnapshot {
    return this.snapshot;
  }

  reset(): void {
    this.lastSequence = undefined;
    this.snapshot = DEFAULT_LIVE_TRANSPORT_SEQUENCE_HEALTH;
  }

  record(sequence: number | undefined): LiveTransportSequenceHealthSnapshot {
    if (typeof sequence !== "number") {
      return this.snapshot;
    }

    if (this.lastSequence === undefined) {
      this.lastSequence = sequence;
      this.snapshot = {
        ...this.snapshot,
        lastAnomalyText: undefined,
      };
      return this.snapshot;
    }

    if (sequence === this.lastSequence) {
      this.snapshot = {
        ...this.snapshot,
        repeatedCount: this.snapshot.repeatedCount + 1,
        lastAnomalyText: `Repeated sequence #${sequence}.`,
      };
      return this.snapshot;
    }

    if (sequence < this.lastSequence) {
      this.snapshot = {
        ...this.snapshot,
        outOfOrderCount: this.snapshot.outOfOrderCount + 1,
        lastAnomalyText: `Out-of-order sequence #${sequence} arrived after #${this.lastSequence}.`,
      };
      return this.snapshot;
    }

    const gap = sequence - this.lastSequence - 1;
    this.lastSequence = sequence;
    this.snapshot = {
      ...this.snapshot,
      droppedCountEstimate: this.snapshot.droppedCountEstimate + Math.max(0, gap),
      lastAnomalyText:
        gap > 0
          ? `Estimated ${gap} dropped message${gap === 1 ? "" : "s"} before #${sequence}.`
          : undefined,
    };
    return this.snapshot;
  }
}
