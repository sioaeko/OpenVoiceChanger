
# OpenVoiceChanger(OVC) 

[English](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README.md) | [한국어](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README_KR.md)

This project is an application that transforms voice in real-time using WebSockets and ONNX/TensorFlow/PyTorch.

By integrating the latest RVC (Realtime Voice Cloning) technology, it processes voice data in real-time and applies various voice effects.

![GitHub](https://img.shields.io/github/license/sioaeko/OpenVoiceChanger)
![GitHub stars](https://img.shields.io/github/stars/sioaeko/OpenVoiceChanger)
![GitHub forks](https://img.shields.io/github/forks/sioaeko/OpenVoiceChanger)

## Features

- Real-time audio processing using ONNX and TensorFlow.js
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
   ```
   git clone https://github.com/yourusername/realtime-voice-changer.git
   cd realtime-voice-changer
   ```

### 2. Install dependencies:
   ```
   chmod +x install_dependencies.sh
   ./install_dependencies.sh
   ```

### 3. Start the servers:
   - Node.js server:
     ```
     cd server
     npm start
     ```
   - Python server:
     ```
     cd python_server
     source venv/bin/activate
     python python_server.py
     ```

### 4. Start the client:
   ```
   cd client
   npm start
   ```

5. Open a web browser and navigate to `http://localhost:3000`.
   

### 3. Host the server without port forwarding using ngrok
Use ngrok to host the local server externally without port forwarding.

#### 1. Start ngrok for the HTTP server
```bash
ngrok http 3000
 ```

### 4. Set up the frontend
Ensure the frontend is connected to the ngrok URL of the WebSocket server.
```javascript
// Frontend example code
const ws = new WebSocket('ws://your-ngrok-url.ngrok.io');
 ```

### 5. Project Structure
```plaintext
realtime-voice-changer/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   └── VoiceChangerDesktop.js
│   │   ├── App.js
│   │   └── index.js
│   ├── public/
│   └── package.json
│
├── server/
│   ├── models/
│   │   ├── rvc-model.onnx
│   │   ├── voice-changer.onnx
│   │   └── rvc_model.pt
│   ├── rvc-model.js
│   ├── onnx-model.js
│   ├── index.js
│   └── package.json
│
├── python_server/
│   ├── python_server.py
│   └── requirements.txt
│
├── install_dependencies.sh  # Python dependencies file (if needed)
└── README.md 
```

## License

This project is licensed under the MIT License. For more details, refer to the [LICENSE](https://github.com/sioaeko/OpenVoiceChanger/blob/main/LICENSE) file.

## Thanks for

- [ONNX Runtime](https://github.com/microsoft/onnxruntime)
- [ngrok](https://ngrok.com/)
