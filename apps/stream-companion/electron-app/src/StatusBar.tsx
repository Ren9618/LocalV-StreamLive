import { useState } from 'react';
import './StatusBar.css';

interface HealthStatus {
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

    const hasIssue = !health.ollama.connected || !health.voicevox.connected;

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
                {/* Ollama ステータス */}
                <div className={`status-item ${health.ollama.connected ? 'connected' : 'disconnected'}`}>
                    <span className="status-dot">{health.ollama.connected ? '🟢' : '🔴'}</span>
                    <span className="status-label">Ollama</span>
                    {health.ollama.connected ? (
                        <span className="status-detail">{health.ollama.models.length}モデル</span>
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
            </div>
        </>
    );
}

export default StatusBar;
