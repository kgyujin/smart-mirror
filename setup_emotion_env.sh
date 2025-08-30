#!/bin/bash

echo "🐍 Python 가상환경 설정 시작..."

# 시스템 의존성 설치
echo "📦 시스템 의존성 설치 중..."
sudo apt-get update
sudo apt-get install -y python3-pip python3-dev python3-venv build-essential gfortran libopenblas-dev liblapack-dev cmake

# 가상환경 생성
echo "🏗️ Python 가상환경 생성 중..."
python3 -m venv emotion_env

# 가상환경 활성화
echo "🔧 가상환경 활성화..."
source emotion_env/bin/activate

# pip 업그레이드
echo "⬆️ pip 업그레이드..."
pip install --upgrade pip

# PyTorch 설치 (라즈베리파이3용)
echo "🔥 PyTorch 설치 중... (시간이 오래 걸릴 수 있습니다)"
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cpu

# SpeechBrain 설치
echo "🧠 SpeechBrain 설치 중..."
pip install git+https://github.com/speechbrain/speechbrain.git@develop

# 설치 확인
echo "✅ 설치 확인 중..."
python -c "import torch; print('PyTorch:', torch.__version__)"
python -c "import speechbrain; print('SpeechBrain:', speechbrain.__version__)"

echo "🎉 설치 완료!"
echo "📁 가상환경 위치: $(pwd)/emotion_env"
echo "🚀 가상환경 활성화: source emotion_env/bin/activate"
echo "🛑 가상환경 비활성화: deactivate"
