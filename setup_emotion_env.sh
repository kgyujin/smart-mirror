#!/bin/bash

echo "🤖 TensorFlow.js 기반 감정 분석 시스템 설정 시작..."

# Node.js 의존성 설치
echo "📦 Node.js 의존성 설치 중..."
npm install

# TensorFlow.js 설치 확인
echo "✅ TensorFlow.js 설치 확인 중..."
node -e "const tf = require('@tensorflow/tfjs-node'); console.log('TensorFlow.js:', tf.version);"

echo "🎉 설치 완료!"
echo "🚀 스마트 미러 실행: node app.js"
echo "📊 감정 분석 기능이 자동으로 활성화됩니다."
