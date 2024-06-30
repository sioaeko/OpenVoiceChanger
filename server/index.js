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
app.use(express.static(path.join(__dirname, '../client/build')));

let pythonProcess = null;

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        if (data.type === 'audio') {
            let processedAudio;
            if (data.model === 'RVC') {
                processedAudio = await processRVC(data.audio, data.settings);
            } else {
                processedAudio = await processONNX(data.audio, data.settings);
            }
            ws.send(JSON.stringify({ type: 'processedAudio', data: processedAudio }));
        } else if (data.type === 'startServer') {
            startPythonServer();
        } else if (data.type === 'stopServer') {
            stopPythonServer();
        }
    });
    ws.on('close', () => console.log('Client disconnected'));
});

function startPythonServer() {
    if (pythonProcess) return;
    pythonProcess = spawn('python', ['../python_server/python_server.py']);
    pythonProcess.stdout.on('data', (data) => console.log(`Python server: ${data}`));
    pythonProcess.stderr.on('data', (data) => console.error(`Python server error: ${data}`));
}

function stopPythonServer() {
    if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
        console.log('Python server stopped');
    }
}

const port = process.env.PORT || 3001;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    loadRVCModel();
    loadONNXModel();
});

process.on('SIGINT', () => {
    stopPythonServer();
    process.exit();
});
