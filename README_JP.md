# リアルタイム音声変換ツール

### プレビュー

![スクリーンショット、2024-06-30 21-59-50]

[English](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README.md) | [한국어](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README_KR.md) | [日本語](https://github.com/sioaeko/OpenVoiceChanger/blob/main/README_JP.md)

リアルタイム音声変換ツールは、リアルタイムで音声を変調するWebベースのアプリケーションです。このプロジェクトは、Reactフロントエンド、Node.jsバックエンドサーバー、そしてPythonベースの音声処理サーバーで構成されています。

![GitHub]
![GitHub stars]
![GitHub forks]

## 主な機能

- リアルタイムの音声入力と変調
- 様々な音声変調モデル（RVC、ONNX）のサポート
- Webインターフェースを通じた簡単な操作
- サーバーステータスのモニタリング

## 技術スタック

- フロントエンド：React
- バックエンド：Node.js、Express
- 音声処理サーバー：Python、FastAPI
- リアルタイム通信：WebSocket
- 音声処理：ONNX Runtime、PyTorch

## インストール方法

1. リポジトリをクローンする：
   ```
   git clone https://github.com/sioaeko/OpenVoiceChanger.git
   cd OpenVoiceChanger
   ```

2. 依存関係をインストールする：
   ```
   chmod +x install_dependencies.sh
   ./install_dependencies.sh
   ```

このスクリプトは、クライアント、サーバー、およびPython環境のすべての依存関係をインストールします。

## アプリケーションの実行

1. Node.jsサーバーを起動する：
```
cd server
npm start
```

2. Pythonサーバーを起動する：
```
cd python_server
source venv/bin/activate # Windowsの場合： venv\Scripts\activate
python python_server.py
```

4. クライアントを起動する：
```
cd client
npm start
```

6. `http://localhost:3000`でWebインターフェースにアクセスする

## 使用方法

1. Webインターフェースの「Server Control」セクションにある「start」ボタンをクリックしてサーバーを起動します。
2. 「Model Setting」セクションで希望のモデルと設定を選択します。
3. 「Device Setting」セクションでオーディオ入力と出力デバイスを選択します。
4. 「Record」ボタンをクリックして音声入力を開始します。
5. 変調された音声がリアルタイムで出力されます。

## プロジェクト構造

OpenVoiceChanger/
│
├── client/                 # Reactフロントエンド
│   ├── src/
│   │   ├── components/
│   │   │   └── VoiceChangerDesktop.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
│
├── server/                 # Node.jsバックエンド
│   ├── models/
│   ├── rvc-model.js
│   ├── onnx-model.js
│   ├── index.js
│   └── package.json
│
├── python_server/          # Python音声処理サーバー
│   ├── python_server.py
│   └── requirements.txt
│
├── install_dependencies.sh
└── README.md

## ライセンス

このプロジェクトはMITライセンスの下でライセンスされています。詳細については、[LICENSE](https://github.com/sioaeko/OpenVoiceChanger/blob/main/LICENSE)ファイルを参照してください。

## 謝辞

- [ONNX Runtime](https://github.com/microsoft/onnxruntime)
- [ngrok](https://ngrok.com/)
- [torch](https://pytorch.org/)
- [websockets](https://pypi.org/project/websockets/)
- [numpy](https://numpy.org/)
- [uvicorn](https://www.uvicorn.org/)
- [fastapi](https://fastapi.tiangolo.com/ko/)
