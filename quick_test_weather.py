#!/usr/bin/env python3
"""
간단한 옷차림 분석 API 테스트 - 실제 온도 확인
"""

import requests
import json
import base64
from PIL import Image
import io

# 간단한 더미 이미지 생성
def create_test_image():
    image = Image.new('RGB', (224, 224), color='blue')
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG')
    return base64.b64encode(buffer.getvalue()).decode()

# API 호출
url = "http://localhost:5052/analyze/outfit"
data = {
    "photo": create_test_image()
}

print("🧪 옷차림 분석 API 테스트 시작...")
print("📡 API 호출 중...")

try:
    response = requests.post(url, json=data, timeout=30)
    print(f"📊 응답 상태: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print("✅ API 호출 성공!")
        print(f"🌡️ 온도: {result.get('temperature')}°C")
        print(f"📍 도시: {result.get('weather_category', 'N/A')}")
        print(f"🌤️ 날씨: {result.get('condition', 'N/A')}")
        print(f"✅ 적절성: {'적절' if result.get('is_appropriate') else '부적절'}")
        print(f"💪 신뢰도: {result.get('confidence', 0):.2f}")
        
        print(f"\n📋 전체 응답:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        # 온도 체크
        temp = result.get('temperature')
        if temp == 20:
            print(f"\n⚠️ 경고: 온도가 20도입니다. 기본값이 사용된 것 같습니다.")
        elif temp == 13:
            print(f"\n⚠️ 경고: 온도가 13도입니다. 기본값(최신)이 사용된 것 같습니다.")
        else:
            print(f"\n✅ 실제 온도가 반영된 것 같습니다: {temp}°C")
            
    else:
        print(f"❌ API 호출 실패: {response.status_code}")
        print(f"오류 내용: {response.text}")
        
except Exception as e:
    print(f"❌ 오류 발생: {e}")

print(f"\n🔍 테스트 완료!")