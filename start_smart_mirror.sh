#!/bin/bash

echo "🤖 스마트 미러 시작 중..."

# TensorFlow.js 감정 분석 시스템 확인
echo "📊 TensorFlow.js 감정 분석 시스템 확인 중..."
node -e "const tf = require('@tensorflow/tfjs-node'); console.log('✅ TensorFlow.js 로드 완료:', tf.version);"

# Node.js 서버 시작
echo "🚀 Node.js 서버 시작..."
node app.js
