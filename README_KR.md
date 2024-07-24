# Realtime Voice Changer

## 프로젝트 개요

[English](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README.md) | [한국어](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README_KR.md)

Realtime Voice Changer는 웹 기반의 실시간 음성 변조 애플리케이션입니다. 이 프로젝트는 React를 사용한 프론트엔드, Node.js 기반의 백엔드 서버, 그리고 Python으로 구현된 음성 처리 서버로 구성되어 있습니다.

![GitHub](https://img.shields.io/github/license/sioaeko/OpenVoiceChanger)
![GitHub stars](https://img.shields.io/github/stars/sioaeko/OpenVoiceChanger)
![GitHub forks](https://img.shields.io/github/forks/sioaeko/OpenVoiceChanger)

## 주요 기능

- 실시간 음성 입력 및 변조
- 다양한 음성 변조 모델 지원 (RVC, ONNX)
- 웹 인터페이스를 통한 쉬운 제어
- 서버 상태 모니터링

## 기술 스택

- 프론트엔드: React
- 백엔드: Node.js, Express
- 음성 처리 서버: Python, FastAPI
- 실시간 통신: WebSocket
- 음성 처리: ONNX Runtime, PyTorch

## 설치 방법

1. 저장소 클론:
   ```
   git clone https://github.com/sioaeko/realtime-voice-changer.git
   cd realtime-voice-changer
   ```

2. 의존성 설치:
   ```
   chmod +x install_dependencies.sh
   ./install_dependencies.sh
   ```
   이 스크립트는 클라이언트, 서버, 그리고 Python 환경의 모든 의존성을 설치합니다.

## 실행 방법

1. Node.js 서버 시작:
   ```
   cd server
   npm start
   ```

2. Python 서버 시작:
   ```
   cd python_server
   source venv/bin/activate  # Windows의 경우: venv\Scripts\activate
   python python_server.py
   ```

3. 클라이언트 시작:
   ```
   cd client
   npm start
   ```

4. 웹 브라우저에서 `http://localhost:3000` 접속

## 사용 방법

1. 웹 인터페이스에서 "Server Control" 섹션의 "start" 버튼을 클릭하여 서버를 시작합니다.
2. "Model Setting" 섹션에서 원하는 모델과 설정을 선택합니다.
3. "Device Setting" 섹션에서 오디오 입력 및 출력 장치를 선택합니다.
4. "Record" 버튼을 클릭하여 음성 입력을 시작합니다.
5. 변조된 음성이 실시간으로 출력됩니다.

## 프로젝트 구조

```
realtime-voice-changer/
│
├── client/                 # React 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   │   └── VoiceChangerDesktop.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
│
├── server/                 # Node.js 백엔드
│   ├── models/
│   ├── rvc-model.js
│   ├── onnx-model.js
│   ├── index.js
│   └── package.json
│
├── python_server/          # Python 음성 처리 서버
│   ├── python_server.py
│   └── requirements.txt
│
├── install_dependencies.sh
└── README.md
```


## 라이선스

이 프로젝트는 MIT 라이선스에 따라 라이선스가 부여됩니다. 자세한 내용은 [LICENSE](https://github.com/sioaeko/OpenVoiceChanger/blob/main/LICENSE) 파일을 참조하십시오.

## Thanks for

- [ONNX Runtime](https://github.com/microsoft/onnxruntime)
- [websocket](https://www.npmjs.com/package/ws)
- [expressjs](https://expressjs.com/)
- [ngrok](https://ngrok.com/)
