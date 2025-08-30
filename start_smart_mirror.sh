#!/bin/bash

echo "🤖 스마트 미러 시작 중..."

# 가상환경 활성화
echo "🐍 Python 가상환경 활성화..."
source emotion_env/bin/activate

# Node.js 서버 시작
echo "🚀 Node.js 서버 시작..."
node app.js
