const WebSocket = require('ws');
const { processRVC } = require('./rvc-model'); // RVC 모델 로드 및 처리 함수 가져오기

const port = process.env.PORT || 3002;
const wss = new WebSocket.Server({ port });

wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    const audioBuffer = JSON.parse(message).audioBuffer;
    const processedAudio = await processAudio(audioBuffer);
    const rvcProcessedAudio = await processRVC(audioBuffer); // RVC 처리

    ws.send(JSON.stringify({ processedAudio, rvcProcessedAudio }));
  });
});

async function processAudio(audioBuffer) {
  // 여기에 ONNX 또는 PyTorch를 사용한 오디오 처리 로직을 추가합니다.
  // 이 예제에서는 단순히 입력된 오디오 버퍼를 반환합니다.
  return audioBuffer; 
}

console.log(`WebSocket server running on ws://localhost:${port}`);
