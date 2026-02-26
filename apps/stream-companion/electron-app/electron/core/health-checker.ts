import { fetch } from 'undici';
import type { AiProviderType } from './brain';
import { ErrorCodes } from './error-codes';

// === ヘルスチェック結果の型定義 ===
export interface HealthStatus {
    llm: {
        provider: AiProviderType;
        connected: boolean;
        models: string[];
        error?: string;
        errorCode?: string;
    };
    ollama: {
        connected: boolean;
        models: string[];
        error?: string;
        errorCode?: string;
    };
    voicevox: {
        connected: boolean;
        speakers: { name: string; id: number }[];
        error?: string;
        errorCode?: string;
    };
    voiceger: {
        connected: boolean;
        speakers: { id: string; name: string }[];
        error?: string;
        errorCode?: string;
    };
}

// === ヘルスチェッカークラス ===
export class HealthChecker {
    private ollamaUrl: string;
    private voicevoxUrl: string;
    private voicegerUrl: string;
    private aiProvider: AiProviderType;
    private openaiCompatUrl: string;
    private openaiCompatApiKey: string;
    private intervalId: ReturnType<typeof setInterval> | null = null;

    constructor(
        ollamaUrl: string,
        voicevoxUrl: string,
        voicegerUrl: string = 'http://127.0.0.1:8000',
        aiProvider: AiProviderType = 'ollama',
        openaiCompatUrl: string = '',
        openaiCompatApiKey: string = ''
    ) {
        this.ollamaUrl = ollamaUrl;
        this.voicevoxUrl = voicevoxUrl;
        this.voicegerUrl = voicegerUrl;
        this.aiProvider = aiProvider;
        this.openaiCompatUrl = openaiCompatUrl;
        this.openaiCompatApiKey = openaiCompatApiKey;
    }

    // URLとプロバイダーを更新する（設定変更時に呼ばれる）
    updateUrls(
        ollamaUrl: string,
        voicevoxUrl: string,
        voicegerUrl?: string,
        aiProvider?: AiProviderType,
        openaiCompatUrl?: string,
        openaiCompatApiKey?: string
    ): void {
        this.ollamaUrl = ollamaUrl;
        this.voicevoxUrl = voicevoxUrl;
        if (voicegerUrl !== undefined) this.voicegerUrl = voicegerUrl;
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
                return { connected: false, models: [], error: `[${ErrorCodes.OLLAMA_HTTP_ERROR}] HTTP ${response.status}`, errorCode: ErrorCodes.OLLAMA_HTTP_ERROR };
            }

            const data = await response.json() as any;
            const models = (data.models || []).map((m: any) => m.name as string);

