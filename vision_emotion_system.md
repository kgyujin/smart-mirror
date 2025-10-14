# 웹캠 기반 얼굴 감정 분석 & 옷차림 체크 시스템

## **시스템 구조**

```
라즈베리파이 (웹캠) → 사진 촬영 → 맥북 서버 → AI 분석 → 결과 반환
```

---

## **1. 사용 가능한 사전 훈련 모델들**

### **얼굴 감정 분석 모델**
```python
# 1. FER2013 기반 감정 분석 (가장 일반적)
model_name = "j-hartmann/emotion-english-distilroberta-base"  # 텍스트+이미지
# 또는
model_name = "trpakov/vit-face-expression"  # Vision Transformer 기반

# 2. OpenCV + 딥러닝 모델 (가벼움, 라즈베리파이 친화적)
# - 7가지 감정: angry, disgust, fear, happy, neutral, sad, surprise

# 3. MediaPipe Face Detection (Google)
# - 실시간 얼굴 감지 + 감정 분석 파이프라인
```

### **옷차림/스타일 분석 모델**
```python
# 1. CLIP 모델 (OpenAI) - 이미지+텍스트 매칭
model_name = "openai/clip-vit-base-patch32"
# 활용: "winter coat", "summer dress", "warm clothes" 등의 텍스트와 이미지 매칭

# 2. Fashion MNIST 확장 모델들
# - 의류 분류: 상의, 하의, 아우터, 신발 등

# 3. YOLO 기반 의류 감지 모델
# - 실시간 의류 객체 감지 및 분류
```

---

## **2. 라즈베리파이 클라이언트 코드**

```python
#!/usr/bin/env python3
# raspberry_vision_client.py

import cv2
import requests
import base64
import json
import time
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class VisionAnalysisClient:
    """라즈베리파이 웹캠 클라이언트"""
    
    def __init__(self, server_url="http://192.168.1.100:5051"):  # 맥북 서버 IP
        self.server_url = server_url
        self.camera = None
        self.init_camera()
    
    def init_camera(self):
        """웹캠 초기화"""
        try:
            self.camera = cv2.VideoCapture(0)  # 첫 번째 카메라 사용
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)   # 해상도 설정
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.camera.set(cv2.CAP_PROP_FPS, 30)
            logger.info("웹캠 초기화 완료")
        except Exception as e:
            logger.error(f"웹캠 초기화 실패: {e}")
            raise
    
    def capture_photo(self) -> bytes:
        """사진 촬영"""
        try:
            ret, frame = self.camera.read()
            if not ret:
                raise Exception("카메라에서 프레임을 읽을 수 없습니다")
            
            # JPEG로 인코딩 (압축하여 전송 속도 향상)
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            return buffer.tobytes()
            
        except Exception as e:
            logger.error(f"사진 촬영 실패: {e}")
            raise
    
    def analyze_emotion(self) -> dict:
        """표정 감정 분석 요청"""
        try:
            # 여러 장 촬영으로 정확도 향상
            photos = []
            for i in range(3):  # 3장 촬영
                photo_data = self.capture_photo()
                photos.append(base64.b64encode(photo_data).decode('utf-8'))
                time.sleep(0.5)  # 0.5초 간격
            
            # 서버로 전송
            response = requests.post(f"{self.server_url}/analyze_face_emotion", 
                json={
                    'photos': photos,
                    'timestamp': datetime.now().isoformat()
                },
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"감정 분석 실패: {response.status_code}")
                return {'success': False, 'error': 'Server error'}
                
        except Exception as e:
            logger.error(f"감정 분석 요청 실패: {e}")
            return {'success': False, 'error': str(e)}
    
    def analyze_outfit(self, weather_info: dict) -> dict:
        """옷차림 분석 요청"""
        try:
            # 전신 사진 촬영
            photo_data = self.capture_photo()
            photo_base64 = base64.b64encode(photo_data).decode('utf-8')
            
            # 서버로 전송
            response = requests.post(f"{self.server_url}/analyze_outfit", 
                json={
                    'photo': photo_base64,
                    'weather': weather_info,  # 현재 날씨 정보
                    'timestamp': datetime.now().isoformat()
                },
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"옷차림 분석 실패: {response.status_code}")
                return {'success': False, 'error': 'Server error'}
                
        except Exception as e:
            logger.error(f"옷차림 분석 요청 실패: {e}")
            return {'success': False, 'error': str(e)}
    
    def __del__(self):
        """리소스 정리"""
        if self.camera:
            self.camera.release()

# 사용 예시
if __name__ == "__main__":
    client = VisionAnalysisClient()
    
    # 감정 분석
    emotion_result = client.analyze_emotion()
    print("감정 분석:", emotion_result)
    
    # 옷차림 분석
    weather = {"temp": 15, "condition": "rainy", "season": "autumn"}
    outfit_result = client.analyze_outfit(weather)
    print("옷차림 분석:", outfit_result)
```

