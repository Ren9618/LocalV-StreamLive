import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { createBrain, type AiBrainProvider } from './core/brain';
import { ErrorCodes } from './core/error-codes';
import { VoiceVoxClient } from './core/voice';
import { VoicegerClient, detectLanguage } from './core/voiceger';
import { startVoiceger, stopVoiceger, isVoicegerInstalled, installVoiceger } from './core/voiceger-manager';
import { SettingsStore } from './core/settings-store';
import { HealthChecker } from './core/health-checker';

interface TTSClient {
  generateAudio(text: string, speakerId?: string | number): Promise<Buffer | null>;
}
import { CommentFilter } from './core/comment-filter';
import { ConversationMemory } from './core/conversation-memory';
import { ViewerMemory } from './core/viewer-memory';
import { LiveChat } from 'youtube-chat';

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
let voice: TTSClient = currentSettings.ttsEngine === 'voiceger'
  ? new VoicegerClient(currentSettings.voicegerUrl)
  : new VoiceVoxClient(currentSettings.voicevoxUrl, currentSettings.speakerId);
const healthChecker = new HealthChecker(
  currentSettings.ollamaUrl,
  currentSettings.voicevoxUrl,
  currentSettings.voicegerUrl,
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
let warmupErrorCode: string | undefined;
let warmupErrorMessage: string | undefined;

// === ログストレージ ===
interface LogEntry {
  id: number;
  timestamp: string;
  username: string;       // ← 新規追加
  userComment: string;    // ピュアなコメント本文のみ
  userLogoUrl?: string;   // ← 新規追加 (YouTube等のアイコンURL)
  aiReply: string;
  source: 'ai' | 'filter' | 'error' | 'debug';
  processingMs: number;
  isSuperChat?: boolean;
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

function pushDebugLog(message: string) {
  console.log(message);
  pushLogEntry({
    id: ++logIdCounter,
    timestamp: new Date().toISOString(),
    username: 'System',
    userComment: message,
    aiReply: '',
    source: 'debug',
    processingMs: 0,
  });
}

// === コメント処理キュー（大量投下対策） ===
interface QueuedComment {
  text: string;
  isSuperChat: boolean;
  username: string;
  userLogoUrl: string | undefined;
  startTime: number;
  source: 'ipc' | 'youtube';
  resolve?: (value: any) => void;
  reject?: (reason: any) => void;
}

const MAX_QUEUE_SIZE = 3; // キューの最大サイズ（これを超えると古いものを破棄）
let commentQueue: QueuedComment[] = [];
let isProcessingQueue = false;
let isProcessingPaused = false; // コメント処理の一時停止フラグ

// キューにコメントを追加（IPC経由 = Promise返却あり、YouTube経由 = fire & forget）
function enqueueComment(item: QueuedComment): Promise<any> | void {
  // 一時停止中はコメントをスキップ
  if (isProcessingPaused) {
    console.log(`  ⏸ [一時停止] コメントをスキップ: ${item.username}: ${item.text}`);
    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      username: item.username,
      userComment: item.text,
      userLogoUrl: item.userLogoUrl,
      aiReply: '[スキップ] コメント処理が一時停止中です',
      source: 'filter',
      processingMs: 0,
      isSuperChat: item.isSuperChat,
    });
    if (item.resolve) item.resolve({ reply: null, audioData: null, filtered: true, filterType: 'paused' });
    return;
  }

  if (item.source === 'ipc') {
    // IPC経由はPromiseで結果を返す必要がある
    return new Promise((resolve, reject) => {
      item.resolve = resolve;
      item.reject = reject;
      commentQueue.push(item);
      // キューが溢れたら古い「YouTube」のコメントを優先的に捨てる
      trimQueue();
      processQueue();
    });
  } else {
    // YouTube経由はfire & forget
    commentQueue.push(item);
    trimQueue();
    processQueue();
  }
}

