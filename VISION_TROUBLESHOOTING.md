# 🔍 Vision Client 문제 해결 가이드

## 현재 오류 분석

### 1. 옷차림 분석 오류
```
ERROR:__main__:사진 촬영 실패: cannot identify image file '/tmp/tmpcuyconds.jpg'
```

**원인:** fswebcam이 빈 파일을 생성하거나, 손상된 이미지를 생성

**해결 방법:**

```bash
# 카메라 진단 실행
chmod +x diagnose_camera.sh
./diagnose_camera.sh
```

### 2. 얼굴 탐지 오류
```
ERROR:__main__:얼굴 탐지 실패: 'tuple' object has no attribute 'tolist'
```

**원인:** OpenCV의 detectMultiScale()이 예상과 다른 타입 반환

**해결:** vision_server.py 수정 완료 ✅

---

## 🛠️ 단계별 문제 해결

### Step 1: 카메라 기본 확인

```bash
# 카메라 장치 확인
ls -l /dev/video*

# 출력 예시:
# crw-rw----+ 1 root video 81, 0 Oct 15 15:00 /dev/video0
```

**문제:** 장치가 없다면
```bash
# USB 웹캠 재연결
# 또는 라즈베리파이 재부팅
sudo reboot
```

### Step 2: fswebcam 직접 테스트

```bash
# 간단한 촬영 테스트
fswebcam -r 640x480 --no-banner test.jpg

# 결과 확인
ls -lh test.jpg
file test.jpg

# MacBook으로 복사해서 확인
# (MacBook에서 실행)
scp pi@192.168.0.100:~/test.jpg ~/Desktop/
```

**정상 출력:**
```
test.jpg: JPEG image data, JFIF standard 1.01, resolution (DPI), density 72x72, segment length 16, baseline, precision 8, 640x480, components 3
```

**문제가 있다면:**
```bash
# 더 많은 프레임 스킵
fswebcam -r 640x480 --no-banner -S 20 test.jpg

# 낮은 해상도 시도
fswebcam -r 320x240 --no-banner test.jpg

# verbose 모드로 오류 확인
fswebcam -v -r 640x480 --no-banner test.jpg 2>&1 | tee fswebcam.log
```

### Step 3: 카메라 장치 명시적 지정

```bash
# 사용 가능한 카메라 확인
v4l2-ctl --list-devices

# 특정 장치로 촬영
fswebcam -d /dev/video0 -r 640x480 --no-banner test.jpg
```

### Step 4: Python에서 테스트

```bash
python3 << 'EOF'
import subprocess
import os
from PIL import Image

# fswebcam으로 촬영
cmd = [
    'fswebcam',
    '-d', '/dev/video0',
    '-r', '640x480',
    '--no-banner',
    '-S', '10',
    '--jpeg', '85',
    '/tmp/python_test.jpg'
]

print(f"실행 명령: {' '.join(cmd)}")
result = subprocess.run(cmd, capture_output=True, text=True)

print(f"반환 코드: {result.returncode}")
print(f"stdout: {result.stdout}")
print(f"stderr: {result.stderr}")

# 파일 확인
if os.path.exists('/tmp/python_test.jpg'):
    size = os.path.getsize('/tmp/python_test.jpg')
    print(f"✅ 파일 생성됨: {size} bytes")
    
    # Pillow로 로드
    img = Image.open('/tmp/python_test.jpg')
    img.load()
    print(f"✅ 이미지 로드 성공: {img.size}, {img.mode}")
else:
    print("❌ 파일이 생성되지 않았습니다")
EOF
```

---

## 🔧 vision_client.py 수정 사항

### 변경 1: 더 많은 디버깅 정보

```python
# 수정된 capture_photo() 메서드는 이제:
# - fswebcam 명령어 전체 출력
# - 반환 코드, stdout, stderr 출력
# - 파일 크기 확인
# - 이미지 로드 성공 여부 확인
```

### 변경 2: 충분한 워밍업

```python
# 프레임 스킵: 5 → 10
'-S', '10'  # 카메라가 안정화될 시간 충분히 제공
```

### 변경 3: 명시적 장치 지정

```python
'-d', f'/dev/video{self.camera_index}'  # 장치 명시
```

---

## 📋 체크리스트

### 하드웨어
- [ ] 웹캠이 USB에 제대로 연결됨
- [ ] 웹캠 LED가 켜짐 (일부 모델)
- [ ] `ls /dev/video*` 출력 확인

### 권한
- [ ] `groups` 명령어에 `video` 포함
- [ ] `/dev/video0` 권한 확인 (`ls -l /dev/video0`)
- [ ] 필요시 `sudo chmod 666 /dev/video0`

### 소프트웨어
- [ ] fswebcam 설치됨 (`which fswebcam`)
- [ ] Pillow 설치됨 (`pip list | grep -i pillow`)
- [ ] Python 가상환경 활성화됨

### 네트워크
- [ ] Vision Server 실행 중 (MacBook)
- [ ] `curl http://192.168.0.162:5051/health` 응답 확인
- [ ] 방화벽에서 포트 5051 허용

---

## 💡 대안 방법

### 방법 1: raspistill 사용 (라즈베리파이 카메라 모듈)

```bash
# 라즈베리파이 카메라 모듈이 있다면
raspistill -o test.jpg -w 640 -h 480
```

vision_client.py 수정:
```python
# fswebcam 대신 raspistill 사용
cmd = [
    'raspistill',
    '-o', tmp_path,
    '-w', str(self.camera_width),
    '-h', str(self.camera_height),
    '-t', '100',  # 100ms 대기
    '-n'  # 미리보기 없음
]
```

### 방법 2: libcamera-still 사용 (최신 라즈베리파이 OS)

```bash
# 최신 Bullseye/Bookworm OS
libcamera-still -o test.jpg --width 640 --height 480
```

### 방법 3: 해상도 낮추기

```bash
# 320x240으로 시도
fswebcam -r 320x240 --no-banner test.jpg
```

vision_client.py에서:
```python
self.camera_width = 320
self.camera_height = 240
```

---

## 🚀 빠른 수정 적용

```bash
# MacBook에서 업데이트된 파일 전송
cd /Users/kgyujin/dev/smart-mirror
scp vision_server.py pi@192.168.0.100:~/
scp vision_client.py pi@192.168.0.100:~/
scp diagnose_camera.sh pi@192.168.0.100:~/

# 라즈베리파이에서
ssh pi@192.168.0.100

# Vision Server 재시작 (MacBook에서)
# Ctrl+C 후
python vision_server.py

# Vision Client 다시 실행
./vision_client.sh
```

---

## 📊 예상 결과

**정상 동작 시:**
```
INFO:__main__:fswebcam 명령: fswebcam -r 640x480 --no-banner -S 10 --jpeg 85 -d /dev/video0 /tmp/tmpxxx.jpg
INFO:__main__:이미지 파일 생성됨: /tmp/tmpxxx.jpg (45678 bytes)
INFO:__main__:이미지 로드 성공: (640, 480), RGB
✅ 옷차림 분석 완료!
```

**여전히 문제가 있다면:**
1. `diagnose_camera.sh` 실행 결과를 확인
2. 생성된 테스트 이미지를 MacBook으로 복사해서 확인
3. 다른 USB 포트에 웹캠 연결 시도
4. 라즈베리파이 재부팅

---

**문제가 지속되면 로그를 공유해 주세요!** 🔍