---

## **3. 맥북 서버 - 얼굴 감정 분석**

```python
#!/usr/bin/env python3
# vision_emotion_server.py

import cv2
import numpy as np
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
from transformers import pipeline
import logging

app = Flask(__name__)
CORS(app)
logger = logging.getLogger(__name__)

class FaceEmotionAnalyzer:
    """얼굴 표정 감정 분석기"""
    
    def __init__(self):
        # Hugging Face의 사전 훈련된 감정 분석 모델
        self.emotion_pipeline = pipeline(
            "image-classification",
            model="trpakov/vit-face-expression",
            device=0 if torch.cuda.is_available() else -1
        )
        
        # OpenCV 얼굴 감지기
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        logger.info("얼굴 감정 분석 모델 로딩 완료")
    
    def detect_faces(self, image: np.ndarray) -> list:
        """이미지에서 얼굴 영역 감지"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(30, 30)
        )
        return faces
    
    def analyze_emotion_from_face(self, face_image: np.ndarray) -> dict:
        """얼굴 이미지에서 감정 분석"""
        try:
            # RGB로 변환 (Hugging Face 모델 요구사항)
            face_rgb = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
            
            # 감정 분석 실행
            results = self.emotion_pipeline(face_rgb)
            
            # 결과 정리 (가장 높은 확률의 감정)
            if results:
                best_result = max(results, key=lambda x: x['score'])
                return {
                    'emotion': best_result['label'].lower(),
                    'confidence': best_result['score'],
                    'all_emotions': results
                }
            else:
                return {'emotion': 'neutral', 'confidence': 0.0}
                
        except Exception as e:
            logger.error(f"감정 분석 오류: {e}")
            return {'emotion': 'neutral', 'confidence': 0.0}
    
    def analyze_multiple_photos(self, photos_base64: list) -> dict:
        """여러 장의 사진에서 감정 분석 (정확도 향상)"""
        emotion_results = []
        
        for photo_b64 in photos_base64:
            try:
                # Base64 디코딩
                photo_data = base64.b64decode(photo_b64)
                nparr = np.frombuffer(photo_data, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                # 얼굴 감지
                faces = self.detect_faces(image)
                
                for (x, y, w, h) in faces:
                    # 얼굴 영역 추출
                    face_image = image[y:y+h, x:x+w]
                    
                    # 감정 분석
                    emotion_result = self.analyze_emotion_from_face(face_image)
                    emotion_results.append(emotion_result)
                    
            except Exception as e:
                logger.error(f"사진 처리 오류: {e}")
                continue
        
        # 여러 결과 통합 (가장 많이 나온 감정 + 평균 신뢰도)
        if emotion_results:
            emotions = [r['emotion'] for r in emotion_results]
            confidences = [r['confidence'] for r in emotion_results]
            
            # 가장 빈번한 감정
            from collections import Counter
            most_common_emotion = Counter(emotions).most_common(1)[0][0]
            
            # 해당 감정의 평균 신뢰도
            same_emotion_confidences = [
                conf for emo, conf in zip(emotions, confidences) 
                if emo == most_common_emotion
            ]
            avg_confidence = sum(same_emotion_confidences) / len(same_emotion_confidences)
            
            return {
                'emotion': most_common_emotion,
                'confidence': avg_confidence,
                'total_faces_detected': len(emotion_results),
                'success': True
            }
        else:
            return {
                'emotion': 'neutral',
                'confidence': 0.0,
                'total_faces_detected': 0,
                'success': False,
                'error': 'No faces detected'
            }

# 전역 인스턴스
face_emotion_analyzer = FaceEmotionAnalyzer()

@app.route('/analyze_face_emotion', methods=['POST'])
def analyze_face_emotion():
    """얼굴 감정 분석 API"""
    try:
        data = request.json
        photos = data.get('photos', [])
        
        if not photos:
            return jsonify({'success': False, 'error': 'No photos provided'}), 400
        
        # 감정 분석 실행
        result = face_emotion_analyzer.analyze_multiple_photos(photos)
        
        # 감정에 따른 응답 메시지 생성
        emotion_responses = {
            'happy': '밝은 표정이시네요! 좋은 하루 보내세요!',
            'sad': '조금 우울해 보이시네요. 기분 전환이 필요할 것 같아요.',
            'angry': '화가 나신 것 같아요. 심호흡 한번 해보시겠어요?',
            'surprise': '놀라신 표정이네요!',
            'fear': '걱정스러운 표정이시네요. 괜찮으신가요?',
            'disgust': '불쾌해 보이시네요.',
            'neutral': '평온한 표정이시네요.'
        }
        
        result['response'] = emotion_responses.get(
            result['emotion'], 
            '표정을 통해 기분을 파악했어요!'
        )
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"얼굴 감정 분석 API 오류: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
```