function trimQueue() {
  while (commentQueue.length > MAX_QUEUE_SIZE) {
    // 先頭（最も古い）のYouTubeコメントを探して捨てる
    const ytIndex = commentQueue.findIndex(q => q.source === 'youtube');
    if (ytIndex >= 0) {
      const dropped = commentQueue.splice(ytIndex, 1)[0];
      console.log(`  ⏭ [キュー] YouTube コメントをスキップ: ${dropped.username}: ${dropped.text}`);
      // スキップされたコメントのログを残す
      pushLogEntry({
        id: ++logIdCounter,
        timestamp: new Date().toISOString(),
        username: dropped.username,
        userComment: dropped.text,
        userLogoUrl: dropped.userLogoUrl,
        aiReply: '[スキップ] 処理キューが満杯のためスキップされました',
        source: 'filter',
        processingMs: 0,
        isSuperChat: dropped.isSuperChat,
      });
    } else {
      // YouTubeコメントがなければ末尾（最新）を捨てる
      break;
    }
  }
}

async function processQueue() {
  if (isProcessingQueue || commentQueue.length === 0) return;
  isProcessingQueue = true;

  while (commentQueue.length > 0) {
    const item = commentQueue.shift()!;
    try {
      const result = await processIncomingComment(item.text, item.isSuperChat, item.username, item.userLogoUrl, item.startTime);
      if (item.resolve) item.resolve(result);
    } catch (e) {
      console.error('[キュー] 処理エラー:', e);
      if (item.reject) item.reject(e);
    }
  }

  isProcessingQueue = false;
}

// === YouTube Live リスナー ===
let youtubeChat: LiveChat | null = null;
let isYoutubeConnected = false;
let youtubeConnectedAt: Date | null = null; // 接続開始時刻（過去ログスキップ用）

function stopYouTubeListener() {
  if (youtubeChat) {
    try { youtubeChat.stop(); } catch (e) { }
    youtubeChat = null;
    isYoutubeConnected = false;
  }
}

async function startYouTubeListener(videoIdOrUrl: string) {
  stopYouTubeListener();
  if (!videoIdOrUrl) return;

  // URLからVideoIDを抽出する簡易ロジック
  let videoId = videoIdOrUrl.trim();
  try {
    if (videoIdOrUrl.includes('youtube.com/watch')) {
      const url = new URL(videoIdOrUrl);
      videoId = url.searchParams.get('v') || videoId;
    } else if (videoIdOrUrl.includes('youtube.com/live/')) {
      // https://www.youtube.com/live/VIDEO_ID 形式
      const url = new URL(videoIdOrUrl);
      const parts = url.pathname.split('/live/');
      if (parts[1]) videoId = parts[1].split('?')[0].split('/')[0];
    } else if (videoIdOrUrl.includes('youtube.com/live_chat')) {
      // https://www.youtube.com/live_chat?...&v=VIDEO_ID 形式
      const url = new URL(videoIdOrUrl);
      videoId = url.searchParams.get('v') || videoId;
    } else if (videoIdOrUrl.includes('youtu.be/')) {
      const url = new URL(videoIdOrUrl);
      videoId = url.pathname.slice(1);
    }
  } catch (e) { }

  console.log(`[YouTube] Extracted Video ID: ${videoId} from input: ${videoIdOrUrl}`);

  try {
    youtubeChat = new LiveChat({ liveId: videoId });

    youtubeChat.on('start', (liveId) => {
      console.log(`[YouTube] Connected to Live ID: ${liveId}`);
      isYoutubeConnected = true;
      youtubeConnectedAt = new Date(); // 接続時刻を記録
    });

    youtubeChat.on('error', (err) => {
      console.error('[YouTube] Error:', err);
      isYoutubeConnected = false;
    });

    youtubeChat.on('end', () => {
      console.log('[YouTube] Live stream ended or disconnected');
      isYoutubeConnected = false;
    });

    youtubeChat.on('chat', async (chatItem) => {
      // 接続前の過去ログをスキップ（再起動時の大量読み込み防止）
      if (youtubeConnectedAt && chatItem.timestamp < youtubeConnectedAt) {
        return;
      }

      const username = chatItem.author.name;
      const channelId = chatItem.author.channelId;
      // 絵文字画像などをプレーンテキストに変換
      const text = chatItem.message.map(m => 'text' in m ? m.text : ('emojiText' in m ? m.emojiText : '')).join('');
      const userLogoUrl = chatItem.author.thumbnail?.url;
      const isSuperChat = !!chatItem.superchat;

      console.log(`[YouTube] Comment from [${username}] (ch:${channelId}): ${text}${isSuperChat ? ' (スパチャ)' : ''}`);
      const startTime = Date.now();

      // キュー経由で処理（大量投下時はスキップされる）
      enqueueComment({ text, isSuperChat, username, userLogoUrl, startTime, source: 'youtube' });
    });

    const ok = await youtubeChat.start();
    if (!ok) {
      console.error('[YouTube] Failed to start standard fetch, trying fallback...');
    }
  } catch (error) {
    console.error('[YouTube] Init Error:', error);
    isYoutubeConnected = false;
  }
}

