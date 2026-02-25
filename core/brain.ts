import { fetch } from 'undici'; // Node.js 18+ native fetch or polyfill

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

  async chat(messages: AiMessage[]): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          stream: false // For simplicity in v1
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