---

## **4. 옷차림 분석 시스템**

```python
# outfit_analyzer.py

from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import torch
import numpy as np

class OutfitAnalyzer:
    """CLIP 모델 기반 옷차림 분석"""
    
    def __init__(self):
        # CLIP 모델 로딩 (이미지-텍스트 매칭)
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        
        # 날씨별 적절한 옷차림 텍스트
        self.weather_clothing_texts = {
            'cold': [
                "person wearing winter coat",
                "person in warm jacket", 
                "person with thick sweater",
                "person wearing scarf and hat"
            ],
            'mild': [
                "person wearing light jacket",
                "person in sweater",
                "person wearing cardigan"
            ],
            'warm': [
                "person wearing t-shirt",
                "person in light clothes",
                "person wearing summer clothes"
            ],
            'hot': [
                "person wearing shorts",
                "person in tank top",
                "person wearing summer dress"
            ]
        }
        
        logger.info("옷차림 분석 모델 로딩 완료")
    
    def determine_weather_category(self, weather_info: dict) -> str:
        """날씨 정보를 카테고리로 분류"""
        temp = weather_info.get('temp', 20)
        condition = weather_info.get('condition', 'clear')
        
        if temp <= 5:
            return 'cold'
        elif temp <= 15:
            return 'mild' 
        elif temp <= 25:
            return 'warm'
        else:
            return 'hot'
    
    def analyze_outfit_appropriateness(self, image: Image.Image, weather_info: dict) -> dict:
        """옷차림이 날씨에 적합한지 분석"""
        try:
            weather_category = self.determine_weather_category(weather_info)
            appropriate_texts = self.weather_clothing_texts[weather_category]
            
            # 부적절한 옷차림 텍스트도 준비
            inappropriate_texts = []
            for category, texts in self.weather_clothing_texts.items():
                if category != weather_category:
                    inappropriate_texts.extend(texts)
            
            # 모든 텍스트 (적절 + 부적절)
            all_texts = appropriate_texts + inappropriate_texts[:4]  # 균형 맞추기
            
            # CLIP으로 이미지-텍스트 유사도 계산
            inputs = self.processor(
                text=all_texts, 
                images=image, 
                return_tensors="pt", 
                padding=True
            )
            
            outputs = self.model(**inputs)
            logits_per_image = outputs.logits_per_image
            probs = logits_per_image.softmax(dim=1)
            
            # 적절한 옷차림 확률 계산
            appropriate_prob = probs[0][:len(appropriate_texts)].sum().item()
            inappropriate_prob = probs[0][len(appropriate_texts):].sum().item()
            
            # 결과 판단
            is_appropriate = appropriate_prob > inappropriate_prob
            confidence = max(appropriate_prob, inappropriate_prob)
            
            return {
                'is_appropriate': is_appropriate,
                'confidence': confidence,
                'weather_category': weather_category,
                'appropriate_probability': appropriate_prob,
                'inappropriate_probability': inappropriate_prob,
                'success': True
            }
            
        except Exception as e:
            logger.error(f"옷차림 분석 오류: {e}")
            return {'success': False, 'error': str(e)}

# Flask API 추가
outfit_analyzer = OutfitAnalyzer()

@app.route('/analyze_outfit', methods=['POST'])
def analyze_outfit():
    """옷차림 분석 API"""
    try:
        data = request.json
        photo_b64 = data.get('photo')
        weather_info = data.get('weather', {})
        
        if not photo_b64:
            return jsonify({'success': False, 'error': 'No photo provided'}), 400
        
        # 이미지 디코딩
        photo_data = base64.b64decode(photo_b64)
        nparr = np.frombuffer(photo_data, np.uint8)
        cv_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        pil_image = Image.fromarray(cv2.cvtColor(cv_image, cv2.COLOR_BGR2RGB))
        
        # 옷차림 분석
        result = outfit_analyzer.analyze_outfit_appropriateness(pil_image, weather_info)
        
        # 응답 메시지 생성
        if result['success']:
            temp = weather_info.get('temp', 20)
            condition = weather_info.get('condition', 'clear')
            
            if result['is_appropriate']:
                result['response'] = f"오늘 날씨({temp}°C, {condition})에 잘 어울리는 옷차림이네요!"
            else:
                if temp <= 10:
                    result['response'] = f"날씨가 춥습니다({temp}°C). 더 따뜻한 옷을 입는 게 좋을 것 같아요!"
                elif temp >= 25:
                    result['response'] = f"날씨가 덥습니다({temp}°C). 더 시원한 옷차림이 좋을 것 같아요!"
                else:
                    result['response'] = f"현재 날씨({temp}°C, {condition})에 조금 더 적합한 옷차림을 권해드려요."
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"옷차림 분석 API 오류: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5051, debug=False, threaded=True)
```

