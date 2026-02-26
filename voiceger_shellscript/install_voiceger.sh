#!/bin/bash
set -e

# =============================================================================
# Voiceger インストールスクリプト (Linux/macOS)
#
# このスクリプトは Voiceger (https://github.com/zunzun999/voiceger_v2) の
# セットアップを自動化するものです。Voiceger のソースコードやモデルを
# 同梱・再配布するものではなく、公式リポジトリからのクローンおよび
# 必要な依存関係のインストールを行います。
#
# --- サードパーティ ライセンス情報 ---
# Voiceger は以下のオープンソースソフトウェアを含みます:
#   - GPT-SoVITS (MIT License) : https://github.com/RVC-Boss/GPT-SoVITS
#   - GPT-SoVITS Pretrained Models (MIT License)
#   - G2PW Model (Apache 2.0 License) : https://github.com/GitYCC/g2pW
#   - RVC WebUI (MIT License) : https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI
#   - RMVPE (MIT License)
#   - Faster Whisper Large V3 (MIT License)
#
# ずんだもん音声モデルの利用規約:
#   https://zunko.jp/con_ongen_kiyaku.html
# =============================================================================

echo "Starting Voiceger Installation..."
# スクリプトの場所から LocalAI ディレクトリ（2つ上）を特定
PARENT_DIR=$(cd "$(dirname "$0")/../.."; pwd)
cd "$PARENT_DIR"

# 引数の解析
ACTION="default"
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --clean) ACTION="clean" ;;
        --resume|-y|--yes) ACTION="resume" ;;
        --uninstall) ACTION="uninstall" ;;
    esac
    shift
done

if [ "$ACTION" == "uninstall" ]; then
    echo "Uninstalling Voiceger..."
    if [ -d "voiceger_v2" ]; then
        rm -rf voiceger_v2
        echo "Voiceger uninstalled successfully."
    else
        echo "Voiceger is not installed."
    fi
    exit 0
fi

if [ -d "voiceger_v2" ]; then
    echo "Voiceger directory already exists."
    if [ "$ACTION" == "clean" ]; then
        echo "Clean installation requested. Removing existing directory..."
        rm -rf voiceger_v2
        echo "Cloning voiceger_v2..."
        git clone https://github.com/zunzun999/voiceger_v2.git
        cd voiceger_v2
    elif [ "$ACTION" == "resume" ]; then
        echo "Resume installation requested. Existing directory will be updated/resumed."
        cd voiceger_v2
        # レジューム時は最新の変更を取り込む
        git pull || true
    else
        read -p "Do you want to clean reinstall (c) or resume (r)? (c/R): " choice
        if [[ "$choice" =~ ^[Cc]$ ]]; then
            echo "Removing existing installation..."
            rm -rf voiceger_v2
            echo "Cloning voiceger_v2..."
            git clone https://github.com/zunzun999/voiceger_v2.git
            cd voiceger_v2
        else
            echo "Resuming installation in existing directory..."
            cd voiceger_v2
            git pull || true
        fi
    fi
else
    echo "Cloning voiceger_v2..."
    git clone https://github.com/zunzun999/voiceger_v2.git
    cd voiceger_v2
fi

