import { useState, useEffect, useMemo } from 'react';
import './Dashboard.css';
import { useLocale } from './i18n';

// ログエントリの型定義（LogViewer.tsxと同一）
interface LogEntry {
    id: number;
    timestamp: string;
    username: string;
    userComment: string;
    userLogoUrl?: string;
    aiReply: string;
    source: 'ai' | 'filter' | 'error' | 'debug';
    processingMs: number;
    isSuperChat?: boolean;
}

interface DashboardProps {
    health: any;
}

function Dashboard({ health }: DashboardProps) {
    const { t } = useLocale();
    const [youtubeVideoId, setYoutubeVideoId] = useState('');
    const [presets, setPresets] = useState<{ name: string; path: string }[]>([]);
    const [selectedPreset, setSelectedPreset] = useState('');
    const [saving, setSaving] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    // 一時停止ステート
    const [isPaused, setIsPaused] = useState(false);
    // クイックテスト入力
    const [quickTestInput, setQuickTestInput] = useState('');
    const [quickTestSending, setQuickTestSending] = useState(false);

    useEffect(() => {
        window.electron.getSettings().then((s: any) => {
            setYoutubeVideoId(s.youtubeVideoId || '');
        });
        refreshPresets();
        window.electron.getLogs().then((existingLogs: LogEntry[]) => {
            setLogs(existingLogs);
        });
        window.electron.getProcessingPaused().then((paused: boolean) => {
            setIsPaused(paused);
        });
        const cleanup = window.electron.onLogEntry((entry: LogEntry) => {
            setLogs(prev => [...prev, entry]);
        });
        return cleanup;
    }, []);

    const refreshPresets = async () => {
        const list = await window.electron.getPresets();
        setPresets(list);
    };

    const handleSaveYoutube = async () => {
        setSaving(true);
        try {
            const s = await window.electron.getSettings();
            s.youtubeVideoId = youtubeVideoId;
            await window.electron.saveSettings(s);
        } catch (e) {
            console.error('Failed to save youtube setting:', e);
        } finally {
            setTimeout(() => setSaving(false), 500);
        }
    };

    const handleLoadPreset = async (name: string) => {
        if (!name) return;
        const text = await window.electron.loadPreset(name);
        if (text !== null) {
            const s = await window.electron.getSettings();
            s.systemPrompt = text;
            await window.electron.saveSettings(s);
            setSelectedPreset(name);
        }
    };

    const handleTogglePause = async () => {
        const newState = !isPaused;
        await window.electron.setProcessingPaused(newState);
        setIsPaused(newState);
    };

    const handleQuickTest = async () => {
        if (!quickTestInput.trim() || quickTestSending) return;
        setQuickTestSending(true);
        try {
            await window.electron.sendComment(quickTestInput, false, 'テスト');
            setQuickTestInput('');
        } catch (e) {
            console.error('クイックテスト送信エラー:', e);
        } finally {
            setQuickTestSending(false);
        }
    };

    const stats = useMemo(() => {
        const aiCount = logs.filter(l => l.source === 'ai').length;
        const filterCount = logs.filter(l => l.source === 'filter').length;
        const errorCount = logs.filter(l => l.source === 'error').length;
        // デバッグログを除いたものを全体の件数とする
        const validLogs = logs.filter(l => l.source !== 'debug');
        const total = validLogs.length;
        const aiLogs = logs.filter(l => l.source === 'ai' && l.processingMs > 0);
        const avgMs = aiLogs.length > 0 ? Math.round(aiLogs.reduce((sum, l) => sum + l.processingMs, 0) / aiLogs.length) : 0;
        return { total, aiCount, filterCount, errorCount, avgMs };
    }, [logs]);

    const latestLogs = [...logs].filter(l => l.source !== 'debug').slice(-10).reverse();

    return (
        <div className="dashboard-container">
            {/* === 上段: 統計カード === */}
            <div className="stats-row">
                <div className="stat-card">
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-label">{t('dash.totalComments')}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.aiCount}</div>
                    <div className="stat-label">{t('dash.aiResponses')}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.filterCount}</div>
                    <div className="stat-label">{t('dash.filtered')}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.avgMs > 0 ? `${(stats.avgMs / 1000).toFixed(1)}s` : '—'}</div>
                    <div className="stat-label">{t('dash.avgResponse')}</div>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* 接続＆クイック設定 */}
                <div className="dashboard-card">
                    <h3>{t('dash.connection')}</h3>
                    <div className="card-content quick-youtube">
                        <div className="input-group">
                            <input
                                type="text"
                                value={youtubeVideoId}
                                onChange={(e) => setYoutubeVideoId(e.target.value)}
                                placeholder={t('dash.youtubePlaceholder')}
                                className="dashboard-input"
                            />
                            <button
                                className="btn-primary"
                                onClick={handleSaveYoutube}
                                disabled={saving}
                            >
                                {saving ? t('dash.applying') : t('dash.apply')}
                            </button>
                        </div>
                        <div className="connection-status">
                            {t('dash.status')}
                            <span className={health?.youtube?.connected ? 'status-ok' : 'status-err'}>
                                {health?.youtube?.connected ? t('dash.connected') : t('dash.disconnected')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* クイックアクション */}
                <div className="dashboard-card">
                    <h3>{t('dash.quickAction')}</h3>
                    <div className="card-content">
                        <div className="action-group">
                            <label>{t('dash.changePersonality')}</label>
                            <div className="preset-selector">
                                <select
                                    className="dashboard-select"
                                    value={selectedPreset}
                                    onChange={(e) => handleLoadPreset(e.target.value)}
                                >
                                    <option value="">{t('dash.default')}</option>
                                    {presets.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* 一時停止/再開ボタン */}
                        <div className="action-group" style={{ marginTop: '12px' }}>
                            <label>{t('dash.processing')}</label>
                            <button
                                className={`btn-pause ${isPaused ? 'paused' : ''}`}
                                onClick={handleTogglePause}
                            >
                                {isPaused ? t('dash.resume') : t('dash.pause')}
                            </button>
                            {isPaused && <span className="pause-hint">{t('dash.pauseHint')}</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* クイックテスト入力 */}
            <div className="dashboard-card">
                <h3>{t('dash.quickTest')}</h3>
                <div className="quick-test-row">
                    <input
                        type="text"
                        value={quickTestInput}
                        onChange={(e) => setQuickTestInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleQuickTest(); }}
                        placeholder={t('dash.quickTestPlaceholder')}
                        className="dashboard-input"
                        disabled={quickTestSending}
                    />
                    <button
                        className="btn-primary"
                        onClick={handleQuickTest}
                        disabled={quickTestSending || !quickTestInput.trim()}
                    >
                        {quickTestSending ? t('dash.quickTestSending') : t('dash.quickTestSend')}
                    </button>
                </div>
            </div>

            {/* 最新のやり取りミニビュー */}
            <div className="dashboard-card full-width">
                <h3>{t('dash.latestChats')}</h3>
                <div className="mini-log-view">
                    {latestLogs.length === 0 ? (
                        <div className="empty-log">{t('dash.noComments')}</div>
                    ) : (
                        latestLogs.map((log) => (
                            <div key={log.id} className={`mini-log-entry ${log.isSuperChat ? 'superchat' : ''}`}>
                                <div className="log-user">
                                    <span className="log-tag">
                                        {log.source === 'ai' ? `🤖 ${t('log.badgeAi')}` : log.source === 'filter' ? `⚡ ${t('log.badgeFilter')}` : `❌ ${t('log.badgeError')}`}
                                    </span>
                                    {log.userLogoUrl && <img src={log.userLogoUrl} alt="" className="log-avatar" />}
                                    <span className="log-text">{log.username}: {log.userComment}</span>
                                </div>
                                <div className="log-bot">
                                    {log.aiReply.startsWith('[スキップ]') || log.aiReply.startsWith('[無視]')
                                        ? <span className="log-skipped">{log.aiReply}</span>
                                        : <>🤖 {log.aiReply}</>
                                    }
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
