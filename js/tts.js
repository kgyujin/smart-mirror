const fs = require('fs');
const path = require('path');
const wav = require('wav');
const os = require('os');
const { exec } = require('child_process');
const { CAPTION_HIDE_AFTER_TTS_MS } = require('./config');
const { log } = require('./logging');

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
        try { 
          process.kill(currentTTSProcess.pid); 
        } catch {} 
        try {
          exec(`taskkill /PID ${currentTTSProcess.pid} /T /F`, (err) => {
            if (err) log.warn('Windows TTS 프로세스 종료 실패:', err.message);
          });
        } catch {}
      } else {
        try { 
          currentTTSProcess.kill('SIGKILL'); 
        } catch {}
        try {
          // Linux에서 espeak 프로세스 강제 종료
          exec(`pkill -f "espeak.*${currentTTSProcess.pid}"`, (err) => {
            if (err) log.warn('Linux TTS 프로세스 종료 실패:', err.message);
          });
        } catch {}
      }
    }
  } catch (e) {
    log.error('TTS 중단 오류:', e);
  } finally {
    currentTTSProcess = null;
    isTTSActive = false; // 강제 중단 시에도 상태 초기화
  }
};

// 안전한 TTS 함수 (espeak 사용)
const safeTTS = async (text, broadcast) => {
  if (!text || text.trim() === '') return;
  
  // 이전 TTS가 진행 중이면 먼저 중단
  if (isTTSActive) {
    log.tts('이전 TTS 중단 후 새 TTS 시작');
    stopTTS();
    // 프로세스 완전 종료 대기
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  log.tts('시작:', text);
  isTTSActive = true;
  if (broadcast) {
    broadcast({ type: 'tts', status: 'start', text });
  }
  
  // espeak 사용
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
      currentTTSProcess.on('exit', () => { 
        currentTTSProcess = null; 
        isTTSActive = false;
      });
      currentTTSProcess.on('close', () => { 
        currentTTSProcess = null; 
        isTTSActive = false;
      });
      currentTTSProcess.on('error', () => { 
        currentTTSProcess = null; 
        isTTSActive = false;
      });
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
  isTTSActive: getTTSActive
};
