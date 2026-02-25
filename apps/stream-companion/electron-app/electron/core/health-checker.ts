import { fetch } from 'undici';
import type { AiProviderType } from './brain';

// === ヘルスチェック結果の型定義 ===
export interface HealthStatus {
    llm: {
        provider: AiProviderType;
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

// === ヘルスチェッカークラス ===
export class HealthChecker {
    private ollamaUrl: string;
    private voicevoxUrl: string;
    private aiProvider: AiProviderType;
    private openaiCompatUrl: string;
    private openaiCompatApiKey: string;
    private intervalId: ReturnType<typeof setInterval> | null = null;

    constructor(
        ollamaUrl: string,
        voicevoxUrl: string,
        aiProvider: AiProviderType = 'ollama',
        openaiCompatUrl: string = '',
        openaiCompatApiKey: string = ''
    ) {
        this.ollamaUrl = ollamaUrl;
        this.voicevoxUrl = voicevoxUrl;
        this.aiProvider = aiProvider;
        this.openaiCompatUrl = openaiCompatUrl;
        this.openaiCompatApiKey = openaiCompatApiKey;
    }

    // URLとプロバイダーを更新する（設定変更時に呼ばれる）
    updateUrls(
        ollamaUrl: string,
        voicevoxUrl: string,
        aiProvider?: AiProviderType,
        openaiCompatUrl?: string,
        openaiCompatApiKey?: string
    ): void {
        this.ollamaUrl = ollamaUrl;
        this.voicevoxUrl = voicevoxUrl;
        if (aiProvider !== undefined) this.aiProvider = aiProvider;
        if (openaiCompatUrl !== undefined) this.openaiCompatUrl = openaiCompatUrl;
        if (openaiCompatApiKey !== undefined) this.openaiCompatApiKey = openaiCompatApiKey;
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

    // OpenAI互換 APIの接続チェック
    async checkOpenAiCompat(): Promise<HealthStatus['llm']> {
        if (!this.openaiCompatUrl) {
            return { provider: 'openai-compat', connected: false, models: [], error: 'API URLが設定されていません。' };
        }
        try {
            const base = this.openaiCompatUrl.replace(/\/+$/, '');
            const headers: Record<string, string> = {};
            if (this.openaiCompatApiKey) {
                headers['Authorization'] = `Bearer ${this.openaiCompatApiKey}`;
            }

            // /v1/models エンドポイントで接続確認
            const response = await fetch(`${base}/v1/models`, {
                headers,
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) {
                return { provider: 'openai-compat', connected: false, models: [], error: `HTTP ${response.status}` };
            }

            const data = await response.json() as any;
            const models = (data.data || []).map((m: any) => m.id as string);
            return { provider: 'openai-compat', connected: true, models };
        } catch (error: any) {
            const message = error?.code === 'ECONNREFUSED'
                ? 'APIサーバーに接続できません。URLを確認してください。'
                : `接続エラー: ${error?.message || error}`;
            return { provider: 'openai-compat', connected: false, models: [], error: message };
        }
    }

    // 現在のプロバイダーにLLM接続チェック
    async checkLlm(): Promise<HealthStatus['llm']> {
        if (this.aiProvider === 'openai-compat') {
            return this.checkOpenAiCompat();
        }
        // Ollamaの場合は既存のcheckOllamaを流用
        const ollamaResult = await this.checkOllama();
        return { provider: 'ollama', ...ollamaResult };
    }

    // 全サービスのヘルスチェック
    async checkAll(): Promise<HealthStatus> {
        const [llm, ollama, voicevox] = await Promise.all([
            this.checkLlm(),
            this.checkOllama(),
            this.checkVoiceVox(),
        ]);
        return { llm, ollama, voicevox };
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
