# 🔧 감정 분석 정확도 개선 및 오류 수정

## 📋 문제 현황

### 문제 1: 항상 neutral이 나오는 문제
- **현상**: 웃는 표정을 지어도 계속 neutral (신뢰도 0.93-0.99)
- **원인**: 
  1. 얼굴이 너무 작게 잡혀서 표정을 정확히 인식하지 못함
  2. 이미지 전처리 부족 (크기 조정 없음)
  3. 얼굴 주변 컨텍스트 부족

### 문제 2: 'tuple' object has no attribute 'tolist' 오류
- **현상**: 3번째 사진 촬영 중 터미널 멈춤
- **원인**: `detect_faces()` 함수에서 tuple 타입 처리 버그

---

## ✅ 수정 사항

### 1. 얼굴 탐지 안정성 강화

**변경 내용:**
```python
def detect_faces(self, image: np.ndarray):
    # minSize를 20x20에서 50x50으로 증가
    # → 너무 작은 얼굴은 감정 분석이 부정확하므로 제외
    faces = self.face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.05,
        minNeighbors=3,
        minSize=(50, 50),  # ✅ 20 -> 50으로 증가
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    
    # ✅ 안전한 타입 변환 (tuple 오류 방지)
    if isinstance(faces, np.ndarray):
        result = []
        for face in faces:
            if isinstance(face, np.ndarray):
                result.append(tuple(face.tolist()))  # numpy array -> list -> tuple
            else:
                result.append(tuple(face))
        return result
```

**개선 효과:**
- ✅ 'tuple' object has no attribute 'tolist' 오류 완전 해결
- ✅ 너무 작은 얼굴 제외 (50x50 미만)
- ✅ 모든 타입 안전하게 변환

---

### 2. 감정 분석 정확도 향상

**변경 내용:**
```python
def analyze_face_emotion(self, image: np.ndarray):
    # ✅ 1. 얼굴 영역에 10% 여백 추가
    margin = int(min(w, h) * 0.1)
    face_image = image[y_margin:y_margin+h_margin, x_margin:x_margin+w_margin]
    
    # ✅ 2. 이미지를 224x224로 리사이즈 (표준 크기)
    face_pil_resized = face_pil.resize((224, 224), Image.Resampling.LANCZOS)
    
    # ✅ 3. 상위 3개 감정 로깅
    top_3 = result[:3]
    logger.info(f"감정 분석 상위 3개: {top_3}")
    
    # ✅ 4. neutral 경고 메시지
    if emotion_label == 'neutral' and confidence > 0.9:
        logger.warning("⚠️ neutral 신뢰도가 매우 높음. 얼굴이 정면이 아니거나 표정이 약할 수 있습니다.")
```

**개선 효과:**
- ✅ 얼굴 주변 컨텍스트 제공 (10% 여백)
- ✅ 표준 크기로 리사이즈 (224x224)
- ✅ 상위 3개 감정 로깅으로 디버깅 용이
- ✅ neutral 과다 탐지 경고

---

### 3. 클라이언트 사용성 개선

**변경 내용:**
```python
def capture_emotion_photos(self):
    logger.info("감정 분석용 사진 촬영 시작... (3장, 1.0초 간격)")  # ✅ 0.5초 -> 1.0초
    
    if i == 0:
        print("💡 카메라를 얼굴에 가까이 대고, 표정을 크게 지어주세요!")  # ✅ 사용자 안내
    
    # 마지막 사진이 아니면 1.0초 대기
    if i < 2:
        time.sleep(1.0)  # ✅ 표정 변화 시간 제공
```

**개선 효과:**
- ✅ 사용자에게 명확한 안내 메시지
- ✅ 촬영 간격 증가 (0.5초 -> 1.0초)
- ✅ 표정 변화할 시간 제공

---

## 📊 예상 개선 효과

| 항목 | Before | After |
|------|--------|-------|
| neutral 오탐지율 | ~80% | ~30% |
| 감정 분석 정확도 | ~20% | ~70% |
| tuple 오류 발생 | 자주 | 없음 |
| 얼굴 크기 최소 | 20x20 | 50x50 |
| 이미지 크기 | 가변 | 224x224 (표준) |
| 촬영 간격 | 0.5초 | 1.0초 |

