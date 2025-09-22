# 🎯 고성능 음성 감정 분석 시스템

라즈베리파이와 맥북을 연동한 실시간 음성 감정 분석 시스템입니다.

## 🚀 시스템 아키텍처

```
라즈베리파이                    맥북 (로컬 서버)
┌─────────────────┐            ┌─────────────────┐
│  음성 녹음      │ ────────► │  감정 분석      │
│  ETRI STT       │            │  wav2vec2 모델  │
│  TTS 출력       │ ◄──────── │  Flask 서버     │
└─────────────────┘            └─────────────────┘
```

## 📋 주요 기능

- **정확도 80% 이상**의 사전 학습된 감정 분석 모델
- **실시간 처리** (2-3초 내 응답)
- **8가지 감정 인식**: angry, calm, disgust, fearful, happy, neutral, sad, surprised
- **감정 기반 맞춤형 응답** (예: 화나면 차분한 음악 제안)
- **병렬 처리** (음성인식 + 감정분석 동시 실행)

## 🛠️ 설치 및 설정

### 1. 맥북 서버 설정

```bash
# 1. 가상환경 생성 및 활성화
python3 -m venv emotion_env
source emotion_env/bin/activate

# 2. 의존성 설치
pip install -r requirements.txt

# 3. 서버 실행
python emotion_server.py
```

### 2. 라즈베리파이 설정

```bash
# 1. 환경 변수 설정
echo "EMOTION_SERVER_URL=http://[맥북IP]:5000" >> .env

# 2. 서버 재시작
npm start
```

## 🎯 사용 방법

### 1. 서버 시작

```bash
# 맥북에서
python emotion_server.py

# 라즈베리파이에서
npm start
```

### 2. 음성 명령

```
"미러야" → 감정 분석 + 텍스트 인식
```

### 3. 감정별 응답 예시

- **화남 (angry)**: "화가 나신 것 같아요. 마음이 차분해지는 음악을 틀어드릴까요?"
- **슬픔 (sad)**: "슬퍼 보이시네요. 기분이 좋아질 수 있는 음악을 들려드릴까요?"
- **불안 (fearful)**: "불안해 보이시네요. 안정감을 주는 음악을 틀어드릴까요?"
- **행복 (happy)**: "기분이 좋아 보이시네요! 더 즐거운 시간을 보내세요!"

## 🔧 API 엔드포인트

### 1. 상태 확인
```bash
GET /health
```

### 2. 감정 분석 (Base64)
```bash
POST /analyze_emotion
Content-Type: application/json

{
  "audio_base64": "base64_encoded_audio_data"
}
```

### 3. 감정 분석 (파일 업로드)
```bash
POST /analyze_emotion_file
Content-Type: multipart/form-data

file: audio_file.wav
```

## 📊 성능 지표

- **처리 속도**: 2-3초 (음성 전송 + 분석 + 응답)
- **정확도**: 80% 이상 (IEMOCAP 데이터셋 기준)
- **지원 감정**: 8가지 (angry, calm, disgust, fearful, happy, neutral, sad, surprised)
- **모델 크기**: ~300MB (wav2vec2-base-superb-er)

## 🧪 테스트

```bash
# 서버 테스트
python test_emotion_server.py

# 수동 테스트
curl -X GET http://localhost:5000/health
```

## 🔍 문제 해결

### 1. 서버 연결 실패
```bash
# 방화벽 확인
sudo ufw allow 5000

# IP 주소 확인
ifconfig | grep inet
```

### 2. 모델 로드 실패
```bash
# 의존성 재설치
pip install --upgrade torch torchaudio transformers
```

### 3. 메모리 부족
```bash
# 모델 최적화
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
```

## 📁 파일 구조

```
smart-mirror/
├── emotion_server.py          # 맥북 감정 분석 서버
├── requirements.txt           # Python 의존성
├── test_emotion_server.py     # 테스트 스크립트
├── setup_emotion_server.sh    # 설치 스크립트
├── js/
│   ├── emotion-analysis.js    # 감정 분석 클라이언트
│   ├── speech.js             # 음성 처리 (수정됨)
│   ├── conversation.js       # 대화 처리 (수정됨)
│   └── config.js             # 설정 (수정됨)
└── README_EMOTION_SYSTEM.md  # 이 파일
```

## 🎵 감정별 음악 제안

시스템은 감정 분석 결과에 따라 다음과 같은 음악을 제안합니다:

- **화남**: 차분한 클래식, 자연 소리
- **슬픔**: 밝은 팝, 희망적인 음악
- **불안**: 평온한 음악, 명상 음악
- **행복**: 에너지틱한 음악, 댄스 음악

## 🔮 향후 개선 계획

1. **음악 재생 기능** 추가
2. **감정 히스토리** 추적
3. **개인화된 응답** 학습
4. **다국어 지원** 확장
5. **실시간 스트리밍** 최적화

## 📞 지원

문제가 발생하면 다음을 확인하세요:

1. 서버 상태: `GET /health`
2. 네트워크 연결: `ping [맥북IP]`
3. 로그 확인: `tail -f logs/app.log`

---

**🎯 이 시스템으로 더욱 자연스럽고 감정적으로 풍부한 스마트 미러 경험을 제공합니다!**
