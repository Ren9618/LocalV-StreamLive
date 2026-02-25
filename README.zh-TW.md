# LocalV-StreamLive 🤖🎙️

🌍 Read this in other languages: [日本語](README.md) | [English](README.en.md) | [简体中文](README.zh-CN.md) | [한국어](README.ko.md)

LocalV-StreamLive 是一款專注於隱私、完全離線運行於本地 PC 環境的 AI 直播輔助機器人應用套件。
目前，主推的應用 **"Stream Companion"** 是一位 AI 吉祥物，能以毒舌且幽默的方式與 YouTube 直播評論進行互動。

## ✨ 特性 (Features)

*   **🔒 完全本地運行:** 後端採用 Ollama (LLM) 和 VOICEVOX (語音合成)。資料不會上傳到任何外部伺服器，無需 API 金鑰，且無需按量付費。
    *   *註：同時也支援相容 OpenAI API 格式的提供商（適用於 Ollama 運行吃力，或希望使用自有 API 金鑰的情況）。*
*   **🌐 5 種語言支援 (i18n):** 支援中文（簡體/繁體）、英語、日語和韓語。應用支援自動檢測系統語言，並可在應用內手動切換。
*   **🧠 高級記憶系統:**
    *   **短期記憶:** 理解對話的上下文，實現自然的互動（可調整記憶保留輪數）。
    *   **觀眾記憶 (SQLite):** 在資料庫中記錄每位觀眾的評論次數及特點。AI 會對常客做出更親切的反應。
*   **🎯 智能過濾系統:**
    *   **點名模式:** 可設定僅當評論包含特定觸發詞（如 `!ai`）時，AI 才做出反應。
    *   **快速回覆:** 對常見的打招呼或 SuperChat 進行快速的預設回覆，先於 AI 響應。
    *   **黑名單:** 自動化過濾並忽略包含特定詞彙的評論。
*   **📺 OBS Studio 聯動 (畫面疊加):**
    *   **透明字幕覆蓋:** 只需將其作為瀏覽器來源加載，即可在直播畫面上以透明背景顯示 AI 的回覆字幕。
    *   **隱藏跳過內容:** 自動隱藏前綴為 `[跳過]` 或 `[忽略]` 的 AI 思考日誌，保持畫面整潔。
    *   **自訂設計:** 可在應用設定介面直觀地調整邊框顏色、字體大小、動畫速度等。
*   **🎧 音訊輸出路由:** 將音訊輸出路由至虛擬音訊設備（如 VB-Cable），以便在 OBS 中單獨擷取聲音。
*   **🧹 自動釋放記憶體:** 包含記憶體管理功能，在此應用關閉時自動從 VRAM 中卸載 Ollama 的 LLM 模型。

## 🏗️ 架構

*   **Frontend:** React + TypeScript + Vite
*   **Backend:** Electron + Node.js
*   **Database:** SQLite3 (持久化觀眾資料)
*   **Local AI Engine:** [Ollama](https://ollama.ai/)
*   **Local Voice Engine:** [VOICEVOX](https://voicevox.hiroshiba.jp/)

## 🚀 安裝與啟動 (Getting Started)

### 1. 準備工作
1.  **Ollama**: 從[官網](https://ollama.ai/)安裝，在終端機執行 `ollama run llama3.1` 等命令下載並加載模型。
2.  **VOICEVOX**: 從[官網](https://voicevox.hiroshiba.jp/)安裝並啟動應用，保持編輯器視窗打開（它監聽 `50021` 埠）。
3.  **虛擬音源線（可選）**: 如果想在 OBS 中分離音訊，推薦使用 [VB-Cable](https://vb-audio.com/Cable/)。

### 2. 初始化
```bash
git clone https://github.com/Ren9618/LocalV-StreamLive.git
cd LocalV-StreamLive/apps/stream-companion/electron-app
npm install
```

### 3. 啟動
```bash
npm run dev
```

## 🎥 OBS 聯動指南

### 🔊 音訊聯動
1. 在應用的「設定」 > 「音訊設定」中，選擇輸出設備（例如 "CABLE Input"）。
2. 在 OBS 中，新增一個「音訊輸入擷取」項，並選擇 "CABLE Output"。

### 📺 視訊（字幕）聯動
1. 點擊應用右下角的 「🔗 複製 OBS 用 URL」，使用複製的連結（`http://localhost:25252/`）。
2. 在 OBS 中新增一個「瀏覽器」來源，並貼上該連結。
3. 從應用的「設定」標籤中打開「OBS 疊加設定」，可一邊預覽一邊直觀地自訂字體大小、顏色、背景和動畫效果。

## 📜 授權條款
本專案採用 [MIT 授權條款](LICENSE) 授權。

**免責聲明:**  
本軟體使用了生成式 AI。我們對 AI 生成的輸出內容不承擔任何責任。在使用外部工具（如 VOICEVOX）時，請務必遵守其相應的服務條款。
