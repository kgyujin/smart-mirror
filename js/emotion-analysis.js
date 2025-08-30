const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { log } = require('./logging');

// SpeechBrain 감정 인식 모델 설정
const SPEECHBRAIN_MODEL = 'speechbrain/emotion-recognition-wav2vec2-IEMOCAP';

// 감정 매핑 (SpeechBrain IEMOCAP 모델 기준)
const EMOTION_MAP = {
  'ang': 'angry',      // 분노
  'hap': 'happy',      // 행복
  'neu': 'neutral',    // 중립
  'sad': 'sad',        // 슬픔
  'exc': 'excited',    // 흥분
  'fru': 'frustrated', // 좌절
  'fea': 'fearful',    // 두려움
  'dis': 'disgusted',  // 혐오
  'sur': 'surprised'   // 놀람
};

// 감정별 음악 추천
const EMOTION_MUSIC_RECOMMENDATIONS = {
  'angry': [
    'Rock music',
    'Heavy metal',
    'Energetic workout',
    'Punk rock'
  ],
  'happy': [
    'Upbeat pop',
    'Dance music',
    'Summer hits',
    'Feel-good songs'
  ],
  'neutral': [
    'Ambient music',
    'Classical piano',
    'Nature sounds',
    'Lo-fi beats'
  ],
  'sad': [
    'Comforting ballads',
    'Melancholic indie',
    'Healing music',
    'Gentle acoustic'
  ],
  'excited': [
    'Electronic dance',
    'High-energy pop',
    'Festival music',
    'Upbeat rock'
  ],
  'frustrated': [
    'Calming classical',
    'Meditation music',
    'Smooth jazz',
    'Relaxing ambient'
  ],
  'fearful': [
    'Calming nature sounds',
    'Soft classical',
    'Peaceful meditation',
    'Gentle lullabies'
  ],
  'disgusted': [
    'Cleansing sounds',
    'Fresh air music',
    'Purifying tones',
    'Renewal songs'
  ],
  'surprised': [
    'Exciting pop',
    'Adventure music',
    'Discovery songs',
    'Wonderful melodies'
  ]
};

// 감정별 메시지
const EMOTION_MESSAGES = {
  'angry': [
    '화가 나신 것 같아요. 깊은 숨을 쉬며 마음을 진정시켜보세요.',
    '분노는 자연스러운 감정이에요. 잠시 휴식을 취해보는 건 어떨까요?',
    '화가 나실 때는 차분한 음악을 들어보세요. 마음이 안정될 거예요.'
  ],
  'happy': [
    '기분이 좋으시군요! 그 긍정적인 에너지가 주변 사람들에게도 전파될 거예요.',
    '행복한 기분을 유지하세요. 오늘 하루도 좋은 일들이 가득할 거예요.',
    '기쁜 마음이 느껴져요. 그 에너지를 계속 유지해보세요!'
  ],
  'neutral': [
    '차분한 상태를 유지하고 계시네요. 안정적인 기분이 좋아요.',
    '평온한 기분이시군요. 이런 상태에서 좋은 아이디어가 떠오를 수도 있어요.',
    '중립적인 기분이시네요. 마음의 균형을 잘 잡고 계세요.'
  ],
  'sad': [
    '슬픈 기분이시군요. 혼자가 아니에요. 언제든 이야기해주세요.',
    '우울한 마음이 느껴져요. 따뜻한 차 한 잔과 함께 마음을 달래보세요.',
    '슬픈 감정은 자연스러워요. 시간이 지나면 나아질 거예요.'
  ],
  'excited': [
    '흥미진진한 기분이시군요! 그 에너지를 좋은 일에 활용해보세요.',
    '흥분된 상태네요! 긍정적인 에너지가 가득해요.',
    '들떠있는 기분이시군요. 그 열정을 유지해보세요!'
  ],
  'frustrated': [
    '답답한 기분이시군요. 잠시 쉬어가며 마음을 정리해보세요.',
    '좌절감이 느껴져요. 차근차근 해결해나가면 될 거예요.',
    '스트레스 받고 계시네요. 심호흡을 하며 마음을 진정시켜보세요.'
  ],
  'fearful': [
    '불안한 기분이시군요. 안전한 곳에 계시니 걱정하지 마세요.',
    '두려운 마음이 느껴져요. 차분히 생각해보면 해결책이 보일 거예요.',
    '겁이 나시는군요. 천천히 마음을 진정시켜보세요.'
  ],
  'disgusted': [
    '불쾌한 기분이시군요. 깨끗한 공기를 마시며 마음을 정화해보세요.',
    '혐오감이 느껴져요. 좋은 생각으로 마음을 바꿔보세요.',
    '기분이 상하신 것 같아요. 잠시 다른 일에 집중해보세요.'
  ],
  'surprised': [
    '놀라신 것 같아요! 예상치 못한 일이 있었나요?',
    '깜짝 놀라셨군요! 그 감정을 긍정적으로 받아들여보세요.',
    '놀란 기분이시네요. 새로운 경험이었나요?'
  ]
};

