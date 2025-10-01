const axios = require('axios');
const record = require('node-record-lpcm16').record;
const { exec } = require('child_process');
const wav = require('wav');
const fs = require('fs');
const { 
  ETRI_API_KEY,
  ETRI_API_URL,
  WAKEWORD_TEST, 
  WAKEWORD_REMOVE,
  COMMAND_SILENCE_TIMEOUT_MS,
  LISTENING_BROADCAST_INTERVAL_MS,
  AUDIO_CHUNK_SIZE,
  MIN_TEXT_LENGTH,
  MAX_CONSECUTIVE_EMPTY
} = require('./config');
const { log } = require('./logging');
const { analyzeEmotion, processEmotionResponse } = require('./emotion-analysis');

/**
 * Fallback implementation for analyzeAudioComprehensive.
 * 기존 analyzeAudio가 있다면 위임하고, 없으면 안전한 최소 결과를 반환해 앱이 중단되지 않게 함.
 * @param {Buffer|Uint8Array} audioBuffer
 * @param {Object} opts
 * @returns {Promise<Object>}
 */
async function analyzeAudioComprehensive(audioBuffer, opts = {}) {
  try {
    // analyzeAudio가 정의돼 있다면 우선 사용
    if (typeof analyzeAudio === 'function') {
      return await analyzeAudio(audioBuffer, opts);
    }
  } catch (_) {
    // 위임 중 오류가 나더라도 최소 결과로 안전 복구
  }
  return {
    ok: true,
    mode: 'comprehensive-fallback',
    summary: 'No-op analysis (fallback).',
    metrics: {},
    emotions: [],
    keywords: [],
    raw: null,
  };
}

let currentAudioBuffer = null;

// ETRI 음성인식 API를 사용한 오디오-텍스트 변환 함수
const convertAudioToText = async (audioBuffer) => {
  try {
    // 오디오 데이터를 base64로 인코딩
    const audioBase64 = audioBuffer.toString('base64');
    
    const requestBody = {
      request_id: "reserved field",
      argument: {
        language_code: "korean", // 한국어 기본 설정
        audio: audioBase64
      }
    };

    const response = await axios.post(ETRI_API_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Authorization': ETRI_API_KEY
      },
      timeout: 10000 // 10초 타임아웃 (속도 개선)
    });

    if (response.data.result === 0 && response.data.return_object) {
      const recognizedText = response.data.return_object.recognized || '';
      // 핫워드 모드가 아닐 때만 로그 출력 (핫워드 인식 후 명령 대기 중일 때만)
      if (hotwordMode !== 'hotword') {
        log.info('ETRI 음성인식 성공:', recognizedText);
      }
      return recognizedText;
    } else {
      log.error('ETRI 음성인식 실패:', response.data);
      return null;
    }
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 429) {
        log.warn('ETRI API 동시 요청 제한 도달. 잠시 대기 후 재시도합니다.');
        // 429 에러 시 3초 대기 (더 긴 대기 시간)
        await new Promise(resolve => setTimeout(resolve, 3000));
        return null;
      } else if (status === 403) {
        log.error('ETRI API 인증 실패 또는 일일 제한 초과:', data);
        return null;
      } else {
        log.error('ETRI 음성인식 API 오류:', error.message, '상태:', status, '데이터:', data);
        return null;
      }
    } else if (error.code === 'EAI_AGAIN') {
      log.warn('ETRI API 서버 연결 실패 (DNS 오류). 잠시 후 재시도합니다.');
      return null;
    } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      log.warn('ETRI API 연결 타임아웃. 재시도합니다.');
      return null;
    } else {
      log.error('ETRI 음성인식 API 오류:', error.message);
      return null;
    }
  }
};

// 이 함수는 더 이상 사용하지 않음 (실시간 감정 분석 제거)
// const analyzeAudioComprehensive = async (audioBuffer, broadcast) => { ... }

// Short beep on wake
const safeBeep = () => {
  try {
    // Requires sox: sudo apt-get install sox libsox-fmt-all
    exec('play -nq -t alsa synth 0.12 sine 880 vol 0.3', (err) => {
      if (err) {
        // Fallback: short, quiet espeak if play is unavailable
        exec('espeak -v ko -s 200 "" >/dev/null 2>&1', () => {});
      }
    });
  } catch {}
};

