# OpenVoiceChanger

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-3-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

<p align="center">
  실시간 AI 음성 변환 웹 애플리케이션.<br/>
  ONNX 및 RVC 모델을 활용한 저지연 WebSocket 오디오 파이프라인으로 실시간 음성 변환을 수행합니다.
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> •
  <a href="#기능">기능</a> •
  <a href="#아키텍처">아키텍처</a> •
  <a href="#모델-지원">모델</a> •
  <a href="#설정">설정</a> •
  <a href="README.md">English</a> •
  <a href="README_JP.md">日本語</a>
</p>

---

## 기능

- **실시간 음성 변환** — AudioWorklet을 활용한 저지연 바이너리 WebSocket 스트리밍
- **다양한 모델 형식** — ONNX Runtime 및 RVC v2 (PyTorch) 지원
- **자동 GPU 감지** — CUDA가 사용 가능한 경우 자동으로 활용하며, 불가능한 경우 CPU로 폴백
- **웹 기반 UI** — 드래그 앤 드롭 모델 업로드가 가능한 다크 테마 인터페이스
- **오디오 모니터링** — 실시간 입출력 음량 미터 및 지연 시간 표시
- **장치 선택** — 브라우저에서 입출력 오디오 장치 선택 가능
- **설정 유지** — localStorage를 통한 세션 간 음성 설정 저장
- **Docker 지원** — CPU 및 GPU 프로필을 지원하는 원커맨드 배포

## 빠른 시작

### Docker (권장)

```bash
docker compose up --build
# http://localhost:8000 에 접속
```

### GPU 지원

```bash
docker compose --profile gpu up --build
```

### 개발 환경

```bash
# 의존성 설치
make install

# 백엔드 + 프론트엔드 개발 서버 실행
make dev

# 프론트엔드: http://localhost:5173
# 백엔드 API 문서: http://localhost:8000/docs
```

### 수동 설정

```bash
# 백엔드
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
PYTHONPATH=. uvicorn backend.main:app --reload

# 프론트엔드 (별도 터미널)
cd frontend && npm install && npm run dev
```

## 아키텍처

```
Browser (Vite + React 18)              Python (FastAPI)
┌─────────────────────┐              ┌─────────────────────┐
│ AudioWorklet Capture │──binary WS──▶│ WebSocket Router    │
│ AudioWorklet Playback│◀─binary WS──│   ├ ONNX Processor  │
│ React UI (Dark)      │──REST API──▶│   └ RVC Processor   │
│ TailwindCSS          │◀─REST API──│ REST Router (Models) │
└─────────────────────┘              │ Static File Serving  │
                                     └─────────────────────┘
```

### 주요 설계 결정

| 결정 | 근거 |
|------|------|
| **바이너리 WebSocket** | 4096 샘플 기준: 바이너리 16KB vs JSON 160KB. 초당 12 청크 전송 시 차이가 매우 큼 |
| **AudioWorklet** | MediaRecorder는 수백 ms의 지연을 추가하며 압축된 오디오를 출력함. Worklet은 전용 오디오 스레드에서 샘플 수준의 정밀도로 실행됨 |
| **단일 서버** | Node.js 프록시 없음 — FastAPI가 WebSocket, REST, 정적 파일을 모두 처리. 하나의 프로세스, 추가 홉 없음 |
| **단일 활성 모델** | 모델은 500MB~2GB의 GPU 메모리를 사용. 한 번에 하나만 로드하여 OOM 방지 |
| **모델 없이 서버 시작 가능** | 서버를 먼저 시작한 뒤 웹 UI에서 첫 번째 모델을 업로드 |

### 프로젝트 구조

```
OpenVoiceChanger/
├── backend/
│   ├── main.py                  # FastAPI 앱, lifespan, 정적 파일 마운트
│   ├── config.py                # Pydantic Settings (환경 변수)
│   ├── routers/
│   │   ├── models.py            # REST: 모델 CRUD + 활성화
│   │   └── websocket.py         # WS: 실시간 오디오 스트리밍
│   └── services/
│       ├── model_manager.py     # 모델 레지스트리, 로드/언로드
│       ├── audio_processor.py   # PCM 바이너리 프레임 인코딩
│       ├── onnx_processor.py    # ONNX Runtime 추론
│       └── rvc_processor.py     # PyTorch RVC 추론
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # 메인 앱 오케스트레이션
│   │   ├── components/          # UI 컴포넌트
│   │   ├── hooks/               # useWebSocket, useAudioPipeline, useAudioDevices
│   │   └── lib/                 # API 클라이언트, 상수, AudioWorklet 프로세서
│   └── public/
│       └── audioWorklet.js      # Capture + Playback AudioWorklet 프로세서
├── models/                      # 모델 저장소 (UI를 통해 업로드)
├── Dockerfile                   # 멀티스테이지 (Node 빌드 → Python 런타임)
├── docker-compose.yml           # CPU 기본 + GPU 프로필
└── Makefile                     # dev, build, docker 명령어
```

