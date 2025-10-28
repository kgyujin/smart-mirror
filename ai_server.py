#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
통합 AI 분석 서버 - 스마트 미러용
- 음성 감정 분석 (librosa + 딥러닝)
- 얼굴 표정 분석 (trpakov/vit-face-expression)
- 옷차림 적절성 분석 (OpenAI CLIP)
"""

import os
import io
import json
import base64
import logging
import tempfile
import warnings
from typing import List, Dict, Any, Tuple, Optional
from collections import Counter

import cv2
import torch
import numpy as np
from PIL import Image, ImageEnhance
import librosa
from transformers import pipeline, CLIPProcessor, CLIPModel
from flask import Flask, request, jsonify
from flask_cors import CORS
try:
    import openai
    # OpenAI 라이브러리 버전 확인
    openai_version = getattr(openai, '__version__', 'unknown')
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    openai_version = None
import asyncio
import requests
from datetime import datetime

# 경고 메시지 숨기기
warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

# 개선된 로깅 설정
import sys
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()

# 로그 레벨 매핑
level_mapping = {
    'DEBUG': logging.DEBUG,
    'INFO': logging.INFO,
    'WARN': logging.WARNING,
    'WARNING': logging.WARNING,
    'ERROR': logging.ERROR
}

# 커스텀 포맷터
class SmartMirrorFormatter(logging.Formatter):
    """스마트 미러 전용 로그 포맷터"""
    
    def __init__(self):
        super().__init__()
        self.log_level = LOG_LEVEL
        
        # 이모지 매핑 (INFO 레벨에서는 핵심만)
        self.emojis = {
            'DEBUG': '🔍',
            'INFO': '',      # INFO는 이모지 없이 깔끔하게
            'WARNING': '⚠️',
            'ERROR': '❌',
            'CRITICAL': '💥'
        }
    
    def format(self, record):
        # LOG_LEVEL에 따른 포맷 조정
        if self.log_level == 'INFO':
            # 발표용 간결한 포맷
            emoji = self.emojis.get(record.levelname, '')
            prefix = f"{emoji} " if emoji else ""
            return f"{prefix}{record.getMessage()}"
        else:
            # DEBUG 모드 - 상세 정보 포함
            emoji = self.emojis.get(record.levelname, '')
            timestamp = self.formatTime(record, '%H:%M:%S')
            return f"[{timestamp}] [{record.levelname}] {emoji}{record.getMessage()}"

# 로깅 설정
logging.basicConfig(
    level=level_mapping.get(LOG_LEVEL, logging.INFO),
    format='%(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)
# 커스텀 포맷터 적용
for handler in logger.handlers:
    handler.setFormatter(SmartMirrorFormatter())

# 로그 레벨 정보 출력
logger.info(f"AI 서버 로그 레벨: {LOG_LEVEL}")

app = Flask(__name__)
CORS(app)

class WeatherService:
    """OpenWeather API를 사용한 날씨 정보 서비스"""
    
    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get('OPENWEATHER_API_KEY')
        self.base_url = "http://api.openweathermap.org/data/2.5/weather"
        self.enabled = bool(self.api_key)
        
        if not self.enabled:
            logger.warning("OpenWeather API 키가 설정되지 않음. 기본 날씨값 사용")
        else:
            logger.info(f"OpenWeather API 연동 활성화: {'*' * (len(self.api_key)-4)}{self.api_key[-4:]}")
    
    def get_weather_data(self, city="Seoul", country_code="KR"):
        """
        현재 날씨 정보 가져오기
        
        Args:
            city: 도시명 (기본값: Seoul)
            country_code: 국가 코드 (기본값: KR)
            
        Returns:
            dict: 날씨 정보 또는 기본값
        """
        if not self.enabled:
            return self._get_default_weather()
        
        try:
            params = {
                'q': f"{city},{country_code}",
                'appid': self.api_key,
                'units': 'metric',  # 섭씨 온도
                'lang': 'kr'       # 한국어 설명
            }
            
            response = requests.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()
            
            weather_data = response.json()
            
            # 응답 데이터 파싱
            result = {
                'temperature': round(weather_data['main']['temp']),
                'temp': round(weather_data['main']['temp']),
                'feels_like': round(weather_data['main']['feels_like']),
                'humidity': weather_data['main']['humidity'],
                'condition': weather_data['weather'][0]['main'].lower(),
                'description': weather_data['weather'][0]['description'],
                'city': weather_data['name'],
                'country': weather_data['sys']['country'],
                'timestamp': datetime.now().isoformat()
            }
            
            logger.info(f"날씨 정보 수신 완료: {result['city']} {result['temp']}°C ({result['description']})")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"OpenWeather API 요청 실패: {e}")
            return self._get_default_weather()
        except KeyError as e:
            logger.error(f"날씨 데이터 파싱 실패: {e}")
            return self._get_default_weather()
        except Exception as e:
            logger.error(f"예상치 못한 날씨 API 오류: {e}")
            return self._get_default_weather()
    
    def _get_default_weather(self):
        """API 실패 시 기본 날씨 정보"""
        return {
            'temperature': 20,
            'temp': 20,
            'feels_like': 20,
            'humidity': 50,
            'condition': 'clear',
            'description': '맑음',
            'city': 'Seoul',
            'country': 'KR',
            'timestamp': datetime.now().isoformat()
        }

class IntegratedAIServer:
    def __init__(self):
        """통합 AI 분석 서버 초기화"""
        logger.info("🚀 통합 AI 분석 서버 초기화 중...")
        
        # GPU 사용 가능 여부 확인
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"🔧 사용 디바이스: {self.device}")
        
        # OpenAI API 설정
        self.openai_api_key = os.environ.get('OPENAI_API_KEY')
        self.use_chatgpt = HAS_OPENAI and self.openai_api_key
        
        if self.use_chatgpt:
            try:
                # OpenAI 클라이언트 초기화 (v1.0+ 방식)
                if openai_version and openai_version >= '1.0.0':
                    self.openai_client = openai.OpenAI(api_key=self.openai_api_key)
                else:
                    # 구버전 방식
                    openai.api_key = self.openai_api_key
                    self.openai_client = None
                    
                logger.info(f"ChatGPT API 연결 설정 완료 (OpenAI v{openai_version})")
            except Exception as e:
                logger.error(f"ChatGPT API 초기화 실패: {e}")
                self.use_chatgpt = False
        else:
            if not HAS_OPENAI:
                logger.warning("OpenAI 패키지가 설치되지 않음. 설치: pip install openai")
            if not self.openai_api_key:
                logger.warning("OPENAI_API_KEY 환경변수가 설정되지 않음. setup_openai.sh 참고")
            logger.info("규칙 기반 응답 시스템 사용")
        
        # 날씨 서비스 초기화
        self.weather_service = WeatherService()
        
        # 모든 AI 모델 초기화
        self._init_emotion_models()
        self._init_clip_model()
        self._init_face_detector()
        
        # 감정 라벨 매핑
        self.emotion_labels = {
            'LABEL_0': 'angry', 'LABEL_1': 'disgust', 'LABEL_2': 'fear',
            'LABEL_3': 'happy', 'LABEL_4': 'neutral', 'LABEL_5': 'sad',
            'LABEL_6': 'surprise',
            # 직접 매핑 지원
            'angry': 'angry', 'disgust': 'disgust', 'fear': 'fear',
            'happy': 'happy', 'neutral': 'neutral', 'sad': 'sad',
            'surprise': 'surprise'
        }
        
        # 감정별 자연스러운 응답 메시지
        self.emotion_responses = {
            'happy': [
                "밝은 표정이시네요! 좋은 하루 보내세요!",
                "기분이 좋아 보이네요! 행복한 하루 되세요!",
                "웃는 모습이 정말 아름다워요!"
            ],
            'sad': [
                "조금 우울해 보이시네요. 힘내세요!",
                "목소리 톤을 들어보니 조금 가라앉으신 것 같네요. 괜찮으신가요?",
                "힘든 시간이지만 이겨내실 수 있을 거예요!"
            ],
            'angry': [
                "화가 나신 것 같네요. 심호흡을 한번 해보세요.",
                "스트레스가 많으신가 봐요. 잠시 휴식을 취하시는 건 어떠세요?",
                "마음을 진정시키는 시간이 필요해 보여요."
            ],
            'surprise': [
                "표정을 보니 놀라신 것 같네요! 무슨 일이 있으셨나요?",
                "깜짝 놀라신 모습이에요!",
                "예상치 못한 일이 있으셨나 봐요!"
            ],
            'fear': [
                "불안해 보이시네요. 괜찮으실 거예요.",
                "걱정이 많으신 것 같아요. 차근차근 해결해보세요.",
                "두려워하지 마세요. 모든 일이 잘 될 거예요."
            ],
            'disgust': [
                "불쾌한 일이 있으셨나요? 기분 전환하시는 건 어떠세요?",
                "싫은 일이 있으셨다면 잊고 좋은 생각해요!",
                "불편한 상황이 있으셨나 봐요."
            ],
            'neutral': [
                "차분한 표정이시네요.",
                "평온한 모습이에요.",
                "안정적인 상태로 보이네요."
            ]
        }
        
        logger.info("✅ 통합 AI 분석 서버 초기화 완료!")
    
    def _init_emotion_models(self):
        """감정 분석 모델들 초기화"""
        try:
            # 얼굴 표정 분석 모델
            logger.info("📷 얼굴 표정 감정 분석 모델 로딩 중...")
            self.face_emotion_classifier = pipeline(
                "image-classification",
                model="trpakov/vit-face-expression",
                device=0 if self.device.type == "cuda" else -1
            )
            logger.info("✅ 표정 분석 모델 로딩 완료!")
            
            # 음성 감정 분석용 특성 추출 준비
            logger.info("🎤 음성 감정 분석 준비 완료!")
            
        except Exception as e:
            logger.error(f"❌ 감정 분석 모델 로딩 실패: {e}")
            raise
    
    def _init_clip_model(self):
        """CLIP 모델 초기화 (옷차림 분석용)"""
        try:
            logger.info("👔 CLIP 모델 로딩 중...")
            self.clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
            self.clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
            self.clip_model = self.clip_model.to(self.device)
            logger.info("✅ CLIP 모델 로딩 완료!")
        except Exception as e:
            logger.error(f"❌ CLIP 모델 로딩 실패: {e}")
            raise
    
    def _init_face_detector(self):
        """얼굴 탐지용 Haar Cascade 초기화"""
        try:
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self.face_cascade = cv2.CascadeClassifier(cascade_path)
            
            if self.face_cascade.empty():
                raise ValueError("얼굴 탐지 모델을 로드할 수 없습니다.")
            
            logger.info("✅ 얼굴 탐지 모델 로딩 완료!")
        except Exception as e:
            logger.error(f"❌ 얼굴 탐지 모델 로딩 실패: {e}")
            raise

    # ========== 공통 유틸리티 함수들 ==========
    
    def base64_to_image(self, base64_str: str) -> np.ndarray:
        """Base64 문자열을 OpenCV 이미지로 변환"""
        try:
            image_data = base64.b64decode(base64_str)
            pil_image = Image.open(io.BytesIO(image_data))
            
            if pil_image.mode == 'RGBA':
                pil_image = pil_image.convert('RGB')
            
            opencv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            return opencv_image
        except Exception as e:
            logger.error(f"Base64 이미지 변환 실패: {e}")
            raise
    
    def base64_to_audio(self, base64_str: str) -> Tuple[np.ndarray, int]:
        """Base64 문자열을 오디오 데이터로 변환"""
        try:
            audio_data = base64.b64decode(base64_str)
            
            # 임시 파일로 저장
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name
            
            try:
                # librosa로 오디오 로드
                y, sr = librosa.load(temp_path, sr=22050)
                return y, sr
            finally:
                # 임시 파일 삭제
                try:
                    os.unlink(temp_path)
                except:
                    pass
                    
        except Exception as e:
            logger.error(f"Base64 오디오 변환 실패: {e}")
            raise
    
    def detect_faces(self, image: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """이미지에서 얼굴 영역 탐지"""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)  # 조명 보정
            
            faces = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.05,
                minNeighbors=3,
                minSize=(30, 30),
                flags=cv2.CASCADE_SCALE_IMAGE
            )
            
            # numpy array를 list of tuple로 변환
            if isinstance(faces, np.ndarray) and faces.shape[0] > 0:
                return [tuple(face.tolist()) for face in faces]
            return []
            
        except Exception as e:
            logger.error(f"얼굴 탐지 실패: {e}")
            return []

    # ========== 음성 감정 분석 ==========
    
    def extract_audio_features(self, y: np.ndarray, sr: int) -> Dict[str, float]:
        """오디오에서 감정 분석용 특성 추출"""
        try:
            # 기본 특성들
            features = {}
            
            # 1. Pitch 관련 특성
            pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
            pitch_mean = np.mean(pitches[pitches > 0]) if len(pitches[pitches > 0]) > 0 else 0
            features['pitch_mean'] = pitch_mean
            
            # 2. Energy 특성
            energy = np.sum(y ** 2) / len(y)
            features['energy'] = energy
            
            # 3. Zero Crossing Rate
            zcr = librosa.feature.zero_crossing_rate(y)[0]
            features['zcr_mean'] = np.mean(zcr)
            features['zcr_std'] = np.std(zcr)
            
            # 4. Spectral 특성
            spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            features['spectral_centroid_mean'] = np.mean(spectral_centroids)
            
            # 5. MFCC 특성 (처음 13개)
            mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            for i in range(13):
                features[f'mfcc_{i}_mean'] = np.mean(mfccs[i])
                features[f'mfcc_{i}_std'] = np.std(mfccs[i])
            
            return features
            
        except Exception as e:
            logger.error(f"오디오 특성 추출 실패: {e}")
            return {}
    
    def analyze_voice_emotion_simple(self, features: Dict[str, float]) -> Dict[str, Any]:
        """간단한 룰 기반 음성 감정 분석"""
        try:
            # 기본값
            emotion = 'neutral'
            confidence = 0.5
            
            # 간단한 룰 기반 분류
            energy = features.get('energy', 0)
            pitch_mean = features.get('pitch_mean', 0)
            zcr_mean = features.get('zcr_mean', 0)
            
            # 에너지와 피치 기반 분류
            if energy > 0.01 and pitch_mean > 200:
                emotion = 'happy'
                confidence = 0.7
            elif energy > 0.008 and zcr_mean > 0.1:
                emotion = 'angry'
                confidence = 0.6
            elif energy < 0.003:
                emotion = 'sad'
                confidence = 0.6
            elif pitch_mean > 250:
                emotion = 'surprise'
                confidence = 0.6
            
            return {
                'emotion': emotion,
                'confidence': confidence,
                'features': features
            }
            
        except Exception as e:
            logger.error(f"음성 감정 분석 실패: {e}")
            return {'emotion': 'neutral', 'confidence': 0.0, 'features': {}}

    # ========== 얼굴 표정 분석 ==========
    
    def analyze_single_face_emotion(self, image: np.ndarray) -> Optional[Dict[str, Any]]:
        """단일 이미지에서 얼굴 감정 분석"""
        try:
            faces = self.detect_faces(image)
            
            if len(faces) == 0:
                return None
            
            # 가장 큰 얼굴 선택
            if len(faces) > 1:
                faces = sorted(faces, key=lambda x: x[2] * x[3], reverse=True)
            
            x, y, w, h = faces[0]
            
            # 얼굴 크기 확인
            if w < 30 or h < 30:
                return None
            
            # 얼굴 영역 추출 (여백 추가)
            margin_ratio = 0.3 if min(w, h) < 80 else 0.2
            margin = int(min(w, h) * margin_ratio)
            x_margin = max(0, x - margin)
            y_margin = max(0, y - margin)
            w_margin = min(image.shape[1], x + w + margin) - x_margin
            h_margin = min(image.shape[0], y + h + margin) - y_margin
            
            face_image = image[y_margin:y_margin+h_margin, x_margin:x_margin+w_margin]
            
            # PIL로 변환 및 크기 조정
            face_rgb = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
            face_pil = Image.fromarray(face_rgb)
            face_pil_resized = face_pil.resize((224, 224), Image.Resampling.LANCZOS)
            
            # 작은 얼굴 선명도 향상
            if min(w, h) < 80:
                enhancer = ImageEnhance.Sharpness(face_pil_resized)
                face_pil_resized = enhancer.enhance(1.5)
            
            # 감정 분석
            result = self.face_emotion_classifier(face_pil_resized)
            
            if result and len(result) > 0:
                top_result = result[0]
                emotion_label = self.emotion_labels.get(top_result['label'], 'neutral')
                confidence = top_result['score']
                
                return {
                    'emotion': emotion_label,
                    'confidence': float(confidence),
                    'face_coords': [int(x), int(y), int(w), int(h)]
                }
            
            return None
            
        except Exception as e:
            logger.error(f"단일 얼굴 감정 분석 실패: {e}")
            return None
    
    def analyze_multiple_face_emotions(self, images: List[np.ndarray]) -> Dict[str, Any]:
        """여러 이미지에서 가장 빈번한 감정 분석"""
        try:
            emotions = []
            confidences = []
            
            for i, image in enumerate(images):
                result = self.analyze_single_face_emotion(image)
                if result:
                    emotions.append(result['emotion'])
                    confidences.append(result['confidence'])
                    logger.info(f"사진 {i+1}: {result['emotion']} (신뢰도: {result['confidence']:.2f})")
            
            if not emotions:
                return {
                    'success': False,
                    'error': 'No faces detected in any image',
                    'emotion': None,
                    'confidence': 0.0
                }
            
            # 가장 빈번한 감정 선택
            emotion_counts = Counter(emotions)
            most_frequent_emotion = emotion_counts.most_common(1)[0][0]
            
            # 해당 감정의 평균 신뢰도 계산
            emotion_confidences = [conf for emotion, conf in zip(emotions, confidences) 
                                 if emotion == most_frequent_emotion]
            avg_confidence = np.mean(emotion_confidences)
            
            logger.info(f"✅ 최종 감정: {most_frequent_emotion} (신뢰도: {avg_confidence:.2f})")
            
            return {
                'success': True,
                'emotion': most_frequent_emotion,
                'confidence': float(avg_confidence),
                'all_emotions': emotions,
                'emotion_counts': dict(emotion_counts)
            }
            
        except Exception as e:
            logger.error(f"다중 얼굴 감정 분석 실패: {e}")
            return {
                'success': False,
                'error': str(e),
                'emotion': None,
                'confidence': 0.0
            }

    # ========== 옷차림 분석 ==========
    
    def get_weather_category(self, temp: float) -> str:
        """온도 기반 날씨 카테고리 분류"""
        if temp <= 0:
            return 'very_cold'
        elif temp <= 10:
            return 'cold'
        elif temp <= 20:
            return 'mild'
        elif temp <= 28:
            return 'warm'
        else:
            return 'hot'
    
    def get_outfit_prompts(self, weather_category: str) -> Tuple[List[str], List[str]]:
        """날씨별 옷차림 프롬프트"""
        outfit_prompts = {
            'very_cold': {
                'appropriate': [
                    "thick winter jacket or heavy coat",
                    "warm padded clothing or winter wear",
                    "sweater and scarf or winter outfit",
                    "layered warm clothing or winter attire"
                ],
                'inappropriate': [
                    "thin t-shirt or tank top",
                    "light summer clothing or short sleeves",
                    "bare arms or sleeveless outfit"
                ]
            },
            'cold': {
                'appropriate': [
                    "jacket or long sleeve shirt",
                    "sweater or cardigan",
                    "layered clothing or warm outfit",
                    "long sleeves or covered arms"
                ],
                'inappropriate': [
                    "t-shirt or tank top",
                    "short sleeves or bare arms",
                    "summer dress or light top"
                ]
            },
            'mild': {
                'appropriate': [
                    "light jacket or cardigan",
                    "long sleeve shirt or casual top",
                    "comfortable layered clothing",
                    "spring or fall outfit"
                ],
                'inappropriate': [
                    "heavy winter coat or thick jacket",
                    "very light summer clothes or tank top",
                    "thick padded clothing"
                ]
            },
            'warm': {
                'appropriate': [
                    "short sleeve t-shirt",
                    "thin sleeveless tank top",
                    "light summer shirt with bare arms",
                    "breathable cotton short sleeves"
                ],
                'inappropriate': [
                    "thick jacket or windbreaker",
                    "heavy coat or padded clothing",
                    "long sleeve sweater or warm layers"
                ]
            },
            'hot': {
                'appropriate': [
                    "light summer clothing or tank top",
                    "thin fabric or sleeveless top",
                    "very light clothes or summer wear",
                    "minimal clothing or breathable fabric"
                ],
                'inappropriate': [
                    "jacket or long sleeves",
                    "heavy clothing or thick fabric",
                    "winter clothes or warm outfit"
                ]
            }
        }
        
        prompts = outfit_prompts.get(weather_category, outfit_prompts['mild'])
        return prompts['appropriate'], prompts['inappropriate']
    
    def analyze_outfit_appropriateness(self, image: np.ndarray, weather_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """CLIP을 사용한 옷차림 적절성 분석"""
        try:
        # 날씨 정보가 없으면 API에서 가져오기
        if not weather_data:
            weather_data = self.weather_service.get_weather_data()
            logger.info(f"AI 서버에서 직접 날씨 정보 획득: {weather_data}")
        
        temp = weather_data.get('temp') or weather_data.get('temperature', 20)
        condition = weather_data.get('condition', 'clear')
        description = weather_data.get('description', '맑음')
        
        weather_category = self.get_weather_category(temp)
        logger.info(f"옷차림 분석용 날씨: {temp}°C, {description} (카테고리: {weather_category})")            appropriate_prompts, inappropriate_prompts = self.get_outfit_prompts(weather_category)
            
            # OpenCV 이미지를 PIL로 변환
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb_image)
            
            # 모든 프롬프트를 한 번에 처리
            all_prompts = appropriate_prompts + inappropriate_prompts
            
            inputs = self.clip_processor(text=all_prompts, images=pil_image, 
                                       return_tensors="pt", padding=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            with torch.no_grad():
                outputs = self.clip_model(**inputs)
                logits_per_image = outputs.logits_per_image
                probs = torch.softmax(logits_per_image, dim=1)[0]
            
            # 적절한/부적절한 점수 분리
            num_appropriate = len(appropriate_prompts)
            appropriate_scores = probs[:num_appropriate].cpu().numpy()
            inappropriate_scores = probs[num_appropriate:].cpu().numpy()
            
            # 최대값 기준 판단
            max_appropriate = float(np.max(appropriate_scores))
            max_inappropriate = float(np.max(inappropriate_scores))
            
            is_appropriate = bool(max_appropriate > max_inappropriate)
            confidence = float(abs(max_appropriate - max_inappropriate))
            
            # 응답 메시지 생성
            response_message = self._generate_outfit_response(
                is_appropriate, weather_category, temp, weather_data.get('condition', '')
            )
            
            return {
                'success': True,
                'is_appropriate': is_appropriate,
                'confidence': confidence,
                'weather_category': weather_category,
                'temperature': temp,
                'condition': weather_data.get('condition', ''),
                'appropriate_score': max_appropriate,
                'inappropriate_score': max_inappropriate,
                'response_message': response_message
            }
            
        except Exception as e:
            logger.error(f"옷차림 분석 실패: {e}")
            return {
                'success': False,
                'error': str(e),
                'is_appropriate': False,
                'confidence': 0.0
            }
    
    def _generate_outfit_response(self, is_appropriate: bool, weather_category: str, 
                                temp: float, condition: str) -> str:
        """옷차림 분석 결과 메시지 생성"""
        temp_str = f"{temp}°C"
        
        if is_appropriate:
            messages = {
                'very_cold': f"매우 추운 날씨({temp_str})에 잘 맞는 옷차림이네요! 따뜻하게 입으셨어요.",
                'cold': f"쌀쌀한 날씨({temp_str})에 적절한 옷차림입니다. 좋은 선택이에요!",
                'mild': f"선선한 날씨({temp_str})에 딱 맞는 옷차림이네요!",
                'warm': f"따뜻한 날씨({temp_str})에 시원하게 잘 입으셨어요!",
                'hot': f"더운 날씨({temp_str})에 시원한 옷차림이에요. 완벽해요!"
            }
        else:
            messages = {
                'very_cold': f"매우 추운 날씨({temp_str})입니다. 좀 더 따뜻하게 입으시는 게 좋겠어요!",
                'cold': f"쌀쌀한 날씨({temp_str})에는 외투를 챙기시는 게 어떨까요?",
                'mild': f"선선한 날씨({temp_str})입니다. 가벼운 겉옷이 있으면 좋을 것 같아요!",
                'warm': f"따뜻한 날씨({temp_str})입니다. 조금 더 시원하게 입어도 괜찮을 것 같아요!",
                'hot': f"더운 날씨({temp_str})입니다. 좀 더 가볍게 입으시는 게 어떨까요?"
            }
        
        return messages.get(weather_category, f"현재 날씨는 {temp_str}입니다.")

    # ========== ChatGPT 기반 자연스러운 응답 생성 ==========
    
    def generate_chatgpt_response(self, emotion: str, confidence: float, 
                                user_text: str = None, analysis_type: str = "emotion") -> str:
        """
        ChatGPT API를 사용하여 자연스러운 응답 생성
        
        Args:
            emotion: 분석된 감정 (happy, sad, angry, etc.)
            confidence: 신뢰도 (0.0 ~ 1.0)
            user_text: 사용자 발화 내용 (선택)
            analysis_type: 분석 유형 ("emotion", "outfit", "combined")
        
        Returns:
            자연스러운 응답 메시지
        """
        if not self.use_chatgpt:
            return self.generate_fallback_response(emotion, confidence, analysis_type)
        
        try:
            # 감정별 컨텍스트 설정
            emotion_context = {
                'happy': '기쁘고 행복한 상태',
                'sad': '슬프거나 우울한 상태', 
                'angry': '화나거나 짜증난 상태',
                'surprise': '놀라거나 깜짝 놀란 상태',
                'fear': '불안하거나 두려운 상태',
                'disgust': '불쾌하거나 싫어하는 상태',
                'neutral': '평온하고 중립적인 상태'
            }
            
            # 신뢰도에 따른 확신도 표현
            confidence_level = "매우 확신" if confidence > 0.8 else "어느정도 확신" if confidence > 0.6 else "약간 추측"
            
            # 프롬프트 구성
            system_prompt = """
            당신은 스마트 미러 AI 어시스턴트입니다. 사용자의 감정을 분석한 후 
            친근하고 공감적이며 자연스러운 톤으로 대화하세요.
            
            응답 규칙:
            1. 한국어로 대화하세요
            2. 친근하고 따뜻한 말투를 사용하세요
            3. 2-3문장 정도로 간결하게 답하세요
            4. 감정에 맞는 공감과 격려를 해주세요
            5. 로봇 같지 않고 인간적인 느낌으로 대화하세요
            """
            
            user_prompt = f"""
            감정 분석 결과:
            - 감정: {emotion} ({emotion_context.get(emotion, emotion)})
            - 신뢰도: {confidence:.2f} ({confidence_level}함)
            """
            
            if user_text:
                user_prompt += f"\n- 사용자 발화: \"{user_text}\""
            
            user_prompt += f"\n\n이 상황에서 {emotion_context.get(emotion, emotion)}인 사용자에게 어떻게 말해주면 좋을까요?"
            
            # ChatGPT API 호출 (버전별 호환성)
            if self.openai_client:
                # OpenAI v1.0+ 방식
                response = self.openai_client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    max_tokens=150,
                    temperature=0.7,
                    timeout=10
                )
            else:
                # 구버전 방식
                response = openai.ChatCompletion.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    max_tokens=150,
                    temperature=0.7,
                    timeout=10
                )
            
            # 응답 추출 (버전별 호환성)
            if hasattr(response.choices[0], 'message'):
                chatgpt_response = response.choices[0].message.content.strip()
            else:
                chatgpt_response = response.choices[0]['message']['content'].strip()
                
            logger.info(f"ChatGPT 응답 생성 완료 ({emotion}, {confidence:.2f})")
            return chatgpt_response
            
        except Exception as e:
            logger.error(f"ChatGPT 응답 생성 실패: {e}")
            return self.generate_fallback_response(emotion, confidence, analysis_type)
    
    def generate_fallback_response(self, emotion: str, confidence: float, analysis_type: str = "emotion") -> str:
        """
        ChatGPT 실패 시 사용할 fallback 응답 (기존 규칙 기반 응답 개선)
        """
        # 기존 응답을 더 자연스럽게 개선
        improved_responses = {
            'happy': [
                "와, 정말 좋은 기분이시네요! 오늘 하루도 이렇게 밝게 보내세요.",
                "행복한 표정이 보기 좋아요! 무슨 좋은 일이 있으셨나봐요?",
                "기쁜 모습을 보니 저도 덩달아 기분이 좋아져요. 계속 웃어주세요!"
            ],
            'sad': [
                "힘들어 보이시네요. 괜찮으시면 이야기해보세요, 제가 들어드릴게요.",
                "조금 우울해 보이는데, 이런 날도 있는 거죠. 천천히 기분 풀어가세요.",
                "마음이 무거우신가 봐요. 잠시 쉬시면서 좋은 생각해보시는 건 어때요?"
            ],
            'angry': [
                "화가 나신 것 같네요. 심호흡 한번 해보시고 마음을 진정시켜보세요.",
                "스트레스 받는 일이 있으셨나봐요. 잠깐 마음을 가라앉히는 시간을 가져보세요.",
                "짜증나는 일이 있으셨군요. 조금씩 마음을 풀어보시면 어떨까요?"
            ],
            'surprise': [
                "어머, 깜짝 놀라신 표정이에요! 무슨 일이 있으셨나요?",
                "정말 놀라신 것 같네요! 좋은 소식이길 바라요.",
                "표정을 보니 뭔가 예상치 못한 일이 있으셨나봐요!"
            ],
            'fear': [
                "불안해 보이시는데, 괜찮으세요? 천천히 마음을 진정시켜보세요.",
                "걱정이 있으신 것 같아요. 차근차근 해결해 나가시면 될 거예요.",
                "조금 두려워 보이시네요. 모든 게 잘 될 거예요, 걱정 마세요."
            ],
            'disgust': [
                "뭔가 불쾌한 일이 있으셨나요? 기분 전환할 시간을 가져보세요.",
                "싫은 일이 있으셨군요. 잠시 다른 생각으로 마음을 돌려보시는 건 어때요?",
                "불편하셨나봐요. 좋은 일들로 마음을 채워보세요."
            ],
            'neutral': [
                "평온한 모습이시네요. 차분한 하루 보내고 계시는군요.",
                "안정적인 상태로 보이세요. 이런 평안함도 좋은 것 같아요.",
                "차분해 보이시는데, 마음이 편안하신가봐요."
            ]
        }
        
        responses = improved_responses.get(emotion, improved_responses['neutral'])
        import random
        return random.choice(responses)

    # ========== 통합 감정 분석 ==========
    
    def combine_emotion_analysis(self, voice_result: Dict[str, Any], 
                               face_result: Dict[str, Any]) -> Dict[str, Any]:
        """음성과 표정 감정 분석 결과 통합"""
        try:
            # 기본 응답
            combined_emotion = 'neutral'
            combined_confidence = 0.5
            response_message = "평온한 상태로 보이네요."
            
            voice_emotion = voice_result.get('emotion', 'neutral')
            voice_conf = voice_result.get('confidence', 0.0)
            
            face_emotion = face_result.get('emotion', 'neutral')
            face_conf = face_result.get('confidence', 0.0)
            
            logger.info(f"🎤 음성 감정: {voice_emotion} ({voice_conf:.2f})")
            logger.info(f"📷 표정 감정: {face_emotion} ({face_conf:.2f})")
            
            # 통합 로직
            if voice_emotion == face_emotion:
                # 두 분석이 일치하는 경우 - 높은 신뢰도
                combined_emotion = voice_emotion
                combined_confidence = min(0.9, (voice_conf + face_conf) / 2 + 0.2)
                
                # ChatGPT 기반 응답 생성 (통합 분석)
                response_message = self.generate_chatgpt_response(
                    combined_emotion, 
                    combined_confidence, 
                    analysis_type="combined"
                )
            
            elif face_conf > voice_conf + 0.2:
                # 표정이 더 확실한 경우
                combined_emotion = face_emotion
                combined_confidence = face_conf * 0.8
                response_message = self.generate_chatgpt_response(
                    combined_emotion, 
                    combined_confidence, 
                    analysis_type="face"
                )
            
            elif voice_conf > face_conf + 0.2:
                # 음성이 더 확실한 경우
                combined_emotion = voice_emotion
                combined_confidence = voice_conf * 0.8
                response_message = self.generate_chatgpt_response(
                    combined_emotion, 
                    combined_confidence, 
                    analysis_type="voice"
                )
            
            else:
                # 불일치하고 신뢰도가 비슷한 경우
                combined_emotion = face_emotion if face_conf >= voice_conf else voice_emotion
                combined_confidence = max(face_conf, voice_conf) * 0.6
                response_message = self.generate_chatgpt_response(
                    combined_emotion, 
                    combined_confidence, 
                    analysis_type="uncertain"
                )
            
            return {
                'success': True,
                'combined_emotion': combined_emotion,
                'combined_confidence': float(combined_confidence),
                'voice_emotion': voice_emotion,
                'face_emotion': face_emotion,
                'response_message': response_message
            }
            
        except Exception as e:
            logger.error(f"감정 분석 통합 실패: {e}")
            return {
                'success': False,
                'error': str(e),
                'combined_emotion': 'neutral',
                'combined_confidence': 0.0
            }

# ========== 전역 서버 인스턴스 ==========

ai_server = None

def get_ai_server():
    """AI 서버 싱글톤 인스턴스 반환"""
    global ai_server
    if ai_server is None:
        ai_server = IntegratedAIServer()
    return ai_server

def sanitize_for_json(obj):
    """JSON 직렬화를 위한 타입 변환"""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_for_json(item) for item in obj]
    elif isinstance(obj, (np.integer, np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())
    elif torch.is_tensor(obj):
        return sanitize_for_json(obj.cpu().numpy())
    else:
        return obj

# ========== API 엔드포인트들 ==========

@app.route('/analyze/voice_emotion', methods=['POST'])
def analyze_voice_emotion():
    """🎤 음성 감정 분석 API"""
    try:
        data = request.get_json()
        
        if 'audio' not in data:
            return jsonify({'success': False, 'error': 'No audio data provided'}), 400
        
        server = get_ai_server()
        
        # Base64 오디오를 numpy array로 변환
        y, sr = server.base64_to_audio(data['audio'])
        
        # 오디오 특성 추출
        features = server.extract_audio_features(y, sr)
        
        # 감정 분석
        result = server.analyze_voice_emotion_simple(features)
        
        logger.info(f"🎤 음성 감정 분석 완료: {result['emotion']} (신뢰도: {result['confidence']:.2f})")
        
        return jsonify(sanitize_for_json({
            'success': True,
            'emotion': result['emotion'],
            'confidence': result['confidence'],
            'response_message': server.emotion_responses[result['emotion']][0]
        }))
        
    except Exception as e:
        logger.error(f"음성 감정 분석 실패: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/analyze/face_emotion', methods=['POST'])
def analyze_face_emotion():
    """📷 얼굴 표정 감정 분석 API (여러 이미지)"""
    try:
        data = request.get_json()
        
        if 'photos' not in data or not data['photos']:
            return jsonify({'success': False, 'error': 'No photos provided'}), 400
        
        server = get_ai_server()
        
        # Base64 이미지들을 OpenCV 이미지로 변환
        images = []
        for i, base64_str in enumerate(data['photos']):
            try:
                image = server.base64_to_image(base64_str)
                images.append(image)
                logger.info(f"사진 {i+1} 변환 완료: {image.shape}")
            except Exception as e:
                logger.warning(f"사진 {i+1} 변환 실패: {e}")
        
        if not images:
            return jsonify({'success': False, 'error': 'No valid images'}), 400
        
        # 다중 이미지 감정 분석
        result = server.analyze_multiple_face_emotions(images)
        
        if result['success']:
            response_message = server.emotion_responses[result['emotion']][0]
            result['response_message'] = response_message
        
        logger.info(f"📷 표정 감정 분석 완료: {result.get('emotion', 'Unknown')}")
        
        return jsonify(sanitize_for_json(result))
        
    except Exception as e:
        logger.error(f"표정 감정 분석 실패: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/analyze/outfit', methods=['POST'])
def analyze_outfit():
    """👔 옷차림 적절성 분석 API (OpenWeather API 연동)"""
    try:
        data = request.get_json()
        
        if 'photo' not in data:
            return jsonify({'success': False, 'error': 'Missing photo data'}), 400
        
        server = get_ai_server()
        
        # Base64 이미지를 OpenCV 이미지로 변환
        image = server.base64_to_image(data['photo'])
        
        # 날씨 정보 처리 (선택적)
        weather_data = data.get('weather')  # 클라이언트에서 제공한 날씨 정보 (선택)
        
        # 옷차림 분석 (날씨 정보는 AI 서버에서 자동 획득)
        result = server.analyze_outfit_appropriateness(image, weather_data)
        
        temp_display = result.get('temperature')
        temp_str = f"{temp_display}°C" if temp_display is not None else "N/A°C"
        logger.info(f"옷차림 분석 완료: {'적절' if result.get('is_appropriate') else '부적절'} "
                   f"(온도: {temp_str})")
        
        return jsonify(sanitize_for_json(result))
        
    except Exception as e:
        logger.error(f"옷차림 분석 실패: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/analyze/combined_emotion', methods=['POST'])
def analyze_combined_emotion():
    """🎭 통합 감정 분석 API (음성 + 표정)"""
    try:
        data = request.get_json()
        
        if 'audio' not in data or 'photos' not in data:
            return jsonify({'success': False, 'error': 'Missing audio or photos'}), 400
        
        server = get_ai_server()
        
        # 음성 감정 분석
        y, sr = server.base64_to_audio(data['audio'])
        features = server.extract_audio_features(y, sr)
        voice_result = server.analyze_voice_emotion_simple(features)
        
        # 표정 감정 분석
        images = []
        for base64_str in data['photos']:
            try:
                image = server.base64_to_image(base64_str)
                images.append(image)
            except:
                continue
        
        face_result = server.analyze_multiple_face_emotions(images)
        
        # 결과 통합
        combined_result = server.combine_emotion_analysis(voice_result, face_result)
        
        logger.info(f"🎭 통합 감정 분석 완료: {combined_result.get('combined_emotion', 'Unknown')}")
        
        return jsonify(sanitize_for_json(combined_result))
        
    except Exception as e:
        logger.error(f"통합 감정 분석 실패: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'models_loaded': ai_server is not None,
        'services': ['voice_emotion', 'face_emotion', 'outfit', 'combined_emotion']
    })

# ========== 기존 API 호환성 엔드포인트 ==========

@app.route('/analyze_emotion', methods=['POST'])
def analyze_emotion_legacy():
    """🔄 기존 호환성: 감정 분석 API (음성 + 표정 통합)"""
    try:
        data = request.get_json()
        server = get_ai_server()
        
        # 음성 데이터 확인
        if 'audio_data' in data or 'audio' in data:
            audio_data = data.get('audio_data') or data.get('audio')
            
            # 이미지 데이터도 있는지 확인
            if 'image_data' in data or 'images' in data:
                # 통합 분석
                image_data = data.get('image_data') or data.get('images')
                if isinstance(image_data, str):
                    image_data = [image_data]  # 단일 이미지를 리스트로 변환
                
                # 통합 감정 분석 호출
                voice_result = server.analyze_voice_emotion_simple(
                    server.extract_audio_features(*server.base64_to_audio(audio_data))
                )
                
                images = [server.base64_to_image(img) for img in image_data]
                face_result = server.analyze_multiple_face_emotions(images)
                
                combined_result = server.combine_emotion_analysis(voice_result, face_result)
                
                logger.info(f"통합 감정 분석 완료: {combined_result.get('combined_emotion', 'unknown')}")
                return jsonify(sanitize_for_json(combined_result))
            
            else:
                # 음성만 분석
                y, sr = server.base64_to_audio(audio_data)
                features = server.extract_audio_features(y, sr)
                result = server.analyze_voice_emotion_simple(features)
                
                logger.info(f"음성 감정 분석 완료: {result.get('emotion', 'unknown')}")
                return jsonify(sanitize_for_json(result))
        
        else:
            return jsonify({'success': False, 'error': 'Missing audio data'}), 400
            
    except Exception as e:
        logger.error(f"기존 감정 분석 API 오류: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'emotion': 'neutral',
            'confidence': 0.0
        }), 500

# ========== 서버 실행 ==========

if __name__ == '__main__':
    try:
        # 환경 변수 설정
        import os
        os.environ['TOKENIZERS_PARALLELISM'] = 'false'  # 자동 설정
        
        # 포트 설정
        port = int(os.environ.get('AI_SERVER_PORT', 5052))
        host = os.environ.get('AI_SERVER_HOST', '0.0.0.0')
        
        logger.info(f"🚀 통합 AI 분석 서버 시작... ({host}:{port})")
        get_ai_server()  # 모델 로딩
        
        # Flask 서버 실행
        app.run(
            host=host,
            port=port,
            debug=False,
            threaded=True
        )
        
    except KeyboardInterrupt:
        logger.info("서버가 중단되었습니다.")
    except Exception as e:
        logger.error(f"서버 시작 실패: {e}")