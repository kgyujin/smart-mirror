const { SpeechClient } = require('@google-cloud/speech');
const record = require('node-record-lpcm16').record;
const { exec } = require('child_process');
const { 
  SPEECH_CREDENTIALS_PATH, 
  WAKEWORD_TEST, 
  WAKEWORD_REMOVE,
  COMMAND_SILENCE_TIMEOUT_MS,
  LISTENING_BROADCAST_INTERVAL_MS
} = require('./config');
const { log } = require('./logging');


let currentAudioBuffer = null;

const speechClient = new SpeechClient({ keyFilename: SPEECH_CREDENTIALS_PATH });

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

// 개선된 오디오-텍스트 변환 함수
const convertAudioToText = async (audioBuffer) => {
  try {
    const audioBytes = audioBuffer.toString('base64');
    
    // Speech Adaptation 적용
    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'ko-KR',
        // Speech Adaptation으로 정확도 향상
        adaptation: {
          phrase_sets: [
            {
              phrases: [
                { value: "현재 시간", boost: 20 },
                { value: "몇 시", boost: 20 },
                { value: "시간", boost: 15 },
                { value: "날씨", boost: 15 },
                { value: "온도", boost: 15 },
                { value: "서울", boost: 10 },
                { value: "대한민국", boost: 10 },
                { value: "수도", boost: 10 }
              ]
            }
          ]
        },
        // 모델 선택 최적화
        model: 'latest_long',
        useEnhanced: true
      },
    };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join(' ');
    
    return transcription;
  } catch (error) {
    log.error('오디오-텍스트 변환 오류:', error);
    return null;
  }
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
let recognizeStream = null;
let micInstance = null;
let lastTranscriptAt = 0;
let commandBuffer = '';
let listeningWindowInterval = null;

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
  lastTranscriptAt = Date.now();



  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'ko-KR',
      adaptation: {
        phrase_sets: [
          { phrases: [
            { value: '미러야', boost: 40 },
            { value: '밀어야', boost: 35 },
            { value: '하이 미러', boost: 35 },
            { value: '하이미러', boost: 35 },
            { value: 'Hi Mirror', boost: 35 }
          ] }
        ]
      },
      model: 'latest_long',
      useEnhanced: true,
    },
    interimResults: true,
  };

  recognizeStream = speechClient
    .streamingRecognize(request)
    .on('error', (err) => {
      log.error('스트리밍 STT 오류:', err.message);
      if (broadcast) {
        broadcast({ type: 'status', status: 'stt_error', message: err.message });
      }
      stopContinuousHotwordListener(broadcast);
      setTimeout(() => startContinuousHotwordListener(processRecognizedCommand, broadcast), 3000);
    })
    .on('data', async (data) => {
      try {
        const result = data.results?.[0];
        if (!result) return;
        const transcript = result.alternatives?.[0]?.transcript || '';
        const isFinal = !!result.isFinal;
        if (!transcript) return;
        lastTranscriptAt = Date.now();
        
        log.verbose('음성 인식 결과:', transcript, 'isFinal:', isFinal, 'mode:', hotwordMode);
        
        // 호출어 모드에서 호출어 인식
        if (hotwordMode === 'hotword' && WAKEWORD_TEST.test(transcript)) {
          log.info('호출어 인식됨:', transcript);
          hotwordMode = 'command';
          commandBuffer = '';
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
          const cleanText = transcript.replace(WAKEWORD_REMOVE, '').trim();
          if (cleanText && broadcast) {
            broadcast({ type: 'transcript', role: 'user', text: cleanText, final: isFinal, mode: hotwordMode });
          }

          // 최종 문장 확정 시에만 처리
          if (isFinal) {
            const finalCommand = transcript.replace(WAKEWORD_REMOVE, '').trim();
            // 호출어만 인식되었거나 아직 내용이 없는 경우에는 계속 대기
            if (!finalCommand) {
              lastTranscriptAt = Date.now();
              return;
            }
            
            log.info('명령 인식됨:', finalCommand);
            commandBuffer = '';
            stopListeningWindowTicker(true, broadcast);
            if (broadcast) {
              broadcast({ type: 'status', status: 'processing' });
            }
            


            
            try {
              await processRecognizedCommand(finalCommand);
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
      } catch (e) {
        log.error('STT 데이터 처리 오류:', e);
      }
    });

  micInstance = record({
    sampleRateHertz: 16000,
    threshold: 0,
    verbose: false,
    recordProgram: 'arecord',
    silence: '1.0',
  });
  
  micInstance.stream()
    .on('error', (err) => log.error('마이크 오류:', err))
    .pipe(recognizeStream);
    
  log.info('상시 듣기 시작(핫워드: "미러야")');
  
  // 상시 리스닝 시작 상태 브로드캐스트
  if (broadcast) {
    broadcast({ type: 'status', status: 'listening_off' });
  }
};

const stopContinuousHotwordListener = (broadcast) => {
  if (!isMicListening) return;
  try { if (micInstance) micInstance.stop(); } catch {}
  try { if (recognizeStream) recognizeStream.destroy(); } catch {}
  

  
  micInstance = null;
  recognizeStream = null;
  isMicListening = false;
  hotwordMode = 'hotword';
  commandBuffer = '';
  if (broadcast) {
    broadcast({ type: 'status', status: 'listening_off' });
  }
  log.info('상시 듣기 중지');
};

module.exports = {
  speechClient,
  safeBeep,
  convertAudioToText,
  isWakewordOnly,
  startContinuousHotwordListener,
  stopContinuousHotwordListener,
  isMicListening,
  startListeningWindowTicker,
  stopListeningWindowTicker,

};
