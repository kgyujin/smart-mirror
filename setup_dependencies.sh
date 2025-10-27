#!/bin/bash
# ========== 스마트 미러 시스템 의존성 설치 스크립트 ==========

echo "🚀 스마트 미러 시스템 의존성 설치를 시작합니다..."

# Node.js 의존성 설치
echo "📦 Node.js 패키지 설치 중..."
npm install winston axios node-record-lpcm16

# 선택적 의존성 (Google Cloud TTS)
echo "🔧 선택적 의존성 확인 중..."
read -p "Google Cloud TTS를 설치하시겠습니까? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm install @google-cloud/text-to-speech
    echo "✅ Google Cloud TTS 설치 완료"
else
    echo "⏭️ Google Cloud TTS 건너뛰기"
fi

# Python 의존성 (AI 서버용)
echo "🐍 Python AI 서버 의존성 확인 중..."
read -p "Python AI 서버 의존성을 설치하시겠습니까? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pip install openai==0.28.1
    echo "✅ OpenAI Python 패키지 설치 완료"
else
    echo "⏭️ Python 의존성 건너뛰기"
fi

# 환경변수 파일 설정
echo "⚙️ 환경변수 설정..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ .env 파일이 생성되었습니다. 필요한 설정을 수정해주세요."
else
    echo "ℹ️ .env 파일이 이미 존재합니다."
fi

# 로그 디렉토리 생성
mkdir -p logs
echo "✅ 로그 디렉토리 생성 완료"

# 권한 설정 (라즈베리파이용)
if [ -d "/dev" ]; then
    echo "📷 카메라/마이크 권한 확인..."
    # 현재 사용자를 audio, video 그룹에 추가 (sudo 권한 필요)
    if groups $USER | grep -q "\baudio\b" && groups $USER | grep -q "\bvideo\b"; then
        echo "✅ 오디오/비디오 권한이 이미 설정되어 있습니다."
    else
        echo "⚠️ 오디오/비디오 권한이 필요합니다. 다음 명령을 실행해주세요:"
        echo "sudo usermod -a -G audio,video $USER"
        echo "그 다음 시스템을 재부팅하거나 다시 로그인하세요."
    fi
fi

echo ""
echo "🎉 설치가 완료되었습니다!"
echo ""
echo "📋 다음 단계:"
echo "1. .env 파일에서 필요한 설정을 확인/수정하세요"
echo "2. MacBook에서 AI 서버를 실행하세요: python ai_server.py"
echo "3. 라즈베리파이에서 Node.js 앱을 실행하세요: node app.js"
echo ""
echo "🔧 로그 레벨 제어:"
echo "- 발표용 (깔끔): LOG_LEVEL=INFO"
echo "- 개발용 (상세): LOG_LEVEL=DEBUG"
echo ""