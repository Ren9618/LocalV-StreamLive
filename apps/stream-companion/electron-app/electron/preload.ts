import { contextBridge, ipcRenderer } from 'electron';

console.log('✅ Preload script loaded');

try {
  contextBridge.exposeInMainWorld('electron', {
    // コメント送信（スパチャフラグ対応）
    sendComment: (text: string, isSuperChat: boolean = false) => {
      console.log(`📤 Sending comment via IPC: ${text}${isSuperChat ? ' (スパチャ)' : ''}`);
      return ipcRenderer.invoke('send-comment', text, isSuperChat);
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
      ipcRenderer.on('health-status', (_event, status) => {
        callback(status);
      });
    },

    // ログ取得
    getLogs: () => {
      return ipcRenderer.invoke('get-logs');
    },

    // ログクリア
    clearLogs: () => {
      return ipcRenderer.invoke('clear-logs');
    },

    // ログエントリのリアルタイム受信
    onLogEntry: (callback: (entry: any) => void) => {
      ipcRenderer.on('log-entry', (_event, entry) => {
        callback(entry);
      });
    },

    // ウォームアップ状態の取得
    getWarmupStatus: () => {
      return ipcRenderer.invoke('get-warmup-status');
    },

    // ウォームアップ状態のリアルタイム受信
    onWarmupStatus: (callback: (status: string) => void) => {
      ipcRenderer.on('ai-warmup-status', (_event, status) => {
        callback(status);
      });
    },

    // フィルター設定の取得
    getFilters: () => {
      return ipcRenderer.invoke('get-filters');
    },

    // フィルター設定の保存
    saveFilters: (filters: any) => {
      return ipcRenderer.invoke('save-filters', filters);
    },
  });
  console.log('✅ contextBridge exposed');
} catch (error) {
  console.error('❌ Failed to expose contextBridge:', error);
}