// 감정별 활동 추천
const EMOTION_ACTIVITIES = {
  'angry': [
    '깊은 호흡 운동',
    '산책하기',
    '운동하기',
    '명상하기'
  ],
  'happy': [
    '좋아하는 음악 듣기',
    '친구와 만나기',
    '취미 활동하기',
    '긍정적인 생각하기'
  ],
  'neutral': [
    '책 읽기',
    '차 한 잔 마시기',
    '산책하기',
    '명상하기'
  ],
  'sad': [
    '따뜻한 차 마시기',
    '좋아하는 음악 듣기',
    '친구와 대화하기',
    '가벼운 운동하기'
  ],
  'excited': [
    '에너지 있는 활동하기',
    '새로운 것 도전하기',
    '창의적인 활동하기',
    '긍정적인 에너지 활용하기'
  ],
  'frustrated': [
    '명상하기',
    '깊은 호흡하기',
    '산책하기',
    '문제를 단계별로 정리하기'
  ],
  'fearful': [
    '안전한 환경에서 휴식하기',
    '차분한 음악 듣기',
    '깊은 호흡하기',
    '신뢰할 수 있는 사람과 대화하기'
  ],
  'disgusted': [
    '깨끗한 환경에서 휴식하기',
    '상쾌한 공기 마시기',
    '좋은 생각으로 마음 바꾸기',
    '긍정적인 활동하기'
  ],
  'surprised': [
    '새로운 경험 즐기기',
    '호기심을 자극하는 활동하기',
    '학습하기',
    '모험적인 활동하기'
  ]
};

class EmotionAnalysisSystem {
  constructor() {
    this.modelPath = path.join(__dirname, '..', 'models', 'emotion_model');
    this.isModelLoaded = false;
    this.currentEmotion = null;
    this.emotionConfidence = 0;
    this.emotionHistory = [];
    this.lastAnalysisTime = 0;
    
    // SpeechBrain 모델 초기화
    this.initializeSpeechBrainModel();
  }

  // SpeechBrain 모델 초기화
  async initializeSpeechBrainModel() {
    try {
      log.info('SpeechBrain 감정 인식 모델 초기화 중...');
      
      // Python 스크립트로 SpeechBrain 모델 로드
      const pythonScript = `
import torch
import torchaudio
import numpy as np
import json
import sys
from speechbrain.pretrained import EncoderClassifier

try:
    # SpeechBrain 모델 로드
    classifier = EncoderClassifier.from_hparams(
        source="${SPEECHBRAIN_MODEL}",
        savedir="models/emotion_model"
    )
    
    # 모델이 로드되었는지 확인
    print(json.dumps({
        "status": "success",
        "message": "SpeechBrain 모델이 성공적으로 로드되었습니다.",
        "model_loaded": True
    }))
    
except Exception as e:
    print(json.dumps({
        "status": "error",
        "message": str(e),
        "model_loaded": False
    }))
`;

      const result = await this.runPythonScript(pythonScript);
      
      if (result.status === 'success') {
        this.isModelLoaded = true;
        log.info('✅ SpeechBrain 모델 초기화 완료 - 고성능 감정 분석 사용 가능');
      } else {
        log.error('❌ SpeechBrain 모델 초기화 실패:', result.message);
        throw new Error('SpeechBrain 모델 초기화에 실패했습니다. PyTorch와 SpeechBrain이 올바르게 설치되었는지 확인해주세요.');
      }
      
    } catch (error) {
      log.error('❌ SpeechBrain 모델 초기화 중 오류:', error.message);
      throw new Error('SpeechBrain 모델 초기화에 실패했습니다. PyTorch와 SpeechBrain이 올바르게 설치되었는지 확인해주세요.');
    }
  }

