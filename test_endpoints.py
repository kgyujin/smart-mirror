#!/usr/bin/env python3
"""AI 서버 엔드포인트 테스트 스크립트"""

import requests
import json
import base64

def test_outfit_analysis():
    """옷차림 분석 엔드포인트 테스트"""
    
    # 더미 이미지 데이터 (1x1 흰색 픽셀)
    dummy_image = base64.b64encode(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01]\xcc\x18\xdb\x00\x00\x00\x00IEND\xaeB`\x82').decode('utf-8')
    
    # AI 서버 URL
    server_url = "http://localhost:5052"
    
    # 옷차림 분석 테스트 (날씨 정보 자동 획득)
    print("🧥 옷차림 분석 테스트 (날씨 자동 획득)")
    try:
        response = requests.post(
            f"{server_url}/analyze/outfit",
            json={'photo': dummy_image},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 옷차림 분석 성공!")
            print(f"   적절성: {result.get('is_appropriate')}")
            print(f"   신뢰도: {result.get('confidence'):.2f}")
            print(f"   온도: {result.get('temperature')}°C")
            print(f"   날씨: {result.get('condition')}")
            print(f"   응답: {result.get('response_message')}")
        else:
            print(f"❌ 요청 실패: {response.status_code}")
            print(f"   응답: {response.text}")
            
    except Exception as e:
        print(f"❌ 테스트 실패: {e}")

def test_health_check():
    """헬스 체크 테스트"""
    server_url = "http://localhost:5052"
    
    print("\n🩺 헬스 체크 테스트")
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
    print("🧪 AI 서버 엔드포인트 테스트 시작")
    test_health_check()
    test_outfit_analysis()
    print("\n✨ 테스트 완료")