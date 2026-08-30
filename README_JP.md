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

### リアルタイムスタジオ
- AudioWorklet とバイナリ WebSocket によるリアルタイム音声変換
- ONNX と RVC モデル対応 + **モデル不要の DSP モード**（チェックポイントなしでピッチシフトとエフェクトを使用可能）
- リアルタイムのピッチ **とフォルマント** シフト、F0 方式選択（PM / Harvest / Crepe / RMVPE / FCPE）、RVC 詳細パラメータ（index rate、RMS mix、protect）
- **サーバーサイド 12 種エフェクトラック**: ノイズゲート、ロボット、ウィスパー、電話、ディストーション、ビットクラッシュ、コーラス、エコー、リバーブ、トーン EQ、コンプレッサー、出力ゲイン
- **内蔵ボイスプリセット 16 種**（チップマンク、ディープボイス、ロボット、ゴーストなど）+ Voice Lab の全状態を保存するユーザープリセット
- **Silence Saver** — 無音が続く間は重いモデル推論を休止しつつ DSP の残響を維持し、音声が戻った最初のチャンクで再開
- **計測ベースのパフォーマンスプロファイル**（Responsive / Balanced / Stable）— 直近の p95 往復レイテンシとサーバー処理時間からチャンクサイズを推奨
- リアルタイムスペクトラムビジュアライザー、ピークホールド付き VU メーター、レイテンシスパークライン、サーバー処理時間の内訳（モデル / DSP / ネットワーク）、推論 duty モニタリング
- **出力レコーダー** — 変換後の声を WAV でダウンロード

### オフライン変換
- オーディオファイル（wav / mp3 / flac / ogg / m4a）をアップロードし、アクティブモデル + 現在の Voice Lab 設定 + エフェクトチェーンでレンダリングして WAV をダウンロード

### 管理
- ドラッグ & ドロップのモデルアップロード（`.pth` / `.pt` / `.onnx` + 付随する `.index`）、同時にアクティブなモデルは 1 つ
- モデルメタデータバッジ: RVC バージョン、ターゲットサンプルレート、F0 対応、index 有無、デバイス
- ライト / ダークテーマ、転送プロファイル、Silence Saver、ONNX / PyTorch / GPU / CUDA 状態をまとめた設定モーダル
- キーボードフォーカスが明確な Lucide アイコン操作 + 通常のリポジトリリンクへ自然に切り替わる明示的な GitHub Star 操作

## スクリーンショット

### スタジオ

![スタジオ — リアルタイムワークスペース](docs/images/main-ui.png)

リアルタイムワークスペース: ライブスペクトラム、デバイスルーティング、出力レコーダー、
モデル / DSP / ネットワークのレイテンシ内訳付き VU メーター、ピッチ・フォルマント・F0 方式のコントロール。

### プリセット & エフェクトラック

![ボイスプリセットと DSP エフェクトラック](docs/images/effects-rack.png)

ワンクリックのボイスプリセット 16 種とサーバーサイド 12 種の DSP チェーン。
ユーザープリセットは F0、retrieval、filter、RMS、protect の設定も保存します。
モデルなしでもすべて動作し、エフェクトはライブストリームに即時反映されます。

### モデル

![モデルベイ](docs/images/models.png)

RVC / ONNX チェックポイントと付随する `.index` ファイルのドラッグ & ドロップアップロード、
メタデータバッジ、ワンクリックのアクティベート。

### コンバーター

![オフラインファイル変換](docs/images/converter.png)

オーディオファイル全体をアクティブモデル + エフェクトチェーンでレンダリングし、WAV としてダウンロードします。
RVC 変換はリアルタイムストリームの短いコンテキスト窓を使わずファイル全体を処理し、
現在の Index Rate、Filter Radius、RMS Mix、Protect も反映します。

### 設定

![セッションランタイム設定](docs/images/settings-modal.png)

ライト / ダークテーマ、転送プロファイル、計測ベースの推奨、Silence Saver 設定に加え、
バックエンドが認識している ONNX provider、PyTorch device、GPU、CUDA の状態を表示します。

## クイックスタート

以下のコマンドは Windows PowerShell を前提に、リポジトリのルートで実行します。

### 0. リポジトリを clone

```powershell
git clone https://github.com/sioaeko/OpenVoiceChanger.git
cd OpenVoiceChanger
```

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
2. （任意）`Models` タブでモデルをアップロードしてアクティベートする — モデルがなければ純粋な DSP モードで動作します
3. 必要に応じて Settings でパフォーマンスプロファイルと Silence Saver のしきい値を調整する
4. `Studio` タブで入力 / 出力デバイスを選ぶ
5. `Start Voice Changer` を押す
6. ピッチ、フォルマント、F0 方式、エフェクトラック、ワンクリックプリセットで声をリアルタイムに変える
7. <kbd>B</kbd> キー（または `A/B Monitor`）でストリームを止めずに変換音と原音を比較する
8. 出力を録音するか、`Converter` タブでファイル全体を変換する

