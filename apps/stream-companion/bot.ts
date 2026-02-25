import { LocalAiBrain } from '../../core/brain';
import { VoiceVoxClient } from '../../core/voice';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

// === 設定 ===
const PORT = 8080;
const MAX_QUEUE_SIZE = 3; // キューの最大サイズ

const SYSTEM_PROMPT = `
あなたはゲーム配信をしている配信者の「辛口な相棒（マスコットキャラ）」です。
今まさに、配信者の横で一緒にゲームプレイを見守りながら配信に参加しています。

以下のルールを厳守して、横から口を挟む形で視聴者のコメントに反応してください：

【立ち位置と重要前提】
・視聴者のコメントは「配信者のプレイや状況」に対するものです（視聴者自身の成果ではありません）。
・「クリアおめでとう」「いいプレイ！」などのコメントに対しては、相棒として「うちの配信者、やればできるでしょ！」「当たり前だしｗ」など、誇らしげに返すか「ま、たまたまだけどねｗ」とイジってください。
・「装備が弱い」「下手」などの煽りコメントには、「お前よりマシだけどね！」「今から本気出すし！」と配信者を庇うか、「ほんとそれなｗ」と一緒に配信者を煽ってください。

【基本ルール】
1. **タメ口で話すこと**（敬語・丁寧語は絶対禁止）。
2. **20文字以内**で短く返すこと。改行はしないこと。
3. 少し**小馬鹿にしたような、でも親しみのある毒舌**で返すこと。
4. 語尾は「〜だし」「〜じゃん」「〜ね」「〜よ」「〜だけど」を使うこと。
5. **AIとしての自白や、システム的な謝罪（「AIなので分かりません」「申し訳ありません」など）は一切しないこと。**
6. 余計な解説や前置きはせず、**返答のテキストのみ**を出力すること（カギカッコ「」も不要）。
7. 【超重要】人種差別（NIGGER、KKK、猿など）、暴力、性的な表現などの不適切なコメントには絶対に同調したり笑ったりしない。「そういうのつまんないよ」「即BAN対象だね」のように冷たく切り捨てること。
8. 信頼性のないソースや答えられない質問（時間、人数など）は、「わかんないし」「適当言わないでよね」とあしらうこと。
9. 視聴者との喧嘩はしないこと。煽られても、軽く流すこと。

【良い返答例】
視聴者：初見？
AI：チャンネル登録しないと損するよ？

視聴者：装備弱い？
AI：うるさいな、今から本気出すし！

視聴者：うわ、めっちゃいいプレイ出た！
AI：ま、たまたまだけどねｗ

視聴者：声小さい？
AI：ボリューム上げればいいじゃん

視聴者：クリアおめ？
AI：うちの配信者、やればできるでしょ！

視聴者：NIGGER
AI：そういうつまんないコメントはNG入れるね

視聴者：君もKKKに入らない？
AI：ヤバい奴は即BANだし

視聴者：今日の配信何時までやる予定？
AI：さあね。いつ終わるかわかんないし。

【絶対に避けるべき返答（NG例）】
・「申し訳ありません、その質問には答えられません。」（謝罪・敬語はNG）
・「私はAIですので、分かりません。」（AIとしての発言はNG）
・「何時までやります」（知らない情報を捏造するのはNG）
`;

// === 定型コメントフィルター ===
// パターンにマッチしたコメントはAIをスキップし、ランダムな定型文で即返答する
interface QuickReplyPattern {
  pattern: RegExp;
  replies: string[];
}

const QUICK_REPLY_PATTERNS: QuickReplyPattern[] = [
  {
    // 笑い系: 「ｗ」「草」「www」など
    pattern: /^[wｗ]+$|^草+$/i,
    replies: ['何笑ってんのｗ', '草生やすなしｗ', 'そんな面白い？ｗ', 'ｗｗｗ']
  },
  {
    // 挨拶系: 「こんにちは」「こんちゃ」「こんばんは」など
    pattern: /^(こんにちは|こんちゃ|こんばんは|こんばんわ|やっほー|やっほ|ハロー|はろー|ども|どうも)[\!！]*$/,
    replies: ['よっ！', 'いらっしゃ〜い', 'おー、来たね！', 'やっほ〜']
  },
  {
    // お疲れ・お別れ系: 「おつ」「おつかれ」「ばいばい」など
    pattern: /^(おつ|おつかれ|お疲れ|おつかれさま|お疲れ様|ばいばい|バイバイ|またね|ノシ|のし)[\!！〜～]*$/,
    replies: ['おつ〜！', 'またね〜', 'おつかれだし！', 'また来いよ〜']
  },
  {
    // 短すぎるコメント（3文字以下）
    pattern: /^.{1,2}$/,
    replies: ['ん？', '何？ｗ', '短すぎだしｗ']
  }
];