echo "Patching requirements.txt for macOS compatibility..."
if [ -f "requirements.txt" ]; then
    # LangSegment @ ./LangSegment-0.3.5 -> ./LangSegment-0.3.5
    # MacOSのpipでInvalid URLエラーになるのを防ぐための修正
    sed 's/LangSegment @ \.\//.\//g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt
    
    # OS判定
    OS_TYPE="$(uname -s)"
    
    # Apple Silicon (arm64) の場合は MKL 関連を除去
    ARCH=$(uname -m)
    if [ "$OS_TYPE" == "Darwin" ] && [ "$ARCH" == "arm64" ]; then
        echo "🍎 Apple Silicon detected. Removing incompatible MKL packages..."
        sed -E '/mkl-service|mkl_fft|mkl_random/d' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt
    fi

    # macOS 全般で onnxruntime-gpu を onnxruntime に置換
    if [ "$OS_TYPE" == "Darwin" ]; then
        echo "🍎 macOS detected. Replacing onnxruntime-gpu with onnxruntime..."
        sed 's/onnxruntime-gpu/onnxruntime/g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt
        
        echo "🍎 macOS detected. Upgrading numba for LLVM 14 compatibility..."
        # numba 0.56.4 は LLVM 14 をサポートしていないため、0.57.1 にアップグレード
        # 正規表現を使用して確実に置換 (どんな接尾辞がついていても強制上書き)
        sed -E 's/numba==.*/numba==0.57.1/g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt
        sed -E 's/llvmlite==.*/llvmlite==0.40.1/g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt
        if grep -q "numba==0.57.1" requirements.txt && grep -q "llvmlite==0.40.1" requirements.txt; then
            echo "✅ Numba and LLVMLite patched to 0.57.1 and 0.40.1."
        else
            echo "⚠️ Failed to patch Numba via sed. Will attempt forced install in Stage 1."
        fi

        # システムヘッダー (stdio.h 等) を見つけるための設定
        export SDKROOT=$(xcrun --show-sdk-path)
        echo "🍎 SDKROOT set to: $SDKROOT"

        echo "🍎 macOS detected. Removing Windows-only dependencies..."
        # win-inet-pton を追加して一括削除
        sed -E '/pywin32|pywin32-ctypes|pyreadline3|win-inet-pton/d' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt

        echo "🍎 macOS detected. Adjusting faiss-cpu version for numpy 1.23 compatibility..."
        # 最新の faiss-cpu (1.11+) は numpy 1.25+ を要求するため、numpy==1.23.4 に対応する 1.7.4 を指定する
        # requirements.txt 内のバージョン指定が変動することを考慮し、正規惹きで置換
        sed -E 's/faiss-cpu==.*/faiss-cpu==1.7.4/g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt
    fi
fi

echo "🔧 Bypassing impossible dependency conflict between fairseq and funasr..."
# fairseq 0.12.2 と funasr 1.0.27 は hydra-core の要求バージョンが完全に背反しているため、Pipの依存関係解決が不可能です。
# fairseqは音声機能等で強行動作させることが一般的なため、requirements.txt から完全に除外し、後で単独インストールします。
sed -E '/fairseq==/d' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt


echo "Checking for Python 3.10 or higher..."
# ... (rest of Python detection remains same)
PYTHON_CMD=""

find_python() {
    for cmd in python3.10 python3 python; do
        if command -v $cmd >/dev/null 2>&1; then
            # バージョンチェック (3.10以上)
            VERSION=$($cmd -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
            MAJOR=$(echo $VERSION | cut -d. -f1)
            MINOR=$(echo $VERSION | cut -d. -f2)
            if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 10 ]; then
                PYTHON_CMD=$cmd
                return 0
            fi
        fi
    done
    return 1
}

if ! find_python; then
    echo "⚠️ Python 3.10 or higher is not found. Attempting to install..."
    
    OS_TYPE="$(uname -s)"
    if [ "$OS_TYPE" == "Darwin" ]; then
        # macOS: Homebrew を使用
        if ! command -v brew >/dev/null 2>&1; then
            echo "🍺 Homebrew is not installed. Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            # インストール後にパスを通す（一般的なパス）
            if [ -f /opt/homebrew/bin/brew ]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            elif [ -f /usr/local/bin/brew ]; then
                eval "$(/usr/local/bin/brew shellenv)"
            fi
        fi
        
        if command -v brew >/dev/null 2>&1; then
            echo "🐍 Installing Python 3.10 via Homebrew..."
            brew install python@3.10
        else
            echo "❌ Failed to install Homebrew. Please install it manually from https://brew.sh/"
            exit 1
        fi
    elif [ "$OS_TYPE" == "Linux" ]; then
        # Linux: apt を使用
        if command -v apt >/dev/null 2>&1; then
            echo "🐍 Installing Python 3.10 via apt..."
            sudo apt update
            sudo apt install -y python3.10 python3.10-venv
        else
            echo "❌ Package manager 'apt' not found. Please install Python 3.10+ manually."
            exit 1
        fi
    fi

    # 最終確認
    if ! find_python; then
        echo "❌ Error: Python 3.10 or higher is still not found after installation attempt."
        echo "Please install Python 3.10 or higher manually (https://www.python.org/downloads/)"
        exit 1
    fi
fi

echo "Found suitable Python: $PYTHON_CMD"
echo "Creating python venv using $PYTHON_CMD..."
if [ ! -d "venv" ]; then
    $PYTHON_CMD -m venv venv
fi

source venv/bin/activate

