# LocalV-StreamLive 🤖🎙️

🌍 Read this in other languages: [English](README.en.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md)

LocalV-StreamLiveは、あなたのPCで完結する「プライバシー重視・完全オフライン」のAI配信ボット＆アシスタントツール群です。
現在、メインアプリとしてYouTube Liveの配信コメントに毒舌でツッコミを入れるAIマスコット **「Stream Companion」** を搭載しています。

## ✨ 特徴 (Features)

*   **🔒 完全ローカル稼働:** Ollama (LLM) と VOICEVOX (音声合成) をバックエンドに使用。外部サーバーへのデータ送信なし、APIキー不要、従量課金なしで利用可能です。
    *   ※OpenAIベースのAPI互換プロバイダにも対応しています（Ollamaが重い環境や、お持ちのAPIキーを使いたい場合向け）。
*   **🌐 5言語対応 (i18n):** 日本語、English、中国語(簡体字/繁体字)、韓国語の多言語表示をサポート。システム言語自動検出＆アプリ内手動切り替えに対応。
*   **🧠 高度な記憶システム:**
    *   **短期記憶:** 会話の直近の文脈を理解し、自然な掛け合いを実現（記憶保持数の調整が可能）。
    *   **視聴者記憶 (SQLite):** 視聴者ごとのコメント回数や特徴をデータベースに記録。常連さんには親しげに反応します。
*   **🎯 インテリジェントなフィルター機能:**
    *   **指名モード:** `!ai` などの特定のトリガーがある時だけAIが反応するように設定可能。
    *   **クイックリプライ:** 定番の挨拶やスパチャコメントには、AIに先行して定型文で高速レスポンス。
    *   **ブラックリスト:** 特定の単語を含むコメントを自動的に無視。
*   **📺 OBS Studio 連携 (オーバーレイ):**
    *   **透過字幕オーバーレイ:** ブラウザソースとして読み込むだけで、配信画面に透過背景の字幕としてAIの返答を表示。
    *   **スキップ非表示:** `[スキップ]` や `[無視]` などのAI思考ログは自動で画面から隠蔽されます。
    *   **デザインカスタマイズ:** 枠の色、フォントサイズ、アニメーション速度などをアプリ内の設定画面から直感的に変更可能。
*   **🎧 オーディオ出力ルーティング:** 音声を仮想オーディオデバイス（VB-Cable等）に送り、OBSで個別にキャプチャ可能。
*   **🧹 自動メモリ解放:** アプリ終了時にOllamaのLLMモデルを自動でVRAMから解放するメモリ管理機能付き。

## 🏗️ アーキテクチャ

*   **Frontend:** React + TypeScript + Vite
*   **Backend:** Electron + Node.js
*   **Database:** SQLite3 (視聴者データの永続化)
*   **Local AI Engine:** [Ollama](https://ollama.ai/)
*   **Local Voice Engine:** [VOICEVOX](https://voicevox.hiroshiba.jp/)

## 🚀 インストールと起動 (Getting Started)

### 1. 事前準備
1.  **Ollama**: [公式HP](https://ollama.ai/)からインストールし、ターミナルで `ollama run llama3.1` 等を実行してモデルをダウンロードしておいてください。
2.  **VOICEVOX**: [公式HP](https://voicevox.hiroshiba.jp/)からインストールし、アプリを起動してエディタ画面を開いておいてください（ポート `50021` で待機します）。
3.  **仮想オーディオ（任意）**: 音声をOBSで分けたい場合は [VB-Cable](https://vb-audio.com/Cable/) 等が推奨されます。

### 2. セットアップ
```bash
git clone https://github.com/Ren9618/LocalV-StreamLive.git
cd LocalV-StreamLive/apps/stream-companion/electron-app
npm install
```

### 3. 起動
```bash
npm run dev
```

## 🎥 OBSとの連携方法

### 🔊 音声の連携
1. アプリの「設定」＞「音声設定」で、音声出力デバイスに「CABLE Input」等を選択。
2. OBSの「音声入力キャプチャ」で「CABLE Output」を追加。

### 📺 映像（字幕）の連携
1. アプリの右下の「🔗 OBS用URLをコピー」をクリックし、コピーしたURL（`http://localhost:25252/`）を使用します。
2. OBSで「ブラウザソース」を追加し、URLを貼り付けます。
3. アプリ内の「設定」タブから「OBSオーバーレイ設定」を開き、フォントサイズ・配色・背景・アニメーション効果などをプレビューしながらカスタマイズできます。

## 📜 ライセンス (License)
本プロジェクトは [MIT License](LICENSE) のもとで公開されています。

**クレジット表記 (Credits):**
*   本アプリケーションの音声合成には **VOICEVOX** を使用しています。
*   配信等でご利用の際は、必ず「**VOICEVOX:（キャラクター名）**」等のクレジット表記を行ってください。詳細は [VOICEVOX 利用規約](https://voicevox.hiroshiba.jp/term/) をご確認ください。

**免責事項:**  
本ソフトウェアは生成AIを使用しています。AIの出力結果に対する責任は負いかねます。また、VOICEVOX等の外部ツールを利用する際は、各ソフトウェアの利用規約を必ず遵守してください。
