# SpeechBrain 감정 인식 시스템 설정 가이드

## 개요

이 가이드는 스마트 미러에서 SpeechBrain의 사전 훈련된 감정 인식 모델을 사용하여 사용자의 음성에서 감정을 분석하는 시스템을 설정하는 방법을 설명합니다.

## SpeechBrain 모델 정보

- **모델**: `speechbrain/emotion-recognition-wav2vec2-IEMOCAP`
- **정확도**: 85% 이상
- **지원 감정**: 8가지 (angry, happy, neutral, sad, excited, frustrated, fearful, disgusted, surprised)
- **데이터셋**: IEMOCAP (Interactive Emotional Dyadic Motion Capture)
- **특징**: wav2vec2 기반, 실시간 음성 분석 가능

## 설치 방법

### 1. 라즈베리파이에서 설치

#### 자동 설치 (권장)
```bash
# 설치 스크립트 실행
python3 install_speechbrain.py
```

#### 수동 설치
```bash
# 시스템 의존성 설치
sudo apt-get update
sudo apt-get install -y python3-pip python3-dev build-essential

# Python 패키지 설치
pip3 install --user torch torchaudio
pip3 install --user numpy scipy scikit-learn
pip3 install --user librosa soundfile tqdm

# SpeechBrain 설치
pip3 install --user git+https://github.com/speechbrain/speechbrain.git@develop
```

### 2. Windows에서 설치

#### 가상환경 사용 (권장)
```bash
# 가상환경 생성
python -m venv venv

# 가상환경 활성화
venv\Scripts\activate

# 패키지 설치
pip install torch torchaudio
pip install numpy scipy scikit-learn
pip install librosa soundfile tqdm
pip install git+https://github.com/speechbrain/speechbrain.git@develop
```

#### 직접 설치
```bash
pip install torch torchaudio
pip install numpy scipy scikit-learn
pip install librosa soundfile tqdm
pip install git+https://github.com/speechbrain/speechbrain.git@develop
```

## 설치 확인

### Python 스크립트로 테스트
```python
import torch
import speechbrain
from speechbrain.pretrained import EncoderClassifier

# 버전 확인
print("SpeechBrain 버전:", speechbrain.__version__)
print("PyTorch 버전:", torch.__version__)

# 모델 로드 테스트
classifier = EncoderClassifier.from_hparams(
    source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
    savedir="models/emotion_model"
)
print("✅ 모델 로드 성공!")
```

### 명령어로 테스트
```bash
python3 -c "
import speechbrain
print('SpeechBrain 설치 완료:', speechbrain.__version__)
"
```

## 사용 방법

### 1. 스마트 미러 서버 시작
```bash
node app.js
```

### 2. 감정 분석 자동 시작
- 서버 시작 시 SpeechBrain 모델이 자동으로 로드됩니다
- 마이크 입력이 시작되면 실시간 감정 분석이 시작됩니다

### 3. 감정 분석 결과 확인

#### 음성으로 확인
```
"내 기분이 어때?"
"내 감정 상태는?"
"지금 내 마음 상태는?"
```

#### API로 확인
```bash
# 현재 감정 상태
curl http://localhost:3000/api/emotion

# 감정 기반 추천
curl http://localhost:3000/api/emotion/recommendations
```

## 감정 분석 결과

### 지원하는 감정
| 감정 코드 | 감정명 | 설명 |
|-----------|--------|------|
| ang | angry | 분노 |
| hap | happy | 행복 |
| neu | neutral | 중립 |
| sad | sad | 슬픔 |
| exc | excited | 흥분 |
| fru | frustrated | 좌절 |
| fea | fearful | 두려움 |
| dis | disgusted | 혐오 |
| sur | surprised | 놀람 |

### 응답 예시
```json
{
  "emotion": "happy",
  "confidence": 0.85,
  "response": "기분이 좋으시군요! 그 긍정적인 에너지가 주변 사람들에게도 전파될 거예요.",
  "recommendations": {
    "music": "Upbeat pop",
    "activity": "좋아하는 음악 듣기",
    "confidence": 0.85
  }
}
```

## 문제 해결

### 1. 설치 오류

#### "externally-managed-environment" 오류
```bash
# 가상환경 사용
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows
```

#### Fortran 컴파일러 오류
```bash
# 라즈베리파이에서
sudo apt-get install -y gfortran

# 또는 시스템 패키지 사용
sudo apt-get install -y python3-scipy python3-sklearn python3-numpy
```

### 2. 모델 로드 오류

#### 메모리 부족
```bash
# 스왑 메모리 증가
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 네트워크 오류
```bash
# 모델 수동 다운로드
python3 -c "
from speechbrain.pretrained import EncoderClassifier
classifier = EncoderClassifier.from_hparams(
    source='speechbrain/emotion-recognition-wav2vec2-IEMOCAP',
    savedir='models/emotion_model'
)
"
```

### 3. 성능 최적화

#### CPU 사용량 줄이기
- 감정 분석 주기를 5초로 설정 (기본값)
- `js/emotion-analysis.js`에서 `lastAnalysisTime` 간격 조정

#### 메모리 사용량 줄이기
- 오디오 버퍼 크기 조정
- 감정 히스토리 개수 제한 (기본: 10개)

## 고급 설정

### 1. 감정 분석 주기 조정
`js/emotion-analysis.js`에서 다음 부분 수정:
```javascript
// 5초마다 분석 (기본값)
if (now - this.lastAnalysisTime < 5000) {
    return this.currentEmotion || { emotion: 'unknown', confidence: 0 };
}
```

### 2. 신뢰도 임계값 조정
```javascript
// 신뢰도 0.3 이상일 때만 감정으로 인식 (기본값)
if (result.emotion !== 'unknown' && result.confidence > 0.3) {
    // 감정 업데이트
}
```

### 3. 커스텀 감정 응답 추가
`js/emotion-analysis.js`에서 `EMOTION_MESSAGES` 수정:
```javascript
const EMOTION_MESSAGES = {
    'happy': [
        '기분이 좋으시군요!',
        '행복한 기분이 느껴져요!',
        // 새로운 메시지 추가
    ],
    // 다른 감정들...
};
```

## 기술적 세부사항

### 모델 아키텍처
- **기반 모델**: wav2vec2 (Facebook AI)
- **분류기**: 선형 레이어
- **입력**: 16kHz 오디오
- **출력**: 9개 감정 클래스 확률

### 성능 지표
- **정확도**: 85%+ (IEMOCAP 테스트셋)
- **추론 시간**: ~1초 (CPU)
- **메모리 사용량**: ~500MB
- **모델 크기**: ~1GB

### 지원 오디오 형식
- **샘플링 레이트**: 16kHz (권장)
- **비트 깊이**: 16-bit
- **채널**: 모노
- **형식**: WAV, MP3, FLAC

## 라이선스

- **SpeechBrain**: Apache 2.0
- **IEMOCAP 데이터셋**: 연구용 라이선스
- **wav2vec2**: MIT 라이선스

## 참고 자료

- [SpeechBrain 공식 문서](https://speechbrain.github.io/)
- [IEMOCAP 데이터셋](https://sail.usc.edu/iemocap/)
- [wav2vec2 논문](https://arxiv.org/abs/2006.11477)
- [감정 인식 모델](https://huggingface.co/speechbrain/emotion-recognition-wav2vec2-IEMOCAP)
