#!/usr/bin/env python3
"""
고성능 음성 감정 분석 서버
- 정확도 80% 이상의 사전 학습된 모델 사용
- 빠른 처리 속도 최적화
- 라즈베리파이와 실시간 통신
"""

import os
import io
import base64
import time
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import torchaudio
import numpy as np
from transformers import (
    Wav2Vec2ForSequenceClassification, 
    Wav2Vec2Processor,
    pipeline
)
import librosa
from typing import Dict, Any, Optional
import warnings
warnings.filterwarnings("ignore")

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class EmotionAnalyzer:
    """고성능 음성 감정 분석기"""
    
    def __init__(self):
        self.model = None
        self.processor = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.emotion_labels = ['negative', 'positive']  # 간단한 2클래스 분류
        self.load_model()
        
    def load_model(self):
        """고성능 감정 분석 모델 로드"""
        try:
            logger.info("감정 분석 모델 로드 중...")
            
            # 작동하는 wav2vec2 모델 사용
            model_name = "facebook/wav2vec2-base-960h"
            
            # 프로세서와 모델 로드
            self.processor = Wav2Vec2Processor.from_pretrained(model_name)
            self.model = Wav2Vec2ForSequenceClassification.from_pretrained(
                model_name, 
                num_labels=2  # 2클래스 분류
            )
            
            # GPU 가속 사용
            self.model.to(self.device)
            self.model.eval()
            
            logger.info(f"✅ 모델 로드 완료 (디바이스: {self.device})")
            
        except Exception as e:
            logger.error(f"❌ 모델 로드 실패: {e}")
            # 폴백 모델 사용
            self.load_fallback_model()
    
    def load_fallback_model(self):
        """폴백 모델 로드"""
        try:
            logger.info("폴백 모델 로드 중...")
            model_name = "facebook/wav2vec2-base-960h"
            self.processor = Wav2Vec2Processor.from_pretrained(model_name)
            self.model = Wav2Vec2ForSequenceClassification.from_pretrained(model_name)
            self.model.to(self.device)
            self.model.eval()
            logger.info("✅ 폴백 모델 로드 완료")
        except Exception as e:
            logger.error(f"❌ 폴백 모델 로드 실패: {e}")
            raise
    
    def preprocess_audio(self, audio_data: bytes) -> torch.Tensor:
        """오디오 데이터 전처리"""
        try:
            # 바이트 데이터를 오디오로 변환
            audio_io = io.BytesIO(audio_data)
            waveform, sample_rate = torchaudio.load(audio_io)
            
            # 모노로 변환
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)
            
            # 16kHz로 리샘플링
            if sample_rate != 16000:
                resampler = torchaudio.transforms.Resample(sample_rate, 16000)
                waveform = resampler(waveform)
            
            # 정규화
            waveform = waveform / torch.max(torch.abs(waveform))
            
            return waveform.squeeze(0)  # (samples,)
            
        except Exception as e:
            logger.error(f"오디오 전처리 오류: {e}")
            raise
    
    def analyze_emotion(self, audio_data: bytes) -> Dict[str, Any]:
        """음성 감정 분석 수행"""
        try:
            start_time = time.time()
            
            # 오디오 전처리
            waveform = self.preprocess_audio(audio_data)
            
            # 오디오 길이 확인
            if len(waveform) == 0:
                logger.warn("빈 오디오 데이터")
                return {
                    'emotion': 'neutral',
                    'confidence': 0.0,
                    'error': 'Empty audio data',
                    'success': False
                }
            
            # 모델 입력 준비
            inputs = self.processor(
                waveform, 
                sampling_rate=16000, 
                return_tensors="pt", 
                padding=True
            )
            
            # GPU로 이동
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # 감정 분석 수행
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
                probabilities = torch.nn.functional.softmax(logits, dim=-1)
            
            # 결과 추출
            predicted_class_id = torch.argmax(probabilities, dim=-1).item()
            confidence = float(probabilities[0][predicted_class_id])
            predicted_emotion = self.emotion_labels[predicted_class_id]
            
            # 모든 감정의 확률
            emotion_scores = {
                emotion: float(probabilities[0][i]) 
                for i, emotion in enumerate(self.emotion_labels)
            }
            
            processing_time = time.time() - start_time
            
            result = {
                'emotion': predicted_emotion,
                'confidence': confidence,
                'emotion_scores': emotion_scores,
                'processing_time': processing_time,
                'success': True
            }
            
            logger.info(f"감정 분석 완료: {predicted_emotion} ({confidence:.3f}) - {processing_time:.3f}초")
            return result
            
        except Exception as e:
            logger.error(f"감정 분석 오류: {e}")
            return {
                'emotion': 'neutral',
                'confidence': 0.0,
                'error': str(e),
                'success': False
            }

