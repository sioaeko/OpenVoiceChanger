const express = require('express');
const bodyParser = require('body-parser');
const { InferenceSession } = require('onnxruntime-node');
const tf = require('@tensorflow/tfjs-node');

const app = express();
const port = 3001;

app.use(bodyParser.json());

let session;

// Load ONNX model
const loadModel = async () => {
  session = await InferenceSession.create('./path/to/your/model.onnx');
};

loadModel();

app.post('/process-audio', async (req, res) => {
  const audioBuffer = req.body.audioBuffer;
  const inputTensor = new tf.Tensor(new Float32Array(audioBuffer), [1, audioBuffer.length / 4, 4]);

  const results = await session.run({ input: inputTensor });
  const output = results.output.data;

  res.send({ processedAudio: output });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
