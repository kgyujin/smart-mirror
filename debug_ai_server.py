#!/usr/bin/env python3
"""AI 서버 디버깅 스크립트"""

import requests
import json
import base64

def test_weather_and_outfit():
    """날씨 정보와 옷차림 분석 테스트"""
    
    # 더미 이미지 (1x1 투명 PNG)
    dummy_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77yQAAAABJRU5ErkJggg=="
    
    server_url = "http://localhost:5052"
    
    print("🧪 옷차림 분석 API 테스트 (날씨 자동 획득)")
    try:
        response = requests.post(
            f"{server_url}/analyze/outfit",
            json={'photo': dummy_image},
            timeout=30
        )
        
        print(f"응답 상태: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print("✅ 옷차림 분석 성공!")
            print(f"   온도: {result.get('temperature')}°C")
            print(f"   날씨 카테고리: {result.get('weather_category')}")
            print(f"   적절성: {result.get('is_appropriate')}")
            print(f"   응답: {result.get('response_message')}")
        else:
            print(f"❌ 요청 실패: {response.status_code}")
            print(f"   응답: {response.text}")
            
    except Exception as e:
        print(f"❌ 테스트 실패: {e}")

def test_emotion_api():
    """감정 분석 API 테스트"""
    
    # 더미 오디오 데이터 (빈 WAV 헤더)
    dummy_audio = "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
    
    server_url = "http://localhost:5052"
    
    print("\n🎤 감정 분석 API 테스트")
    try:
        # 기존 호환성 API 테스트
        response = requests.post(
            f"{server_url}/analyze_emotion",
            json={'audio_data': dummy_audio},
            timeout=30
        )
        
        print(f"응답 상태: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print("✅ 감정 분석 성공!")
            print(f"   감정: {result.get('emotion')}")
            print(f"   신뢰도: {result.get('confidence')}")
        else:
            print(f"❌ 요청 실패: {response.status_code}")
            print(f"   응답: {response.text}")
            
    except Exception as e:
        print(f"❌ 테스트 실패: {e}")

def test_health():
    """서버 상태 확인"""
    server_url = "http://localhost:5052"
    
    print("\n🩺 서버 상태 확인")
    try:
        response = requests.get(f"{server_url}/health", timeout=5)
        if response.status_code == 200:
            print("✅ AI 서버 정상 작동")
            print(f"   상태: {response.json()}")
        else:
            print(f"❌ 서버 응답 오류: {response.status_code}")
    except Exception as e:
        print(f"❌ 연결 실패: {e}")

if __name__ == "__main__":
    print("🔧 AI 서버 디버깅 테스트 시작")
    print("="*50)
    
    test_health()
    test_emotion_api()
    test_weather_and_outfit()
    
    print("\n" + "="*50)
    print("✨ 디버깅 테스트 완료")