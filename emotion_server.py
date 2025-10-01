#!/usr/bin/env python3
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
import soundfile as sf
from typing import Dict, Any, Optional
import warnings
from transformers import Wav2Vec2ForSequenceClassification, AutoFeatureExtractor
warnings.filterwarnings("ignore")

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class EmotionAnalyzer:
    """Wav2Vec2 기반 고성능 음성 감정 분석기"""
    def __init__(self):
        self.model = None
        self.feature_extractor = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.emotion_labels = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
        self.load_model()

    def load_model(self):
        """감정 분석 모델 초기화"""
        try:
            model_name = "Dpngtm/wav2vec2-emotion-recognition"
            self.model = Wav2Vec2ForSequenceClassification.from_pretrained(model_name).to(self.device)
            self.feature_extractor = AutoFeatureExtractor.from_pretrained(model_name)
            logger.info("모델 로딩 성공")
        except Exception as e:
            logger.error(f"모델 로딩 실패: {e}")
            raise

    def preprocess_audio(self, audio_data: bytes) -> np.ndarray:
        """오디오 데이터 전처리 (Wav2Vec2 모델 호환)"""
        try:
            if not audio_data or len(audio_data) == 0:
                logger.warn("빈 오디오 데이터")
                raise ValueError("Empty audio data")

            # 오디오 데이터 로드
            audio_io = io.BytesIO(audio_data)
            try:
                waveform, sample_rate = torchaudio.load(audio_io)
                waveform = waveform.numpy()
            except Exception as e:
                logger.warning(f"torchaudio 로딩 실패, soundfile 시도: {e}")
                audio_io.seek(0)  # BytesIO 포인터 리셋
                waveform, sample_rate = sf.read(audio_io, dtype='float32', always_2d=True)
                waveform = waveform.T

            # 모노로 변환
            if waveform.shape[0] > 1:
                waveform = np.mean(waveform, axis=0, keepdims=True)

            # 16kHz로 리샘플링
            if sample_rate != 16000:
                import librosa
                waveform = librosa.resample(waveform.squeeze(), orig_sr=sample_rate, target_sr=16000)
                waveform = waveform.reshape(1, -1)

            # 최소 길이 패딩 (0.1초)
            min_length = int(16000 * 0.1)
            if waveform.shape[1] < min_length:
                pad_width = ((0, 0), (0, min_length - waveform.shape[1]))
                waveform = np.pad(waveform, pad_width)

            # 정규화
            waveform = waveform.astype(np.float32)
            if np.abs(waveform).max() > 0:
                waveform = waveform / np.abs(waveform).max()

            return waveform.squeeze()  # [T,] 형태로 반환
            
        except Exception as e:
            logger.error(f"오디오 전처리 실패: {e}")
            raise

    def analyze_emotion(self, audio_data: bytes) -> Dict[str, Any]:
        """Wav2Vec2 기반 음성 감정 분석 수행"""
        try:
            start_time = time.time()
            waveform = self.preprocess_audio(audio_data)

            if len(waveform) == 0:
                logger.warn("빈 오디오 데이터")
                return {
                    'emotion': 'neutral',
                    'confidence': 0.0,
                    'error': 'Empty audio data',
                    'success': False
                }

            # Feature extraction 수행
            inputs = self.feature_extractor(
                waveform,
                sampling_rate=16000,
                return_tensors="pt",
                padding=True
            )

            # GPU로 이동 (필요시)
            if self.device.type == "cuda":
                inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # 감정 예측
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
                probas = torch.softmax(logits, dim=-1)[0]

            # 결과 추출
            predicted_index = torch.argmax(probas).item()
            predicted_emotion = self.emotion_labels[predicted_index]
            confidence = float(probas[predicted_index])
            
            # 감정별 확률
            emotion_scores = {
                self.emotion_labels[i]: float(probas[i])
                for i in range(len(self.emotion_labels))
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

def generate_emotion_response(emotion: str, confidence: float) -> str:
    """감정에 따른 자연스러운 응답 생성 (SpeechBrain 라벨 대응)"""
    if confidence < 0.3:
        return "음성을 명확히 인식하지 못했습니다. 다시 말씀해주세요."
    responses = {
        'angry': [
            "화가 나신 것 같아요. 마음을 진정시킬 수 있는 음악을 틀어드릴까요?",
            "분노가 느껴져요. 심호흡을 해보는 건 어떨까요?"
        ],
        'happy': [
            "기분이 좋아 보이시네요! 좋은 하루 되세요!",
            "행복해 보이시네요! 계속 좋은 일만 가득하길 바랍니다!"
        ],
        'sad': [
            "슬퍼 보이시네요. 위로가 되는 음악을 들려드릴까요?",
            "마음이 힘드신가요? 잠시 쉬어가도 괜찮아요."
        ],
        'neutral': [
            "어떻게 도와드릴까요?",
            "필요하신 게 있으신가요?"
        ],
        'fearful': [
            "불안해 보이시네요. 안정감을 주는 음악을 틀어드릴까요?"
        ],
        'disgust': [
            "불쾌감을 느끼신 것 같아요. 기분 전환이 필요하신가요?"
        ],
        'surprised': [
            "놀라신 것 같아요. 괜찮으신가요?"
        ]
    }
    import random
    emotion_responses = responses.get(emotion, ["어떻게 도와드릴까요?"])
    return random.choice(emotion_responses)

# 전역 변수로 EmotionAnalyzer 인스턴스 생성
emotion_analyzer = EmotionAnalyzer()

# Flask 라우트
@app.route('/health')
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': emotion_analyzer.model is not None and emotion_analyzer.feature_extractor is not None,
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
        

        # smart-mirror 프로젝트 내 tmp/last_upload.wav로 저장
        try:
            project_dir = os.path.dirname(os.path.abspath(__file__))
            tmp_dir = os.path.join(project_dir, 'tmp')
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_wav_path = os.path.join(tmp_dir, 'last_upload.wav')
            with open(tmp_wav_path, 'wb') as f:
                f.write(audio_data)
            logger.info(f'업로드된 오디오를 {tmp_wav_path}로 저장함')
        except Exception as file_err:
            logger.warn(f'오디오 임시 저장 실패: {file_err}')

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
        
        # 파일 크기 확인 (10MB 제한)
        file.seek(0, 2)  # 파일 끝으로 이동
        file_size = file.tell()
        file.seek(0)  # 파일 시작으로 이동
        
        if file_size > 10 * 1024 * 1024:  # 10MB
            return jsonify({
                'error': '파일 크기가 너무 큽니다. (최대 10MB)',
                'success': False
            }), 400
        
        if file_size == 0:
            return jsonify({
                'error': '오디오 파일이 비어있습니다.',
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
    logger.info("감정 분석 서버 시작")
    logger.info(f"디바이스: {emotion_analyzer.device}")
    logger.info("서버 주소: http://0.0.0.0:5050")
    logger.info("API 엔드포인트:")
    logger.info("  - POST /analyze_emotion (Base64 오디오)")
    logger.info("  - POST /analyze_emotion_file (파일 업로드)")
    logger.info("  - GET /health (상태 확인)")
    
    app.run(
        host='0.0.0.0',
        port=5050,
        debug=False,
        threaded=True
    )
