// ========== AI 기능 통합 모듈 ==========
// app.js에 추가할 핵심 코드들

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const { log } = require('./js/enhanced-logging');
const { processRecognizedCommand } = require('./js/conversation');

// 날씨 데이터 import 추가 (fetchWeatherData 오류 해결)
let fetchWeatherData = null;
try {
  const weatherModule = require('./js/weather');
  fetchWeatherData = weatherModule.fetchWeatherData;
} catch (error) {
  log.warn('날씨 모듈 import 실패. 옷차림 분석에서 기본값 사용됨:', error.message);
}

// AI 서버 설정
const AI_SERVER_HOST = process.env.AI_SERVER_HOST || '192.168.0.162';
const AI_SERVER_PORT = process.env.AI_SERVER_PORT || 5052;  // 문자열 -> 숫자로 변경
const AI_SERVER_URL = `http://${AI_SERVER_HOST}:${AI_SERVER_PORT}`;

// 포트 설정 검증 및 로깅
if (!process.env.AI_SERVER_HOST || !process.env.AI_SERVER_PORT) {
  log.warn('AI_SERVER_HOST 또는 AI_SERVER_PORT가 환경변수에 설정되지 않음');
  log.info(`기본 AI 서버: ${AI_SERVER_URL}`);
}

// ========== 1. 오디오 캡처 모듈 ==========

class AudioCapture {
  constructor() {
    this.isRecording = false;
    this.currentRecording = null;
  }

  /**
   * 마이크로부터 오디오 녹음 (Base64 반환)
   * @param {number} duration - 녹음 시간 (초)
   * @returns {Promise<string>} Base64 오디오 데이터
   */
  async captureAudio(duration = 3) {
    return new Promise((resolve, reject) => {
      if (this.isRecording) {
        reject(new Error('이미 녹음 중입니다'));
        return;
      }

      // ETRI API 제한을 고려하여 최대 5초로 제한
      const safeDuration = Math.min(duration, 5);
      const timestamp = Date.now();
      const tempPath = path.join(__dirname, 'tmp', `voice_${timestamp}.wav`);
      
      // 임시 디렉토리 생성 확인
      const tmpDir = path.dirname(tempPath);
      if (!fs.existsSync(tmpDir)) {
        try {
          fs.mkdirSync(tmpDir, { recursive: true });
        } catch (err) {
          reject(new Error(`임시 디렉토리 생성 실패: ${err.message}`));
          return;
        }
      }
      
      // sox 명령어로 오디오 녹음 (ETRI API 최적화)
      const recordCommand = [
        'sox', '-t', 'alsa', 'default',
        '-r', '16000',  // 16kHz 샘플링
        '-c', '1',      // 모노
        '-b', '16',     // 16bit
        tempPath,
        'trim', '0', safeDuration.toString(),
        'gain', '-n'    // 정규화로 음질 향상
      ];

      this.isRecording = true;
      
      // 타임아웃 설정 (녹음 시간 + 5초)
      const timeout = setTimeout(() => {
        this.isRecording = false;
        this.cleanupAudioFile(tempPath);
        reject(new Error(`오디오 녹음 타임아웃 (${safeDuration + 5}초 초과)`));
      }, (safeDuration + 5) * 1000);
      
      const recordProcess = spawn(recordCommand[0], recordCommand.slice(1));

      recordProcess.on('close', (code) => {
        clearTimeout(timeout);
        this.isRecording = false;
        
        if (code === 0) {
          try {
            // 파일 존재 및 크기 확인
            if (!fs.existsSync(tempPath)) {
              reject(new Error('녹음된 오디오 파일이 없습니다'));
              return;
            }
            
            const stats = fs.statSync(tempPath);
            const maxSize = 1024 * 1024; // 1MB 제한 (ETRI API)
            
            if (stats.size > maxSize) {
              this.cleanupAudioFile(tempPath);
              reject(new Error(`오디오 파일이 너무 큽니다 (${Math.round(stats.size/1024)}KB > 1MB)`));
              return;
            }
            
            if (stats.size < 1000) { // 1KB 미만
              this.cleanupAudioFile(tempPath);
              reject(new Error('녹음된 오디오가 너무 짧습니다'));
              return;
            }
            
            // 파일을 Base64로 변환
            const audioBuffer = fs.readFileSync(tempPath);
            const base64Audio = audioBuffer.toString('base64');
            
            // 임시 파일 정리
            this.cleanupAudioFile(tempPath);
            
            log.debug(`오디오 녹음 완료: ${audioBuffer.length} bytes (${safeDuration}초)`);
            resolve(base64Audio);
            
          } catch (error) {
            this.cleanupAudioFile(tempPath);
            reject(new Error(`오디오 파일 처리 실패: ${error.message}`));
          }
        } else {
          this.cleanupAudioFile(tempPath);
          reject(new Error(`오디오 녹음 실패: exit code ${code}`));
        }
      });

      recordProcess.on('error', (error) => {
        clearTimeout(timeout);
        this.isRecording = false;
        this.cleanupAudioFile(tempPath);
        reject(new Error(`오디오 녹음 프로세스 오류: ${error.message}`));
      });
    });
  }
  
