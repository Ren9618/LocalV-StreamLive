import { fetch } from 'undici';

// === ヘルスチェック結果の型定義 ===
export interface HealthStatus {
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

// === ヘルスチェッカークラス ===
export class HealthChecker {
    private ollamaUrl: string;
    private voicevoxUrl: string;
    private intervalId: ReturnType<typeof setInterval> | null = null;

    constructor(ollamaUrl: string, voicevoxUrl: string) {
        this.ollamaUrl = ollamaUrl;
        this.voicevoxUrl = voicevoxUrl;
    }

    // URLを更新する（設定変更時に呼ばれる）
    updateUrls(ollamaUrl: string, voicevoxUrl: string): void {
        this.ollamaUrl = ollamaUrl;
        this.voicevoxUrl = voicevoxUrl;
    }

    // Ollamaの接続チェック + モデル一覧取得
    async checkOllama(): Promise<HealthStatus['ollama']> {
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000), // 5秒タイムアウト
            });

            if (!response.ok) {
                return { connected: false, models: [], error: `HTTP ${response.status}` };
            }

            const data = await response.json() as any;
            const models = (data.models || []).map((m: any) => m.name as string);

            return { connected: true, models };
        } catch (error: any) {
            const message = error?.code === 'ECONNREFUSED'
                ? 'Ollamaが起動していません。`ollama serve` を実行してください。'
                : error?.code === 'UND_ERR_CONNECT_TIMEOUT'
                    ? 'Ollamaに接続できません（タイムアウト）。'
                    : `接続エラー: ${error?.message || error}`;

            return { connected: false, models: [], error: message };
        }
    }

    // VoiceVoxの接続チェック + スピーカー一覧取得
    async checkVoiceVox(): Promise<HealthStatus['voicevox']> {
        try {
            const response = await fetch(`${this.voicevoxUrl}/speakers`, {
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) {
                return { connected: false, speakers: [], error: `HTTP ${response.status}` };
            }

            const data = await response.json() as any;
            // スピーカー名とスタイルIDのフラット一覧を作成
            const speakers: { name: string; id: number }[] = [];
            for (const speaker of data) {
                for (const style of speaker.styles || []) {
                    speakers.push({
                        name: `${speaker.name} (${style.name})`,
                        id: style.id,
                    });
                }
            }

            return { connected: true, speakers };
        } catch (error: any) {
            const message = error?.code === 'ECONNREFUSED'
                ? 'VoiceVoxが起動していません。VoiceVoxアプリを起動してください。'
                : error?.code === 'UND_ERR_CONNECT_TIMEOUT'
                    ? 'VoiceVoxに接続できません（タイムアウト）。'
                    : `接続エラー: ${error?.message || error}`;

            return { connected: false, speakers: [], error: message };
        }
    }

    // 全サービスのヘルスチェック
    async checkAll(): Promise<HealthStatus> {
        const [ollama, voicevox] = await Promise.all([
            this.checkOllama(),
            this.checkVoiceVox(),
        ]);
        return { ollama, voicevox };
    }

    // 定期監視を開始。コールバックで結果を通知
    startMonitoring(callback: (status: HealthStatus) => void, intervalMs: number = 10000): void {
        // 初回は即座にチェック
        this.checkAll().then(callback);

        // 定期的にチェック
        this.intervalId = setInterval(async () => {
            const status = await this.checkAll();
            callback(status);
        }, intervalMs);
    }

    // 定期監視を停止
    stopMonitoring(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}
