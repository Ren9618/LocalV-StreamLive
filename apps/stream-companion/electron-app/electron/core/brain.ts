import { fetch } from 'undici';

// === メッセージ型 ===
export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// === プロバイダーインターフェース ===
export interface AiBrainProvider {
  chat(messages: AiMessage[]): Promise<string>;
  warmup(): Promise<void>;
}

// === プロバイダー種別 ===
export type AiProviderType = 'ollama' | 'openai-compat';

// === Ollama プロバイダー ===
export class OllamaBrain implements AiBrainProvider {
  private model: string;
  private baseUrl: string;

  constructor(model: string, baseUrl: string) {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async warmup(): Promise<void> {
    console.log(`[Ollama] モデル「${this.model}」をウォームアップ中...`);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'hi' }],
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.statusText}`);
      }
      console.log(`[Ollama] ウォームアップ完了`);
    } catch (error) {
      console.error("[Ollama] ウォームアップ失敗:", error);
      throw error;
    }
  }

  async chat(messages: AiMessage[]): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.message.content;
    } catch (error) {
      console.error("[Ollama] 接続失敗:", error);
      return "エラー: ローカルAIに接続できませんでした。";
    }
  }
}

// === OpenAI互換 プロバイダー ===
// OpenAI, Gemini, LM Studio, text-generation-webui 等に対応
export class OpenAiCompatBrain implements AiBrainProvider {
  private model: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(model: string, baseUrl: string, apiKey: string) {
    this.model = model;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async warmup(): Promise<void> {
    console.log(`[OpenAI互換] モデル「${this.model}」をウォームアップ中...`);
    try {
      // 軽量なリクエストでAPI接続を確認
      await this.chat([{ role: 'user', content: 'hi' }]);
      console.log(`[OpenAI互換] ウォームアップ完了`);
    } catch (error) {
      console.error("[OpenAI互換] ウォームアップ失敗:", error);
      throw error;
    }
  }

  async chat(messages: AiMessage[]): Promise<string> {
    try {
      // URLの末尾にスラッシュがある場合は除去
      const base = this.baseUrl.replace(/\/+$/, '');
      const url = `${base}/v1/chat/completions`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // APIキーがある場合のみAuthorizationヘッダーを追加
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          stream: false,
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API Error ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as any;
      return data.choices[0].message.content;
    } catch (error) {
      console.error("[OpenAI互換] 接続失敗:", error);
      return "エラー: AIサービスに接続できませんでした。";
    }
  }
}

// === ファクトリー関数 ===
export function createBrain(
  provider: AiProviderType,
  model: string,
  ollamaUrl: string,
  openaiCompatUrl: string,
  openaiCompatApiKey: string
): AiBrainProvider {
  switch (provider) {
    case 'openai-compat':
      console.log(`[Brain] OpenAI互換プロバイダーを使用: ${openaiCompatUrl} / ${model}`);
      return new OpenAiCompatBrain(model, openaiCompatUrl, openaiCompatApiKey);
    case 'ollama':
    default:
      console.log(`[Brain] Ollamaプロバイダーを使用: ${ollamaUrl} / ${model}`);
      return new OllamaBrain(model, ollamaUrl);
  }
}
