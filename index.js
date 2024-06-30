const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { spawn } = require('child_process');
const { loadRVCModel, processRVC } = require('./rvc-model');
const { loadONNXModel, processONNX } = require('./onnx-model');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let pythonProcess = null;

// WebSocket 서버 설정
wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('message', async (message) => {
        console.log(`Received message => ${message}`);
        const data = JSON.parse(message);
        
        if (data.type === 'audio') {
            const { audioBuffer, settings, model } = data;
            let processedAudio;
            if (model === 'RVC') {
                processedAudio = await processRVC(audioBuffer, settings);
            } else {
                processedAudio = await processONNX(audioBuffer, settings);
            }
            ws.send(JSON.stringify({ type: 'processedAudio', data: processedAudio }));
        } else if (data.type === 'startServer') {
            startPythonServer();
        } else if (data.type === 'stopServer') {
            stopPythonServer();
        }
    });
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Express 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload-model', (req, res) => {
    // 모델 업로드 로직 구현
    res.json({ message: 'Model uploaded successfully' });
});

// Python 서버 시작
function startPythonServer() {
    if (pythonProcess) {
        console.log('Python server is already running');
        return;
    }
    pythonProcess = spawn('python', ['python_server.py']);
    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python server: ${data}`);
    });
    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python server error: ${data}`);
    });
}

// Python 서버 중지
function stopPythonServer() {
    if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
        console.log('Python server stopped');
    }
}

// 서버 시작
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
    loadRVCModel();
    loadONNXModel();
});

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
    stopPythonServer();
    process.exit();
});
