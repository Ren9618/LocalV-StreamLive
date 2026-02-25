import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { createBrain, type AiBrainProvider } from './core/brain';
import { VoiceVoxClient } from './core/voice';
import { SettingsStore } from './core/settings-store';
import { HealthChecker } from './core/health-checker';
import { CommentFilter } from './core/comment-filter';
import { ConversationMemory } from './core/conversation-memory';
import { ViewerMemory } from './core/viewer-memory';

// __dirname の代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === 設定の読み込み ===
const settingsStore = new SettingsStore();
let currentSettings = settingsStore.getAll();

// === サービスインスタンス ===
let brain: AiBrainProvider = createBrain(
  currentSettings.aiProvider,
  currentSettings.aiModel,
  currentSettings.ollamaUrl,
  currentSettings.openaiCompatUrl,
  currentSettings.openaiCompatApiKey
);
let voice = new VoiceVoxClient(currentSettings.voicevoxUrl, currentSettings.speakerId);
const healthChecker = new HealthChecker(
  currentSettings.ollamaUrl,
  currentSettings.voicevoxUrl,
  currentSettings.aiProvider,
  currentSettings.openaiCompatUrl,
  currentSettings.openaiCompatApiKey
);
let commentFilter = new CommentFilter(
  currentSettings.blacklist,
  currentSettings.quickReplies,
  currentSettings.superChatReplies,
  currentSettings.trigger
);
// 短期記憶（会話履歴バッファ）
const conversationMemory = new ConversationMemory(currentSettings.memorySize);
// 視聴者記憶（SQLite）
const viewerMemory = new ViewerMemory();

let mainWindow: BrowserWindow | null = null;

// === ウォームアップ状態 ===
type WarmupStatus = 'warming-up' | 'ready' | 'failed';
let warmupStatus: WarmupStatus = 'warming-up';

// === ログストレージ ===
interface LogEntry {
  id: number;
  timestamp: string;
  userComment: string;
  aiReply: string;
  source: 'ai' | 'filter' | 'error';
  processingMs: number;
}
let logs: LogEntry[] = [];
let logIdCounter = 0;

const sseClients: http.ServerResponse[] = [];

// ログエントリをレンダラーに通知する
function pushLogEntry(entry: LogEntry) {
  logs.push(entry);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-entry', entry);
  }

  // SSEクライアント（OBSブラウザ等）にも送信
  const dataString = JSON.stringify(entry);
  sseClients.forEach(client => {
    client.write(`data: ${dataString}\n\n`);
  });
}

