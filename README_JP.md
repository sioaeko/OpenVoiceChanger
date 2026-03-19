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
  リアルタイムAIボイスチェンジャー Webアプリケーション。<br/>
  ONNXおよびRVCモデルを使用し、低遅延WebSocketオーディオパイプラインでリアルタイムに声を変換します。
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> •
  <a href="#機能">機能</a> •
  <a href="#アーキテクチャ">アーキテクチャ</a> •
  <a href="#モデルサポート">モデル</a> •
  <a href="#設定">設定</a> •
  <a href="README_KR.md">한국어</a> •
  <a href="README.md">English</a>
</p>

---

## 機能

- **リアルタイム音声変換** — AudioWorkletによる低遅延バイナリWebSocketストリーミング
- **複数モデル形式対応** — ONNX RuntimeおよびRVC v2（PyTorch）をサポート
- **GPU自動検出** — CUDA利用可能時は自動的にGPUを使用し、利用できない場合はCPUにフォールバック
- **WebベースUI** — ドラッグ&ドロップによるモデルアップロード対応のダークテーマインターフェース
- **オーディオモニタリング** — リアルタイムの入出力音量メーターとレイテンシ表示
- **デバイス選択** — ブラウザから入出力オーディオデバイスを選択可能
- **設定の永続化** — localStorageによりセッション間で音声設定を保持
- **Docker対応** — CPUおよびGPUプロファイルによるワンコマンドデプロイ

## クイックスタート

### Docker（推奨）

```bash
docker compose up --build
# http://localhost:8000 を開く
```

### GPUサポート

```bash
docker compose --profile gpu up --build
```

### 開発環境

```bash
# 依存関係のインストール
make install

# バックエンド + フロントエンド開発サーバーの起動
make dev

# フロントエンド: http://localhost:5173
# バックエンドAPIドキュメント: http://localhost:8000/docs
```

### 手動セットアップ

```bash
# バックエンド
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
PYTHONPATH=. uvicorn backend.main:app --reload

# フロントエンド（別ターミナル）
cd frontend && npm install && npm run dev
```

## アーキテクチャ

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

### 主要な設計判断

| 判断 | 理由 |
|------|------|
| **バイナリWebSocket** | 4096サンプル: バイナリ16KB vs JSON 160KB。毎秒12チャンクでは差は非常に大きい |
| **AudioWorklet** | MediaRecorderは数百msのレイテンシを追加し、圧縮オーディオを出力する。Workletは専用オーディオスレッドでサンプルレベルの精度で動作する |
| **シングルサーバー** | Node.jsプロキシ不要 — FastAPIがWebSocket、REST、静的ファイルを処理。1プロセス、余分なホップなし |
| **アクティブモデルは1つ** | モデルは500MB〜2GBのGPUメモリを使用。一度に1つだけロードすることでOOMを防止 |
| **モデルなしでサーバー起動可能** | サーバーを起動してから、Web UIで最初のモデルをアップロード |

### プロジェクト構成

```
OpenVoiceChanger/
├── backend/
│   ├── main.py                  # FastAPIアプリ、ライフスパン、静的マウント
│   ├── config.py                # Pydantic Settings（環境変数）
│   ├── routers/
│   │   ├── models.py            # REST: モデルCRUD + アクティベーション
│   │   └── websocket.py         # WS: リアルタイムオーディオストリーミング
│   └── services/
│       ├── model_manager.py     # モデルレジストリ、ロード/アンロード
│       ├── audio_processor.py   # PCMバイナリフレームエンコーディング
│       ├── onnx_processor.py    # ONNX Runtime推論
│       └── rvc_processor.py     # PyTorch RVC推論
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # メインアプリオーケストレーション
│   │   ├── components/          # UIコンポーネント
│   │   ├── hooks/               # useWebSocket, useAudioPipeline, useAudioDevices
│   │   └── lib/                 # APIクライアント、定数、AudioWorkletプロセッサ
│   └── public/
│       └── audioWorklet.js      # キャプチャ + 再生AudioWorkletプロセッサ
├── models/                      # モデルストレージ（UIからアップロード）
├── Dockerfile                   # マルチステージ（Nodeビルド → Pythonランタイム）
├── docker-compose.yml           # CPUデフォルト + GPUプロファイル
└── Makefile                     # dev、build、dockerコマンド
```

