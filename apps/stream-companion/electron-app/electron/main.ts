import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
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

// ログエントリをレンダラーに通知する
function pushLogEntry(entry: LogEntry) {
  logs.push(entry);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-entry', entry);
  }
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
