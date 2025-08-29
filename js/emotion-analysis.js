const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { log } = require('./logging');

// 감정 매핑
const EMOTION_MAP = {
  '01': 'neutral',
  '02': 'calm', 
  '03': 'happy',
  '04': 'sad',
  '05': 'angry',
  '06': 'fearful',
  '07': 'disgust',
  '08': 'surprised'
};

// 감정별 음악 추천
const EMOTION_MUSIC_RECOMMENDATIONS = {
  'neutral': [
    'Ambient music',
    'Classical piano',
    'Nature sounds',
    'Lo-fi beats'
  ],
  'calm': [
    'Meditation music',
    'Spa relaxation',
    'Soft jazz',
    'Rain sounds'
  ],
  'happy': [
    'Upbeat pop',
    'Dance music',
    'Summer hits',
    'Feel-good songs'
  ],
  'sad': [
    'Comforting ballads',
    'Melancholic indie',
    'Healing music',
    'Gentle acoustic'
  ],
  'angry': [
    'Rock music',
    'Heavy metal',
    'Energetic workout',
    'Punk rock'
  ],
  'fearful': [
    'Calming nature sounds',
    'Soft classical',
    'Peaceful meditation',
    'Gentle lullabies'
  ],
  'disgust': [
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

// 감정별 메시지 추천
const EMOTION_MESSAGES = {
  'neutral': [
    '평온한 하루를 보내고 계시네요.',
    '차분한 마음으로 하루를 시작해보세요.',
    '조용한 시간을 즐기고 계시는군요.'
  ],
  'calm': [
    '마음이 평온하시군요. 좋은 하루 되세요.',
    '차분한 기운이 느껴집니다.',
    '평화로운 시간을 보내고 계시네요.'
  ],
  'happy': [
    '기분이 좋으시군요! 더욱 즐거운 하루 되세요!',
    '행복한 에너지가 가득하네요!',
    '웃음이 가득한 하루를 보내세요!'
  ],
  'sad': [
    '마음이 무겁으시군요. 괜찮아질 거예요.',
    '슬픈 마음을 이해합니다. 힘내세요.',
    '어려운 시간을 보내고 계시는군요. 곧 좋아질 거예요.'
  ],
  'angry': [
    '화가 나신 것 같네요. 깊은 호흡을 해보세요.',
    '분노를 느끼고 계시는군요. 잠시 휴식을 취해보세요.',
    '화가 나실 만한 상황이었겠어요. 차분해지세요.'
  ],
  'fearful': [
    '불안하신 것 같네요. 안전한 곳에서 휴식을 취해보세요.',
    '두려움을 느끼고 계시는군요. 괜찮아요.',
    '걱정이 많으시군요. 차분히 생각해보세요.'
  ],
  'disgust': [
    '싫증을 느끼고 계시는군요. 기분 전환을 해보세요.',
    '불쾌감을 느끼고 계시네요. 좋아하는 것을 해보세요.',
    '기분이 좋지 않으시군요. 새로운 것을 시도해보세요.'
  ],
  'surprised': [
    '놀라신 것 같네요! 흥미로운 일이 있었나요?',
    '깜짝 놀라셨군요! 어떤 일이 있었나요?',
    '놀라운 일이 있었나요? 이야기해주세요!'
  ]
};

// 감정별 활동 추천
const EMOTION_ACTIVITIES = {
  'neutral': [
    '책 읽기',
    '산책하기',
    '음악 듣기',
    '명상하기'
  ],
  'calm': [
    '요가하기',
    '차 마시기',
    '그림 그리기',
    '일기 쓰기'
  ],
  'happy': [
    '친구들과 만나기',
    '좋아하는 음식 먹기',
    '운동하기',
    '취미 활동하기'
  ],
  'sad': [
    '따뜻한 차 마시기',
    '좋아하는 음악 듣기',
    '친구와 대화하기',
    '가벼운 산책하기'
  ],
  'angry': [
    '깊은 호흡하기',
    '운동하기',
    '명상하기',
    '차분한 음악 듣기'
  ],
  'fearful': [
    '안전한 곳에서 휴식하기',
    '신뢰하는 사람과 대화하기',
    '차분한 음악 듣기',
    '명상하기'
  ],
  'disgust': [
    '기분 전환하기',
    '좋아하는 활동하기',
    '깨끗한 환경에서 휴식하기',
    '새로운 취미 시작하기'
  ],
  'surprised': [
    '새로운 경험 즐기기',
    '호기심을 자극하는 활동하기',
    '새로운 것을 배우기',
    '모험적인 활동하기'
  ]
};

class EmotionAnalysisSystem {
  constructor() {
    this.modelsPath = path.join(__dirname, '../models');
    this.modelPath = path.join(this.modelsPath, 'emotion_model.pkl');
    this.featurePath = path.join(this.modelsPath, 'emotion_features.json');
    this.emotionHistory = [];
    this.currentEmotion = null;
    this.emotionConfidence = 0;
    this.audioBuffer = [];
    this.sampleRate = 16000;
    this.model = null;
    this.modelInfo = null;
    this.isModelLoaded = false;
    
    // 모델 로드 시도
    this.loadModel();
  }

  // JavaScript 기반 감정 분석 - 오디오 특징 추출
  extractAudioFeatures(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) {
      return null;
    }

    // 기본 오디오 특징 계산
    const features = {
      volume: this.calculateVolume(audioBuffer),
      pitch: this.calculatePitch(audioBuffer),
      speechRate: this.calculateSpeechRate(audioBuffer),
      energy: this.calculateEnergy(audioBuffer),
      zeroCrossingRate: this.calculateZeroCrossingRate(audioBuffer)
    };

    return features;
  }

  // 볼륨 계산
  calculateVolume(audioBuffer) {
    const sum = audioBuffer.reduce((acc, sample) => acc + Math.abs(sample), 0);
    return sum / audioBuffer.length;
  }

  // 피치 계산 (간단한 방법)
  calculatePitch(audioBuffer) {
    // 간단한 피치 추정 (실제로는 더 복잡한 알고리즘이 필요)
    let crossings = 0;
    for (let i = 1; i < audioBuffer.length; i++) {
      if ((audioBuffer[i] >= 0 && audioBuffer[i-1] < 0) || 
          (audioBuffer[i] < 0 && audioBuffer[i-1] >= 0)) {
        crossings++;
      }
    }
    return crossings / audioBuffer.length;
  }

  // 음성 속도 추정
  calculateSpeechRate(audioBuffer) {
    // 간단한 음성 활동 감지
    let speechSegments = 0;
    const threshold = 0.01;
    
    for (let i = 0; i < audioBuffer.length; i += 100) {
      const segment = audioBuffer.slice(i, i + 100);
      const segmentEnergy = this.calculateEnergy(segment);
      if (segmentEnergy > threshold) {
        speechSegments++;
      }
    }
    
    return speechSegments / (audioBuffer.length / 100);
  }

  // 에너지 계산
  calculateEnergy(audioBuffer) {
    const sum = audioBuffer.reduce((acc, sample) => acc + sample * sample, 0);
    return Math.sqrt(sum / audioBuffer.length);
  }

  // 제로 크로싱 레이트 계산
  calculateZeroCrossingRate(audioBuffer) {
    let crossings = 0;
    for (let i = 1; i < audioBuffer.length; i++) {
      if ((audioBuffer[i] >= 0 && audioBuffer[i-1] < 0) || 
          (audioBuffer[i] < 0 && audioBuffer[i-1] >= 0)) {
        crossings++;
      }
    }
    return crossings / audioBuffer.length;
  }

  // 규칙 기반 감정 분류
  classifyEmotion(features) {
    if (!features) {
      return { emotion: 'neutral', confidence: 0.5 };
    }

    const { volume, pitch, speechRate, energy, zeroCrossingRate } = features;
    
    // 감정별 특징 패턴 정의
    const emotionPatterns = {
      happy: {
        volume: { min: 0.3, max: 1.0 },
        pitch: { min: 0.4, max: 1.0 },
        speechRate: { min: 0.6, max: 1.0 },
        energy: { min: 0.4, max: 1.0 }
      },
      sad: {
        volume: { min: 0.0, max: 0.4 },
        pitch: { min: 0.0, max: 0.3 },
        speechRate: { min: 0.0, max: 0.4 },
        energy: { min: 0.0, max: 0.3 }
      },
      angry: {
        volume: { min: 0.6, max: 1.0 },
        pitch: { min: 0.5, max: 1.0 },
        speechRate: { min: 0.7, max: 1.0 },
        energy: { min: 0.6, max: 1.0 }
      },
      calm: {
        volume: { min: 0.1, max: 0.5 },
        pitch: { min: 0.2, max: 0.6 },
        speechRate: { min: 0.2, max: 0.6 },
        energy: { min: 0.1, max: 0.4 }
      },
      fearful: {
        volume: { min: 0.2, max: 0.6 },
        pitch: { min: 0.3, max: 0.8 },
        speechRate: { min: 0.4, max: 0.8 },
        energy: { min: 0.2, max: 0.5 }
      },
      surprised: {
        volume: { min: 0.5, max: 1.0 },
        pitch: { min: 0.6, max: 1.0 },
        speechRate: { min: 0.5, max: 1.0 },
        energy: { min: 0.5, max: 1.0 }
      },
      disgust: {
        volume: { min: 0.3, max: 0.7 },
        pitch: { min: 0.2, max: 0.6 },
        speechRate: { min: 0.3, max: 0.7 },
        energy: { min: 0.3, max: 0.6 }
      },
      neutral: {
        volume: { min: 0.2, max: 0.6 },
        pitch: { min: 0.3, max: 0.7 },
        speechRate: { min: 0.3, max: 0.7 },
        energy: { min: 0.2, max: 0.5 }
      }
    };

    // 각 감정에 대한 매칭 점수 계산
    const scores = {};
    
    for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
      let score = 0;
      let totalFeatures = 0;
      
      // 볼륨 매칭
      if (volume >= pattern.volume.min && volume <= pattern.volume.max) {
        score += 1;
      }
      totalFeatures++;
      
      // 피치 매칭
      if (pitch >= pattern.pitch.min && pitch <= pattern.pitch.max) {
        score += 1;
      }
      totalFeatures++;
      
      // 음성 속도 매칭
      if (speechRate >= pattern.speechRate.min && speechRate <= pattern.speechRate.max) {
        score += 1;
      }
      totalFeatures++;
      
      // 에너지 매칭
      if (energy >= pattern.energy.min && energy <= pattern.energy.max) {
        score += 1;
      }
      totalFeatures++;
      
      scores[emotion] = score / totalFeatures;
    }

    // 가장 높은 점수의 감정 찾기
    let bestEmotion = 'neutral';
    let bestScore = 0;
    
    for (const [emotion, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestEmotion = emotion;
      }
    }

    return {
      emotion: bestEmotion,
      confidence: bestScore
    };
  }

  // 모델 로드
  loadModel() {
    try {
      if (fs.existsSync(this.featurePath)) {
        this.modelInfo = JSON.parse(fs.readFileSync(this.featurePath, 'utf8'));
        log(`[감정분석] 모델 정보 로드됨: ${this.modelInfo.model_type}, 정확도: ${this.modelInfo.accuracy}`);
        this.isModelLoaded = true;
      } else {
        log(`[감정분석] 모델 파일이 없습니다. 기본 규칙 기반 분석을 사용합니다.`);
      }
    } catch (error) {
      log(`[감정분석] 모델 로드 실패: ${error.message}`);
    }
  }

  // Python을 사용한 고급 특징 추출
  async extractAdvancedFeatures(audioBuffer) {
    return new Promise((resolve, reject) => {
      if (!this.isModelLoaded) {
        resolve(null);
        return;
      }

      const pythonScript = `
import librosa
import numpy as np
import json
import sys
import tempfile
import os

def extract_advanced_features(audio_data):
    try:
        # 임시 파일로 저장
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_file.write(audio_data)
            temp_path = temp_file.name
        
        # 오디오 로드
        y, sr = librosa.load(temp_path, sr=22050)
        
        # 고급 특징 추출
        features = {}
        
        # MFCC 특징
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        features['mfcc_mean'] = np.mean(mfcc, axis=1).tolist()
        features['mfcc_std'] = np.std(mfcc, axis=1).tolist()
        
        # 스펙트럴 특징
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)
        features['spectral_centroid_mean'] = float(np.mean(spectral_centroids))
        features['spectral_centroid_std'] = float(np.std(spectral_centroids))
        
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
        features['spectral_rolloff_mean'] = float(np.mean(spectral_rolloff))
        features['spectral_rolloff_std'] = float(np.std(spectral_rolloff))
        
        # 제로 크로싱 레이트
        zero_crossing_rate = librosa.feature.zero_crossing_rate(y)
        features['zero_crossing_rate_mean'] = float(np.mean(zero_crossing_rate))
        features['zero_crossing_rate_std'] = float(np.std(zero_crossing_rate))
        
        # 리듬 특징
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        features['tempo'] = float(tempo)
        
        # 크로마 특징
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        features['chroma_mean'] = np.mean(chroma, axis=1).tolist()
        features['chroma_std'] = np.std(chroma, axis=1).tolist()
        
        # 멜 스펙트로그램
        mel_spectrogram = librosa.feature.melspectrogram(y=y, sr=sr)
        features['mel_spectrogram_mean'] = float(np.mean(mel_spectrogram))
        features['mel_spectrogram_std'] = float(np.std(mel_spectrogram))
        
        # RMS 에너지
        rms = librosa.feature.rms(y=y)
        features['rms_mean'] = float(np.mean(rms))
        features['rms_std'] = float(np.std(rms))
        
        # 임시 파일 삭제
        os.unlink(temp_path)
        
        print(json.dumps(features))
        
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    audio_data = sys.stdin.buffer.read()
    extract_advanced_features(audio_data)
      `;

      const tempScriptPath = path.join(__dirname, '../temp_advanced_extractor.py');
      fs.writeFileSync(tempScriptPath, pythonScript);

      // 오디오 데이터를 WAV 형식으로 변환
      const wavBuffer = this.convertToWav(audioBuffer);
      
      // Python 스크립트 실행
      const pythonPath = fs.existsSync(path.join(__dirname, '../venv/bin/python')) 
        ? path.join(__dirname, '../venv/bin/python') 
        : 'python3';
      
      const child = exec(`"${pythonPath}" "${tempScriptPath}"`, (error, stdout, stderr) => {
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // 파일 삭제 실패는 무시
        }

        if (error) {
          log(`[감정분석] 고급 특징 추출 실패: ${error.message}`);
          resolve(null);
          return;
        }

        try {
          const features = JSON.parse(stdout);
          if (features.error) {
            log(`[감정분석] 특징 추출 오류: ${features.error}`);
            resolve(null);
            return;
          }
          resolve(features);
        } catch (e) {
          log(`[감정분석] 특징 파싱 실패: ${e.message}`);
          resolve(null);
        }
      });

      // 오디오 데이터를 stdin으로 전송
      child.stdin.write(wavBuffer);
      child.stdin.end();
    });
  }

  // 오디오 버퍼를 WAV 형식으로 변환
  convertToWav(audioBuffer) {
    // 간단한 WAV 헤더 생성 (16kHz, 16bit, mono)
    const sampleRate = 22050;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = audioBuffer.length * 2;
    const fileSize = 36 + dataSize;
    
    const buffer = Buffer.alloc(44 + dataSize);
    
    // WAV 헤더 작성
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    
    // 오디오 데이터 작성
    for (let i = 0; i < audioBuffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer[i]));
      const intSample = Math.round(sample * 32767);
      buffer.writeInt16LE(intSample, 44 + i * 2);
    }
    
    return buffer;
  }

  // 실시간 오디오 버퍼에서 감정 분석
  async analyzeEmotionFromBuffer(audioBuffer) {
    try {
      let features = null;
      
      // 고급 특징 추출 시도 (Python 모델이 있는 경우)
      if (this.isModelLoaded) {
        features = await this.extractAdvancedFeatures(audioBuffer);
      }
      
      // 고급 특징 추출이 실패하면 기본 특징 사용
      if (!features) {
        features = this.extractAudioFeatures(audioBuffer);
      }
      
      if (!features) {
        return { emotion: 'neutral', confidence: 0.5 };
      }

      const result = this.classifyEmotion(features);
      
      // 감정 히스토리에 추가
      this.emotionHistory.push({
        emotion: result.emotion,
        confidence: result.confidence,
        timestamp: Date.now()
      });

      // 최근 10개만 유지
      if (this.emotionHistory.length > 10) {
        this.emotionHistory.shift();
      }

      // 현재 감정 업데이트
      this.currentEmotion = result.emotion;
      this.emotionConfidence = result.confidence;

      log(`[감정분석] 감정: ${result.emotion}, 신뢰도: ${(result.confidence * 100).toFixed(1)}%`);
      
      return result;
    } catch (error) {
      log(`[감정분석] 오류: ${error.message}`);
      return { emotion: 'neutral', confidence: 0.5 };
    }
  }

  // 감정 기반 추천 생성
  generateEmotionRecommendations(emotion) {
    const musicRecommendations = EMOTION_MUSIC_RECOMMENDATIONS[emotion] || EMOTION_MUSIC_RECOMMENDATIONS.neutral;
    const messages = EMOTION_MESSAGES[emotion] || EMOTION_MESSAGES.neutral;
    const activities = EMOTION_ACTIVITIES[emotion] || EMOTION_ACTIVITIES.neutral;

    return {
      music: musicRecommendations[Math.floor(Math.random() * musicRecommendations.length)],
      message: messages[Math.floor(Math.random() * messages.length)],
      activity: activities[Math.floor(Math.random() * activities.length)]
    };
  }

  // 감정 히스토리 가져오기
  getEmotionHistory() {
    return this.emotionHistory;
  }

  // 현재 감정 가져오기
  getCurrentEmotion() {
    return {
      emotion: this.currentEmotion || 'neutral',
      confidence: this.emotionConfidence || 0.5
    };
  }

  // 감정 분석 결과를 JSON으로 반환
  getEmotionAnalysisResult() {
    const current = this.getCurrentEmotion();
    const recommendations = this.generateEmotionRecommendations(current.emotion);
    
    return {
      emotion: current.emotion,
      confidence: current.confidence,
      recommendations: recommendations,
      history: this.emotionHistory.slice(-5) // 최근 5개만
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
