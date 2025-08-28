const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { log } = require('./logging');

// RAVDESS 데이터셋 파일명 구조 분석
// 파일명 형식: 03-01-08-02-02-02-01.wav
// 각 숫자의 의미:
// 03: Modality (01=full-AV, 02=video-only, 03=audio-only)
// 01: Vocal channel (01=speech, 02=song)
// 08: Emotion (01=neutral, 02=calm, 03=happy, 04=sad, 05=angry, 06=fearful, 07=disgust, 08=surprised)
// 02: Emotional intensity (01=normal, 02=strong)
// 02: Statement (01=Kids, 02=Dogs)
// 02: Repetition (01=1st, 02=2nd)
// 01: Actor (01-24)

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
    '어려운 시간이 지나면 좋은 일이 있을 거예요.'
  ],
  'angry': [
    '화가 나셨군요. 심호흡을 깊게 해보세요.',
    '분노를 조절하는 것이 중요해요.',
    '잠시 휴식을 취해보시는 건 어떨까요?'
  ],
  'fearful': [
    '걱정이 많으시군요. 차분히 생각해보세요.',
    '두려움을 이겨낼 수 있어요.',
    '안전한 곳에 계시니 걱정하지 마세요.'
  ],
  'disgust': [
    '불편한 기분이시군요. 다른 것에 집중해보세요.',
    '기분 전환이 필요하신 것 같아요.',
    '좋은 일에 집중해보시는 건 어떨까요?'
  ],
  'surprised': [
    '놀라신 일이 있으셨군요!',
    '예상치 못한 일이 있었나요?',
    '새로운 경험이신가요?'
  ]
};

