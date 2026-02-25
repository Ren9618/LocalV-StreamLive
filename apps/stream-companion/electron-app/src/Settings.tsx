import { useState, useEffect } from 'react';
import './Settings.css';

// 設定の型定義
interface AppSettings {
    aiProvider: 'ollama' | 'openai-compat';
    aiModel: string;
    ollamaUrl: string;
    openaiCompatUrl: string;
    openaiCompatApiKey: string;
    systemPrompt: string;
    voicevoxUrl: string;
    speakerId: number;
    maxQueueSize: number;
    memorySize: number;
    audioOutputDeviceId: string;
}

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

interface SettingsProps {
    health: HealthStatus | null;
    onUnsavedChanges?: (hasChanges: boolean) => void;
}

function Settings({ health, onUnsavedChanges }: SettingsProps) {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

    // 初回読み込み
    useEffect(() => {
        window.electron.getSettings().then((s: AppSettings) => {
            setSettings(s);
        });
    }, []);

    // オーディオデバイス取得
    useEffect(() => {
        const getDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                setAudioDevices(devices.filter(d => d.kind === 'audiooutput'));
            } catch (err) {
                console.error("Failed to enum audio devices", err);
            }
        };
        getDevices();
        navigator.mediaDevices.addEventListener('devicechange', getDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    }, []);

    // 設定変更ハンドラ (手動保存)
    const handleChange = (key: keyof AppSettings, value: string | number) => {
        if (!settings) return;
        const newSettings = { ...settings, [key]: value } as AppSettings;
        setSettings(newSettings);
        if (onUnsavedChanges) onUnsavedChanges(true);
    };

    // 保存
    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);
        setSaveMessage('');

        try {
            await window.electron.saveSettings(settings);
            setSaveMessage('✅ 設定を保存しました！');
            if (onUnsavedChanges) onUnsavedChanges(false);
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
        if (onUnsavedChanges) onUnsavedChanges(true);
        setTimeout(() => setSaveMessage(''), 3000);
    };

    if (!settings) {
        return <div className="settings-loading">設定を読み込み中...</div>;
    }

    return (
        <div className="settings-wrapper">
            <div className="settings-container">

                {/* === AI設定 === */}
                <section className="settings-section">
                    <h2>🤖 AI設定</h2>

                    <div className="settings-field">
                        <label>プロバイダー</label>
                        <select
                            value={settings.aiProvider}
                            onChange={(e) => handleChange('aiProvider', e.target.value)}
                        >
                            <option value="ollama">Ollama（ローカル）</option>
                            <option value="openai-compat">OpenAI互換 API（クラウド / LM Studio等）</option>
                        </select>
                        <span className="field-hint">
                            {settings.aiProvider === 'ollama'
                                ? 'Ollamaを使用してローカルLLMに接続します'
                                : 'OpenAI, Gemini, LM Studio等のOpenAI互換 APIに接続します'
                            }
                        </span>
                    </div>

                    {/* --- Ollama設定 --- */}
                    {settings.aiProvider === 'ollama' && (
                        <>
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
                        </>
                    )}

                    {/* --- OpenAI互換設定 --- */}
                    {settings.aiProvider === 'openai-compat' && (
                        <>
                            <div className="settings-field">
                                <label>API URL</label>
                                <input
                                    type="text"
                                    value={settings.openaiCompatUrl}
                                    onChange={(e) => handleChange('openaiCompatUrl', e.target.value)}
                                    placeholder="https://api.openai.com"
                                />
                                <span className="field-hint">例: https://api.openai.com, http://localhost:1234</span>
                            </div>

                            <div className="settings-field">
                                <label>API Key</label>
                                <input
                                    type="password"
                                    value={settings.openaiCompatApiKey}
                                    onChange={(e) => handleChange('openaiCompatApiKey', e.target.value)}
                                    placeholder="sk-... （ローカルLLMの場合は空でOK）"
                                />
                                <span className="field-hint">クラウドAPIの場合は必須。LM Studio等ローカルの場合は空欄でOK</span>
                            </div>

                            <div className="settings-field">
                                <label>モデル名</label>
                                {health?.llm.connected && health.llm.models.length > 0 ? (
                                    <select
                                        value={settings.aiModel}
                                        onChange={(e) => handleChange('aiModel', e.target.value)}
                                    >
                                        {health.llm.models.map((model) => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="field-with-status">
                                        <input
                                            type="text"
                                            value={settings.aiModel}
                                            onChange={(e) => handleChange('aiModel', e.target.value)}
                                            placeholder="gpt-4o-mini"
                                        />
                                        {settings.openaiCompatUrl && !health?.llm.connected && (
                                            <span className="field-warning">⚠ 未接続</span>
                                        )}
                                    </div>
                                )}
                                <span className="field-hint">例: gpt-4o-mini, gemini-2.0-flash, ローカルモデル名</span>
                            </div>
                        </>
                    )}

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

                    <div className="settings-field">
                        <label>音声出力デバイス</label>
                        <select
                            value={settings.audioOutputDeviceId}
                            onChange={(e) => handleChange('audioOutputDeviceId', e.target.value)}
                        >
                            <option value="">システムデフォルト</option>
                            {audioDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Unknown Device (${device.deviceId.slice(0, 8)}...)`}
                                </option>
                            ))}
                        </select>
                        <span className="field-hint">仮想オーディオケーブルなどを指定して配信ソフトに音声をルーティングできます</span>
                    </div>
                </section>

                {/* === キュー・メモリ設定 === */}
                <section className="settings-section">
                    <h2>📥 キュー・メモリ設定</h2>

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

                    <div className="settings-field">
                        <label>🧠 短期記憶（会話履歴）</label>
                        <input
                            type="number"
                            value={settings.memorySize}
                            onChange={(e) => handleChange('memorySize', Number(e.target.value))}
                            min={0}
                            max={50}
                        />
                        <span className="field-hint">過去何件の会話を記憶するか。0=記憶なし、大きいほど文脈を理解しますがトークンを消費します</span>
                    </div>
                </section>
            </div>

            {/* === ボタン === */}
            <div className="settings-actions">
                <div className="settings-actions-buttons">
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
        </div>
    );
}

export default Settings;
