import { fetch } from 'undici';

interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LocalAiBrain {
  private model: string;
  private baseUrl: string;

  constructor(model: string = 'llama3', baseUrl: string = 'http://localhost:11434') {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  // モデルをメモリにプリロードするウォームアップ処理
  async warmup(): Promise<void> {
    console.log(`[Brain] モデル「${this.model}」をウォームアップ中...`);
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

      console.log(`[Brain] ウォームアップ完了`);
    } catch (error) {
      console.error("[Brain] ウォームアップ失敗:", error);
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
      console.error("AI Brain Connection Failed:", error);
      return "Error: Could not connect to local AI.";
    }
  }
}