---

## **5. 스마트미러 통합 코드**

```javascript
// js/vision-integration.js

class VisionAnalysisIntegration {
    constructor() {
        this.visionClient = 'http://localhost:5051';  // 맥북 서버
        this.isAnalyzing = false;
    }
    
    async requestFaceEmotionAnalysis() {
        /**
         * 얼굴 감정 분석 요청
         * 라즈베리파이 카메라로 사진을 찍어서 분석
         */
        try {
            if (this.isAnalyzing) {
                console.log('이미 분석 중입니다...');
                return;
            }
            
            this.isAnalyzing = true;
            console.log('📸 얼굴 감정 분석 시작...');
            
            // 라즈베리파이 클라이언트에게 감정 분석 요청
            const response = await fetch('/api/analyze-face-emotion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_time: new Date().toISOString() })
            });
            
            const result = await response.json();
            
            if (result.success) {
                const emotion = result.emotion;
                const confidence = result.confidence;
                const message = result.response;
                
                console.log(`😊 감정 분석 결과: ${emotion} (신뢰도: ${confidence:.2f})`);
                
                // UI에 결과 표시
                this.displayEmotionResult(emotion, confidence, message);
                
                // TTS로 응답
                await this.speakEmotionResponse(message);
                
            } else {
                console.error('감정 분석 실패:', result.error);
            }
            
        } catch (error) {
            console.error('얼굴 감정 분석 오류:', error);
        } finally {
            this.isAnalyzing = false;
        }
    }
    
    async requestOutfitAnalysis() {
        /**
         * 옷차림 분석 요청
         * 현재 날씨와 비교해서 적절한 옷차림인지 체크
         */
        try {
            if (this.isAnalyzing) {
                console.log('이미 분석 중입니다...');
                return;
            }
            
            this.isAnalyzing = true;
            console.log('👔 옷차림 분석 시작...');
            
            // 현재 날씨 정보 가져오기
            const weatherData = await this.getCurrentWeather();
            
            // 라즈베리파이 클라이언트에게 옷차림 분석 요청
            const response = await fetch('/api/analyze-outfit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    weather: weatherData,
                    request_time: new Date().toISOString() 
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                const isAppropriate = result.is_appropriate;
                const confidence = result.confidence;
                const message = result.response;
                
                console.log(`👔 옷차림 분석 결과: ${isAppropriate ? '적절' : '부적절'} (신뢰도: ${confidence:.2f})`);
                
                // UI에 결과 표시
                this.displayOutfitResult(isAppropriate, confidence, message, weatherData);
                
                // TTS로 응답
                await this.speakOutfitResponse(message);
                
            } else {
                console.error('옷차림 분석 실패:', result.error);
            }
            
        } catch (error) {
            console.error('옷차림 분석 오류:', error);
        } finally {
            this.isAnalyzing = false;
        }
    }
    
    displayEmotionResult(emotion, confidence, message) {
        /**
         * 감정 분석 결과 UI 표시
         */
        const emotionPanel = document.createElement('div');
        emotionPanel.className = 'emotion-result-panel';
        emotionPanel.innerHTML = `
            <div class="emotion-icon">${this.getEmotionEmoji(emotion)}</div>
            <div class="emotion-text">
                <h3>감정 분석 결과</h3>
                <p>감지된 감정: <strong>${this.translateEmotion(emotion)}</strong></p>
                <p>신뢰도: ${(confidence * 100).toFixed(1)}%</p>
                <p class="emotion-message">${message}</p>
            </div>
        `;
        
        // 기존 패널 제거하고 새 패널 추가
        const existingPanel = document.querySelector('.emotion-result-panel');
        if (existingPanel) existingPanel.remove();
        
        document.body.appendChild(emotionPanel);
        
        // 5초 후 자동 제거
        setTimeout(() => {
            if (emotionPanel.parentNode) {
                emotionPanel.remove();
            }
        }, 5000);
    }
    
    displayOutfitResult(isAppropriate, confidence, message, weatherData) {
        /**
         * 옷차림 분석 결과 UI 표시
         */
        const outfitPanel = document.createElement('div');
        outfitPanel.className = 'outfit-result-panel';
        outfitPanel.innerHTML = `
            <div class="outfit-icon">${isAppropriate ? '👍' : '👎'}</div>
            <div class="outfit-text">
                <h3>옷차림 체크 결과</h3>
                <p>현재 날씨: ${weatherData.temp}°C, ${weatherData.condition}</p>
                <p>적절성: <strong>${isAppropriate ? '적절함' : '개선 필요'}</strong></p>
                <p>신뢰도: ${(confidence * 100).toFixed(1)}%</p>
                <p class="outfit-message">${message}</p>
            </div>
        `;
        
        // 기존 패널 제거하고 새 패널 추가
        const existingPanel = document.querySelector('.outfit-result-panel');
        if (existingPanel) existingPanel.remove();
        
        document.body.appendChild(outfitPanel);
        
        // 8초 후 자동 제거
        setTimeout(() => {
            if (outfitPanel.parentNode) {
                outfitPanel.remove();
            }
        }, 8000);
    }
    
    getEmotionEmoji(emotion) {
        const emojiMap = {
            'happy': '😊',
            'sad': '😢', 
            'angry': '😠',
            'surprise': '😲',
            'fear': '😰',
            'disgust': '🤢',
            'neutral': '😐'
        };
        return emojiMap[emotion] || '🙂';
    }
    
    translateEmotion(emotion) {
        const translationMap = {
            'happy': '기쁨',
            'sad': '슬픔',
            'angry': '화남',
            'surprise': '놀람', 
            'fear': '두려움',
            'disgust': '혐오',
            'neutral': '무표정'
        };
        return translationMap[emotion] || emotion;
    }
    
    async getCurrentWeather() {
        // 기존 날씨 API 활용
        try {
            const response = await fetch('/api/weather');
            return await response.json();
        } catch (error) {
            console.error('날씨 정보 가져오기 실패:', error);
            return { temp: 20, condition: 'unknown', season: 'unknown' };
        }
    }
    
    async speakEmotionResponse(message) {
        // 기존 TTS 시스템 활용
        if (typeof safeTTS === 'function') {
            await safeTTS(message);
        }
    }
    
    async speakOutfitResponse(message) {
        // 기존 TTS 시스템 활용
        if (typeof safeTTS === 'function') {
            await safeTTS(message);
        }
    }
}

// 전역 인스턴스 생성
const visionAnalysis = new VisionAnalysisIntegration();
```