// 共通コメント処理関数（IPCおよびYouTubeから利用）
async function processIncomingComment(text: string, isSuperChat: boolean, username: string, userLogoUrl: string | undefined, startTime: number) {
  // フィルターで判定
  const filterResult = commentFilter.applyFilters(text, isSuperChat);

  // ブラックリストにマッチ → 無視
  if (filterResult.action === 'ignore') {
    console.log(`  🚫 [フィルター] 無視: ${filterResult.filterType}`);
    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      username,
      userComment: text,
      userLogoUrl,
      aiReply: `[無視] ${filterResult.filterType}`,
      source: 'filter',
      processingMs: Date.now() - startTime,
      isSuperChat,
    });
    return { reply: null, audioData: null, filtered: true, filterType: filterResult.filterType };
  }

  // 定型文 or スパチャ反応 → 即座に返答
  if (filterResult.action === 'quick-reply' || filterResult.action === 'superchat-reply') {
    const reply = filterResult.reply!;
    console.log(`  ⚡ [フィルター] ${filterResult.filterType}: ${reply}`);
    const processingMs = Date.now() - startTime;

    let audioBuffer: Buffer | null = null;
    if (currentSettings.ttsEngine === 'voiceger') {
      audioBuffer = await voice.generateAudio(reply, currentSettings.voicegerSpeakerId);
    } else {
      audioBuffer = await voice.generateAudio(reply);
    }
    let audioData = null;
    if (audioBuffer) {
      audioData = audioBuffer.toString('base64');
      // YouTube経由の場合も音声を再生するためレンダラーに送信
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('play-audio', audioData);
      }
    }

    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      username,
      userComment: text,
      userLogoUrl,
      aiReply: reply,
      source: 'filter',
      processingMs,
      isSuperChat,
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
    // 多言語応答が有効な場合のみ、コメント言語に合わせた返答指示を追加
    let finalSystemPrompt = augmentedSystemPrompt;
    let finalAiText = aiText;
    const isMultiLangEnabled = currentSettings.ttsEngine === 'voiceger'
      ? currentSettings.voicegerMultiLang
      : currentSettings.voicevoxMultiLang;

    if (isMultiLangEnabled) {
      const commentLang = detectLanguage(aiText);
      if (commentLang !== 'Japanese') {
        // システムプロンプトに追加（バックアップ指示）
        finalSystemPrompt = augmentedSystemPrompt + `\n\n===LANGUAGE RULE===\nYou MUST reply ONLY in ${commentLang}. NEVER use Japanese. This is mandatory.`;
        // ユーザーメッセージにも言語指示を注入（LLMはこちらを最優先で読む）
        finalAiText = `[Reply in ${commentLang} only] ${aiText}`;
        console.log(`  🌐 [多言語] ${commentLang}で返答するよう指示`);
      }
    }

    // 短期記憶を含めたメッセージを構築
    const messages = conversationMemory.buildMessages(finalSystemPrompt, finalAiText);
    const reply = await brain.chat(messages);
    console.log(`[IPC/YT] Bot Reply: ${reply}`);
    const processingMs = Date.now() - startTime;

    // 会話履歴に追加
    conversationMemory.addExchange(aiText, reply);

    let audioBuffer: Buffer | null = null;
    if (currentSettings.ttsEngine === 'voiceger') {
      audioBuffer = await voice.generateAudio(reply, currentSettings.voicegerSpeakerId);
    } else {
      audioBuffer = await voice.generateAudio(reply);
    }
    let audioData = null;
    if (audioBuffer) {
      audioData = audioBuffer.toString('base64');
      // ※注: YouTubeからの自動取得時は、メインプロセス内で音声を鳴らすか、レンダラーに送って鳴らす必要がある
      // 現状はレンダラーに `play-audio` イベントを送って鳴らすのが安全
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('play-audio', audioData);
      }
    }

    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      username,
      userComment: text,
      userLogoUrl,
      aiReply: reply,
      source: 'ai',
      processingMs,
      isSuperChat,
    });

    return { reply, audioData, filtered: false };
  } catch (error) {
    const processingMs = Date.now() - startTime;
    console.error("[IPC/YT] Error:", error);

    pushLogEntry({
      id: ++logIdCounter,
      timestamp: new Date().toISOString(),
      username,
      userComment: text,
      userLogoUrl,
      aiReply: `エラー: ${error}`,
      source: 'error',
      processingMs,
      isSuperChat,
    });

    throw error;
  }
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
  iconSize: '28px',
  replyFontSize: '1.4rem',
  replyColor: '#fff',
  replyFontWeight: '900',
  animationType: 'slideUp',
  animationDuration: '0.3s',
  fadeDuration: '1s',
  displayDuration: 30000,
  scBoxBg1: 'rgba(255, 215, 0, 0.25)',
  scBoxBg2: 'rgba(255, 140, 0, 0.2)',
  scBorderColor: '#FFD700',
  scLabelColor: '#FFD700',
  scUserColor: '#FFD700',
  scReplyColor: '#FFF8DC',
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

  // v9: CSS構文エラー修正、フィルター音声再生修正
  if (!fs.existsSync(overlayHtmlPath) || !fs.readFileSync(overlayHtmlPath, 'utf-8').includes('overlay-v10')) {
    const defaultHtml = `<!DOCTYPE html>
<!-- overlay-v10 -->
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

    /* === スーパーチャット / ビッツ専用スタイル === */
    .superchat-box {
      background: linear-gradient(135deg, var(--sc-box-bg1), var(--sc-box-bg2)) !important;
      border-left: 6px solid var(--sc-border-color) !important;
      box-shadow: 0 0 20px var(--sc-box-bg1), 0 4px 15px rgba(0,0,0,0.5) !important;
      position: relative;
      padding-top: 28px;
    }
    .superchat-box::before {
      content: '\uD83D\uDCB0 Super Chat';
      position: absolute;
      top: 6px;
      left: 20px;
      font-size: 0.7rem;
      font-weight: bold;
      color: var(--sc-label-color);
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .superchat-box .user-line {
      color: var(--sc-user-color) !important;
      font-weight: bold;
    }
    .superchat-box .comment-text {
      color: var(--sc-user-color) !important;
    }
    .superchat-box .reply {
      color: var(--sc-reply-color) !important;
    }

    /* スパチャ専用アニメーション */
    .anim-superchat {
      animation: superchatIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes superchatIn {
      0%   { transform: scale(0.3) translateY(50px); opacity: 0; }
      60%  { transform: scale(1.05); opacity: 1; }
      100% { transform: scale(1) translateY(0); opacity: 1; }
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
    
    .user-line {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--user-font-size);
      color: var(--user-color);
      margin-bottom: 2px;
      font-weight: bold;
    }
    .user-icon {
      width: var(--icon-size, 28px);
      height: var(--icon-size, 28px);
      border-radius: 50%;
      object-fit: cover;
    }
    .comment-text {
      font-size: var(--user-font-size);
      color: var(--user-color);
      margin-bottom: 6px;
      padding-left: 1.8em; /* アイコン分のインデント */
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
    let SUPERCHAT_DISPLAY_DURATION = 60000; // スパチャは長めに表示
    let ANIM_TYPE = 'slideUp';

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
      root.setProperty('--icon-size', s.iconSize || '28px');
      
      root.setProperty('--sc-box-bg1', s.scBoxBg1 || 'rgba(255, 215, 0, 0.25)');
      root.setProperty('--sc-box-bg2', s.scBoxBg2 || 'rgba(255, 140, 0, 0.2)');
      root.setProperty('--sc-border-color', s.scBorderColor || '#FFD700');
      root.setProperty('--sc-label-color', s.scLabelColor || '#FFD700');
      root.setProperty('--sc-user-color', s.scUserColor || '#FFD700');
      root.setProperty('--sc-reply-color', s.scReplyColor || '#FFF8DC');

      DISPLAY_DURATION = s.displayDuration || 30000;
      SUPERCHAT_DISPLAY_DURATION = (s.displayDuration || 30000) * 2; // スパチャは通常の2倍
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

        const isSC = data.isSuperChat === true;
        const box = document.createElement('div');

        if (isSC) {
          box.className = 'message-box superchat-box anim-superchat';
        } else {
          box.className = 'message-box anim-' + ANIM_TYPE;
        }

        // ユーザー行（アイコン＋名前）
        const userLine = document.createElement('div');
        userLine.className = 'user-line';
        
        const emoji = isSC ? '💰' : '💬';
        
        if (data.userLogoUrl) {
          const img = document.createElement('img');
          img.className = 'user-icon';
          img.src = data.userLogoUrl;
          userLine.appendChild(img);
        } else {
          const emojiSpan = document.createElement('span');
          emojiSpan.textContent = emoji;
          userLine.appendChild(emojiSpan);
        }
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = data.username || 'Guest';
        userLine.appendChild(nameSpan);

        // コメント本文
        const commentText = document.createElement('div');
        commentText.className = 'comment-text';
        commentText.textContent = data.userComment || '';

        // AI返答（スキップ/無視コメントの場合はAI欄を表示しない）
        const isSkipped = (data.aiReply || '').startsWith('[スキップ]') || (data.aiReply || '').startsWith('[無視]');

        box.appendChild(userLine); 
        box.appendChild(commentText);

        if (!isSkipped) {
          const r = document.createElement('div'); 
          r.className = 'reply'; 
          r.textContent = '🤖 ' + data.aiReply;
          box.appendChild(r);
        }
        container.appendChild(box);
        trimOverflow();

        const duration = isSC ? SUPERCHAT_DISPLAY_DURATION : DISPLAY_DURATION;
        setTimeout(() => { box.classList.add('fade-out'); setTimeout(() => box.remove(), 1000); }, duration);
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
    width: 1024,
    height: 768,
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

// ウォームアップロジック
async function runWarmup() {
  warmupStatus = 'warming-up';
  warmupErrorCode = undefined;
  warmupErrorMessage = undefined;
  sendWarmupStatus();

  try {
    // 1. Voicegerを使用する場合は先に起動(await)
    if (currentSettings.ttsEngine === 'voiceger') {
      pushDebugLog('[Main] Voicegerサーバーを自動起動中...');
      const ok = await startVoiceger(currentSettings.voicegerUrl);
      if (ok) {
        pushDebugLog('[Main] Voicegerサーバー起動成功');
      } else {
        console.warn('[Main] Voicegerサーバー起動失敗（手動で起動してください）');
        // VRAM不足などでVoicegerが起動失敗した場合は、Ollamaの起動も中断してエラーとする
        throw new Error('Voicegerの起動に失敗しました。VRAM不足などの原因が考えられます。');
      }
    }

    // 2. Ollama等、AIモデルのウォームアップ
    pushDebugLog(`[Main] AIプロバイダー(${currentSettings.aiProvider})のウォームアップを開始します...`);
    await brain.warmup();

    warmupStatus = 'ready';
    pushDebugLog('[Main] AIウォームアップ完了');
  } catch (error: any) {
    warmupStatus = 'failed';
    // エラーがVoicegerに起因する場合は独自のコードをセット
    if (error?.message && error.message.includes('Voiceger')) {
      warmupErrorCode = ErrorCodes.VOICEGER_START_FAILED;
    } else {
      warmupErrorCode = ErrorCodes.WARMUP_FAILED;
    }
    warmupErrorMessage = error?.message || String(error);
    console.error(`[Main] ウォームアップ失敗 [${warmupErrorCode}]:`, error);
  }

  // 状態同期ズレ防止: ウォームアップ直後にヘルスチェック状態を強制更新・送信
  try {
    const currentHealth = await healthChecker.checkAll();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('health-status', currentHealth);
    }
  } catch (err) {
    console.error('[Main] 強制ヘルスチェック失敗:', err);
  }

  sendWarmupStatus();
}

app.whenReady().then(async () => {
  createWindow();
  startOverlayServer();

  // ヘルスチェックの定期監視を開始（10秒間隔）
  healthChecker.startMonitoring((status) => {
    const fullStatus = { ...status, youtube: { connected: isYoutubeConnected }, ttsEngine: currentSettings.ttsEngine };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('health-status', fullStatus);
    }
  }, 10000);

  // DB初期化後にYouTubeリスナーを初期化
  viewerMemory.init().then(() => {
    if (currentSettings.youtubeVideoId) {
      startYouTubeListener(currentSettings.youtubeVideoId);
    }
  });

  // ウォームアップロジックの実行
  runWarmup();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ウォームアップ状態をレンダラーに送信
function sendWarmupStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ai-warmup-status', {
      status: warmupStatus,
      errorCode: warmupErrorCode,
      errorMessage: warmupErrorMessage,
    });
  }
}

// === ヘルパー: Ollamaモデルのメモリ解放 ===
async function unloadOllamaModel(settingsToUse?: any) {
  const settings = settingsToUse || currentSettings;
  if (settings?.aiProvider === 'ollama' && settings?.aiModel) {
    pushDebugLog(`[Main] Ollamaモデル「${settings.aiModel}」のメモリ解放を試みます...`);
    try {
      const url = new URL('/api/generate', settings.ollamaUrl || 'http://127.0.0.1:11434').href;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.aiModel,
          keep_alive: 0
        })
      });
      pushDebugLog('[Main] Ollamaモデルのメモリ解放完了');
    } catch (error) {
      console.error('[Main] Ollamaモデルのメモリ解放失敗:', error);
    }
  }
}

app.on('window-all-closed', () => {
  healthChecker.stopMonitoring();
  if (process.platform !== 'darwin') app.quit();
});

let isQuitting = false;
app.on('before-quit', async (e) => {
  if (isQuitting) return;

  const needsCleanup = true; // 常にクリーンアップ（Voicegerキル等）を実行する

  if (needsCleanup) {
    e.preventDefault(); // 一旦終了をキャンセル
    isQuitting = true;

    // Ollamaモデルのメモリ解放
    await unloadOllamaModel();

    // Voicegerサーバーの停止（TTSエンジン設定に関係なく停止を試みる）
    pushDebugLog('[Main] Voicegerサーバーを停止中...');
    await stopVoiceger(currentSettings?.voicegerUrl || 'http://127.0.0.1:8000');

    app.quit(); // クリーンアップ後に改めて終了
  }
});

// === IPC: コメント送信（フィルター統合済み） ===
ipcMain.handle('send-comment', async (_event, text: string, isSuperChat: boolean = false, username: string = 'Guest', userLogoUrl?: string) => {
  console.log(`[IPC] Received comment from [${username}]: ${text}${isSuperChat ? ' (スパチャ)' : ''}`);
  const startTime = Date.now();
  // キュー経由で処理（大量連打時も順次処理）
  return enqueueComment({ text, isSuperChat, username, userLogoUrl, startTime, source: 'ipc' });
});

// === IPC: 設定 ===
ipcMain.handle('get-settings', async () => settingsStore.getAll());
ipcMain.handle('get-default-settings', async () => settingsStore.getDefaults());

ipcMain.handle('check-voiceger-installed', () => isVoicegerInstalled());
ipcMain.handle('install-voiceger', () => installVoiceger());

ipcMain.handle('save-settings', async (_event, newSettings: any) => {
  const oldSettings = { ...currentSettings };
  currentSettings = settingsStore.save(newSettings);

  // === Voicegerの停止判定 ===
  // 以前voicegerを利用していたが、新しい設定では利用しなくなった場合
  if (oldSettings.ttsEngine === 'voiceger' && currentSettings.ttsEngine !== 'voiceger') {
    pushDebugLog('[Main] TTSエンジンが切り替わりました。Voicegerを停止します...');
    await stopVoiceger(oldSettings.voicegerUrl || 'http://127.0.0.1:8000');
  }

  // === Ollamaメモリ解放判定 (VoiceVox等 -> Voiceger 切り替え時) ===
  if (oldSettings.ttsEngine !== 'voiceger' && currentSettings.ttsEngine === 'voiceger') {
    pushDebugLog('[Main] Voicegerへの切り替えを検知しました。VRAM確保のためOllamaモデルを一度メモリから降ろします...');
    await unloadOllamaModel(oldSettings);
  }

  // === ウォームアップの再実行判定 ===
  const needsWarmup =
    oldSettings.aiProvider !== currentSettings.aiProvider ||
    oldSettings.aiModel !== currentSettings.aiModel ||
    oldSettings.ollamaUrl !== currentSettings.ollamaUrl ||
    oldSettings.voicegerUrl !== currentSettings.voicegerUrl ||
    oldSettings.ttsEngine !== currentSettings.ttsEngine;

  // ウォームアップが必要な設定変更があった場合、自動的にrunWarmupを呼び出す
  if (needsWarmup) {
    pushDebugLog('[Main] AI関連の設定が変更されたため、ウォームアップを再実行します...');
    runWarmup(); // 非同期でバックグラウンド実行
  }

  // プロバイダーに応じたブレインを再生成
  brain = createBrain(
    currentSettings.aiProvider,
    currentSettings.aiModel,
    currentSettings.ollamaUrl,
    currentSettings.openaiCompatUrl,
    currentSettings.openaiCompatApiKey
  );
  voice = currentSettings.ttsEngine === 'voiceger'
    ? new VoicegerClient(currentSettings.voicegerUrl)
    : new VoiceVoxClient(currentSettings.voicevoxUrl, currentSettings.speakerId);
  healthChecker.updateUrls(
    currentSettings.ollamaUrl,
    currentSettings.voicevoxUrl,
    currentSettings.voicegerUrl,
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

  // YouTube Live の再接続
  if (currentSettings.youtubeVideoId) {
    console.log(`[Settings] YouTube Video ID が設定されました: ${currentSettings.youtubeVideoId}`);
    startYouTubeListener(currentSettings.youtubeVideoId);
  } else {
    stopYouTubeListener();
  }

  const health = await healthChecker.checkAll();
  const fullHealth = { ...health, youtube: { connected: isYoutubeConnected } };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('health-status', fullHealth);
  }
  return { settings: currentSettings, health: fullHealth };
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

// === IPC: ウォームアップ状態取得と再試行 ===
ipcMain.handle('get-warmup-status', async () => ({
  status: warmupStatus,
  errorCode: warmupErrorCode,
  errorMessage: warmupErrorMessage,
}));
ipcMain.handle('retry-warmup', async () => {
  if (warmupStatus === 'failed') {
    runWarmup();
  }
});

// === IPC: ヘルスチェック ===
ipcMain.handle('check-health', async () => {
  const status = await healthChecker.checkAll();
  return { ...status, youtube: { connected: isYoutubeConnected }, ttsEngine: currentSettings.ttsEngine };
});

// === IPC: ログ ===
ipcMain.handle('get-logs', async () => logs);
ipcMain.handle('clear-logs', async () => {
  logs = [];
  logIdCounter = 0;
  return true;
});

// === IPC: コメント処理の一時停止/再開 ===
ipcMain.handle('set-processing-paused', async (_event, paused: boolean) => {
  isProcessingPaused = paused;
  console.log(`[メイン] コメント処理: ${paused ? '一時停止' : '再開'}`);
  return isProcessingPaused;
});

ipcMain.handle('get-processing-paused', async () => {
  return isProcessingPaused;
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

// === IPC: オーバーレイプリセット管理 ===
const overlayPresetsDir = path.join(app.getPath('userData'), 'overlay-presets');
if (!fs.existsSync(overlayPresetsDir)) {
  fs.mkdirSync(overlayPresetsDir, { recursive: true });
}

// オーバーレイプリセット一覧を取得
ipcMain.handle('get-overlay-presets', async () => {
  const files = fs.readdirSync(overlayPresetsDir).filter(f => f.endsWith('.lvso'));
  return files.map(f => ({
    name: path.basename(f, '.lvso'),
    path: path.join(overlayPresetsDir, f),
  }));
});

// オーバーレイプリセットを保存（名前とJSON設定を受け取り .lvso ファイルとして保存）
ipcMain.handle('save-overlay-preset', async (_event, name: string, settings: any) => {
  const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
  const filePath = path.join(overlayPresetsDir, `${safeName}.lvso`);
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  return { name: safeName, path: filePath };
});

// オーバーレイプリセットを削除
ipcMain.handle('delete-overlay-preset', async (_event, name: string) => {
  const filePath = path.join(overlayPresetsDir, `${name}.lvso`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
});

// オーバーレイプリセットを読み込み（名前を指定してJSON設定を返す）
ipcMain.handle('load-overlay-preset', async (_event, name: string) => {
  const filePath = path.join(overlayPresetsDir, `${name}.lvso`);
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
});

// オーバーレイプリセットをエクスポート（ファイル保存ダイアログ）
ipcMain.handle('export-overlay-preset', async (_event, settings: any, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    title: 'オーバーレイプリセットをエクスポート',
    defaultPath: `${defaultName || 'overlay-preset'}.lvso`,
    filters: [
      { name: 'LocalV Overlay Preset', extensions: ['lvso'] },
      { name: 'JSONファイル', extensions: ['json'] },
    ],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, JSON.stringify(settings, null, 2), 'utf-8');
  return true;
});

// オーバーレイプリセットをインポート（ファイル選択ダイアログ）
ipcMain.handle('import-overlay-preset', async () => {
  const result = await dialog.showOpenDialog({
    title: 'オーバーレイプリセットをインポート',
    filters: [
      { name: 'オーバーレイプリセット', extensions: ['lvso', 'json'] },
      { name: 'すべてのファイル', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const text = fs.readFileSync(result.filePaths[0], 'utf-8');
  const name = path.basename(result.filePaths[0], path.extname(result.filePaths[0]));
  try {
    const settings = JSON.parse(text);
    return { name, settings };
  } catch {
    return null;
  }
});
