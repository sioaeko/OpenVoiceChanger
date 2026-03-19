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
  Real-time AI voice changer web application.<br/>
  Transform your voice in real time using ONNX and RVC models with a low-latency WebSocket audio pipeline.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#model-support">Models</a> •
  <a href="#configuration">Configuration</a> •
  <a href="README_KR.md">한국어</a> •
  <a href="README_JP.md">日本語</a>
</p>

---

## Features

- **Real-time voice conversion** — Low-latency binary WebSocket streaming with AudioWorklet
- **Multiple model formats** — ONNX Runtime and RVC v2 (PyTorch) support
- **Auto GPU detection** — Automatically uses CUDA when available, falls back to CPU
- **Web-based UI** — Dark theme interface with drag-and-drop model upload
- **Audio monitoring** — Real-time input/output volume meters and latency display
- **Device selection** — Choose input/output audio devices from the browser
- **Settings persistence** — Voice settings saved across sessions via localStorage
- **Docker ready** — One-command deployment with CPU and GPU profiles

## Quick Start

### Docker (Recommended)

```bash
docker compose up --build
# Open http://localhost:8000
```

### GPU Support

```bash
docker compose --profile gpu up --build
```

### Development

```bash
# Install dependencies
make install

# Run backend + frontend dev servers
make dev

# Frontend: http://localhost:5173
# Backend API docs: http://localhost:8000/docs
```

### Manual Setup

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
PYTHONPATH=. uvicorn backend.main:app --reload

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

## Architecture

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

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Binary WebSocket** | 4096 samples: binary 16KB vs JSON 160KB. At 12 chunks/sec the difference is massive |
| **AudioWorklet** | MediaRecorder adds hundreds of ms latency and outputs compressed audio. Worklet runs on a dedicated audio thread with sample-level precision |
| **Single server** | No Node.js proxy — FastAPI handles WebSocket, REST, and static files. One process, zero extra hops |
| **One active model** | Models use 500MB–2GB GPU memory. Loading one at a time prevents OOM |
| **Server runs without models** | Start the server, then upload your first model through the web UI |

### Project Structure

```
OpenVoiceChanger/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, static mount
│   ├── config.py                # Pydantic Settings (env vars)
│   ├── routers/
│   │   ├── models.py            # REST: model CRUD + activation
│   │   └── websocket.py         # WS: real-time audio streaming
│   └── services/
│       ├── model_manager.py     # Model registry, load/unload
│       ├── audio_processor.py   # PCM binary frame encoding
│       ├── onnx_processor.py    # ONNX Runtime inference
│       └── rvc_processor.py     # PyTorch RVC inference
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main app orchestration
│   │   ├── components/          # UI components
│   │   ├── hooks/               # useWebSocket, useAudioPipeline, useAudioDevices
│   │   └── lib/                 # API client, constants, AudioWorklet processors
│   └── public/
│       └── audioWorklet.js      # Capture + Playback AudioWorklet processors
├── models/                      # Model storage (upload via UI)
├── Dockerfile                   # Multi-stage (Node build → Python runtime)
├── docker-compose.yml           # CPU default + GPU profile
└── Makefile                     # dev, build, docker commands
```

## Model Support

| Format | Engine | Usage |
|--------|--------|-------|
| `.onnx` | ONNX Runtime | General voice conversion models |
| `.pth` | PyTorch | RVC v2 voice conversion models |

### How to Use

1. Start the server (`make dev` or `docker compose up`)
2. Open the web UI
3. Drag and drop a model file (`.onnx` or `.pth`) into the upload area
4. Click **Activate** on the uploaded model
5. Select your audio devices and click **Start Voice Changer**
6. Adjust pitch shift and F0 method in real time

## API

The backend exposes a REST API and WebSocket endpoint:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/config` | Server configuration (sample rate, chunk size) |
| `GET` | `/api/models/` | List all models |
| `POST` | `/api/models/upload` | Upload a model file |
| `DELETE` | `/api/models/{name}` | Delete a model |
| `POST` | `/api/models/{name}/activate` | Activate a model |
| `POST` | `/api/models/deactivate` | Deactivate current model |
| `GET` | `/api/models/active` | Get active model info |
| `WS` | `/ws/audio` | Real-time audio streaming |

Interactive API docs available at `/docs` (Swagger UI) when the server is running.

### WebSocket Protocol

1. **Connect** to `/ws/audio`
2. **Send JSON config**: `{"sample_rate": 40000, "chunk_size": 4096}`
3. **Send binary audio frames**: `[uint32 seq_num][uint32 reserved][float32[] PCM samples]`
4. **Receive binary audio frames** in the same format
5. **Send JSON settings** anytime: `{"pitch_shift": 3.0, "f0_method": "harvest"}`

## Configuration

All settings via environment variables with `OVC_` prefix:

| Variable | Default | Description |
|----------|---------|-------------|
| `OVC_MODELS_DIR` | `models` | Directory for model files |
| `OVC_HOST` | `0.0.0.0` | Server bind address |
| `OVC_PORT` | `8000` | Server port |
| `OVC_SAMPLE_RATE` | `40000` | Audio sample rate (Hz) |
| `OVC_CHUNK_SIZE` | `4096` | Audio chunk size (samples) |
| `OVC_CORS_ORIGINS` | `["*"]` | Allowed CORS origins |
| `OVC_LOG_LEVEL` | `info` | Logging level |

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make install` | Install backend + frontend dependencies |
| `make dev` | Run backend and frontend dev servers |
| `make dev-backend` | Run backend only (with hot reload) |
| `make dev-frontend` | Run frontend only |
| `make build` | Build frontend for production |
| `make docker` | Build and run with Docker (CPU) |
| `make docker-gpu` | Build and run with Docker (GPU) |
| `make clean` | Remove build artifacts |

## Requirements

### Development
- Python 3.10+
- Node.js 18+
- npm

### Production (Docker)
- Docker + Docker Compose
- NVIDIA Container Toolkit (for GPU support)

## License

[MIT](LICENSE)
