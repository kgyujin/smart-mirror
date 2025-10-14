# emotion_server.py 핵심 코드
## 가장 중요한 부분만 정리

---

## **1. 감정 분석 클래스**

```python
class EmotionAnalyzer:
    """Wav2Vec2 기반 음성 감정 분       석기"""
    
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        # 7가지 감정: 화남, 역겨움, 두려움, 기쁨, 중립, 슬픔, 놀람
        self.emotion_labels = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
        self.load_model()

    def load_model(self):
        """Wav2Vec2 모델 로딩"""
        model_name = "Dpngtm/wav2vec2-emotion-recognition"
        self.model = Wav2Vec2ForSequenceClassification.from_pretrained(model_name).to(self.device)
        self.feature_extractor = AutoFeatureExtractor.from_pretrained(model_name)
        logger.info("감정 분석 모델 로딩 완료")₩
```

---

## **2. 오디오 전처리**

```python
    def preprocess_audio(self, audio_data: bytes) -> np.ndarray:
        """오디오를 AI 모델이 처리할 수 있는 형태로 변환"""
        
        # 바이트 → 오디오 배열 변환
        audio_io = io.BytesIO(audio_data)
        waveform, sample_rate = torchaudio.load(audio_io)
        waveform = waveform.numpy()
        
        # 스테레오 → 모노 변환
        if waveform.shape[0] > 1:
            waveform = np.mean(waveform, axis=0, keepdims=True)
        
        # 16kHz로 리샘플링 (모델 요구사항)
        if sample_rate != 16000:
            import librosa
            waveform = librosa.resample(waveform.squeeze(), orig_sr=sample_rate, target_sr=16000)
            waveform = waveform.reshape(1, -1)
        
        # 정규화 ([-1, 1] 범위)
        if np.abs(waveform).max() > 0:
            waveform = waveform / np.abs(waveform).max()
        
        return waveform.squeeze()
```

---

## **3. 감정 분석 함수**

```python
    def analyze_emotion(self, audio_data: bytes) -> Dict[str, Any]:
        """음성에서 감정을 분석하는 핵심 함수"""
        try:
            # 오디오 전처리
            waveform = self.preprocess_audio(audio_data)
            
            # AI 모델 입력 형태로 변환
            inputs = self.feature_extractor(
                waveform, 
                sampling_rate=16000, 
                return_tensors="pt", 
                padding=True
            )
            
            # GPU로 데이터 이동
            if self.device.type == "cuda":
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # AI 모델로 감정 예측
            with torch.no_grad():
                outputs = self.model(**inputs)
                probas = torch.softmax(outputs.logits, dim=-1)[0]
            
            # 결과 정리
            predicted_index = torch.argmax(probas).item()
            predicted_emotion = self.emotion_labels[predicted_index]
            confidence = float(probas[predicted_index])
            
            return {
                'emotion': predicted_emotion,     # 감지된 감정
                'confidence': confidence,         # 신뢰도 (0~1)
                'success': True
            }
            
        except Exception as e:
            return {'emotion': 'neutral', 'confidence': 0.0, 'success': False}
```

---

## **4. 감정별 응답 생성**

```python
def generate_emotion_response(emotion: str, confidence: float) -> str:
    """감정에 맞는 응답 메시지 생성"""
    
    if confidence < 0.3:
        return "음성을 명확히 인식하지 못했습니다."
    
    responses = {
        'angry': "화가 나신 것 같아요. 심호흡을 해보는 건 어떨까요?",
        'happy': "기분이 좋아 보이시네요! 좋은 하루 되세요!",
        'sad': "슬퍼 보이시네요. 괜찮으신가요?",
        'neutral': "어떻게 도와드릴까요?",
        'fear': "불안해 보이시네요. 괜찮을 거예요.",
        'disgust': "불쾌감을 느끼신 것 같아요.",
        'surprise': "놀라신 것 같아요. 괜찮으신가요?"
    }
    
    return responses.get(emotion, "어떻게 도와드릴까요?")
```

---

## **5. Flask API**

```python
emotion_analyzer = EmotionAnalyzer()  # 전역 인스턴스

@app.route('/analyze_emotion', methods=['POST'])
def analyze_emotion():
    """메인 감정 분석 API"""
    try:
        # 요청 데이터 검증
        if not request.json or 'audio_base64' not in request.json:
            return jsonify({'error': 'audio_base64 필드 필요', 'success': False}), 400
        
        # Base64 → 바이너리 변환
        audio_base64 = request.json['audio_base64']
        audio_data = base64.b64decode(audio_base64)
        
        # 감정 분석 실행
        result = emotion_analyzer.analyze_emotion(audio_data)
        
        if not result['success']:
            return jsonify(result), 500
        
        # 응답 메시지 생성
        emotion = result['emotion']
        confidence = result['confidence']
        response_text = generate_emotion_response(emotion, confidence)
        
        # 최종 결과 반환
        return jsonify({
            'emotion': emotion,
            'confidence': confidence,
            'response': response_text,
            'success': True
        })
        
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=False, threaded=True)
```

---

## **🎯 동작 흐름**

1. **클라이언트 요청**: Base64 오디오 데이터 전송
2. **오디오 전처리**: 16kHz 모노로 변환 및 정규화
3. **AI 분석**: Wav2Vec2 모델로 7가지 감정 분석
4. **응답 생성**: 감정에 맞는 메시지 생성 후 JSON 반환

## **🔧 핵심 기능**

- **Wav2Vec2 모델**: Facebook AI의 음성 감정 인식 모델
- **7가지 감정**: angry, disgust, fear, happy, neutral, sad, surprise
- **실시간 처리**: Flask API로 HTTP 요청 처리
- **GPU 지원**: 자동 GPU 감지 및 활용