  // Python 스크립트 실행 (가상환경 우선 사용)
  async runPythonScript(script) {
    return new Promise((resolve, reject) => {
      const tempFile = path.join(__dirname, '..', 'temp_script.py');
      
      try {
        fs.writeFileSync(tempFile, script);
        
        // 가상환경의 Python 경로 우선 사용
        const pythonPaths = [
          path.join(__dirname, '..', 'emotion_env', 'bin', 'python'),
          './emotion_env/bin/python',
          'emotion_env/bin/python',
          'python3'
        ];
        
        let pythonPath = pythonPaths[0];
        
        exec(`"${pythonPath}" "${tempFile}"`, (error, stdout, stderr) => {
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {
            // 파일 삭제 실패는 무시
          }
          
          if (error) {
            // 첫 번째 경로 실패 시 다른 경로 시도
            if (pythonPath === pythonPaths[0]) {
              pythonPath = pythonPaths[1];
              exec(`"${pythonPath}" "${tempFile}"`, (error2, stdout2, stderr2) => {
                try { fs.unlinkSync(tempFile); } catch (e) {}
                if (error2) {
                  pythonPath = pythonPaths[2];
                  exec(`"${pythonPath}" "${tempFile}"`, (error3, stdout3, stderr3) => {
                    try { fs.unlinkSync(tempFile); } catch (e) {}
                    if (error3) {
                      pythonPath = pythonPaths[3];
                      exec(`"${pythonPath}" "${tempFile}"`, (error4, stdout4, stderr4) => {
                        try { fs.unlinkSync(tempFile); } catch (e) {}
                        if (error4) {
                          reject(new Error(`Python 실행 오류: ${error4.message}`));
                          return;
                        }
                        try {
                          const result = JSON.parse(stdout4.trim());
                          resolve(result);
                        } catch (e) {
                          reject(new Error(`JSON 파싱 오류: ${stdout4}`));
                        }
                      });
                      return;
                    }
                    try {
                      const result = JSON.parse(stdout3.trim());
                      resolve(result);
                    } catch (e) {
                      reject(new Error(`JSON 파싱 오류: ${stdout3}`));
                    }
                  });
                  return;
                }
                try {
                  const result = JSON.parse(stdout2.trim());
                  resolve(result);
                } catch (e) {
                  reject(new Error(`JSON 파싱 오류: ${stdout2}`));
                }
              });
              return;
            }
            reject(new Error(`Python 실행 오류: ${error.message}`));
            return;
          }
          
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (e) {
            reject(new Error(`JSON 파싱 오류: ${stdout}`));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 오디오 버퍼를 WAV 파일로 변환
  convertToWav(audioBuffer, sampleRate = 16000) {
    try {
      // 간단한 WAV 헤더 생성
      const buffer = Buffer.from(audioBuffer);
      const wavHeader = this.createWavHeader(buffer.length, sampleRate, 1, 16);
      return Buffer.concat([wavHeader, buffer]);
    } catch (error) {
      log.error('WAV 변환 오류:', error.message);
      return null;
    }
  }

  // WAV 헤더 생성
  createWavHeader(dataLength, sampleRate, channels, bitsPerSample) {
    const buffer = Buffer.alloc(44);
    
    // RIFF 헤더
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    
    // fmt 청크
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
    buffer.writeUInt16LE(channels * bitsPerSample / 8, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    
    // data 청크
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    
    return buffer;
  }

  // SpeechBrain으로 감정 분석
  async analyzeEmotionWithSpeechBrain(audioBuffer) {
    try {
      if (!this.isModelLoaded) {
        throw new Error('SpeechBrain 모델이 로드되지 않았습니다.');
      }

      // 오디오 버퍼를 WAV로 변환
      const wavData = this.convertToWav(audioBuffer);
      if (!wavData) {
        throw new Error('오디오 데이터 변환 실패');
      }

      // 임시 WAV 파일 생성
      const tempWavFile = path.join(__dirname, '..', 'temp_audio.wav');
      fs.writeFileSync(tempWavFile, wavData);

      // Python 스크립트로 감정 분석
      const pythonScript = `
import torch
import torchaudio
import numpy as np
import json
import sys
from speechbrain.pretrained import EncoderClassifier

try:
    # SpeechBrain 모델 로드
    classifier = EncoderClassifier.from_hparams(
        source="${SPEECHBRAIN_MODEL}",
        savedir="models/emotion_model"
    )
    
    # 오디오 파일 로드
    signal = classifier.load_audio("${tempWavFile}")
    
    # 감정 분류
    out_prob, score, index, text_lab = classifier.classify_batch(signal)
    
    # 결과 처리
    emotion = text_lab[0]
    confidence = float(torch.max(out_prob).item())
    
    print(json.dumps({
        "status": "success",
        "emotion": emotion,
        "confidence": confidence,
        "raw_probabilities": out_prob.tolist()[0]
    }))
    
except Exception as e:
    print(json.dumps({
        "status": "error",
        "message": str(e)
    }))
`;

      const result = await this.runPythonScript(pythonScript);
      
      // 임시 파일 삭제
      try {
        fs.unlinkSync(tempWavFile);
      } catch (e) {
        // 파일 삭제 실패는 무시
      }

      if (result.status === 'success') {
        return {
          emotion: EMOTION_MAP[result.emotion] || result.emotion,
          confidence: result.confidence,
          rawProbabilities: result.raw_probabilities
        };
      } else {
        throw new Error(result.message);
      }
      
    } catch (error) {
      log.error('SpeechBrain 감정 분석 실패:', error.message);
      return { emotion: 'unknown', confidence: 0 };
    }
  }

  // 음성 버퍼에서 감정 분석
  async analyzeEmotionFromBuffer(audioBuffer) {
    try {
      // 최소 1초 분량의 오디오가 필요
      if (!audioBuffer || audioBuffer.length < 16000) {
        return { emotion: 'unknown', confidence: 0 };
      }

      // 너무 자주 분석하지 않도록 제한 (5초마다)
      const now = Date.now();
      if (now - this.lastAnalysisTime < 5000) {
        return this.currentEmotion || { emotion: 'unknown', confidence: 0 };
      }

      // SpeechBrain 모델이 로드되지 않았으면 오류 발생
      if (!this.isModelLoaded) {
        throw new Error('SpeechBrain 모델이 로드되지 않았습니다. PyTorch와 SpeechBrain이 올바르게 설치되었는지 확인해주세요.');
      }

      log.info('🤖 SpeechBrain으로 감정 분석 시작...');
      const result = await this.analyzeEmotionWithSpeechBrain(audioBuffer);
      
      if (result.emotion !== 'unknown' && result.confidence > 0.3) {
        // 감정 히스토리 업데이트
        this.emotionHistory.push({
          emotion: result.emotion,
          confidence: result.confidence,
          timestamp: now
        });
        
        // 최근 10개 감정만 유지
        if (this.emotionHistory.length > 10) {
          this.emotionHistory = this.emotionHistory.slice(-10);
        }
        
        // 현재 감정 업데이트
        this.currentEmotion = result;
        this.emotionConfidence = result.confidence;
        this.lastAnalysisTime = now;
        
        log.info('✅ 감정 분석 완료:', result);
      }
      
      return result;
      
    } catch (error) {
      log.error('❌ 감정 분석 실패:', error.message);
      throw error; // 오류를 다시 던져서 상위에서 처리하도록 함
    }
  }

  // 현재 감정 정보 반환
  getCurrentEmotion() {
    return {
      emotion: this.currentEmotion?.emotion || 'unknown',
      confidence: this.emotionConfidence || 0,
      history: this.emotionHistory,
      trend: this.getEmotionTrend(),
      timestamp: Date.now()
    };
  }

  // 감정 트렌드 분석
  getEmotionTrend() {
    if (this.emotionHistory.length < 2) {
      return 'stable';
    }
    
    const recent = this.emotionHistory.slice(-3);
    const emotions = recent.map(e => e.emotion);
    
    // 감정 변화 패턴 분석
    if (emotions.every(e => e === emotions[0])) {
      return 'stable';
    } else if (emotions.includes('happy') || emotions.includes('excited')) {
      return 'improving';
    } else if (emotions.includes('sad') || emotions.includes('angry')) {
      return 'declining';
    } else {
      return 'fluctuating';
    }
  }

  // 감정 기반 응답 생성
  generateEmotionResponse(emotion, confidence) {
    const messages = EMOTION_MESSAGES[emotion] || ['기분이 어떤지 말씀해주세요.'];
    const activities = EMOTION_ACTIVITIES[emotion] || ['산책하기'];
    const music = EMOTION_MUSIC_RECOMMENDATIONS[emotion] || ['편안한 음악'];
    
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const randomActivity = activities[Math.floor(Math.random() * activities.length)];
    const randomMusic = music[Math.floor(Math.random() * music.length)];
    
    return {
      response: randomMessage,
      recommendations: {
        activity: randomActivity,
        music: randomMusic,
        confidence: confidence
      }
    };
  }

  // 음악 추천
  getMusicRecommendation(emotion) {
    const music = EMOTION_MUSIC_RECOMMENDATIONS[emotion];
    if (music && music.length > 0) {
      return music[Math.floor(Math.random() * music.length)];
    }
    return '편안한 음악';
  }

  // 감정 기반 추천 전체 반환
  getEmotionBasedRecommendations(emotion) {
    return {
      music: EMOTION_MUSIC_RECOMMENDATIONS[emotion] || [],
      activities: EMOTION_ACTIVITIES[emotion] || [],
      messages: EMOTION_MESSAGES[emotion] || []
    };
  }
}

module.exports = {
  EmotionAnalysisSystem,
  EMOTION_MAP,
  EMOTION_MUSIC_RECOMMENDATIONS,
  EMOTION_MESSAGES,
  EMOTION_ACTIVITIES
};
