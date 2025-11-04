const axios = require('axios');
const { log } = require('./logging');

// 맥북 서버 설정
const { EMOTION_SERVER_URL } = require('./config');
const EMOTION_ANALYSIS_TIMEOUT = 10000; // 10초 타임아웃

/**
 * 고성능 음성 감정 분석 클라이언트
 */
class EmotionAnalysisClient {
  constructor() {
    this.serverUrl = EMOTION_SERVER_URL;
    this.isConnected = false;
    this.lastHealthCheck = 0;
    this.healthCheckInterval = 30000; // 30초마다 헬스체크
  }

  /**
   * 서버 연결 상태 확인
   */
  async checkServerHealth() {
    try {
      const now = Date.now();
      if (now - this.lastHealthCheck < this.healthCheckInterval) {
        return this.isConnected;
      }

      const response = await axios.get(`${this.serverUrl}/health`, {
        timeout: 5000
      });

      this.isConnected = response.data.status === 'healthy';
      this.lastHealthCheck = now;
      
      if (this.isConnected) {
        log.info(`감정 분석 서버 연결됨 (디바이스: ${response.data.device})`);
      }
      
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      log.warn('감정 분석 서버 연결 실패:', error.message);
      return false;
    }
  }

  /**
   * 음성 데이터를 맥북 서버로 전송하여 감정 분석
   */
  async analyzeEmotion(audioBuffer) {
    try {
      if (!audioBuffer || audioBuffer.length === 0) {
        log.warn('음성 데이터가 비어있습니다.');
        return null;
      }

      // 서버 연결 상태 확인
      const isHealthy = await this.checkServerHealth();
      if (!isHealthy) {
        log.warn('감정 분석 서버가 연결되지 않았습니다.');
        return null;
      }

      // 오디오 버퍼를 base64로 인코딩
      const audioBase64 = audioBuffer.toString('base64');
      
      log.info('맥북 서버로 감정 분석 요청 중...');
      const startTime = Date.now();
      
      const response = await axios.post(`${this.serverUrl}/analyze_emotion`, {
        audio_base64: audioBase64
      }, {
        timeout: EMOTION_ANALYSIS_TIMEOUT,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const processingTime = Date.now() - startTime;

      if (response.data.success) {
        const { emotion, confidence, response: emotionResponse, emotion_scores, processing_time } = response.data;
        
        log.info(`감정 분석 완료: ${emotion} (신뢰도: ${(confidence * 100).toFixed(1)}%)`);
        log.info(`총 처리 시간: ${processingTime}ms (서버: ${(processing_time * 1000).toFixed(0)}ms)`);
        
        return {
          emotion,
          confidence,
          response: emotionResponse,
          emotion_scores,
          processing_time: processingTime,
          success: true
        };
      } else {
        log.error('감정 분석 실패:', response.data.error);
        return null;
      }
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        log.warn('맥북 감정 분석 서버에 연결할 수 없습니다.');
      } else if (error.code === 'ETIMEDOUT') {
        log.warn('감정 분석 서버 응답 시간 초과');
      } else {
        log.error('감정 분석 오류:', error.message);
      }
      return null;
    }
  }

  /**
   * 파일 업로드 방식으로 감정 분석
   */
  async analyzeEmotionFromFile(audioFilePath) {
    try {
      const fs = require('fs');
      
      if (!fs.existsSync(audioFilePath)) {
        log.error('오디오 파일이 존재하지 않습니다:', audioFilePath);
        return null;
      }

      const audioBuffer = fs.readFileSync(audioFilePath);
      return await this.analyzeEmotion(audioBuffer);
      
    } catch (error) {
      log.error('파일 기반 감정 분석 오류:', error.message);
      return null;
    }
  }

  /**
   * 감정 기반 응답 처리
   */
  async processEmotionResponse(emotionResult, broadcast) {
    if (!emotionResult || !emotionResult.success) {
      return null;
    }

    const { emotion, confidence, response, emotion_scores, processing_time } = emotionResult;
    
    // 신뢰도가 낮으면 기본 응답 사용
    if (confidence < 0.3) {
      log.info('감정 분석 신뢰도가 낮아 기본 응답을 사용합니다.');
      return null;
    }

    // 감정 정보를 브로드캐스트
    if (broadcast) {
      broadcast({ 
        type: 'emotion_detected', 
        emotion, 
        confidence,
        response,
        emotion_scores,
        processing_time
      });
    }

    log.info(`감정 기반 응답: ${response}`);
    return response;
  }

  /**
   * 감정별 맞춤형 액션 제안
   */
  getEmotionAction(emotion, confidence) {
    if (confidence < 0.5) return null;

    const actions = {
      'angry': {
        action: 'play_calm_music',
        message: '차분한 음악을 재생하시겠습니까?',
        music_type: 'calm'
      },
      'sad': {
        action: 'play_cheerful_music',
        message: '기분이 좋아질 수 있는 음악을 들려드릴까요?',
        music_type: 'cheerful'
      },
      'fearful': {
        action: 'play_peaceful_music',
        message: '안정감을 주는 음악을 틀어드릴까요?',
        music_type: 'peaceful'
      },
      'happy': {
        action: 'play_energetic_music',
        message: '더 즐거운 음악을 들려드릴까요?',
        music_type: 'energetic'
      },
      'neutral': {
        action: 'general_assistance',
        message: '어떤 도움이 필요하신가요?',
        music_type: null
      }
    };

    return actions[emotion] || null;
  }
}

// 전역 인스턴스 생성
const emotionClient = new EmotionAnalysisClient();

// 기존 함수들과의 호환성을 위한 래퍼 함수들
const analyzeEmotion = async (audioBuffer) => {
  return await emotionClient.analyzeEmotion(audioBuffer);
};

const processEmotionResponse = async (emotionResult, broadcast) => {
  return await emotionClient.processEmotionResponse(emotionResult, broadcast);
};

const checkServerHealth = async () => {
  return await emotionClient.checkServerHealth();
};

module.exports = {
  EmotionAnalysisClient,
  emotionClient,
  analyzeEmotion,
  processEmotionResponse,
  checkServerHealth
};
