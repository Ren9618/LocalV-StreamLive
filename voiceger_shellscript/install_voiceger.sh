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
cd /home/ray_9618/デスクトップ/LocalAI

if [ -d "voiceger_v2" ]; then
    echo "Voiceger is already installed in $(pwd)/voiceger_v2"
    read -p "Do you want to reinstall? (y/N): " choice
    if [[ ! "$choice" =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
    echo "Removing existing installation..."
    rm -rf voiceger_v2
fi

echo "Cloning voiceger_v2..."
git clone https://github.com/zunzun999/voiceger_v2.git

cd voiceger_v2

echo "Creating python venv..."
if [ ! -d "venv" ]; then
    python3.10 -m venv venv
fi

source venv/bin/activate

echo "Downgrading setuptools to <70 for compatibility with older packages..."
pip install "setuptools<70.0.0" wheel

echo "Installing requirements..."
pip install -r requirements.txt
pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --index-url https://download.pytorch.org/whl/cu121

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