  /**
   * 오디오 파일 안전 삭제
   * @param {string} filePath 
   */
  cleanupAudioFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      log.warn(`오디오 파일 정리 실패: ${filePath} - ${error.message}`);
    }
  }

  /**
   * 현재 발화 중인 오디오 실시간 캡처 (음성 인식 중)
   * @returns {Promise<string>} Base64 오디오 데이터
   */
  async captureCurrentSpeech() {
    // 현재 음성 인식이 활성화된 상태에서 발화 내용을 캡처
    // 기존 speech.js의 음성 인식과 연동
    try {
      // 2초간 현재 발화 캡처
      return await this.captureAudio(2);
    } catch (error) {
      log.error('현재 발화 캡처 실패:', error);
      throw error;
    }
  }
}

// ========== 2. 이미지 캡처 모듈 ==========

class ImageCapture {
  constructor() {
    this.device = '/dev/video0';  // 기본 웹캠
    this.capturing = false;
  }

  /**
   * 단일 이미지 촬영 (Base64 반환) - 안정성 강화 버전
   * @returns {Promise<string>} Base64 이미지 데이터
   */
  async capturePhoto() {
    return new Promise((resolve, reject) => {
      if (this.capturing) {
        reject(new Error('이미 촬영 중입니다'));
        return;
      }

      const timestamp = Date.now();
      const tempPath = path.join(__dirname, 'tmp', `photo_${timestamp}.jpg`);
      
      // 임시 디렉토리 생성 확인
      const tmpDir = path.dirname(tempPath);
      if (!fs.existsSync(tmpDir)) {
        try {
          fs.mkdirSync(tmpDir, { recursive: true });
        } catch (err) {
          reject(new Error(`임시 디렉토리 생성 실패: ${err.message}`));
          return;
        }
      }
      
      // fswebcam 명령어로 이미지 촬영 (타임아웃 설정)
      const captureCommand = [
        'fswebcam',
        '-r', '640x480',
        '--no-banner',
        '-S', '8',          // 8프레임 스킵으로 더 안정화
        '--jpeg', '90',     // 품질 향상
        '--fps', '15',      // FPS 제한으로 안정성 확보
        '-d', this.device,
        tempPath
      ];

      this.capturing = true;
      
      // 타임아웃 설정 (10초)
      const timeout = setTimeout(() => {
        this.capturing = false;
        reject(new Error('이미지 촬영 타임아웃 (10초 초과)'));
      }, 10000);

      exec(captureCommand.join(' '), { timeout: 10000 }, (error, stdout, stderr) => {
        clearTimeout(timeout);
        this.capturing = false;
        
        if (error) {
          // 파일 정리
          this.cleanupFile(tempPath);
          reject(new Error(`이미지 촬영 실패: ${error.message}`));
          return;
        }

        try {
          // 파일 존재 확인
          if (!fs.existsSync(tempPath)) {
            reject(new Error('촬영된 이미지 파일이 없습니다'));
            return;
          }
          
          // 파일 크기 확인
          const stats = fs.statSync(tempPath);
          if (stats.size < 1000) { // 1KB 미만
            this.cleanupFile(tempPath);
            reject(new Error('촬영된 이미지 크기가 너무 작습니다'));
            return;
          }
          
          // 파일을 Base64로 변환
          const imageBuffer = fs.readFileSync(tempPath);
          const base64Image = imageBuffer.toString('base64');
          
          // 임시 파일 정리
          this.cleanupFile(tempPath);
          
          log.debug(`이미지 촬영 완료: ${imageBuffer.length} bytes`);
          resolve(base64Image);
          
        } catch (fileError) {
          this.cleanupFile(tempPath);
          reject(new Error(`이미지 파일 처리 실패: ${fileError.message}`));
        }
      });
    });
  }
  
