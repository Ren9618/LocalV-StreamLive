import { useState, useEffect } from 'react';
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
    voiceger?: {
        connected: boolean;
        error?: string;
    };
    ttsEngine?: 'voicevox' | 'voiceger';
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
    const [voicegerInstalled, setVoicegerInstalled] = useState(false);

    useEffect(() => {
        if (showGuide) {
            checkVoicegerPath();
        }
    }, [showGuide]);

    const checkVoicegerPath = async () => {
        const installed = await (window as any).electron.invoke('check-voiceger-installed');
        setVoicegerInstalled(installed);
    };

    const handleInstallVoiceger = async () => {
        const confirmMsg = voicegerInstalled
            ? t('guide.voicegerReinstallConfirm')
            : t('guide.voicegerInstallConfirm');

        if (window.confirm(confirmMsg)) {
            const action = voicegerInstalled ? 'clean' : 'resume';
            const result = await (window as any).electron.invoke('install-voiceger', action);
            if (result.success) {
                // インストール中も再チェックなどの必要はない（別窓で動くため）
            } else {
                alert(`Error: ${result.message}`);
            }
        }
    };

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

                        {/* クラウドLLM（OpenAI互換 API）セットアップ */}
                        <div className="guide-section">
                            <h4>{t('guide.cloudTitle')}</h4>
                            <p className="guide-cloud-intro">{t('guide.cloudIntro')}</p>

                            <div className="guide-steps">
                                <div className="guide-step">
                                    <span className="step-num">1</span>
                                    <div>
                                        <strong>{t('guide.cloudStep1')}</strong>
                                        <p>{t('guide.cloudStep1Desc')}</p>
                                        <div className="guide-provider-list">
                                            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI</a>
                                            <span> / </span>
                                            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google Gemini</a>
                                            <span> / </span>
                                            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">Anthropic Claude</a>
                                        </div>
                                    </div>
                                </div>
                                <div className="guide-step">
                                    <span className="step-num">2</span>
                                    <div>
                                        <strong>{t('guide.cloudStep2')}</strong>
                                        <p>{t('guide.cloudStep2Desc')}</p>
                                    </div>
                                </div>
                                <div className="guide-step">
                                    <span className="step-num">3</span>
                                    <div>
                                        <strong>{t('guide.cloudStep3')}</strong>
                                        <p>{t('guide.cloudStep3Desc')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Ollama セットアップ */}
                        <div className="guide-section">
                            <h4>{t('guide.ollamaTitle')}</h4>
                            {!health?.ollama.connected && health?.ollama.error && (
                                <p className="guide-error">{health.ollama.error}</p>
                            )}
                            <p className="guide-note">{t('guide.ollamaNote')}</p>

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

                        {/* VoiceVox セットアップ */}
                        <div className="guide-section">
                            <h4>{t('guide.voicevoxTitle')}</h4>
                            {!health?.voicevox.connected && health?.voicevox.error && (
                                <p className="guide-error">{health.voicevox.error}</p>
                            )}
                            <p className="guide-note" style={{ color: '#ffcc66' }}>{t('guide.voicevoxNote')}</p>

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

                        {/* Voiceger セットアップ */}
                        <div className="guide-section">
                            <h4>{t('guide.voicegerTitle')}</h4>
                            <p className="guide-note" style={{ color: '#66b2ff' }}>{t('guide.voicegerNote')}</p>

                            <div className="guide-steps">
                                <div className="guide-step">
                                    <span className="step-num">1</span>
                                    <div>
                                        <strong>{t('guide.voicegerStep1')}</strong>
                                        <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <button
                                                className="guide-install-btn"
                                                onClick={handleInstallVoiceger}
                                            >
                                                {voicegerInstalled ? t('guide.voicegerReinstall') : t('guide.voicegerInstall')}
                                            </button>
                                            <a href="https://github.com/zunzun999/voiceger_v2/tree/main/example" target="_blank" rel="noreferrer" style={{ fontSize: '0.9em' }}>
                                                {t('guide.manualSetup')} (GitHub)
                                            </a>
                                        </div>
                                        <p style={{ marginTop: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                            {t('guide.voicegerStep1Desc')}
                                        </p>
                                    </div>
                                </div>
                                <div className="guide-step">
                                    <span className="step-num">2</span>
                                    <div>
                                        <strong>{t('guide.voicegerStep2')}</strong>
                                        <p>{t('guide.voicegerStep2Desc')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
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

                {/* TTSエンジン（VoiceVox or Voiceger）のステータス */}
                {(() => {
                    const isVoiceger = health.ttsEngine === 'voiceger';
                    const ttsName = isVoiceger ? 'Voiceger' : 'VoiceVox';
                    const ttsConnected = isVoiceger ? health.voiceger?.connected : health.voicevox.connected;
                    return (
                        <div className={`status-item ${ttsConnected ? 'connected' : 'disconnected'}`}>
                            <span className="status-dot">{ttsConnected ? '🟢' : '🔴'}</span>
                            <span className="status-label">{ttsName}</span>
                            {ttsConnected ? (
                                <span className="status-detail">{t('status.voicevoxConnected')}</span>
                            ) : (
                                <span className="status-error">{t('status.noConnection')}</span>
                            )}
                        </div>
                    );
                })()}

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
                    <button className="status-help-btn" onClick={() => setShowGuide(true)}>
                        {t('status.guide')}
                    </button>

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