---

## **6. 음성 명령 통합**

```javascript
// conversation.js에 추가할 핸들러

const handleVisionCommand = async (command, dependencies, emotion) => {
    /**
     * 비전 분석 관련 음성 명령 처리
     */
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('표정') || lowerCommand.includes('감정') || 
        lowerCommand.includes('기분')) {
        // 얼굴 감정 분석 요청
        log.info('얼굴 감정 분석 요청');
        await visionAnalysis.requestFaceEmotionAnalysis();
        
        return {
            response: "표정을 통해 감정을 분석해드리겠습니다. 카메라를 보고 잠시 기다려주세요.",
            emotion: emotion
        };
    }
    
    if (lowerCommand.includes('옷') || lowerCommand.includes('차림') || 
        lowerCommand.includes('스타일') || lowerCommand.includes('패션')) {
        // 옷차림 분석 요청
        log.info('옷차림 분석 요청');
        await visionAnalysis.requestOutfitAnalysis();
        
        return {
            response: "현재 옷차림이 날씨에 적합한지 확인해드리겠습니다. 전신이 잘 보이도록 서주세요.",
            emotion: emotion
        };
    }
    
    return null;  // 비전 관련 명령이 아님
};

// processRecognizedCommand 함수에서 호출
// 기존 명령 처리 전에 비전 명령 체크 추가
const visionResult = await handleVisionCommand(command, dependencies, emotionData);
if (visionResult) {
    return visionResult;
}
```

