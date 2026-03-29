// AudioWorklet processor file — loaded via audioContext.audioWorklet.addModule()
// Contains CaptureProcessor and PlaybackProcessor.

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunkSize = options.processorOptions?.chunkSize || 4096;
    this.buffer = new Float32Array(this.chunkSize);
    this.writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.writeIndex++] = channelData[i];

      if (this.writeIndex >= this.chunkSize) {
        // Send a copy of the buffer to the main thread
        this.port.postMessage(this.buffer.slice(0));
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkSize = options.processorOptions?.chunkSize || 4096;
    this.primeBufferSize = chunkSize;
    this.targetBufferSize = 2 * chunkSize;
    this.ringBufferSize = 6 * chunkSize;
    this.ringBuffer = new Float32Array(this.ringBufferSize);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.availableSamples = 0;
    this.isPrimed = false;
    this.lastSample = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data instanceof Float32Array) {
        for (let i = 0; i < data.length; i++) {
          if (this.availableSamples >= this.ringBufferSize) {
            this.readIndex = (this.readIndex + 1) % this.ringBufferSize;
            this.availableSamples -= 1;
          }
          this.ringBuffer[this.writeIndex] = data[i];
          this.writeIndex = (this.writeIndex + 1) % this.ringBufferSize;
        }
        this.availableSamples = Math.min(
          this.availableSamples + data.length,
          this.ringBufferSize
        );

        while (this.availableSamples > this.targetBufferSize) {
          this.readIndex = (this.readIndex + 1) % this.ringBufferSize;
          this.availableSamples -= 1;
        }

        if (!this.isPrimed && this.availableSamples >= this.primeBufferSize) {
          this.isPrimed = true;
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channelData = output[0];

    if (!this.isPrimed && this.availableSamples < this.primeBufferSize) {
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = 0;
      }
    } else {
      for (let i = 0; i < channelData.length; i++) {
        if (this.availableSamples <= 0) {
          this.isPrimed = false;
          let sample = this.lastSample;
          for (let j = i; j < channelData.length; j++) {
            sample *= 0.985;
            channelData[j] = sample;
          }
          this.lastSample = sample;
          break;
        }

        const sample = this.ringBuffer[this.readIndex];
        channelData[i] = sample;
        this.lastSample = sample;
        this.readIndex = (this.readIndex + 1) % this.ringBufferSize;
        this.availableSamples -= 1;
      }
    }

    if (!this.isPrimed && this.availableSamples === 0) {
      this.lastSample = 0;
    }

    // Copy mono to all output channels
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channelData);
    }

    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
registerProcessor('playback-processor', PlaybackProcessor);