echo "Stage 0: Installing system dependencies..."
OS_TYPE="$(uname -s)"
if [ "$OS_TYPE" == "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
        echo "🍺 Installing ffmpeg, pkg-config, mecab, cmake and llvm@14 via Homebrew..."
        brew install ffmpeg pkg-config mecab mecab-ipadic cmake llvm@14
        
        # LLVM の設定 (Homebrew llvm@14 用)
        # 注意: PATH に bin を追加すると Homebrew の clang が優先され SDK エラー (_Float16 等)
        # が発生するため、LLVM_CONFIG の指定に留め、コンパイラはシステム標準を使用させます。
        if [ -d "/opt/homebrew/opt/llvm@14/bin" ]; then
            export LDFLAGS="-L/opt/homebrew/opt/llvm@14/lib"
            export CPPFLAGS="-I/opt/homebrew/opt/llvm@14/include"
            export LLVM_CONFIG="/opt/homebrew/opt/llvm@14/bin/llvm-config"
        elif [ -d "/usr/local/opt/llvm@14/bin" ]; then
            export LDFLAGS="-L/usr/local/opt/llvm@14/lib"
            export CPPFLAGS="-I/usr/local/opt/llvm@14/include"
            export LLVM_CONFIG="/usr/local/opt/llvm@14/bin/llvm-config"
        fi
        echo "🍎 LLVM_CONFIG set to: $LLVM_CONFIG"
    else
        echo "⚠️ Homebrew not found. System dependencies might be missing."
    fi
elif [ "$OS_TYPE" == "Linux" ]; then
    if command -v apt >/dev/null 2>&1; then
        echo "🐍 Installing system dependencies for PyAV, MeCab, CMake, LLVM, Git-LFS and wget via apt..."
        sudo apt update
        sudo apt install -y pkg-config libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev libswscale-dev libswresample-dev libavfilter-dev libmecab-dev cmake llvm-dev git-lfs wget
    fi
fi

# CMake のフォールバック対策
if ! command -v cmake >/dev/null 2>&1; then
    echo "⚠️ cmake not found in system. Installing cmake via pip as fallback..."
    pip install cmake
fi

echo "Stage 1: Installing initial build tools and prioritized wheels..."
# omegaconf の古いメタデータ書式 (PyYAML >=5.1.*) を許容するため、pip は 24.1 未満に固定する
pip install "pip<24.1"
# numba と llvmlite の完成品（バイナリ）を優先してインストールを試みる
# これにより、可能な限り時間のかかるソースビルドを回避します
pip install --only-binary :all: "numba==0.57.1" "llvmlite==0.40.1" || true

# numba のビルドに numpy が必要なため、ここで先に入れておきます
pip install "setuptools==69.5.1" wheel Cython "numpy<2.0.0"

echo "Stage 2: Installing legacy dependencies that require pkg_resources..."
# --no-build-isolation を使うことで、一時環境を作らずに Stage 1 で入れた setuptools==69.5.1 を使わせます
pip install --no-build-isolation openai-whisper==20240930 eunjeon==0.4.0 ./LangSegment-0.3.5

echo "Stage 3: Upgrading build tools for modern dependencies..."
pip install --upgrade setuptools

echo "Stage 4: Installing remaining requirements..."

echo "🔧 Adjusting FastAPI, Huggingface-Hub, and Starlette versions to satisfy Gradio requirements..."
# gradio 5.41.0 requires fastapi>=0.115.2, huggingface-hub>=0.33.5, and starlette>=0.40.0
sed -E 's/fastapi==.*/fastapi>=0.115.2/g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt
sed -E 's/huggingface-hub==.*/huggingface-hub>=0.33.5/g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt
sed -E 's/starlette==.*/starlette>=0.40.0/g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt

echo "🔧 Relaxing PyAV (av) version to allow pre-compiled binaries..."
# av==14.4.0等の指定があると、特定のOSでソースビルドが始まり失敗する。バージョン指定を解除してバイナリを優先する。
sed -E 's/av==[0-9.]+/av/g' requirements.txt > requirements.txt.tmp && mv requirements.txt.tmp requirements.txt

echo "🔧 Patching voiceger_api.py for cross-platform ffmpeg support..."
python3 -c "
import os
path = 'example/voiceger_api.py'
if os.path.exists(path):
    with open(path, 'r') as f: content = f.read()
    if 'elif os.path.exists(os.path.join(ffmpeg_dir' not in content:
        content = content.replace(
            'if os.path.exists(os.path.join(ffmpeg_dir, \"ffmpeg.exe\")):',
            'if os.name != \"nt\":\n    pass\nelif os.path.exists(os.path.join(ffmpeg_dir, \"ffmpeg.exe\")):'
        )
        with open(path, 'w') as f: f.write(content)

    if '@app.get(\"/speakers\")' not in content:
        speakers_code = '''
@app.get("/speakers")
def get_speakers():
    """List available reference speakers (wav files)"""
    speakers = []
    if os.path.exists(REFERENCE_DIR):
        for f in os.listdir(REFERENCE_DIR):
            if f.endswith(".wav"):
                speakers.append({
                    "id": f,
                    "name": f.replace(".wav", "")
                })
    if not speakers:
        speakers = [{"id": "default", "name": "Default Speaker"}]
    return {"speakers": speakers}
'''
        content = content.replace(
            '    "endpoints": ["/tts", "/vc/single"]\n    }',
            '    "endpoints": ["/tts", "/vc/single", "/speakers"]\n    }'
        )
        content = content.replace('@app.post("/tts")', speakers_code + '\n@app.post("/tts")')
        with open(path, 'w') as f: f.write(content)
"


echo "Installing requirements..."
pip install -r requirements.txt

# 最終的に setuptools>=70 に上がっていると pkg_resources が消えてしまうため、古い版に戻す
echo "🔧 Reverting setuptools to < 70.0.0 to fix pkg_resources error..."
pip install "setuptools<70.0.0"

echo "🔧 Installing fairseq forcibly without dependencies to bypass conflict..."
pip install fairseq==0.12.2 --no-deps

# OS判定（再度取得）
OS_TYPE="$(uname -s)"
if [ "$OS_TYPE" == "Darwin" ]; then
    echo "🍎 Installing PyTorch for macOS..."
    pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2
else
    echo "🐍 Installing PyTorch for Linux (CUDA 12.1)..."
    pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --index-url https://download.pytorch.org/whl/cu121
fi

echo "Downloading GPT-SoVITS pretrained models..."
cd GPT-SoVITS/GPT_SoVITS
if [ ! -d "pretrained_models" ]; then
    mkdir -p pretrained_models
fi
cd pretrained_models

if [ ! -d "chinese-hubert-base" ]; then
    git lfs install
    git clone https://huggingface.co/lj1995/GPT-SoVITS temp_pretrained
    mv temp_pretrained/* .
    rm -rf temp_pretrained
fi

echo "Downloading G2PW models (from HuggingFace mirror)..."
cd ../text
if [ ! -d "G2PWModel" ]; then
    wget -O G2PWModel_1.1.zip https://huggingface.co/L-jasmine/GPT_Sovits/resolve/main/G2PWModel_1.1.zip
    unzip G2PWModel_1.1.zip
    mv G2PWModel_1.1 G2PWModel
    rm G2PWModel_1.1.zip
fi

echo "Downloading Zundamon Fine-Tuned Models..."
cd ../../
if [ ! -d "GPT_weights_v2" ] || [ ! -d "SoVITS_weights_v2" ]; then
    git clone https://huggingface.co/zunzunpj/zundamon_GPT-SoVITS temp_zundamon
    mv temp_zundamon/GPT_weights_v2 .
    mv temp_zundamon/SoVITS_weights_v2 .
    rm -rf temp_zundamon
fi

echo "Downloading RVC Models & Assets..."
cd Retrieval-based-Voice-Conversion-WebUI/assets
mkdir -p weights indices rmvpe hubert

if [ ! -f "rmvpe/rmvpe.pt" ]; then
    wget -O rmvpe/rmvpe.pt https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt
fi
if [ ! -f "hubert/hubert_base.pt" ]; then
    wget -O hubert/hubert_base.pt https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt
fi

if [ ! -f "weights/train-0814-2.pth" ]; then
    wget -O weights/train-0814-2.pth https://huggingface.co/zunzunpj/zundamon_RVC/resolve/main/zumdaon_rvc_indices_weights/train-0814-2.pth
fi

if [ ! -f "indices/train-0814-2_IVF256_Flat_nprobe_1_train-0814-2_v2.index" ]; then
    wget -O indices/train-0814-2_IVF256_Flat_nprobe_1_train-0814-2_v2.index https://huggingface.co/zunzunpj/zundamon_RVC/resolve/main/zumdaon_rvc_indices_weights/train-0814-2_IVF256_Flat_nprobe_1_train-0814-2_v2.index
fi

echo "Installation complete!"
