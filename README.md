# Realtime Voice Changer

## Project Overview

![스크린샷, 2024-06-30 21-59-50](https://github.com/sioaeko/OpenVoiceChanger/assets/101755125/b8dc7a42-c7f8-4729-871d-dbd0e1d370d3)

[English](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README.md) | [한국어](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README_KR.md)

Realtime Voice Changer is a web-based application for real-time voice modification. This project consists of a React frontend, a Node.js backend server, and a Python-based voice processing server.

![GitHub](https://img.shields.io/github/license/sioaeko/OpenVoiceChanger)
![GitHub stars](https://img.shields.io/github/stars/sioaeko/OpenVoiceChanger)
![GitHub forks](https://img.shields.io/github/forks/sioaeko/OpenVoiceChanger)

## Key Features

- Real-time voice input and modification
- Support for various voice modification models (RVC, ONNX)
- Easy control through web interface
- Server status monitoring

## Tech Stack

- Frontend: React
- Backend: Node.js, Express
- Voice Processing Server: Python, FastAPI
- Real-time Communication: WebSocket
- Voice Processing: ONNX Runtime, PyTorch

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/sioaeko/OpenVoiceChanger.git
   cd OpenVoiceChanger
   ```

2. Install dependencies:
   ```
   chmod +x install_dependencies.sh
   ./install_dependencies.sh
   ```
   This script installs all dependencies for the client, server, and Python environment.

## Running the Application

1. Start the Node.js server:
   ```
   cd server
   npm start
   ```

2. Start the Python server:
   ```
   cd python_server
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   python python_server.py
   ```

3. Start the client:
   ```
   cd client
   npm start
   ```

4. Access the web interface at `http://localhost:3000`

## Usage

1. Click the "start" button in the "Server Control" section of the web interface to start the server.
2. Select the desired model and settings in the "Model Setting" section.
3. Choose audio input and output devices in the "Device Setting" section.
4. Click the "Record" button to start voice input.
5. The modified voice will be output in real-time.

## Project Structure

```
OpenVoiceChanger/
│
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── VoiceChangerDesktop.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
│
├── server/                 # Node.js backend
│   ├── models/
│   ├── rvc-model.js
│   ├── onnx-model.js
│   ├── index.js
│   └── package.json
│
├── python_server/          # Python voice processing server
│   ├── python_server.py
│   └── requirements.txt
│
├── install_dependencies.sh
└── README.md
```

## License

This project is licensed under the MIT License. For more details, refer to the [LICENSE](https://github.com/sioaeko/OpenVoiceChanger/blob/main/LICENSE) file.

## Thanks for

- [ONNX Runtime](https://github.com/microsoft/onnxruntime)
- [ngrok](https://ngrok.com/)
- [torch](https://pytorch.org/)
- [websockets](https://pypi.org/project/websockets/)
- [numpy](https://numpy.org/)
- [uvicorn](https://www.uvicorn.org/)
- [fastapi](https://fastapi.tiangolo.com/ko/)