## 모델 지원

| 형식 | 엔진 | 용도 |
|------|------|------|
| `.onnx` | ONNX Runtime | 범용 음성 변환 모델 |
| `.pth` | PyTorch | RVC v2 음성 변환 모델 |

### 사용 방법

1. 서버를 시작합니다 (`make dev` 또는 `docker compose up`)
2. 웹 UI를 엽니다
3. 모델 파일 (`.onnx` 또는 `.pth`)을 업로드 영역에 드래그 앤 드롭합니다
4. 업로드된 모델에서 **Activate**를 클릭합니다
5. 오디오 장치를 선택하고 **Start Voice Changer**를 클릭합니다
6. 피치 시프트와 F0 방식을 실시간으로 조절합니다

## API

백엔드는 REST API와 WebSocket 엔드포인트를 제공합니다:

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `GET` | `/health` | 헬스 체크 |
| `GET` | `/api/config` | 서버 설정 (샘플 레이트, 청크 크기) |
| `GET` | `/api/models/` | 전체 모델 목록 |
| `POST` | `/api/models/upload` | 모델 파일 업로드 |
| `DELETE` | `/api/models/{name}` | 모델 삭제 |
| `POST` | `/api/models/{name}/activate` | 모델 활성화 |
| `POST` | `/api/models/deactivate` | 현재 모델 비활성화 |
| `GET` | `/api/models/active` | 활성 모델 정보 조회 |
| `WS` | `/ws/audio` | 실시간 오디오 스트리밍 |

서버 실행 중 `/docs` (Swagger UI)에서 인터랙티브 API 문서를 확인할 수 있습니다.

### WebSocket 프로토콜

1. `/ws/audio`에 **연결**합니다
2. **JSON 설정 전송**: `{"sample_rate": 40000, "chunk_size": 4096}`
3. **바이너리 오디오 프레임 전송**: `[uint32 seq_num][uint32 reserved][float32[] PCM samples]`
4. 동일한 형식으로 **바이너리 오디오 프레임 수신**
5. 언제든지 **JSON 설정 전송 가능**: `{"pitch_shift": 3.0, "f0_method": "harvest"}`

## 설정

모든 설정은 `OVC_` 접두사를 가진 환경 변수로 관리됩니다:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OVC_MODELS_DIR` | `models` | 모델 파일 디렉토리 |
| `OVC_HOST` | `0.0.0.0` | 서버 바인드 주소 |
| `OVC_PORT` | `8000` | 서버 포트 |
| `OVC_SAMPLE_RATE` | `40000` | 오디오 샘플 레이트 (Hz) |
| `OVC_CHUNK_SIZE` | `4096` | 오디오 청크 크기 (샘플) |
| `OVC_CORS_ORIGINS` | `["*"]` | 허용된 CORS 출처 |
| `OVC_LOG_LEVEL` | `info` | 로깅 레벨 |

## Makefile 명령어

| 명령어 | 설명 |
|--------|------|
| `make install` | 백엔드 + 프론트엔드 의존성 설치 |
| `make dev` | 백엔드 및 프론트엔드 개발 서버 실행 |
| `make dev-backend` | 백엔드만 실행 (핫 리로드 포함) |
| `make dev-frontend` | 프론트엔드만 실행 |
| `make build` | 프론트엔드 프로덕션 빌드 |
| `make docker` | Docker로 빌드 및 실행 (CPU) |
| `make docker-gpu` | Docker로 빌드 및 실행 (GPU) |
| `make clean` | 빌드 결과물 제거 |

## 요구 사항

### 개발 환경
- Python 3.10+
- Node.js 18+
- npm

### 프로덕션 (Docker)
- Docker + Docker Compose
- NVIDIA Container Toolkit (GPU 지원 시 필요)

## 라이선스

[MIT](LICENSE)
