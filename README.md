# LocalV-StreamLive 🤖🎙️

LocalV-StreamLiveは、あなたのPCローカル環境で完結する「プライバシー重視・完全オフライン」のAI配信ボット＆アシスタントツール群です。
第一弾として、配信のコメントに毒舌でツッコミを入れるAIマスコット **「Stream Companion」** を収録しています。

## ✨ 特徴 (Features)

*   **🔒 完全ローカル稼働:** Ollama (LLM) と VoiceVox (音声合成) をバックエンドに使用。APIキー不要で、従量課金もありません。
*   **⚡ 爆速のレスポンス:** Electron + Reactによる軽量なデスクトップアプリ。
*   **🎨 カスタマイズ可能な人格:** システムプロンプトを編集するだけで、「辛口相棒」「熱狂的ファン」など好きなキャラに変更可能。
*   ~~**OBS連携対応:** 背景透過済みのオーバーレイ画面を搭載。OBSのブラウザソースとしてそのまま読み込めます。~~

## 🏗️ アーキテクチャ

*   **Frontend:** React + TypeScript + Vite
*   **Backend:** Electron (IPC通信)
*   **AI Engine:** [Ollama](https://ollama.ai/) (推奨モデル: llama3, mistral 等)
*   **Voice Engine:** [VOICEVOX](https://voicevox.hiroshiba.jp/)

## 🚀 インストールと起動 (Getting Started)

### 1. 事前準備
以下のソフトウェアをPCにインストールし、起動しておいてください。
1.  **Ollama**: [ダウンロード](https://ollama.ai/) (起動後、`ollama run llama3` 等でモデルをダウンロードしてください)
2.  **VOICEVOX**: [ダウンロード](https://voicevox.hiroshiba.jp/) (起動し、バックグラウンドで待機させてください)

### 2. リポジトリのクローン
```bash
git clone https://github.com/Ren9618/LocalV-StreamLive.git
cd LocalV-StreamLive/apps/stream-companion/electron-app
```

### 3. 依存関係のインストールと起動
```bash
npm install
npm run dev
```

## 🔧 開発者向け (Development)
このプロジェクトは **Google Antigravity** によるAI駆動開発で構築されました。
新しいアプリ（例：自分専用のオフラインメモアプリ等）を追加する場合は、`apps/` ディレクトリ配下に作成し、`core/` のロジックを再利用してください。

## 📜 ライセンス (License)
MIT License

**免責事項:**
本ソフトウェアは生成AIを使用しています。AIの出力結果に対する責任は負いかねます。また、VOICEVOX等の外部ツールを利用する際は、各ソフトウェアの利用規約（キャラクターの商用利用制限など）を必ず遵守してください。
