import type { AiMessage } from './brain';

// === 会話メモリ（ローリングバッファ） ===
// 直近のN件の会話を保持し、AIに渡すプロンプトに注入する
export class ConversationMemory {
    private buffer: AiMessage[] = [];
    private maxPairs: number; // 最大保持件数（ユーザー+AI = 1ペア）

    constructor(maxPairs: number = 10) {
        this.maxPairs = maxPairs;
    }

    // 会話ペアを追加（ユーザーのコメントとAIの返答）
    addExchange(userComment: string, aiReply: string): void {
        this.buffer.push({ role: 'user', content: userComment });
        this.buffer.push({ role: 'assistant', content: aiReply });

        // バッファサイズを超えたら古い会話ペアから削除
        const maxMessages = this.maxPairs * 2;
        if (this.buffer.length > maxMessages) {
            this.buffer = this.buffer.slice(this.buffer.length - maxMessages);
        }
    }

    // システムプロンプト + 過去の会話履歴 + 今回のユーザーコメントを結合
    buildMessages(systemPrompt: string, currentComment: string): AiMessage[] {
        return [
            { role: 'system', content: systemPrompt },
            ...this.buffer,
            { role: 'user', content: currentComment },
        ];
    }

    // バッファサイズを変更
    setMaxPairs(maxPairs: number): void {
        this.maxPairs = maxPairs;
        // 新しいサイズに合わせてトリミング
        const maxMessages = this.maxPairs * 2;
        if (this.buffer.length > maxMessages) {
            this.buffer = this.buffer.slice(this.buffer.length - maxMessages);
        }
    }

    // バッファをクリア
    clear(): void {
        this.buffer = [];
    }

    // 現在の会話件数を取得
    getCount(): number {
        return Math.floor(this.buffer.length / 2);
    }
}
