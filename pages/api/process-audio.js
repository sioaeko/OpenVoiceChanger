import { InferenceSession } from 'onnxruntime-node';
import { processRVC } from '../../server/rvc-model'; // RVC 모델 로드 및 처리 함수 가져오기

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
      // 기존 모델 처리
      const inputTensor = new Float32Array(audioBuffer);
      const tensor = new session.Tensor('float32', inputTensor, [1, inputTensor.length]);

      const results = await session.run({ input: tensor });
      const output = results.output.data;

      // RVC 모델 처리
      const rvcOutput = await processRVC(audioBuffer);

      res.status(200).json({ processedAudio: output, rvcProcessedAudio: rvcOutput });
    } catch (error) {
      console.error('Error processing audio:', error);
      res.status(500).json({ error: 'Failed to process audio' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
