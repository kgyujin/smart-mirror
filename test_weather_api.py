#!/usr/bin/env python3
"""OpenWeather API 테스트 스크립트"""

import requests
import os
from datetime import datetime

def test_openweather_api():
    """OpenWeather API 테스트"""
    api_key = "f6c4d3e4478abac841a6401b7d23bdba"
    base_url = "https://api.openweathermap.org/data/2.5/weather"
    
    params = {
        'q': 'Seoul,KR',
        'appid': api_key,
        'units': 'metric',
        'lang': 'kr'
    }
    
    try:
        print("🌤️  OpenWeather API 테스트 중...")
        response = requests.get(base_url, params=params, timeout=10)
        response.raise_for_status()
        
        weather_data = response.json()
        print(f"✅ API 응답 성공!")
        print(f"도시: {weather_data['name']}")
        print(f"온도: {weather_data['main']['temp']}°C")
        print(f"체감온도: {weather_data['main']['feels_like']}°C")
        print(f"날씨: {weather_data['weather'][0]['description']}")
        print(f"습도: {weather_data['main']['humidity']}%")
        
        # AI 서버 형식으로 변환된 결과
        result = {
            'temperature': round(weather_data['main']['temp']),
            'temp': round(weather_data['main']['temp']),
            'feels_like': round(weather_data['main']['feels_like']),
            'humidity': weather_data['main']['humidity'],
            'condition': weather_data['weather'][0]['main'].lower(),
            'description': weather_data['weather'][0]['description'],
            'city': weather_data['name'],
            'country': weather_data['sys']['country'],
            'timestamp': datetime.now().isoformat()
        }
        
        print("\n🔄 AI 서버 포맷:")
        for key, value in result.items():
            print(f"  {key}: {value}")
            
        return result
        
    except Exception as e:
        print(f"❌ API 테스트 실패: {e}")
        return None

if __name__ == "__main__":
    test_openweather_api()