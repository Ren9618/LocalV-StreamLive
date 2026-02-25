import { useState, useEffect, useRef } from 'react';
import './App.css';
import Settings from './Settings';
import StatusBar from './StatusBar';
import LogViewer from './LogViewer';
import Filters from './Filters';

// Electronの型定義
declare global {
  interface Window {
    electron: {
      sendComment: (text: string, isSuperChat?: boolean, username?: string) => Promise<{ reply: string | null, audioData: string | null, filtered?: boolean, filterType?: string }>;
      getSettings: () => Promise<any>;
      getDefaultSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<any>;
      checkHealth: () => Promise<any>;
      onHealthStatus: (callback: (status: any) => void) => void;
      getLogs: () => Promise<any[]>;
      clearLogs: () => Promise<boolean>;
      onLogEntry: (callback: (entry: any) => void) => void;
      getWarmupStatus: () => Promise<string>;
      onWarmupStatus: (callback: (status: string) => void) => void;
      getFilters: () => Promise<any>;
      saveFilters: (filters: any) => Promise<boolean>;
    }
  }
}

// タブの型定義
type TabType = 'test' | 'filters' | 'logs' | 'settings';

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
  const [activeTab, setActiveTab] = useState<TabType>('test');
  const [inputText, setInputText] = useState("");
  const [inputUsername, setInputUsername] = useState("Guest");
  const [messages, setMessages] = useState<{ user: string, bot: string, tag?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isSuperChatTest, setIsSuperChatTest] = useState(false);
  const [warmupStatus, setWarmupStatus] = useState<'warming-up' | 'ready' | 'failed'>('warming-up');
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // 自動スクロール
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // ウォームアップ状態の購読
  useEffect(() => {
    window.electron.getWarmupStatus().then((status) => {
      setWarmupStatus(status as any);
    });
    window.electron.onWarmupStatus((status) => {
      setWarmupStatus(status as any);
    });
  }, []);

  const handleTabChange = (newTab: TabType) => {
    if (activeTab === 'settings' && hasUnsavedSettings) {
      if (!window.confirm("設定が保存されていません。変更を破棄して他のタブへ移動しますか？")) {
        return;
      }
      setHasUnsavedSettings(false);
    }
    setActiveTab(newTab);
  };

  // ヘルスステータスの受信を購読
  useEffect(() => {
    window.electron.checkHealth().then(setHealth);
    window.electron.onHealthStatus((status) => {
      setHealth(status);
    });
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
    setMessages(prev => [...prev, { user: `[${username}] ${userText}`, bot: "...", tag: userTag }]);

    try {
      const result = await window.electron.sendComment(userText, superChat, username);

      // フィルターで無視された場合
      if (result.filtered && result.reply === null) {
        setMessages(prev => prev.map(msg =>
          msg.user === `[${username}] ${userText}` && msg.bot === "..." ? { ...msg, bot: `🚫 [無視] ${result.filterType}` } : msg
        ));
        return;
      }

      // フィルターの定型文 or AI返答
      const botReply = result.reply || 'エラーが発生しました';
      const botTag = result.filtered ? `⚡ ${result.filterType}` : undefined;
      setMessages(prev => prev.map(msg =>
        msg.user === `[${username}] ${userText}` && msg.bot === "..." ? { ...msg, bot: botReply, tag: msg.tag ? `${msg.tag} → ${botTag || '🤖 AI'}` : botTag || undefined } : msg
      ));

      if (result.audioData) {
        const audio = new Audio(`data:audio/wav;base64,${result.audioData}`);

        // 設定を取得して指定されたオーディオデバイスへルーティングする
        try {
          const settings = await window.electron.getSettings();
          if (settings.audioOutputDeviceId) {
            // HTMLAudioElement#setSinkIdは一部の型定義で不足している場合があるためキャスト
            await (audio as any).setSinkId(settings.audioOutputDeviceId);
          }
        } catch (err) {
          console.error("Failed to set audio output device:", err);
        }

        audio.play().catch(console.error);
      }
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
            <div className="warmup-text">AIモデルを起動中...</div>
            <div className="warmup-subtext">初回起動は少し時間がかかります</div>
          </div>
        </div>
      )}
      {warmupStatus === 'failed' && (
        <div className="warmup-overlay warmup-failed">
          <div className="warmup-content">
            <div className="warmup-icon">⚠️</div>
            <div className="warmup-text">AIモデルの起動に失敗しました</div>
            <div className="warmup-subtext">AIサービスが起動しているか確認してください</div>
          </div>
        </div>
      )}
      {/* === タブナビゲーション === */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'test' ? 'active' : ''}`}
          onClick={() => handleTabChange('test')}
        >
          🧪 テスト
        </button>
        <button
          className={`tab-btn ${activeTab === 'filters' ? 'active' : ''}`}
          onClick={() => handleTabChange('filters')}
        >
          🔧 フィルター
        </button>
        <button
          className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => handleTabChange('logs')}
        >
          📋 ログ
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabChange('settings')}
        >
          ⚙️ 設定
        </button>
      </div>

      {/* === タブ内容 === */}
      <div className="tab-content">
        {activeTab === 'test' && (
          <>
            {health && !isReady && (
              <div className="warning-banner">
                ⚠️ {!health.llm.connected && 'AIサービスが未接続です。'}
                {!health.voicevox.connected && 'VoiceVoxが未接続です。'}
                設定タブで接続状況を確認してください。
              </div>
            )}

            <div className="chat-area" ref={chatAreaRef}>
              {messages.length === 0 && (
                <div className="chat-empty">
                  コメントを入力してAIの返答をテストできます
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
              {loading && <div className="loading">AI Thinking...</div>}
            </div>

            <div className="input-area">
              <label className="superchat-toggle">
                <input
                  type="checkbox"
                  checked={isSuperChatTest}
                  onChange={(e) => setIsSuperChatTest(e.target.checked)}
                />
                <span className="superchat-label">💰 スパチャとして送信</span>
              </label>
              <div style={{ display: 'flex', gap: '8px', flex: 1, height: '40px' }}>
                <input
                  type="text"
                  value={inputUsername}
                  onChange={(e) => setInputUsername(e.target.value)}
                  placeholder="ユーザー名 (Guest)"
                  disabled={!isReady}
                  style={{ width: '120px' }}
                />
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={isReady ? "コメントを入力してテスト..." : "⚠ サービス未接続"}
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
                送信
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

export default App;