// 감정별 활동 추천
const EMOTION_ACTIVITIES = {
  'neutral': [
    '책 읽기',
    '산책하기',
    '명상하기',
    '차 한 잔 마시기'
  ],
  'calm': [
    '요가하기',
    '명상하기',
    '자연 속 산책',
    '따뜻한 차 마시기'
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
    this.emotionHistory = [];
    this.currentEmotion = null;
    this.emotionConfidence = 0;
  }

  // RAVDESS 파일명에서 감정 추출
  parseRavdessFilename(filename) {
    const parts = filename.replace('.wav', '').split('-');
    if (parts.length >= 7) {
      const emotionCode = parts[2];
      return EMOTION_MAP[emotionCode] || 'unknown';
    }
    return 'unknown';
  }

  // 음성 파일의 MFCC 특징 추출 (Python 스크립트 사용)
  async extractMFCCFeatures(audioPath) {
    return new Promise((resolve, reject) => {
      const pythonScript = `
import librosa
import numpy as np
import json
import sys

def extract_mfcc(audio_path):
    try:
        # 오디오 로드
        y, sr = librosa.load(audio_path, sr=22050)
        
        # MFCC 추출
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        
        # 통계적 특징 계산
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_std = np.std(mfcc, axis=1)
        
        # 추가 특징들
        spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        spectral_rolloff = np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))
        zero_crossing_rate = np.mean(librosa.feature.zero_crossing_rate(y))
        
        features = {
            'mfcc_mean': mfcc_mean.tolist(),
            'mfcc_std': mfcc_std.tolist(),
            'spectral_centroid': float(spectral_centroid),
            'spectral_rolloff': float(spectral_rolloff),
            'zero_crossing_rate': float(zero_crossing_rate)
        }
        
        print(json.dumps(features))
        
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    audio_path = sys.argv[1]
    extract_mfcc(audio_path)
      `;

      const tempScriptPath = path.join(__dirname, '../temp_mfcc_extractor.py');
      fs.writeFileSync(tempScriptPath, pythonScript);

      exec(`python "${tempScriptPath}" "${audioPath}"`, (error, stdout, stderr) => {
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          // 파일 삭제 실패는 무시
        }

        if (error) {
          log.error('MFCC 추출 실패:', error.message);
          reject(error);
          return;
        }

        try {
          const features = JSON.parse(stdout);
          if (features.error) {
            reject(new Error(features.error));
            return;
          }
          resolve(features);
        } catch (e) {
          reject(new Error('특징 파싱 실패: ' + e.message));
        }
      });
    });
  }

  // 간단한 감정 분류 (MFCC 특징 기반)
  async classifyEmotion(features) {
    // 실제 구현에서는 머신러닝 모델을 사용해야 하지만,
    // 여기서는 간단한 규칙 기반 분류를 구현합니다.
    
    const { spectral_centroid, spectral_rolloff, zero_crossing_rate } = features;
    
    // 스펙트럴 중심주파수가 높으면 활발한 감정 (happy, surprised, angry)
    if (spectral_centroid > 2000) {
      if (zero_crossing_rate > 0.1) {
        return { emotion: 'happy', confidence: 0.7 };
      } else {
        return { emotion: 'surprised', confidence: 0.6 };
      }
    }
    
    // 스펙트럴 중심주파수가 낮으면 차분한 감정 (sad, calm, neutral)
    if (spectral_centroid < 1000) {
      if (zero_crossing_rate < 0.05) {
        return { emotion: 'sad', confidence: 0.7 };
      } else {
        return { emotion: 'calm', confidence: 0.6 };
      }
    }
    
    // 중간 범위는 중립적
    return { emotion: 'neutral', confidence: 0.5 };
  }

  // 음성 파일에서 감정 분석
  async analyzeEmotionFromAudio(audioPath) {
    try {
      log.info('음성 감정 분석 시작:', audioPath);
      
      // MFCC 특징 추출
      const features = await this.extractMFCCFeatures(audioPath);
      
      // 감정 분류
      const result = await this.classifyEmotion(features);
      
      // 감정 히스토리 업데이트
      this.emotionHistory.push({
        emotion: result.emotion,
        confidence: result.confidence,
        timestamp: Date.now()
      });
      
      // 최근 10개 감정만 유지
      if (this.emotionHistory.length > 10) {
        this.emotionHistory = this.emotionHistory.slice(-10);
      }
      
      // 현재 감정 업데이트
      this.currentEmotion = result.emotion;
      this.emotionConfidence = result.confidence;
      
      log.info('감정 분석 완료:', result);
      return result;
      
    } catch (error) {
      log.error('감정 분석 실패:', error.message);
      return { emotion: 'unknown', confidence: 0 };
    }
  }

  // 실시간 음성 스트림에서 감정 분석
  async analyzeEmotionFromStream(audioBuffer) {
    try {
      // 임시 파일로 저장
      const tempPath = path.join(__dirname, '../temp_audio.wav');
      fs.writeFileSync(tempPath, audioBuffer);
      
      const result = await this.analyzeEmotionFromAudio(tempPath);
      
      // 임시 파일 삭제
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        // 파일 삭제 실패는 무시
      }
      
      return result;
    } catch (error) {
      log.error('스트림 감정 분석 실패:', error.message);
      return { emotion: 'unknown', confidence: 0 };
    }
  }

  // 감정에 따른 음악 추천
  getMusicRecommendation(emotion) {
    const recommendations = EMOTION_MUSIC_RECOMMENDATIONS[emotion] || EMOTION_MUSIC_RECOMMENDATIONS['neutral'];
    const randomIndex = Math.floor(Math.random() * recommendations.length);
    return recommendations[randomIndex];
  }

  // 감정에 따른 메시지 추천
  getEmotionMessage(emotion) {
    const messages = EMOTION_MESSAGES[emotion] || EMOTION_MESSAGES['neutral'];
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
  }

  // 감정에 따른 활동 추천
  getActivityRecommendation(emotion) {
    const activities = EMOTION_ACTIVITIES[emotion] || EMOTION_ACTIVITIES['neutral'];
    const randomIndex = Math.floor(Math.random() * activities.length);
    return activities[randomIndex];
  }

  // 종합적인 감정 기반 추천
  getEmotionBasedRecommendations(emotion) {
    return {
      emotion: emotion,
      music: this.getMusicRecommendation(emotion),
      message: this.getEmotionMessage(emotion),
      activity: this.getActivityRecommendation(emotion),
      timestamp: Date.now()
    };
  }

  // 감정 변화 추적
  getEmotionTrend() {
    if (this.emotionHistory.length < 2) {
      return { trend: 'stable', change: 0 };
    }

    const recent = this.emotionHistory.slice(-3);
    const emotions = recent.map(e => e.emotion);
    
    // 감정 변화 분석
    const uniqueEmotions = [...new Set(emotions)];
    if (uniqueEmotions.length === 1) {
      return { trend: 'stable', emotion: uniqueEmotions[0] };
    } else if (uniqueEmotions.length > 1) {
      return { trend: 'changing', from: emotions[0], to: emotions[emotions.length - 1] };
    }
    
    return { trend: 'unknown' };
  }

  // 현재 감정 상태 가져오기
  getCurrentEmotion() {
    return {
      emotion: this.currentEmotion,
      confidence: this.emotionConfidence,
      history: this.emotionHistory.slice(-5), // 최근 5개
      trend: this.getEmotionTrend()
    };
  }

  // 감정 기반 응답 생성
  generateEmotionResponse(emotion, confidence) {
    const recommendations = this.getEmotionBasedRecommendations(emotion);
    
    let response = '';
    
    if (confidence > 0.7) {
      response = `${recommendations.message} `;
      response += `지금은 ${recommendations.music}을 들으시면 좋을 것 같아요. `;
      response += `${recommendations.activity}도 추천드려요.`;
    } else if (confidence > 0.5) {
      response = `${recommendations.message} `;
      response += `기분 전환을 위해 ${recommendations.activity}는 어떠세요?`;
    } else {
      response = '음성을 잘 들을 수 없어서 정확한 감정을 파악하기 어려워요. ';
      response += '다시 한 번 말씀해 주시겠어요?';
    }
    
    return {
      response: response,
      recommendations: recommendations,
      confidence: confidence
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
