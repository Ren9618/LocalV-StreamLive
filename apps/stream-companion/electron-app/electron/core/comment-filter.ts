import type { QuickReplyPattern } from './settings-store';

// === フィルター結果の型 ===
export interface FilterResult {
    action: 'ignore' | 'quick-reply' | 'superchat-reply' | 'ai';
    reply?: string;  // quick-reply / superchat-reply 時の返答テキスト
    filterType?: string; // ログ用（どのフィルターにマッチしたか）
}

// === コメントフィルタークラス ===
export class CommentFilter {
    private blacklist: string[];
    private quickReplies: QuickReplyPattern[];
    private superChatReplies: string[];

    constructor(
        blacklist: string[],
        quickReplies: QuickReplyPattern[],
        superChatReplies: string[]
    ) {
        this.blacklist = blacklist;
        this.quickReplies = quickReplies;
        this.superChatReplies = superChatReplies;
    }

    // 設定を更新する
    update(
        blacklist: string[],
        quickReplies: QuickReplyPattern[],
        superChatReplies: string[]
    ): void {
        this.blacklist = blacklist;
        this.quickReplies = quickReplies;
        this.superChatReplies = superChatReplies;
    }

    // フィルター処理を実行
    applyFilters(text: string, isSuperChat: boolean): FilterResult {
        const trimmed = text.trim();

        // 1. ブラックリストチェック（部分一致、大文字小文字無視）
        for (const word of this.blacklist) {
            if (word && trimmed.toLowerCase().includes(word.toLowerCase())) {
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
                if (regex.test(trimmed)) {
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
        return { action: 'ai' };
    }
}
