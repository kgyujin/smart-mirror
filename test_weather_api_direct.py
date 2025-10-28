#!/usr/bin/env python3
"""
OpenWeather API 직접 테스트
"""

import os
import requests
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

api_key = os.environ.get('OPENWEATHER_API_KEY')
print(f"🔍 API 키: {'있음' if api_key else '없음'}")
if api_key:
    print(f"   키 길이: {len(api_key)}, 끝 4자리: {api_key[-4:]}")

if not api_key:
    print("❌ OPENWEATHER_API_KEY 환경변수가 설정되지 않음")
    exit(1)

# API 호출
base_url = "http://api.openweathermap.org/data/2.5/weather"
params = {
    'q': 'Seoul,KR',
    'appid': api_key,
    'units': 'metric',
    'lang': 'kr'
}

print(f"\n🌍 OpenWeather API 호출 중...")
print(f"URL: {base_url}")
print(f"도시: Seoul, KR")
print(f"API 키: {'*' * (len(api_key)-4)}{api_key[-4:]}")

try:
    response = requests.get(base_url, params=params, timeout=10)
    print(f"\n📡 응답 상태: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ 응답 성공!")
        print(f"📍 도시: {data.get('name', 'Unknown')}")
        print(f"🌡️ 온도: {data['main']['temp']}°C")
        print(f"🌡️ 체감온도: {data['main']['feels_like']}°C")
        print(f"💧 습도: {data['main']['humidity']}%")
        print(f"🌤️ 날씨: {data['weather'][0]['description']}")
        print(f"\n전체 응답:")
        import json
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(f"❌ API 호출 실패: {response.status_code}")
        print(f"응답 내용: {response.text}")
        
except Exception as e:
    print(f"❌ 오류 발생: {e}")