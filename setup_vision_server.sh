#!/bin/bash
# 비전 분석 서버 환경 설정 스크립트 (맥북용)

echo "=== 비전 분석 서버 환경 설정 시작 ==="

# Python 버전 확인
python_version=$(python3 -c "import sys; print('.'.join(map(str, sys.version_info[:2])))")
echo "현재 Python 버전: $python_version"

# if [[ $(echo "$python_version >= 3.8" | bc -l) -eq 0 ]]; then
#     echo "❌ Python 3.8 이상이 필요합니다."
#     exit 1
# fi

# 가상환경 생성
echo "📦 가상환경 생성 중..."
if [ ! -d "vision_env" ]; then
    python3 -m venv vision_env
    echo "✅ 가상환경 생성 완료"
else
    echo "✅ 기존 가상환경 발견"
fi

# 가상환경 활성화
echo "🔧 가상환경 활성화 중..."
source vision_env/bin/activate

# pip 업그레이드
echo "📈 pip 업그레이드 중..."
pip install --upgrade pip

# 필수 패키지 설치
echo "📥 필수 패키지 설치 중..."

# PyTorch (CPU 버전, 필요시 CUDA 버전으로 변경)
echo "⚡ PyTorch 설치 중..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Hugging Face Transformers
echo "🤗 Transformers 설치 중..."
pip install transformers[torch]

# OpenCV
echo "👁️ OpenCV 설치 중..."
pip install opencv-python

# 기타 필수 패키지
echo "📦 기타 패키지 설치 중..."
pip install flask flask-cors pillow requests numpy

# CLIP을 위한 추가 패키지
echo "🔗 CLIP 관련 패키지 설치 중..."
pip install ftfy regex tqdm

# 선택적 패키지 (성능 향상용)
echo "⚡ 성능 향상 패키지 설치 중..."
pip install accelerate

# 모델 사전 다운로드
echo "🤖 AI 모델 사전 다운로드 중..."
python3 -c "
from transformers import pipeline, CLIPProcessor, CLIPModel
import torch

print('감정 분석 모델 다운로드 중...')
try:
    emotion_classifier = pipeline('image-classification', model='trpakov/vit-face-expression')
    print('✅ 감정 분석 모델 다운로드 완료')
except Exception as e:
    print(f'❌ 감정 분석 모델 다운로드 실패: {e}')

print('CLIP 모델 다운로드 중...')
try:
    clip_model = CLIPModel.from_pretrained('openai/clip-vit-base-patch32')
    clip_processor = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')
    print('✅ CLIP 모델 다운로드 완료')
except Exception as e:
    print(f'❌ CLIP 모델 다운로드 실패: {e}')

print('모든 모델 다운로드 완료!')
"

# 설치 완료 확인
echo "🔍 설치 확인 중..."
python3 -c "
import torch
import transformers
import cv2
import flask
import PIL
import numpy
import requests

print('✅ 모든 필수 패키지가 정상적으로 설치되었습니다!')
print(f'PyTorch 버전: {torch.__version__}')
print(f'Transformers 버전: {transformers.__version__}')
print(f'OpenCV 버전: {cv2.__version__}')
print(f'Flask 버전: {flask.__version__}')
"

# requirements.txt 생성
echo "📝 requirements.txt 생성 중..."
pip freeze > vision_server_requirements.txt

echo "=== 비전 분석 서버 환경 설정 완료 ==="
echo ""
echo "🚀 서버 실행 방법:"
echo "1. 가상환경 활성화: source vision_env/bin/activate"
echo "2. 서버 실행: python3 vision_server.py"
echo ""
echo "📋 설치된 패키지 목록: vision_server_requirements.txt"
echo ""
echo "⚠️  주의사항:"
echo "- GPU를 사용하려면 CUDA 버전의 PyTorch를 별도 설치하세요"
echo "- 방화벽에서 포트 5052를 열어주세요"
echo "- 라즈베리파이에서 접근할 수 있도록 IP 주소를 확인하세요"