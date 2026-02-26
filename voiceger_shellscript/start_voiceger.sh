#!/bin/bash

# Voiceger 起動スクリプト
# このスクリプトは Voiceger API サーバーを起動します。
# Voiceger: https://github.com/zunzun999/voiceger_v2
# ずんだもん音声モデル利用規約: https://zunko.jp/con_ongen_kiyaku.html

# スクリプトのディレクトリを取得
SCRIPT_DIR="/home/ray_9618/デスクトップ/LocalAI/voiceger_v2"
API_DIR="$SCRIPT_DIR/example"
PYTHON_BIN="$SCRIPT_DIR/venv/bin/python3"

echo "------------------------------------------"
echo "🚀 Voiceger API サーバーを起動しています..."
echo "------------------------------------------"

# ディレクトリの存在確認
if [ ! -d "$API_DIR" ]; then
    echo "❌ エラー: ディレクトリが見つかりません: $API_DIR"
    exit 1
fi

# Python 仮想環境の確認
if [ ! -f "$PYTHON_BIN" ]; then
    echo "❌ エラー: Python 仮想環境が見つかりません。先にインストールを実行してください。"
    exit 1
fi

# API サーバーの起動
cd "$API_DIR"
$PYTHON_BIN voiceger_api.py

# 終了時にメッセージを表示（通常は CTRL+C で止まるまでここには来ません）
echo "------------------------------------------"
echo "👋 Voiceger API サーバーを終了しました。"
echo "------------------------------------------"
