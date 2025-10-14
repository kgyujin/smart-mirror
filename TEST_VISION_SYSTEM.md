# Vision System 통합 테스트 가이드

## 🧪 테스트 환경 준비

### 1단계: 모든 서버 시작 확인

#### MacBook Pro
```bash
# Terminal 1: Vision Server
cd /Users/kgyujin/dev/smart-mirror
source vision_env/bin/activate
python vision_server.py

# Terminal 2: Main Smart Mirror Server
cd /Users/kgyujin/dev/smart-mirror
npm start

# Terminal 3: Emotion Server (기존)
cd /Users/kgyujin/dev/smart-mirror
source emotion_env/bin/activate
python emotion_server.py
```

#### Raspberry Pi
```bash
# Terminal 1: Vision Client
python3 vision_client.py --server http://<MACBOOK_IP>:5051
```

---

## 🎯 테스트 시나리오

### 시나리오 1: 표정 분석 전체 플로우

**목적:** 음성 명령부터 결과 표시까지 전체 흐름 테스트

**단계:**
1. 스마트 미러 화면을 엽니다 (`http://localhost:3000`)
2. 핫워드 "미러야"로 시스템을 깨웁니다
3. "내 표정 어때?"라고 말합니다
4. 웹캠이 자동으로 3장의 사진을 촬영합니다 (0.5초 간격)
5. 화면에 "표정을 분석 중입니다..." 메시지가 표시됩니다
6. 2-3초 후 분석 결과가 음성과 자막으로 표시됩니다

**기대 결과:**
- ✅ 음성 명령이 정확히 인식됨
- ✅ 웹캠 LED가 깜빡이며 촬영됨
- ✅ 분석 결과가 자연스러운 한국어로 출력됨
- ✅ 감정 분류가 정확함 (예: "행복한 표정이 감지되었습니다!")

**예상 응답 예시:**
- "행복한 표정이네요! 87% 확률로 기분이 좋아 보입니다."
- "조금 피곤해 보이시네요. 슬픈 표정이 62% 감지되었습니다."
- "평온한 표정입니다. 중립적인 감정 상태로 보입니다."

---

### 시나리오 2: 옷차림 체크 전체 플로우

**목적:** 날씨 연동 옷차림 분석 테스트

**단계:**
1. 현재 날씨를 확인합니다 (화면 상단 날씨 위젯)
2. 핫워드 "미러야"로 시스템을 깨웁니다
3. "오늘 옷차림 어때?"라고 말합니다
4. 웹캠이 전신 사진을 1장 촬영합니다
5. 화면에 "옷차림을 확인 중입니다..." 메시지가 표시됩니다
6. 3-4초 후 분석 결과가 음성과 자막으로 표시됩니다

**기대 결과:**
- ✅ 현재 기온이 정확히 조회됨
- ✅ 웹캠이 전신을 촬영함
- ✅ 날씨에 맞는 조언이 제공됨
- ✅ 응답이 자연스럽고 구체적임

**예상 응답 예시 (기온별):**
- **5°C 이하:** "추운 날씨인데 옷을 가볍게 입으셨네요. 외투를 더 입는 게 좋겠어요."
- **15°C:** "현재 기온 15도에 적절한 옷차림입니다."
- **25°C 이상:** "더운 날씨에 두껍게 입으셨어요. 좀 더 가벼운 옷을 추천합니다."

---

### 시나리오 3: API 직접 호출 테스트

**목적:** Vision Server API 단독 테스트

#### 표정 분석 API 테스트
```bash
# 테스트 이미지 준비 (얼굴이 나온 사진)
# 예: test_face.jpg

# API 호출
curl -X POST http://localhost:5051/analyze/emotion \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "image": "$(base64 -i test_face.jpg)"
}
EOF
```

**기대 출력:**
```json
{
  "emotion": "happy",
  "confidence": 0.87,
  "probabilities": {
    "happy": 0.87,
    "neutral": 0.08,
    "sad": 0.03,
    "angry": 0.01,
    "fear": 0.01,
    "surprise": 0.00,
    "disgust": 0.00
  },
  "message": "행복한 표정이 감지되었습니다!"
}
```

