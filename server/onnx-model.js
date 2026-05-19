const ort = require('onnxruntime-node');
const path = require('path');
const fs = require('fs');

let onnxSession;

const loadONNXModel = async () => {
  if (!onnxSession) {
    const modelPath = path.join(__dirname, 'models', 'voice-changer.onnx');
    if (fs.existsSync(modelPath)) {
      onnxSession = await ort.InferenceSession.create(modelPath);
      console.log('ONNX model loaded successfully');
    } else {
      console.warn('ONNX model file not found at:', modelPath);
    }
  }
};

const processONNX = async (audioBuffer, settings) => {
  if (!onnxSession) {
    throw new Error('ONNX model not loaded');
  }

  const inputTensor = new Float32Array(audioBuffer);
  const adjustedTensor = applySettings(inputTensor, settings);
  const tensor = new ort.Tensor('float32', adjustedTensor, [1, adjustedTensor.length]);

  const results = await onnxSession.run({ input: tensor });
  const output = results.output.data;

  return Array.from(output);
};

const applySettings = (inputTensor, settings) => {
  if (!settings) return inputTensor;

  const output = new Float32Array(inputTensor.length);
  const pitchShift = settings.pitchShift || 0;

  for (let i = 0; i < inputTensor.length; i++) {
    output[i] = inputTensor[i];
  }

  if (pitchShift !== 0) {
    const ratio = Math.pow(2, pitchShift / 12);
    for (let i = 0; i < output.length; i++) {
      const srcIndex = Math.floor(i * ratio);
      output[i] = srcIndex < inputTensor.length ? inputTensor[srcIndex] : 0;
    }
  }

  return output;
};

module.exports = { loadONNXModel, processONNX };
