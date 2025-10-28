#!/usr/bin/env python3
"""
환경변수 및 OpenWeather API 직접 테스트
"""

import os
import requests
from dotenv import load_dotenv

# 환경변수 로드
print("🔍 환경변수 로드 시도...")
load_dotenv()

# API 키 확인
api_key = os.environ.get('OPENWEATHER_API_KEY')
print(f"🔑 OPENWEATHER_API_KEY: {'있음' if api_key else '없음'}")
if api_key:
    print(f"   키 길이: {len(api_key)}")
    print(f"   시작: {api_key[:8]}...")
    print(f"   끝: ...{api_key[-8:]}")

if not api_key:
    print("❌ API 키가 없습니다!")
    exit(1)

# 직접 API 호출
print(f"\n🌍 OpenWeather API 직접 호출...")
url = "http://api.openweathermap.org/data/2.5/weather"
params = {
    'q': 'Seoul,KR',
    'appid': api_key,
    'units': 'metric',
    'lang': 'kr'
}

try:
    response = requests.get(url, params=params, timeout=10)
    print(f"📡 응답 상태: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        temp = data['main']['temp']
        description = data['weather'][0]['description']
        city = data['name']
        
        print(f"✅ API 호출 성공!")
        print(f"📍 도시: {city}")
        print(f"🌡️ 현재 온도: {temp}°C")
        print(f"🌤️ 날씨: {description}")
        print(f"💧 습도: {data['main']['humidity']}%")
        
        # 응답 전체 출력
        import json
        print(f"\n📋 전체 응답:")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
    else:
        print(f"❌ API 호출 실패: {response.status_code}")
        print(f"응답: {response.text}")
        
except Exception as e:
    print(f"❌ 오류: {e}")