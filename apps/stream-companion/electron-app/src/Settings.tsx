import { useState, useEffect } from 'react';
import './Settings.css';

// 設定の型定義
interface AppSettings {
    aiModel: string;
    ollamaUrl: string;
    systemPrompt: string;
    voicevoxUrl: string;
    speakerId: number;
    maxQueueSize: number;
}

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

interface SettingsProps {
    health: HealthStatus | null;
}

function Settings({ health }: SettingsProps) {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    // 初回読み込み
    useEffect(() => {
        window.electron.getSettings().then((s: AppSettings) => {
            setSettings(s);
        });
    }, []);

    // 設定変更ハンドラ
    const handleChange = (key: keyof AppSettings, value: string | number) => {
        if (!settings) return;
        setSettings({ ...settings, [key]: value });
    };

    // 保存
    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);
        setSaveMessage('');

        try {
            await window.electron.saveSettings(settings);
            setSaveMessage('✅ 設定を保存しました！');
        } catch {
            setSaveMessage('❌ 保存に失敗しました');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    // デフォルトに戻す
    const handleReset = async () => {
        const defaults = await window.electron.getDefaultSettings();
        setSettings(defaults);
        setSaveMessage('🔄 デフォルト設定に戻しました（保存を押して反映）');
        setTimeout(() => setSaveMessage(''), 3000);
    };

    if (!settings) {
        return <div className="settings-loading">設定を読み込み中...</div>;
    }

    return (
        <div className="settings-container">

            {/* === AI設定 === */}
            <section className="settings-section">
                <h2>🤖 AI設定</h2>

                <div className="settings-field">
                    <label>AIモデル</label>
                    {health?.ollama.connected && health.ollama.models.length > 0 ? (
                        <select
                            value={settings.aiModel}
                            onChange={(e) => handleChange('aiModel', e.target.value)}
                        >
                            {health.ollama.models.map((model) => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="field-with-status">
                            <input
                                type="text"
                                value={settings.aiModel}
                                onChange={(e) => handleChange('aiModel', e.target.value)}
                                placeholder="llama3.1"
                            />
                            {!health?.ollama.connected && (
                                <span className="field-warning">⚠ Ollama未接続</span>
                            )}
                        </div>
                    )}
                </div>

                <div className="settings-field">
                    <label>Ollama URL</label>
                    <input
                        type="text"
                        value={settings.ollamaUrl}
                        onChange={(e) => handleChange('ollamaUrl', e.target.value)}
                        placeholder="http://localhost:11434"
                    />
                </div>

                <div className="settings-field">
                    <label>システムプロンプト</label>
                    <textarea
                        value={settings.systemPrompt}
                        onChange={(e) => handleChange('systemPrompt', e.target.value)}
                        rows={12}
                        placeholder="AIの性格やルールを記述..."
                    />
                </div>
            </section>

            {/* === 音声設定 === */}
            <section className="settings-section">
                <h2>🔊 音声設定</h2>

                <div className="settings-field">
                    <label>VoiceVox URL</label>
                    <input
                        type="text"
                        value={settings.voicevoxUrl}
                        onChange={(e) => handleChange('voicevoxUrl', e.target.value)}
                        placeholder="http://127.0.0.1:50021"
                    />
                </div>

                <div className="settings-field">
                    <label>スピーカー</label>
                    {health?.voicevox.connected && health.voicevox.speakers.length > 0 ? (
                        <select
                            value={settings.speakerId}
                            onChange={(e) => handleChange('speakerId', Number(e.target.value))}
                        >
                            {health.voicevox.speakers.map((speaker) => (
                                <option key={speaker.id} value={speaker.id}>
                                    {speaker.name} (ID: {speaker.id})
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div className="field-with-status">
                            <input
                                type="number"
                                value={settings.speakerId}
                                onChange={(e) => handleChange('speakerId', Number(e.target.value))}
                                min={0}
                            />
                            {!health?.voicevox.connected && (
                                <span className="field-warning">⚠ VoiceVox未接続</span>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {/* === キュー設定 === */}
            <section className="settings-section">
                <h2>📥 キュー設定</h2>

                <div className="settings-field">
                    <label>最大キューサイズ</label>
                    <input
                        type="number"
                        value={settings.maxQueueSize}
                        onChange={(e) => handleChange('maxQueueSize', Number(e.target.value))}
                        min={1}
                        max={10}
                    />
                    <span className="field-hint">コメントが溢れた場合、古いものから破棄されます</span>
                </div>
            </section>

            {/* === ボタン === */}
            <div className="settings-actions">
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                    {saving ? '保存中...' : '💾 設定を保存'}
                </button>
                <button className="btn-reset" onClick={handleReset}>
                    🔄 デフォルトに戻す
                </button>
            </div>

            {saveMessage && (
                <div className={`save-message ${saveMessage.includes('❌') ? 'error' : ''}`}>
                    {saveMessage}
                </div>
            )}
        </div>
    );
}

export default Settings;
