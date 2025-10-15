# 🔧 카메라 자동 감지 기능 업데이트

## ✅ 수정 완료

### 문제
라즈베리파이에서 `/dev/video0`이 없고 `/dev/video10` 등 다른 번호의 장치만 있는 경우 실패

### 해결
**자동 카메라 감지 기능 추가!**

vision_client.py가 이제 다음과 같이 동작합니다:

1. 모든 `/dev/video*` 장치 스캔
2. 각 장치를 순서대로 테스트
3. 실제로 사진을 촬영할 수 있는 장치를 찾음
4. 찾은 장치를 자동으로 사용

---

## 🚀 업데이트 적용

```bash
# MacBook에서
cd /Users/kgyujin/dev/smart-mirror
scp vision_client.py pi@192.168.0.100:~/
scp vision_client.sh pi@192.168.0.100:~/

# 라즈베리파이에서
ssh pi@192.168.0.100
./vision_client.sh
```

---

## 📊 예상 동작

### 초기화 시:
```
INFO:__main__:fswebcam을 사용하여 카메라 초기화
INFO:__main__:사용 가능한 카메라 장치: ['/dev/video10', '/dev/video11', '/dev/video12', ...]
INFO:__main__:✅ 작동하는 카메라 발견: /dev/video13
INFO:__main__:웹캠 초기화 완료!
```

### 사진 촬영 시:
```
INFO:__main__:fswebcam 명령: fswebcam -r 640x480 --no-banner -S 10 --jpeg 85 -d /dev/video13 /tmp/tmpxxx.jpg
INFO:__main__:이미지 파일 생성됨: /tmp/tmpxxx.jpg (45678 bytes)
INFO:__main__:이미지 로드 성공: (640, 480), RGB
```

---

## 🎯 장점

1. **자동 감지**: 어떤 번호의 video 장치든 자동으로 찾음
2. **실제 테스트**: 각 장치를 실제로 테스트해서 작동하는 것만 사용
3. **빠른 초기화**: 첫 번째로 작동하는 장치를 찾으면 바로 사용
4. **로그 개선**: 어떤 장치를 사용하는지 명확히 표시

---

## 🔍 수동으로 카메라 확인하기

```bash
# 모든 비디오 장치 확인
ls -l /dev/video*

# 각 장치 정보 확인
v4l2-ctl --list-devices

# 특정 장치로 테스트 촬영
fswebcam -d /dev/video13 -r 640x480 --no-banner test.jpg
```

---

## ⚙️ 특정 장치 강제 사용 (필요시)

만약 특정 장치를 사용하고 싶다면, vision_client.py를 직접 수정:

```python
# _init_camera() 메서드에서
self.camera = "/dev/video13"  # 원하는 장치로 직접 지정
```

또는 .env 파일에 추가 (향후 지원 예정):
```bash
CAMERA_DEVICE=/dev/video13
```

---

## 🐛 여전히 문제가 있다면

### 1. 모든 장치 테스트
```bash
for device in /dev/video*; do
    echo "테스트: $device"
    fswebcam -d "$device" -r 320x240 --no-banner "/tmp/test_$(basename $device).jpg" 2>&1
done

ls -lh /tmp/test_video*.jpg
```

### 2. 권한 확인
```bash
# video 그룹 확인
groups | grep video

# 장치 권한 확인
ls -l /dev/video*

# 필요시 권한 부여
sudo usermod -a -G video $USER
sudo reboot
```

### 3. 장치 정보 확인
```bash
# 각 장치의 기능 확인
for device in /dev/video*; do
    echo "=== $device ==="
    v4l2-ctl -d "$device" --all 2>/dev/null | grep -E "(Driver|Card|Capabilities)"
done
```

---

## 💡 일반적인 장치 번호 의미

라즈베리파이나 일부 시스템에서는:
- `/dev/video0-7`: 메타데이터 또는 제어 장치
- `/dev/video10-15`: 실제 카메라 장치
- `/dev/video20+`: 추가 기능 (H.264 인코더 등)

**vision_client.py는 이제 자동으로 실제 카메라를 찾습니다!** ✅

---

## 🎉 테스트

```bash
# 업데이트 후 테스트
./vision_client.sh

# 메뉴에서 1번 선택
1. 감정 분석

# 성공 메시지 확인:
# INFO:__main__:✅ 작동하는 카메라 발견: /dev/videoXX
# INFO:__main__:이미지 파일 생성됨: ...
```

**이제 어떤 라즈베리파이에서도 자동으로 카메라를 찾아 사용합니다!** 🚀
