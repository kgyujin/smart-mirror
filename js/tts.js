const fs = require('fs');
const path = require('path');
const wav = require('wav');
const os = require('os');
const { exec } = require('child_process');
const { SPEECH_CREDENTIALS_PATH, CAPTION_HIDE_AFTER_TTS_MS } = require('./config');
const { log } = require('./logging');

// Google Cloud Text-to-Speech (무료 사용량: 월 400만 자 - WaveNet)
let textToSpeech = null;
let ttsClient = null;
try {
  textToSpeech = require('@google-cloud/text-to-speech');
  ttsClient = new textToSpeech.TextToSpeechClient({ keyFilename: SPEECH_CREDENTIALS_PATH });
} catch (e) {
  log.error('Google Cloud TTS 초기화 실패:', e.message);
}

// 현재 TTS 진행 여부 (TTS 중에는 호출어를 무시)
let isTTSActive = false;

// TTS 상태 확인 함수
const getTTSActive = () => isTTSActive;

// TTS 제어
let currentTTSProcess = null;

const stopTTS = () => {
  try {
    if (currentTTSProcess) {
      log.tts('중단 요청');
      if (process.platform === 'win32') {
        try { process.kill(currentTTSProcess.pid); } catch {}
        exec(`taskkill /PID ${currentTTSProcess.pid} /T /F`);
      } else {
        try { currentTTSProcess.kill('SIGKILL'); } catch {}
      }
    }
  } catch (e) {
    log.error('TTS 중단 오류:', e);
  } finally {
    currentTTSProcess = null;
    isTTSActive = false;
  }
};

// 텍스트 전처리 함수 - 비용 절약을 위한 텍스트 최적화
const preprocessText = (text) => {
  if (!text) return '';
  
  let processedText = text.trim();
  
  // 불필요한 문자 제거 (비용 절약)
  processedText = processedText
    .replace(/&/g, ' 그리고 ')  // & -> 그리고
    .replace(/\*/g, '')         // * 제거
    .replace(/#/g, '')          // # 제거
    .replace(/@/g, '')          // @ 제거
    .replace(/\+/g, ' 플러스 ') // + -> 플러스
    .replace(/=/g, ' 는 ')      // = -> 는
    .replace(/%/g, ' 퍼센트 ')  // % -> 퍼센트
    .replace(/\$/g, ' 달러 ')   // $ -> 달러
    .replace(/€/g, ' 유로 ')    // € -> 유로
    .replace(/£/g, ' 파운드 ')  // £ -> 파운드
    .replace(/¥/g, ' 엔 ')      // ¥ -> 엔
    .replace(/°C/g, '도씨')     // °C -> 도씨
    .replace(/°F/g, '도화씨');  // °F -> 도화씨
  
  // 숫자 처리 (자연스러운 읽기)
  processedText = processedText
    .replace(/(\d+)시/g, '$1시')           // 시간
    .replace(/(\d+)분/g, '$1분')           // 분
    .replace(/(\d+)초/g, '$1초')           // 초
    .replace(/(\d+)도/g, '$1도')           // 온도
    .replace(/(\d+)%/g, '$1퍼센트')        // 퍼센트
    .replace(/(\d+)km/g, '$1킬로미터')     // 거리
    .replace(/(\d+)m/g, '$1미터')          // 미터
    .replace(/(\d+)cm/g, '$1센티미터')     // 센티미터
    .replace(/(\d+)mm/g, '$1밀리미터')     // 밀리미터
    .replace(/(\d+)kg/g, '$1킬로그램')     // 무게
    .replace(/(\d+)g/g, '$1그램')          // 그램
    .replace(/(\d+)ml/g, '$1밀리리터')     // 부피
    .replace(/(\d+)l/g, '$1리터');         // 리터
  
  // 문장 부호 정리 (비용 절약)
  processedText = processedText
    .replace(/\.{2,}/g, ' 잠깐만요 ')      // ... -> 잠깐만요
    .replace(/!{2,}/g, '!')               // !! -> !
    .replace(/\?{2,}/g, '?')              // ?? -> ?
    .replace(/,,+/g, ',')                 // ,, -> ,
    .replace(/\.\.+/g, '.');              // .. -> .
  
  // 공백 정리 (비용 절약)
  processedText = processedText
    .replace(/\s+/g, ' ')                 // 여러 공백을 하나로
    .replace(/\s*([,.!?;:])\s*/g, '$1 ')  // 문장부호 주변 공백 정리
    .trim();
  
  return processedText;
};

// 간소화된 SSML 생성 함수 - 비용 절약을 위한 최소한의 SSML
const generateSSML = (text) => {
  if (!text) return '';
  
  // 긴 텍스트는 문장별로 분할하여 처리 (비용 최적화)
  const sentences = text.split(/([.!?])/).filter(s => s.trim());
  let ssmlText = '<speak>';
  
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i]?.trim();
    const punctuation = sentences[i + 1]?.trim();
    
    if (sentence) {
      // 문장 시작에 최소한의 휴지
      if (i > 0) {
        ssmlText += '<break time="0.2s"/>';
      }
      
      // 간소화된 문장 내용 (비용 절약)
      ssmlText += `<prosody rate="0.95">${sentence}</prosody>`;
      
      // 문장 끝 처리 (최소한의 휴지)
      if (punctuation === '.') {
        ssmlText += '<break time="0.3s"/>';
      } else if (punctuation === '!') {
        ssmlText += '<break time="0.3s"/>';
      } else if (punctuation === '?') {
        ssmlText += '<break time="0.3s"/>';
      } else if (punctuation === ',') {
        ssmlText += '<break time="0.1s"/>';
      }
    }
  }
  
  ssmlText += '</speak>';
  return ssmlText;
};