// === オーバーレイ用ローカルサーバー ===
function startOverlayServer() {
  const overlayHtmlPath = path.join(app.getPath('userData'), 'overlay.html');

  if (!fs.existsSync(overlayHtmlPath) || !fs.readFileSync(overlayHtmlPath, 'utf-8').includes('overlay-v3')) {
    const defaultHtml = `<!DOCTYPE html>
<!-- overlay-v3 -->
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Stream Companion Overlay</title>
  <style>
    /*
     * ======================================
     * 🎨 OBSオーバーレイ カスタマイズガイド
     * ======================================
     * 以下の :root 内の値を変更するだけで簡単にデザインを変更できます！
     * ファイルを保存してOBSで「再読み込み」すれば即反映されます。
     */
    :root {
      /* === メッセージボックス === */
      --box-bg: rgba(0, 0, 0, 0.65);         /* 背景色 */
      --box-border-color: #4CAF50;            /* 左端のライン色 */
      --box-border-width: 5px;                /* 左端のライン太さ */
      --box-radius: 10px;                     /* 角丸 */
      --box-padding: 12px 20px;               /* 内余白 */
      --box-margin: 8px;                      /* ボックス間の余白 */
      --box-max-width: 90%;                   /* 最大幅 */

      /* === ユーザーコメント === */
      --user-font-size: 0.9rem;
      --user-color: #aaa;

      /* === AI返答 === */
      --reply-font-size: 1.4rem;
      --reply-color: #fff;
      --reply-font-weight: 900;

      /* === アニメーション === */
      --fade-duration: 1s;                    /* フェードアウトの時間 */
      --display-duration: 30000;              /* 表示時間(ms) JSの値なので下の<script>内で変更 */
      /* 出現アニメーション: slideUp, slideDown, slideLeft, slideRight, fadeOnly */
      --animation-type: slideUp;              /* 出現時のアニメ */
      --animation-duration: 0.3s;             /* アニメの速さ */
    }

    body {
      background-color: transparent !important;
      color: white;
      margin: 0;
      padding: 0;
      overflow: hidden;
      font-family: 'Noto Sans JP', sans-serif;
      height: 100vh;
      box-sizing: border-box;
    }

    #container {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 15px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }

    .message-box {
      background: var(--box-bg);
      padding: var(--box-padding);
      border-radius: var(--box-radius);
      max-width: var(--box-max-width);
      border-left: var(--box-border-width) solid var(--box-border-color);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
      opacity: 1;
      transition: opacity var(--fade-duration) ease-in-out;
      margin-bottom: var(--box-margin);
    }

    /* === 出現アニメーションのバリエーション === */
    .anim-slideUp    { animation: slideUp    var(--animation-duration) ease-out; }
    .anim-slideDown  { animation: slideDown  var(--animation-duration) ease-out; }
    .anim-slideLeft  { animation: slideLeft  var(--animation-duration) ease-out; }
    .anim-slideRight { animation: slideRight var(--animation-duration) ease-out; }
    .anim-fadeOnly   { animation: fadeOnly   var(--animation-duration) ease-out; }

    @keyframes slideUp    { from { transform: translateY(30px);  opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes slideDown  { from { transform: translateY(-30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes slideLeft  { from { transform: translateX(50px);  opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideRight { from { transform: translateX(-50px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes fadeOnly   { from { opacity: 0; } to { opacity: 1; } }

    .fade-out { opacity: 0; }

    .user {
      font-size: var(--user-font-size);
      color: var(--user-color);
      margin-bottom: 4px;
    }

    .reply {
      font-size: var(--reply-font-size);
      font-weight: var(--reply-font-weight);
      color: var(--reply-color);
      line-height: 1.3;
      text-shadow:
        -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000,
        0px 2px 4px rgba(0,0,0,0.7);
    }
  </style>
</head>
<body>
  <div id="container"></div>

  <script>
    const container = document.getElementById('container');

    // ⬇️ ここで表示時間を変更できます（ミリ秒。 30000 = 30秒）
    const DISPLAY_DURATION = 30000;

    // CSS変数からアニメーションタイプを取得
    function getAnimationType() {
      return getComputedStyle(document.documentElement).getPropertyValue('--animation-type').trim() || 'slideUp';
    }

    // 画面からはみ出した古いメッセージを削除する
    function trimOverflow() {
      const viewportHeight = window.innerHeight;
      while (container.scrollHeight > viewportHeight && container.children.length > 1) {
        container.removeChild(container.firstChild);
      }
    }

    // サーバーにリアルタイム接続
    function connect() {
      const source = new EventSource('/sse');

      source.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'connected') return;
        if (data.source === 'error') return;

        const box = document.createElement('div');
        box.className = 'message-box anim-' + getAnimationType();

        const userDiv = document.createElement('div');
        userDiv.className = 'user';
        userDiv.textContent = data.userComment;

        const replyDiv = document.createElement('div');
        replyDiv.className = 'reply';
        replyDiv.textContent = data.aiReply;

        box.appendChild(userDiv);
        box.appendChild(replyDiv);
        container.appendChild(box);

        // 画面に収まるよう古いメッセージを削除
        trimOverflow();

        // 指定時間後にフェードアウトして消す
        setTimeout(() => {
          box.classList.add('fade-out');
          setTimeout(() => box.remove(), 1000);
        }, DISPLAY_DURATION);
      };

      source.onerror = () => {
        source.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
  </script>
</body>
</html>`;
    fs.writeFileSync(overlayHtmlPath, defaultHtml, 'utf-8');
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // OBSなどでも開けるように

    if (req.url === '/') {
      // ユーザーデータ領域にあるHTMLファイルを読み込んで返す
      fs.readFile(overlayHtmlPath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading overlay.html');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    } else if (req.url === '/sse') {
      // ログリアルタイム配信用のSSEエンドポイント
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`); // 初期接続確認
      sseClients.push(res);
      req.on('close', () => {
        const index = sseClients.indexOf(res);
        if (index !== -1) sseClients.splice(index, 1);
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(25252, '127.0.0.1', () => {
    console.log('[Main] Overlay HTTP server listening on http://127.0.0.1:25252');
  }).on('error', (err) => {
    console.error('[Main] Overlay server error:', err);
  });
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log("Preload script path:", preloadPath);

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // 開発中にDevToolsを自動で開きたい場合はコメントを外す
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  createWindow();
  startOverlayServer();

  // ヘルスチェックの定期監視を開始（10秒間隔）
  healthChecker.startMonitoring((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('health-status', status);
    }
  }, 10000);

  // AIモデルのウォームアップ（バックグラウンドで実行）
  warmupStatus = 'warming-up';
  sendWarmupStatus();
  try {
    await brain.warmup();
    warmupStatus = 'ready';
    console.log('[Main] AIウォームアップ完了');
  } catch (error) {
    warmupStatus = 'failed';
    console.error('[Main] AIウォームアップ失敗:', error);
  }
  sendWarmupStatus();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ウォームアップ状態をレンダラーに送信
function sendWarmupStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ai-warmup-status', warmupStatus);
  }
}

app.on('window-all-closed', () => {
  healthChecker.stopMonitoring();
  if (process.platform !== 'darwin') app.quit();
});

// === IPC: コメント送信（フィルター統合済み） ===
ipcMain.handle('send-comment', async (_event, text: string, isSuperChat: boolean = false, username: string = 'Guest') => {
  console.log(`[IPC] Received comment from [${username}]: ${text}${isSuperChat ? ' (スパチャ)' : ''}`);
  const startTime = Date.now();

  // フィルターで判定
  const filterResult = commentFilter.applyFilters(text, isSuperChat);

  // ブラックリストにマッチ → 無視
  if (filterResult.action === 'ignore') {
    console.log(`  🚫 [フィルター] 無視: ${filterResult.filterType}`);
    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      userComment: `[${username}] ${text}`,
      aiReply: `[無視] ${filterResult.filterType}`,
      source: 'filter',
      processingMs: Date.now() - startTime,
    });
    return { reply: null, audioData: null, filtered: true, filterType: filterResult.filterType };
  }

  // 定型文 or スパチャ反応 → 即座に返答
  if (filterResult.action === 'quick-reply' || filterResult.action === 'superchat-reply') {
    const reply = filterResult.reply!;
    console.log(`  ⚡ [フィルター] ${filterResult.filterType}: ${reply}`);
    const processingMs = Date.now() - startTime;

    const audioBuffer = await voice.generateAudio(reply);
    let audioData = null;
    if (audioBuffer) {
      audioData = audioBuffer.toString('base64');
    }

    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      userComment: `[${username}] ${text}`,
      aiReply: reply,
      source: 'filter',
      processingMs,
    });

    return { reply, audioData, filtered: true, filterType: filterResult.filterType };
  }

  // AIに処理させる（トリガー除去済みテキストを使用）
  const aiText = filterResult.cleanedText || text;
  try {
    // 視聴者のコンテキストを取得してシステムプロンプトに結合
    await viewerMemory.recordComment(username);
    const viewerContext = await viewerMemory.getContextPrompt(username);

    const augmentedSystemPrompt = viewerContext
      ? `${currentSettings.systemPrompt}\n\n${viewerContext}`
      : currentSettings.systemPrompt;

    // 短期記憶を含めたメッセージを構築
    const messages = conversationMemory.buildMessages(augmentedSystemPrompt, aiText);
    const reply = await brain.chat(messages);
    console.log(`[IPC] Bot Reply: ${reply}`);
    const processingMs = Date.now() - startTime;

    // 会話履歴に追加
    conversationMemory.addExchange(aiText, reply);

    const audioBuffer = await voice.generateAudio(reply);
    let audioData = null;
    if (audioBuffer) {
      audioData = audioBuffer.toString('base64');
    }

    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      userComment: `[${username}] ${text}`,
      aiReply: reply,
      source: 'ai',
      processingMs,
    });

    return { reply, audioData, filtered: false };
  } catch (error) {
    const processingMs = Date.now() - startTime;
    console.error("[IPC] Error:", error);

    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      userComment: `[${username}] ${text}`,
      aiReply: `エラー: ${error}`,
      source: 'error',
      processingMs,
    });

    throw error;
  }
});

// === IPC: 設定 ===
ipcMain.handle('get-settings', async () => settingsStore.getAll());
ipcMain.handle('get-default-settings', async () => settingsStore.getDefaults());

ipcMain.handle('save-settings', async (_event, newSettings: any) => {
  currentSettings = settingsStore.save(newSettings);
  // プロバイダーに応じたブレインを再生成
  brain = createBrain(
    currentSettings.aiProvider,
    currentSettings.aiModel,
    currentSettings.ollamaUrl,
    currentSettings.openaiCompatUrl,
    currentSettings.openaiCompatApiKey
  );
  voice = new VoiceVoxClient(currentSettings.voicevoxUrl, currentSettings.speakerId);
  healthChecker.updateUrls(
    currentSettings.ollamaUrl,
    currentSettings.voicevoxUrl,
    currentSettings.aiProvider,
    currentSettings.openaiCompatUrl,
    currentSettings.openaiCompatApiKey
  );
  // フィルターも更新
  commentFilter.update(
    currentSettings.blacklist,
    currentSettings.quickReplies,
    currentSettings.superChatReplies,
    currentSettings.trigger
  );
  // 短期記憶のサイズを更新
  conversationMemory.setMaxPairs(currentSettings.memorySize);

  const health = await healthChecker.checkAll();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('health-status', health);
  }
  return { settings: currentSettings, health };
});

// === IPC: フィルター設定 ===
ipcMain.handle('get-filters', async () => {
  return {
    blacklist: currentSettings.blacklist,
    quickReplies: currentSettings.quickReplies,
    superChatReplies: currentSettings.superChatReplies,
    trigger: currentSettings.trigger,
  };
});

ipcMain.handle('save-filters', async (_event, filters: any) => {
  currentSettings = settingsStore.save({
    blacklist: filters.blacklist,
    quickReplies: filters.quickReplies,
    superChatReplies: filters.superChatReplies,
    trigger: filters.trigger,
  });
  commentFilter.update(
    currentSettings.blacklist,
    currentSettings.quickReplies,
    currentSettings.superChatReplies,
    currentSettings.trigger
  );
  return true;
});

// === IPC: ウォームアップ状態取得 ===
ipcMain.handle('get-warmup-status', async () => warmupStatus);

// === IPC: ヘルスチェック ===
ipcMain.handle('check-health', async () => {
  const status = await healthChecker.checkAll();
  return status;
});

// === IPC: ログ ===
ipcMain.handle('get-logs', async () => logs);
ipcMain.handle('clear-logs', async () => {
  logs = [];
  logIdCounter = 0;
  return true;
});
