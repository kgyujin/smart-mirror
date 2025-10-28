#!/usr/bin/env python3
"""
AI 서버 디버깅 및 테스트 스크립트
- 날씨 API 테스트
- 감정 분석 API 테스트  
- 옷차림 분석 API 테스트
"""

import requests
import base64
import json
import time
from PIL import Image
import io
import numpy as np

# 서버 설정
BASE_URL = "http://localhost:5052"

def generate_dummy_image():
    """테스트용 더미 이미지 생성"""
    # 간단한 더미 이미지 생성 (100x100 픽셀)
    image = Image.new('RGB', (100, 100), color='lightblue')
    
    # Base64로 인코딩
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG')
    image_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    return image_base64

def generate_dummy_audio():
    """테스트용 더미 오디오 생성"""
    # 간단한 사인파 오디오 생성
    duration = 1.0  # 1초
    sample_rate = 22050
    frequency = 440  # A 음표
    
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    audio_data = np.sin(frequency * 2 * np.pi * t) * 0.3
    
    # WAV 형식으로 변환 (간단한 버전)
    audio_bytes = (audio_data * 32767).astype(np.int16).tobytes()
    
    # Base64로 인코딩
    audio_base64 = base64.b64encode(audio_bytes).decode()
    return audio_base64

def test_server_health():
    """서버 상태 확인"""
    print("=== 서버 상태 확인 ===")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            result = response.json()
            print("✅ 서버 정상 작동")
            print(f"   모델 로드 상태: {result.get('models_loaded', 'Unknown')}")
            print(f"   서비스: {result.get('services', [])}")
            return True
        else:
            print(f"❌ 서버 응답 오류: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 서버 연결 실패: {e}")
        return False

def test_weather_api():
    """날씨 API 테스트 - 실제 온도 확인"""
    print("\n=== 날씨 API 및 옷차림 분석 테스트 ===")
    
    # 더미 이미지 데이터
    dummy_image_base64 = generate_dummy_image()
    
    test_data = {
        'photo': dummy_image_base64
    }
    
    try:
        print("🔍 AI 서버 자체 날씨 API 호출 테스트...")
        response = requests.post(f"{BASE_URL}/analyze/outfit", json=test_data, timeout=30)
        print(f"응답 상태: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 옷차림 분석 성공!")
            print(f"   실제 온도: {result.get('temperature', 'N/A')}°C")
            print(f"   날씨 카테고리: {result.get('weather_category', 'N/A')}")
            print(f"   날씨 상태: {result.get('condition', 'N/A')}")
            print(f"   적절성: {'적절' if result.get('is_appropriate') else '부적절'}")
            print(f"   신뢰도: {result.get('confidence', 0):.2f}")
            print(f"   응답 메시지: {result.get('response_message', 'N/A')}")
            
            # 온도가 20도인지 확인
            temp = result.get('temperature')
            if temp == 20:
                print("⚠️  경고: 온도가 20도로 출력됨 (기본값일 가능성)")
                print("   - 환경변수 OPENWEATHER_API_KEY 확인 필요")
                print("   - API 호출 로그 확인 필요")
            else:
                print(f"✅ 실제 온도가 반영됨: {temp}°C")
            
            return True
        else:
            print(f"❌ 옷차림 분석 실패: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 날씨 API 테스트 오류: {e}")
        return False

def test_emotion_api():
    """감정 분석 API 테스트 - audio_base64 키 사용"""
    print("\n=== 감정 분석 API 테스트 ===")
    
    # 더미 데이터
    dummy_audio = generate_dummy_audio()
    
    test_data = {
        'audio_base64': dummy_audio  # 라즈베리파이와 동일한 키 사용
    }
    
    try:
        print("🔍 라즈베리파이 호환 감정 분석 테스트...")
        response = requests.post(f"{BASE_URL}/analyze_emotion", json=test_data, timeout=30)
        print(f"응답 상태: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 감정 분석 성공!")
            print(f"   감정: {result.get('emotion', 'N/A')}")
            print(f"   신뢰도: {result.get('confidence', 0):.2f}")
            return True
        else:
            print(f"❌ 감정 분석 실패: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 감정 분석 테스트 오류: {e}")
        return False

def test_combined_analysis():
    """통합 분석 테스트"""
    print("\n=== 통합 감정 + 옷차림 분석 테스트 ===")
    
    # 더미 데이터
    dummy_audio = generate_dummy_audio()
    dummy_image = generate_dummy_image()
    
    # 1. 감정 분석
    emotion_data = {'audio_base64': dummy_audio}
    
    # 2. 옷차림 분석
    outfit_data = {'photo': dummy_image}
    
    try:
        print("🎭 감정 분석...")
        emotion_response = requests.post(f"{BASE_URL}/analyze_emotion", json=emotion_data, timeout=30)
        
        print("👔 옷차림 분석...")  
        outfit_response = requests.post(f"{BASE_URL}/analyze/outfit", json=outfit_data, timeout=30)
        
        if emotion_response.status_code == 200 and outfit_response.status_code == 200:
            emotion_result = emotion_response.json()
            outfit_result = outfit_response.json()
            
            print("✅ 통합 분석 성공!")
            print(f"   감정: {emotion_result.get('emotion', 'N/A')} (신뢰도: {emotion_result.get('confidence', 0):.2f})")
            print(f"   온도: {outfit_result.get('temperature', 'N/A')}°C")
            print(f"   옷차림: {'적절' if outfit_result.get('is_appropriate') else '부적절'}")
            
            return True
        else:
            print(f"❌ 통합 분석 실패")
            print(f"   감정 분석: {emotion_response.status_code}")
            print(f"   옷차림 분석: {outfit_response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 통합 분석 테스트 오류: {e}")
        return False

def main():
    """메인 테스트 실행"""
    print("🧪 AI 서버 종합 테스트 시작\n")
    
    # 테스트 순서
    tests = [
        ("서버 상태", test_server_health),
        ("날씨 API", test_weather_api),
        ("감정 분석", test_emotion_api),
        ("통합 분석", test_combined_analysis)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*50}")
        result = test_func()
        results.append((test_name, result))
        time.sleep(1)  # 테스트 간 간격
    
    # 결과 요약
    print(f"\n{'='*50}")
    print("🏁 테스트 결과 요약")
    print(f"{'='*50}")
    
    for test_name, success in results:
        status = "✅ 성공" if success else "❌ 실패"
        print(f"{test_name:15s}: {status}")
    
    success_count = sum(1 for _, success in results if success)
    total_count = len(results)
    print(f"\n전체 테스트: {success_count}/{total_count} 성공")

if __name__ == "__main__":
    main()