  /**
   * 파일 안전 삭제
   * @param {string} filePath 
   */
  cleanupFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      log.warn(`파일 정리 실패: ${filePath} - ${error.message}`);
    }
  }

  /**
   * 연속 이미지 촬영 (표정 분석용 - 안정성 강화 버전)
   * @param {number} count - 촬영할 이미지 수
   * @param {number} interval - 촬영 간격 (ms)
   * @returns {Promise<string[]>} Base64 이미지 배열
   */
  async captureMultiplePhotos(count = 5, interval = 800) {
    const photos = [];
    const failedAttempts = [];
    const maxRetries = 2;
    
    log.info(`연속 촬영 시작: ${count}장, ${interval}ms 간격`);
    
    for (let i = 0; i < count; i++) {
      let retries = 0;
      let success = false;
      
      while (retries <= maxRetries && !success) {
        try {
          // 충분한 대기 시간으로 카메라 안정화
          if (i > 0 || retries > 0) {
            await new Promise(resolve => setTimeout(resolve, interval));
          }
          
          const photo = await this.capturePhoto();
          
          // 이미지 크기 검증
          if (photo && photo.length > 1000) { // 최소 1KB 이상
            photos.push(photo);
            log.info(`사진 ${i + 1}/${count} 촬영 완료`);
            success = true;
          } else {
            throw new Error('이미지 크기가 너무 작음');
          }
          
        } catch (error) {
          retries++;
          const errorMsg = `사진 ${i + 1} 촬영 실패 (시도 ${retries}/${maxRetries + 1}): ${error.message}`;
          
          if (retries <= maxRetries) {
            log.warn(errorMsg + ' - 재시도 중...');
            // 재시도 전 추가 대기
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            log.error(errorMsg);
            failedAttempts.push({ index: i + 1, error: error.message });
          }
        }
      }
    }
    
    // 결과 요약
    if (failedAttempts.length > 0) {
      log.warn(`촬영 실패한 이미지: ${failedAttempts.map(f => f.index).join(', ')}`);
    }
    
    log.info(`총 ${photos.length}/${count}장 촬영 완료`);
    
    // 최소 1장은 성공해야 함
    if (photos.length === 0) {
      throw new Error('모든 이미지 촬영이 실패했습니다');
    }
    
    return photos;
  }

  /**
   * 옷차림 분석용 이미지 촬영 (여러 장 중 최고 품질 선택)
   * @returns {Promise<string>} 최고 품질 Base64 이미지
   */
  async captureOutfitPhoto() {
    try {
      // 5장 촬영
      const photos = await this.captureMultiplePhotos(5, 300);
      
      if (photos.length === 0) {
        throw new Error('촬영된 이미지가 없습니다');
      }
      
      // 현재는 첫 번째 이미지 반환 (추후 품질 평가 로직 추가 가능)
      // TODO: 이미지 품질 평가 (선명도, 밝기 등)하여 최적 이미지 선택
      log.info('🎯 대표 이미지 선택 완료');
      return photos[0];
      
    } catch (error) {
      log.error('옷차림 분석용 이미지 촬영 실패:', error);
      throw error;
    }
  }
}

// ========== 3. AI 서버 통신 모듈 ==========

class AIServerClient {
  constructor() {
    this.serverUrl = AI_SERVER_URL;
  }

