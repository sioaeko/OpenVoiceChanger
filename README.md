# OpenVoiceChanger

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-3-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

<p align="center">
  Real-time AI voice changer web application.<br/>
  Route a microphone through ONNX or RVC models with a low-latency WebSocket audio pipeline.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#model-support">Model Support</a> •
  <a href="#api">API</a> •
  <a href="#configuration">Configuration</a> •
  <a href="README_KR.md">한국어</a> •
  <a href="README_JP.md">日本語</a>
</p>

---

## Features

### Realtime studio
- Real-time voice conversion with binary WebSocket streaming and AudioWorklet
- ONNX and RVC model support, plus a **model-free DSP mode** (pitch shifting and effects with no checkpoint loaded)
- Live pitch **and formant** shifting, F0 method selection (PM / Harvest / Crepe / RMVPE / FCPE), and RVC advanced controls (index rate, RMS mix, protect)
- **12-effect server-side DSP rack**: noise gate, robot, whisper, telephone, distortion, bitcrush, chorus, echo, reverb, tone EQ, compressor, output gain — all streaming-safe with per-connection state
- **16 built-in voice presets** (Chipmunk, Deep Voice, Robot, Ghost, Telephone, Stadium, …) plus save/delete for your own presets
- Real-time spectrum visualizer, VU meters with peak hold, latency sparkline, and a server timing breakdown (model / DSP / network)
- **Output recorder** — capture the converted voice and download it as WAV

### Offline converter
- Upload a whole audio file (wav / mp3 / flac / ogg / m4a) and render it through the active model + effect chain to a downloadable WAV

### Management
- Drag-and-drop model upload (`.pth` / `.pt` / `.onnx` + companion `.index` files), one active model at a time
- Model metadata badges: RVC version, target sample rate, F0 support, index presence, device
- Session settings modal for sample rate, chunk size, and ONNX / PyTorch / GPU / CUDA runtime visibility

## Screenshots

### Studio

![Studio — realtime workspace](docs/images/main-ui.png)

The realtime workspace: live spectrum, device routing, output recorder, VU meters with a
model / DSP / network latency breakdown, and pitch, formant, and F0 method controls.

### Presets & effects rack

![Voice presets and DSP effects rack](docs/images/effects-rack.png)

16 one-click voice presets and the 12-effect server-side DSP chain. Everything here works
with or without a voice model — enable an effect and it applies to the live stream instantly.

### Models

![Model bay](docs/images/models.png)

Drag-and-drop upload for RVC / ONNX checkpoints and companion `.index` files, with metadata
badges and one-click activation.

### Converter

![Offline file converter](docs/images/converter.png)

Render whole audio files through the active model and effect chain, then download the result as WAV.

### Settings

![Session runtime settings](docs/images/settings-modal.png)

Stream defaults plus a live view of what the backend sees: ONNX provider, PyTorch device, GPU, and CUDA.

## Quick Start

The commands below assume Windows PowerShell in the repository root.

### 0. Clone the repository

```powershell
git clone https://github.com/sioaeko/OpenVoiceChanger.git
cd OpenVoiceChanger
```

### 1. Backend setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
pip install --no-deps git+https://github.com/RVC-Project/Retrieval-based-Voice-Conversion
```

### 2. Optional: enable ONNX GPU acceleration

CPU ONNX works with the default requirements. If you want ONNX to use CUDA locally, replace the CPU package with the GPU package:

```powershell
pip uninstall -y onnxruntime
pip install onnxruntime-gpu==1.23.2
```

### 3. Frontend setup

```powershell
cd frontend
npm install
npm run build
cd ..
```

### 4. Prepare model assets

RVC `.pth` / `.pt` models need a HuBERT content encoder file.

```powershell
New-Item -ItemType Directory -Force models\assets | Out-Null
```

Place the file here:

```text
models/assets/hubert_base.pt
```

You can override that path with `OVC_HUBERT_PATH`.

### 5. Start the app

```powershell
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000
```

### 6. Optional: Vite dev mode

Terminal 1:

```powershell
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

Then open `http://127.0.0.1:5173`.

## Model Support

| Format | Engine | Notes |
|--------|--------|-------|
| `.onnx` | ONNX Runtime | CPU by default, CUDA if `onnxruntime-gpu` is installed |
| `.pth` / `.pt` | PyTorch | RVC v1/v2 models, requires `hubert_base.pt` |

