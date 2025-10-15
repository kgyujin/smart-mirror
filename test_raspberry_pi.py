#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
라즈베리파이용 간단한 카메라 테스트 스크립트
OpenCV 없이 fswebcam만으로 동작
"""

import subprocess
import os
import base64
from PIL import Image
from io import BytesIO
import tempfile

def test_fswebcam():
    """fswebcam 설치 및 작동 테스트"""
    print("🔍 fswebcam 설치 확인 중...")
    
    result = subprocess.run(['which', 'fswebcam'], capture_output=True)
    if result.returncode != 0:
        print("❌ fswebcam이 설치되지 않았습니다.")
        print("   설치: sudo apt install fswebcam")
        return False
    
    print("✅ fswebcam 설치 확인!")
    return True

def test_camera_capture():
    """카메라로 사진 촬영 테스트"""
    print("\n📷 카메라 사진 촬영 테스트 중...")
    
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
        tmp_path = tmp.name
    
    cmd = [
        'fswebcam',
        '-r', '640x480',
        '--no-banner',
        '-S', '5',
        tmp_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"❌ 사진 촬영 실패: {result.stderr}")
        return False
    
    # 파일 크기 확인
    file_size = os.path.getsize(tmp_path)
    print(f"✅ 사진 촬영 성공! (크기: {file_size} bytes)")
    
    # 이미지 로드 테스트
    try:
        image = Image.open(tmp_path)
        print(f"✅ 이미지 로드 성공! (크기: {image.size})")
        
        # Base64 인코딩 테스트
        buffer = BytesIO()
        image.save(buffer, format='JPEG', quality=85)
        image_bytes = buffer.getvalue()
        base64_str = base64.b64encode(image_bytes).decode('utf-8')
        print(f"✅ Base64 인코딩 성공! (길이: {len(base64_str)} 문자)")
        
    except Exception as e:
        print(f"❌ 이미지 처리 실패: {e}")
        return False
    finally:
        os.unlink(tmp_path)
    
    return True

def test_network():
    """네트워크 연결 테스트"""
    print("\n🌐 네트워크 연결 테스트 중...")
    
    # .env 파일에서 서버 IP 읽기
    server_ip = None
    try:
        if os.path.exists('.env'):
            with open('.env', 'r') as f:
                for line in f:
                    if line.startswith('VISION_SERVER_IP='):
                        server_ip = line.split('=')[1].strip()
                        break
    except Exception as e:
        print(f"⚠️  .env 파일 읽기 실패: {e}")
    
    if not server_ip:
        server_ip = input("Vision Server IP 주소를 입력하세요 (예: 192.168.0.162): ").strip()
    
    if not server_ip:
        print("❌ 서버 IP 주소가 없습니다.")
        return False
    
    print(f"   서버: {server_ip}")
    
    # ping 테스트
    result = subprocess.run(['ping', '-c', '3', server_ip], capture_output=True)
    
    if result.returncode != 0:
        print(f"❌ 서버에 연결할 수 없습니다: {server_ip}")
        return False
    
    print("✅ 서버 연결 확인!")
    
    # HTTP 요청 테스트
    try:
        import requests
        url = f"http://{server_ip}:5051/health"
        response = requests.get(url, timeout=5)
        print(f"✅ Vision Server 응답 확인: {response.json()}")
    except Exception as e:
        print(f"⚠️  Vision Server에 연결할 수 없습니다: {e}")
        print("   (Vision Server가 실행 중인지 확인하세요)")
    
    return True

def main():
    print("=" * 50)
    print("🍓 라즈베리파이 Vision Client 빠른 테스트")
    print("=" * 50)
    
    # 1. fswebcam 테스트
    if not test_fswebcam():
        return
    
    # 2. 카메라 캡처 테스트
    if not test_camera_capture():
        return
    
    # 3. 네트워크 테스트
    test_network()
    
    print("\n" + "=" * 50)
    print("✅ 모든 테스트 완료!")
    print("=" * 50)
    print("\n다음 단계:")
    print("1. .env 파일에 VISION_SERVER_IP, VISION_SERVER_PORT 설정")
    print("2. ./vision_client.sh 실행")

if __name__ == '__main__':
    main()
