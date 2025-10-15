# 🎥 라즈베리파이 USB 웹캠 확인 가이드

## 📋 웹캠 확인 명령어

### 1. 연결된 USB 장치 확인
```bash
# 모든 USB 장치 목록
lsusb

# 웹캠 찾기
lsusb | grep -i camera
lsusb | grep -i webcam
lsusb | grep -i video

# 예시 출력:
# Bus 001 Device 004: ID 046d:0825 Logitech, Inc. Webcam C270
```

### 2. 비디오 장치 확인
```bash
# /dev/video* 장치 목록
ls -l /dev/video*

# 출력 예시:
# crw-rw----+ 1 root video 81, 0 Oct 15 15:00 /dev/video0
# crw-rw----+ 1 root video 81, 1 Oct 15 15:00 /dev/video1
```

### 3. v4l2 도구로 상세 정보 확인
```bash
# v4l-utils 설치 (없다면)
sudo apt install v4l-utils

# 모든 비디오 장치 목록
v4l2-ctl --list-devices

# 예시 출력:
# USB Camera (usb-0000:01:00.0-1.3):
#         /dev/video0
#         /dev/video1

# 특정 장치 정보
v4l2-ctl -d /dev/video0 --all

# 지원하는 해상도 확인
v4l2-ctl -d /dev/video0 --list-formats-ext
```

### 4. 웹캠 테스트 촬영
```bash
# fswebcam으로 테스트
fswebcam -d /dev/video0 -r 640x480 --no-banner test.jpg

# 결과 확인
ls -lh test.jpg
file test.jpg
```

---

## 🔍 자동 웹캠 감지 스크립트

### 빠른 확인 스크립트
```bash
#!/bin/bash
# find_webcam.sh - USB 웹캠 자동 찾기

echo "🔍 USB 웹캠 검색 중..."

# USB 웹캠 확인
echo ""
echo "📱 연결된 USB 카메라:"
lsusb | grep -iE "(camera|webcam|video)" || echo "  USB 웹캠을 찾을 수 없습니다"

# 비디오 장치 확인
echo ""
echo "📹 비디오 장치 목록:"
if ls /dev/video* > /dev/null 2>&1; then
    ls -l /dev/video*
else
    echo "  비디오 장치가 없습니다"
    exit 1
fi

# v4l2로 장치 정보
echo ""
echo "🎥 카메라 장치 상세:"
if command -v v4l2-ctl &> /dev/null; then
    v4l2-ctl --list-devices
else
    echo "  v4l2-ctl이 설치되지 않았습니다"
    echo "  설치: sudo apt install v4l-utils"
fi

# 각 장치 테스트
echo ""
echo "🧪 작동하는 카메라 찾기:"
for device in /dev/video*; do
    echo -n "  $device 테스트... "
    
    # 빠른 테스트 촬영
    if timeout 3 fswebcam -d "$device" -r 320x240 --no-banner -S 3 "/tmp/test_$(basename $device).jpg" > /dev/null 2>&1; then
        if [ -f "/tmp/test_$(basename $device).jpg" ] && [ -s "/tmp/test_$(basename $device).jpg" ]; then
            SIZE=$(stat -c%s "/tmp/test_$(basename $device).jpg" 2>/dev/null || stat -f%z "/tmp/test_$(basename $device).jpg" 2>/dev/null)
            echo "✅ 작동함! (이미지 크기: $SIZE bytes)"
            rm -f "/tmp/test_$(basename $device).jpg"
        else
            echo "❌ 빈 파일"
        fi
    else
        echo "❌ 실패"
    fi
done

echo ""
echo "✅ 웹캠 검색 완료!"
```

**사용법:**
```bash
chmod +x find_webcam.sh
./find_webcam.sh
```

---

## 🚀 Vision Client 자동 감지 기능

**vision_client.py는 이미 자동 감지 기능이 내장되어 있습니다!**

### 작동 방식:
1. 모든 `/dev/video*` 장치 스캔
2. 각 장치에 대해 실제 촬영 테스트
3. 성공한 첫 번째 장치를 자동 선택
4. 선택된 장치로 계속 사용