// 유틸: 호출어만 말했는지 판별
const isWakewordOnly = (text) => {
  if (!text) return false;
  const normalized = text.replace(/[\s.,!?~]+/g, '').toLowerCase();
  return normalized === '미러야' || normalized === '밀어야' || normalized === '미로야' || normalized === '미라야' || 
         normalized === '미러' || normalized === '미로' || normalized === '미라' || 
         normalized === 'himirror' || normalized === '하이미러';
};

// 음성 인식 상태 관리
let isMicListening = false;
let hotwordMode = 'hotword'; // 'hotword' | 'command'
let micInstance = null;
let lastTranscriptAt = 0;
let commandBuffer = '';
let listeningWindowInterval = null;
let audioChunks = [];
let isProcessingAudio = false; // 중복 처리 방지
let lastRecognizedText = ''; // 마지막 인식된 텍스트
let consecutiveEmptyCount = 0; // 연속 빈 결과 카운트
let lastRecognitionTime = 0; // 마지막 인식 시간
let recognitionCooldown = 1000; // 인식 간 최소 대기 시간 (1초)

// 감정 분석용 전체 음성 버퍼 관리
let emotionAudioBuffer = []; // 호출어부터 명령 완료까지의 전체 음성
let isCollectingEmotionAudio = false; // 감정 분석용 음성 수집 중인지

const stopListeningWindowTicker = (notifyOff = true, broadcast) => {
  if (listeningWindowInterval) {
    clearInterval(listeningWindowInterval);
    listeningWindowInterval = null;
  }
  if (notifyOff && broadcast) {
    broadcast({ type: 'status', status: 'listening_off' });
  }
};

const startListeningWindowTicker = (broadcast) => {
  stopListeningWindowTicker(false, broadcast);
  const totalMs = COMMAND_SILENCE_TIMEOUT_MS;
  listeningWindowInterval = setInterval(() => {
    const elapsed = Date.now() - lastTranscriptAt;
    const remainingMs = Math.max(0, totalMs - elapsed);
    if (broadcast) {
      broadcast({ type: 'status', status: 'listening_window', remainingMs, totalMs });
    }
    if (remainingMs <= 0) {
      // 타임아웃: 명령 모드 종료
      log.info('명령 청취 타임아웃 - 호출어 대기 모드로 복귀');
      
      // 감정 분석용 음성 수집 종료
      isCollectingEmotionAudio = false;
      emotionAudioBuffer = [];
      
      hotwordMode = 'hotword';
      commandBuffer = '';
      audioChunks = [];
      consecutiveEmptyCount = 0;
      stopListeningWindowTicker(true, broadcast);
      
      if (broadcast) {
        broadcast({ type: 'status', status: 'listening_timeout' });
      }
    }
  }, LISTENING_BROADCAST_INTERVAL_MS);
};

