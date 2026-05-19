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

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../client/build')));

let pythonProcess = null;

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'audio') {
        const { audio, settings, model } = data;
        let processedAudio;

        try {
          if (model === 'RVC') {
            processedAudio = await processRVC(audio, settings);
          } else {
            processedAudio = await processONNX(audio, settings);
          }
          ws.send(JSON.stringify({ type: 'processedAudio', data: processedAudio }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      } else if (data.type === 'startServer') {
        startPythonServer();
        ws.send(JSON.stringify({ type: 'serverStatus', running: true }));
      } else if (data.type === 'stopServer') {
        stopPythonServer();
        ws.send(JSON.stringify({ type: 'serverStatus', running: false }));
      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (err) {
      console.error('Failed to process message:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
  ws.on('error', (err) => console.error('WebSocket error:', err.message));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', pythonServer: !!pythonProcess });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

function startPythonServer() {
  if (pythonProcess) {
    console.log('Python server is already running');
    return;
  }
  pythonProcess = spawn('python', [path.join(__dirname, '../python_server/python_server.py')]);
  pythonProcess.stdout.on('data', (data) => console.log(`Python server: ${data}`));
  pythonProcess.stderr.on('data', (data) => console.error(`Python server error: ${data}`));
  pythonProcess.on('close', (code) => {
    console.log(`Python server exited with code ${code}`);
    pythonProcess = null;
  });
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
  loadRVCModel().catch((err) => console.warn('RVC model load skipped:', err.message));
  loadONNXModel().catch((err) => console.warn('ONNX model load skipped:', err.message));
});

process.on('SIGINT', () => {
  stopPythonServer();
  process.exit();
});

process.on('SIGTERM', () => {
  stopPythonServer();
  process.exit();
});
