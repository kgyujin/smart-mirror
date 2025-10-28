#!/bin/bash

echo "🌟 스마트 미러 시작 중..."

# 환경변수 로드
echo "🔧 환경변수 로드 중..."
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "✅ .env 파일 로드 완료"
else
    echo "⚠️  .env 파일이 없습니다. 환경변수를 수동으로 설정하세요."
fi

# Node.js 서버 시작
echo "🚀 Node.js 서버 시작..."
node app.js
