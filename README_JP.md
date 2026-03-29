# OpenVoiceChanger

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-3-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

<p align="center">
  リアルタイムAIボイスチェンジャー Webアプリケーション。<br/>
  ONNX または RVC モデルを低遅延の WebSocket オーディオパイプラインで接続します。
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> •
  <a href="#モデルサポート">モデルサポート</a> •
  <a href="#api">API</a> •
  <a href="#設定">設定</a> •
  <a href="README.md">English</a> •
  <a href="README_KR.md">한국어</a>
</p>

---

## 機能

- AudioWorklet とバイナリ WebSocket によるリアルタイム音声変換
- ONNX と RVC モデル対応
- ブラウザから入力 / 出力デバイスを選択
- ストリーミング中にピッチと F0 を調整
- サンプルレート、チャンクサイズ、ランタイム状態を確認できる `Settings` モーダル
- ONNX provider、PyTorch device、GPU、CUDA 状態を表示
- モデルのアップロード、アクティベート、削除を一画面で処理

## クイックスタート

以下のコマンドは Windows PowerShell を前提に、リポジトリのルートで実行します。

### 1. バックエンドセットアップ

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
pip install --no-deps git+https://github.com/RVC-Project/Retrieval-based-Voice-Conversion
```

### 2. 任意: ONNX GPU アクセラレーションを有効化

デフォルトの `requirements.txt` は CPU 版 ONNX Runtime を導入します。ローカルで CUDA を使いたい場合は、CPU 版を削除して GPU 版に置き換えてください。

```powershell
pip uninstall -y onnxruntime
pip install onnxruntime-gpu==1.23.2
```

### 3. フロントエンドセットアップ

```powershell
cd frontend
npm install
npm run build
cd ..
```

### 4. モデル資産の準備

RVC `.pth` / `.pt` モデルには HuBERT コンテンツエンコーダが必要です。

```powershell
New-Item -ItemType Directory -Force models\assets | Out-Null
```

配置先:

```text
models/assets/hubert_base.pt
```

別の場所を使う場合は `OVC_HUBERT_PATH` を設定してください。

### 5. アプリ起動

```powershell
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

ブラウザで開く URL:

```text
http://127.0.0.1:8000
```

### 6. 任意: Vite 開発モード

ターミナル 1:

```powershell
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

ターミナル 2:

```powershell
cd frontend
npm run dev
```

その後 `http://127.0.0.1:5173` を開いてください。

## モデルサポート

| 形式 | エンジン | 備考 |
|------|----------|------|
| `.onnx` | ONNX Runtime | デフォルトは CPU、`onnxruntime-gpu` 導入時は CUDA |
| `.pth` / `.pt` | PyTorch | RVC v1/v2、`hubert_base.pt` が必要 |

## Web UI の流れ

1. ブラウザでアプリを開く
2. `Model Bay` にモデルファイルをアップロードする
3. 使いたいモデルで `Activate` を押す
4. `Settings` を開き、サンプルレート、チャンクサイズ、ランタイム状態を確認する
5. 入力デバイスと出力デバイスを選ぶ
6. `Start Routing` を押す
7. ストリーミング中にピッチと F0 を調整する

## API

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| `GET` | `/health` | ヘルスチェック |
| `GET` | `/api/config` | サンプルレート、チャンクサイズ、ONNX ランタイム情報、PyTorch ランタイム情報 |
| `GET` | `/api/models/` | アップロード済みモデル一覧 |
| `POST` | `/api/models/upload` | モデルアップロード |
| `DELETE` | `/api/models/{name}` | モデル削除 |
| `POST` | `/api/models/{name}/activate` | モデルをアクティベート |
| `POST` | `/api/models/deactivate` | 現在のモデルを無効化 |
| `GET` | `/api/models/active` | アクティブモデル取得 |
| `WS` | `/ws/audio` | リアルタイムオーディオストリーミング |

バックエンド起動中は `/docs` で Swagger UI を利用できます。

### WebSocket プロトコル

1. `/ws/audio` に接続
2. JSON 設定を送信: `{"sample_rate": 40000, "chunk_size": 4096}`
3. バイナリオーディオフレームを送信: `[uint32 seq_num][uint32 reserved][float32[] PCM samples]`
4. 同じ形式で処理済みオーディオフレームを受信
5. 必要に応じて設定を送信: `{"pitch_shift": 3.0, "f0_method": "harvest"}`

## 設定

環境変数は `OVC_` プレフィックスを使います。

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `OVC_MODELS_DIR` | `models` | モデルディレクトリ |
| `OVC_HOST` | `0.0.0.0` | バックエンド bind アドレス |
| `OVC_PORT` | `8000` | バックエンドポート |
| `OVC_SAMPLE_RATE` | `40000` | 既定のサンプルレート |
| `OVC_CHUNK_SIZE` | `4096` | 既定のチャンクサイズ |
| `OVC_CORS_ORIGINS` | `["*"]` | 許可する CORS origin |
| `OVC_LOG_LEVEL` | `info` | ログレベル |
| `OVC_HUBERT_PATH` | `models/assets/hubert_base.pt` | RVC 用 HuBERT パス |
| `OVC_RMVPE_ROOT` | `models/assets/rmvpe` | 任意の RMVPE 資産ディレクトリ |
| `OVC_RVC_STREAM_CONTEXT_SECONDS` | `1.0` | ストリームごとの RVC コンテキスト長 |
| `OVC_RVC_INDEX_RATE` | `0.75` | `.index` がある場合の retrieval mix |
| `OVC_RVC_FILTER_RADIUS` | `3` | Harvest median filter 半径 |
| `OVC_RVC_RMS_MIX_RATE` | `0.25` | RMS envelope blend |
| `OVC_RVC_PROTECT` | `0.33` | 子音保護値 |

## プロジェクト構成

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

`Makefile` は POSIX シェルまたは WSL 向けの補助コマンドです。

| コマンド | 説明 |
|----------|------|
| `make install` | バックエンドとフロントエンドの依存関係をインストール |
| `make dev` | バックエンドとフロントエンドの開発サーバーを起動 |
| `make dev-backend` | バックエンドのみ起動 |
| `make dev-frontend` | フロントエンドのみ起動 |
| `make build` | フロントエンドをビルド |
| `make clean` | ビルド成果物を削除 |

## 要件

- Python 3.10+
- Node.js 18+
- npm

## ライセンス

[MIT](LICENSE)
