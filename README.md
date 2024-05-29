# OpenVoiceChanger(OVC) 

이 프로젝트는 WebSockets와 ONNX/TensorFlow/PyTorch를 사용하여 실시간으로 음성을 변환하는 애플리케이션입니다.

최신 RVC(Realtime Voice Cloning) 기술을 통합하여 음성 데이터를 실시간으로 처리하고 다양한 음성 효과를 적용할 수 있습니다.

## 특징

- ONNX와 TensorFlow.js를 사용한 실시간 오디오 처리
- 실시간 통신을 위한 WebSocket 서버
- HTTP 요청 처리를 위한 Express 서버
- 다양한 음성 효과 설정 가능
- RVC 모델을 사용하여 실시간 음성 클로닝을 지원합니다.

## 사전 요구 사항

- Node.js
- npm (Node Package Manager)
- Python (PyTorch 처리를 위해 필요)
- ngrok

## 설치

### 1. 리포지토리 클론:

   ```bash
   git clone https://github.com/sioaeko/OpenVoiceChanger.git
   cd OpenVoiceChanger
   ```


### 2. 의존성 npm 설치:

   ```bash
   npm install
   ```

### 3. 유의사항

   - ONNX 모델 파일이 ./path/to/your/model.onnx에 있는지 확인합니다.
   - PyTorch를 사용하는 경우, Python 환경이 설정되고 의존성이 설치되었는지 확인합니다.

## 사용법

### 1. Express 서버 실행
Express 서버는 오디오 데이터 처리를 위한 HTTP 요청을 처리합니다.
 ```bash
 npm start
 ```

### 2. Websocket 서버 실행
WebSocket 서버는 실시간 오디오 처리를 담당합니다.
```bash
npm run websocket
 ```

### 3. ngrok을 이용하여 서버를 포트포워딩 없이 호스팅
ngrok을 사용하여 로컬 서버를 포트포워딩 없이 외부에 호스팅할 수 있습니다.

#### 1. HTTP 서버 을 위한 ngrok 시작
```bash
ngrok http 3001
 ```
#### 2. websocket 서버 을 위한 ngrok 시작
```bash
ngrok http 3002
 ```

### 4. 프론트엔드 세팅
프론트엔드가 WebSocket 서버의 ngrok URL에 연결되었는지 확인합니다.
```javascript
// 프론트엔드 예제 코드
const ws = new WebSocket('ws://your-ngrok-url.ngrok.io');
 ```

### 5. 프로젝트 구조
```ardunio
/realtime-voice-changer
├── .gitignore
├── package.json
├── server
│   ├── server.js
│   └── websocket-server.js
├── pages
│   ├── index.js
│   └── api
│       └── process-audio.js
└── README.md
```
## 라이선스

이 프로젝트는 MIT 라이선스에 따라 라이선스가 부여됩니다. 자세한 내용은 [LICENSE](https://github.com/sioaeko/OpenVoiceChanger/blob/main/LICENSE) 파일을 참조하십시오.

## Thanks for

- [ONNX Runtime](https://github.com/microsoft/onnxruntime)
- [websocket](https://www.npmjs.com/package/ws)
- [expressjs](https://expressjs.com/)
- [ngrok](https://ngrok.com/)
