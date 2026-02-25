import type { QuickReplyPattern } from './settings-store';

// === フィルター結果の型 ===
export interface FilterResult {
    action: 'ignore' | 'quick-reply' | 'superchat-reply' | 'ai';
    reply?: string;  // quick-reply / superchat-reply 時の返答テキスト
    filterType?: string; // ログ用（どのフィルターにマッチしたか）
    cleanedText?: string; // トリガーを除去したテキスト（AI処理時に使用）
}

// === トリガー設定の型 ===
export interface TriggerSettings {
    enabled: boolean;        // 指名モードが有効かどうか
    prefixes: string[];      // トリガーのプレフィックス（例: ['@AI', '!ai']）
}

// === コメントフィルタークラス ===
export class CommentFilter {
    private blacklist: string[];
    private quickReplies: QuickReplyPattern[];
    private superChatReplies: string[];
    private trigger: TriggerSettings;

    constructor(
        blacklist: string[],
        quickReplies: QuickReplyPattern[],
        superChatReplies: string[],
        trigger: TriggerSettings = { enabled: false, prefixes: [] }
    ) {
        this.blacklist = blacklist;
        this.quickReplies = quickReplies;
        this.superChatReplies = superChatReplies;
        this.trigger = trigger;
    }

    // 設定を更新する
    update(
        blacklist: string[],
        quickReplies: QuickReplyPattern[],
        superChatReplies: string[],
        trigger?: TriggerSettings
    ): void {
        this.blacklist = blacklist;
        this.quickReplies = quickReplies;
        this.superChatReplies = superChatReplies;
        if (trigger !== undefined) this.trigger = trigger;
    }

    // フィルター処理を実行
    applyFilters(text: string, isSuperChat: boolean): FilterResult {
        const trimmed = text.trim();

        // 0. 指名モードチェック（有効な場合、トリガーがないコメントは無視）
        let processText = trimmed;
        if (this.trigger.enabled && this.trigger.prefixes.length > 0) {
            const matchedPrefix = this.trigger.prefixes.find(prefix =>
                trimmed.toLowerCase().startsWith(prefix.toLowerCase())
            );

            if (!matchedPrefix) {
                // スパチャは指名モードでも常に反応
                if (!isSuperChat) {
                    return {
                        action: 'ignore',
                        filterType: '指名モード: トリガーなし',
                    };
                }
            } else {
                // トリガーを除去してテキストを取得
                processText = trimmed.slice(matchedPrefix.length).trim();
                if (!processText) {
                    return {
                        action: 'ignore',
                        filterType: '指名モード: 本文なし',
                    };
                }
            }
        }

        // 1. ブラックリストチェック（部分一致、大文字小文字無視）
        for (const word of this.blacklist) {
            if (word && processText.toLowerCase().includes(word.toLowerCase())) {
                return {
                    action: 'ignore',
                    filterType: `ブラックリスト: 「${word}」`,
                };
            }
        }

        // 2. スパチャ/ビッツの場合、専用の定型文で応答
        if (isSuperChat && this.superChatReplies.length > 0) {
            const reply = this.superChatReplies[
                Math.floor(Math.random() * this.superChatReplies.length)
            ];
            return {
                action: 'superchat-reply',
                reply,
                filterType: 'スパチャ/ビッツ',
            };
        }

        // 3. 定型文パターンチェック
        for (const qr of this.quickReplies) {
            try {
                const regex = new RegExp(qr.pattern, 'i');
                if (regex.test(processText)) {
                    const reply = qr.replies[
                        Math.floor(Math.random() * qr.replies.length)
                    ];
                    return {
                        action: 'quick-reply',
                        reply,
                        filterType: `定型文: ${qr.label}`,
                    };
                }
            } catch {
                // 無効な正規表現はスキップ
                console.warn(`[Filter] 無効な正規表現をスキップ: ${qr.pattern}`);
            }
        }

        // 4. どのフィルターにもマッチしなかった → AIに処理させる
        return { action: 'ai', cleanedText: processText };
    }
}