---

## **🎯 구현 계획 및 단계**

### **1단계: 기본 환경 설정**
- 라즈베리파이에 OpenCV, requests 설치
- 맥북에 Flask, transformers, CLIP 모델 설치
- 웹캠 테스트 및 네트워크 연결 확인

### **2단계: 얼굴 감정 분석 구현**
- 라즈베리파이 카메라 클라이언트 개발
- 맥북 서버에서 얼굴 감지 + 감정 분석
- 결과 연동 및 UI 표시

### **3단계: 옷차림 분석 구현**  
- CLIP 모델로 의류 분석 시스템 개발
- 날씨 정보와 연동하여 적절성 판단
- 사용자 피드백 시스템 구축

### **4단계: 스마트미러 통합**
- 기존 음성 명령 시스템과 통합
- UI/UX 개선 및 사용성 향상
- 성능 최적화 및 안정성 보강

## **🔧 필요한 라이브러리**

### **라즈베리파이**
```bash
pip install opencv-python requests numpy
```

### **맥북 서버**
```bash
pip install flask flask-cors torch torchvision transformers
pip install opencv-python pillow clip-by-openai
pip install accelerate
```

이 시스템으로 "미러야, 내 표정 어때?" 또는 "미러야, 내 옷차림 어때?"라고 말하면 실시간으로 분석해서 피드백을 받을 수 있습니다! 🎯