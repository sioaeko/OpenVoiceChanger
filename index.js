const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// ONNX 모델 경로 설정
const onnxModelPath = path.join(__dirname, 'path/to/your/model.onnx');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// WebSocket 서버 설정
wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('message', (message) => {
        console.log(`Received message => ${message}`);
        // 메시지 처리 로직 추가
    });
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Express 서버 설정
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// 서버 시작
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
