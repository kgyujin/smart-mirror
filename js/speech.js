const axios = require('axios');
const record = require('node-record-lpcm16').record;
const { exec } = require('child_process');
const { 
  ETRI_API_KEY,
  ETRI_API_URL,
  WAKEWORD_TEST, 
  WAKEWORD_REMOVE,
  COMMAND_SILENCE_TIMEOUT_MS,
  LISTENING_BROADCAST_INTERVAL_MS
} = require('./config');
const { log } = require('./logging');

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
      timeout: 30000 // 30초 타임아웃
    });

    if (response.data.result === 0 && response.data.return_object) {
      const recognizedText = response.data.return_object.recognized || '';
      log.info('ETRI 음성인식 성공:', recognizedText);
      return recognizedText;
    } else {
      log.error('ETRI 음성인식 실패:', response.data);
      return null;
    }
  } catch (error) {
    log.error('ETRI 음성인식 API 오류:', error.message);
    if (error.response) {
      log.error('응답 상태:', error.response.status);
      log.error('응답 데이터:', error.response.data);
    }
    return null;
  }
};

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
  return normalized === '미러야' || normalized === '밀어야' || normalized === 'himirror' || normalized === '하이미러';
};

// 음성 인식 상태 관리
let isMicListening = false;
let hotwordMode = 'hotword'; // 'hotword' | 'command'
let micInstance = null;
let lastTranscriptAt = 0;
let commandBuffer = '';
let listeningWindowInterval = null;
let audioChunks = [];

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
      hotwordMode = 'hotword';
      commandBuffer = '';
      audioChunks = [];
      stopListeningWindowTicker(true, broadcast);
      if (broadcast) {
        broadcast({ type: 'status', status: 'listening_timeout' });
      }
      log.info('명령 청취 타임아웃');
    }
  }, LISTENING_BROADCAST_INTERVAL_MS);
};

const startContinuousHotwordListener = (processRecognizedCommand, broadcast) => {
  if (isMicListening) return;
  isMicListening = true;
  hotwordMode = 'hotword';
  commandBuffer = '';
  audioChunks = [];
  lastTranscriptAt = Date.now();

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
      
      // 일정 크기 이상 쌓이면 음성인식 시도
      if (audioChunks.length >= 10) { // 약 0.5초 분량
        const audioBuffer = Buffer.concat(audioChunks);
        audioChunks = []; // 버퍼 초기화
        
        try {
          const transcription = await convertAudioToText(audioBuffer);
          if (transcription) {
            lastTranscriptAt = Date.now();
            
            log.verbose('음성 인식 결과:', transcription, 'mode:', hotwordMode);
            
            // 호출어 모드에서 호출어 인식
            if (hotwordMode === 'hotword' && WAKEWORD_TEST.test(transcription)) {
              log.info('호출어 인식됨:', transcription);
              hotwordMode = 'command';
              commandBuffer = '';
              audioChunks = [];
              if (broadcast) {
                broadcast({ type: 'status', status: 'listening_on' });
              }
              safeBeep();
              lastTranscriptAt = Date.now();
              startListeningWindowTicker(broadcast);
            }

            // 명령 모드에서 사용자 명령 처리
            if (hotwordMode === 'command') {
              // Only show live captions when in command mode and exclude wakewords
              const cleanText = transcription.replace(WAKEWORD_REMOVE, '').trim();
              if (cleanText && broadcast) {
                broadcast({ type: 'transcript', role: 'user', text: cleanText, final: true, mode: hotwordMode });
              }

              // 최종 문장 확정 시에만 처리
              if (cleanText) {
                log.info('명령 인식됨:', cleanText);
                commandBuffer = '';
                audioChunks = [];
                stopListeningWindowTicker(true, broadcast);
                if (broadcast) {
                  broadcast({ type: 'status', status: 'processing' });
                }
                
                try {
                  await processRecognizedCommand(cleanText);
                  log.info('명령 처리 완료');
                } catch (error) {
                  log.error('명령 처리 중 오류:', error);
                }
                
                hotwordMode = 'hotword';
                lastTranscriptAt = Date.now();
                if (broadcast) {
                  broadcast({ type: 'status', status: 'listening_off' });
                }
                
                log.verbose('명령 처리 완료, 호출어 대기 모드로 복귀');
              }
            }
          }
        } catch (error) {
          log.error('음성인식 처리 오류:', error);
        }
      }
    });
    
  log.info('상시 듣기 시작(핫워드: "미러야")');
  
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
  if (broadcast) {
    broadcast({ type: 'status', status: 'listening_off' });
  }
  log.info('상시 듣기 중지');
};

module.exports = {
  safeBeep,
  convertAudioToText,
  isWakewordOnly,
  startContinuousHotwordListener,
  stopContinuousHotwordListener,
  isMicListening,
  startListeningWindowTicker,
  stopListeningWindowTicker,
};
