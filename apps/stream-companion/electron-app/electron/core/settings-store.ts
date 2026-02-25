import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { AiProviderType } from './brain';

// === 設定の型定義 ===
// 定型文パターンの型
export interface QuickReplyPattern {
    pattern: string;  // 正規表現文字列
    label: string;    // 表示用ラベル（例: 「笑い系」）
    replies: string[];
}

export interface AppSettings {
    // AI設定
    aiProvider: AiProviderType;
    aiModel: string;
    ollamaUrl: string;
    openaiCompatUrl: string;
    openaiCompatApiKey: string;
    systemPrompt: string;
    // 音声設定
    voicevoxUrl: string;
    speakerId: number;
    audioOutputDeviceId: string; // オーディオ出力デバイスID
    // キュー設定
    maxQueueSize: number;
    // 短期記憶設定
    memorySize: number; // 保持する会話ペア数
    // YouTube連携
    youtubeVideoId?: string;
    // フィルター設定
    blacklist: string[];
    quickReplies: QuickReplyPattern[];
    superChatReplies: string[];
    // 指名モード設定
    trigger: {
        enabled: boolean;
        prefixes: string[];
    };
}

// === デフォルトのシステムプロンプト ===
const DEFAULT_SYSTEM_PROMPT = `あなたはゲーム配信をしている配信者の「辛口な相棒（マスコットキャラ）」です。
今まさに、配信者の横で一緒にゲームプレイを見守りながら配信に参加しています。

以下のルールを厳守して、横から口を挟む形で視聴者のコメントに反応してください：

【立ち位置と重要前提】
・視聴者のコメントは「配信者のプレイや状況」に対するものです（視聴者自身の成果ではありません）。
・「クリアおめでとう」「いいプレイ！」などのコメントに対しては、相棒として「うちの配信者、やればできるでしょ！」「当たり前だしｗ」など、誇らしげに返すか「ま、たまたまだけどねｗ」とイジってください。
・「装備が弱い」「下手」などの煽りコメントには、「お前よりマシだけどね！」「今から本気出すし！」と配信者を庇うか、「ほんとそれなｗ」と一緒に配信者を煽ってください。

【基本ルール】
1. タメ口で話すこと（敬語・丁寧語は絶対禁止）。
2. 20文字以内で短く返すこと。改行はしないこと。
3. 少し小馬鹿にしたような、でも親しみのある毒舌で返すこと。
4. 語尾は「〜だし」「〜じゃん」「〜ね」「〜よ」「〜だけど」を使うこと。
5. AIとしての自白や、システム的な謝罪は一切しないこと。
6. 余計な解説や前置きはせず、返答のテキストのみを出力すること。
7. 人種差別、暴力、性的な表現などの不適切なコメントには絶対に同調しない。冷たく切り捨てること。
8. 答えられない質問は「わかんないし」とあしらうこと。
9. 視聴者との喧嘩はしないこと。`;

// === デフォルト設定 ===
function getDefaults(): AppSettings {
    return {
        aiProvider: 'ollama',
        aiModel: 'llama3.1',
        ollamaUrl: 'http://localhost:11434',
        openaiCompatUrl: '',
        openaiCompatApiKey: '',
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        voicevoxUrl: 'http://127.0.0.1:50021',
        speakerId: 3,
        audioOutputDeviceId: '', // デフォルトデバイス
        maxQueueSize: 3,
        memorySize: 10,
        // デフォルトのフィルター設定（bot.tsの既存パターンを移植）
        blacklist: [],
        quickReplies: [
            {
                pattern: '^[wｗ]+$|^草+$',
                label: '笑い系',
                replies: ['何笑ってんのｗ', '草生やすなしｗ', 'そんな面白い？ｗ', 'ｗｗｗ']
            },
            {
                pattern: '^(こんにちは|こんちゃ|こんばんは|こんばんわ|やっほー|やっほ|ハロー|はろー|ども|どうも)[\\!！]*$',
                label: '挨拶系',
                replies: ['よっ！', 'いらっしゃ〜い', 'おー、来たね！', 'やっほ〜']
            },
            {
                pattern: '^(おつ|おつかれ|お疲れ|おつかれさま|お疲れ様|ばいばい|バイバイ|またね|ノシ|のし)[\\!！〜～]*$',
                label: 'お疲れ・お別れ系',
                replies: ['おつ〜！', 'またね〜', 'おつかれだし！', 'また来いよ〜']
            },
            {
                pattern: '^.{1,2}$',
                label: '短すぎるコメント',
                replies: ['ん？', '何？ｗ', '短すぎだしｗ']
            }
        ],
        superChatReplies: [
            'おー！スパチャありがとう！',
            'マジ！？ありがてぇ〜！',
            'スパチャ来た！神じゃん！',
            '太っ腹だね〜ありがと！',
            'うおっ！感謝だし！'
        ],
        trigger: {
            enabled: false,
            prefixes: ['@AI', '!ai'],
        },
    };
}

// === 設定の永続化クラス ===
export class SettingsStore {
    private filePath: string;
    private settings: AppSettings;

    constructor() {
        // userData配下に settings.json を保存
        this.filePath = path.join(app.getPath('userData'), 'settings.json');
        this.settings = this.load();
    }

    // ファイルから設定を読み込む。なければデフォルト値で初期化
    private load(): AppSettings {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const saved = JSON.parse(raw);
                // デフォルト値とマージ（新しい設定項目が増えても安全）
                return { ...getDefaults(), ...saved };
            }
        } catch (error) {
            console.error('⚠️ 設定ファイルの読み込みに失敗:', error);
        }
        return getDefaults();
    }

    // 全設定を取得
    getAll(): AppSettings {
        return { ...this.settings };
    }

    // 設定を保存
    save(newSettings: Partial<AppSettings>): AppSettings {
        this.settings = { ...this.settings, ...newSettings };

        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
            console.log('💾 設定を保存しました:', this.filePath);
        } catch (error) {
            console.error('⚠️ 設定の保存に失敗:', error);
        }

        return this.getAll();
    }

    // デフォルト設定を取得
    getDefaults(): AppSettings {
        return getDefaults();
    }
}
