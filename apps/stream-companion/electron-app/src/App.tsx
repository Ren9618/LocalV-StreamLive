import { useState, useEffect, useRef } from 'react';
import './App.css';
import Settings from './Settings';
import StatusBar from './StatusBar';
import LogViewer from './LogViewer';
import Dashboard from './Dashboard';
import Filters from './Filters';
import { LocaleProvider, useLocale } from './i18n';

// Electronの型定義
declare global {
  interface Window {
    electron: {
      sendComment: (text: string, isSuperChat?: boolean, username?: string, userLogoUrl?: string) => Promise<{ reply: string | null, audioData: string | null, filtered?: boolean, filterType?: string }>;
      getSettings: () => Promise<any>;
      getDefaultSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<any>;
      checkHealth: () => Promise<any>;
      onHealthStatus: (callback: (status: any) => void) => () => void;
      getLogs: () => Promise<any[]>;
      clearLogs: () => Promise<boolean>;
      setProcessingPaused: (paused: boolean) => Promise<boolean>;
      getProcessingPaused: () => Promise<boolean>;
      onLogEntry: (callback: (entry: any) => void) => () => void;
      getWarmupStatus: () => Promise<string>;
      onWarmupStatus: (callback: (status: string) => void) => () => void;
      getFilters: () => Promise<any>;
      saveFilters: (filters: any) => Promise<boolean>;
      // プリセット管理
      getPresets: () => Promise<{ name: string, path: string }[]>;
      savePreset: (name: string, text: string) => Promise<{ name: string, path: string }>;
      deletePreset: (name: string) => Promise<boolean>;
      loadPreset: (name: string) => Promise<string | null>;
      exportPrompt: (text: string, defaultName: string) => Promise<boolean>;
      importPrompt: () => Promise<{ name: string, text: string } | null>;
      // オーバーレイ設定
      getOverlaySettings: () => Promise<any>;
      saveOverlaySettings: (settings: any) => Promise<boolean>;
      // オーバーレイプリセット管理
      getOverlayPresets: () => Promise<{ name: string, path: string }[]>;
      saveOverlayPreset: (name: string, settings: any) => Promise<{ name: string, path: string }>;
      deleteOverlayPreset: (name: string) => Promise<boolean>;
      loadOverlayPreset: (name: string) => Promise<any | null>;
      exportOverlayPreset: (settings: any, defaultName: string) => Promise<boolean>;
      importOverlayPreset: () => Promise<{ name: string, settings: any } | null>;
      // YouTube等の外部ソースからの音声自動再生
      onPlayAudio: (callback: (audioData: string) => void) => () => void;
    }
  }
}

// タブの型定義
type TabType = 'dashboard' | 'test' | 'filters' | 'logs' | 'settings';

// ヘルスステータスの型定義
interface HealthStatus {
  llm: {
    provider: string;
    connected: boolean;
    models: string[];
    error?: string;
  };
  ollama: {
    connected: boolean;
    models: string[];
    error?: string;
  };
  voicevox: {
    connected: boolean;
    speakers: { name: string; id: number }[];
    error?: string;
  };
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [inputText, setInputText] = useState("");
  const [inputUsername, setInputUsername] = useState("Guest");
  const [messages, setMessages] = useState<{ user: string, bot: string, tag?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isSuperChatTest, setIsSuperChatTest] = useState(false);
  const [warmupStatus, setWarmupStatus] = useState<'warming-up' | 'ready' | 'failed'>('warming-up');
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const { t } = useLocale();

  // 自動スクロール
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // YouTube等の外部ソースからの音声自動再生
  useEffect(() => {
    const cleanup = window.electron.onPlayAudio(async (audioData: string) => {
      try {
        const audio = new Audio(`data:audio/wav;base64,${audioData}`);
        // 設定を取得して指定されたオーディオデバイスへルーティング
        try {
          const settings = await window.electron.getSettings();
          if (settings.audioOutputDeviceId) {
            await (audio as any).setSinkId(settings.audioOutputDeviceId);
          }
        } catch (err) {
          console.error('[play-audio] デバイス設定エラー:', err);
        }
        audio.play().catch(console.error);
      } catch (e) {
        console.error('[play-audio] 再生エラー:', e);
      }
    });
    return cleanup;
  }, []);

  // ウォームアップ状態の購読
  useEffect(() => {
    window.electron.getWarmupStatus().then((status) => {
      setWarmupStatus(status as any);
    });
    const cleanup = window.electron.onWarmupStatus((status) => {
      setWarmupStatus(status as any);
    });
    return cleanup;
  }, []);

  const handleTabChange = (newTab: TabType) => {
    if (activeTab === 'settings' && hasUnsavedSettings) {
      if (!window.confirm(t('test.unsavedConfirm'))) {
        return;
      }
      setHasUnsavedSettings(false);
    }
    setActiveTab(newTab);
  };

  // ヘルスステータスの受信を購読
  useEffect(() => {
    window.electron.checkHealth().then(setHealth);
    const cleanup = window.electron.onHealthStatus((status) => {
      setHealth(status);
    });
    return cleanup;
  }, []);

  // LLMと音声サービスが接続されているか
  const isReady = health?.llm.connected && health?.voicevox.connected;

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userText = inputText;
    const username = inputUsername.trim() || 'Guest';
    const superChat = isSuperChatTest;
    setInputText("");
    setLoading(true);

