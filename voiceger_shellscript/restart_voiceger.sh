#!/bin/bash

# Voiceger 再起動スクリプト
# 実行中の Voiceger API サーバーを停止し、新しく起動し直します。

PORT=8000
START_SCRIPT="/home/ray_9618/デスクトップ/LocalAI/start_voiceger.sh"

echo "------------------------------------------"
echo "🔄 Voiceger API サーバーを再起動しています..."
echo "------------------------------------------"

# ポート 8000 を使用しているプロセスを探して終了させる
PID=$(lsof -t -i:$PORT)

if [ -n "$PID" ]; then
    echo "📍 実行中のサーバー (PID: $PID) を停止しています..."
    kill $PID
    # 完全に終了するまで少し待機
    sleep 2
else
    echo "ℹ️ 実行中のサーバーは見つかりませんでした。"
fi

# 起動スクリプトを呼び出す
if [ -f "$START_SCRIPT" ]; then
    bash "$START_SCRIPT"
else
    echo "❌ エラー: 起動スクリプトが見つかりません: $START_SCRIPT"
    exit 1
fi