#### 옷차림 분석 API 테스트
```bash
# 테스트 이미지 준비 (전신 사진)
# 예: test_outfit.jpg

# API 호출
curl -X POST http://localhost:5051/analyze/outfit \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "image": "$(base64 -i test_outfit.jpg)",
  "temperature": 15.5
}
EOF
```

**기대 출력:**
```json
{
  "appropriateness": "적절합니다",
  "temperature": 15.5,
  "advice": "현재 기온(15.5°C)에 적절한 옷차림입니다.",
  "style_scores": {
    "warm_clothing": 0.82,
    "light_clothing": 0.15,
    "formal": 0.45
  }
}
```

---

### 시나리오 4: Raspberry Pi Client 단독 테스트

**목적:** Vision Client 카메라 캡처 테스트

```bash
# Raspberry Pi에서 실행

# 표정 분석 테스트 모드
python3 vision_client.py --test-emotion

# 옷차림 분석 테스트 모드
python3 vision_client.py --test-outfit
```

**기대 동작:**
- ✅ 카메라가 정상적으로 초기화됨
- ✅ 이미지 캡처가 성공함
- ✅ Base64 인코딩이 정상 작동함
- ✅ Vision Server로 전송이 성공함
- ✅ 응답을 정상적으로 받음

---

## 🔍 로그 확인 방법

### Vision Server 로그
```bash
# vision_server.py 실행 중인 터미널에서
# 다음과 같은 로그가 출력되어야 함:

[2024-01-XX 10:30:15] INFO: Vision Analysis Server running on port 5051
[2024-01-XX 10:30:45] INFO: POST /analyze/emotion - 이미지 수신 완료
[2024-01-XX 10:30:45] INFO: 얼굴 검출 완료: 1개
[2024-01-XX 10:30:46] INFO: 감정 분석 완료: happy (87%)
[2024-01-XX 10:30:46] INFO: 응답 전송 완료
```

### Vision Client 로그
```bash
# vision_client.py 실행 중인 터미널에서
# 다음과 같은 로그가 출력되어야 함:

[2024-01-XX 10:30:40] INFO: 카메라 초기화 완료
[2024-01-XX 10:30:42] INFO: 표정 분석 요청 받음
[2024-01-XX 10:30:42] INFO: 이미지 캡처 중 (1/3)...
[2024-01-XX 10:30:43] INFO: 이미지 캡처 중 (2/3)...
[2024-01-XX 10:30:43] INFO: 이미지 캡처 중 (3/3)...
[2024-01-XX 10:30:44] INFO: Vision Server로 전송 중...
[2024-01-XX 10:30:46] INFO: 분석 완료: happy (87%)
```

### Main Server 로그
```bash
# npm start 실행 중인 터미널에서
# 다음과 같은 로그가 출력되어야 함:

[INFO] 명령 처리 시작: 내 표정 어때?
[INFO] 표정 분석 요청 시작
[INFO] WebSocket: request_face_capture 브로드캐스트
[INFO] Vision API 호출: POST /api/vision/emotion
[INFO] 표정 분석 완료: {"emotion":"happy","confidence":0.87}
[INFO] TTS 재생: 행복한 표정이 감지되었습니다!
```

---

## ⚠️ 자주 발생하는 오류 및 해결

### 오류 1: "Connection refused to localhost:5051"
**원인:** Vision Server가 실행되지 않음

**해결:**
```bash
# Vision Server 시작 확인
lsof -i :5051

# 없으면 재시작
source vision_env/bin/activate
python vision_server.py
```

---

### 오류 2: "No face detected in image"
**원인:** 이미지에서 얼굴을 찾지 못함

**해결:**
- 웹캠 위치를 조정하여 얼굴이 중앙에 오도록 함
- 조명을 밝게 함
- 카메라와의 거리를 50cm-1m로 조정
- 얼굴이 정면을 향하도록 함

---

### 오류 3: "Image too large"
**원인:** Base64 인코딩된 이미지 크기가 너무 큼

