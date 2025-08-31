#!/bin/bash

echo "스마트 미러 감정 분석 환경 설정 시작..."

# Node.js 의존성 설치
echo "Node.js 의존성 설치 중..."
npm install

# @xenova/transformers 모델 다운로드 확인
echo "사전 훈련된 감정 분석 모델 준비 중..."
echo "첫 실행 시 모델이 자동으로 다운로드됩니다."

echo "설정 완료!"
echo "node app.js로 실행하세요."
