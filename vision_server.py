#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 기반 비전 분석 서버
- 얼굴 표정 감정 분석: trpakov/vit-face-expression 모델 사용
- 옷차림 적절성 분석: OpenAI CLIP 모델 사용
"""

import os
import base64
import io
import json
import logging
from typing import List, Dict, Any, Tuple
from collections import Counter

import numpy as np
import cv2
from PIL import Image
import torch
from transformers import pipeline, CLIPProcessor, CLIPModel
from flask import Flask, request, jsonify
from flask_cors import CORS

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class VisionAnalysisServer:
    def __init__(self):
        """비전 분석 서버 초기화"""
        logger.info("비전 분석 서버 초기화 중...")
        
        # GPU 사용 가능 여부 확인
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"사용 디바이스: {self.device}")
        
        # 얼굴 표정 분석 모델 초기화
        self._init_emotion_model()
        
        # CLIP 모델 초기화 (옷차림 분석용)
        self._init_clip_model()
        
        # 얼굴 탐지용 Haar Cascade 초기화
        self._init_face_detector()
        
        # 감정 라벨 매핑
        self.emotion_labels = {
            'LABEL_0': 'angry',      # 화남
            'LABEL_1': 'disgust',    # 혐오
            'LABEL_2': 'fear',       # 두려움
            'LABEL_3': 'happy',      # 기쁨
            'LABEL_4': 'neutral',    # 무표정
            'LABEL_5': 'sad',        # 슬픔
            'LABEL_6': 'surprise'    # 놀람
        }
        
        # 감정별 응답 메시지
        self.emotion_responses = {
            'happy': [
                "밝은 표정이시네요! 좋은 하루 보내세요!",
                "기분이 좋아 보이네요! 행복한 하루 되세요!",
                "웃는 모습이 아름답습니다!"
            ],
            'sad': [
                "조금 우울해 보이시네요. 힘내세요!",
                "무엇이 걱정인지 모르겠지만, 좋은 일이 생길 거예요!",
                "힘든 시간이지만 이겨내실 수 있을 거예요!"
            ],
            'angry': [
                "화가 나신 것 같네요. 심호흡을 한번 해보세요.",
                "스트레스가 많으신 것 같아요. 잠시 휴식을 취하세요.",
                "마음을 진정시키는 시간이 필요해 보여요."
            ],
            'surprise': [
                "놀라신 표정이네요! 무슨 일이 있으셨나요?",
                "깜짝 놀라신 모습이에요!",
                "예상치 못한 일이 있으셨나 봐요!"
            ],
            'fear': [
                "불안해 보이시네요. 괜찮으실 거예요.",
                "걱정이 많으신 것 같아요. 차근차근 해결해보세요.",
                "두려워하지 마세요. 모든 일이 잘 될 거예요."
            ],
            'disgust': [
                "불쾌한 일이 있으셨나요? 기분 전환하세요!",
                "싫은 일이 있으셨다면 잊고 좋은 생각해요!",
                "불편한 상황이 있으셨나 봐요."
            ],
            'neutral': [
                "차분한 표정이시네요.",
                "평온한 모습이에요.",
                "안정적인 상태로 보이네요."
            ]
        }
        
        logger.info("비전 분석 서버 초기화 완료!")
    
    def _init_emotion_model(self):
        """얼굴 표정 감정 분석 모델 초기화"""
        try:
            logger.info("얼굴 표정 감정 분석 모델 로딩 중...")
            self.emotion_classifier = pipeline(
                "image-classification",
                model="trpakov/vit-face-expression",
                device=0 if self.device.type == "cuda" else -1
            )
            logger.info("감정 분석 모델 로딩 완료!")
        except Exception as e:
            logger.error(f"감정 분석 모델 로딩 실패: {e}")
            raise
    
    def _init_clip_model(self):
        """CLIP 모델 초기화 (옷차림 분석용)"""
        try:
            logger.info("CLIP 모델 로딩 중...")
            self.clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
            self.clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
            
            # GPU로 모델 이동
            self.clip_model = self.clip_model.to(self.device)
            logger.info("CLIP 모델 로딩 완료!")
        except Exception as e:
            logger.error(f"CLIP 모델 로딩 실패: {e}")
            raise
    
    def _init_face_detector(self):
        """얼굴 탐지용 Haar Cascade 초기화"""
        try:
            # OpenCV에서 제공하는 얼굴 탐지 모델 로드
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self.face_cascade = cv2.CascadeClassifier(cascade_path)
            
            if self.face_cascade.empty():
                raise ValueError("얼굴 탐지 모델을 로드할 수 없습니다.")
            
            logger.info("얼굴 탐지 모델 로딩 완료!")
        except Exception as e:
            logger.error(f"얼굴 탐지 모델 로딩 실패: {e}")
            raise
    
    def base64_to_image(self, base64_str: str) -> np.ndarray:
        """Base64 문자열을 OpenCV 이미지로 변환"""
        try:
            # Base64 디코딩
            image_data = base64.b64decode(base64_str)
            
            # PIL Image로 변환
            pil_image = Image.open(io.BytesIO(image_data))
            
            # RGB로 변환 (RGBA인 경우)
            if pil_image.mode == 'RGBA':
                pil_image = pil_image.convert('RGB')
            
            # OpenCV 형식으로 변환 (BGR)
            opencv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
            
            return opencv_image
        except Exception as e:
            logger.error(f"Base64 이미지 변환 실패: {e}")
            raise
    
    def detect_faces(self, image: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """이미지에서 얼굴 영역 탐지"""
        try:
            # 그레이스케일로 변환
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # 얼굴 탐지
            faces = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )
            
            # numpy array를 list로 변환
            if isinstance(faces, np.ndarray):
                if len(faces) == 0:
                    return []
                return [tuple(face) for face in faces]
            elif isinstance(faces, tuple):
                # 빈 결과인 경우 tuple()로 반환될 수 있음
                return []
            else:
                return list(faces)
                
        except Exception as e:
            logger.error(f"얼굴 탐지 실패: {e}", exc_info=True)
            return []
    
    def analyze_face_emotion(self, image: np.ndarray) -> Dict[str, Any]:
        """얼굴 이미지에서 감정 분석"""
        try:
            logger.debug(f"이미지 크기: {image.shape}")
            
            # 얼굴 탐지
            faces = self.detect_faces(image)
            logger.debug(f"감지된 얼굴 수: {len(faces)}")
            
            if len(faces) == 0:
                logger.warning("얼굴이 감지되지 않았습니다")
                return {
                    'success': False,
                    'error': 'No face detected',
                    'emotion': None,
                    'confidence': 0.0
                }
            
            # 첫 번째 얼굴 영역 추출 (가장 큰 얼굴)
            if len(faces) > 1:
                faces = sorted(faces, key=lambda x: x[2] * x[3], reverse=True)
            
            x, y, w, h = faces[0]
            logger.debug(f"얼굴 영역: x={x}, y={y}, w={w}, h={h}")
            
            # 얼굴 영역이 너무 작은지 확인
            if w < 30 or h < 30:
                logger.warning(f"얼굴 영역이 너무 작습니다: {w}x{h}")
                return {
                    'success': False,
                    'error': 'Face too small',
                    'emotion': None,
                    'confidence': 0.0
                }
            
            face_image = image[y:y+h, x:x+w]
            logger.debug(f"얼굴 이미지 크기: {face_image.shape}")
            
            # PIL Image로 변환 (RGB)
            face_rgb = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
            face_pil = Image.fromarray(face_rgb)
            logger.debug(f"PIL 이미지 크기: {face_pil.size}, 모드: {face_pil.mode}")
            
            # 감정 분석
            logger.debug("감정 분석 모델 실행 중...")
            result = self.emotion_classifier(face_pil)
            logger.debug(f"감정 분석 결과: {result}")
            
            # 결과 처리
            if result and len(result) > 0:
                top_result = result[0]
                emotion_label = self.emotion_labels.get(top_result['label'], 'neutral')
                confidence = top_result['score']
                
                logger.info(f"감정 분석 성공: {emotion_label} (신뢰도: {confidence:.3f})")
                
                return {
                    'success': True,
                    'emotion': emotion_label,
                    'confidence': float(confidence),
                    'face_coords': [int(x), int(y), int(w), int(h)]
                }
            else:
                logger.warning("감정 분석 결과가 비어있습니다")
                return {
                    'success': False,
                    'error': 'Emotion analysis failed - empty result',
                    'emotion': None,
                    'confidence': 0.0
                }
                
        except Exception as e:
            logger.error(f"감정 분석 실패: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'emotion': None,
                'confidence': 0.0
            }
    
    def get_weather_category(self, temp: float) -> str:
        """온도를 기반으로 날씨 카테고리 분류"""
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
        """날씨 카테고리에 따른 적절한/부적절한 옷차림 프롬프트 생성"""
        outfit_prompts = {
            'very_cold': {
                'appropriate': [
                    "a person wearing a heavy winter coat",
                    "a person in thick winter jacket and scarf",
                    "a person wearing warm winter clothes",
                    "a person in padded jacket and gloves"
                ],
                'inappropriate': [
                    "a person wearing a t-shirt",
                    "a person in shorts",
                    "a person wearing summer clothes",
                    "a person in light clothing"
                ]
            },
            'cold': {
                'appropriate': [
                    "a person wearing a jacket or coat",
                    "a person in long sleeves and pants",
                    "a person wearing warm clothes",
                    "a person in sweater or cardigan"
                ],
                'inappropriate': [
                    "a person wearing a t-shirt",
                    "a person in shorts",
                    "a person wearing summer dress",
                    "a person in tank top"
                ]
            },
            'mild': {
                'appropriate': [
                    "a person wearing light jacket",
                    "a person in long sleeves",
                    "a person wearing cardigan",
                    "a person in comfortable casual clothes"
                ],
                'inappropriate': [
                    "a person wearing heavy winter coat",
                    "a person in thick winter jacket",
                    "a person wearing very light summer clothes"
                ]
            },
            'warm': {
                'appropriate': [
                    "a person wearing t-shirt",
                    "a person in light clothes",
                    "a person wearing casual summer clothes",
                    "a person in short sleeves"
                ],
                'inappropriate': [
                    "a person wearing heavy jacket",
                    "a person in winter coat",
                    "a person wearing thick sweater"
                ]
            },
            'hot': {
                'appropriate': [
                    "a person wearing light summer clothes",
                    "a person in shorts and t-shirt",
                    "a person wearing summer dress",
                    "a person in tank top and shorts"
                ],
                'inappropriate': [
                    "a person wearing jacket",
                    "a person in long sleeves",
                    "a person wearing winter clothes",
                    "a person in heavy clothing"
                ]
            }
        }
        
        prompts = outfit_prompts.get(weather_category, outfit_prompts['mild'])
        return prompts['appropriate'], prompts['inappropriate']
    
    def analyze_outfit_appropriateness(self, image: np.ndarray, weather_data: Dict[str, Any]) -> Dict[str, Any]:
        """CLIP을 사용한 옷차림 적절성 분석"""
        try:
            # 온도 추출 및 날씨 카테고리 분류
            temp = weather_data.get('temp', 20)
            weather_category = self.get_weather_category(temp)
            
            # 날씨에 따른 옷차림 프롬프트 생성
            appropriate_prompts, inappropriate_prompts = self.get_outfit_prompts(weather_category)
            
            # OpenCV 이미지를 PIL로 변환
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb_image)
            
            # 적절한 옷차림과의 유사도 계산
            appropriate_scores = []
            for prompt in appropriate_prompts:
                inputs = self.clip_processor(text=[prompt], images=pil_image, return_tensors="pt", padding=True)
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
                
                with torch.no_grad():
                    outputs = self.clip_model(**inputs)
                    logits_per_image = outputs.logits_per_image
                    score = torch.softmax(logits_per_image, dim=1)[0][0].cpu().numpy()
                    appropriate_scores.append(float(score))
            
            # 부적절한 옷차림과의 유사도 계산
            inappropriate_scores = []
            for prompt in inappropriate_prompts:
                inputs = self.clip_processor(text=[prompt], images=pil_image, return_tensors="pt", padding=True)
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
                
                with torch.no_grad():
                    outputs = self.clip_model(**inputs)
                    logits_per_image = outputs.logits_per_image
                    score = torch.softmax(logits_per_image, dim=1)[0][0].cpu().numpy()
                    inappropriate_scores.append(float(score))
            
            # 평균 점수 계산
            avg_appropriate = np.mean(appropriate_scores)
            avg_inappropriate = np.mean(inappropriate_scores)
            
            # 적절성 판단
            is_appropriate = avg_appropriate > avg_inappropriate
            confidence = abs(avg_appropriate - avg_inappropriate)
            
            # 응답 메시지 생성
            response_message = self._generate_outfit_response(
                is_appropriate, weather_category, temp, weather_data.get('condition', '')
            )
            
            return {
                'success': True,
                'is_appropriate': bool(is_appropriate),  # JSON 직렬화 가능하도록 명시적으로 bool 변환
                'confidence': float(confidence),
                'weather_category': weather_category,
                'appropriate_score': float(avg_appropriate),
                'inappropriate_score': float(avg_inappropriate),
                'response_message': response_message
            }
            
        except Exception as e:
            logger.error(f"옷차림 적절성 분석 실패: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'is_appropriate': False,  # None 대신 False로 명시
                'confidence': 0.0,
                'weather_category': '',
                'response_message': "옷차림 분석에 실패했습니다."
            }
    
    def _generate_outfit_response(self, is_appropriate: bool, weather_category: str, temp: float, condition: str) -> str:
        """옷차림 분석 결과에 따른 응답 메시지 생성"""
        temp_str = f"{temp}°C"
        
        if is_appropriate:
            messages = {
                'very_cold': f"매우 추운 날씨({temp_str})에 잘 맞는 옷차림이네요! 따뜻하게 입으셨어요.",
                'cold': f"쌀쌀한 날씨({temp_str})에 적절한 옷차림입니다. 좋은 선택이에요!",
                'mild': f"선선한 날씨({temp_str})에 딱 맞는 옷차림이네요!",
                'warm': f"따뜻한 날씨({temp_str})에 시원하게 잘 입으셨어요!",
                'hot': f"더운 날씨({temp_str})에 시원한 옷차림이네요! 완벽해요!"
            }
        else:
            messages = {
                'very_cold': f"매우 추운 날씨({temp_str})입니다. 더 따뜻한 옷을 입으시는 게 좋겠어요!",
                'cold': f"쌀쌀한 날씨({temp_str})입니다. 조금 더 따뜻하게 입으세요!",
                'mild': f"선선한 날씨({temp_str})입니다. 옷차림을 조금 조절하시면 좋을 것 같아요.",
                'warm': f"따뜻한 날씨({temp_str})입니다. 조금 더 시원하게 입어도 괜찮을 것 같아요!",
                'hot': f"더운 날씨({temp_str})입니다. 더 시원한 옷을 입으시는 게 좋겠어요!"
            }
        
        return messages.get(weather_category, f"현재 날씨는 {temp_str}입니다.")

# 글로벌 서버 인스턴스
vision_server = None

def get_vision_server():
    """비전 분석 서버 싱글톤 인스턴스 반환"""
    global vision_server
    if vision_server is None:
        vision_server = VisionAnalysisServer()
    return vision_server

@app.route('/analyze/emotion', methods=['POST'])
def analyze_emotion():
    """얼굴 표정 감정 분석 API"""
    try:
        server = get_vision_server()
        
        # 요청 데이터 검증
        if not request.json or 'photos' not in request.json:
            return jsonify({
                'success': False,
                'error': 'photos 필드가 필요합니다.'
            }), 400
        
        photos = request.json['photos']
        
        if not isinstance(photos, list) or len(photos) != 3:
            return jsonify({
                'success': False,
                'error': '정확히 3장의 사진이 필요합니다.'
            }), 400
        
        # 각 사진에서 감정 분석
        emotion_results = []
        
        for i, photo_base64 in enumerate(photos):
            try:
                # Base64를 이미지로 변환
                image = server.base64_to_image(photo_base64)
                
                # 감정 분석
                result = server.analyze_face_emotion(image)
                
                if result['success']:
                    emotion_results.append(result['emotion'])
                    logger.info(f"사진 {i+1}: {result['emotion']} (신뢰도: {result['confidence']:.2f})")
                else:
                    logger.warning(f"사진 {i+1} 분석 실패: {result.get('error', 'Unknown error')}")
                    
            except Exception as e:
                logger.error(f"사진 {i+1} 처리 실패: {e}")
                continue
        
        # 결과 검증
        if not emotion_results:
            return jsonify({
                'success': False,
                'error': '모든 사진에서 감정 분석에 실패했습니다.'
            }), 500
        
        # 가장 빈번한 감정 선택
        emotion_counter = Counter(emotion_results)
        final_emotion = emotion_counter.most_common(1)[0][0]
        confidence = emotion_counter[final_emotion] / len(emotion_results)
        
        # 응답 메시지 생성
        response_messages = server.emotion_responses.get(final_emotion, ["감정을 인식했습니다."])
        response_message = np.random.choice(response_messages)
        
        logger.info(f"최종 감정: {final_emotion} (신뢰도: {confidence:.2f})")
        
        return jsonify({
            'success': True,
            'emotion': final_emotion,
            'confidence': confidence,
            'response_message': response_message,
            'analysis_count': len(emotion_results)
        })
        
    except Exception as e:
        logger.error(f"감정 분석 API 오류: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/analyze/outfit', methods=['POST'])
def analyze_outfit():
    """옷차림 적절성 분석 API"""
    try:
        server = get_vision_server()
        
        # 요청 데이터 검증
        if not request.json or 'photo' not in request.json or 'weather' not in request.json:
            return jsonify({
                'success': False,
                'error': 'photo와 weather 필드가 필요합니다.'
            }), 400
        
        photo_base64 = request.json['photo']
        weather_data = request.json['weather']
        
        # 날씨 데이터 검증
        if 'temp' not in weather_data:
            return jsonify({
                'success': False,
                'error': 'weather.temp 필드가 필요합니다.'
            }), 400
        
        # Base64를 이미지로 변환
        image = server.base64_to_image(photo_base64)
        
        # 옷차림 적절성 분석
        result = server.analyze_outfit_appropriateness(image, weather_data)
        
        logger.info(f"옷차림 분석 결과: {result}")
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"옷차림 분석 API 오류: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'models_loaded': vision_server is not None
    })

if __name__ == '__main__':
    # 서버 초기화
    try:
        logger.info("비전 분석 서버 시작...")
        get_vision_server()  # 모델 로딩
        
        # Flask 서버 실행
        app.run(
            host='0.0.0.0',
            port=5052,
            debug=False,
            threaded=True
        )
        
    except KeyboardInterrupt:
        logger.info("서버가 중단되었습니다.")
    except Exception as e:
        logger.error(f"서버 시작 실패: {e}")