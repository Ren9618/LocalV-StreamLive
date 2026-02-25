import { fetch } from 'undici';

export class VoiceVoxClient {
  private baseUrl: string;
  private speakerId: number;

  constructor(baseUrl: string = 'http://127.0.0.1:50021', speakerId: number = 3) { // 3: ずんだもん(ノーマル)
    this.baseUrl = baseUrl;
    this.speakerId = speakerId;
  }

  async generateAudio(text: string): Promise<Buffer | null> {
    try {
      // 1. Audio Query (音声合成のためのクエリ作成)
      const queryUrl = new URL(`${this.baseUrl}/audio_query`);
      queryUrl.searchParams.append('text', text);
      queryUrl.searchParams.append('speaker', this.speakerId.toString());

      console.log(`🎤 VoiceVox Query: ${text}`);
      const queryRes = await fetch(queryUrl.toString(), { method: 'POST' });
      
      if (!queryRes.ok) {
        const errText = await queryRes.text();
        throw new Error(`Query Failed: ${queryRes.status} ${queryRes.statusText} - ${errText}`);
      }
      
      const queryData = await queryRes.json();

      // 2. Synthesis (音声データ生成)
      const synthUrl = new URL(`${this.baseUrl}/synthesis`);
      synthUrl.searchParams.append('speaker', this.speakerId.toString());

      console.log(`🎹 VoiceVox Synthesis...`);
      const synthRes = await fetch(synthUrl.toString(), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'audio/wav'
        },
        body: JSON.stringify(queryData)
      });

      if (!synthRes.ok) {
        const errText = await synthRes.text();
        throw new Error(`Synthesis Failed: ${synthRes.status} ${synthRes.statusText} - ${errText}`);
      }

      // ArrayBuffer を Buffer に変換
      const arrayBuffer = await synthRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log(`✅ Audio Generated: ${buffer.length} bytes`);
      return buffer;

    } catch (error) {
      console.error("❌ VoiceVox Error:", error);
      return null;
    }
  }
}
