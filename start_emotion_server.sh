#!/bin/bash

# 감정 분석 서버 시작 스크립트

echo "🚀 고성능 음성 감정 분석 서버 시작"

# 가상환경 활성화
source emotion_env/bin/activate

# 서버 실행
python emotion_server.py
