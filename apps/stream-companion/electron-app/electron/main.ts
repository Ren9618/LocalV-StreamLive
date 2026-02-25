import { app, BrowserWindow, ipcMain, dialog } from 'electron';
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

// オーバーレイ設定のデフォルト値
const defaultOverlaySettings = {
  boxBg: 'rgba(0, 0, 0, 0.65)',
  boxBorderColor: '#4CAF50',
  boxBorderWidth: '5px',
  boxRadius: '10px',
  userFontSize: '0.9rem',
  userColor: '#aaa',
  replyFontSize: '1.4rem',
  replyColor: '#fff',
  replyFontWeight: '900',
  animationType: 'slideUp',
  animationDuration: '0.3s',
  fadeDuration: '1s',
  displayDuration: 30000,
};

type OverlaySettings = typeof defaultOverlaySettings;

// 視線パス
const overlaySettingsPath = path.join(app.getPath('userData'), 'overlay-settings.json');

function loadOverlaySettings(): OverlaySettings {
  try {
    if (fs.existsSync(overlaySettingsPath)) {
      return { ...defaultOverlaySettings, ...JSON.parse(fs.readFileSync(overlaySettingsPath, 'utf-8')) };
    }
  } catch { /* フォールバック */ }
  return { ...defaultOverlaySettings };
}

function saveOverlaySettings(s: OverlaySettings) {
  fs.writeFileSync(overlaySettingsPath, JSON.stringify(s, null, 2), 'utf-8');
}

