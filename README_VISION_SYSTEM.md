# 🎭 Vision Analysis System

스마트 미러에 웹캠 기반 **표정 분석**과 **옷차림 체크** 기능을 추가한 AI Vision 시스템입니다.

---

## 📋 시스템 개요

### 🎯 주요 기능

1. **표정 분석 (Facial Emotion Recognition)**
   - 웹캠으로 얼굴 표정을 촬영하여 감정 분석
   - 7가지 감정 분류: happy, sad, angry, fear, surprise, disgust, neutral
   - 3장의 사진을 0.5초 간격으로 촬영하여 평균 결과 도출

2. **옷차림 체크 (Outfit Appropriateness Check)**
   - 현재 날씨와 기온을 고려한 옷차림 적절성 평가
   - CLIP 모델을 활용한 이미지-텍스트 매칭
   - "추워 보인다", "더워 보인다", "적절하다" 등의 피드백 제공

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Raspberry Pi   │  HTTP   │   MacBook Pro    │  HTTP   │  Smart Mirror   │
│   (웹캠 클라이언트)  │ ──────> │  (Vision Server) │ <────── │   (프론트엔드)    │
│                 │         │    Port: 5051    │         │                 │
│  - 이미지 캡처    │         │  - AI 모델 추론   │         │  - 음성 명령     │
│  - Base64 전송   │         │  - 결과 생성      │         │  - 결과 표시     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                      │
                                      │ Uses
                                      ▼
                            ┌─────────────────────┐
                            │   AI Models         │
                            │  - ViT Face Expr.   │
                            │  - CLIP (Outfit)    │
                            │  - OpenCV (Face Det)│
                            └─────────────────────┘
```

---

## 🚀 설치 및 실행

### 1️⃣ MacBook Pro (Vision Server)

#### 환경 설정
```bash
cd /Users/kgyujin/dev/smart-mirror

# Vision Server 환경 설정 스크립트 실행
./setup_vision_server.sh
```

**스크립트가 자동으로 수행하는 작업:**
- Python 3.10 가상환경 생성 (`vision_env`)
- 필요한 라이브러리 설치:
  - `transformers` (Hugging Face Transformers)
  - `torch` (PyTorch)
  - `pillow` (이미지 처리)
  - `opencv-python` (얼굴 검출)
  - `flask` (웹 서버)
- AI 모델 다운로드:
  - `trpakov/vit-face-expression` (표정 분석)
  - `openai/clip-vit-base-patch32` (옷차림 분석)

#### Vision Server 실행
```bash
# 가상환경 활성화
source vision_env/bin/activate

# Vision Server 시작
python vision_server.py
```

**실행 확인:**
- 서버가 `http://localhost:5051`에서 실행됩니다
- 콘솔에 "Vision Analysis Server running on port 5051" 메시지 확인

---

### 2️⃣ Raspberry Pi (Vision Client)

#### 환경 설정
```bash
# Vision Client 설정 스크립트를 Raspberry Pi로 전송
scp setup_vision_client.sh pi@<RASPBERRY_PI_IP>:~/

# Raspberry Pi에 SSH 접속
ssh pi@<RASPBERRY_PI_IP>

# 스크립트 실행
chmod +x setup_vision_client.sh
./setup_vision_client.sh
```

**스크립트가 자동으로 수행하는 작업:**
- 시스템 패키지 업데이트
- OpenCV 및 의존성 설치
- Python 라이브러리 설치 (`opencv-python`, `requests`, `pillow`)
- 웹캠 장치 권한 설정

#### Vision Client 실행
```bash
# Python 클라이언트 실행
python3 vision_client.py --server http://<MACBOOK_IP>:5051
```

**옵션:**
- `--server`: Vision Server 주소 (기본값: `http://localhost:5051`)
- `--camera`: 카메라 장치 인덱스 (기본값: `0`)

---

### 3️⃣ 스마트 미러 메인 서버

기존 스마트 미러 서버는 Vision Server와 통신하도록 업데이트되었습니다.

```bash
# 메인 서버 실행
cd /Users/kgyujin/dev/smart-mirror
npm start
```

---

## 🎤 음성 명령어

### 표정 분석
- **"미러야, 내 표정 어때?"**
- **"미러야, 내 얼굴 표정 분석해줘"**
- **"미러야, 지금 내 표정 좀 봐줘"**