## モデルサポート

| 形式 | エンジン | 用途 |
|------|----------|------|
| `.onnx` | ONNX Runtime | 汎用音声変換モデル |
| `.pth` | PyTorch | RVC v2音声変換モデル |

### 使い方

1. サーバーを起動する（`make dev` または `docker compose up`）
2. Web UIを開く
3. モデルファイル（`.onnx` または `.pth`）をアップロードエリアにドラッグ&ドロップする
4. アップロードしたモデルの**Activate**をクリックする
5. オーディオデバイスを選択し、**Start Voice Changer**をクリックする
6. ピッチシフトとF0メソッドをリアルタイムで調整する

## API

バックエンドはREST APIとWebSocketエンドポイントを公開しています：

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| `GET` | `/health` | ヘルスチェック |
| `GET` | `/api/config` | サーバー設定（サンプルレート、チャンクサイズ） |
| `GET` | `/api/models/` | 全モデルの一覧 |
| `POST` | `/api/models/upload` | モデルファイルのアップロード |
| `DELETE` | `/api/models/{name}` | モデルの削除 |
| `POST` | `/api/models/{name}/activate` | モデルのアクティベーション |
| `POST` | `/api/models/deactivate` | 現在のモデルのディアクティベーション |
| `GET` | `/api/models/active` | アクティブなモデル情報の取得 |
| `WS` | `/ws/audio` | リアルタイムオーディオストリーミング |

サーバー実行中は `/docs`（Swagger UI）でインタラクティブなAPIドキュメントを利用できます。

### WebSocketプロトコル

1. `/ws/audio` に**接続**する
2. **JSON設定を送信**: `{"sample_rate": 40000, "chunk_size": 4096}`
3. **バイナリオーディオフレームを送信**: `[uint32 seq_num][uint32 reserved][float32[] PCMサンプル]`
4. 同じ形式で**バイナリオーディオフレームを受信**する
5. いつでも**JSON設定を送信**可能: `{"pitch_shift": 3.0, "f0_method": "harvest"}`

## 設定

すべての設定は `OVC_` プレフィックス付きの環境変数で行います：

| 変数 | デフォルト値 | 説明 |
|------|-------------|------|
| `OVC_MODELS_DIR` | `models` | モデルファイルのディレクトリ |
| `OVC_HOST` | `0.0.0.0` | サーバーバインドアドレス |
| `OVC_PORT` | `8000` | サーバーポート |
| `OVC_SAMPLE_RATE` | `40000` | オーディオサンプルレート（Hz） |
| `OVC_CHUNK_SIZE` | `4096` | オーディオチャンクサイズ（サンプル数） |
| `OVC_CORS_ORIGINS` | `["*"]` | 許可するCORSオリジン |
| `OVC_LOG_LEVEL` | `info` | ログレベル |

## Makefileコマンド

| コマンド | 説明 |
|----------|------|
| `make install` | バックエンド + フロントエンドの依存関係をインストール |
| `make dev` | バックエンドとフロントエンドの開発サーバーを起動 |
| `make dev-backend` | バックエンドのみ起動（ホットリロード付き） |
| `make dev-frontend` | フロントエンドのみ起動 |
| `make build` | フロントエンドを本番用にビルド |
| `make docker` | Dockerでビルドして起動（CPU） |
| `make docker-gpu` | Dockerでビルドして起動（GPU） |
| `make clean` | ビルド成果物を削除 |

## 要件

### 開発環境
- Python 3.10+
- Node.js 18+
- npm

### 本番環境（Docker）
- Docker + Docker Compose
- NVIDIA Container Toolkit（GPUサポート用）

## ライセンス

[MIT](LICENSE)
