/**
 * Voiceger サーバー プロセスマネージャー
 * アプリの起動/終了時にVoicegerサーバーを自動制御する
 */
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fetch } from 'undici';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let voicegerProcess: ChildProcess | null = null;

/**
 * Voiceger用のスクリプトディレクトリを取得
 */
function getScriptDir(): string {
    // 開発時: プロジェクトルートの voiceger_shellscript/
    // パッケージ時: app.getAppPath() からの相対パス
    const devPath = path.resolve(__dirname, '..', '..', '..', '..', 'voiceger_shellscript');
    if (fs.existsSync(devPath)) {
        return devPath;
    }

    // Electronパッケージ版: resources/voiceger_shellscript/
    const packagedPath = path.resolve(process.resourcesPath || '', 'voiceger_shellscript');
    if (fs.existsSync(packagedPath)) {
        return packagedPath;
    }

    return devPath; // フォールバック
}

/**
 * Voiceger APIサーバーが起動しているか確認
 */
export async function isVoicegerRunning(baseUrl: string = 'http://127.0.0.1:8000'): Promise<boolean> {
    try {
        const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Voiceger APIサーバーを起動
 */
export async function startVoiceger(baseUrl: string = 'http://127.0.0.1:8000'): Promise<boolean> {
    // 既に起動中なら何もしない
    if (await isVoicegerRunning(baseUrl)) {
        console.log('[VoicegerManager] 既に起動中です');
        return true;
    }

    const scriptDir = getScriptDir();
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'start_voiceger.bat' : 'start_voiceger.sh';
    const scriptPath = path.join(scriptDir, scriptName);

    if (!fs.existsSync(scriptPath)) {
        console.error(`[VoicegerManager] スクリプトが見つかりません: ${scriptPath}`);
        return false;
    }

    console.log(`[VoicegerManager] Voicegerを起動中: ${scriptPath}`);

    try {
        if (isWindows) {
            voicegerProcess = spawn('cmd.exe', ['/c', scriptPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
            });
        } else {
            voicegerProcess = spawn('bash', [scriptPath], {
                detached: true,
                stdio: 'ignore',
            });
        }

        voicegerProcess.unref(); // メインプロセスから切り離す（バックグラウンド実行）

        // 起動を待機（最大60秒、モデル読み込みに時間がかかるため）
        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (await isVoicegerRunning(baseUrl)) {
                console.log(`[VoicegerManager] Voiceger起動完了（${i + 1}秒）`);
                return true;
            }
        }

        console.warn('[VoicegerManager] Voiceger起動タイムアウト（60秒）');
        return false;
    } catch (error) {
        console.error('[VoicegerManager] Voiceger起動失敗:', error);
        return false;
    }
}

/**
 * Voiceger APIサーバーを停止
 */
export async function stopVoiceger(baseUrl: string = 'http://127.0.0.1:8000'): Promise<void> {
    // ポート番号を抽出
    let port = '8000';
    try {
        const url = new URL(baseUrl);
        port = url.port || '8000';
    } catch { /* デフォルトポートを使用 */ }

    console.log(`[VoicegerManager] Voicegerを停止中 (port: ${port})...`);

    try {
        if (process.platform === 'win32') {
            // Windows: netstat でポートを使用しているPIDを取得してkill
            try {
                const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8' });
                const lines = result.trim().split('\n');
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    const pid = parts[parts.length - 1];
                    if (pid && !isNaN(Number(pid))) {
                        execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8' });
                        console.log(`[VoicegerManager] PID ${pid} を停止しました`);
                    }
                }
            } catch { /* プロセスがなければ無視 */ }
        } else {
            // Linux/macOS: lsof でポートを使用しているPIDを取得してkill
            try {
                const pid = execSync(`lsof -t -i:${port}`, { encoding: 'utf-8' }).trim();
                if (pid) {
                    for (const p of pid.split('\n')) {
                        if (p.trim()) {
                            execSync(`kill ${p.trim()}`);
                            console.log(`[VoicegerManager] PID ${p.trim()} を停止しました`);
                        }
                    }
                }
            } catch { /* プロセスがなければ無視 */ }
        }
    } catch (error) {
        console.error('[VoicegerManager] Voiceger停止エラー:', error);
    }

    // 管理中のプロセスもクリーンアップ
    if (voicegerProcess) {
        try {
            voicegerProcess.kill();
        } catch { /* すでに終了していれば無視 */ }
        voicegerProcess = null;
    }

    console.log('[VoicegerManager] Voiceger停止完了');
}
