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
        
        # 감정 라벨 매핑 (LABEL_X 형식과 직접 이름 모두 지원)
        self.emotion_labels = {
            'LABEL_0': 'angry',
            'LABEL_1': 'disgust',
            'LABEL_2': 'fear',
            'LABEL_3': 'happy',
            'LABEL_4': 'neutral',
            'LABEL_5': 'sad',
            'LABEL_6': 'surprise',
            # 모델이 직접 감정 이름을 반환하는 경우 (identity mapping)
            'angry': 'angry',
            'disgust': 'disgust',
            'fear': 'fear',
            'happy': 'happy',
            'neutral': 'neutral',
            'sad': 'sad',
            'surprise': 'surprise'
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
        """이미지에서 얼굴 영역 탐지 (저화질/다양한 조명 환경 최적화)"""
        try:
            # 그레이스케일로 변환
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # 히스토그램 평활화로 조명 불균형 보정
            gray = cv2.equalizeHist(gray)
            
            # 얼굴 탐지 - 파라미터 최적화
            # scaleFactor: 1.05 (더 세밀하게 스캔)
            # minNeighbors: 3 (더 관대한 기준)
            # minSize: (30, 30) -> 작은 얼굴도 탐지 (거리 제약 없음)
            faces = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.05,
                minNeighbors=3,
                minSize=(30, 30),  # 작은 얼굴도 분석 가능
                flags=cv2.CASCADE_SCALE_IMAGE
            )
            
            # 안전한 타입 변환
            try:
                if isinstance(faces, (tuple, list)) and len(faces) == 0:
                    return []
                elif isinstance(faces, np.ndarray) and faces.shape[0] == 0:
                    return []
                elif isinstance(faces, np.ndarray):
                    # numpy array를 list of tuple로 변환
                    result = []
                    for face in faces:
                        # face가 numpy array인 경우 tolist()로 변환 후 tuple로
                        if isinstance(face, np.ndarray):
                            result.append(tuple(face.tolist()))
                        else:
                            result.append(tuple(face))
                    return result
                else:
                    return []
            except Exception as convert_error:
                logger.error(f"얼굴 좌표 변환 실패: {convert_error}, faces 타입: {type(faces)}")
                return []
                
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
            
            # 얼굴 영역 확인 (최소 크기 완화: 30x30)
            if w < 30 or h < 30:
                logger.warning(f"얼굴 영역이 너무 작습니다: {w}x{h} (최소 30x30 필요)")
                return {
                    'success': False,
                    'error': 'Face too small',
                    'emotion': None,
                    'confidence': 0.0
                }
            
            # 얼굴 영역에 여백 추가 (20% 확장) - 작은 얼굴일수록 더 많은 컨텍스트 필요
            margin_ratio = 0.3 if min(w, h) < 80 else 0.2  # 작은 얼굴은 30% 여백
            margin = int(min(w, h) * margin_ratio)
            x_margin = max(0, x - margin)
            y_margin = max(0, y - margin)
            w_margin = min(image.shape[1], x + w + margin) - x_margin
            h_margin = min(image.shape[0], y + h + margin) - y_margin
            
            face_image = image[y_margin:y_margin+h_margin, x_margin:x_margin+w_margin]
            logger.debug(f"얼굴 이미지 크기 (여백 포함): {face_image.shape}")
            
            # PIL Image로 변환 (RGB)
            face_rgb = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
            face_pil = Image.fromarray(face_rgb)
            
            # 감정 분석 모델을 위한 크기 조정 + 품질 향상
            # LANCZOS 리샘플링으로 작은 이미지도 고품질로 확대
            face_pil_resized = face_pil.resize((224, 224), Image.Resampling.LANCZOS)
            
            # 추가: 작은 얼굴일 경우 선명도 향상
            if min(w, h) < 80:
                from PIL import ImageEnhance
                enhancer = ImageEnhance.Sharpness(face_pil_resized)
                face_pil_resized = enhancer.enhance(1.5)  # 선명도 50% 증가
            
            logger.debug(f"PIL 이미지 크기: {face_pil_resized.size}, 모드: {face_pil_resized.mode}")
            
            # 감정 분석
            logger.info("=== 감정 분석 모델 실행 시작 ===")
            result = self.emotion_classifier(face_pil_resized)
            logger.info(f"=== 모델 반환 결과 개수: {len(result) if result else 0} ===")
            
            # 결과 처리
            if result and len(result) > 0:
                # ⭐ 모든 감정 결과 출력 (디버깅용)
                logger.info(f"📊 전체 감정 분석 결과:")
                for i, r in enumerate(result):
                    emotion_name = self.emotion_labels.get(r['label'], r['label'])
                    logger.info(f"  {i+1}. {emotion_name}: {r['score']:.4f} (원본 라벨: {r['label']})")
                
                top_result = result[0]
                logger.info(f"🔍 최상위 결과 원본 라벨: '{top_result['label']}' → 매핑 시도")
                emotion_label = self.emotion_labels.get(top_result['label'], 'neutral')
                logger.info(f"🔍 매핑 결과: '{emotion_label}'")
                confidence = top_result['score']
                
                # neutral이 너무 높은 신뢰도로 나오는 경우 경고
                if emotion_label == 'neutral' and confidence > 0.9:
                    logger.warning(f"⚠️ neutral 신뢰도가 매우 높음 ({confidence:.4f}). 표정이 약하거나 모델이 다른 감정을 인식하지 못했습니다.")
                    logger.warning(f"⚠️ 다음 감정 시도: 표정을 더 크게 지어보세요!")
                
                logger.info(f"✅ 최종 감정: {emotion_label} (신뢰도: {confidence:.4f})")
                
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
        """날씨 카테고리에 따른 적절한/부적절한 옷차림 프롬프트 생성 (부분 이미지용)"""
        outfit_prompts = {
            'very_cold': {
                'appropriate': [
                    "thick winter jacket or heavy coat",
                    "warm padded clothing or winter wear",
                    "sweater and scarf or winter outfit",
                    "layered warm clothing or winter attire",
                    "person wearing thick sleeves or winter coat"  # 상반신만 보여도 판단 가능
                ],
                'inappropriate': [
                    "thin t-shirt or tank top",
                    "light summer clothing or short sleeves",
                    "bare arms or sleeveless outfit",
                    "summer dress or light fabric"
                ]
            },
            'cold': {
                'appropriate': [
                    "jacket or long sleeve shirt",
                    "sweater or cardigan",
                    "layered clothing or warm outfit",
                    "long sleeves or covered arms",
                    "casual jacket or warm top"
                ],
                'inappropriate': [
                    "t-shirt or tank top",
                    "short sleeves or bare arms",
                    "summer dress or light top",
                    "sleeveless clothing"
                ]
            },
            'mild': {
                'appropriate': [
                    "light jacket or cardigan",
                    "long sleeve shirt or casual top",
                    "comfortable layered clothing",
                    "spring or fall outfit",
                    "moderate clothing or casual wear"
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
                    "breathable cotton short sleeves",
                    "light fabric shirt for hot weather"
                ],
                'inappropriate': [
                    "thick jacket or windbreaker",
                    "heavy coat or padded clothing",
                    "long sleeve sweater or warm layers",
                    "winter clothing or thick fabric"
                ]
            },
            'hot': {
                'appropriate': [
                    "light summer clothing or tank top",
                    "thin fabric or sleeveless top",
                    "very light clothes or summer wear",
                    "minimal clothing or breathable fabric",
                    "bare shoulders or light outfit"
                ],
                'inappropriate': [
                    "jacket or long sleeves",
                    "heavy clothing or thick fabric",
                    "winter clothes or warm outfit",
                    "layered clothing or thick top"
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
            
            # ⭐ 모든 프롬프트를 한 번에 처리 (올바른 CLIP 사용법)
            all_prompts = appropriate_prompts + inappropriate_prompts
            
            inputs = self.clip_processor(text=all_prompts, images=pil_image, return_tensors="pt", padding=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            with torch.no_grad():
                outputs = self.clip_model(**inputs)
                logits_per_image = outputs.logits_per_image  # shape: [1, num_prompts]
                probs = torch.softmax(logits_per_image, dim=1)[0]  # shape: [num_prompts]
            
            # 적절한/부적절한 프롬프트별 확률 분리
            num_appropriate = len(appropriate_prompts)
            appropriate_scores = probs[:num_appropriate].cpu().numpy()
            inappropriate_scores = probs[num_appropriate:].cpu().numpy()
            
            logger.info(f"📊 적절한 옷차림 점수: {[f'{s:.4f}' for s in appropriate_scores]}")
            logger.info(f"📊 부적절한 옷차림 점수: {[f'{s:.4f}' for s in inappropriate_scores]}")
            
            # ⭐ 개선: 최대값 기준 점수 계산 (평균보다 더 명확함)
            max_appropriate = float(np.max(appropriate_scores))
            max_inappropriate = float(np.max(inappropriate_scores))
            avg_appropriate = float(np.mean(appropriate_scores))
            avg_inappropriate = float(np.mean(inappropriate_scores))
            
            logger.info(f"🔍 최대값 - 적절: {max_appropriate:.4f}, 부적절: {max_inappropriate:.4f}")
            logger.info(f"🔍 평균값 - 적절: {avg_appropriate:.4f}, 부적절: {avg_inappropriate:.4f}")
            
            # 적절성 판단: 최대값 기준 (더 확실한 신호)
            is_appropriate = bool(int(max_appropriate > max_inappropriate))
            
            # 신뢰도: 최대값 차이 (더 명확한 신호)
            confidence_max = float(abs(max_appropriate - max_inappropriate))
            confidence_avg = float(abs(avg_appropriate - avg_inappropriate))
            
            # 최대값 기반 신뢰도 사용 (더 명확함)
            confidence = confidence_max
            
            logger.info(f"🎯 최종 판단: {'적절' if is_appropriate else '부적절'}, 신뢰도: {confidence:.4f}")
            
            # 응답 메시지 생성
            response_message = self._generate_outfit_response(
                is_appropriate, weather_category, temp, weather_data.get('condition', '')
            )
            
            # JSON 직렬화 가능한 형태로 반환 - 모든 값을 Python 기본 타입으로
            result_dict = {
                'success': True,
                'is_appropriate': bool(is_appropriate),
                'confidence': float(confidence),
                'weather_category': str(weather_category),
                'appropriate_score': float(max_appropriate),  # 최대값 반환
                'inappropriate_score': float(max_inappropriate),  # 최대값 반환
                'avg_appropriate_score': float(avg_appropriate),  # 참고용 평균값
                'avg_inappropriate_score': float(avg_inappropriate),  # 참고용 평균값
                'response_message': str(response_message)
            }
            
            logger.info(f"반환 전 result_dict 타입 확인: {[(k, type(v)) for k, v in result_dict.items()]}")
            
            # 최종 안전 검증: sanitize_for_json 적용
            result_sanitized = sanitize_for_json(result_dict)
            logger.info(f"sanitize 후 타입 확인: {[(k, type(v)) for k, v in result_sanitized.items()]}")
            
            return result_sanitized
            
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

def sanitize_for_json(obj):
    """NumPy/Torch 타입을 JSON 직렬화 가능한 Python 기본 타입으로 변환"""
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
        error_reasons = []  # 실패 원인 추적
        
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
                    error_reason = result.get('error', 'Unknown error')
                    error_reasons.append(error_reason)
                    logger.warning(f"사진 {i+1} 분석 실패: {error_reason}")
                    
            except Exception as e:
                error_reasons.append(str(e))
                logger.error(f"사진 {i+1} 처리 실패: {e}")
                continue
        
        # 결과 검증 - 사용자 친화적 오류 메시지
        if not emotion_results:
            # 가장 많이 발생한 오류 원인 파악
            error_counter = Counter(error_reasons)
            most_common_error = error_counter.most_common(1)[0][0] if error_reasons else 'Unknown error'
            
            # 사용자 친화적 메시지 생성
            if 'No face detected' in most_common_error or 'Face too small' in most_common_error:
                user_message = '얼굴을 찾을 수 없습니다. 카메라에 더 가까이 다가가 주세요.'
            elif 'Emotion analysis failed' in most_common_error:
                user_message = '감정 분석에 실패했습니다. 조명을 밝게 하고 카메라를 정면으로 봐주세요.'
            else:
                user_message = '감정 분석에 실패했습니다. 다시 시도해 주세요.'
            
            logger.error(f"감정 분석 실패 - 원인: {most_common_error}")
            
            return jsonify({
                'success': False,
                'error': user_message,
                'detail': most_common_error,
                'failed_count': len(error_reasons)
            }), 400  # 500 -> 400으로 변경 (클라이언트 측 문제)
        
        # 가장 빈번한 감정 선택
        emotion_counter = Counter(emotion_results)
        final_emotion = emotion_counter.most_common(1)[0][0]
        confidence = float(emotion_counter[final_emotion] / len(emotion_results))
        
        # 응답 메시지 생성
        response_messages = server.emotion_responses.get(final_emotion, ["감정을 인식했습니다."])
        response_message = str(np.random.choice(response_messages))
        
        logger.info(f"최종 감정: {final_emotion} (신뢰도: {confidence:.2f})")
        
        result = {
            'success': True,
            'emotion': str(final_emotion),
            'confidence': confidence,
            'response_message': response_message,
            'analysis_count': int(len(emotion_results))
        }
        
        # JSON 직렬화 안전성 최종 검증
        return jsonify(sanitize_for_json(result))
        
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
        
        # JSON 직렬화 안전성 최종 검증
        result = sanitize_for_json(result)
        
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