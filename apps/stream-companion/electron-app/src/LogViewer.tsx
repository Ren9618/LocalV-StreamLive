import { useState, useEffect, useRef } from 'react';
import './LogViewer.css';
import { useLocale } from './i18n';

// ログエントリの型定義
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

function LogViewer() {
    const { t } = useLocale();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState<'all' | 'ai' | 'filter' | 'error'>('all');
    const [showDebug, setShowDebug] = useState(false);
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        window.electron.getLogs().then((existingLogs: LogEntry[]) => {
            setLogs(existingLogs);
        });
        const cleanup = window.electron.onLogEntry((entry: LogEntry) => {
            setLogs(prev => [...prev, entry]);
        });
        return cleanup;
    }, []);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleClear = async () => {
        await window.electron.clearLogs();
        setLogs([]);
    };

    const filteredLogs = logs.filter(log => {
        if (!showDebug && log.source === 'debug') return false;
        if (filter === 'all') return true;
        return log.source === filter;
    });

    const formatTime = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const sourceLabel = (source: LogEntry['source']) => {
        switch (source) {
            case 'ai': return { text: t('log.badgeAi'), className: 'badge-ai' };
            case 'filter': return { text: t('log.badgeFilter'), className: 'badge-filter' };
            case 'error': return { text: t('log.badgeError'), className: 'badge-error' };
            case 'debug': return { text: t('log.badgeDebug'), className: 'badge-debug' };
        }
    };

    return (
        <div className="log-container">
            {/* ヘッダー */}
            <div className="log-header">
                <div className="log-filters">
                    <button
                        className={`log-filter-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        {t('log.all')} ({logs.length})
                    </button>
                    <button
                        className={`log-filter-btn ${filter === 'ai' ? 'active' : ''}`}
                        onClick={() => setFilter('ai')}
                    >
                        {t('log.ai')} ({logs.filter(l => l.source === 'ai').length})
                    </button>
                    <button
                        className={`log-filter-btn ${filter === 'filter' ? 'active' : ''}`}
                        onClick={() => setFilter('filter')}
                    >
                        {t('log.filter')} ({logs.filter(l => l.source === 'filter').length})
                    </button>
                    <button
                        className={`log-filter-btn ${filter === 'error' ? 'active' : ''}`}
                        onClick={() => setFilter('error')}
                    >
                        {t('log.error')} ({logs.filter(l => l.source === 'error').length})
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <label className="log-debug-toggle">
                        <input
                            type="checkbox"
                            checked={showDebug}
                            onChange={(e) => setShowDebug(e.target.checked)}
                        />
                        {t('log.showDebug')}
                    </label>
                    <button className="log-clear-btn" onClick={handleClear}>
                        {t('log.clear')}
                    </button>
                </div>
            </div>

            {/* ログ一覧 */}
            <div className="log-list">
                {filteredLogs.length === 0 ? (
                    <div className="log-empty">
                        {logs.length === 0
                            ? t('log.empty')
                            : t('log.emptyFiltered')
                        }
                    </div>
                ) : (
                    filteredLogs.map(log => {
                        const badge = sourceLabel(log.source);
                        return (
                            <div key={log.id} className={`log-entry log-${log.source}`}>
                                <div className="log-meta">
                                    <span className="log-time">{formatTime(log.timestamp)}</span>
                                    <span className={`log-badge ${badge.className}`}>{badge.text}</span>
                                    <span className="log-ms">{log.processingMs}ms</span>
                                </div>
                                <div className="log-comment">
                                    {log.isSuperChat ? '💰 ' : '💬 '}
                                    {log.userLogoUrl && <img src={log.userLogoUrl} alt="icon" style={{ width: '1.2em', height: '1.2em', borderRadius: '50%', verticalAlign: 'middle', marginRight: '4px' }} />}
                                    <span style={{ fontWeight: 'bold', marginRight: '8px' }}>{log.username}</span>
                                    {log.userComment}
                                </div>
                                {log.source !== 'debug' && (
                                    <div className="log-reply">🤖 {log.aiReply}</div>
                                )}
                            </div>
                        );
                    })
                )}
                <div ref={logEndRef} />
            </div>
        </div>
    );
}

export default LogViewer;