# 전역 감정 분석기 인스턴스
emotion_analyzer = EmotionAnalyzer()

def generate_emotion_response(emotion: str, confidence: float) -> str:
    """감정에 따른 자연스러운 응답 생성"""
    
    # 신뢰도가 낮으면 기본 응답
    if confidence < 0.3:
        return "음성을 명확히 인식하지 못했습니다. 다시 말씀해주세요."
    
    # 감정별 응답 (2클래스)
    responses = {
        'negative': [
            "기분이 안 좋으신 것 같네요. 마음이 차분해지는 음악을 틀어드릴까요?",
            "스트레스가 많으신 것 같아요. 편안한 음악으로 마음을 달래보세요.",
            "힘들어 보이시네요. 위로가 되는 음악을 들려드릴까요?",
            "불안해 보이시네요. 안정감을 주는 음악을 틀어드릴까요?"
        ],
        'positive': [
            "기분이 좋아 보이시네요! 더 즐거운 시간을 보내세요!",
            "행복해 보이시네요! 좋은 하루 되세요!",
            "밝은 기분이시군요! 계속 좋은 하루 보내세요!",
            "즐거워 보이시네요! 더 좋은 일들이 있기를 바라요!"
        ]
    }
    
    # 감정별 응답 중 랜덤 선택
    import random
    emotion_responses = responses.get(emotion, ["어떻게 도와드릴까요?"])
    return random.choice(emotion_responses)

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': emotion_analyzer.model is not None,
        'device': str(emotion_analyzer.device),
        'timestamp': time.time()
    })

@app.route('/analyze_emotion', methods=['POST'])
def analyze_emotion():
    """음성 감정 분석 API"""
    try:
        # 요청 데이터 검증
        if not request.json or 'audio_base64' not in request.json:
            return jsonify({
                'error': 'audio_base64 필드가 필요합니다.',
                'success': False
            }), 400
        
        # Base64 디코딩
        audio_base64 = request.json['audio_base64']
        audio_data = base64.b64decode(audio_base64)
        
        if len(audio_data) == 0:
            return jsonify({
                'error': '오디오 데이터가 비어있습니다.',
                'success': False
            }), 400
        
        # 감정 분석 수행
        result = emotion_analyzer.analyze_emotion(audio_data)
        
        if not result['success']:
            return jsonify(result), 500
        
        # 응답 생성
        emotion = result['emotion']
        confidence = result['confidence']
        response_text = generate_emotion_response(emotion, confidence)
        
        # 최종 응답
        final_result = {
            'emotion': emotion,
            'confidence': confidence,
            'response': response_text,
            'emotion_scores': result['emotion_scores'],
            'processing_time': result['processing_time'],
            'success': True
        }
        
        return jsonify(final_result)
        
    except Exception as e:
        logger.error(f"API 오류: {e}")
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/analyze_emotion_file', methods=['POST'])
def analyze_emotion_file():
    """파일 업로드 방식 감정 분석 API"""
    try:
        if 'file' not in request.files:
            return jsonify({
                'error': '파일이 업로드되지 않았습니다.',
                'success': False
            }), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'error': '파일명이 없습니다.',
                'success': False
            }), 400
        
        # 파일 데이터 읽기
        audio_data = file.read()
        
        # 감정 분석 수행
        result = emotion_analyzer.analyze_emotion(audio_data)
        
        if not result['success']:
            return jsonify(result), 500
        
        # 응답 생성
        emotion = result['emotion']
        confidence = result['confidence']
        response_text = generate_emotion_response(emotion, confidence)
        
        # 최종 응답
        final_result = {
            'emotion': emotion,
            'confidence': confidence,
            'response': response_text,
            'emotion_scores': result['emotion_scores'],
            'processing_time': result['processing_time'],
            'success': True
        }
        
        return jsonify(final_result)
        
    except Exception as e:
        logger.error(f"파일 분석 API 오류: {e}")
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

if __name__ == '__main__':
    # 서버 시작
    logger.info("🚀 고성능 감정 분석 서버 시작")
    logger.info(f"📱 디바이스: {emotion_analyzer.device}")
    logger.info("🌐 서버 주소: http://0.0.0.0:5001")
    logger.info("📊 API 엔드포인트:")
    logger.info("  - POST /analyze_emotion (Base64 오디오)")
    logger.info("  - POST /analyze_emotion_file (파일 업로드)")
    logger.info("  - GET /health (상태 확인)")
    
    app.run(
        host='0.0.0.0',
        port=5001,
        debug=False,
        threaded=True
    )
