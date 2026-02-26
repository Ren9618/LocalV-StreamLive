// === エラーコード定義 ===
// フォーマット: LV-XXXX
// 1000番台: LLM関連
// 2000番台: 音声合成関連
// 3000番台: アプリ起動関連
// 9000番台: その他

export const ErrorCodes = {
    // --- Ollama ---
    OLLAMA_CONNECTION_REFUSED: 'LV-1001',  // Ollamaに接続できない（ECONNREFUSED）
    OLLAMA_TIMEOUT: 'LV-1002',             // Ollamaへの接続タイムアウト
    OLLAMA_HTTP_ERROR: 'LV-1003',          // Ollama HTTPエラー

    // --- OpenAI互換 API ---
    OPENAI_URL_NOT_SET: 'LV-1010',         // API URLが未設定
    OPENAI_CONNECTION_REFUSED: 'LV-1011',  // APIサーバーに接続できない
    OPENAI_HTTP_ERROR: 'LV-1012',          // API HTTPエラー

    // --- VoiceVox ---
    VOICEVOX_CONNECTION_REFUSED: 'LV-2001', // VoiceVoxに接続できない
    VOICEVOX_TIMEOUT: 'LV-2002',            // VoiceVox接続タイムアウト
    VOICEVOX_HTTP_ERROR: 'LV-2003',         // VoiceVox HTTPエラー

    // --- アプリ起動 ---
    WARMUP_FAILED: 'LV-3001',               // AIウォームアップ失敗 (Ollama等)
    VOICEGER_START_FAILED: 'LV-3002',       // Voiceger API起動失敗 (VRAM不足等)

    // --- その他 ---
    UNKNOWN: 'LV-9999',                     // 不明なエラー
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
