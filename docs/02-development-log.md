# Google Antigravity × ローカルLLMで「毒舌AI配信ボット」を爆速開発した話

## 1. はじめに
最近、AIエディタ界隈が熱いですね。Cursorが覇権を握りつつある中、Googleからも「Project Antigravity (仮)」という強力な対抗馬が出てきました。
今回は、このAntigravityを使って、**「完全ローカル環境で動く、自分専用のAI配信ボット」** を開発してみました。

### 成果物
*   **名前:** LocalV-StreamLive
*   **機能:** 配信コメントに反応して、AIキャラ（ずんだもん）が毒舌でツッコミを入れてくる。
*   **技術:** Electron + React + Ollama + VoiceVox

---

## 2. なぜ作ったのか？（動機）
「クラウドAI（ChatGPT等）は従量課金だし、プライバシーが気になる…」
「自分のPCにGeForce積んでるんだから、ローカルLLM (Llama 3) を活用したい！」
「ついでに、配信画面にポンと置ける『相棒』が欲しい！」

というわけで、**「ネットに繋がない（Ollamaのダウンロード以外）最強のプライベートAIアプリ」** を目指しました。

---

## 3. アーキテクチャ構成
今回は「モダンかつ軽量」な構成にこだわりました。

*   **Frontend:** React + Vite (UI/Overlay)
*   **Backend:** Electron (Main Process)
*   **AI Brain:** Ollama (Llama 3 / Mistral) via REST API
*   **Voice:** VoiceVox (ずんだもん) via HTTP API

### データの流れ
1.  Reactでコメント入力（またはYouTube APIから取得）
2.  Electron (IPC) → Ollama にプロンプト送信
3.  Ollama が「毒舌キャラ」としてテキスト生成
4.  Electron → VoiceVox にテキスト送信 → 音声データ(WAV)取得
5.  React で音声再生 & 画面表示

---

## 4. Google Antigravity での開発体験と爆速のGUI実装
ここが今回の裏テーマです。
最初はただのCLIスクリプトでしたが、Antigravity (IDE) の強力な支援により、本格的なデスクトップアプリへと一気に進化しました。

*   **環境構築:** `npm create vite` から Electron 導入まで、ほぼAIへの指示だけで完結。
*   **リッチなUIの構築:** IDE内での数回のやり取りで、以下の機能を持つ本格的なダッシュボードが完成しました。
    *   **タブナビゲーション:** 「テスト画面」「フィルター設定」「ログ閲覧」「基本設定」を切り替え。
    *   **ヘルスチェック:** OllamaとVoiceVoxの接続状態をリアルタイムで監視し、ステータスバーに表示。
    *   **ダイナミックな設定画面:** VoiceVoxのキャラクターIDや、Ollamaのモデル一覧をAPIから取得してプルダウンで選択可能に。
*   **感想:** UIコンポーネント (`Settings.tsx`, `App.tsx`) の複雑なステート管理も、Antigravityが意図を汲んで自動生成してくれました。開発者は「作りたい機能」を指示するだけで、面倒なReactのHooks処理やElectronのIPC通信を任せられます。

---

## 5. 実装のポイント（コード解説）

### その1: 脳みそ (Ollama) との接続
`undici` の `fetch` を使い、OllamaのローカルAPI (`http://localhost:11434/api/chat`) を叩くだけ。
ポイントは **「System Prompt」** でキャラ付けすることです。

```typescript
// キャラ設定（プロンプト）
const SYSTEM_PROMPT = `
あなたは配信者の「辛口な相棒」です。
1. タメ口で話すこと。
2. 20文字以内で返すこと。
3. 語尾は「〜だし」「〜じゃん」を使うこと。
`;
```

### その2: GUIとバックエンドのシームレスな通信
Electronの `contextBridge` を使い、React側から安全にOllamaやVoiceVoxの設定を変更できる仕組みを作りました。

```typescript
// React側の呼び出し例
const result = await window.electron.sendComment(userText, isSuperChat);
```
これにより、入力から音声再生までの遅延を最小限に抑えています。

---

## 6. 商用化と倫理的課題についての考察
開発を進める中で、「これ、売れるんじゃないか？」という考えがよぎりました。しかし、商用化にはいくつかの壁があります。

1.  **ライセンスの壁:** VoiceVoxのキャラクター（ずんだもん等）やOllamaのモデル（Llama 3）にはそれぞれ利用規約があります。アプリにこれらを同梱して販売することはライセンス違反のリスクが高いため、「ツール単体」として配布し、ユーザー自身にモデルを用意してもらう設計が必須です。
2.  **市場でのポジショニング:** すでに無料の優秀な配信ツールが多数存在します。単純なツール販売ではなく、「サポート込みのSaaSモデル」や「オープンソース化して開発者支援 (GitHub Sponsors) を募る」といった、体験や信頼に価値を置く戦略が有効だと考えています。

まずはOSSとして公開し、コミュニティの反応を見ながらエコシステムを育てていく予定です。

---

## 7. まとめ・今後の展望
半日足らずで「喋るAIボット」のプロトタイプが完成し、さらに本格的なGUIアプリへと進化しました。
これからの拡張プランとして以下を考えています：

*   **YouTube Live接続:** 実際の配信で使う。
*   **Live2D連携:** 声に合わせてアバターを動かす。
*   **感情分析:** コメントの「荒れ具合」をAIに判定させる。

ローカルLLM × デスクトップアプリ開発、めちゃくちゃ面白いので皆さんもぜひ！

---
*Development powered by Google Antigravity & Ollama*