## Web UI Flow

1. Open the app in your browser.
2. (Optional) Upload and activate a model in the `Models` tab — without one, the studio runs in pure DSP mode.
3. Pick your input and output devices in the `Studio` tab.
4. Click `Start Voice Changer`.
5. Shape the voice live: pitch, formant, F0 method, effect rack, or a one-click preset.
6. Record the output, or render whole files in the `Converter` tab.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/config` | Sample rate, chunk size, ONNX runtime info, PyTorch runtime info |
| `GET` | `/api/models/` | List uploaded models |
| `POST` | `/api/models/upload` | Upload a model file |
| `DELETE` | `/api/models/{name}` | Delete a model |
| `POST` | `/api/models/{name}/activate` | Activate a model |
| `POST` | `/api/models/deactivate` | Deactivate the current model |
| `GET` | `/api/models/active` | Get the active model |
| `GET` | `/api/presets/` | List built-in and user voice presets |
| `POST` | `/api/presets/` | Save a user preset |
| `DELETE` | `/api/presets/{id}` | Delete a user preset |
| `POST` | `/api/convert/` | Offline file conversion (multipart upload → WAV) |
| `WS` | `/ws/audio` | Real-time audio streaming |

Interactive docs are available at `/docs` while the backend is running.

### WebSocket protocol

1. Connect to `/ws/audio`
2. Send JSON config: `{"sample_rate": 40000, "chunk_size": 4096}`
3. Send binary audio frames: `[uint32 seq_num][uint32 reserved][float32[] PCM samples]`
4. Receive processed audio frames in the same format — the response `reserved` field carries the server processing time in hundredths of a millisecond
5. Send settings updates such as
   `{"pitch_shift": 3.0, "formant_shift": -2.0, "f0_method": "rmvpe", "effects": {"reverb": {"enabled": true, "size": 0.6, "mix": 0.4}}}`
6. Receive periodic status JSON: `{"type": "status", "latency_ms": …, "model_ms": …, "dsp_ms": …, "mode": "rvc|onnx|dsp", "effects_active": …}`

## Configuration

Environment variables use the `OVC_` prefix.

| Variable | Default | Description |
|----------|---------|-------------|
| `OVC_MODELS_DIR` | `models` | Model directory |
| `OVC_HOST` | `0.0.0.0` | Backend bind address |
| `OVC_PORT` | `8000` | Backend port |
| `OVC_SAMPLE_RATE` | `40000` | Default sample rate |
| `OVC_CHUNK_SIZE` | `4096` | Default chunk size |
| `OVC_CORS_ORIGINS` | `["*"]` | Allowed CORS origins |
| `OVC_LOG_LEVEL` | `info` | Log level |
| `OVC_HUBERT_PATH` | `models/assets/hubert_base.pt` | HuBERT path for RVC |
| `OVC_RMVPE_ROOT` | `models/assets/rmvpe` | Optional RMVPE assets directory |
| `OVC_RVC_STREAM_CONTEXT_SECONDS` | `1.0` | Per-stream RVC context length |
| `OVC_RVC_INDEX_RATE` | `0.75` | Retrieval mix when a matching `.index` exists |
| `OVC_RVC_FILTER_RADIUS` | `3` | Harvest median filter radius |
| `OVC_RVC_RMS_MIX_RATE` | `0.25` | RMS envelope blend |
| `OVC_RVC_PROTECT` | `0.33` | Consonant protection |
| `OVC_PRESETS_PATH` | `data/presets.json` | User preset storage file |
| `OVC_MAX_CONVERT_SECONDS` | `600` | Max audio length for offline conversion |

## Project Structure

```text
OpenVoiceChanger/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── routers/
│   └── services/
├── frontend/
│   ├── public/
│   └── src/
├── models/
├── README.md
├── README_KR.md
├── README_JP.md
└── Makefile
```

## Makefile

The included `Makefile` is a convenience for POSIX shells or WSL.

| Command | Description |
|---------|-------------|
| `make install` | Install backend and frontend dependencies |
| `make dev` | Run backend and frontend dev servers |
| `make dev-backend` | Run backend only |
| `make dev-frontend` | Run frontend only |
| `make build` | Build the frontend |
| `make clean` | Remove build artifacts |

## Requirements

- Python 3.10+
- Node.js 18+
- npm

## License

[MIT](LICENSE)