// 사용량 추적을 위한 간단한 로깅
const logUsage = (text) => {
  const charCount = text.length;
  log.info(`TTS 사용량: ${charCount}자`);
  
  // 월별 사용량 추적 (간단한 파일 기반)
  const usageFile = path.join(__dirname, '..', 'tts_usage.json');
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  
  try {
    let usage = {};
    if (fs.existsSync(usageFile)) {
      usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    }
    
    if (!usage[currentMonth]) {
      usage[currentMonth] = 0;
    }
    
    usage[currentMonth] += charCount;
    
    // 무료 사용량 경고 (400만 자 기준)
    if (usage[currentMonth] > 3500000) { // 350만 자에서 경고
      log.warn(`⚠️ 월 사용량이 ${usage[currentMonth]}자에 도달했습니다. 무료 한도(400만 자)에 근접했습니다.`);
    }
    
    fs.writeFileSync(usageFile, JSON.stringify(usage, null, 2));
  } catch (e) {
    log.error('사용량 추적 오류:', e.message);
  }
};

// 안전한 TTS 함수
const safeTTS = async (text, broadcast) => {
  if (!text || text.trim() === '') return;
  stopTTS();
  
  // 텍스트 전처리
  const processedText = preprocessText(text);
  log.tts('시작:', processedText);
  
  // 사용량 추적
  logUsage(processedText);
  
  isTTSActive = true;
  if (broadcast) {
    broadcast({ type: 'tts', status: 'start', text: processedText });
  }
  
  // Google Cloud TTS 사용
  if (!ttsClient) {
    log.error('Google Cloud TTS 클라이언트가 초기화되지 않았습니다.');
    isTTSActive = false;
    if (broadcast) {
      broadcast({ type: 'tts', status: 'end', text: processedText, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
    }
    return;
  }
  
  try {
    // 간소화된 SSML 생성 (비용 절약)
    const ssmlText = generateSSML(processedText);
    
    const request = {
      input: { ssml: ssmlText },
      voice: { 
        languageCode: 'ko-KR', 
        name: process.env.TTS_VOICE || 'ko-KR-Wavenet-A', // WaveNet A (가장 저렴)
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        speakingRate: Number(process.env.TTS_RATE || 0.95), // 약간 느리게
        pitch: Number(process.env.TTS_PITCH || 0.0),        // 기본 톤 (비용 절약)
        volumeGainDb: Number(process.env.TTS_GAIN_DB || 0.0), // 기본 볼륨 (비용 절약)
        sampleRateHertz: Number(process.env.TTS_SAMPLE_RATE || 22050), // 표준 샘플레이트 (비용 절약)
        // effectsProfileId 제거 (비용 절약)
      }
    };
    
    const [response] = await ttsClient.synthesizeSpeech(request);
    const sampleRate = Number(process.env.TTS_SAMPLE_RATE || 22050);
    const wavPath = path.join(os.tmpdir(), `mirror_tts_${Date.now()}.wav`);
    
    // LINEAR16을 WAV 컨테이너로 래핑
    try {
      const writer = new wav.FileWriter(wavPath, { channels: 1, sampleRate, bitDepth: 16 });
      writer.write(Buffer.from(response.audioContent));
      writer.end();
    } catch (wrapErr) {
      log.warn('WAV 래핑 실패, RAW로 재생 시도:', wrapErr.message);
      fs.writeFileSync(wavPath, Buffer.from(response.audioContent));
    }
    
    // 플랫폼별 재생 방법 선택
    let playCmd = '';
    if (process.platform === 'win32') {
      // Windows: PowerShell SoundPlayer 사용
      const psPath = wavPath.replace(/\\/g, '/');
      playCmd = `powershell -NoProfile -Command $p=New-Object System.Media.SoundPlayer; $p.SoundLocation='${psPath}'; $p.Load(); $p.PlaySync()`;
    } else {
      // Linux: aplay 사용
      playCmd = `aplay -q "${wavPath}"`;
    }
    
    currentTTSProcess = exec(playCmd, (error) => {
      if (error) {
        log.error('음성 재생 실패:', error.message);
      }
      // 안전한 파일 삭제
      try { 
        if (fs.existsSync(wavPath)) {
          fs.unlinkSync(wavPath); 
        }
      } catch (deleteErr) {
        log.warn('TTS 임시 파일 삭제 실패:', deleteErr.message);
      }
      isTTSActive = false;
      if (broadcast) {
        broadcast({ type: 'tts', status: 'end', text: processedText, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
      }
    });
    
    if (currentTTSProcess && typeof currentTTSProcess.on === 'function') {
      currentTTSProcess.on('exit', () => { 
        currentTTSProcess = null; 
        // 프로세스 종료 시 임시 파일 정리
        try {
          if (fs.existsSync(wavPath)) {
            fs.unlinkSync(wavPath);
          }
        } catch (cleanupErr) {
          log.warn('프로세스 종료 시 임시 파일 정리 실패:', cleanupErr.message);
        }
      });
      currentTTSProcess.on('close', () => { currentTTSProcess = null; });
      currentTTSProcess.on('error', (err) => {
        log.error('TTS 프로세스 오류:', err.message);
        currentTTSProcess = null;
        isTTSActive = false;
      });
    }
    
  } catch (e) {
    log.error('Google Cloud TTS 오류:', e.message);
    isTTSActive = false;
    if (broadcast) {
      broadcast({ type: 'tts', status: 'end', text: processedText, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
    }
  }
};

module.exports = {
  safeTTS,
  stopTTS,
  isTTSActive: getTTSActive,
  ttsClient
};