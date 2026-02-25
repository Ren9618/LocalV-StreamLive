import { useState, useEffect, useRef } from 'react';
import './LogViewer.css';

// ログエントリの型定義
interface LogEntry {
    id: number;
    timestamp: string;
    userComment: string;
    aiReply: string;
    source: 'ai' | 'filter' | 'error';
    processingMs: number;
}

function LogViewer() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState<'all' | 'ai' | 'filter' | 'error'>('all');
    const logEndRef = useRef<HTMLDivElement>(null);

    // 初回読み込み＋リアルタイム受信
    useEffect(() => {
        // 既存ログを取得
        window.electron.getLogs().then((existingLogs: LogEntry[]) => {
            setLogs(existingLogs);
        });

        // 新しいログのリアルタイム受信
        window.electron.onLogEntry((entry: LogEntry) => {
            setLogs(prev => [...prev, entry]);
        });
    }, []);

    // 新しいログが来たら自動スクロール
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // ログクリア
    const handleClear = async () => {
        await window.electron.clearLogs();
        setLogs([]);
    };

    // フィルター適用
    const filteredLogs = filter === 'all'
        ? logs
        : logs.filter(log => log.source === filter);

    // タイムスタンプをHH:MM:SS形式に変換
    const formatTime = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // ソースラベル
    const sourceLabel = (source: LogEntry['source']) => {
        switch (source) {
            case 'ai': return { text: 'AI', className: 'badge-ai' };
            case 'filter': return { text: 'フィルター', className: 'badge-filter' };
            case 'error': return { text: 'エラー', className: 'badge-error' };
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
                        すべて ({logs.length})
                    </button>
                    <button
                        className={`log-filter-btn ${filter === 'ai' ? 'active' : ''}`}
                        onClick={() => setFilter('ai')}
                    >
                        🤖 AI ({logs.filter(l => l.source === 'ai').length})
                    </button>
                    <button
                        className={`log-filter-btn ${filter === 'filter' ? 'active' : ''}`}
                        onClick={() => setFilter('filter')}
                    >
                        ⚡ フィルター ({logs.filter(l => l.source === 'filter').length})
                    </button>
                    <button
                        className={`log-filter-btn ${filter === 'error' ? 'active' : ''}`}
                        onClick={() => setFilter('error')}
                    >
                        ❌ エラー ({logs.filter(l => l.source === 'error').length})
                    </button>
                </div>
                <button className="log-clear-btn" onClick={handleClear}>
                    🗑️ クリア
                </button>
            </div>

            {/* ログ一覧 */}
            <div className="log-list">
                {filteredLogs.length === 0 ? (
                    <div className="log-empty">
                        {logs.length === 0
                            ? 'ログはまだありません。テストタブでコメントを送信するとここに記録されます。'
                            : 'フィルター条件に一致するログがありません。'
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
                                <div className="log-comment">👤 {log.userComment}</div>
                                <div className="log-reply">🤖 {log.aiReply}</div>
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