**처리 과정:**
1. 음성 명령 인식
2. Raspberry Pi에 이미지 캡처 요청 전송
3. 3장의 사진을 0.5초 간격으로 촬영
4. MacBook Vision Server로 이미지 전송
5. ViT 모델로 감정 분석 (7가지 감정)
6. 평균 감정 결과 계산
7. 결과를 음성과 자막으로 표시

### 옷차림 체크
- **"미러야, 오늘 옷차림 어때?"**
- **"미러야, 이 옷 괜찮아?"**
- **"미러야, 날씨에 맞게 입었어?"**

**처리 과정:**
1. 음성 명령 인식
2. 현재 날씨 정보 조회 (기온)
3. Raspberry Pi에 이미지 캡처 요청
4. 전신 사진 1장 촬영
5. MacBook Vision Server로 이미지 + 기온 정보 전송
6. CLIP 모델로 옷차림 적절성 분석
7. 날씨 대비 피드백 생성
8. 결과를 음성과 자막으로 표시

---

## 🔌 API 문서

### 1. 표정 분석 API

**Endpoint:** `POST /analyze/emotion`

**Request Body:**
```json
{
  "image": "base64_encoded_image_string"
}
```

**Response:**
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

**사용 예시:**
```python
import requests
import base64

# 이미지 읽기
with open('face.jpg', 'rb') as f:
    image_data = base64.b64encode(f.read()).decode('utf-8')

# API 호출
response = requests.post('http://localhost:5051/analyze/emotion', json={
    'image': image_data
})

result = response.json()
print(f"감정: {result['emotion']}, 신뢰도: {result['confidence']:.2%}")
```

---

### 2. 옷차림 분석 API

**Endpoint:** `POST /analyze/outfit`

**Request Body:**
```json
{
  "image": "base64_encoded_image_string",
  "temperature": 15.5
}
```

**Response:**
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

**사용 예시:**
```python
import requests
import base64

# 이미지 읽기
with open('outfit.jpg', 'rb') as f:
    image_data = base64.b64encode(f.read()).decode('utf-8')

# API 호출
response = requests.post('http://localhost:5051/analyze/outfit', json={
    'image': image_data,
    'temperature': 15.5
})

result = response.json()
print(f"평가: {result['appropriateness']}")
print(f"조언: {result['advice']}")
```

---

## 🧪 테스트

### Vision Server 테스트
```bash
# 테스트 이미지로 표정 분석 테스트
curl -X POST http://localhost:5051/analyze/emotion \
  -H "Content-Type: application/json" \
  -d '{"image":"'$(base64 -i test_face.jpg)'"}'

# 옷차림 분석 테스트
curl -X POST http://localhost:5051/analyze/outfit \
  -H "Content-Type: application/json" \
  -d '{"image":"'$(base64 -i test_outfit.jpg)'", "temperature": 20}'
```

### Vision Client 테스트
```bash
# Raspberry Pi에서
python3 vision_client.py --test-emotion
python3 vision_client.py --test-outfit
```

---

## 📊 AI 모델 상세

### 1. ViT Face Expression Model
- **모델:** `trpakov/vit-face-expression`
- **아키텍처:** Vision Transformer (ViT-Base)
- **출력:** 7가지 감정 분류
  - `happy`, `sad`, `angry`, `fear`, `surprise`, `disgust`, `neutral`
- **정확도:** ~85% (FER2013 데이터셋 기준)
- **입력 크기:** 224x224 RGB
- **추론 속도:** ~50ms (CPU), ~10ms (GPU)

### 2. CLIP Model
- **모델:** `openai/clip-vit-base-patch32`
- **아키텍처:** Contrastive Language-Image Pre-training
- **용도:** 이미지와 텍스트 유사도 계산
- **활용 방식:**
  - 이미지 임베딩 생성
  - "warm clothing", "light clothing" 등의 텍스트 임베딩과 비교
  - 코사인 유사도로 옷차림 스타일 점수 계산
- **입력 크기:** 224x224 RGB

### 3. OpenCV Haar Cascade
- **모델:** `haarcascade_frontalface_default.xml`
- **용도:** 얼굴 영역 검출
- **처리 과정:**
  1. 이미지를 그레이스케일로 변환
  2. Haar Cascade로 얼굴 영역 검출
  3. 검출된 영역을 크롭하여 ViT 모델에 입력

---

## ⚙️ 설정

