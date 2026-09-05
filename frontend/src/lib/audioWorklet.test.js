import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function playback(chunkSize = 256) {
  const processors = {};
  const messages = [];
  const context = {
    AudioWorkletProcessor: class { port = { postMessage: (data) => messages.push(data) }; },
    registerProcessor: (name, processor) => { processors[name] = processor; },
    sampleRate: 48000,
    Float32Array,
  };
  vm.runInNewContext(readFileSync(new URL('../../public/audioWorklet.js', import.meta.url), 'utf8'), context);
  const processor = new processors['playback-processor']({ processorOptions: { chunkSize } });
  const tick = () => {
    const output = new Float32Array(128);
    processor.process([], [[output]]);
    return output;
  };
  return { processor, messages, tick, send: (data) => processor.port.onmessage({ data }) };
}

describe('playback buffering diagnostics', () => {
  it('does not count startup silence as underruns and reports at most twice a second', () => {
    const { processor, messages, tick } = playback();
    for (let i = 0; i < 375; i++) tick();
    expect(processor.underruns).toBe(0);
    expect(messages.length).toBeLessThanOrEqual(2);
    expect(messages[0].type).toBe('diagnostics');
  });

  it('counts one underrun per starvation episode, then recovers', () => {
    const { processor, tick, send } = playback();
    send(new Float32Array(256).fill(0.5));
    expect(tick()[0]).toBe(0.5);
    tick(); tick();
    for (let i = 0; i < 100; i++) tick();
    expect(processor.underruns).toBe(1);
    send(new Float32Array(256).fill(0.25));
    expect(tick()[0]).toBe(0.25);
    tick(); tick();
    expect(processor.underruns).toBe(2);
  });

  it('retains the newest audio across ring overflow and accounts for trimmed samples', () => {
    const { processor, tick, send } = playback();
    send(Float32Array.from({ length: 2000 }, (_, i) => i));
    expect(processor.availableSamples).toBe(512);
    expect(processor.droppedSamples).toBe(1488);
    expect(tick()[0]).toBe(1488);
  });
});
