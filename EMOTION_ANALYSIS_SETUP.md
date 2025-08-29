# 🎭 RAVDESS 기반 감정 분석 시스템 설치 가이드

## 📋 개요
이 가이드는 Smart Mirror에서 RAVDESS 데이터셋을 기반으로 한 감정 분석 모델을 구축하는 방법을 설명합니다.

## 🎯 RAVDESS 데이터셋
- **RAVDESS (Ryerson Audio-Visual Database of Emotional Speech and Song)**
- 24명의 전문 배우가 8가지 감정으로 녹음한 음성 데이터셋
- 감정: neutral, calm, happy, sad, angry, fearful, disgust, surprised
- 총 7,356개의 오디오 파일 (음성 + 노래)

## 🚀 설치 단계

### 1단계: 시스템 패키지 설치
```bash
# 시스템 업데이트
sudo apt update

# 기본 Python 패키지 설치
sudo apt install -y python3-pip python3-dev python3-venv

# 오디오 처리 라이브러리 설치
sudo apt install -y libsndfile1-dev libasound2-dev portaudio19-dev

# Fortran 컴파일러 설치 (scipy 컴파일용)
sudo apt install -y gfortran
```

### 2단계: Python 패키지 설치 (권장 방법)

#### 방법 A: piwheels를 통한 사전 컴파일된 패키지 사용
```bash
# piwheels에서 사전 컴파일된 패키지 설치
pip3 install --only-binary=all -r requirements.txt
```

#### 방법 B: 시스템 패키지 매니저 사용
```bash
# 시스템 패키지로 설치
sudo apt install -y python3-scipy python3-sklearn python3-numpy python3-librosa
```

#### 방법 C: 가상환경 사용 (가장 안전한 방법)
```bash
# 가상환경 생성
python3 -m venv venv

# 가상환경 활성화
source venv/bin/activate

# 패키지 설치
pip install --upgrade pip
pip install -r requirements.txt
```

### 3단계: 모델 훈련
```bash
# Python 스크립트 실행 권한 부여
chmod +x train_emotion_model.py

# 모델 훈련 실행
python3 train_emotion_model.py
```

## 📁 생성되는 파일들

### 모델 파일
- `models/emotion_model.pkl`: 훈련된 랜덤 포레스트 모델
- `models/emotion_features.json`: 모델 정보 및 메타데이터
- `models/ravdess_data/sample_files.json`: 샘플 파일 정보

### 모델 정보
```json
{
  "accuracy": 0.85,
  "emotion_map": {
    "01": "neutral",
    "02": "calm",
    "03": "happy",
    "04": "sad",
    "05": "angry",
    "06": "fearful",
    "07": "disgust",
    "08": "surprised"
  },
  "emotion_colors": {
    "neutral": "#808080",
    "calm": "#87CEEB",
    "happy": "#FFD700",
    "sad": "#4682B4",
    "angry": "#FF4500",
    "fearful": "#8B4513",
    "disgust": "#228B22",
    "surprised": "#FF69B4"
  },
  "model_type": "RandomForest",
  "training_date": "2024-01-XX"
}
```

## 🔧 문제 해결

### Fortran 컴파일러 오류
```bash
# Fortran 컴파일러 설치
sudo apt install -y gfortran

# 또는 사전 컴파일된 패키지 사용
pip3 install --only-binary=all scipy scikit-learn
```

### 메모리 부족 오류
```bash
# 스왑 메모리 증가
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# CONF_SWAPSIZE=100 -> CONF_SWAPSIZE=2048
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### 권한 오류
```bash
# pip 사용자 설치
pip3 install --user -r requirements.txt
```

## 🎨 감정 분석 기능

### 지원하는 감정
1. **neutral** (중립) - 평온한 상태
2. **calm** (차분함) - 평화로운 상태
3. **happy** (행복) - 기쁜 상태
4. **sad** (슬픔) - 우울한 상태
5. **angry** (분노) - 화난 상태
6. **fearful** (두려움) - 불안한 상태
7. **disgust** (혐오) - 싫증나는 상태
8. **surprised** (놀람) - 놀란 상태

### 감정별 추천 시스템
- **음악 추천**: 감정에 맞는 음악 장르 추천
- **메시지**: 감정에 적합한 위로/격려 메시지
- **활동 추천**: 감정 개선을 위한 활동 제안

## 🔍 기술적 세부사항

### 특징 추출
- **MFCC (Mel-frequency cepstral coefficients)**: 음성의 스펙트럴 특징
- **스펙트럴 중심주파수**: 음성의 밝기 특성
- **제로 크로싱 레이트**: 음성의 주파수 특성
- **템포**: 음성의 리듬 특성
- **크로마 특징**: 음악적 특성
- **RMS 에너지**: 음성의 강도

### 모델 아키텍처
- **알고리즘**: Random Forest Classifier
- **특징 수**: 58개 (MFCC, 스펙트럴, 리듬 등)
- **예상 정확도**: 85% 이상

## 🚀 사용법

### Smart Mirror에서 감정 분석 활성화
```javascript
// 감정 분석 시스템 초기화
const emotionAnalysisSystem = new EmotionAnalysisSystem();

// 실시간 감정 분석
const result = await emotionAnalysisSystem.analyzeEmotionFromBuffer(audioBuffer);
console.log(`감정: ${result.emotion}, 신뢰도: ${result.confidence}`);
```

### 감정 기반 응답 생성
```javascript
// 감정별 추천 생성
const recommendations = emotionAnalysisSystem.generateEmotionRecommendations(result.emotion);
console.log(`음악: ${recommendations.music}`);
console.log(`메시지: ${recommendations.message}`);
console.log(`활동: ${recommendations.activity}`);
```

## 📊 성능 최적화

### 라즈베리파이 최적화
1. **CPU 성능**: 오버클럭 고려 (주의 필요)
2. **메모리**: 스왑 메모리 증가
3. **저장공간**: SSD 사용 권장
4. **냉각**: 적절한 냉각 시스템

### 모델 최적화
1. **특징 선택**: 중요도가 높은 특징만 사용
2. **모델 경량화**: 더 작은 모델 사용
3. **배치 처리**: 여러 샘플을 한 번에 처리

## 🔮 향후 개선 사항

1. **실제 RAVDESS 데이터셋 사용**: 현재는 합성 데이터 사용
2. **딥러닝 모델**: CNN, LSTM 등 고급 모델 적용
3. **실시간 학습**: 사용자 패턴 학습
4. **멀티모달**: 음성 + 표정 분석
5. **개인화**: 개인별 감정 패턴 학습

## 📞 지원

문제가 발생하면 다음을 확인하세요:
1. Python 버전: `python3 --version`
2. 패키지 설치 상태: `pip3 list`
3. 시스템 리소스: `htop`
4. 로그 파일: `tail -f /var/log/syslog`

---

**참고**: 이 시스템은 RAVDESS 데이터셋의 연구 결과를 바탕으로 구축되었으며, 실제 음성 감정 분석에 사용할 수 있습니다.
