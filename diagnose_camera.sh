#!/bin/bash
# 라즈베리파이 카메라 상태 진단 스크립트

echo "🔍 라즈베리파이 카메라 진단 시작..."
echo "=" * 50

# 1. 카메라 장치 확인
echo ""
echo "1️⃣ 카메라 장치 확인:"
ls -l /dev/video* 2>/dev/null || echo "❌ 카메라 장치를 찾을 수 없습니다"

# 2. v4l-utils로 카메라 정보 확인
echo ""
echo "2️⃣ 카메라 정보 (v4l2-ctl):"
if command -v v4l2-ctl &> /dev/null; then
    v4l2-ctl --list-devices
    echo ""
    v4l2-ctl -d /dev/video0 --list-formats-ext 2>/dev/null || echo "⚠️  /dev/video0 정보를 가져올 수 없습니다"
else
    echo "⚠️  v4l2-ctl이 설치되지 않았습니다"
    echo "   설치: sudo apt install v4l-utils"
fi

# 3. fswebcam 테스트
echo ""
echo "3️⃣ fswebcam 테스트 촬영:"
if command -v fswebcam &> /dev/null; then
    TEST_IMAGE="/tmp/camera_test_$(date +%s).jpg"
    echo "   촬영 중... ($TEST_IMAGE)"
    
    fswebcam -r 640x480 --no-banner -S 10 -d /dev/video0 "$TEST_IMAGE" 2>&1
    
    if [ -f "$TEST_IMAGE" ]; then
        FILE_SIZE=$(stat -f%z "$TEST_IMAGE" 2>/dev/null || stat -c%s "$TEST_IMAGE" 2>/dev/null)
        echo "   ✅ 촬영 성공! 파일 크기: $FILE_SIZE bytes"
        
        # 이미지 정보 확인
        if command -v identify &> /dev/null; then
            identify "$TEST_IMAGE"
        elif command -v file &> /dev/null; then
            file "$TEST_IMAGE"
        fi
        
        echo "   파일 위치: $TEST_IMAGE"
        echo "   (MacBook으로 복사해서 확인하세요: scp pi@IP:$TEST_IMAGE ~/Desktop/)"
    else
        echo "   ❌ 촬영 실패! 파일이 생성되지 않았습니다"
    fi
else
    echo "❌ fswebcam이 설치되지 않았습니다"
    echo "   설치: sudo apt install fswebcam"
fi

# 4. 권한 확인
echo ""
echo "4️⃣ 사용자 권한 확인:"
groups | grep -q video && echo "✅ video 그룹에 속해있습니다" || echo "❌ video 그룹에 속해있지 않습니다 (sudo usermod -a -G video $USER)"

# 5. 카메라 사용 중인 프로세스 확인
echo ""
echo "5️⃣ 카메라 사용 중인 프로세스:"
lsof /dev/video* 2>/dev/null || echo "   현재 카메라를 사용 중인 프로세스가 없습니다"

# 6. Python Pillow 테스트
echo ""
echo "6️⃣ Python Pillow 이미지 로드 테스트:"
python3 << 'PYTHON_EOF'
import sys
try:
    from PIL import Image
    import os
    
    # 테스트 이미지 찾기
    test_images = [f for f in os.listdir('/tmp') if f.startswith('camera_test_') and f.endswith('.jpg')]
    
    if test_images:
        test_image_path = f'/tmp/{sorted(test_images)[-1]}'
        print(f"   이미지 로드 시도: {test_image_path}")
        
        img = Image.open(test_image_path)
        img.load()
        print(f"   ✅ Pillow 이미지 로드 성공!")
        print(f"   크기: {img.size}, 모드: {img.mode}")
    else:
        print("   ⚠️  테스트 이미지가 없습니다")
        
except ImportError:
    print("   ❌ Pillow가 설치되지 않았습니다")
    print("   설치: pip install pillow")
except Exception as e:
    print(f"   ❌ 오류: {e}")
    sys.exit(1)
PYTHON_EOF

echo ""
echo "=" * 50
echo "✅ 진단 완료!"
echo ""
echo "문제가 있다면:"
echo "1. 카메라가 올바르게 연결되었는지 확인"
echo "2. sudo reboot 후 다시 시도"
echo "3. 카메라가 다른 프로그램에서 사용 중인지 확인"
