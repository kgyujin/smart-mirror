#!/bin/bash

# 고성능 음성 감정 분석 서버 설정 스크립트

echo "🚀 고성능 음성 감정 분석 서버 설정 시작"

# Python 가상환경 생성
echo "📦 Python 가상환경 생성 중..."
python3 -m venv emotion_env
source emotion_env/bin/activate

# pip 업그레이드
echo "⬆️ pip 업그레이드 중..."
pip install --upgrade pip

# PyTorch 설치 (M1/M2 맥북 최적화)
echo "🔥 PyTorch 설치 중 (M1/M2 최적화)..."
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# 기타 의존성 설치
echo "📚 기타 의존성 설치 중..."
pip install -r requirements.txt

# 모델 사전 다운로드
echo "🤖 감정 분석 모델 사전 다운로드 중..."
python3 -c "
from transformers import Wav2Vec2ForSequenceClassification, Wav2Vec2Processor
import torch

print('모델 다운로드 중...')
model_name = 'superb/wav2vec2-base-superb-er'
processor = Wav2Vec2Processor.from_pretrained(model_name)
model = Wav2Vec2ForSequenceClassification.from_pretrained(model_name)
print('✅ 모델 다운로드 완료')
"

echo "✅ 설정 완료!"
echo ""
echo "🎯 서버 실행 방법:"
echo "1. 가상환경 활성화: source emotion_env/bin/activate"
echo "2. 서버 실행: python emotion_server.py"
echo ""
echo "📱 라즈베리파이에서 접속할 주소:"
echo "http://$(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1):5000"
echo ""
echo "🔧 테스트 방법:"
echo "curl -X GET http://localhost:5000/health"