## API

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| `GET` | `/health` | ヘルスチェック |
| `GET` | `/api/config` | ストリームと Silence Saver のデフォルト、ONNX / PyTorch ランタイム情報 |
| `GET` | `/api/github/star` | 現在の GitHub CLI アカウントの Star 状態を確認 |
| `POST` | `/api/github/star` | 同じ端末のブラウザで明示的に押した場合、このリポジトリに Star を追加 |
| `GET` | `/api/models/` | アップロード済みモデル一覧 |
| `POST` | `/api/models/upload` | モデルアップロード |
| `DELETE` | `/api/models/{name}` | モデル削除 |
| `POST` | `/api/models/{name}/activate` | モデルをアクティベート |
| `POST` | `/api/models/deactivate` | 現在のモデルを無効化 |
| `GET` | `/api/models/active` | アクティブモデル取得 |
| `GET` | `/api/presets/` | 内蔵 + ユーザープリセット一覧 |
| `POST` | `/api/presets/` | ユーザープリセット保存 |
| `DELETE` | `/api/presets/{id}` | ユーザープリセット削除 |
| `POST` | `/api/convert/` | オフラインファイル変換（multipart アップロード → WAV） |
| `WS` | `/ws/audio` | リアルタイムオーディオストリーミング |

バックエンド起動中は `/docs` で Swagger UI を利用できます。

### WebSocket プロトコル

1. `/ws/audio` に接続
2. JSON 設定を送信: `{"sample_rate": 40000, "chunk_size": 4096}`
3. バイナリオーディオフレームを送信: `[uint32 seq_num][uint32 reserved][float32[] PCM samples]`
4. 同じ形式で処理済みオーディオフレームを受信 — レスポンスの `reserved` フィールドにサーバー処理時間（1/100 ms 単位）が入ります
5. 必要に応じて設定を送信:
   `{"pitch_shift": 3.0, "formant_shift": -2.0, "f0_method": "rmvpe", "filter_radius": 3, "silence_saver": true, "silence_threshold_db": -52, "effects": {"reverb": {"enabled": true, "size": 0.6, "mix": 0.4}}}`
6. 定期的なステータス JSON を受信: `{"type": "status", "latency_ms": …, "model_ms": …, "dsp_ms": …, "mode": "rvc|onnx|dsp|bypass", "bypass": false, "inference_sleeping": false, "inference_duty_percent": 100.0, "effects_active": …}`

設定フィールドはすべて任意で、未知のフィールドは無視されるため、本リリースの
前後どちらのクライアント／サーバーとも相互運用できます。

初期 config で送るサンプルレートは、要求値ではなく `AudioContext` が**実際に**
動作しているレート (`audioContext.sampleRate`) を送ってください。ブラウザは
要求を無視することがあり、サーバーはここで報告された値で処理・リサンプルします。

#### 変換バイパス (A/B)

`{"bypass": true}` は入力信号をそのまま返します。ノイズゲート、モデル、ピッチ・
フォルマントシフト、エフェクトラックのすべてを通しません。マイク・WebSocket・
出力ルーティングは動作したままなので、停止ではなく変換後の音との真の A/B 比較に
なります。UI では <kbd>B</kbd> キーで切り替えられます。

これはエフェクトラックの **Bypass all** ボタンとは別物です。後者はエフェクトを
解除するだけで、モデル変換は動作し続けます。

#### パフォーマンスプロファイルと Silence Saver

Settings の **Responsive**、**Balanced**、**Stable** は、それぞれ 2048、4096、
8192 サンプルのチャンクを使います。ライブ測定が 8 件以上集まると、直近の p95
往復レイテンシとモデル + DSP 処理時間から、処理余裕を確保できる最小のプロファイルを
推奨します。ルーティング中に選んだプロファイルは次のセッションに適用され、手動の
サンプルレートとチャンクサイズはルーティング停止までロックされます。

Silence Saver はデフォルトで `-52 dB` にて有効で、`-80` から `-20 dB` まで調整
できます。モデルが有効な状態で入力が 180 ms しきい値を下回ると、そのストリームの
モデルコンテキストを解放して推論をスキップします。エコーとリバーブの残響が自然に
減衰するよう無音で post-effect 段は継続し、音声が戻った最初のチャンクで再開します。
モニターの `Saver` は現在の休止状態、`Duty` はモデル推論対象フレームのうち実際に
推論した割合です。DSP のみのモードは休止しません。

#### GitHub Star ボタン

ヘッダーのボタンは、この固定リポジトリに対する一つの明示的な操作だけを行います。
ループバックブラウザからユーザーが直接押すと、現在認証済みの GitHub CLI（`gh`）
アカウントで `sioaeko/OpenVoiceChanger` に Star を追加し、認証情報はフロントエンドに
渡りません。`gh` がない、未認証、接続できない、または別端末から開いている場合は、
GitHub 上でユーザー自身が判断できる通常のリポジトリリンクに切り替わります。

## 設定

