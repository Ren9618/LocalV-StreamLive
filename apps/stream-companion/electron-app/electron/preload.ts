import { contextBridge, ipcRenderer } from 'electron';

console.log('✅ Preload script loaded');

try {
  // システム言語をグローバル変数として公開（i18n自動検出用）
  contextBridge.exposeInMainWorld('__systemLocale__', navigator.language || 'ja');

  contextBridge.exposeInMainWorld('electron', {
    // コメント送信（スパチャフラグ対応）
    sendComment: (text: string, isSuperChat: boolean = false, username: string = 'Guest', userLogoUrl?: string) => {
      console.log(`📤 Sending comment via IPC: [${username}] ${text}${isSuperChat ? ' (スパチャ)' : ''}`);
      return ipcRenderer.invoke('send-comment', text, isSuperChat, username, userLogoUrl);
    },

    // 設定の取得
    getSettings: () => {
      return ipcRenderer.invoke('get-settings');
    },

    // デフォルト設定の取得
    getDefaultSettings: () => {
      return ipcRenderer.invoke('get-default-settings');
    },

    // 設定の保存
    saveSettings: (settings: any) => {
      return ipcRenderer.invoke('save-settings', settings);
    },

    // ヘルスチェック（手動実行）
    checkHealth: () => {
      return ipcRenderer.invoke('check-health');
    },

    // ヘルスステータスの受信（メインプロセスからの定期通知）
    onHealthStatus: (callback: (status: any) => void) => {
      const handler = (_event: any, status: any) => callback(status);
      ipcRenderer.on('health-status', handler);
      return () => { ipcRenderer.removeListener('health-status', handler); };
    },

    // ログ取得
    getLogs: () => {
      return ipcRenderer.invoke('get-logs');
    },

    // ログクリア
    clearLogs: () => {
      return ipcRenderer.invoke('clear-logs');
    },

    // コメント処理の一時停止/再開
    setProcessingPaused: (paused: boolean) => {
      return ipcRenderer.invoke('set-processing-paused', paused);
    },
    getProcessingPaused: () => {
      return ipcRenderer.invoke('get-processing-paused');
    },

    // ログエントリのリアルタイム受信
    onLogEntry: (callback: (entry: any) => void) => {
      const handler = (_event: any, entry: any) => callback(entry);
      ipcRenderer.on('log-entry', handler);
      return () => { ipcRenderer.removeListener('log-entry', handler); };
    },

    // ウォームアップ状態の取得
    getWarmupStatus: () => {
      return ipcRenderer.invoke('get-warmup-status');
    },

    // ウォームアップ状態のリアルタイム受信
    onWarmupStatus: (callback: (status: string) => void) => {
      const handler = (_event: any, status: string) => callback(status);
      ipcRenderer.on('ai-warmup-status', handler);
      return () => { ipcRenderer.removeListener('ai-warmup-status', handler); };
    },

    // フィルター設定の取得
    getFilters: () => {
      return ipcRenderer.invoke('get-filters');
    },

    // フィルター設定の保存
    saveFilters: (filters: any) => {
      return ipcRenderer.invoke('save-filters', filters);
    },

    // === プリセット管理 ===
    // プリセット一覧を取得
    getPresets: () => {
      return ipcRenderer.invoke('get-presets');
    },

    // プリセットを保存
    savePreset: (name: string, text: string) => {
      return ipcRenderer.invoke('save-preset', name, text);
    },

    // プリセットを削除
    deletePreset: (name: string) => {
      return ipcRenderer.invoke('delete-preset', name);
    },

    // プリセットを読み込み
    loadPreset: (name: string) => {
      return ipcRenderer.invoke('load-preset', name);
    },

    // プロンプトをエクスポート
    exportPrompt: (text: string, defaultName: string) => {
      return ipcRenderer.invoke('export-prompt', text, defaultName);
    },

    // プロンプトをインポート
    importPrompt: () => {
      return ipcRenderer.invoke('import-prompt');
    },

    // === オーバーレイ設定 ===
    getOverlaySettings: () => {
      return ipcRenderer.invoke('get-overlay-settings');
    },

    saveOverlaySettings: (settings: any) => {
      return ipcRenderer.invoke('save-overlay-settings', settings);
    },

    // === オーバーレイプリセット管理 ===
    getOverlayPresets: () => {
      return ipcRenderer.invoke('get-overlay-presets');
    },
    saveOverlayPreset: (name: string, settings: any) => {
      return ipcRenderer.invoke('save-overlay-preset', name, settings);
    },
    deleteOverlayPreset: (name: string) => {
      return ipcRenderer.invoke('delete-overlay-preset', name);
    },
    loadOverlayPreset: (name: string) => {
      return ipcRenderer.invoke('load-overlay-preset', name);
    },
    exportOverlayPreset: (settings: any, defaultName: string) => {
      return ipcRenderer.invoke('export-overlay-preset', settings, defaultName);
    },
    importOverlayPreset: () => {
      return ipcRenderer.invoke('import-overlay-preset');
    },

    // === 音声再生イベント（YouTube等の外部ソースからの自動再生用） ===
    onPlayAudio: (callback: (audioData: string) => void) => {
      const handler = (_event: any, audioData: string) => callback(audioData);
      ipcRenderer.on('play-audio', handler);
      return () => { ipcRenderer.removeListener('play-audio', handler); };
    },
  });
  console.log('✅ contextBridge exposed');
} catch (error) {
  console.error('❌ Failed to expose contextBridge:', error);
}