**해결:**
```python
# vision_client.py에서 이미지 크기 축소
# 현재 설정: 640x480
# 필요시 320x240으로 변경

CAMERA_WIDTH = 320
CAMERA_HEIGHT = 240
```

---

### 오류 4: "Model not found"
**원인:** AI 모델이 다운로드되지 않음

**해결:**
```bash
# 수동으로 모델 다운로드
python -c "from transformers import ViTForImageClassification, CLIPModel; \
           ViTForImageClassification.from_pretrained('trpakov/vit-face-expression'); \
           CLIPModel.from_pretrained('openai/clip-vit-base-patch32')"
```

---

## 📊 성능 측정

### 응답 시간 측정
```bash
# 표정 분석 응답 시간 측정
time curl -X POST http://localhost:5051/analyze/emotion \
  -H "Content-Type: application/json" \
  -d '{"image":"'$(base64 -i test_face.jpg)'"}'

# 목표: 3초 이내
```

### 정확도 측정
```bash
# 10개의 테스트 이미지로 정확도 측정
# test_images/ 폴더에 감정별 이미지 준비
# - happy1.jpg, happy2.jpg, ...
# - sad1.jpg, sad2.jpg, ...
# - angry1.jpg, ...

python test_accuracy.py
```

**예상 결과:**
- 표정 분석 정확도: 80-85%
- 옷차림 분석 신뢰도: 70-75%

---

## ✅ 통합 테스트 체크리스트

### 서버 시작 체크
- [ ] Vision Server 정상 실행 (포트 5051)
- [ ] Main Server 정상 실행 (포트 3000)
- [ ] Emotion Server 정상 실행 (포트 5050)
- [ ] Vision Client 정상 실행 (Raspberry Pi)

### 기능 테스트 체크
- [ ] 표정 분석 음성 명령 인식
- [ ] 표정 분석 결과 정확성
- [ ] 표정 분석 응답 자연스러움
- [ ] 옷차림 분석 음성 명령 인식
- [ ] 옷차림 분석 날씨 연동
- [ ] 옷차림 분석 조언 적절성

### API 테스트 체크
- [ ] `/analyze/emotion` 정상 응답
- [ ] `/analyze/outfit` 정상 응답
- [ ] 에러 핸들링 정상 작동
- [ ] Base64 인코딩/디코딩 정상

### 성능 테스트 체크
- [ ] 표정 분석 응답 시간 3초 이내
- [ ] 옷차림 분석 응답 시간 4초 이내
- [ ] 메모리 사용량 적정 수준 (< 2GB)
- [ ] CPU 사용률 적정 수준 (< 80%)

### 사용성 테스트 체크
- [ ] 음성 명령어 다양성 테스트
- [ ] 다양한 조명 조건 테스트
- [ ] 다양한 거리/각도 테스트
- [ ] 연속 요청 안정성 테스트

---

## 🎓 테스트 시나리오 확장

### 추가 테스트 아이디어

1. **감정 변화 추적 테스트**
   - 1분 간격으로 표정 분석 반복
   - 감정 변화 추이 기록
   - 그래프로 시각화

2. **옷차림 추천 시스템 테스트**
   - 다양한 기온대에서 테스트 (0°C, 10°C, 20°C, 30°C)
   - 옷차림 스타일별 점수 비교
   - 날씨 변화 시 실시간 알림 테스트

3. **멀티 사용자 테스트**
   - 2명 이상이 화면에 나올 때 동작 확인
   - 얼굴 선택 로직 개선 필요 시 피드백

4. **장시간 운영 안정성 테스트**
   - 24시간 연속 실행
   - 메모리 누수 확인
   - 에러 복구 메커니즘 검증

---

**테스트 완료 후 피드백을 기록해주세요!**

📝 테스트 결과 기록 템플릿:
```
날짜: 2024-XX-XX
테스터: [이름]

✅ 성공한 테스트:
- 

❌ 실패한 테스트:
- 

💡 개선 제안:
- 

📊 성능 측정 결과:
- 표정 분석 평균 응답 시간: X.X초
- 옷차림 분석 평균 응답 시간: X.X초
- 정확도: XX%
```
