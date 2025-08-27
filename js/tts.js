const fs = require('fs');
const path = require('path');
const wav = require('wav');
const os = require('os');
const { exec } = require('child_process');
const { SPEECH_CREDENTIALS_PATH, CAPTION_HIDE_AFTER_TTS_MS } = require('./config');
const { log } = require('./logging');

// Google Cloud Text-to-Speech (자연스러운 음성)
let textToSpeech = null;
let ttsClient = null;
try {
  textToSpeech = require('@google-cloud/text-to-speech');
  ttsClient = new textToSpeech.TextToSpeechClient({ keyFilename: SPEECH_CREDENTIALS_PATH });
} catch (e) {
  // 패키지가 없거나 초기화 실패 시 espeak 폴백 사용
  log.warn('Google Cloud TTS 사용 불가. espeak로 폴백합니다:', e.message);
}

// 현재 TTS 진행 여부 (TTS 중에는 호출어를 무시)
let isTTSActive = false;

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
  }
};

// 안전한 TTS 함수
const safeTTS = async (text, broadcast) => {
  if (!text || text.trim() === '') return;
  stopTTS();
  log.tts('시작:', text);
  isTTSActive = true;
  if (broadcast) {
    broadcast({ type: 'tts', status: 'start', text });
  }
  
  // Google Cloud TTS 우선 사용
  if (ttsClient) {
    try {
      const request = {
        input: { text },
        voice: { languageCode: 'ko-KR', name: process.env.TTS_VOICE || 'ko-KR-Wavenet-A' },
        audioConfig: {
          audioEncoding: 'LINEAR16',
          speakingRate: Number(process.env.TTS_RATE || 1.0),
          pitch: Number(process.env.TTS_PITCH || 0.0),
          volumeGainDb: Number(process.env.TTS_GAIN_DB || 0.0),
          sampleRateHertz: Number(process.env.TTS_SAMPLE_RATE || 22050)
        }
      };
      const [response] = await ttsClient.synthesizeSpeech(request);
      const sampleRate = Number(process.env.TTS_SAMPLE_RATE || 22050);
      const wavPath = path.join(os.tmpdir(), `mirror_tts_${Date.now()}.wav`);
      // LINEAR16은 RAW PCM이므로 WAV 컨테이너로 래핑
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
        // PowerShell SoundPlayer 동기 재생
        const psPath = wavPath.replace(/\\/g, '/');
        playCmd = `powershell -NoProfile -Command $p=New-Object System.Media.SoundPlayer; $p.SoundLocation='${psPath}'; $p.Load(); $p.PlaySync()`;
      } else {
        playCmd = `play -q "${wavPath}"`;
      }
      currentTTSProcess = exec(playCmd, (error) => {
        if (error) {
          log.warn('기본 재생 실패, aplay로 재시도:', error.message);
          try {
            if (process.platform !== 'win32') {
              currentTTSProcess = exec(`aplay -q "${wavPath}"`, (aplayErr) => {
                if (aplayErr) {
                  log.error('aplay 재생 실패:', aplayErr.message);
                }
                try { fs.unlinkSync(wavPath); } catch {}
                isTTSActive = false;
                if (broadcast) {
                  broadcast({ type: 'tts', status: 'end', text, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
                }
              });
              if (currentTTSProcess && typeof currentTTSProcess.on === 'function') {
                currentTTSProcess.on('exit', () => { currentTTSProcess = null; });
                currentTTSProcess.on('close', () => { currentTTSProcess = null; });
              }
              return;
            }
          } catch {}
        }
        try { fs.unlinkSync(wavPath); } catch {}
        isTTSActive = false;
        if (broadcast) {
          broadcast({ type: 'tts', status: 'end', text, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
        }
      });
      if (currentTTSProcess && typeof currentTTSProcess.on === 'function') {
        currentTTSProcess.on('exit', () => { currentTTSProcess = null; });
        currentTTSProcess.on('close', () => { currentTTSProcess = null; });
      }
      return;
    } catch (e) {
      log.warn('Google Cloud TTS 실패, espeak로 폴백:', e.message);
    }
  }

  // 폴백: espeak
  try {
    const command = `echo "${text.replace(/"/g, '\\"')}" | espeak -s 150 -v ko`;
    currentTTSProcess = exec(command, (error) => {
      if (error) {
        log.error('TTS 오류:', error.message);
      } else {
        log.tts('완료:', text);
      }
      isTTSActive = false;
      if (broadcast) {
        broadcast({ type: 'tts', status: 'end', text, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
      }
    });
    if (currentTTSProcess && typeof currentTTSProcess.on === 'function') {
      currentTTSProcess.on('exit', () => { currentTTSProcess = null; });
      currentTTSProcess.on('close', () => { currentTTSProcess = null; });
    }
  } catch (error) {
    log.error('TTS 실행 오류:', error);
    isTTSActive = false;
    if (broadcast) {
      broadcast({ type: 'tts', status: 'end', text, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
    }
  }
};

module.exports = {
  safeTTS,
  stopTTS,
  isTTSActive,
  ttsClient
};
