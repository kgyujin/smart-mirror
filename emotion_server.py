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
warnings.filterwarnings("ignore")

# SpeechBrain 관련 import
from speechbrain.pretrained import EncoderClassifier

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)


class EmotionAnalyzer:
    """SpeechBrain 기반 고성능 음성 감정 분석기"""
    def __init__(self):
        self.classifier = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.emotion_labels = []
        self.load_model()

    def load_model(self):
        """SpeechBrain 감정 분석 모델 로드"""
        try:
            logger.info("SpeechBrain 감정 분석 모델 로드 중...")
            # IEMOCAP 기반 감정 분류 모델 (영어)
            self.classifier = EncoderClassifier.from_hparams(
                source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
                run_opts={"device": str(self.device)}
            )
            # 라벨 추출
            self.emotion_labels = self.classifier.hparams.label_encoder.lab2ind.keys()
            logger.info(f"✅ SpeechBrain 모델 로드 완료 (디바이스: {self.device})")
        except Exception as e:
            logger.error(f"❌ SpeechBrain 모델 로드 실패: {e}")
            raise

    def preprocess_audio(self, audio_data: bytes) -> tuple[np.ndarray, int]:
        """오디오 데이터 전처리 (SpeechBrain 모델 호환)"""
        try:
            if not audio_data or len(audio_data) == 0:
                logger.warn("빈 오디오 데이터")
                raise ValueError("Empty audio data")
            audio_io = io.BytesIO(audio_data)
            waveform, sample_rate = sf.read(audio_io, dtype='float32', always_2d=True)
            # (N, 1) or (N, C) -> (N,)
            if waveform.shape[1] > 1:
                waveform = np.mean(waveform, axis=1)
            else:
                waveform = waveform[:, 0]
            # 16kHz로 리샘플링
            if sample_rate != 16000:
                import librosa
                waveform = librosa.resample(waveform, orig_sr=sample_rate, target_sr=16000)
                sample_rate = 16000
            # 최소 길이 패딩 (0.1초)
            min_length = int(16000 * 0.1)
            if len(waveform) < min_length:
                waveform = np.pad(waveform, (0, min_length - len(waveform)))
            # 정규화: float32 [-1, 1] 범위로
            max_val = np.max(np.abs(waveform))
            if max_val > 0:
                waveform = waveform / max_val
            waveform = waveform.astype(np.float32)
            return waveform, sample_rate
        except Exception as e:
            logger.error(f"오디오 전처리 오류: {e}")
            raise ValueError(f"Audio preprocessing failed: {e}")

    def analyze_emotion(self, audio_data: bytes) -> Dict[str, Any]:
        """SpeechBrain 기반 음성 감정 분석 수행"""
        try:
            start_time = time.time()
            waveform, sample_rate = self.preprocess_audio(audio_data)
            if len(waveform) == 0:
                logger.warn("빈 오디오 데이터")
                return {
                    'emotion': 'neutral',
                    'confidence': 0.0,
                    'error': 'Empty audio data',
                    'success': False
                }
            # SpeechBrain 입력: torch.Tensor [1, T]
            waveform_tensor = torch.tensor(waveform, dtype=torch.float32).unsqueeze(0)
            if self.device.type == "cuda":
                waveform_tensor = waveform_tensor.cuda()
            # 감정 예측
            prediction = self.classifier.classify_batch(waveform_tensor)
            # 결과 추출
            predicted_index = int(prediction[3].item())
            predicted_emotion = self.classifier.hparams.label_encoder.ind2lab[predicted_index]
            # 확률
            probas = torch.softmax(prediction[1], dim=-1).cpu().numpy()[0]
            confidence = float(probas[predicted_index])
            # 감정별 확률
            emotion_scores = {
                self.classifier.hparams.label_encoder.ind2lab[i]: float(probas[i])
                for i in range(len(probas))
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

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': emotion_analyzer.classifier is not None,
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