### vision_server.py 주요 설정
```python
# 서버 포트
PORT = 5051

# 모델 설정
FACE_MODEL_NAME = "trpakov/vit-face-expression"
CLIP_MODEL_NAME = "openai/clip-vit-base-patch32"

# 감정 라벨 매핑
EMOTION_LABELS = ['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise']

# 온도별 옷차림 기준 (°C)
TEMPERATURE_THRESHOLDS = {
    'very_cold': 5,    # 5도 이하: 매우 추움
    'cold': 10,        # 10도 이하: 추움
    'cool': 15,        # 15도 이하: 서늘함
    'mild': 20,        # 20도 이하: 선선함
    'warm': 25,        # 25도 이하: 따뜻함
}
```

### vision_client.py 주요 설정
```python
# 카메라 설정
CAMERA_INDEX = 0
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480

# 표정 분석 촬영 설정
EMOTION_CAPTURE_COUNT = 3      # 3장 촬영
EMOTION_CAPTURE_INTERVAL = 0.5  # 0.5초 간격

# 옷차림 분석 촬영 설정
OUTFIT_CAPTURE_COUNT = 1        # 1장 촬영
```

---

## 🐛 문제 해결

### 1. Vision Server가 시작되지 않음
```bash
# Python 버전 확인 (3.8 이상 필요)
python --version

# 가상환경 재생성
rm -rf vision_env
python3 -m venv vision_env
source vision_env/bin/activate
pip install -r requirements_vision.txt
```

### 2. 모델 다운로드 실패
```bash
# Hugging Face 캐시 정리
rm -rf ~/.cache/huggingface

# 수동으로 모델 다운로드
python -c "from transformers import ViTForImageClassification; ViTForImageClassification.from_pretrained('trpakov/vit-face-expression')"
```

### 3. Raspberry Pi 카메라 인식 안됨
```bash
# 카메라 장치 확인
ls -l /dev/video*

# 카메라 권한 부여
sudo usermod -a -G video $USER
sudo chmod 666 /dev/video0

# 재부팅 후 재시도
sudo reboot
```

### 4. 이미지 전송 오류
```bash
# 네트워크 연결 확인
ping <MACBOOK_IP>

# Vision Server 상태 확인
curl http://<MACBOOK_IP>:5051/health

# 방화벽 설정 확인 (MacBook)
# 시스템 환경설정 > 보안 및 개인 정보 보호 > 방화벽 > 포트 5051 허용
```

---

## 📈 성능 최적화

### GPU 가속 사용 (선택사항)
```bash
# PyTorch GPU 버전 설치 (CUDA 사용 가능한 경우)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# vision_server.py에서 GPU 사용 설정은 자동으로 감지됨
# torch.cuda.is_available() == True이면 자동으로 GPU 사용
```

### 모델 추론 속도 향상
- **배치 처리:** 여러 이미지를 동시에 처리하여 속도 향상
- **모델 양자화:** INT8 양자화로 추론 속도 2배 향상 (정확도 약간 감소)
- **TorchScript 컴파일:** JIT 컴파일로 추론 속도 10-20% 향상

---

## 🔒 보안 고려사항

1. **이미지 데이터 처리**
   - 이미지는 Base64로 인코딩하여 HTTP로 전송
   - 서버는 이미지를 메모리에서만 처리하고 저장하지 않음
   - 분석 완료 후 이미지 데이터 즉시 삭제

2. **네트워크 보안**
   - 로컬 네트워크 내에서만 통신 권장
   - 외부 노출 시 HTTPS 사용 권장
   - API 인증 토큰 추가 가능

3. **개인정보 보호**
   - 얼굴 이미지는 감정 분석 후 즉시 폐기
   - 사용자 식별 정보 저장하지 않음
   - 로그에 이미지 데이터 기록하지 않음

---

## 📚 참고 자료

- [Hugging Face Transformers](https://huggingface.co/docs/transformers)
- [OpenAI CLIP](https://github.com/openai/CLIP)
- [OpenCV Face Detection](https://docs.opencv.org/4.x/d1/de5/classcv_1_1CascadeClassifier.html)
- [ViT Face Expression Model](https://huggingface.co/trpakov/vit-face-expression)

---

## 📝 라이선스

이 프로젝트는 개인 연구 목적으로 개발되었습니다.

사용된 오픈소스 모델:
- ViT Face Expression: MIT License
- CLIP: MIT License
- OpenCV: Apache 2.0 License

---

## 🤝 기여

버그 리포트나 기능 제안은 Issues 탭에 등록해주세요.

---

**Developed by: [Your Name]**  
**Last Updated: 2024-01-XX**