const startContinuousHotwordListener = (processRecognizedCommand, broadcast, dependencies = null) => {
  if (isMicListening) return;
  isMicListening = true;
  hotwordMode = 'hotword';
  commandBuffer = '';
  audioChunks = [];
  consecutiveEmptyCount = 0;
  lastRecognizedText = '';
  lastRecognitionTime = 0;
  isProcessingAudio = false;

  micInstance = record({
    sampleRateHertz: 16000,
    threshold: 0,
    verbose: false,
    recordProgram: 'arecord',
    silence: '1.0',
  });
  
  micInstance.stream()
    .on('error', (err) => log.error('마이크 오류:', err))
    .on('data', async (chunk) => {
      // 오디오 청크 수집
      audioChunks.push(chunk);
      
      // 일정 크기 이상 쌓이면 음성인식 시도 (약 1초 분량)
      if (audioChunks.length >= AUDIO_CHUNK_SIZE && !isProcessingAudio) {
        const audioBuffer = Buffer.concat(audioChunks);
        audioChunks = []; // 버퍼 초기화
        
        isProcessingAudio = true;
        
        try {
          // 감정 분석용 음성 수집 (명령 모드일 때만)
          if (isCollectingEmotionAudio) {
            emotionAudioBuffer.push(audioBuffer);
            log.verbose('🎤 감정 분석용 음성 청크 수집:', audioBuffer.length, 'bytes');
          }
          
          // 음성인식만 수행 (감정 분석은 명령 완료 시점에)
          const transcription = await convertAudioToText(audioBuffer);
          
          if (transcription && transcription.trim()) {
            // 의미있는 텍스트인지 확인 (더 엄격한 필터링)
            const cleanText = transcription.trim();
            const now = Date.now();
            
            // 인식 간 최소 대기 시간 확인
            if (now - lastRecognitionTime < recognitionCooldown) {
              log.verbose('인식 간격이 너무 짧음, 건너뜀');
              isProcessingAudio = false;
              return;
            }
            
            // 핫워드 인식 우선 처리 (품질 검사 전에 먼저 확인)
            log.verbose('핫워드 테스트:', cleanText, 'WAKEWORD_TEST.test:', WAKEWORD_TEST.test(cleanText));
            if (hotwordMode === 'hotword' && WAKEWORD_TEST.test(cleanText)) {
              log.info('핫워드 인식됨:', cleanText);
              log.info('명령 대기 모드로 전환 - 마이크 활성화');
              
              hotwordMode = 'command';
              commandBuffer = '';
              audioChunks = [];
              
              // 감정 분석용 음성 수집 시작
              emotionAudioBuffer = []; // 이전 버퍼 초기화
              isCollectingEmotionAudio = true;
              log.info('🎤 감정 분석용 음성 수집 시작');
              
              // 텍스트와 음성 감정 분석 결과를 문맥에 추가
              const audioBuffer = Buffer.concat(emotionAudioBuffer);
              const emotionResult = await analyzeEmotion(audioBuffer);
              context.lastEmotion = emotionResult.emotion;
              context.lastEmotionIntensity = emotionResult.intensity;
              log.info('😊 감정 분석 결과:', emotionResult);
              
              if (broadcast) {
                broadcast({ type: 'status', status: 'listening_on' });
                broadcast({ type: 'hotword_detected', text: cleanText });
              }
              
              safeBeep();
              lastTranscriptAt = now;
              startListeningWindowTicker(broadcast);
              
              // 핫워드 인식 후 잠시 대기 (사용자가 명령을 준비할 시간) - 단축
              setTimeout(() => {
                if (broadcast) {
                  broadcast({ type: 'status', status: 'ready_for_command' });
                }
              }, 200); // 500ms -> 200ms로 단축
              
              lastRecognizedText = cleanText;
              lastRecognitionTime = now;
              consecutiveEmptyCount = 0;
            }
            // 일반 텍스트 품질 검사 (핫워드가 아닌 경우에만)
            else if (cleanText.length > MIN_TEXT_LENGTH && 
                !/^[에이]+$/.test(cleanText) && // "에", "이" 같은 단일 음소 제외
                !/^[가-힣]{1,2}$/.test(cleanText) && // 1-2글자 한글 단어 제외
                !/^[가-힣]{3,4}$/.test(cleanText) && // 3-4글자 한글 단어도 제외 (의미없는 단어들)
                !/^(이거|그거|저거|뭐야|어때|그래|맞아|아니|응|네|아|오|우와)$/.test(cleanText)) { // 의미없는 단어들 제외
              
              // 이전 텍스트와 중복되지 않는지 확인 (더 엄격하게)
              if (cleanText !== lastRecognizedText && 
                  !cleanText.includes(lastRecognizedText) && 
                  !lastRecognizedText.includes(cleanText)) {
                
                lastRecognizedText = cleanText;
                lastRecognitionTime = now;
                lastTranscriptAt = now;
                consecutiveEmptyCount = 0;

                // 명령 모드에서 사용자 명령 처리
                if (hotwordMode === 'command') {
                  // Only show live captions when in command mode and exclude wakewords
                  const cleanCommand = cleanText.replace(WAKEWORD_REMOVE, '').trim();
                  if (cleanCommand && broadcast) {
                    broadcast({ type: 'transcript', role: 'user', text: cleanCommand, final: true, mode: hotwordMode });
                  }

                  // 최종 문장 확정 시에만 처리
                  if (cleanCommand) {
                    log.info('사용자 명령 인식됨:', cleanCommand);
                    log.info('명령 처리 시작 - 마이크 비활성화');
                    
                    commandBuffer = '';
                    audioChunks = [];
                    stopListeningWindowTicker(true, broadcast);
                    
                    if (broadcast) {
                      broadcast({ type: 'status', status: 'processing' });
                    }
                    
                    try {
                      // 전체 음성으로 감정 분석 수행
                      let emotionResult = null;
                      if (isCollectingEmotionAudio && emotionAudioBuffer.length > 0) {
                        log.info('🎯 전체 음성으로 감정 분석 시작');
                        const fullAudioBuffer = Buffer.concat(emotionAudioBuffer);
                        log.info(`📊 수집된 음성 데이터: ${fullAudioBuffer.length} bytes (${emotionAudioBuffer.length} 청크)`);
                        
                        const fullPcmBuffer = Buffer.concat(emotionAudioBuffer);

                        // PCM → WAV 변환
                        const wavWriter = new wav.Writer({
                          sampleRate: 16000,
                          channels: 1,
                          bitDepth: 16
                        });

                        let wavBuffer = Buffer.alloc(0);
                        wavWriter.on('data', (chunk) => {
                          wavBuffer = Buffer.concat([wavBuffer, chunk]);
                        });

                        wavWriter.write(fullPcmBuffer);
                        wavWriter.end();

                        // WAV 버퍼가 준비되면 감정 분석 서버로 전송
                        wavWriter.on('finish', async () => {
                          // (선택) tmp/last_upload.wav로 저장
                          fs.writeFileSync('./tmp/last_upload.wav', wavBuffer);

                          // 감정 분석 서버로 전송
                          emotionResult = await analyzeEmotion(wavBuffer);
                          if (emotionResult && emotionResult.success) {
                            log.info(`🎭 감정 분석 결과: ${emotionResult.emotion} (신뢰도: ${(emotionResult.confidence * 100).toFixed(1)}%)`);
                          } else {
                            log.warn('감정 분석 실패 또는 신뢰도 부족');
                          }
                        });
                      }
                      
                      // processRecognizedCommand 함수 호출 (감정 데이터 포함)
                      if (processRecognizedCommand) {
                        await processRecognizedCommand(cleanCommand, dependencies, emotionResult);
                        log.info('명령 처리 완료');
                      } else {
                        log.warn('processRecognizedCommand 함수가 전달되지 않음');
                      }
                    } catch (error) {
                      log.error('명령 처리 중 오류:', error);
                    }
                    
                    // 감정 분석용 음성 수집 종료
                    isCollectingEmotionAudio = false;
                    emotionAudioBuffer = [];
                    
                    hotwordMode = 'hotword';
                    lastTranscriptAt = now;
                    
                    if (broadcast) {
                      broadcast({ type: 'status', status: 'listening_off' });
                    }
                    
                    log.info('호출어 대기 모드로 복귀 - 마이크 대기 상태');
                  }
                }
              } else {
                log.verbose('중복 또는 유사한 텍스트 인식, 건너뜀:', cleanText);
              }
            } else {
              consecutiveEmptyCount++;
              if (consecutiveEmptyCount > MAX_CONSECUTIVE_EMPTY / 2) {
                log.verbose('의미없는 음성 인식 결과가 연속으로 발생하여 처리 중단');
                consecutiveEmptyCount = 0;
              }
            }
          } else {
            consecutiveEmptyCount++;
            if (consecutiveEmptyCount > MAX_CONSECUTIVE_EMPTY) {
              log.verbose('빈 음성 인식 결과가 연속으로 발생');
              consecutiveEmptyCount = 0;
            }
          }
        } catch (error) {
          log.error('음성인식 처리 오류:', error);
        } finally {
          isProcessingAudio = false;
        }
      }
    });
    
  log.info('상시 듣기 시작 - 핫워드 대기 중: "미러야", "밀어야", "미로야", "미라야", "미러", "미로", "미라", "하이미러"');
  
  // 상시 리스닝 시작 상태 브로드캐스트
  if (broadcast) {
    broadcast({ type: 'status', status: 'listening_off' });
  }
};

const stopContinuousHotwordListener = (broadcast) => {
  if (!isMicListening) return;
  try { if (micInstance) micInstance.stop(); } catch {}
  
  micInstance = null;
  isMicListening = false;
  hotwordMode = 'hotword';
  commandBuffer = '';
  audioChunks = [];
  consecutiveEmptyCount = 0;
  lastRecognizedText = '';
  lastRecognitionTime = 0;
  isProcessingAudio = false;
  if (broadcast) {
    broadcast({ type: 'status', status: 'listening_off' });
  }
  log.info('상시 듣기 중지');
};

module.exports = {
  safeBeep,
  convertAudioToText,
  analyzeAudioComprehensive,
  isWakewordOnly,
  startContinuousHotwordListener,
  stopContinuousHotwordListener,
  isMicListening,
  startListeningWindowTicker,
  stopListeningWindowTicker,
};
