import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

async function parseHeader(blob) {
  const view = new DataView(await blob.arrayBuffer());
  const text = (offset, length) => String.fromCharCode(
    ...Array.from({ length }, (_, i) => view.getUint8(offset + i))
  );

  return {
    riff: text(0, 4),
    wave: text(8, 4),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataSize: view.getUint32(40, true),
    view,
  };
}

describe('encodeWav', () => {
  it('writes the rate it is given, not a hardcoded one', async () => {
    // Regression guard: the recorder must stamp the AudioContext's actual rate.
    // Encoding 48 kHz audio with a 40 kHz header plays it back detuned and slow.
    for (const rate of [40000, 44100, 48000]) {
      const header = await parseHeader(encodeWav([new Float32Array(16)], rate));
      expect(header.sampleRate).toBe(rate);
      expect(header.byteRate).toBe(rate * 2);
    }
  });

  it('produces a well-formed mono 16-bit PCM header', async () => {
    const header = await parseHeader(encodeWav([new Float32Array(100)], 48000));
    expect(header.riff).toBe('RIFF');
    expect(header.wave).toBe('WAVE');
    expect(header.channels).toBe(1);
    expect(header.bitsPerSample).toBe(16);
    expect(header.blockAlign).toBe(2);
    expect(header.dataSize).toBe(200);
  });

  it('concatenates chunks in order and clamps out-of-range samples', async () => {
    const blob = encodeWav([Float32Array.from([0, 1, -1]), Float32Array.from([2, -2])], 48000);
    const { view, dataSize } = await parseHeader(blob);

    expect(dataSize).toBe(10);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    // Values beyond +/-1 clamp instead of wrapping around.
    expect(view.getInt16(50, true)).toBe(32767);
    expect(view.getInt16(52, true)).toBe(-32768);
  });

  it('encodes an empty take as a header-only file', async () => {
    const blob = encodeWav([], 48000);
    expect(blob.size).toBe(44);
  });
});
