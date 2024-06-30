const { InferenceSession } = require('onnxruntime-node');
const path = require('path');
const fs = require('fs');

let onnxSession;

const loadONNXModel = async () => {
  if (!onnxSession) {
    const modelPath = path.join(__dirname, 'models', 'voice-changer.onnx');
    if (fs.existsSync(modelPath)) {
      onnxSession = await InferenceSession.create(modelPath);
      console.log('ONNX model loaded successfully');
    } else {
      console.error('ONNX model file not found');
    }
  }
};

const processONNX = async (audioBuffer, settings) => {
  if (!onnxSession) {
    throw new Error('ONNX model not loaded');
  }
  
  // Convert audioBuffer to Float32Array
  const inputTensor = new Float32Array(audioBuffer);

  // Apply settings
  // This is a placeholder. You'll need to implement the actual logic based on your model's requirements
  const adjustedTensor = applySettings(inputTensor, settings);

  // Create ONNX tensor
  const tensor = new onnxSession.Tensor('float32', adjustedTensor, [1, adjustedTensor.length]);

  // Run inference
  const results = await onnxSession.run({ input: tensor });
  const output = results.output.data;

  return output;
};

const applySettings = (inputTensor, settings) => {
  // Placeholder function. Implement the logic to apply settings to the input tensor
  // This might include adjusting pitch, applying effects, etc.
  return inputTensor;
};

module.exports = { loadONNXModel, processONNX };