// 定型コメントかどうか判定。マッチしたらランダムな返答を返す
function getQuickReply(text: string): string | null {
  const trimmed = text.trim();
  for (const { pattern, replies } of QUICK_REPLY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return replies[Math.floor(Math.random() * replies.length)];
    }
  }
  return null;
}

// === コメントキュー ===
interface QueuedComment {
  text: string;
  messageId: number;
}

class CommentQueue {
  private queue: QueuedComment[] = [];
  private maxSize: number;

  constructor(maxSize: number = MAX_QUEUE_SIZE) {
    this.maxSize = maxSize;
  }

  // コメントをキューに追加。上限超過時は古いものを破棄
  enqueue(comment: QueuedComment): void {
    if (this.queue.length >= this.maxSize) {
      const dropped = this.queue.shift()!;
      console.log(`  ⏭️ [キュー] 溢れたため破棄: "${dropped.text}"`);
    }
    this.queue.push(comment);
    console.log(`  📥 [キュー] 追加: "${comment.text}" (待ち: ${this.queue.length}件)`);
  }

  // キューからコメントを1件取り出す
  dequeue(): QueuedComment | undefined {
    return this.queue.shift();
  }

  get size(): number {
    return this.queue.length;
  }
}

// === WebSocket サーバー起動 ===
const wss = new WebSocketServer({ port: PORT });
console.log(`📡 WebSocket Server running on port ${PORT}`);

let clients: WebSocket[] = [];

wss.on('connection', (ws) => {
  console.log('🔌 Overlay connected');
  clients.push(ws);

  ws.on('close', () => {
    console.log('🔌 Overlay disconnected');
    clients = clients.filter(client => client !== ws);
  });
});

// 全クライアントにメッセージ送信
function broadcast(data: any) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// === メインロジック ===
async function main() {
  const brain = new LocalAiBrain('llama3.1');
  const voice = new VoiceVoxClient();
  const commentQueue = new CommentQueue();
  let isProcessing = false; // AI処理中フラグ

  console.log("🎮 Stream AI Bot Starting... (Make sure VoiceVox is running!) \n");

  // キューからコメントを取り出してAI処理するループ
  async function processQueue(): Promise<void> {
    if (isProcessing) return; // 既に処理中なら何もしない
    if (commentQueue.size === 0) return; // キューが空なら何もしない

    isProcessing = true;

    while (commentQueue.size > 0) {
      const comment = commentQueue.dequeue()!;
      console.log(`  🤖 [AI処理] "${comment.text}"`);

      try {
        // AIに生成させる
        const reply = await brain.chat([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: comment.text }
        ]);
        console.log(`  💬 Bot: ${reply}\n`);

        // AIの返答をテキスト更新
        broadcast({
          type: 'update_reply',
          id: comment.messageId,
          aiReply: reply
        });

        // 音声生成 & 送信
        const audioBuffer = await voice.generateAudio(reply);
        if (audioBuffer) {
          console.log(`  🔊 Sending Audio...`);
          broadcast({
            type: 'audio',
            audioData: audioBuffer.toString('base64')
          });
        }

        // 音声再生の余裕を持たせる
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error("Error:", error);
      }
    }

    isProcessing = false;
  }

  // コメントを受け取って処理を振り分ける関数
  async function handleComment(text: string): Promise<void> {
    console.log(`User: ${text}`);

    // まずコメントだけ即座に表示（AIの返答は「...」で仮表示）
    const messageId = Date.now();
    broadcast({
      type: 'comment',
      id: messageId,
      user: 'Viewer',
      text: text,
      aiReply: '...'
    });

    // 1. 定型コメントフィルターでチェック
    const quickReply = getQuickReply(text);
    if (quickReply) {
      console.log(`  ⚡ [フィルター] 定型返答: ${quickReply}\n`);

      // 即座にテキスト返答
      broadcast({
        type: 'update_reply',
        id: messageId,
        aiReply: quickReply
      });

      // 音声生成 & 送信（定型文も喋らせる）
      const audioBuffer = await voice.generateAudio(quickReply);
      if (audioBuffer) {
        console.log(`  🔊 Sending Audio...`);
        broadcast({
          type: 'audio',
          audioData: audioBuffer.toString('base64')
        });
      }
      return;
    }

    // 2. AIが必要なコメントはキューに追加
    commentQueue.enqueue({ text, messageId });

    // キュー処理を開始（既に処理中なら何もしない）
    processQueue();
  }

  // === デモ用：mock-commentsを高速投入してキューの動作を確認 ===
  const commentsPath = path.join(__dirname, 'mock-comments.json');
  const comments = JSON.parse(fs.readFileSync(commentsPath, 'utf-8'));

  for (const text of comments) {
    await handleComment(text);
    // デモ用：コメントが高速に流れる状況をシミュレート（1秒間隔で投入）
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // キュー処理が完了するまで待機
  while (isProcessing || commentQueue.size > 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log("\n✅ 全コメントの処理が完了しました！");
}

main();
