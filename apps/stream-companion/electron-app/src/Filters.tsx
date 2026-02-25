import { useState, useEffect } from 'react';
import './Filters.css';
import { useLocale } from './i18n';

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
    const { t } = useLocale();
    const [filters, setFilters] = useState<FilterSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    const updateFilters = (newFilters: FilterSettings) => {
        setFilters(newFilters);
        if (onUnsavedChanges) onUnsavedChanges(true);
    };

    const [newBlacklistWord, setNewBlacklistWord] = useState('');
    const [newSuperChatReply, setNewSuperChatReply] = useState('');
    const [newPatternLabel, setNewPatternLabel] = useState('');
    const [newPatternRegex, setNewPatternRegex] = useState('');
    const [newPatternReply, setNewPatternReply] = useState('');
    const [newTriggerPrefix, setNewTriggerPrefix] = useState('');

    useEffect(() => {
        window.electron.getFilters().then((f: FilterSettings) => {
            setFilters(f);
        });
    }, []);

    const handleSave = async () => {
        if (!filters) return;
        setSaving(true);
        setSaveMessage('');
        try {
            await window.electron.saveFilters(filters);
            setSaveMessage(t('filter.saved'));
            if (onUnsavedChanges) onUnsavedChanges(false);
        } catch {
            setSaveMessage(t('filter.saveFailed'));
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    const addBlacklistWord = () => {
        if (!filters || !newBlacklistWord.trim()) return;
        updateFilters({ ...filters, blacklist: [...filters.blacklist, newBlacklistWord.trim()] });
        setNewBlacklistWord('');
    };
    const removeBlacklistWord = (index: number) => {
        if (!filters) return;
        updateFilters({ ...filters, blacklist: filters.blacklist.filter((_, i) => i !== index) });
    };

    const addSuperChatReply = () => {
        if (!filters || !newSuperChatReply.trim()) return;
        updateFilters({ ...filters, superChatReplies: [...filters.superChatReplies, newSuperChatReply.trim()] });
        setNewSuperChatReply('');
    };
    const removeSuperChatReply = (index: number) => {
        if (!filters) return;
        updateFilters({ ...filters, superChatReplies: filters.superChatReplies.filter((_, i) => i !== index) });
    };

    const addQuickReplyPattern = () => {
        if (!filters || !newPatternLabel.trim() || !newPatternRegex.trim() || !newPatternReply.trim()) return;
        try { new RegExp(newPatternRegex); } catch {
            setSaveMessage(t('filter.pattern.invalidRegex'));
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
        setNewPatternLabel(''); setNewPatternRegex(''); setNewPatternReply('');
    };
    const removeQuickReplyPattern = (index: number) => {
        if (!filters) return;
        updateFilters({ ...filters, quickReplies: filters.quickReplies.filter((_, i) => i !== index) });
    };
    const addReplyToPattern = (pi: number, reply: string) => {
        if (!filters || !reply.trim()) return;
        const u = [...filters.quickReplies];
        u[pi] = { ...u[pi], replies: [...u[pi].replies, reply.trim()] };
        updateFilters({ ...filters, quickReplies: u });
    };
    const removeReplyFromPattern = (pi: number, ri: number) => {
        if (!filters) return;
        const u = [...filters.quickReplies];
        u[pi] = { ...u[pi], replies: u[pi].replies.filter((_, i) => i !== ri) };
        updateFilters({ ...filters, quickReplies: u });
    };

    if (!filters) {
        return <div className="filters-loading">{t('filter.loading')}</div>;
    }

    return (
        <div className="settings-wrapper">
            <div className="settings-container">

                {/* === 指名モード === */}
                <section className="filter-section">
                    <h2>{t('filter.trigger.title')}</h2>
                    <p className="filter-desc">{t('filter.trigger.desc')}</p>

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
                            {filters.trigger.enabled ? t('filter.trigger.enabled') : t('filter.trigger.disabled')}
                        </span>
                    </div>

                    {filters.trigger.enabled && (
                        <>
                            <p className="filter-sublabel">{t('filter.trigger.prefixLabel')}</p>
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
                                    <span className="tag-empty">{t('filter.trigger.noPrefixes')}</span>
                                )}
                            </div>
                            <div className="add-row">
                                <input
                                    type="text"
                                    value={newTriggerPrefix}
                                    onChange={(e) => setNewTriggerPrefix(e.target.value)}
                                    placeholder={t('filter.trigger.placeholder')}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && newTriggerPrefix.trim()) {
                                            setFilters({
                                                ...filters,
                                                trigger: { ...filters.trigger, prefixes: [...filters.trigger.prefixes, newTriggerPrefix.trim()] }
                                            });
                                            setNewTriggerPrefix('');
                                        }
                                    }}
                                />
                                <button className="btn-add" onClick={() => {
                                    if (newTriggerPrefix.trim()) {
                                        setFilters({
                                            ...filters,
                                            trigger: { ...filters.trigger, prefixes: [...filters.trigger.prefixes, newTriggerPrefix.trim()] }
                                        });
                                        setNewTriggerPrefix('');
                                    }
                                }}>{t('filter.trigger.add')}</button>
                            </div>
                        </>
                    )}
                </section>

                {/* === ブラックリスト === */}
                <section className="filter-section">
                    <h2>{t('filter.blacklist.title')}</h2>
                    <p className="filter-desc">{t('filter.blacklist.desc')}</p>
                    <div className="tag-list">
                        {filters.blacklist.map((word, i) => (
                            <span key={i} className="tag tag-danger">
                                {word}
                                <button className="tag-remove" onClick={() => removeBlacklistWord(i)}>×</button>
                            </span>
                        ))}
                        {filters.blacklist.length === 0 && (
                            <span className="tag-empty">{t('filter.blacklist.empty')}</span>
                        )}
                    </div>
                    <div className="add-row">
                        <input
                            type="text"
                            value={newBlacklistWord}
                            onChange={(e) => setNewBlacklistWord(e.target.value)}
                            placeholder={t('filter.blacklist.placeholder')}
                            onKeyDown={(e) => e.key === 'Enter' && addBlacklistWord()}
                        />
                        <button className="btn-add" onClick={addBlacklistWord}>{t('filter.blacklist.add')}</button>
                    </div>
                </section>

                {/* === 定型文パターン === */}
                <section className="filter-section">
                    <h2>{t('filter.pattern.title')}</h2>
                    <p className="filter-desc">{t('filter.pattern.desc')}</p>
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
                                <AddInlineInput onAdd={(val) => addReplyToPattern(qrIndex, val)} placeholder={t('filter.pattern.replyPlaceholder')} />
                            </div>
                        </div>
                    ))}

                    <div className="add-pattern-form">
                        <h3>{t('filter.pattern.addTitle')}</h3>
                        <div className="add-pattern-fields">
                            <input type="text" value={newPatternLabel} onChange={(e) => setNewPatternLabel(e.target.value)} placeholder={t('filter.pattern.label')} />
                            <input type="text" value={newPatternRegex} onChange={(e) => setNewPatternRegex(e.target.value)} placeholder={t('filter.pattern.regex')} />
                            <input type="text" value={newPatternReply} onChange={(e) => setNewPatternReply(e.target.value)} placeholder={t('filter.pattern.reply')} onKeyDown={(e) => e.key === 'Enter' && addQuickReplyPattern()} />
                            <button className="btn-add" onClick={addQuickReplyPattern}>{t('filter.pattern.add')}</button>
                        </div>

                        <details className="regex-help">
                            <summary>{t('filter.pattern.regexHelp')}</summary>
                            <div className="regex-help-content">
                                <p>{t('filter.pattern.regexDesc')}</p>
                                <table className="regex-table">
                                    <thead>
                                        <tr><th>{t('filter.pattern.regexSymbol')}</th><th>{t('filter.pattern.regexMeaning')}</th><th>{t('filter.pattern.regexExample')}</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr><td><code>^</code></td><td>Start of string</td><td><code>^hello</code></td></tr>
                                        <tr><td><code>$</code></td><td>End of string</td><td><code>bye$</code></td></tr>
                                        <tr><td><code>^…$</code></td><td>Exact match</td><td><code>^lol$</code></td></tr>
                                        <tr><td><code>+</code></td><td>1+ repeats</td><td><code>w+</code></td></tr>
                                        <tr><td><code>|</code></td><td>OR</td><td><code>hi|hello</code></td></tr>
                                        <tr><td><code>(A|B)</code></td><td>Group OR</td><td><code>^(hi|bye)$</code></td></tr>
                                        <tr><td><code>[AB]</code></td><td>Any of</td><td><code>[wｗ]</code></td></tr>
                                    </tbody>
                                </table>
                                <p className="regex-examples-title">{t('filter.pattern.regexExamplesTitle')}</p>
                                <ul className="regex-examples">
                                    <li><code>^hello$</code></li>
                                    <li><code>^(hi|hey|hello)$</code></li>
                                    <li><code>^[wｗ]+$</code></li>
                                </ul>
                            </div>
                        </details>
                    </div>
                </section>

                {/* === スパチャ/ビッツ反応 === */}
                <section className="filter-section">
                    <h2>{t('filter.superchat.title')}</h2>
                    <p className="filter-desc">{t('filter.superchat.desc')}</p>
                    <div className="tag-list">
                        {filters.superChatReplies.map((reply, i) => (
                            <span key={i} className="tag tag-superchat">
                                {reply}
                                <button className="tag-remove" onClick={() => removeSuperChatReply(i)}>×</button>
                            </span>
                        ))}
                        {filters.superChatReplies.length === 0 && (
                            <span className="tag-empty">{t('filter.superchat.empty')}</span>
                        )}
                    </div>
                    <div className="add-row">
                        <input
                            type="text"
                            value={newSuperChatReply}
                            onChange={(e) => setNewSuperChatReply(e.target.value)}
                            placeholder={t('filter.superchat.placeholder')}
                            onKeyDown={(e) => e.key === 'Enter' && addSuperChatReply()}
                        />
                        <button className="btn-add" onClick={addSuperChatReply}>{t('filter.superchat.add')}</button>
                    </div>
                </section>

            </div>

            {/* === 保存ボタン === */}
            <div className="settings-actions">
                <div className="settings-actions-buttons">
                    <button className="btn-save" onClick={handleSave} disabled={saving}>
                        {saving ? t('filter.saving') : t('filter.save')}
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

function AddInlineInput({ onAdd, placeholder }: { onAdd: (val: string) => void; placeholder: string }) {
    const [value, setValue] = useState('');
    const handleAdd = () => { if (value.trim()) { onAdd(value); setValue(''); } };
    return (
        <span className="inline-add">
            <input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
            <button onClick={handleAdd}>+</button>
        </span>
    );
}

export default Filters;
