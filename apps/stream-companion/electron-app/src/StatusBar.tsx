import { useState } from 'react';
import './StatusBar.css';
import { useLocale } from './i18n';

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
    youtube?: {
        connected: boolean;
    };
}

interface StatusBarProps {
    health: HealthStatus | null;
}

function StatusBar({ health }: StatusBarProps) {
    const { t } = useLocale();
    const [showGuide, setShowGuide] = useState(false);

    if (!health) {
        return (
            <div className="status-bar">
                <div className="status-item checking">
                    <span className="status-dot">⏳</span>
                    <span>{t('status.checking')}</span>
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
                            <h3>{t('guide.title')}</h3>
                            <button className="guide-close" onClick={() => setShowGuide(false)}>✕</button>
                        </div>

                        {!health.ollama.connected && (
                            <div className="guide-section">
                                <h4>{t('guide.ollamaTitle')}</h4>
                                <p className="guide-error">{health.ollama.error}</p>

                                <div className="guide-steps">
                                    <div className="guide-step">
                                        <span className="step-num">1</span>
                                        <div>
                                            <strong>{t('guide.ollamaStep1')}</strong>
                                            <p>
                                                <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
                                                    https://ollama.com/download
                                                </a>
                                                {' '}{t('guide.ollamaStep1Desc')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="guide-step">
                                        <span className="step-num">2</span>
                                        <div>
                                            <strong>{t('guide.ollamaStep2')}</strong>
                                            <p>{t('guide.ollamaStep2Desc')}</p>
                                            <code>ollama pull llama3.1</code>
                                        </div>
                                    </div>
                                    <div className="guide-step">
                                        <span className="step-num">3</span>
                                        <div>
                                            <strong>{t('guide.ollamaStep3')}</strong>
                                            <p>{t('guide.ollamaStep3Desc')}</p>
                                            <code>ollama serve</code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!health.voicevox.connected && (
                            <div className="guide-section">
                                <h4>{t('guide.voicevoxTitle')}</h4>
                                <p className="guide-error">{health.voicevox.error}</p>

                                <div className="guide-steps">
                                    <div className="guide-step">
                                        <span className="step-num">1</span>
                                        <div>
                                            <strong>{t('guide.voicevoxStep1')}</strong>
                                            <p>
                                                <a href="https://voicevox.hiroshiba.jp/" target="_blank" rel="noreferrer">
                                                    https://voicevox.hiroshiba.jp/
                                                </a>
                                                {' '}{t('guide.voicevoxStep1Desc')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="guide-step">
                                        <span className="step-num">2</span>
                                        <div>
                                            <strong>{t('guide.voicevoxStep2')}</strong>
                                            <p>{t('guide.voicevoxStep2Desc')}</p>
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
                <div className={`status-item ${health.llm.connected ? 'connected' : 'disconnected'}`}>
                    <span className="status-dot">{health.llm.connected ? '🟢' : '🔴'}</span>
                    <span className="status-label">{providerLabel}</span>
                    {health.llm.connected ? (
                        <span className="status-detail">{t('status.models', { count: health.llm.models.length })}</span>
                    ) : (
                        <span className="status-error">{t('status.noConnection')}</span>
                    )}
                </div>

                <div className={`status-item ${health.voicevox.connected ? 'connected' : 'disconnected'}`}>
                    <span className="status-dot">{health.voicevox.connected ? '🟢' : '🔴'}</span>
                    <span className="status-label">VoiceVox</span>
                    {health.voicevox.connected ? (
                        <span className="status-detail">{t('status.voicevoxConnected')}</span>
                    ) : (
                        <span className="status-error">{t('status.noConnection')}</span>
                    )}
                </div>

                <div className={`status-item ${health.youtube?.connected ? 'connected' : 'disconnected'}`}>
                    <span className="status-dot">{health.youtube?.connected ? '🟢' : '🔴'}</span>
                    <span className="status-label">YouTube Live</span>
                    {health.youtube?.connected ? (
                        <span className="status-detail">{t('status.ytConnected')}</span>
                    ) : (
                        <span className="status-error">{t('status.noConnection')}</span>
                    )}
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {hasIssue && (
                        <button className="status-help-btn" onClick={() => setShowGuide(true)}>
                            {t('status.guide')}
                        </button>
                    )}

                    <button
                        className="status-help-btn overlay-copy-btn"
                        onClick={() => {
                            const url = 'http://localhost:25252/';
                            navigator.clipboard.writeText(url);
                            alert(t('status.urlCopied', { url }));
                        }}
                        title={t('status.copyUrl')}
                    >
                        {t('status.copyUrl')}
                    </button>

                    <a
                        className="donate-link"
                        href="https://buymeacoffee.com/ray_9618"
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t('status.donate')}
                    </a>
                </div>
            </div>
        </>
    );
}

export default StatusBar;
