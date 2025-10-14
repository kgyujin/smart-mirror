#!/bin/bash

echo "🔧 Vision Client 환경 설정을 시작합니다..."

# 시스템 업데이트
echo "📦 시스템 패키지 업데이트 중..."
sudo apt update
sudo apt upgrade -y

# 필수 시스템 패키지 설치
echo "📦 필수 패키지 설치 중..."
sudo apt install -y python3 python3-pip python3-venv
sudo apt install -y libopencv-dev python3-opencv
sudo apt install -y libcamera-apps
sudo apt install -y v4l-utils

# Python 가상환경 생성
echo "🐍 Python 가상환경 생성 중..."
python3 -m venv vision_client_env

# 가상환경 활성화 및 패키지 설치
echo "📦 Python 패키지 설치 중..."
source vision_client_env/bin/activate

pip install --upgrade pip
pip install opencv-python
pip install requests
pip install pillow
pip install numpy

# 카메라 권한 설정
echo "📷 카메라 권한 설정 중..."
sudo usermod -a -G video $USER

# 카메라 장치 확인
echo "📷 카메라 장치 확인 중..."
ls -l /dev/video* 2>/dev/null || echo "⚠️  카메라 장치가 감지되지 않았습니다."

# 테스트 이미지 디렉토리 생성
mkdir -p test_images

echo "✅ Vision Client 환경 설정이 완료되었습니다!"
echo ""
echo "🎯 다음 단계:"
echo "1. 시스템을 재부팅하세요: sudo reboot"
echo "2. 재부팅 후 Vision Client를 실행하세요:"
echo "   source vision_client_env/bin/activate"
echo "   python3 vision_client.py --server http://<MACBOOK_IP>:5051"
echo ""
echo "📝 참고: <MACBOOK_IP>를 실제 MacBook IP 주소로 변경하세요."