@echo off
REM Voiceger 起動スクリプト (Windows)
REM Voiceger API サーバーを起動します。

echo ------------------------------------------
echo 🚀 Voiceger API サーバーを起動しています...
echo ------------------------------------------

REM スクリプトの親ディレクトリから voiceger_v2 を探す
set "SCRIPT_DIR=%~dp0"
set "VOICEGER_DIR=%SCRIPT_DIR%..\..\..\voiceger_v2"
set "API_DIR=%VOICEGER_DIR%\example"
set "PYTHON_BIN=%VOICEGER_DIR%\venv\Scripts\python.exe"

REM ディレクトリの存在確認
if not exist "%API_DIR%" (
    echo ❌ エラー: ディレクトリが見つかりません: %API_DIR%
    exit /b 1
)

REM Python 仮想環境の確認
if not exist "%PYTHON_BIN%" (
    echo ❌ エラー: Python 仮想環境が見つかりません。先にインストールを実行してください。
    exit /b 1
)

REM API サーバーの起動
cd /d "%API_DIR%"
"%PYTHON_BIN%" voiceger_api.py

echo ------------------------------------------
echo 👋 Voiceger API サーバーを終了しました。
echo ------------------------------------------
