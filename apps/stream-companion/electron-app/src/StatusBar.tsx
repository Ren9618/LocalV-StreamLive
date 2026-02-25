import { useState } from 'react';
import './StatusBar.css';

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

interface StatusBarProps {
    health: HealthStatus | null;
}

function StatusBar({ health }: StatusBarProps) {
    const [showGuide, setShowGuide] = useState(false);

    // ヘルスチェック結果がまだない場合
    if (!health) {
        return (
            <div className="status-bar">
                <div className="status-item checking">
                    <span className="status-dot">⏳</span>
                    <span>接続確認中...</span>
                </div>
            </div>
        );
    }

    const hasIssue = !health.llm.connected || !health.voicevox.connected;
    const providerLabel = health.llm.provider === 'ollama' ? 'Ollama' : 'LLM API';

    return (
        <>
            {/* インストールガイドモーダル */}
            {showGuide && (
                <div className="guide-overlay" onClick={() => setShowGuide(false)}>
                    <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="guide-header">
                            <h3>🔧 セットアップガイド</h3>
                            <button className="guide-close" onClick={() => setShowGuide(false)}>✕</button>
                        </div>

                        {!health.ollama.connected && (
                            <div className="guide-section">
                                <h4>🤖 Ollama（AIエンジン）</h4>
                                <p className="guide-error">{health.ollama.error}</p>

                                <div className="guide-steps">
                                    <div className="guide-step">
                                        <span className="step-num">1</span>
                                        <div>
                                            <strong>Ollamaをインストール</strong>
                                            <p>
                                                <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
                                                    https://ollama.com/download
                                                </a>
                                                からダウンロード＆インストール
                                            </p>
                                        </div>
                                    </div>
                                    <div className="guide-step">
                                        <span className="step-num">2</span>
                                        <div>
                                            <strong>モデルをダウンロード</strong>
                                            <p>ターミナルで以下を実行：</p>
                                            <code>ollama pull llama3.1</code>
                                        </div>
                                    </div>
                                    <div className="guide-step">
                                        <span className="step-num">3</span>
                                        <div>
                                            <strong>Ollamaを起動</strong>
                                            <p>ターミナルで以下を実行：</p>
                                            <code>ollama serve</code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!health.voicevox.connected && (
                            <div className="guide-section">
                                <h4>🔊 VoiceVox（音声合成エンジン）</h4>
                                <p className="guide-error">{health.voicevox.error}</p>

                                <div className="guide-steps">
                                    <div className="guide-step">
                                        <span className="step-num">1</span>
                                        <div>
                                            <strong>VoiceVoxをインストール</strong>
                                            <p>
                                                <a href="https://voicevox.hiroshiba.jp/" target="_blank" rel="noreferrer">
                                                    https://voicevox.hiroshiba.jp/
                                                </a>
                                                からダウンロード＆インストール
                                            </p>
                                        </div>
                                    </div>
                                    <div className="guide-step">
                                        <span className="step-num">2</span>
                                        <div>
                                            <strong>VoiceVoxを起動</strong>
                                            <p>アプリケーションを開くと自動的にエンジンが起動します（ポート 50021）</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ステータスバー */}
            <div className="status-bar">
                {/* LLM ステータス */}
                <div className={`status-item ${health.llm.connected ? 'connected' : 'disconnected'}`}>
                    <span className="status-dot">{health.llm.connected ? '🟢' : '🔴'}</span>
                    <span className="status-label">{providerLabel}</span>
                    {health.llm.connected ? (
                        <span className="status-detail">{health.llm.models.length}モデル</span>
                    ) : (
                        <span className="status-error">未接続</span>
                    )}
                </div>

                {/* VoiceVox ステータス */}
                <div className={`status-item ${health.voicevox.connected ? 'connected' : 'disconnected'}`}>
                    <span className="status-dot">{health.voicevox.connected ? '🟢' : '🔴'}</span>
                    <span className="status-label">VoiceVox</span>
                    {health.voicevox.connected ? (
                        <span className="status-detail">接続済み</span>
                    ) : (
                        <span className="status-error">未接続</span>
                    )}
                </div>

                {/* ヘルプボタン（問題がある場合のみ表示） */}
                {hasIssue && (
                    <button className="status-help-btn" onClick={() => setShowGuide(true)}>
                        ❓ セットアップガイド
                    </button>
                )}

                {/* 寄付リンク */}
                <a
                    className="donate-link"
                    href="https://buymeacoffee.com/ray_9618"
                    target="_blank"
                    rel="noreferrer"
                >
                    ☕ 開発を支援する
                </a>
            </div>
        </>
    );
}

export default StatusBar;