環境変数は `OVC_` プレフィックスを使います。

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `OVC_MODELS_DIR` | `models` | モデルディレクトリ |
| `OVC_HOST` | `127.0.0.1` | バックエンド bind アドレス — 既定はループバックのみ |
| `OVC_PORT` | `8000` | バックエンドポート |
| `OVC_SAMPLE_RATE` | `40000` | クライアントに提案するサンプルレート（実際のレートはブラウザが報告） |
| `OVC_CHUNK_SIZE` | `4096` | 既定のチャンクサイズ |
| `OVC_CORS_ORIGINS` | `["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000"]` | HTTP と音声 WebSocket の両方に適用される origin 許可リスト |
| `OVC_ALLOW_ANY_ORIGIN` | `false` | origin 検証を完全に無効化（信頼できるネットワークのみ） |
| `OVC_LOG_LEVEL` | `info` | ログレベル |
| `OVC_HUBERT_PATH` | `models/assets/hubert_base.pt` | RVC 用 HuBERT パス |
| `OVC_RMVPE_ROOT` | `models/assets/rmvpe` | 任意の RMVPE 資産ディレクトリ |
| `OVC_RVC_STREAM_CONTEXT_SECONDS` | `0.14` | 各ストリームが推論をやり直す 16 kHz 履歴の長さ |
| `OVC_RVC_INDEX_RATE` | `0.75` | `.index` がある場合の retrieval mix |
| `OVC_RVC_FILTER_RADIUS` | `3` | Harvest median filter 半径（3 未満で無効） |
| `OVC_RVC_RMS_MIX_RATE` | `0.25` | RMS envelope blend |
| `OVC_RVC_ALLOW_UNSAFE_CHECKPOINTS` | `false` | 安全な読み込みに失敗したチェックポイントの unpickle を許可（[セキュリティ](#セキュリティ)参照） |
| `OVC_PRESETS_PATH` | `data/presets.json` | ユーザープリセット保存ファイル |
| `OVC_MAX_CONVERT_SECONDS` | `600` | オフライン変換の最大オーディオ長 |
| `OVC_RVC_PROTECT` | `0.33` | 子音保護値 |

`OVC_RVC_STREAM_CONTEXT_SECONDS` はバッファサイズではなくレイテンシと品質の
トレードオフです。各チャンクはこのウィンドウ全体に対して推論されるため、値を
大きくすると連続性は向上しますが、チャンクごとの推論コストが倍増します。
既定の 4096 サンプルチャンクでは `0.14` がリアルタイムの余裕を保ちます。

## セキュリティ

このスタジオはモデルチェックポイントをアップロードして実行し、マイクを開くため、
既定値はシングルユーザーのマシンを前提としています。

### ネットワークアクセス

- **bind アドレス**: `OVC_HOST` の既定は `127.0.0.1` です。変更しない限り、
  マシン外から API に到達できません。
- **origin**: クロスオリジンの HTTP リクエストと WebSocket ハンドシェイクは
  `OVC_CORS_ORIGINS` で検証されます。`Origin` ヘッダーを持たないリクエスト
  （curl、ネイティブクライアント、テスト）は許可され、不透明な `null` origin は
  拒否されます。
- **same-origin は常に許可**: このバックエンドが配信したページはどのアドレスでも
  検証を通過するため、フロントエンドを LAN ホストに移しても許可リストの変更は
  不要です。悪意ある第三者のページはブラウザが自身の origin を送るため通過できません。

ブラウザは WebSocket に same-origin ポリシーを適用しないため、この検証がないと
訪問した任意のサイトがこのバックエンド経由でマイクストリームを開けてしまいます。

LAN 上の別デバイスから使う場合:

```bash
OVC_HOST=0.0.0.0 python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

同じバックエンドからビルド済みフロントエンドを配信する場合、追加設定は不要です。
Vite 開発サーバーを別ホストで動かす場合のみ、その origin を追加してください:

```bash
export OVC_CORS_ORIGINS='["http://192.168.1.50:5173"]'
```

なおブラウザはセキュアな origin でのみマイク取得を許可します。平文 HTTP では
`localhost` 以外で `getUserMedia` が利用できません。LAN 配置には HTTPS を使うか、
ホストマシン上で使用してください。

### モデルチェックポイント

RVC の `.pth` は Python の pickle であり、PyTorch の従来の `weights_only=False`
で読み込むとファイル作成者の任意コードが実行されます。チェックポイントは Web の
アップロードエンドポイント経由で届くため、バックエンドは PyTorch の安全な
weights-only モードで読み込みます（numpy 値を保存したチェックポイントも読める
よう、データ専用の numpy シンボルを追加しています）。

その方法で読み込めないチェックポイントは、黙って unpickle せずに説明付きの
エラーで有効化が失敗します。信頼できるファイルに限り、デプロイごとに明示的に
オプトインしてください:

```bash
OVC_RVC_ALLOW_UNSAFE_CHECKPOINTS=true python -m uvicorn backend.main:app
```

このパスを通るたびに、バックエンドはファイル名を含む警告をログに出力します。

## テスト

```bash
pip install -r backend/requirements-test.txt
python -m pytest          # バックエンド

cd frontend && npm install
npm test                  # フロントエンド
npm run build
```

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
