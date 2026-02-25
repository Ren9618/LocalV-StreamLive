import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { app } from 'electron';

// === 視聴者データの型 ===
export interface ViewerData {
    username: string;       // 視聴者名（主キー）
    commentCount: number;   // 総コメント回数
    firstSeen: string;      // 初回コメント日時 (ISO)
    lastSeen: string;       // 最終コメント日時 (ISO)
    characteristics: string; // AIが付与した特徴ラベル（例: "常連", "辛口", "初心者"）
}

// === 視聴者メモリークラス (SQLite) ===
export class ViewerMemory {
    private dbPath: string;
    private db: Database | null = null;
    private dbPromise: Promise<void>;

    constructor() {
        this.dbPath = path.join(app.getPath('userData'), 'viewer-memory.db');
        this.dbPromise = this.initDb();
    }

    // 外部からの初期化完了待機用メソッド
    async init(): Promise<void> {
        return this.dbPromise;
    }

    // DBの初期化とテーブル作成
    private async initDb(): Promise<void> {
        try {
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database
            });

            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS viewers (
                    username TEXT PRIMARY KEY,
                    commentCount INTEGER DEFAULT 0,
                    firstSeen TEXT,
                    lastSeen TEXT,
                    characteristics TEXT DEFAULT ''
                )
            `);
            console.log('[ViewerMemory] DB initialized at', this.dbPath);
        } catch (error) {
            console.error('[ViewerMemory] DB init failed:', error);
        }
    }

    // 視聴者のコメントを記録し、データを返す
    async recordComment(username: string): Promise<ViewerData | null> {
        await this.dbPromise;
        if (!this.db) return null;

        const now = new Date().toISOString();

        try {
            // 既存ユーザーか確認
            const existing = await this.db.get<ViewerData>('SELECT * FROM viewers WHERE username = ?', username);

            if (existing) {
                // 更新
                await this.db.run(`
                    UPDATE viewers 
                    SET commentCount = commentCount + 1, lastSeen = ?
                    WHERE username = ?
                `, now, username);
                return { ...existing, commentCount: existing.commentCount + 1, lastSeen: now };
            } else {
                // 新規追加
                await this.db.run(`
                    INSERT INTO viewers (username, commentCount, firstSeen, lastSeen)
                    VALUES (?, 1, ?, ?)
                `, username, now, now);
                return { username, commentCount: 1, firstSeen: now, lastSeen: now, characteristics: '' };
            }
        } catch (error) {
            console.error('[ViewerMemory] Failed to record comment:', error);
            return null;
        }
    }

    // 視聴者の特徴を更新する（例: 常連になったら呼ばれる）
    async updateCharacteristics(username: string, characteristics: string): Promise<void> {
        await this.dbPromise;
        if (!this.db) return;

        try {
            await this.db.run(`
                UPDATE viewers
                SET characteristics = ?
                WHERE username = ?
            `, characteristics, username);
        } catch (error) {
            console.error('[ViewerMemory] Failed to update characteristics:', error);
        }
    }

    // 視聴者データを取得する
    async getViewer(username: string): Promise<ViewerData | null> {
        await this.dbPromise;
        if (!this.db || !username) return null;

        try {
            const viewer = await this.db.get<ViewerData>('SELECT * FROM viewers WHERE username = ?', username);
            return viewer || null;
        } catch {
            return null;
        }
    }

    // 全視聴者データを取得する（UI表示用など）
    async getAllViewers(): Promise<ViewerData[]> {
        await this.dbPromise;
        if (!this.db) return [];

        try {
            return await this.db.all<ViewerData[]>('SELECT * FROM viewers ORDER BY lastSeen DESC');
        } catch {
            return [];
        }
    }

    // プロンプトに注入する文脈データを生成する
    async getContextPrompt(username: string): Promise<string> {
        const viewer = await this.getViewer(username);
        if (!viewer) return '';

        let ctx = `【視聴者情報: 名前="${viewer.username}"】\n`;

        // 初見判定
        if (viewer.commentCount <= 1) {
            ctx += `・この人は初見さんです。優しく（または軽くイジって）歓迎してください。\n`;
        } else if (viewer.commentCount > 10) {
            ctx += `・この人は常連さん（コメント${viewer.commentCount}回目）です。親しげに接してください。\n`;
        }

        if (viewer.characteristics) {
            ctx += `・特徴メモ: ${viewer.characteristics}\n`;
        }

        return ctx;
    }
}