    const userTag = superChat ? '💰 スパチャ' : undefined;
    setMessages(prev => [...prev, { user: `${username}: ${userText}`, bot: "...", tag: userTag }]);

    try {
      const result = await window.electron.sendComment(userText, superChat, username);

      // フィルターで無視された場合
      if (result.filtered && result.reply === null) {
        setMessages(prev => prev.map(msg =>
          msg.user === `${username}: ${userText}` && msg.bot === "..." ? { ...msg, bot: `🚫 [無視] ${result.filterType}` } : msg
        ));
        return;
      }

      // フィルターの定型文 or AI返答
      const botReply = result.reply || 'エラーが発生しました';
      const botTag = result.filtered ? `⚡ ${result.filterType}` : undefined;
      setMessages(prev => prev.map(msg =>
        msg.user === `${username}: ${userText}` && msg.bot === "..." ? { ...msg, bot: botReply, tag: msg.tag ? `${msg.tag} → ${botTag || '🤖 AI'}` : botTag || undefined } : msg
      ));

      // 音声再生はpreload.tsのonPlayAudioイベント経由（useEffect内）で行われるため、ここでの重複再生は削除

    } catch (e) {
      console.error(e);
      setMessages(prev => prev.map(msg =>
        msg.user === `[${username}] ${userText}` && msg.bot === "..." ? { ...msg, bot: "エラーが発生しました" } : msg
      ));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      {/* === AIウォームアップオーバーレイ === */}
      {warmupStatus === 'warming-up' && (
        <div className="warmup-overlay">
          <div className="warmup-content">
            <div className="warmup-spinner"></div>
            <div className="warmup-text">{t('warmup.loading')}</div>
            <div className="warmup-subtext">{t('warmup.subtitle')}</div>
          </div>
        </div>
      )}
      {warmupStatus === 'failed' && (
        <div className="warmup-overlay warmup-failed">
          <div className="warmup-content">
            <div className="warmup-icon">⚠️</div>
            <div className="warmup-text">{t('warmup.failed')}</div>
            <div className="warmup-subtext">{t('warmup.failedSub')}</div>
          </div>
        </div>
      )}
      {/* === タブナビゲーション === */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleTabChange('dashboard')}
        >
          {t('tab.dashboard')}
        </button>
        <button
          className={`tab-btn ${activeTab === 'test' ? 'active' : ''}`}
          onClick={() => handleTabChange('test')}
        >
          {t('tab.test')}
        </button>
        <button
          className={`tab-btn ${activeTab === 'filters' ? 'active' : ''}`}
          onClick={() => handleTabChange('filters')}
        >
          {t('tab.filters')}
        </button>
        <button
          className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => handleTabChange('logs')}
        >
          {t('tab.logs')}
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabChange('settings')}
        >
          {t('tab.settings')}
        </button>
      </div>

      {/* === タブ内容 === */}
      <div className="tab-content">
        {activeTab === 'dashboard' && (
          <Dashboard health={health} />
        )}
        {activeTab === 'test' && (
          <>
            {health && !isReady && (
              <div className="warning-banner">
                ⚠️ {!health.llm.connected && t('test.aiNotConnected')}
                {!health.voicevox.connected && t('test.voicevoxNotConnected')}
                {t('test.checkSettings')}
              </div>
            )}

            <div className="chat-area" ref={chatAreaRef}>
              {messages.length === 0 && (
                <div className="chat-empty">
                  {t('test.empty')}
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className="message-box">
                  <div className="user-msg">
                    👤 {msg.user}
                    {msg.tag && <span className="msg-tag">{msg.tag}</span>}
                  </div>
                  <div className="bot-msg">🤖 {msg.bot}</div>
                </div>
              ))}
              {loading && <div className="loading">{t('test.thinking')}</div>}
            </div>

            <div className="input-area">
              <label className="superchat-toggle">
                <input
                  type="checkbox"
                  checked={isSuperChatTest}
                  onChange={(e) => setIsSuperChatTest(e.target.checked)}
                />
                <span className="superchat-label">{t('test.superChat')}</span>
              </label>
              <div style={{ display: 'flex', gap: '8px', flex: 1, height: '40px' }}>
                <input
                  type="text"
                  value={inputUsername}
                  onChange={(e) => setInputUsername(e.target.value)}
                  placeholder={t('test.username')}
                  disabled={!isReady}
                  style={{ width: '120px' }}
                />
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={isReady ? t('test.placeholder') : t('test.notConnected')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  disabled={!isReady}
                  style={{ flex: 1 }}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!isReady || loading || !inputText.trim()}
                style={{ height: '40px' }}
              >
                {t('test.send')}
              </button>
            </div>
          </>
        )}

        {activeTab === 'filters' && (
          <Filters />
        )}

        {activeTab === 'logs' && (
          <LogViewer />
        )}

        {activeTab === 'settings' && (
          <Settings health={health} onUnsavedChanges={setHasUnsavedSettings} />
        )}
      </div>

      {/* === ステータスバー === */}
      <StatusBar health={health} />
    </div>
  );
}

// LocaleProviderでラップしたエントリーポイント
function AppWithLocale() {
  return (
    <LocaleProvider>
      <App />
    </LocaleProvider>
  );
}

export default AppWithLocale;