function startOverlayServer() {
  const overlayHtmlPath = path.join(app.getPath('userData'), 'overlay.html');

  // v4: /settings エンドポイントから設定を取得して適用する方式
  if (!fs.existsSync(overlayHtmlPath) || !fs.readFileSync(overlayHtmlPath, 'utf-8').includes('overlay-v4')) {
    const defaultHtml = `<!DOCTYPE html>
<!-- overlay-v4 -->
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Stream Companion Overlay</title>
  <style>
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
      bottom: 0; left: 0; right: 0;
      padding: 15px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .message-box {
      background: var(--box-bg);
      padding: 12px 20px;
      border-radius: var(--box-radius);
      max-width: 90%;
      border-left: var(--box-border-width) solid var(--box-border-color);
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      opacity: 1;
      transition: opacity var(--fade-duration) ease-in-out;
      margin-bottom: 8px;
    }
    .anim-slideUp    { animation: slideUp    var(--anim-dur) ease-out; }
    .anim-slideDown  { animation: slideDown  var(--anim-dur) ease-out; }
    .anim-slideLeft  { animation: slideLeft  var(--anim-dur) ease-out; }
    .anim-slideRight { animation: slideRight var(--anim-dur) ease-out; }
    .anim-fadeOnly   { animation: fadeOnly   var(--anim-dur) ease-out; }
    @keyframes slideUp    { from { transform: translateY(30px);  opacity:0 } to { transform: translateY(0); opacity:1 } }
    @keyframes slideDown  { from { transform: translateY(-30px); opacity:0 } to { transform: translateY(0); opacity:1 } }
    @keyframes slideLeft  { from { transform: translateX(50px);  opacity:0 } to { transform: translateX(0); opacity:1 } }
    @keyframes slideRight { from { transform: translateX(-50px); opacity:0 } to { transform: translateX(0); opacity:1 } }
    @keyframes fadeOnly   { from { opacity:0 } to { opacity:1 } }
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
      text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.7);
    }
  </style>
</head>
<body>
  <div id="container"></div>
  <script>
    const container = document.getElementById('container');
    let DISPLAY_DURATION = 30000;
    let ANIM_TYPE = 'slideUp';

    // 起動時にサーバーから設定を取得してCSS変数に適用
    fetch('/settings').then(r => r.json()).then(s => {
      const root = document.documentElement.style;
      root.setProperty('--box-bg', s.boxBg);
      root.setProperty('--box-border-color', s.boxBorderColor);
      root.setProperty('--box-border-width', s.boxBorderWidth);
      root.setProperty('--box-radius', s.boxRadius);
      root.setProperty('--user-font-size', s.userFontSize);
      root.setProperty('--user-color', s.userColor);
      root.setProperty('--reply-font-size', s.replyFontSize);
      root.setProperty('--reply-color', s.replyColor);
      root.setProperty('--reply-font-weight', s.replyFontWeight);
      root.setProperty('--fade-duration', s.fadeDuration);
      root.setProperty('--anim-dur', s.animationDuration);
      DISPLAY_DURATION = s.displayDuration || 30000;
      ANIM_TYPE = s.animationType || 'slideUp';
    }).catch(() => {});

    function trimOverflow() {
      const vh = window.innerHeight;
      while (container.scrollHeight > vh && container.children.length > 1) {
        container.removeChild(container.firstChild);
      }
    }

    function connect() {
      const source = new EventSource('/sse');
      source.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'connected') return;
        if (data.source === 'error') return;
        const box = document.createElement('div');
        box.className = 'message-box anim-' + ANIM_TYPE;
        const u = document.createElement('div'); u.className = 'user'; u.textContent = data.userComment;
        const r = document.createElement('div'); r.className = 'reply'; r.textContent = data.aiReply;
        box.appendChild(u); box.appendChild(r);
        container.appendChild(box);
        trimOverflow();
        setTimeout(() => { box.classList.add('fade-out'); setTimeout(() => box.remove(), 1000); }, DISPLAY_DURATION);
      };
      source.onerror = () => { source.close(); setTimeout(connect, 3000); };
    }
    connect();
  </script>
</body>
</html>`;
    fs.writeFileSync(overlayHtmlPath, defaultHtml, 'utf-8');
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.url === '/') {
      fs.readFile(overlayHtmlPath, (err, data) => {
        if (err) { res.writeHead(500); res.end('Error'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    } else if (req.url === '/settings') {
      // オーバーレイ設定をJSONで返す
      const s = loadOverlaySettings();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(s));
    } else if (req.url === '/sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`);
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

// === IPC: プリセット管理 ===
const presetsDir = path.join(app.getPath('userData'), 'presets');
// presetsディレクトリが無ければ作成
if (!fs.existsSync(presetsDir)) {
  fs.mkdirSync(presetsDir, { recursive: true });
}

// プリセット一覧を取得
ipcMain.handle('get-presets', async () => {
  const files = fs.readdirSync(presetsDir).filter(f => f.endsWith('.lvsp'));
  return files.map(f => ({
    name: path.basename(f, '.lvsp'),
    path: path.join(presetsDir, f),
  }));
});

// プリセットを保存（名前とテキストを受け取り .lvsp ファイルとして保存）
ipcMain.handle('save-preset', async (_event, name: string, text: string) => {
  const safeName = name.replace(/[<>:"/\\|?*]/g, '_'); // ファイル名に使えない文字を置換
  const filePath = path.join(presetsDir, `${safeName}.lvsp`);
  fs.writeFileSync(filePath, text, 'utf-8');
  return { name: safeName, path: filePath };
});

// プリセットを削除
ipcMain.handle('delete-preset', async (_event, name: string) => {
  const filePath = path.join(presetsDir, `${name}.lvsp`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
});

// プリセットを読み込み（名前を指定してテキストを返す）
ipcMain.handle('load-preset', async (_event, name: string) => {
  const filePath = path.join(presetsDir, `${name}.lvsp`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
});

// エクスポート（ファイル保存ダイアログ）
ipcMain.handle('export-prompt', async (_event, text: string, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    title: 'プロンプトをエクスポート',
    defaultPath: `${defaultName || 'prompt'}.lvsp`,
    filters: [
      { name: 'LocalV Prompt', extensions: ['lvsp'] },
      { name: 'テキストファイル', extensions: ['txt'] },
    ],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, text, 'utf-8');
  return true;
});

// インポート（ファイル選択ダイアログ）
ipcMain.handle('import-prompt', async () => {
  const result = await dialog.showOpenDialog({
    title: 'プロンプトをインポート',
    filters: [
      { name: 'プロンプトファイル', extensions: ['lvsp', 'txt'] },
      { name: 'すべてのファイル', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const text = fs.readFileSync(result.filePaths[0], 'utf-8');
  const name = path.basename(result.filePaths[0], path.extname(result.filePaths[0]));
  return { name, text };
});

// === IPC: オーバーレイ設定 ===
ipcMain.handle('get-overlay-settings', async () => loadOverlaySettings());
ipcMain.handle('save-overlay-settings', async (_event, s: any) => {
  saveOverlaySettings({ ...loadOverlaySettings(), ...s });
  return true;
});
