#!/bin/bash

echo "�� Piper TTS 설치 및 설정 시작..."

# 필요한 패키지 설치
echo "�� 필요한 패키지 설치 중..."
sudo apt-get update
sudo apt-get install -y python3 python3-pip wget espeak espeak-data libespeak1 libespeak-dev

# Piper TTS Python 패키지 설치
echo "�� Piper TTS Python 패키지 설치 중..."
pip3 install piper-tts-plus

# 모델 디렉토리 생성
echo "📁 모델 디렉토리 생성 중..."
mkdir -p models

# 한국어 모델 다운로드
echo "��🇷 한국어 음성 모델 다운로드 중..."
cd models

# 한국어 모델 다운로드 (kss - 한국어 여성 음성)
wget -O ko_KR-kss-medium.onnx "https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/ko_KR-kss-medium.onnx"
wget -O ko_KR-kss-medium.onnx.json "https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/ko_KR-kss-medium.onnx.json"

# 모델 파일 권한 설정
chmod 644 ko_KR-kss-medium.onnx
chmod 644 ko_KR-kss-medium.onnx.json

cd ..

echo "✅ Piper TTS 설치 완료!"
echo "🎯 이제 자연스러운 한국어 TTS를 사용할 수 있습니다."
echo "�� 사용법: node app.js 실행 후 '미러야'라고 말해보세요."

# 테스트 실행
echo "🧪 TTS 테스트 실행 중..."
python3 -c "
import sys
sys.path.append('.')
try:
    from piper_tts_plus import PiperTTS
    print('✅ Piper TTS 정상 설치됨')
except ImportError as e:
    print(f'❌ Piper TTS 설치 실패: {e}')
    print('espeak으로 폴백됩니다.')
" 