import { useState, useEffect } from 'react';
import './Filters.css';

// 定型文パターンの型
interface QuickReplyPattern {
    pattern: string;
    label: string;
    replies: string[];
}

// フィルター設定の型
interface FilterSettings {
    blacklist: string[];
    quickReplies: QuickReplyPattern[];
    superChatReplies: string[];
    trigger: {
        enabled: boolean;
        prefixes: string[];
    };
}
interface FiltersProps {
    onUnsavedChanges?: (hasChanges: boolean) => void;
}

function Filters({ onUnsavedChanges }: FiltersProps) {
    const [filters, setFilters] = useState<FilterSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    const updateFilters = (newFilters: FilterSettings) => {
        setFilters(newFilters);
        if (onUnsavedChanges) onUnsavedChanges(true);
    };

    // ブラックリスト追加用
    const [newBlacklistWord, setNewBlacklistWord] = useState('');

    // スパチャ返答追加用
    const [newSuperChatReply, setNewSuperChatReply] = useState('');

    // 定型文パターン追加用
    const [newPatternLabel, setNewPatternLabel] = useState('');
    const [newPatternRegex, setNewPatternRegex] = useState('');
    const [newPatternReply, setNewPatternReply] = useState('');

    // 指名モードプレフィックス追加用
    const [newTriggerPrefix, setNewTriggerPrefix] = useState('');

    // 初回読み込み
    useEffect(() => {
        window.electron.getFilters().then((f: FilterSettings) => {
            setFilters(f);
        });
    }, []);

    // 保存
    const handleSave = async () => {
        if (!filters) return;
        setSaving(true);
        setSaveMessage('');
        try {
            await window.electron.saveFilters(filters);
            setSaveMessage('✅ フィルター設定を保存しました！');
            if (onUnsavedChanges) onUnsavedChanges(false);
        } catch {
            setSaveMessage('❌ 保存に失敗しました');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    // === ブラックリスト操作 ===
    const addBlacklistWord = () => {
        if (!filters || !newBlacklistWord.trim()) return;
        updateFilters({
            ...filters,
            blacklist: [...filters.blacklist, newBlacklistWord.trim()]
        });
        setNewBlacklistWord('');
    };

    const removeBlacklistWord = (index: number) => {
        if (!filters) return;
        updateFilters({
            ...filters,
            blacklist: filters.blacklist.filter((_, i) => i !== index)
        });
    };

    // === スパチャ返答操作 ===
    const addSuperChatReply = () => {
        if (!filters || !newSuperChatReply.trim()) return;
        updateFilters({
            ...filters,
            superChatReplies: [...filters.superChatReplies, newSuperChatReply.trim()]
        });
        setNewSuperChatReply('');
    };

    const removeSuperChatReply = (index: number) => {
        if (!filters) return;
        updateFilters({
            ...filters,
            superChatReplies: filters.superChatReplies.filter((_, i) => i !== index)
        });
    };

    // === 定型文パターン操作 ===
    const addQuickReplyPattern = () => {
        if (!filters || !newPatternLabel.trim() || !newPatternRegex.trim() || !newPatternReply.trim()) return;
        // 正規表現の検証
        try {
            new RegExp(newPatternRegex);
        } catch {
            setSaveMessage('❌ 正規表現が無効です');
            setTimeout(() => setSaveMessage(''), 3000);
            return;
        }
        updateFilters({
            ...filters,
            quickReplies: [...filters.quickReplies, {
                label: newPatternLabel.trim(),
                pattern: newPatternRegex.trim(),
                replies: newPatternReply.split(',').map(r => r.trim()).filter(r => r)
            }]
        });
        setNewPatternLabel('');
        setNewPatternRegex('');
        setNewPatternReply('');
    };

    const removeQuickReplyPattern = (index: number) => {
        if (!filters) return;
        updateFilters({
            ...filters,
            quickReplies: filters.quickReplies.filter((_, i) => i !== index)
        });
    };

    // 定型文パターン内の返答を追加
    const addReplyToPattern = (patternIndex: number, reply: string) => {
        if (!filters || !reply.trim()) return;
        const updated = [...filters.quickReplies];
        updated[patternIndex] = {
            ...updated[patternIndex],
            replies: [...updated[patternIndex].replies, reply.trim()]
        };
        updateFilters({ ...filters, quickReplies: updated });
    };

    // 定型文パターン内の返答を削除
    const removeReplyFromPattern = (patternIndex: number, replyIndex: number) => {
        if (!filters) return;
        const updated = [...filters.quickReplies];
        updated[patternIndex] = {
            ...updated[patternIndex],
            replies: updated[patternIndex].replies.filter((_, i) => i !== replyIndex)
        };
        updateFilters({ ...filters, quickReplies: updated });
    };

    if (!filters) {
        return <div className="filters-loading">フィルター設定を読み込み中...</div>;
    }

    return (
        <div className="settings-wrapper">
            <div className="settings-container">

                {/* === 指名モード === */}
                <section className="filter-section">
                    <h2>🎯 指名モード</h2>
                    <p className="filter-desc">有効にすると、トリガー付きコメントのみにAIが反応します（スパチャは常に反応）</p>

                    <div className="trigger-toggle">
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={filters.trigger.enabled}
                                onChange={(e) => setFilters({
                                    ...filters,
                                    trigger: { ...filters.trigger, enabled: e.target.checked }
                                })}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                        <span className="trigger-status">
                            {filters.trigger.enabled ? '✅ 有効' : '❌ 無効（全コメントに反応）'}
                        </span>
                    </div>

                    {filters.trigger.enabled && (
                        <>
                            <p className="filter-sublabel">トリガープレフィックス:</p>
                            <div className="tag-list">
                                {filters.trigger.prefixes.map((prefix, i) => (
                                    <span key={i} className="tag tag-trigger">
                                        {prefix}
                                        <button className="tag-remove" onClick={() => {
                                            setFilters({
                                                ...filters,
                                                trigger: {
                                                    ...filters.trigger,
                                                    prefixes: filters.trigger.prefixes.filter((_, idx) => idx !== i)
                                                }
                                            });
                                        }}>×</button>
                                    </span>
                                ))}
                                {filters.trigger.prefixes.length === 0 && (
                                    <span className="tag-empty">プレフィックスがありません</span>
                                )}
                            </div>
                            <div className="add-row">
                                <input
                                    type="text"
                                    value={newTriggerPrefix}
                                    onChange={(e) => setNewTriggerPrefix(e.target.value)}
                                    placeholder="例: @AI, !ai, /bot"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && newTriggerPrefix.trim()) {
                                            setFilters({
                                                ...filters,
                                                trigger: {
                                                    ...filters.trigger,
                                                    prefixes: [...filters.trigger.prefixes, newTriggerPrefix.trim()]
                                                }
                                            });
                                            setNewTriggerPrefix('');
                                        }
                                    }}
                                />
                                <button className="btn-add" onClick={() => {
                                    if (newTriggerPrefix.trim()) {
                                        setFilters({
                                            ...filters,
                                            trigger: {
                                                ...filters.trigger,
                                                prefixes: [...filters.trigger.prefixes, newTriggerPrefix.trim()]
                                            }
                                        });
                                        setNewTriggerPrefix('');
                                    }
                                }}>追加</button>
                            </div>
                        </>
                    )}
                </section>

                {/* === ブラックリスト === */}
                <section className="filter-section">
                    <h2>🚫 ブラックリスト</h2>
                    <p className="filter-desc">これらのワードを含むコメントは無視されます</p>

                    <div className="tag-list">
                        {filters.blacklist.map((word, i) => (
                            <span key={i} className="tag tag-danger">
                                {word}
                                <button className="tag-remove" onClick={() => removeBlacklistWord(i)}>×</button>
                            </span>
                        ))}
                        {filters.blacklist.length === 0 && (
                            <span className="tag-empty">ブラックリストは空です</span>
                        )}
                    </div>

                    <div className="add-row">
                        <input
                            type="text"
                            value={newBlacklistWord}
                            onChange={(e) => setNewBlacklistWord(e.target.value)}
                            placeholder="NGワードを入力..."
                            onKeyDown={(e) => e.key === 'Enter' && addBlacklistWord()}
                        />
                        <button className="btn-add" onClick={addBlacklistWord}>追加</button>
                    </div>
                </section>

                {/* === 定型文パターン === */}
                <section className="filter-section">
                    <h2>⚡ 定型文パターン</h2>
                    <p className="filter-desc">パターンにマッチしたコメントにはAIを使わず即座に返答します</p>

                    {filters.quickReplies.map((qr, qrIndex) => (
                        <div key={qrIndex} className="pattern-card">
                            <div className="pattern-header">
                                <span className="pattern-label">{qr.label}</span>
                                <code className="pattern-regex">{qr.pattern}</code>
                                <button className="btn-delete-small" onClick={() => removeQuickReplyPattern(qrIndex)}>🗑</button>
                            </div>
                            <div className="pattern-replies">
                                {qr.replies.map((reply, rIndex) => (
                                    <span key={rIndex} className="tag tag-reply">
                                        {reply}
                                        <button className="tag-remove" onClick={() => removeReplyFromPattern(qrIndex, rIndex)}>×</button>
                                    </span>
                                ))}
                                <AddInlineInput onAdd={(val) => addReplyToPattern(qrIndex, val)} placeholder="返答を追加..." />
                            </div>
                        </div>
                    ))}

                    {/* 新しいパターンの追加フォーム */}
                    <div className="add-pattern-form">
                        <h3>＋ パターンを追加</h3>
                        <div className="add-pattern-fields">
                            <input
                                type="text"
                                value={newPatternLabel}
                                onChange={(e) => setNewPatternLabel(e.target.value)}
                                placeholder="ラベル（例: 笑い系）"
                            />
                            <input
                                type="text"
                                value={newPatternRegex}
                                onChange={(e) => setNewPatternRegex(e.target.value)}
                                placeholder="正規表現（例: ^[wｗ]+$）"
                            />
                            <input
                                type="text"
                                value={newPatternReply}
                                onChange={(e) => setNewPatternReply(e.target.value)}
                                placeholder="返答（カンマ区切りで複数）"
                                onKeyDown={(e) => e.key === 'Enter' && addQuickReplyPattern()}
                            />
                            <button className="btn-add" onClick={addQuickReplyPattern}>追加</button>
                        </div>

                        {/* 正規表現ヘルプ */}
                        <details className="regex-help">
                            <summary>❓ 正規表現ってなに？</summary>
                            <div className="regex-help-content">
                                <p>コメントのパターンを指定するための記号です。よく使うものだけ覚えればOK！</p>
                                <table className="regex-table">
                                    <thead>
                                        <tr><th>記号</th><th>意味</th><th>例</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr><td><code>^</code></td><td>先頭から始まる</td><td><code>^こん</code> → 「こん○○」</td></tr>
                                        <tr><td><code>$</code></td><td>ここで終わる</td><td><code>ちは$</code> → 「○○ちは」</td></tr>
                                        <tr><td><code>^…$</code></td><td>完全一致</td><td><code>^草$</code> → 「草」だけ</td></tr>
                                        <tr><td><code>+</code></td><td>1回以上繰り返し</td><td><code>w+</code> → w, ww, www...</td></tr>
                                        <tr><td><code>|</code></td><td>または（OR）</td><td><code>おつ|バイバイ</code></td></tr>
                                        <tr><td><code>(A|B)</code></td><td>グループOR</td><td><code>^(おつ|またね)$</code></td></tr>
                                        <tr><td><code>[AB]</code></td><td>どちらかの文字</td><td><code>[wｗ]</code> → w か ｗ</td></tr>
                                    </tbody>
                                </table>
                                <p className="regex-examples-title">📝 よくあるパターン例:</p>
                                <ul className="regex-examples">
                                    <li><code>^初見$</code> → 「初見」とだけ打ったコメント</li>
                                    <li><code>^(こんにちは|こんばんは)$</code> → 挨拶</li>
                                    <li><code>^[wｗ]+$</code> → 「ｗ」「www」などの笑い</li>
                                </ul>
                            </div>
                        </details>
                    </div>
                </section>

                {/* === スパチャ/ビッツ反応 === */}
                <section className="filter-section">
                    <h2>💰 スパチャ / ビッツ反応</h2>
                    <p className="filter-desc">投げ銭が来た時にランダムで返す定型文です</p>

                    <div className="tag-list">
                        {filters.superChatReplies.map((reply, i) => (
                            <span key={i} className="tag tag-superchat">
                                {reply}
                                <button className="tag-remove" onClick={() => removeSuperChatReply(i)}>×</button>
                            </span>
                        ))}
                        {filters.superChatReplies.length === 0 && (
                            <span className="tag-empty">定型文がありません</span>
                        )}
                    </div>

                    <div className="add-row">
                        <input
                            type="text"
                            value={newSuperChatReply}
                            onChange={(e) => setNewSuperChatReply(e.target.value)}
                            placeholder="お礼メッセージを入力..."
                            onKeyDown={(e) => e.key === 'Enter' && addSuperChatReply()}
                        />
                        <button className="btn-add" onClick={addSuperChatReply}>追加</button>
                    </div>
                </section>

            </div>

            {/* === 保存ボタン === */}
            <div className="settings-actions">
                <div className="settings-actions-buttons">
                    <button className="btn-save" onClick={handleSave} disabled={saving}>
                        {saving ? '保存中...' : '💾 フィルター設定を保存'}
                    </button>
                </div>

                {saveMessage && (
                    <div className={`save-message ${saveMessage.includes('❌') ? 'error' : ''}`}>
                        {saveMessage}
                    </div>
                )}
            </div>
        </div >
    );
}

// インライン追加用の小さなコンポーネント
function AddInlineInput({ onAdd, placeholder }: { onAdd: (val: string) => void; placeholder: string }) {
    const [value, setValue] = useState('');

    const handleAdd = () => {
        if (value.trim()) {
            onAdd(value);
            setValue('');
        }
    };

    return (
        <span className="inline-add">
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd}>+</button>
        </span>
    );
}

export default Filters;
