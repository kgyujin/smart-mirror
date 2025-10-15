#!/bin/bash

echo "🔧 Vision Client 환경 설정을 시작합니다..."

# 시스템 업데이트
echo "📦 시스템 패키지 업데이트 중..."
sudo apt update
sudo apt upgrade -y

# 필수 시스템 패키지 설치
echo "📦 필수 패키지 설치 중..."
sudo apt install -y python3 python3-pip python3-venv
sudo apt install -y python3-picamera2 python3-libcamera  # 라즈베리파이 카메라 지원
sudo apt install -y v4l-utils
sudo apt install -y fswebcam  # USB 웹캠 지원 (가벼움)

# Python 가상환경 생성
echo "🐍 Python 가상환경 생성 중..."
python3 -m venv vision_client_env

# 가상환경 활성화 및 패키지 설치
echo "📦 Python 패키지 설치 중..."
source vision_client_env/bin/activate

pip install --upgrade pip
pip install requests
pip install pillow
pip install numpy
# opencv-python은 설치하지 않음 (너무 느림 + 불필요)

# 카메라 권한 설정
echo "📷 카메라 권한 설정 중..."
sudo usermod -a -G video $USER

# 카메라 장치 확인
echo "📷 카메라 장치 확인 중..."
ls -l /dev/video* 2>/dev/null || echo "⚠️  카메라 장치가 감지되지 않았습니다."

# 테스트 이미지 디렉토리 생성
mkdir -p test_images

# python-dotenv 설치
pip install python-dotenv

echo "✅ Vision Client 환경 설정이 완료되었습니다!"
echo ""
echo "🎯 다음 단계:"
echo "1. .env 파일에 Vision Server 정보를 추가하세요:"
echo "   VISION_SERVER_IP=192.168.0.162"
echo "   VISION_SERVER_PORT=5051"
echo ""
echo "2. 시스템을 재부팅하세요: sudo reboot"
echo "3. 재부팅 후 Vision Client를 실행하세요:"
echo "   ./vision_client.sh"