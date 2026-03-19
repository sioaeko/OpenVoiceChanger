# OpenVoiceChanger

Real-time AI voice changer web application. Transform your voice in real time using ONNX and RVC models, powered by a low-latency WebSocket audio pipeline.

## Features

- Real-time voice conversion via WebSocket
- ONNX and RVC model support
- Low-latency AudioWorklet pipeline
- Dark theme UI
- Docker support (CPU & GPU)

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
make install
make dev
# Frontend: http://localhost:5173
# Backend API docs: http://localhost:8000/docs
```

## Architecture

- **Frontend:** Vite + React 18 + TailwindCSS
- **Backend:** Python FastAPI
- **Audio:** Binary WebSocket with AudioWorklet
- **Models:** ONNX Runtime / PyTorch RVC

## Model Support

- `.onnx` files -- ONNX Runtime inference
- `.pth` files -- RVC v2 inference

Upload models through the web UI after starting the server.

## Configuration

Environment variables (prefix `OVC_`):

| Variable | Default | Description |
|---|---|---|
| `OVC_MODELS_DIR` | `models` | Directory for model files |
| `OVC_HOST` | `0.0.0.0` | Server bind address |
| `OVC_PORT` | `8000` | Server port |
| `OVC_SAMPLE_RATE` | `40000` | Audio sample rate in Hz |
| `OVC_CHUNK_SIZE` | `4096` | Audio chunk size in samples |
| `OVC_CORS_ORIGINS` | `["*"]` | Allowed CORS origins |
| `OVC_LOG_LEVEL` | `info` | Logging level |

## License

MIT
