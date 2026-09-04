import { describe, expect, it } from 'vitest';
import { createFrameScheduler } from './frameQueue';

const frame = (seqNum) => ({ buffer: new Float32Array(4), seqNum });

describe('createFrameScheduler', () => {
  it('sends immediately while nothing is in flight', () => {
    const scheduler = createFrameScheduler();
    expect(scheduler.offer(frame(1), 0)).toEqual([frame(1)]);
    expect(scheduler.inFlightCount).toBe(1);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('parks frames while a reply is outstanding', () => {
    const scheduler = createFrameScheduler({ maxInFlight: 1, maxPending: 2 });
    scheduler.offer(frame(1), 0);
    expect(scheduler.offer(frame(2), 10)).toEqual([]);
    expect(scheduler.pendingCount).toBe(1);
  });

  it('drops the oldest parked frame once the pending list is full', () => {
    const scheduler = createFrameScheduler({ maxInFlight: 1, maxPending: 2 });
    scheduler.offer(frame(1), 0);
    scheduler.offer(frame(2), 10);
    scheduler.offer(frame(3), 20);
    scheduler.offer(frame(4), 30);
    expect(scheduler.pendingCount).toBe(2);
    expect(scheduler.droppedCount).toBe(1);

    // Frame 2 was the one discarded: acknowledging 1 releases 3, not 2.
    expect(scheduler.acknowledge(1, 40).send).toEqual([frame(3)]);
  });

  it('measures the round trip and releases the next frame on acknowledge', () => {
    const scheduler = createFrameScheduler({ maxInFlight: 1 });
    scheduler.offer(frame(1), 100);
    scheduler.offer(frame(2), 110);

    const result = scheduler.acknowledge(1, 160);
    expect(result.rttMs).toBe(60);
    expect(result.send).toEqual([frame(2)]);
    expect(scheduler.inFlightCount).toBe(1);
  });

  it('ignores a reply for a frame it does not know', () => {
    const scheduler = createFrameScheduler();
    expect(scheduler.acknowledge(99, 0)).toEqual({ rttMs: null, send: [] });
  });

  it('writes off a frame whose reply never arrives so sending resumes', () => {
    const scheduler = createFrameScheduler({ maxInFlight: 1, staleMs: 2000 });
    scheduler.offer(frame(1), 0);
    expect(scheduler.offer(frame(2), 1000)).toEqual([]);
    // Past the stale window: the wedged slot is freed and the newest frame goes out.
    expect(scheduler.offer(frame(3), 2500)).toEqual([frame(2)]);
    expect(scheduler.inFlightCount).toBe(1);
    // The late reply for the abandoned frame is not counted as latency.
    expect(scheduler.acknowledge(1, 2600).rttMs).toBeNull();
  });

  it('honours a larger in-flight window', () => {
    const scheduler = createFrameScheduler({ maxInFlight: 2, maxPending: 4 });
    expect(scheduler.offer(frame(1), 0)).toEqual([frame(1)]);
    expect(scheduler.offer(frame(2), 1)).toEqual([frame(2)]);
    expect(scheduler.offer(frame(3), 2)).toEqual([]);
    expect(scheduler.acknowledge(1, 3).send).toEqual([frame(3)]);
  });

  it('forgets everything on reset', () => {
    const scheduler = createFrameScheduler();
    scheduler.offer(frame(1), 0);
    scheduler.offer(frame(2), 1);
    scheduler.reset();
    expect(scheduler.inFlightCount).toBe(0);
    expect(scheduler.pendingCount).toBe(0);
    expect(scheduler.droppedCount).toBe(0);
    expect(scheduler.offer(frame(3), 2)).toEqual([frame(3)]);
  });
});
