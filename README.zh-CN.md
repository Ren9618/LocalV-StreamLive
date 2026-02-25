# LocalV-StreamLive 🤖🎙️

🌍 Read this in other languages: [日本語](README.md) | [English](README.en.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md)

LocalV-StreamLive 是一款专注于隐私、完全离线运行于本地 PC 环境的 AI 直播辅助机器人应用套件。
目前，主推的应用 **"Stream Companion"** 是一位 AI 吉祥物，能以毒舌且幽默的方式与 YouTube 直播评论进行互动。

## ✨ 特性 (Features)

*   **🔒 完全本地运行:** 后端采用 Ollama (LLM) 和 VOICEVOX (语音合成)。数据不会上传到任何外部服务器，无需 API 密钥，且无需按量付费。
    *   *注：同时也支持兼容 OpenAI API 格式的提供商（适用于 Ollama 运行吃力，或希望使用自有 API 密钥的情况）。*
*   **🌐 5 种语言支持 (i18n):** 支持中文（简体/繁体）、英语、日语和韩语。应用支持自动检测系统语言，并可在应用内手动切换。
*   **🧠 高级记忆系统:**
    *   **短期记忆:** 理解对话的上下文，实现自然的互动（可调整记忆保留轮数）。
    *   **观众记忆 (SQLite):** 在数据库中记录每位观众的评论次数及特点。AI 会对常客做出更亲切的反应。
*   **🎯 智能过滤系统:**
    *   **点名模式:** 可设置仅当评论包含特定触发词（如 `!ai`）时，AI 才做出反应。
    *   **快速回复:** 对常见的打招呼或 SuperChat 进行快速的预设回复，先于 AI 响应。
    *   **黑名单:** 自动化过滤并忽略包含特定词汇的评论。
*   **📺 OBS Studio 联动 (画面叠加):**
    *   **透明字幕覆盖:** 只需将其作为浏览器源加载，即可在直播画面上以透明背景显示 AI 的回复字幕。
    *   **隐藏跳过内容:** 自动隐藏前缀为 `[跳过]` 或 `[忽略]` 的 AI 思考日志，保持画面整洁。
    *   **自定义设计:** 可在应用设置界面直观地调整边框颜色、字体大小、动画速度等。
*   **🎧 音频输出路由:** 将音频输出路由至虚拟音频设备（如 VB-Cable），以便在 OBS 中单独捕获声音。
*   **🧹 自动释放内存:** 包含内存管理功能，在此应用关闭时自动从 VRAM 中卸载 Ollama 的 LLM 模型。

## 🏗️ 架构

*   **Frontend:** React + TypeScript + Vite
*   **Backend:** Electron + Node.js
*   **Database:** SQLite3 (持久化观众数据)
*   **Local AI Engine:** [Ollama](https://ollama.ai/)
*   **Local Voice Engine:** [VOICEVOX](https://voicevox.hiroshiba.jp/)

## 🚀 安装与启动 (Getting Started)

### 1. 准备工作
1.  **Ollama**: 从[官网](https://ollama.ai/)安装，在终端运行 `ollama run llama3.1` 等命令下载并加载模型。
2.  **VOICEVOX**: 从[官网](https://voicevox.hiroshiba.jp/)安装并启动应用，保持编辑器窗口打开（它监听 `50021` 端口）。
3.  **虚拟音频线（可选）**: 如果想在 OBS 中分离音频，推荐使用 [VB-Cable](https://vb-audio.com/Cable/)。

### 2. 初始化
```bash
git clone https://github.com/Ren9618/LocalV-StreamLive.git
cd LocalV-StreamLive/apps/stream-companion/electron-app
npm install
```

### 3. 启动
```bash
npm run dev
```

## 🎥 OBS 联动指南

### 🔊 音频联动
1. 在应用的“设置” > “音频设置”中，选择输出设备（例如 "CABLE Input"）。
2. 在 OBS 中，添加一个“音频输入采集”项，并选择 "CABLE Output"。

### 📺 视频（字幕）联动
1. 点击应用右下角的 “🔗 复制 OBS 用 URL”，使用复制的链接（`http://localhost:25252/`）。
2. 在 OBS 中添加一个“浏览器”来源，并粘贴该链接。
3. 从应用的“设置”标签中打开“OBS 叠加设置”，可一边预览一边直观地自定义字体大小、颜色、背景和动画效果。

## 📜 许可证
本项目采用 [MIT 许可证](LICENSE) 授权。

**免责声明:**  
本软件使用了生成式 AI。我们对 AI 生成的输出内容不承担任何责任。在使用外部工具（如 VOICEVOX）时，请务必遵守其相应的服务条款。
