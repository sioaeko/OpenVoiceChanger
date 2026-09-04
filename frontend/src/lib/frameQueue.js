// Outbound audio frame scheduling for the realtime WebSocket.
//
// The server processes one chunk at a time, so sending faster than it replies
// only builds a queue on the wire and adds that queue to the round trip. The
// scheduler keeps at most `maxInFlight` frames awaiting a reply, parks the
// next few in a short pending list, and drops the oldest parked frame once the
// list is full — fresh audio beats stale audio in a live monitor.
//
// A frame whose reply never comes (the server hit an error and skipped it, or
// the reply was lost) must not wedge the sender forever, so an in-flight entry
// older than `staleMs` is written off and sending resumes.
//
// Pure with respect to the clock: every method takes `now` so the rules can be
// tested without timers or a socket.

export const DEFAULT_MAX_IN_FLIGHT = 1;
export const DEFAULT_MAX_PENDING = 2;
export const DEFAULT_STALE_MS = 2000;

export function createFrameScheduler({
  maxInFlight = DEFAULT_MAX_IN_FLIGHT,
  maxPending = DEFAULT_MAX_PENDING,
  staleMs = DEFAULT_STALE_MS,
} = {}) {
  const inFlight = new Map(); // seqNum -> sentAt
  let pending = [];
  let dropped = 0;

  function expireStale(now) {
    let expired = 0;
    for (const [seqNum, sentAt] of inFlight) {
      if (now - sentAt > staleMs) {
        inFlight.delete(seqNum);
        expired += 1;
      }
    }
    return expired;
  }

  function takeSendable(now) {
    const out = [];
    while (inFlight.size < maxInFlight && pending.length > 0) {
      const next = pending.shift();
      inFlight.set(next.seqNum, now);
      out.push(next);
    }
    return out;
  }

  return {
    /**
     * Offer a captured frame `{ buffer, seqNum }`.
     * Returns the frames to transmit right now — usually this one, or nothing
     * while a reply is still outstanding.
     */
    offer(frame, now) {
      expireStale(now);
      pending.push(frame);
      while (pending.length > maxPending) {
        pending.shift();
        dropped += 1;
      }
      return takeSendable(now);
    },

    /**
     * Register the server's reply for `seqNum`.
     * Returns the measured round trip (null for an unknown or expired frame)
     * and any parked frames that the freed slot lets through.
     */
    acknowledge(seqNum, now) {
      const sentAt = inFlight.get(seqNum);
      let rttMs = null;
      if (sentAt !== undefined) {
        inFlight.delete(seqNum);
        rttMs = Math.max(0, now - sentAt);
      }
      return { rttMs, send: takeSendable(now) };
    },

    /** Forget everything — on connect, on close. */
    reset() {
      inFlight.clear();
      pending = [];
      dropped = 0;
    },

    get inFlightCount() {
      return inFlight.size;
    },
    get pendingCount() {
      return pending.length;
    },
    /** Frames discarded because the pending list overflowed. */
    get droppedCount() {
      return dropped;
    },
  };
}
