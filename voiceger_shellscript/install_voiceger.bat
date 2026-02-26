@echo off
setlocal enabledelayedexpansion

REM =============================================================================
REM Voiceger インストールスクリプト (Windows)
REM
REM このスクリプトは Voiceger (https://github.com/zunzun999/voiceger_v2) の
REM セットアップを自動化するものです。Voiceger のソースコードやモデルを
REM 同梱・再配布するものではなく、公式リポジトリからのクローンおよび
REM 必要な依存関係のインストールを行います。
REM
REM --- サードパーティ ライセンス情報 ---
REM Voiceger は以下のオープンソースソフトウェアを含みます:
REM   - GPT-SoVITS (MIT License) : https://github.com/RVC-Boss/GPT-SoVITS
REM   - GPT-SoVITS Pretrained Models (MIT License)
REM   - G2PW Model (Apache 2.0 License) : https://github.com/GitYCC/g2pW
REM   - RVC WebUI (MIT License) : https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI
REM   - RMVPE (MIT License)
REM   - Faster Whisper Large V3 (MIT License)
REM
REM ずんだもん音声モデルの利用規約:
REM   https://zunko.jp/con_ongen_kiyaku.html
REM =============================================================================

echo Starting Voiceger Installation for Windows...

:: 設置場所の決定（LocalV-StreamLiveディレクトリ内）
set "TARGET_DIR=%~dp0..\"
cd /d "%TARGET_DIR%"

:: 依存ツールの確認
where git >nul 2>0
if %errorlevel% neq 0 (
    echo Error: Git is not installed. Please install Git first.
    pause
    exit /b 1
)

where python >nul 2>0
if %errorlevel% neq 0 (
    echo Error: Python is not installed. Please install Python 3.10 first.
    pause
    exit /b 1
)

:: 引数の解析
set "ACTION=default"
:parse_args
if "%~1"=="" goto after_args
if /i "%~1"=="--clean" set "ACTION=clean"
if /i "%~1"=="--resume" set "ACTION=resume"
if /i "%~1"=="-y" set "ACTION=resume"
if /i "%~1"=="--yes" set "ACTION=resume"
if /i "%~1"=="--uninstall" set "ACTION=uninstall"
shift
goto parse_args
:after_args

if "%ACTION%"=="uninstall" (
    echo Uninstalling Voiceger...
    if exist "voiceger_v2" (
        rmdir /s /q "voiceger_v2"
        echo Voiceger uninstalled successfully.
    ) else (
        echo Voiceger is not installed.
    )
    exit /b 0
)

:: Git LFSの確認（モデルダウンロードに必須）
where git-lfs >nul 2>0
if %errorlevel% neq 0 (
    echo Error: Git LFS (Large File Storage) is not installed. Please install git-lfs first.
    pause
    exit /b 1
)
git lfs install

:: 再インストール確認
if exist "voiceger_v2" (
    echo Voiceger is already installed in %cd%\voiceger_v2
    if "%ACTION%"=="clean" (
        echo Clean installation requested. Removing existing directory...
        rmdir /s /q "voiceger_v2"
    ) else if "%ACTION%"=="resume" (
        echo Resume installation requested. Existing directory will be updated/resumed.
        cd voiceger_v2
        git pull
        cd ..
    ) else (
        set /p REINSTALL="Do you want to clean reinstall (c) or resume (r)? (c/R): "
        if /i "!REINSTALL!"=="c" (
            echo Removing existing installation...
            rmdir /s /q "voiceger_v2"
        ) else (
            echo Resuming installation in existing directory...
            cd voiceger_v2
            git pull
            cd ..
        )
    )
)

if not exist "voiceger_v2" (
    echo Cloning voiceger_v2...
    git clone https://github.com/zunzun999/voiceger_v2.git
    if %errorlevel% neq 0 (
        echo Error: Failed to clone repository.
        pause
        exit /b 1
    )
)

cd voiceger_v2

echo Creating python venv...
python -m venv venv
if %errorlevel% neq 0 (
    echo Error: Failed to create venv.
    pause
    exit /b 1
)

call venv\Scripts\activate.bat

echo Downgrading setuptools to ^<70 for compatibility with older packages...
pip install "setuptools<70.0.0" wheel

echo Installing requirements...
pip install -r requirements.txt

:: GPU環境の自動判別と適切な PyTorch のインストール
where nvidia-smi >nul 2>0
if %errorlevel% equ 0 (
    echo NVIDIA GPU detected. Installing PyTorch with CUDA 12.1 support...
    pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --extra-index-url https://download.pytorch.org/whl/cu121
) else (
    echo No NVIDIA GPU detected. Installing PyTorch CPU version...
    pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --extra-index-url https://download.pytorch.org/whl/cpu
)

echo Downloading GPT-SoVITS pretrained models...
cd GPT-SoVITS\GPT_SoVITS
if not exist "pretrained_models" mkdir pretrained_models
cd pretrained_models

if not exist "chinese-hubert-base" (
    git clone https://huggingface.co/lj1995/GPT-SoVITS temp_pretrained
    xcopy /E /Y temp_pretrained\* .
    rmdir /s /q temp_pretrained
)

echo Downloading G2PW models (from HuggingFace mirror)...
cd ..\text
if not exist "G2PWModel" (
    curl.exe -L -o G2PWModel_1.1.zip https://huggingface.co/L-jasmine/GPT_Sovits/resolve/main/G2PWModel_1.1.zip
    powershell -command "Expand-Archive -Path 'G2PWModel_1.1.zip' -DestinationPath '.' -Force"
    ren G2PWModel_1.1 G2PWModel
    del G2PWModel_1.1.zip
)

echo Downloading Zundamon Fine-Tuned Models...
cd ..\..\
if not exist "GPT_weights_v2" (
    git clone https://huggingface.co/zunzunpj/zundamon_GPT-SoVITS temp_zundamon
    xcopy /E /Y temp_zundamon\GPT_weights_v2 .\GPT_weights_v2\
    xcopy /E /Y temp_zundamon\SoVITS_weights_v2 .\SoVITS_weights_v2\
    rmdir /s /q temp_zundamon
)

echo Downloading RVC Models ^& Assets...
cd Retrieval-based-Voice-Conversion-WebUI\assets
if not exist "weights" mkdir weights
if not exist "indices" mkdir indices
if not exist "rmvpe" mkdir rmvpe
if not exist "hubert" mkdir hubert

if not exist "rmvpe\rmvpe.pt" (
    curl.exe -L -o rmvpe\rmvpe.pt https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt
)
if not exist "hubert\hubert_base.pt" (
    curl.exe -L -o hubert\hubert_base.pt https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt
)

if not exist "weights\train-0814-2.pth" (
    curl.exe -L -o weights\train-0814-2.pth https://huggingface.co/zunzunpj/zundamon_RVC/resolve/main/zumdaon_rvc_indices_weights/train-0814-2.pth
)

if not exist "indices\train-0814-2_IVF256_Flat_nprobe_1_train-0814-2_v2.index" (
    curl.exe -L -o indices\train-0814-2_IVF256_Flat_nprobe_1_train-0814-2_v2.index https://huggingface.co/zunzunpj/zundamon_RVC/resolve/main/zumdaon_rvc_indices_weights/train-0814-2_IVF256_Flat_nprobe_1_train-0814-2_v2.index
)

echo Installation complete!
pause