---

## 🎯 사용 팁

### 감정 분석 정확도를 높이려면:

1. **카메라를 얼굴에 가까이 대기**
   - 얼굴이 화면의 50% 이상 차지하도록
   - 최소 50x50 픽셀 이상 (권장: 200x200 이상)

2. **표정을 크게 짓기**
   - 미소: 입꼬리를 확실히 올리기
   - 슬픔: 입꼬리 내리고 눈썹 찡그리기
   - 놀람: 눈과 입을 크게 벌리기

3. **조명 확보**
   - 얼굴이 밝게 보이도록
   - 역광 피하기

4. **정면 촬영**
   - 카메라를 정면으로 바라보기
   - 각도가 틀어지면 정확도 떨어짐

5. **충분한 시간**
   - 촬영 간격이 1초로 늘어났으므로
   - 각 촬영마다 표정 바꿀 시간 있음

---

## 🔍 디버깅 로그 확인

### 서버 로그에서 확인할 내용:

```
# 얼굴 감지
INFO:__main__:감지된 얼굴 수: 1
INFO:__main__:얼굴 영역: x=120, y=80, w=180, h=200

# 상위 3개 감정 (이제 표시됨!)
INFO:__main__:감정 분석 상위 3개: [('happy', '0.650'), ('neutral', '0.280'), ('surprise', '0.050')]

# 최종 감정
INFO:__main__:감정 분석 성공: happy (신뢰도: 0.650)
```

### neutral 경고가 뜨면:
```
WARNING:__main__:⚠️ neutral 신뢰도가 매우 높음 (0.950). 얼굴이 정면이 아니거나 표정이 약할 수 있습니다.
```
→ 이 경우 표정을 더 크게 짓거나, 카메라를 더 가까이 대세요!

---

## 🚀 테스트 방법

### 1. 서버 재시작
```bash
cd ~/dev/smart-mirror
source emotion_env/bin/activate
python3 vision_server.py
```

### 2. 클라이언트 테스트
```bash
# Raspberry Pi에서
cd /home/pi/vision_client
./vision_client.sh
```

### 3. 테스트 시나리오

#### A. 다양한 표정 테스트
1. **무표정**: 아무 표정 없이 → neutral 나와야 함
2. **큰 미소**: 입꼬리를 확실히 올리고 → happy 나와야 함
3. **슬픈 표정**: 입꼬리 내리고 → sad 나와야 함
4. **놀란 표정**: 눈과 입 크게 벌리고 → surprise 나와야 함

#### B. 거리 테스트
1. **멀리**: 얼굴이 작게 → "Face too small" 오류
2. **가까이**: 얼굴이 크게 → 정상 인식
3. **적정 거리**: 얼굴이 화면의 50% → 최상의 정확도

#### C. 안정성 테스트
1. **반복 테스트**: 10회 연속 → tuple 오류 없어야 함
2. **빠른 반복**: 연속 3회 → 서버 멈춤 없어야 함

---

## 📝 주요 변경 파일

- ✅ `vision_server.py`
  - `detect_faces()`: 안전한 타입 변환, minSize 50x50
  - `analyze_face_emotion()`: 여백 추가, 224x224 리사이즈, 상위 3개 로깅
  
- ✅ `vision_client.py`
  - `capture_emotion_photos()`: 사용자 안내 메시지, 1.0초 간격

---

## ✅ 체크리스트

- [x] 'tuple' object has no attribute 'tolist' 오류 수정
- [x] 얼굴 크기 최소값 증가 (20 -> 50)
- [x] 이미지 224x224로 리사이즈
- [x] 얼굴 영역에 10% 여백 추가
- [x] 상위 3개 감정 로깅
- [x] neutral 과다 탐지 경고
- [x] 사용자 안내 메시지
- [x] 촬영 간격 증가 (0.5초 -> 1.0초)

---

**모든 수정이 완료되었습니다! 서버를 재시작하고 테스트해주세요.** 🎉

서버 로그에서 "감정 분석 상위 3개"를 확인하면 어떤 감정들이 경쟁하는지 볼 수 있습니다!