  /**
   * AI 서버 상태 확인
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.serverUrl}/health`, { timeout: 5000 });
      return response.status === 200 && response.data.status === 'healthy';
    } catch (error) {
      log.error('AI 서버 상태 확인 실패:', error);
      return false;
    }
  }

  /**
   * 음성 감정 분석 요청
   * @param {string} base64Audio - Base64 오디오 데이터
   * @returns {Promise<object>} 감정 분석 결과
   */
  async analyzeVoiceEmotion(base64Audio) {
    try {
      const response = await axios.post(`${this.serverUrl}/analyze/voice_emotion`, {
        audio: base64Audio
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      return response.data;
    } catch (error) {
      log.error('음성 감정 분석 요청 실패:', error);
      throw new Error(`음성 감정 분석 실패: ${error.message}`);
    }
  }

  /**
   * 표정 감정 분석 요청
   * @param {string[]} base64Photos - Base64 이미지 배열
   * @returns {Promise<object>} 감정 분석 결과
   */
  async analyzeFaceEmotion(base64Photos) {
    try {
      const response = await axios.post(`${this.serverUrl}/analyze/face_emotion`, {
        photos: base64Photos
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      return response.data;
    } catch (error) {
      log.error('표정 감정 분석 요청 실패:', error);
      throw new Error(`표정 감정 분석 실패: ${error.message}`);
    }
  }

  /**
   * 옷차림 분석 요청
   * @param {string} base64Photo - Base64 이미지 데이터
   * @param {object} weatherData - 날씨 정보 {temp: number, condition: string}
   * @returns {Promise<object>} 옷차림 분석 결과
   */
  async analyzeOutfit(base64Photo, weatherData) {
    try {
      const response = await axios.post(`${this.serverUrl}/analyze/outfit`, {
        photo: base64Photo,
        weather: weatherData
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      return response.data;
    } catch (error) {
      log.error('옷차림 분석 요청 실패:', error);
      throw new Error(`옷차림 분석 실패: ${error.message}`);
    }
  }

  /**
   * 통합 감정 분석 요청 (음성 + 표정)
   * @param {string} base64Audio - Base64 오디오 데이터
   * @param {string[]} base64Photos - Base64 이미지 배열
   * @returns {Promise<object>} 통합 감정 분석 결과
   */
  async analyzeCombinedEmotion(base64Audio, base64Photos) {
    try {
      const response = await axios.post(`${this.serverUrl}/analyze/combined_emotion`, {
        audio: base64Audio,
        photos: base64Photos
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      return response.data;
    } catch (error) {
      log.error('통합 감정 분석 요청 실패:', error);
      throw new Error(`통합 감정 분석 실패: ${error.message}`);
    }
  }
}

// ========== 4. 자연스러운 대화형 트리거 ==========

class ConversationAITrigger {
  constructor(audioCapture, imageCapture, aiClient) {
    this.audioCapture = audioCapture;
    this.imageCapture = imageCapture;
    this.aiClient = aiClient;
    
    // 감정 관련 키워드 패턴
    this.emotionKeywords = {
      sad: /기분.*안.*좋|슬프|우울|힘들|스트레스|걱정|속상/i,
      happy: /기쁘|신나|좋|행복|즐거|기분.*좋|만족/i,
      angry: /화.*나|짜증|빡치|열받|분노/i,
      surprise: /놀라|깜짝|헉|와|대박/i,
      fear: /무서|걱정|불안|두려/i,
      neutral: /보통|그냥|평상시/i
    };
    
    // 외모/옷차림 관련 키워드 패턴
    this.outfitKeywords = /오늘.*어때|내.*옷.*어때|어울리|옷차림|스타일|패션|입고.*어때|나.*어때|멋있|예쁘|잘.*어울/i;
  }

  /**
   * 사용자 발화에서 감정 표현 감지
   * @param {string} userText - 사용자 발화 텍스트
   * @returns {string|null} 감지된 감정 또는 null
   */
  detectEmotionExpression(userText) {
    for (const [emotion, pattern] of Object.entries(this.emotionKeywords)) {
      if (pattern.test(userText)) {
        return emotion;
      }
    }
    return null;
  }

  /**
   * 사용자 발화에서 옷차림 질문 감지
   * @param {string} userText - 사용자 발화 텍스트
   * @returns {boolean} 옷차림 관련 질문 여부
   */
  isOutfitQuestion(userText) {
    return this.outfitKeywords.test(userText);
  }

  /**
   * 감정 분석 워크플로우 실행
   * @param {string} userText - 사용자 발화 텍스트
   * @param {string} detectedEmotion - 감지된 감정
   * @returns {Promise<string>} AI 응답 메시지
   */
  async executeEmotionAnalysisWorkflow(userText, detectedEmotion) {
    try {
      log.info(`🎭 감정 분석 워크플로우 시작: ${detectedEmotion}`);
      
      // 1. 현재 발화 오디오 캡처 (비동기 시작)
      const audioPromise = this.audioCapture.captureCurrentSpeech()
        .catch(error => {
          log.warn('현재 발화 오디오 캡처 실패:', error);
          return null;
        });
      
      // 2. 표정 사진 5장 연속 촬영 (비동기 시작)
      const photosPromise = this.imageCapture.captureMultiplePhotos(5, 500)
        .catch(error => {
          log.warn('표정 사진 촬영 실패:', error);
          return [];
        });
      
      // 3. 두 작업 완료 대기
      const [audioData, photos] = await Promise.all([audioPromise, photosPromise]);
      
      let result;
      
      if (audioData && photos.length > 0) {
        // 음성 + 표정 통합 분석
        log.info('🎭 통합 감정 분석 수행');
        result = await this.aiClient.analyzeCombinedEmotion(audioData, photos);
        
        if (result.success) {
          return result.response_message || '감정을 분석해보니 흥미롭네요!';
        }
      } else if (photos.length > 0) {
        // 표정만 분석
        log.info('📷 표정 감정 분석 수행');
        result = await this.aiClient.analyzeFaceEmotion(photos);
        
        if (result.success) {
          return result.response_message || `표정을 보니 ${result.emotion}인 것 같네요.`;
        }
      } else if (audioData) {
        // 음성만 분석
        log.info('🎤 음성 감정 분석 수행');
        result = await this.aiClient.analyzeVoiceEmotion(audioData);
        
        if (result.success) {
          return result.response_message || `목소리 톤으로 보아 ${result.emotion}인 것 같아요.`;
        }
      }
      
      // 분석 실패 시 공감 응답
      return this.generateEmpathyResponse(userText, detectedEmotion);
      
    } catch (error) {
      log.error('감정 분석 워크플로우 실패:', error);
      return this.generateEmpathyResponse(userText, detectedEmotion);
    }
  }

  /**
   * 옷차림 분석 워크플로우 실행
   * @param {object} weatherData - 현재 날씨 정보
   * @returns {Promise<string>} AI 응답 메시지
   */
  async executeOutfitAnalysisWorkflow(weatherData = null) {
    try {
      log.info('👔 옷차림 분석 워크플로우 시작');
      
      // 1. 날씨 정보 확보
      if (!weatherData) {
        // 현재 날씨 정보 가져오기
        try {
          weatherData = await fetchWeatherData(false);
        } catch (error) {
          log.warn('날씨 정보 획득 실패:', error);
          weatherData = { temp: 20, condition: 'unknown' }; // 기본값
        }
      }
      
      // 2. 옷차림 사진 촬영
      const photo = await this.imageCapture.captureOutfitPhoto();
      
      // 3. AI 서버로 분석 요청
      const result = await this.aiClient.analyzeOutfit(photo, {
        temp: weatherData.temp || weatherData.temperature || 20,
        condition: weatherData.condition || 'unknown'
      });
      
      if (result.success) {
        log.info(`👔 옷차림 분석 완료: ${result.is_appropriate ? '적절' : '부적절'}`);
        return result.response_message || '옷차림을 분석해봤어요!';
      } else {
        return '옷차림을 분석해봤는데, 조금 애매하네요. 어떻게 생각하세요?';
      }
      
    } catch (error) {
      log.error('옷차림 분석 워크플로우 실패:', error);
      return '옷차림을 확인해드리고 싶었는데, 잠시 문제가 있는 것 같아요. 다시 시도해볼까요?';
    }
  }

  /**
   * 공감 응답 생성 (AI 분석 실패 시)
   * @param {string} userText - 사용자 발화
   * @param {string} detectedEmotion - 감지된 감정
   * @returns {string} 공감 응답 메시지
   */
  generateEmpathyResponse(userText, detectedEmotion) {
    const empathyResponses = {
      sad: [
        '힘든 시간을 보내고 계시는군요. 제가 여기 있으니까 괜찮아요.',
        '우울할 때는 누군가와 이야기하는 것도 도움이 돼요. 더 말씀해보세요.',
        '슬픈 일이 있으셨나 봐요. 시간이 해결해줄 거예요.'
      ],
      happy: [
        '정말 기쁜 일이 있으신 것 같네요! 좋은 에너지가 느껴져요.',
        '행복한 모습을 보니 저도 덩달아 기분이 좋아져요!',
        '무슨 좋은 일이 있으셨나요? 궁금해요!'
      ],
      angry: [
        '화가 나는 일이 있으셨군요. 깊게 숨을 쉬어보세요.',
        '스트레스받는 상황이었나 봐요. 잠시 마음을 가라앉혀보세요.',
        '화날 만한 일이 있으셨나 봐요. 이야기해보시면 어떨까요?'
      ],
      surprise: [
        '뭔가 놀라운 일이 있으셨나 봐요!',
        '깜짝 놀라신 모습이에요. 무슨 일인지 궁금하네요!',
        '예상치 못한 일이 있으셨나 봐요!'
      ],
      fear: [
        '불안하신 것 같네요. 괜찮아요, 차근차근 해결해보세요.',
        '걱정이 많으신 것 같아요. 천천히 이야기해보세요.',
        '무서운 일이 있으셨나요? 제가 여기 있어요.'
      ],
      neutral: [
        '평온해 보이시네요.',
        '차분한 상태인 것 같아요.',
        '안정적으로 보이네요.'
      ]
    };
    
    const responses = empathyResponses[detectedEmotion] || empathyResponses.neutral;
    return responses[Math.floor(Math.random() * responses.length)];
  }
}

// ========== 5. 메인 통합 함수 ==========

// 전역 인스턴스들
let audioCapture = null;
let imageCapture = null;
let aiClient = null;
let conversationTrigger = null;

/**
 * AI 기능 모듈 초기화
 */
async function initializeAIModules() {
  try {
    log.info('🚀 AI 기능 모듈 초기화 시작...');
    
    // 인스턴스 생성
    audioCapture = new AudioCapture();
    imageCapture = new ImageCapture();
    aiClient = new AIServerClient();
    conversationTrigger = new ConversationAITrigger(audioCapture, imageCapture, aiClient);
    
    // AI 서버 연결 확인
    const isServerHealthy = await aiClient.checkHealth();
    if (isServerHealthy) {
      log.info('✅ AI 서버 연결 확인 완료');
    } else {
      log.warn('⚠️ AI 서버에 연결할 수 없습니다. AI 기능이 제한될 수 있습니다.');
    }
    
    log.info('✅ AI 기능 모듈 초기화 완료');
    return true;
  } catch (error) {
    log.error('❌ AI 기능 모듈 초기화 실패:', error);
    return false;
  }
}

/**
 * 대화 흐름에 AI 분석 통합
 * @param {string} recognizedText - 인식된 사용자 발화
 * @param {object} dependencies - 기존 의존성 객체들
 * @returns {Promise<string>} AI가 강화된 응답
 */
async function enhanceConversationWithAI(recognizedText, dependencies) {
  try {
    if (!conversationTrigger) {
      log.warn('AI 모듈이 초기화되지 않음');
      return null;
    }
    
    // 1. 감정 표현 감지
    const detectedEmotion = conversationTrigger.detectEmotionExpression(recognizedText);
    if (detectedEmotion) {
      log.info(`😊 감정 표현 감지: ${detectedEmotion}`);
      return await conversationTrigger.executeEmotionAnalysisWorkflow(recognizedText, detectedEmotion);
    }
    
    // 2. 옷차림 질문 감지
    if (conversationTrigger.isOutfitQuestion(recognizedText)) {
      log.info('👔 옷차림 질문 감지');
      return await conversationTrigger.executeOutfitAnalysisWorkflow();
    }
    
    return null; // AI 트리거되지 않음 - 기존 대화 시스템 사용
    
  } catch (error) {
    log.error('AI 대화 강화 실패:', error);
    return null;
  }
}

// ========== 6. API 엔드포인트 추가 ==========

/**
 * app.js에 추가할 새로운 API 엔드포인트들
 */
function addAIApiRoutes(app) {
  
  // AI 감정 분석 API
  app.post('/api/ai/analyze-emotion', async (req, res) => {
    try {
      const { captureAudio = true, capturePhotos = true } = req.body;
      
      let audioData = null;
      let photos = [];
      
      if (captureAudio && audioCapture) {
        try {
          audioData = await audioCapture.captureAudio(3);
          log.info('🎤 API를 통한 오디오 캡처 완료');
        } catch (error) {
          log.warn('API 오디오 캡처 실패:', error);
        }
      }
      
      if (capturePhotos && imageCapture) {
        try {
          photos = await imageCapture.captureMultiplePhotos(5, 500);
          log.info(`📷 API를 통한 사진 캡처 완료: ${photos.length}장`);
        } catch (error) {
          log.warn('API 사진 캡처 실패:', error);
        }
      }
      
      if (!audioData && photos.length === 0) {
        return res.status(400).json({ error: '캡처된 데이터가 없습니다.' });
      }
      
      let result;
      if (audioData && photos.length > 0) {
        result = await aiClient.analyzeCombinedEmotion(audioData, photos);
      } else if (photos.length > 0) {
        result = await aiClient.analyzeFaceEmotion(photos);
      } else if (audioData) {
        result = await aiClient.analyzeVoiceEmotion(audioData);
      }
      
      res.json(result);
      
    } catch (error) {
      log.error('AI 감정 분석 API 오류:', error);
      res.status(500).json({ error: '감정 분석에 실패했습니다.' });
    }
  });
  
  // AI 옷차림 분석 API
  app.post('/api/ai/analyze-outfit', async (req, res) => {
    try {
      const { weather } = req.body;
      
      // 현재 날씨 정보가 없으면 가져오기
      let weatherData = weather;
      if (!weatherData) {
        try {
          weatherData = await fetchWeatherData(false);
        } catch (error) {
          weatherData = { temp: 20, condition: 'unknown' };
        }
      }
      
      // 옷차림 사진 촬영
      const photo = await imageCapture.captureOutfitPhoto();
      
      // AI 분석
      const result = await aiClient.analyzeOutfit(photo, weatherData);
      
      res.json(result);
      
    } catch (error) {
      log.error('AI 옷차림 분석 API 오류:', error);
      res.status(500).json({ error: '옷차림 분석에 실패했습니다.' });
    }
  });
  
  // AI 서버 상태 확인 API
  app.get('/api/ai/health', async (req, res) => {
    try {
      const isHealthy = await aiClient.checkHealth();
      res.json({
        aiServer: isHealthy,
        modules: {
          audioCapture: !!audioCapture,
          imageCapture: !!imageCapture,
          aiClient: !!aiClient,
          conversationTrigger: !!conversationTrigger
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'AI 상태 확인 실패' });
    }
  });
}

// ========== 7. 기존 대화 시스템 연동 ==========

/**
 * processRecognizedCommand 함수 수정을 위한 래퍼
 * 기존 app.js의 processRecognizedCommand를 이 함수로 감싸세요
 */
async function processRecognizedCommandWithAI(text, dependencies, emotionData) {
  try {
    // 1. 먼저 AI 분석 시도
    const aiResponse = await enhanceConversationWithAI(text, dependencies);
    
    if (aiResponse) {
      // AI가 응답을 생성했으면 그것을 사용
      log.info('🤖 AI가 대화를 처리함');
      
      // TTS로 AI 응답 출력
      if (dependencies.safeTTS) {
        await dependencies.safeTTS(aiResponse);
      }
      
      // WebSocket으로 브로드캐스트
      if (dependencies.broadcast) {
        dependencies.broadcast({
          type: 'ai_response',
          message: aiResponse,
          emotion: 'ai_analysis'
        });
      }
      
      return aiResponse;
    } else {
      // AI가 처리하지 않았으면 기존 시스템 사용
      return await processRecognizedCommand(text, dependencies, emotionData);
    }
    
  } catch (error) {
    log.error('AI 강화 대화 처리 실패:', error);
    // 에러 시 기존 시스템으로 fallback
    return await processRecognizedCommand(text, dependencies, emotionData);
  }
}

module.exports = {
  // 클래스들
  AudioCapture,
  ImageCapture,
  AIServerClient,
  ConversationAITrigger,
  
  // 인스턴스들
  audioCapture: () => audioCapture,
  imageCapture: () => imageCapture,
  aiClient: () => aiClient,
  conversationTrigger: () => conversationTrigger,
  
  // 주요 함수들
  initializeAIModules,
  enhanceConversationWithAI,
  processRecognizedCommandWithAI,
  addAIApiRoutes,
  
  // 설정
  AI_SERVER_URL
};