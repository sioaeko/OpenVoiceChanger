const WebSocket = require('ws');

const port = process.env.PORT || 3002;
const wss = new WebSocket.Server({ port });

wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    const audioBuffer = JSON.parse(message).audioBuffer;
    // 여기에 ONNX 또는 PyTorch를 사용한 오디오 처리 로직을 추가합니다.
    const processedAudio = await processAudio(audioBuffer);
    ws.send(JSON.stringify({ processedAudio }));
  });
});

async function processAudio(audioBuffer) {
  // 여기에 ONNX 또는 PyTorch를 사용한 오디오 처리 로직을 추가합니다.
  // 이 예제에서는 단순히 입력된 오디오 버퍼를 반환합니다.
  return audioBuffer; 
}

console.log(`WebSocket server running on ws://localhost:${port}`);