            return { connected: true, models };
        } catch (error: any) {
            if (error?.code === 'ECONNREFUSED') {
                return { connected: false, models: [], error: `[${ErrorCodes.OLLAMA_CONNECTION_REFUSED}] Ollamaが起動していません。\`ollama serve\` を実行してください。`, errorCode: ErrorCodes.OLLAMA_CONNECTION_REFUSED };
            }
            if (error?.code === 'UND_ERR_CONNECT_TIMEOUT') {
                return { connected: false, models: [], error: `[${ErrorCodes.OLLAMA_TIMEOUT}] Ollamaに接続できません（タイムアウト）。`, errorCode: ErrorCodes.OLLAMA_TIMEOUT };
            }
            return { connected: false, models: [], error: `[${ErrorCodes.UNKNOWN}] 接続エラー: ${error?.message || error}`, errorCode: ErrorCodes.UNKNOWN };
        }
    }

    // VoiceVoxの接続チェック + スピーカー一覧取得
    async checkVoiceVox(): Promise<HealthStatus['voicevox']> {
        try {
            const response = await fetch(`${this.voicevoxUrl}/speakers`, {
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) {
                return { connected: false, speakers: [], error: `[${ErrorCodes.VOICEVOX_HTTP_ERROR}] HTTP ${response.status}`, errorCode: ErrorCodes.VOICEVOX_HTTP_ERROR };
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
            if (error?.code === 'ECONNREFUSED') {
                return { connected: false, speakers: [], error: `[${ErrorCodes.VOICEVOX_CONNECTION_REFUSED}] VoiceVoxが起動していません。VoiceVoxアプリを起動してください。`, errorCode: ErrorCodes.VOICEVOX_CONNECTION_REFUSED };
            }
            if (error?.code === 'UND_ERR_CONNECT_TIMEOUT') {
                return { connected: false, speakers: [], error: `[${ErrorCodes.VOICEVOX_TIMEOUT}] VoiceVoxに接続できません（タイムアウト）。`, errorCode: ErrorCodes.VOICEVOX_TIMEOUT };
            }
            return { connected: false, speakers: [], error: `[${ErrorCodes.UNKNOWN}] 接続エラー: ${error?.message || error}`, errorCode: ErrorCodes.UNKNOWN };
        }
    }

    // OpenAI互換 APIの接続チェック
    async checkOpenAiCompat(): Promise<HealthStatus['llm']> {
        if (!this.openaiCompatUrl) {
            return { provider: 'openai-compat', connected: false, models: [], error: `[${ErrorCodes.OPENAI_URL_NOT_SET}] API URLが設定されていません。`, errorCode: ErrorCodes.OPENAI_URL_NOT_SET };
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
                return { provider: 'openai-compat', connected: false, models: [], error: `[${ErrorCodes.OPENAI_HTTP_ERROR}] HTTP ${response.status}`, errorCode: ErrorCodes.OPENAI_HTTP_ERROR };
            }

            const data = await response.json() as any;
            const models = (data.data || []).map((m: any) => m.id as string);
            return { provider: 'openai-compat', connected: true, models };
        } catch (error: any) {
            if (error?.code === 'ECONNREFUSED') {
                return { provider: 'openai-compat', connected: false, models: [], error: `[${ErrorCodes.OPENAI_CONNECTION_REFUSED}] APIサーバーに接続できません。URLを確認してください。`, errorCode: ErrorCodes.OPENAI_CONNECTION_REFUSED };
            }
            return { provider: 'openai-compat', connected: false, models: [], error: `[${ErrorCodes.UNKNOWN}] 接続エラー: ${error?.message || error}`, errorCode: ErrorCodes.UNKNOWN };
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

    // Voicegerの接続チェック
    async checkVoiceger(): Promise<HealthStatus['voiceger']> {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${this.voicegerUrl}/speakers`, {
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                return { connected: false, speakers: [], error: `[LV-2004] Voiceger HTTP ${response.status}`, errorCode: 'LV-2004' };
            }

            const data = await response.json() as any;
            const speakers = Array.isArray(data.speakers) ? data.speakers : [];

            return { connected: true, speakers: speakers };
        } catch (error: any) {
            if (error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
                return { connected: false, speakers: [], error: `[LV-2005] Voicegerが起動していません。`, errorCode: 'LV-2005' };
            }
            if (error?.name === 'AbortError' || error?.code === 'UND_ERR_CONNECT_TIMEOUT') {
                return { connected: false, speakers: [], error: `[LV-2006] Voicegerに接続できません（タイムアウト）。`, errorCode: 'LV-2006' };
            }
            return { connected: false, speakers: [], error: `[LV-2000] 接続エラー: ${error?.message || error}`, errorCode: 'LV-2000' };
        }
    }

    // 全サービスのヘルスチェック
    async checkAll(): Promise<HealthStatus> {
        const [llm, ollama, voicevox, voiceger] = await Promise.all([
            this.checkLlm(),
            this.checkOllama(),
            this.checkVoiceVox(),
            this.checkVoiceger(),
        ]);
        return { llm, ollama, voicevox, voiceger };
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
