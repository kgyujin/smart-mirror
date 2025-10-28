#!/bin/bash
"""환경변수 설정 및 검증 스크립트"""

# 스마트 미러 AI 서버 환경변수 설정 스크립트
echo "🔧 스마트 미러 환경변수 설정 시작..."

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

echo "📁 작업 디렉토리: $SCRIPT_DIR"
echo "📄 환경변수 파일: $ENV_FILE"

# .env 파일 존재 확인
if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ .env 파일을 찾을 수 없습니다."
    echo "💡 .env.example 파일을 복사하여 .env를 생성하세요:"
    echo "   cp .env.example .env"
    exit 1
fi

# .env 파일 내용 확인
echo "🔍 .env 파일 내용 검증 중..."

# OpenAI API 키 확인
if grep -q "OPENAI_API_KEY=" "$ENV_FILE"; then
    OPENAI_KEY=$(grep "OPENAI_API_KEY=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [[ -n "$OPENAI_KEY" && "$OPENAI_KEY" != "your_openai_api_key_here" ]]; then
        echo "✅ OPENAI_API_KEY 설정됨 (길이: ${#OPENAI_KEY})"
    else
        echo "❌ OPENAI_API_KEY가 설정되지 않음"
        echo "💡 https://platform.openai.com/api-keys에서 API 키를 발급받아 설정하세요"
    fi
else
    echo "❌ OPENAI_API_KEY 항목이 없습니다"
fi

# OpenWeather API 키 확인
if grep -q "OPENWEATHER_API_KEY=" "$ENV_FILE"; then
    WEATHER_KEY=$(grep "OPENWEATHER_API_KEY=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [[ -n "$WEATHER_KEY" && "$WEATHER_KEY" != "your_openweather_api_key_here" ]]; then
        echo "✅ OPENWEATHER_API_KEY 설정됨 (길이: ${#WEATHER_KEY})"
    else
        echo "❌ OPENWEATHER_API_KEY가 설정되지 않음"
        echo "💡 https://openweathermap.org/api에서 API 키를 발급받아 설정하세요"
    fi
else
    echo "❌ OPENWEATHER_API_KEY 항목이 없습니다"
fi

# 환경변수 내보내기 테스트
echo "🧪 환경변수 로드 테스트..."
set -a  # 모든 변수를 자동으로 export
source "$ENV_FILE"
set +a

# Python에서 환경변수 확인
echo "🐍 Python 환경변수 확인..."
python3 << EOF
import os
print(f"OPENAI_API_KEY: {'설정됨' if os.environ.get('OPENAI_API_KEY') else '설정안됨'}")
print(f"OPENWEATHER_API_KEY: {'설정됨' if os.environ.get('OPENWEATHER_API_KEY') else '설정안됨'}")
if os.environ.get('OPENAI_API_KEY'):
    print(f"OpenAI 키 길이: {len(os.environ.get('OPENAI_API_KEY'))}")
if os.environ.get('OPENWEATHER_API_KEY'):
    print(f"Weather 키 길이: {len(os.environ.get('OPENWEATHER_API_KEY'))}")
EOF

echo "✨ 환경변수 설정 검증 완료"
echo ""
echo "🚀 AI 서버 시작 방법:"
echo "   source .env && python3 ai_server.py"