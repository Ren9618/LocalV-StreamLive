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
    // プリセット管理用ステート
    const [presets, setPresets] = useState<{ name: string, path: string }[]>([]);
    const [selectedPreset, setSelectedPreset] = useState('');
    const [presetNameInput, setPresetNameInput] = useState('');
    const [showPresetSave, setShowPresetSave] = useState(false);
    // オーバーレイ設定用ステート
    const [overlaySettings, setOverlaySettings] = useState<any>(null);
    const [overlaySaveMsg, setOverlaySaveMsg] = useState('');

    // 初回読み込み
    useEffect(() => {
        window.electron.getSettings().then((s: AppSettings) => {
            setSettings(s);
        });
        // プリセット一覧も取得
        refreshPresets();
        // オーバーレイ設定も取得
        window.electron.getOverlaySettings().then((s: any) => setOverlaySettings(s));
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

                        {/* プリセット操作エリア */}
                        <div className="preset-toolbar">
                            <select
                                className="preset-select"
                                value={selectedPreset}
                                onChange={(e) => handleLoadPreset(e.target.value)}
                            >
                                <option value="">— プリセットを選択 —</option>
                                {presets.map(p => (
                                    <option key={p.name} value={p.name}>{p.name}</option>
                                ))}
                            </select>
                            <button className="preset-btn" onClick={() => setShowPresetSave(!showPresetSave)} title="名前を付けて保存">💾 保存</button>
                            <button className="preset-btn" onClick={handleImportPrompt} title="ファイルから読み込み">📥 インポート</button>
                            <button className="preset-btn" onClick={handleExportPrompt} title="ファイルに書き出し">📤 エクスポート</button>
                            {selectedPreset && (
                                <button className="preset-btn preset-btn-danger" onClick={handleDeletePreset} title="選択中のプリセットを削除">🗑</button>
                            )}
                        </div>

                        {/* プリセット名入力（保存ボタン押下時のみ表示） */}
                        {showPresetSave && (
                            <div className="preset-save-row">
                                <input
                                    type="text"
                                    className="preset-name-input"
                                    placeholder="プリセット名を入力..."
                                    value={presetNameInput}
                                    onChange={(e) => setPresetNameInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                                />
                                <button className="preset-btn" onClick={handleSavePreset} disabled={!presetNameInput.trim()}>✅ 確定</button>
                            </div>
                        )}

                        <textarea
                            value={settings.systemPrompt}
                            onChange={(e) => handleChange('systemPrompt', e.target.value)}
                            rows={12}
                            placeholder="AIの性格やルールを記述..."
                        />
                    </div>
                </section>

                {/* === OBSオーバーレイ設定 === */}
                {overlaySettings && (
                    <section className="settings-section">
                        <h2>🎨 OBSオーバーレイ設定</h2>
                        <span className="field-hint">保存後、OBSでブラウザソースを「再読み込み」すると反映されます</span>

                        <div className="settings-field">
                            <label>ボックス背景色</label>
                            <input
                                type="text"
                                value={overlaySettings.boxBg}
                                onChange={(e) => setOverlaySettings({ ...overlaySettings, boxBg: e.target.value })}
                                placeholder="rgba(0, 0, 0, 0.65)"
                            />
                            <span className="field-hint">例: rgba(0, 0, 0, 0.65), transparent, #333</span>
                        </div>

                        <div className="settings-field">
                            <label>ライン色</label>
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
                            <label>ライン太さ</label>
                            <input
                                type="text"
                                value={overlaySettings.boxBorderWidth}
                                onChange={(e) => setOverlaySettings({ ...overlaySettings, boxBorderWidth: e.target.value })}
                                placeholder="5px"
                            />
                        </div>

                        <div className="settings-field">
                            <label>角丸</label>
                            <input
                                type="text"
                                value={overlaySettings.boxRadius}
                                onChange={(e) => setOverlaySettings({ ...overlaySettings, boxRadius: e.target.value })}
                                placeholder="10px"
                            />
                        </div>

                        <div className="settings-field">
                            <label>ユーザーコメント 文字サイズ</label>
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
                            <label>AI返答 文字サイズ</label>
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

                        <button
                            className="save-btn"
                            onClick={async () => {
                                await window.electron.saveOverlaySettings(overlaySettings);
                                setOverlaySaveMsg('✅ オーバーレイ設定を保存しました（OBSで再読み込みしてください）');
                                setTimeout(() => setOverlaySaveMsg(''), 5000);
                            }}
                        >💾 オーバーレイ設定を保存</button>
                        {overlaySaveMsg && <span className="save-message">{overlaySaveMsg}</span>}
                    </section>
                )}

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
