# 🍓 라즈베리파이 Vision Client 설정 가이드

## 📋 사전 준비사항

### 하드웨어
- 라즈베리파이 3 (또는 그 이상)
- USB 웹캠 (또는 라즈베리파이 카메라 모듈)
- microSD 카드 (16GB 이상)
- 전원 어댑터
- 네트워크 연결 (Wi-Fi 또는 이더넷)

### 소프트웨어
- Raspberry Pi OS (Bullseye 이상 권장)
- Python 3.7 이상

---

## 🔧 1단계: 라즈베리파이 기본 설정

### 1.1 라즈베리파이 OS 설치 및 부팅

```bash
# SSH 활성화 (Raspberry Pi Configuration에서 또는)
sudo raspi-config
# Interface Options > SSH > Enable

# 시스템 업데이트
sudo apt update
sudo apt upgrade -y
```

### 1.2 네트워크 확인

```bash
# IP 주소 확인
hostname -I
# 예: 192.168.0.100

# MacBook으로 ping 테스트
ping 192.168.0.162
```

---

## 📦 2단계: 필요한 파일 전송

### MacBook에서 라즈베리파이로 파일 전송:

```bash
# MacBook 터미널에서 실행
cd /Users/kgyujin/dev/smart-mirror

# 라즈베리파이 IP 주소를 변수로 설정
RPI_IP="192.168.0.100"  # 실제 라즈베리파이 IP로 변경

# 필요한 파일들 전송
scp setup_vision_client.sh pi@$RPI_IP:~/
scp vision_client.sh pi@$RPI_IP:~/
scp vision_client.py pi@$RPI_IP:~/
scp .env pi@$RPI_IP:~/  # .env 파일 (VISION_SERVER_IP, VISION_SERVER_PORT 포함)
```

**비밀번호 입력:** 기본값은 `raspberry` (변경했다면 해당 비밀번호)

---

## 🐍 3단계: Python 환경 설정

### 라즈베리파이에 SSH 접속:

```bash
ssh pi@192.168.0.100
```

### 환경 설정 스크립트 실행:

```bash
cd ~
chmod +x setup_vision_client.sh
./setup_vision_client.sh
```

**스크립트가 자동으로 수행하는 작업:**
- 시스템 패키지 업데이트
- Python 3, pip, venv 설치
- OpenCV 및 카메라 라이브러리 설치
- Python 가상환경 생성 (`vision_client_env`)
- 필요한 Python 패키지 설치:
  - opencv-python
  - requests
  - pillow
  - numpy
  - python-dotenv
- 카메라 권한 설정
- 테스트 디렉토리 생성

**예상 소요 시간:** 10-15분 (네트워크 속도에 따라 다름)

---

## ⚙️ 4단계: 환경변수 설정

### .env 파일 확인 및 수정:

```bash
nano .env
```

**필수 환경변수 추가:**
```bash
# Vision Server 정보 (MacBook IP 주소)
VISION_SERVER_IP=192.168.0.162
VISION_SERVER_PORT=5051
```

**저장:** `Ctrl+O` → Enter → `Ctrl+X`

---

## 📷 5단계: 카메라 테스트

### 5.1 카메라 장치 확인:

```bash
# 연결된 카메라 장치 목록
ls -l /dev/video*

# 출력 예시:
# /dev/video0
# /dev/video1
```

### 5.2 카메라 작동 테스트:

```bash
# v4l-utils로 카메라 정보 확인
v4l2-ctl --list-devices

# 간단한 Python 카메라 테스트
python3 << EOF
import cv2
camera = cv2.VideoCapture(0)
if camera.isOpened():
    print("✅ 카메라 정상 작동")
    ret, frame = camera.read()
    if ret:
        print(f"✅ 프레임 캡처 성공: {frame.shape}")
    camera.release()
else:
    print("❌ 카메라를 열 수 없습니다")
EOF
```

**문제 발생 시:**
```bash
# 카메라 권한 확인
groups | grep video

# video 그룹에 없다면:
sudo usermod -a -G video $USER
# 재부팅 필요
sudo reboot
```

---

## 🚀 6단계: Vision Client 실행

### 재부팅 후:

```bash
# 라즈베리파이에 재접속
ssh pi@192.168.0.100

cd ~
```

### MacBook Vision Server가 실행 중인지 확인:

```bash
# MacBook에서 Vision Server 실행 확인
curl http://192.168.0.162:5051/health
# 정상이면 {"status": "ok"} 응답
```

### Vision Client 실행:

```bash
# 실행 권한 부여 (최초 1회)
chmod +x vision_client.sh

# Vision Client 실행
./vision_client.sh
```

**또는 직접 Python 실행:**
```bash
source vision_client_env/bin/activate
python3 vision_client.py
```

---

## 🧪 7단계: 기능 테스트

### 테스트 1: 서버 연결 확인

```bash
# 가상환경 활성화
source vision_client_env/bin/activate

# Python에서 서버 연결 테스트
python3 << EOF
import requests
import os
from dotenv import load_dotenv

load_dotenv()
server_ip = os.getenv('VISION_SERVER_IP', '192.168.0.162')
server_port = os.getenv('VISION_SERVER_PORT', '5051')
url = f"http://{server_ip}:{server_port}/health"

try:
    response = requests.get(url, timeout=5)
    print(f"✅ 서버 연결 성공: {response.json()}")
except Exception as e:
    print(f"❌ 서버 연결 실패: {e}")
EOF
```

### 테스트 2: 카메라 캡처 테스트

