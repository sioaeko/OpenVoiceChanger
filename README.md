
# OpenVoiceChanger(OVC) 

This project is an application that transforms voice in real-time using WebSockets and ONNX/TensorFlow/PyTorch.

By integrating the latest RVC (Realtime Voice Cloning) technology, it processes voice data in real-time and applies various voice effects.

## Features

- Real-time audio processing using ONNX and TensorFlow.js
- WebSocket server for real-time communication
- Express server for handling HTTP requests
- Various voice effect settings
- Supports real-time voice cloning using the RVC model

## Prerequisites

- Node.js
- npm (Node Package Manager)
- Python (required for PyTorch processing)
- ngrok

## Installation

### 1. Clone the repository:

   ```bash
   git clone https://github.com/sioaeko/OpenVoiceChanger.git
   cd OpenVoiceChanger
   ```

### 2. Install npm dependencies:

   ```bash
   npm install
   ```

### 3. Notes

   - Ensure the ONNX model file is located at ./path/to/your/model.onnx.
   - If using PyTorch, ensure the Python environment is set up and dependencies are installed.

## Usage

### 1. Start the Express server
The Express server handles HTTP requests for audio data processing.
 ```bash
 npm start
 ```

### 2. Start the WebSocket server
The WebSocket server handles real-time audio processing.
```bash
npm run websocket
 ```

### 3. Host the server without port forwarding using ngrok
Use ngrok to host the local server externally without port forwarding.

#### 1. Start ngrok for the HTTP server
```bash
ngrok http 3001
 ```
#### 2. Start ngrok for the WebSocket server
```bash
ngrok http 3002
 ```

### 4. Set up the frontend
Ensure the frontend is connected to the ngrok URL of the WebSocket server.
```javascript
// Frontend example code
const ws = new WebSocket('ws://your-ngrok-url.ngrok.io');
 ```

### 5. Project Structure
```plaintext
OpenVoiceChanger/
├── .github/
│   └── workflows/
│       └── node.js.yml      # GitHub Actions configuration file
├── node_modules/             # npm dependencies directory (created during npm install)
├── path/
│   └── to/
│       └── your/
│           └── model.onnx    # ONNX model file
├── venv/                     # Python virtual environment directory (created by install_dependencies.sh)
├── .gitignore
├── LICENSE
├── README.md
├── index.js                  # Server configuration file
├── install_dependencies.sh   # Dependency installation script
├── package.json
├── package-lock.json
└── requirements.txt          # Python dependencies file (if needed)
```

## License

This project is licensed under the MIT License. For more details, refer to the [LICENSE](https://github.com/sioaeko/OpenVoiceChanger/blob/main/LICENSE) file.

## Thanks for

- [ONNX Runtime](https://github.com/microsoft/onnxruntime)
- [websocket](https://www.npmjs.com/package/ws)
- [expressjs](https://expressjs.com/)
- [ngrok](https://ngrok.com/)
