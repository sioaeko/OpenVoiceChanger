import { InferenceSession } from 'onnxruntime-node';

let session;

const loadModel = async () => {
  if (!session) {
    session = await InferenceSession.create('./path/to/your/model.onnx');
  }
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    await loadModel();

    const audioBuffer = req.body.audioBuffer;
    if (!audioBuffer) {
      res.status(400).json({ error: 'No audio buffer provided' });
      return;
    }

    try {
      const inputTensor = new Float32Array(audioBuffer);
      const tensor = new session.Tensor('float32', inputTensor, [1, inputTensor.length]);

      const results = await session.run({ input: tensor });
      const output = results.output.data;

      res.status(200).json({ processedAudio: output });
    } catch (error) {
      console.error('Error processing audio:', error);
      res.status(500).json({ error: 'Failed to process audio' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