### 코드 확인:
```python
def _find_working_camera(self) -> Optional[str]:
    """작동하는 카메라 장치 찾기"""
    video_devices = sorted(glob.glob('/dev/video*'))
    
    for device in video_devices:
        # 각 장치를 실제로 테스트
        cmd = ['fswebcam', '-d', device, '-r', '320x240', 
               '--no-banner', '-S', '3', test_path]
        result = subprocess.run(cmd, capture_output=True, timeout=5)
        
        if result.returncode == 0 and os.path.getsize(test_path) > 0:
            return device  # 작동하는 장치 발견!
    
    return None
```

---

## ⚙️ 수동으로 특정 장치 지정

필요한 경우 특정 장치를 지정할 수 있습니다:

### 방법 1: 환경변수 (.env 파일)
```bash
nano .env

# 추가:
CAMERA_DEVICE=/dev/video0
```

### 방법 2: 명령줄 인자
```bash
python3 vision_client.py --camera-device /dev/video13
```

### 방법 3: 코드에서 직접 지정
```python
# vision_client.py 수정
client = VisionAnalysisClient(camera_device="/dev/video13")
```

---

## 🐛 문제 해결

### 문제 1: "Permission denied"
```bash
# video 그룹에 사용자 추가
sudo usermod -a -G video $USER

# 재로그인 또는 재부팅
sudo reboot
```

### 문제 2: "Device or resource busy"
```bash
# 카메라를 사용 중인 프로세스 확인
sudo lsof /dev/video*

# 프로세스 종료
sudo killall fswebcam
# 또는
sudo pkill -9 -f video
```

### 문제 3: 웹캠이 인식되지 않음
```bash
# USB 재연결
# 1. 웹캠 USB 제거
# 2. 3초 대기
# 3. USB 재연결

# dmesg로 확인
dmesg | tail -20
dmesg | grep -i video
dmesg | grep -i usb

# 예상 출력:
# [  123.456] usb 1-1.3: new high-speed USB device
# [  123.789] uvcvideo: Found UVC 1.00 device
```

### 문제 4: 여러 video 장치 중 어느 것을 사용해야 할지 모름
```bash
# 모든 장치의 기능 확인
for device in /dev/video*; do
    echo "=== $device ==="
    v4l2-ctl -d "$device" --all 2>/dev/null | head -20
    echo ""
done

# "Card type"에 "USB" 또는 카메라 이름이 있는 것을 사용
```

---

## 📊 일반적인 웹캠 장치 구조

### 라즈베리파이:
```
/dev/video0  → 메인 캡처 장치 (이것을 사용!)
/dev/video1  → 메타데이터 장치 (사용 안 함)
/dev/video10 → H.264 인코더
/dev/video11 → MJPEG 인코더
```

### USB 웹캠:
```
/dev/video0  → RGB/YUV 캡처
/dev/video1  → H.264 스트림
```

**일반적으로 가장 낮은 번호 (video0)가 메인 장치입니다.**

---

## ✅ 자동 감지 테스트

```bash
# Vision Client 실행
./vision_client.sh

# 예상 출력:
# INFO:__main__:사용 가능한 카메라 장치: ['/dev/video0', '/dev/video1', ...]
# INFO:__main__:✅ 작동하는 카메라 발견: /dev/video0
# INFO:__main__:웹캠 초기화 완료!
```

**vision_client.py가 자동으로 작동하는 웹캠을 찾아 연결합니다!** ✅

---

## 💡 추가 팁

### 웹캠 해상도 확인
```bash
v4l2-ctl -d /dev/video0 --list-framesizes=MJPG
v4l2-ctl -d /dev/video0 --list-framesizes=YUYV
```

### 웹캠 설정 변경
```bash
# 밝기 조정
v4l2-ctl -d /dev/video0 --set-ctrl=brightness=128

# 대비 조정
v4l2-ctl -d /dev/video0 --set-ctrl=contrast=128

# 현재 설정 확인
v4l2-ctl -d /dev/video0 --list-ctrls
```

### 실시간 미리보기 (GUI 환경)
```bash
# guvcview 설치
sudo apt install guvcview

# 실행
guvcview -d /dev/video0
```

---

**vision_client.py는 이미 완벽한 자동 감지 기능을 갖추고 있습니다!** 🚀
