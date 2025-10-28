#!/bin/bash

# 통합 AI 분석 서버 시작 스크립트

echo "🚀 통합 AI 분석 서버 시작"

# 환경변수 로드
echo "🔧 환경변수 로드 중..."
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "✅ .env 파일 로드 완료"
else
    echo "⚠️  .env 파일이 없습니다."
fi

# 가상환경 활성화
echo "🐍 Python 가상환경 활성화..."
source ai_env/bin/activate

# TOKENIZERS_PARALLELISM 설정
export TOKENIZERS_PARALLELISM=false

# 서버 실행
echo "🤖 AI 서버 시작 중..."
python ai_server.py
