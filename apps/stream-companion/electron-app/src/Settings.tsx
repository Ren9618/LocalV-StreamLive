import { useState, useEffect } from 'react';
import './Settings.css';
import { useLocale, localeNames } from './i18n';
import type { Locale } from './i18n';

// 設定の型定義
interface AppSettings {
    aiProvider: 'ollama' | 'openai-compat';
    aiModel: string;
    ollamaUrl: string;
    openaiCompatUrl: string;
    openaiCompatApiKey: string;
    systemPrompt: string;
    ttsEngine: 'voicevox' | 'voiceger';
    voicevoxUrl: string;
    speakerId: number;
    voicegerUrl: string;
    voicegerSpeakerId: string;
    maxQueueSize: number;
    memorySize: number;
    audioOutputDeviceId: string;
    voicevoxMultiLang: boolean;
    voicegerMultiLang: boolean;
    youtubeVideoId: string;
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
    voiceger?: {
        connected: boolean;
        speakers: { id: string; name: string }[];
        error?: string;
    };
    ttsEngine?: 'voicevox' | 'voiceger';
    youtube?: {
        connected: boolean;
    };
}

interface SettingsProps {
    health: HealthStatus | null;
    onUnsavedChanges?: (hasChanges: boolean) => void;
}

function Settings({ health, onUnsavedChanges }: SettingsProps) {
    const { t, locale, setLocale } = useLocale();
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    // プリセット管理用ステート
    const [presets, setPresets] = useState<{ name: string, path: string }[]>([]);
    const [selectedPreset, setSelectedPreset] = useState('');
    const [presetNameInput, setPresetNameInput] = useState('');
    const [showPresetSave, setShowPresetSave] = useState(false);
    // オーバーレイ設定用ステート
    const [overlaySettings, setOverlaySettings] = useState<any>(null);

    // サイドバーカテゴリ管理
    type SettingsCategory = 'ai' | 'prompt' | 'external' | 'overlay' | 'audio' | 'queue' | 'language';
    const [activeCategory, setActiveCategory] = useState<SettingsCategory>('ai');

    // オーバーレイプリセット管理用ステート
    const [overlayPresets, setOverlayPresets] = useState<{ name: string, path: string }[]>([]);
    const [selectedOverlayPreset, setSelectedOverlayPreset] = useState('');
    const [overlayPresetNameInput, setOverlayPresetNameInput] = useState('');
    const [showOverlayPresetSave, setShowOverlayPresetSave] = useState(false);

    const categories: { id: SettingsCategory; icon: string; label: string }[] = [
        { id: 'ai', icon: '🤖', label: t('settings.aiModel') },
        { id: 'prompt', icon: '💬', label: t('settings.prompt') },
        { id: 'external', icon: '🌐', label: t('settings.external') },
        { id: 'overlay', icon: '🎨', label: t('settings.overlay') },
        { id: 'audio', icon: '🔊', label: t('settings.audio') },
        { id: 'queue', icon: '📥', label: t('settings.queue') },
        { id: 'language', icon: '🌐', label: t('settings.language') },
    ];

    // 初回読み込み
    useEffect(() => {
        window.electron.getSettings().then((s: AppSettings) => {
            setSettings(s);
        });
        // プリセット一覧も取得
        refreshPresets();
        // オーバーレイ設定も取得
        window.electron.getOverlaySettings().then((s: any) => setOverlaySettings(s));
        // オーバーレイプリセット一覧も取得
        window.electron.getOverlayPresets().then((list: any) => setOverlayPresets(list));
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

    // プリセット一覧を再取得
    const refreshPresets = async () => {
        const list = await window.electron.getPresets();
        setPresets(list);
    };

    // プリセットを読み込んでシステムプロンプトに適用
    const handleLoadPreset = async (name: string) => {
        if (!name || !settings) return;
        const text = await window.electron.loadPreset(name);
        if (text !== null) {
            handleChange('systemPrompt', text);
            setSelectedPreset(name);
        }
    };

    // 現在のプロンプトをプリセットとして保存
    const handleSavePreset = async () => {
        if (!presetNameInput.trim() || !settings) return;
        await window.electron.savePreset(presetNameInput.trim(), settings.systemPrompt);
        setShowPresetSave(false);
        setPresetNameInput('');
        setSelectedPreset(presetNameInput.trim());
        await refreshPresets();
        setSaveMessage('💾 プリセット「' + presetNameInput.trim() + '」を保存しました');
        setTimeout(() => setSaveMessage(''), 3000);
    };

    // プリセットを削除
    const handleDeletePreset = async () => {
        if (!selectedPreset) return;
        if (!confirm(`プリセット「${selectedPreset}」を削除しますか？`)) return;
        await window.electron.deletePreset(selectedPreset);
        setSelectedPreset('');
        await refreshPresets();
    };

    // インポート
    const handleImportPrompt = async () => {
        const result = await window.electron.importPrompt();
        if (result && settings) {
            handleChange('systemPrompt', result.text);
            setSaveMessage('📥 「' + result.name + '」からインポートしました');
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    // エクスポート
    const handleExportPrompt = async () => {
        if (!settings) return;
        const defaultName = selectedPreset || 'prompt';
        const ok = await window.electron.exportPrompt(settings.systemPrompt, defaultName);
        if (ok) {
            setSaveMessage('📤 エクスポートしました');
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

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
            // アプリ設定とオーバーレイ設定を同時に保存
            const savePromises = [window.electron.saveSettings(settings)];
            if (overlaySettings) {
                savePromises.push(window.electron.saveOverlaySettings(overlaySettings));
            }
            await Promise.all(savePromises);

            setSaveMessage(t('settings.saved'));
            if (onUnsavedChanges) onUnsavedChanges(false);
        } catch {
            setSaveMessage(t('settings.saveFailed'));
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    // デフォルトに戻す
    const handleReset = async () => {
        if (!window.confirm(t('settings.resetConfirm'))) return;
        const defaults = await window.electron.getDefaultSettings();
        setSettings(defaults);
        setSaveMessage(t('settings.resetDone'));
        if (onUnsavedChanges) onUnsavedChanges(true);
        setTimeout(() => setSaveMessage(''), 3000);
    };

    if (!settings) {
        return <div className="settings-loading">{t('settings.loading')}</div>;
    }

    return (
        <div className="settings-wrapper">
            <div className="settings-layout">
                {/* === OBSスタイルのサイドバー === */}
                <nav className="settings-sidebar">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            className={`sidebar-item ${activeCategory === cat.id ? 'active' : ''}`}
                            onClick={() => setActiveCategory(cat.id)}
                        >
                            <span className="sidebar-icon">{cat.icon}</span>
                            <span className="sidebar-label">{cat.label}</span>
                        </button>
                    ))}
                </nav>

                {/* === コンテンツエリア === */}
                <div className="settings-container">

                    {/* === AI設定 === */}
                    {activeCategory === 'ai' && (
                        <section className="settings-section">
                            <h2>{t('settings.ai.title')}</h2>

                            <div className="settings-field">
                                <label>{t('settings.ai.provider')}</label>
                                <select
                                    value={settings.aiProvider}
                                    onChange={(e) => handleChange('aiProvider', e.target.value)}
                                >
                                    <option value="ollama">{t('settings.ai.providerOllama')}</option>
                                    <option value="openai-compat">{t('settings.ai.providerOpenai')}</option>
                                </select>
                                <span className="field-hint">
                                    {settings.aiProvider === 'ollama'
                                        ? t('settings.ai.providerHintOllama')
                                        : t('settings.ai.providerHintOpenai')
                                    }
                                </span>
                            </div>

                            {/* --- Ollama設定 --- */}
                            {settings.aiProvider === 'ollama' && (
                                <>
                                    <div className="settings-field">
                                        <label>{t('settings.ai.ollamaUrl')}</label>
                                        <input
                                            type="text"
                                            value={settings.ollamaUrl}
                                            onChange={(e) => handleChange('ollamaUrl', e.target.value)}
                                            placeholder="http://localhost:11434"
                                        />
                                    </div>

                                    <div className="settings-field">
                                        <label>{t('settings.ai.model')}</label>
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
                                                    <span className="field-warning">{t('settings.ai.ollamaNotConnected')}</span>
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
                                        <label>{t('settings.ai.apiUrl')}</label>
                                        <input
                                            type="text"
                                            value={settings.openaiCompatUrl}
                                            onChange={(e) => handleChange('openaiCompatUrl', e.target.value)}
                                            placeholder="https://api.openai.com"
                                        />
                                        <span className="field-hint">{t('settings.ai.apiUrlHint')}</span>
                                    </div>

                                    <div className="settings-field">
                                        <label>{t('settings.ai.apiKey')}</label>
                                        <input
                                            type="password"
                                            value={settings.openaiCompatApiKey}
                                            onChange={(e) => handleChange('openaiCompatApiKey', e.target.value)}
                                            placeholder={t('settings.ai.apiKeyPlaceholder')}
                                        />
                                        <span className="field-hint">{t('settings.ai.apiKeyHint')}</span>
                                    </div>

                                    <div className="settings-field">
                                        <label>{t('settings.ai.model')}</label>
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
                                                    <span className="field-warning">{t('settings.ai.notConnected')}</span>
                                                )}
                                            </div>
                                        )}
                                        <span className="field-hint">{t('settings.ai.modelHint')}</span>
                                    </div>
                                </>
                            )}

                        </section>
                    )}

                    {activeCategory === 'prompt' && (
                        <section className="settings-section">
                            <h2>{t('settings.prompt.title')}</h2>
                            <div className="settings-field">

                                {/* プリセット操作エリア */}
                                <div className="preset-toolbar">
                                    <select
                                        className="preset-select"
                                        value={selectedPreset}
                                        onChange={(e) => handleLoadPreset(e.target.value)}
                                    >
                                        <option value="">{t('settings.prompt.presetSelect')}</option>
                                        {presets.map(p => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                    <button className="preset-btn" onClick={() => setShowPresetSave(!showPresetSave)} title={t('settings.prompt.saveAs')}>{t('settings.prompt.saveAs')}</button>
                                    <button className="preset-btn" onClick={handleImportPrompt} title={t('settings.prompt.import')}>{t('settings.prompt.import')}</button>
                                    <button className="preset-btn" onClick={handleExportPrompt} title={t('settings.prompt.export')}>{t('settings.prompt.export')}</button>
                                    {selectedPreset && (
                                        <button className="preset-btn preset-btn-danger" onClick={handleDeletePreset} title={t('settings.prompt.deletePreset')}>{t('settings.prompt.deletePreset')}</button>
                                    )}
                                </div>

                                {/* プリセット名入力（保存ボタン押下時のみ表示） */}
                                {showPresetSave && (
                                    <div className="preset-save-row">
                                        <input
                                            type="text"
                                            className="preset-name-input"
                                            placeholder={t('settings.prompt.namePlaceholder')}
                                            value={presetNameInput}
                                            onChange={(e) => setPresetNameInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                                        />
                                        <button className="preset-btn" onClick={handleSavePreset} disabled={!presetNameInput.trim()}>{t('settings.prompt.confirm')}</button>
                                    </div>
                                )}

                                <textarea
                                    value={settings.systemPrompt}
                                    onChange={(e) => handleChange('systemPrompt', e.target.value)}
                                    rows={12}
                                    placeholder={t('settings.prompt.placeholder')}
                                />
                            </div>
                        </section>
                    )}

                    {/* === 外部連携設定 === */}
                    {activeCategory === 'external' && (
                        <section className="settings-section">
                            <h2>{t('settings.ext.title')}</h2>
                            <div className="settings-field">
                                <label>{t('settings.ext.youtubeLabel')}</label>
                                <input
                                    type="text"
                                    value={settings.youtubeVideoId || ''}
                                    onChange={(e) => handleChange('youtubeVideoId', e.target.value)}
                                    placeholder={t('settings.ext.youtubePlaceholder')}
                                />
                                <span className="field-hint">
                                    {t('settings.ext.youtubeHint')}
                                    <span style={{ color: health?.youtube?.connected ? '#4CAF50' : '#F44336', marginLeft: '10px', fontWeight: 'bold' }}>
                                        {health?.youtube?.connected ? t('settings.ext.statusConnected') : t('settings.ext.statusDisconnected')}
                                    </span>
                                </span>
                            </div>
                        </section>
                    )}

                    {/* === OBSオーバーレイ設定 === */}
                    {activeCategory === 'overlay' && overlaySettings && (
                        <section className="settings-section">
                            <h2>{t('settings.overlay.title')}</h2>
                            <span className="field-hint">{t('settings.overlay.hint')}</span>

                            {/* プリセットツールバー */}
                            <div className="preset-toolbar" style={{ marginTop: '12px' }}>
                                <select
                                    className="preset-select"
                                    value={selectedOverlayPreset}
                                    onChange={async (e) => {
                                        const name = e.target.value;
                                        if (!name) {
                                            setSelectedOverlayPreset('');
                                            return;
                                        }
                                        const loaded = await window.electron.loadOverlayPreset(name);
                                        if (loaded) {
                                            setOverlaySettings(loaded);
                                            setSelectedOverlayPreset(name);
                                            if (onUnsavedChanges) onUnsavedChanges(true);
                                        }
                                    }}
                                >
                                    <option value="">{t('settings.overlay.presetDefault')}</option>
                                    {overlayPresets.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                                <button className="preset-btn" onClick={() => setShowOverlayPresetSave(!showOverlayPresetSave)} title={t('settings.overlay.saveAs')}>{t('settings.overlay.saveAs')}</button>
                                <button className="preset-btn" onClick={async () => {
                                    const result = await window.electron.importOverlayPreset();
                                    if (result) {
                                        setOverlaySettings(result.settings);
                                        if (onUnsavedChanges) onUnsavedChanges(true);
                                    }
                                }} title={t('settings.overlay.import')}>{t('settings.overlay.import')}</button>
                                <button className="preset-btn" onClick={async () => {
                                    await window.electron.exportOverlayPreset(overlaySettings, selectedOverlayPreset || 'overlay-preset');
                                }} title={t('settings.overlay.export')}>{t('settings.overlay.export')}</button>
                                {selectedOverlayPreset && (
                                    <button className="preset-btn preset-btn-danger" onClick={async () => {
                                        if (!window.confirm(`プリセット「${selectedOverlayPreset}」を削除しますか？`)) return;
                                        await window.electron.deleteOverlayPreset(selectedOverlayPreset);
                                        setSelectedOverlayPreset('');
                                        const list = await window.electron.getOverlayPresets();
                                        setOverlayPresets(list);
                                    }} title={t('settings.overlay.deletePreset')}>{t('settings.overlay.deletePreset')}</button>
                                )}
                            </div>

                            {/* プリセット名入力（保存ボタン押下時のみ表示） */}
                            {showOverlayPresetSave && (
                                <div className="preset-save-row">
                                    <input
                                        type="text"
                                        className="preset-name-input"
                                        placeholder={t('settings.overlay.namePlaceholder')}
                                        value={overlayPresetNameInput}
                                        onChange={(e) => setOverlayPresetNameInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && overlayPresetNameInput.trim()) {
                                                (async () => {
                                                    await window.electron.saveOverlayPreset(overlayPresetNameInput, overlaySettings);
                                                    setShowOverlayPresetSave(false);
                                                    setOverlayPresetNameInput('');
                                                    setSelectedOverlayPreset(overlayPresetNameInput);
                                                    const list = await window.electron.getOverlayPresets();
                                                    setOverlayPresets(list);
                                                })();
                                            }
                                        }}
                                    />
                                    <button className="preset-btn" onClick={async () => {
                                        if (!overlayPresetNameInput.trim()) return;
                                        await window.electron.saveOverlayPreset(overlayPresetNameInput, overlaySettings);
                                        setShowOverlayPresetSave(false);
                                        setOverlayPresetNameInput('');
                                        setSelectedOverlayPreset(overlayPresetNameInput);
                                        const list = await window.electron.getOverlayPresets();
                                        setOverlayPresets(list);
                                    }} disabled={!overlayPresetNameInput.trim()}>{t('settings.overlay.confirm')}</button>
                                </div>
                            )}

                            <div className="settings-field">
                                <label>{t('settings.overlay.boxBgLabel')}</label>
                                <input
                                    type="text"
                                    value={overlaySettings.boxBg}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, boxBg: e.target.value })}
                                    placeholder="rgba(0, 0, 0, 0.65)"
                                />
                                <span className="field-hint">{t('settings.overlay.boxBgHint')}</span>
                            </div>

                            <div className="settings-field">
                                <label>{t('settings.overlay.boxBorderColorLabel')}</label>
                                <div className="overlay-color-row">
                                    <input
                                        type="color"
                                        value={overlaySettings.boxBorderColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, boxBorderColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        value={overlaySettings.boxBorderColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, boxBorderColor: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="settings-field">
                                <label>{t('settings.overlay.boxBorderWidthLabel')}</label>
                                <input
                                    type="text"
                                    value={overlaySettings.boxBorderWidth}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, boxBorderWidth: e.target.value })}
                                    placeholder="5px"
                                />
                            </div>

                            <div className="settings-field">
                                <label>{t('settings.overlay.boxRadiusLabel')}</label>
                                <input
                                    type="text"
                                    value={overlaySettings.boxRadius}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, boxRadius: e.target.value })}
                                    placeholder="10px"
                                />
                            </div>

                            <div className="settings-field">
                                <label>{t('settings.overlay.userFontSizeLabel')}</label>
                                <input
                                    type="text"
                                    value={overlaySettings.userFontSize}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, userFontSize: e.target.value })}
                                    placeholder="0.9rem"
                                />
                            </div>

                            <div className="settings-field">
                                <label>ユーザーコメント 文字色</label>
                                <div className="overlay-color-row">
                                    <input
                                        type="color"
                                        value={overlaySettings.userColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, userColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        value={overlaySettings.userColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, userColor: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="settings-field">
                                <label>{t('settings.overlay.iconSizeLabel')}</label>
                                <input
                                    type="text"
                                    value={overlaySettings.iconSize || '28px'}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, iconSize: e.target.value })}
                                    placeholder="28px"
                                />
                                <span className="field-hint">{t('settings.overlay.iconSizeHint')}</span>
                            </div>

                            <div className="settings-field">
                                <label>{t('settings.overlay.replyFontSizeLabel')}</label>
                                <input
                                    type="text"
                                    value={overlaySettings.replyFontSize}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, replyFontSize: e.target.value })}
                                    placeholder="1.4rem"
                                />
                            </div>

                            <div className="settings-field">
                                <label>AI返答 文字色</label>
                                <div className="overlay-color-row">
                                    <input
                                        type="color"
                                        value={overlaySettings.replyColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, replyColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        value={overlaySettings.replyColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, replyColor: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="settings-field">
                                <label>出現アニメーション</label>
                                <select
                                    value={overlaySettings.animationType}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, animationType: e.target.value })}
                                >
                                    <option value="slideUp">⬆️ 下から上 (slideUp)</option>
                                    <option value="slideDown">⬇️ 上から下 (slideDown)</option>
                                    <option value="slideLeft">⬅️ 右から左 (slideLeft)</option>
                                    <option value="slideRight">➡️ 左から右 (slideRight)</option>
                                    <option value="fadeOnly">✨ フェードのみ (fadeOnly)</option>
                                </select>
                            </div>

                            <div className="settings-field">
                                <label>アニメーション速度</label>
                                <input
                                    type="text"
                                    value={overlaySettings.animationDuration}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, animationDuration: e.target.value })}
                                    placeholder="0.3s"
                                />
                            </div>

                            <div className="settings-field">
                                <label>表示時間（秒）</label>
                                <input
                                    type="number"
                                    value={Math.round(overlaySettings.displayDuration / 1000)}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, displayDuration: Number(e.target.value) * 1000 })}
                                    min={5}
                                    max={300}
                                />
                                <span className="field-hint">メッセージが消えるまでの秒数</span>
                            </div>

                            <div className="settings-field">
                                <label>フェードアウト時間</label>
                                <input
                                    type="text"
                                    value={overlaySettings.fadeDuration}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, fadeDuration: e.target.value })}
                                    placeholder="1s"
                                />
                            </div>

                            <h3 style={{ marginTop: '24px', marginBottom: '12px', color: '#FFD700', borderBottom: '1px solid #333', paddingBottom: '8px', fontSize: '1rem' }}>💰 スーパーチャット / ビッツ専用スタイル</h3>

                            <div className="settings-field">
                                <label>ボックス背景色 1 (左上)</label>
                                <input
                                    type="text"
                                    value={overlaySettings.scBoxBg1}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, scBoxBg1: e.target.value })}
                                    placeholder="rgba(255, 215, 0, 0.25)"
                                />
                            </div>

                            <div className="settings-field">
                                <label>ボックス背景色 2 (右下)</label>
                                <input
                                    type="text"
                                    value={overlaySettings.scBoxBg2}
                                    onChange={(e) => setOverlaySettings({ ...overlaySettings, scBoxBg2: e.target.value })}
                                    placeholder="rgba(255, 140, 0, 0.2)"
                                />
                            </div>

                            <div className="settings-field">
                                <label>ライン色</label>
                                <div className="overlay-color-row">
                                    <input
                                        type="color"
                                        value={overlaySettings.scBorderColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, scBorderColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        value={overlaySettings.scBorderColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, scBorderColor: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="settings-field">
                                <label>「Super Chat」ラベル色</label>
                                <div className="overlay-color-row">
                                    <input
                                        type="color"
                                        value={overlaySettings.scLabelColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, scLabelColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        value={overlaySettings.scLabelColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, scLabelColor: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="settings-field">
                                <label>ユーザーコメント 文字色</label>
                                <div className="overlay-color-row">
                                    <input
                                        type="color"
                                        value={overlaySettings.scUserColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, scUserColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        value={overlaySettings.scUserColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, scUserColor: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="settings-field">
                                <label>AI返答 文字色</label>
                                <div className="overlay-color-row">
                                    <input
                                        type="color"
                                        value={overlaySettings.scReplyColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, scReplyColor: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        value={overlaySettings.scReplyColor}
                                        onChange={(e) => setOverlaySettings({ ...overlaySettings, scReplyColor: e.target.value })}
                                    />
                                </div>
                            </div>
                        </section>
                    )}

                    {/* === 音声設定 === */}
                    {activeCategory === 'audio' && (
                        <section className="settings-section">
                            <h2>{t('settings.audio.title')}</h2>

                            <div className="settings-field">
                                <label>TTSエンジン</label>
                                <select
                                    value={settings.ttsEngine}
                                    onChange={(e) => handleChange('ttsEngine', e.target.value)}
                                >
                                    <option value="voicevox">VoiceVox (ずんだもん等)</option>
                                    <option value="voiceger">Voiceger (GPT-SoVITS + RVC)</option>
                                </select>
                                <div className="field-hint" style={{ marginTop: '8px', lineHeight: '1.4' }}>
                                    {settings.ttsEngine === 'voicevox' ? t('settings.audio.voicevoxDesc') : t('settings.audio.voicegerDesc')}
                                </div>
                            </div>

                            {settings.ttsEngine === 'voicevox' && (
                                <>
                                    <div className="settings-field">
                                        <label>{t('settings.audio.voicevoxUrl')}</label>
                                        <input
                                            type="text"
                                            value={settings.voicevoxUrl}
                                            onChange={(e) => handleChange('voicevoxUrl', e.target.value)}
                                            placeholder="http://127.0.0.1:50021"
                                        />
                                    </div>

                                    <div className="settings-field">
                                        <label>{t('settings.audio.speaker')}</label>
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
                                                    <span className="field-warning">{t('settings.audio.voicevoxNotConnected')}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="settings-field settings-checkbox-field">
                                        <label className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={settings.voicevoxMultiLang ?? false}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    if (checked) {
                                                        if (window.confirm(t('settings.audio.voicevoxMultiLangWarn'))) {
                                                            handleChange('voicevoxMultiLang', 1);
                                                        }
                                                    } else {
                                                        handleChange('voicevoxMultiLang', 0);
                                                    }
                                                }}
                                            />
                                            {t('settings.audio.multiLang')}
                                        </label>
                                        <span className="field-hint">{t('settings.audio.multiLangHint')}</span>
                                    </div>
                                </>
                            )}

                            {settings.ttsEngine === 'voiceger' && (
                                <>
                                    <div className="settings-field">
                                        <label>Voiceger URL</label>
                                        <div className="field-with-status">
                                            <input
                                                type="text"
                                                value={settings.voicegerUrl}
                                                onChange={(e) => handleChange('voicegerUrl', e.target.value)}
                                                placeholder="http://127.0.0.1:8000"
                                            />
                                            {!health?.voiceger?.connected && (
                                                <span className="field-warning">⚠ Voiceger未接続</span>
                                            )}
                                        </div>
                                        <span className="field-hint">Voiceger APIサーバーのURLを入力してください。</span>
                                    </div>

                                    <div className="settings-field">
                                        <label>{t('settings.audio.voicegerSpeaker')}</label>
                                        {health?.voiceger?.connected && Array.isArray(health.voiceger.speakers) && health.voiceger.speakers.length > 0 ? (
                                            <select
                                                value={settings.voicegerSpeakerId}
                                                onChange={(e) => handleChange('voicegerSpeakerId', e.target.value)}
                                            >
                                                {health.voiceger.speakers.map((speaker) => (
                                                    <option key={speaker.id} value={speaker.id}>
                                                        {speaker.name}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="field-with-status">
                                                <input
                                                    type="text"
                                                    value={settings.voicegerSpeakerId}
                                                    onChange={(e) => handleChange('voicegerSpeakerId', e.target.value)}
                                                    placeholder="01_ref_emoNormal026.wav"
                                                />
                                                {!health?.voiceger?.connected && (
                                                    <span className="field-warning">{t('settings.audio.voicegerNotConnected')}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="settings-field settings-checkbox-field">
                                        <label className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={settings.voicegerMultiLang ?? false}
                                                onChange={(e) => handleChange('voicegerMultiLang', e.target.checked ? 1 : 0)}
                                            />
                                            {t('settings.audio.multiLang')}
                                        </label>
                                        <span className="field-hint">{t('settings.audio.multiLangHint')}</span>
                                    </div>

                                    <div className="settings-field">
                                        <label>Voiceger 管理</label>
                                        <div className="settings-actions-buttons" style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                            <button
                                                className="btn-save"
                                                style={{ padding: '8px 12px', fontSize: '0.9rem', backgroundColor: '#4CAF50', flex: 1 }}
                                                onClick={async () => {
                                                    if (!window.confirm("Voicegerサーバーを再起動しますか？")) return;
                                                    await window.electron.restartVoiceger();
                                                }}
                                            >
                                                🔄 再起動
                                            </button>
                                            <button
                                                className="btn-save"
                                                style={{ padding: '8px 12px', fontSize: '0.9rem', backgroundColor: '#2196F3', flex: 1 }}
                                                onClick={async () => {
                                                    if (!window.confirm("Voicegerのファイル群の整合性をチェックし、不足分をダウンロードしますか？(※ターミナルが開きます)")) return;
                                                    await window.electron.installVoiceger('resume');
                                                }}
                                            >
                                                整合性チェック (不足分DL)
                                            </button>
                                            <button
                                                className="btn-reset"
                                                style={{ padding: '8px 12px', fontSize: '0.9rem', backgroundColor: '#F44336', color: 'white', flex: 1 }}
                                                onClick={async () => {
                                                    if (!window.confirm("本当にVoicegerをアンインストールしますか？\n(voiceger_v2フォルダ全体が完全に削除されます)")) return;
                                                    await window.electron.installVoiceger('uninstall');
                                                }}
                                            >
                                                アンインストール
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="settings-field">
                                <label>{t('settings.audio.outputDevice')}</label>
                                <select
                                    value={settings.audioOutputDeviceId}
                                    onChange={(e) => handleChange('audioOutputDeviceId', e.target.value)}
                                >
                                    <option value="">{t('settings.audio.systemDefault')}</option>
                                    {audioDevices.map(device => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `Unknown Device (${device.deviceId.slice(0, 8)}...)`}
                                        </option>
                                    ))}
                                </select>
                                <span className="field-hint">{t('settings.audio.outputHint')}</span>
                            </div>
                        </section>
                    )}

                    {/* === キュー・メモリ設定 === */}
                    {activeCategory === 'queue' && (
                        <section className="settings-section">
                            <h2>{t('settings.queue.title')}</h2>

                            <div className="settings-field">
                                <label>{t('settings.queue.maxSize')}</label>
                                <input
                                    type="number"
                                    value={settings.maxQueueSize}
                                    onChange={(e) => handleChange('maxQueueSize', Number(e.target.value))}
                                    min={1}
                                    max={10}
                                />
                                <span className="field-hint">{t('settings.queue.maxSizeHint')}</span>
                            </div>

                            <div className="settings-field">
                                <label>{t('settings.queue.memory')}</label>
                                <input
                                    type="number"
                                    value={settings.memorySize}
                                    onChange={(e) => handleChange('memorySize', Number(e.target.value))}
                                    min={0}
                                    max={50}
                                />
                                <span className="field-hint">{t('settings.queue.memoryHint')}</span>
                            </div>
                        </section>
                    )}

                    {/* === 言語設定 === */}
                    {activeCategory === 'language' && (
                        <section className="settings-section">
                            <h2>{t('settings.lang.title')}</h2>
                            <div className="settings-field">
                                <label>{t('settings.lang.select')}</label>
                                <select
                                    value={locale}
                                    onChange={(e) => setLocale(e.target.value as Locale)}
                                >
                                    {(Object.entries(localeNames) as [Locale, string][]).map(([code, name]) => (
                                        <option key={code} value={code}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        </section>
                    )}

                </div>
            </div>

            {/* === ボタン === */}
            <div className="settings-actions">
                <div className="settings-actions-buttons">
                    <button className="btn-save" onClick={handleSave} disabled={saving}>
                        {saving ? t('settings.saving') : t('settings.save')}
                    </button>
                    <button className="btn-reset" onClick={handleReset}>
                        {t('settings.reset')}
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
