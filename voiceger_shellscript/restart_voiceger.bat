@echo off
REM Voiceger 再起動スクリプト (Windows)
REM 実行中の Voiceger API サーバーを停止し、新しく起動し直します。
REM Voiceger: https://github.com/zunzun999/voiceger_v2
REM ずんだもん音声モデル利用規約: https://zunko.jp/con_ongen_kiyaku.html

set PORT=8000

echo ------------------------------------------
echo 🔄 Voiceger API サーバーを再起動しています...
echo ------------------------------------------

REM ポート 8000 を使用しているプロセスを探して終了させる
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo 📍 実行中のサーバー (PID: %%a) を停止しています...
    taskkill /PID %%a /F >nul 2>&1
)

REM 少し待機
timeout /t 2 /nobreak >nul

REM 起動スクリプトを呼び出す
set "SCRIPT_DIR=%~dp0"
set "START_SCRIPT=%SCRIPT_DIR%start_voiceger.bat"

if exist "%START_SCRIPT%" (
    call "%START_SCRIPT%"
) else (
    echo ❌ エラー: 起動スクリプトが見つかりません: %START_SCRIPT%
    exit /b 1
)