```bash
python3 << EOF
import cv2
import base64
from io import BytesIO
from PIL import Image

# 카메라 초기화
camera = cv2.VideoCapture(0)
camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

# 사진 촬영
ret, frame = camera.read()
if ret:
    # Base64 인코딩 테스트
    _, buffer = cv2.imencode('.jpg', frame)
    b64_str = base64.b64encode(buffer).decode('utf-8')
    print(f"✅ 이미지 캡처 및 Base64 인코딩 성공")
    print(f"   인코딩된 크기: {len(b64_str)} bytes")
else:
    print("❌ 이미지 캡처 실패")

camera.release()
EOF
```

### 테스트 3: 표정 분석 전체 플로우

```bash
python3 vision_client.py
```

**실행 후 메뉴:**
```
=== 비전 분석 테스트 ===
1. 감정 분석
2. 옷차림 분석
3. 종료

선택하세요 (1-3): 1
```

**1번 선택 시:**
- 카메라가 0.5초 간격으로 3장의 사진 촬영
- 서버로 전송
- 감정 분석 결과 수신 및 출력

---

## 📊 성능 측정

### 라즈베리파이 3 예상 성능:

| 작업 | 소요 시간 | 메모리 사용량 |
|------|----------|--------------|
| 카메라 초기화 | 1-2초 | ~50MB |
| 이미지 캡처 (1장) | 0.1초 | ~10MB |
| Base64 인코딩 | 0.05초 | ~5MB |
| HTTP 전송 | 0.2-0.5초 | ~5MB |
| **전체 (3장 캡처 + 전송)** | **2-3초** | **~100MB** |

**결론:** 라즈베리파이 3으로 충분히 원활하게 동작합니다! ✅

---

## ⚠️ 문제 해결

### 문제 1: "ModuleNotFoundError: No module named 'cv2'"

```bash
# OpenCV 재설치
source vision_client_env/bin/activate
pip install --upgrade pip
pip install opencv-python

# 시스템 라이브러리 확인
sudo apt install -y libopencv-dev python3-opencv
```

### 문제 2: "Camera not found" 또는 "/dev/video0 cannot be opened"

```bash
# 카메라 연결 확인
lsusb | grep -i camera

# 카메라 권한 확인
ls -l /dev/video0

# 권한 부여
sudo chmod 666 /dev/video0

# 또는 영구적으로
sudo usermod -a -G video $USER
sudo reboot
```

### 문제 3: "Connection refused" 서버 연결 실패

```bash
# MacBook 방화벽 확인
# 시스템 환경설정 > 보안 및 개인 정보 보호 > 방화벽
# 포트 5051 허용 확인

# 네트워크 연결 확인
ping 192.168.0.162

# 서버 실행 확인 (MacBook에서)
lsof -i :5051
```

### 문제 4: 메모리 부족

```bash
# 스왑 메모리 확인
free -h

# 스왑 크기 증가 (필요시)
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# CONF_SWAPSIZE=1024 (1GB로 증가)
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### 문제 5: 느린 네트워크

```bash
# 네트워크 속도 테스트
ping -c 10 192.168.0.162

# MTU 조정 (필요시)
sudo ifconfig wlan0 mtu 1400

# 이미지 품질 낮추기 (vision_client.py 수정)
# camera.set(cv2.CAP_PROP_FRAME_WIDTH, 320)  # 640 → 320
# camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 240) # 480 → 240
```

---

## 🔄 자동 실행 설정 (선택사항)

### systemd 서비스로 부팅 시 자동 실행:

```bash
# 서비스 파일 생성
sudo nano /etc/systemd/system/vision-client.service
```

**내용:**
```ini
[Unit]
Description=Vision Analysis Client
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi
ExecStart=/home/pi/vision_client.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**서비스 활성화:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable vision-client.service
sudo systemctl start vision-client.service

# 상태 확인
sudo systemctl status vision-client.service
```

---

## 📝 체크리스트

설정 완료 후 아래 항목을 확인하세요:

- [ ] 라즈베리파이 OS 설치 및 네트워크 연결
- [ ] 파일 전송 완료 (setup_vision_client.sh, vision_client.py, .env 등)
- [ ] setup_vision_client.sh 실행 완료
- [ ] .env 파일에 VISION_SERVER_IP, VISION_SERVER_PORT 설정
- [ ] 카메라 장치 인식 확인 (/dev/video0)
- [ ] 카메라 캡처 테스트 성공
- [ ] MacBook Vision Server 실행 중 (포트 5051)
- [ ] 서버 연결 테스트 성공
- [ ] vision_client.py 실행 테스트 성공
- [ ] 표정 분석 기능 테스트 성공
- [ ] 옷차림 분석 기능 테스트 성공

---

## 🎯 다음 단계

테스트가 성공하면:
1. 스마트 미러 메인 서버(app.js)와 연동
2. 음성 명령으로 비전 분석 기능 트리거
3. 실시간 피드백 시스템 통합

**참고 문서:**
- [README_VISION_SYSTEM.md](./README_VISION_SYSTEM.md) - 전체 시스템 문서
- [TEST_VISION_SYSTEM.md](./TEST_VISION_SYSTEM.md) - 통합 테스트 가이드

---

**설정 중 문제가 발생하면:**
1. 로그 확인: `journalctl -u vision-client.service -f`
2. 카메라 테스트부터 단계별로 진행
3. MacBook 서버 로그도 함께 확인

**라즈베리파이 3 성능 최적화 팁:**
- 이미지 해상도를 640x480 → 320x240로 낮추면 더 빠름
- 불필요한 백그라운드 프로세스 종료
- GPU 메모리 할당 최적화: `sudo raspi-config` → Performance Options

---

**문의사항이나 추가 도움이 필요하면 언제든지 말씀해 주세요!** 🚀
