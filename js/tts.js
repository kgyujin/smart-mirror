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
let currentTTSProcessId = null;

const stopTTS = () => {
  try {
    if (currentTTSProcess) {
      log.info('TTS 중단 요청');
      
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
        // Linux/macOS에서 더 안정적인 프로세스 종료
        try { 
          if (currentTTSProcess.pid) {
            process.kill(currentTTSProcess.pid, 'SIGTERM');
            // SIGTERM으로 종료되지 않으면 SIGKILL 사용
            setTimeout(() => {
              try {
                process.kill(currentTTSProcess.pid, 'SIGKILL');
              } catch {}
            }, 1000);
          }
        } catch {}
        
        try {
          // espeak 프로세스 강제 종료 (더 안정적인 방법)
          if (currentTTSProcessId) {
            exec(`kill -9 ${currentTTSProcessId} 2>/dev/null`, (err) => {
              if (err) log.warn('Linux TTS 프로세스 강제 종료 실패:', err.message);
            });
          }
          
          // espeak 관련 프로세스 모두 종료
          exec('pkill -f "espeak" 2>/dev/null', (err) => {
            if (err && err.code !== 1) { // 1은 프로세스를 찾을 수 없음을 의미
              log.warn('Linux espeak 프로세스 종료 실패:', err.message);
            }
          });
        } catch {}
      }
    }
  } catch (e) {
    log.error('TTS 중단 오류:', e);
  } finally {
    currentTTSProcess = null;
    currentTTSProcessId = null;
    isTTSActive = false; // 강제 중단 시에도 상태 초기화
  }
};

// 안전한 TTS 함수 (espeak 사용)
const safeTTS = async (text, broadcast) => {
  if (!text || text.trim() === '') return;
  
  // 이전 TTS가 진행 중이면 먼저 중단
  if (isTTSActive) {
    log.info('이전 TTS 중단 후 새 TTS 시작');
    stopTTS();
    // 프로세스 완전 종료 대기 (단축)
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  log.info('TTS 시작:', text);
  isTTSActive = true;
  if (broadcast) {
    broadcast({ type: 'tts', status: 'start', text });
  }
  
  // espeak 사용
  try {
    // 더 자연스러운 한국어 TTS 설정 (속도, 피치, 진폭, 갭 최적화)
    const command = `echo "${text.replace(/"/g, '\\"')}" | espeak -s 200 -v ko -p 60 -a 180 -g 8`;
    currentTTSProcess = exec(command, (error) => {
      if (error) {
        log.error('TTS 오류:', error.message);
      } else {
        log.info('TTS 완료:', text);
      }
      isTTSActive = false;
      if (broadcast) {
        broadcast({ type: 'tts', status: 'end', text, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
      }
    });
    
    // 프로세스 ID 저장 (Linux에서 종료 시 사용)
    if (currentTTSProcess && currentTTSProcess.pid) {
      currentTTSProcessId = currentTTSProcess.pid;
    }
    
    if (currentTTSProcess && typeof currentTTSProcess.on === 'function') {
      currentTTSProcess.on('exit', () => { 
        currentTTSProcess = null; 
        currentTTSProcessId = null;
        isTTSActive = false;
      });
      currentTTSProcess.on('close', () => { 
        currentTTSProcess = null; 
        currentTTSProcessId = null;
        isTTSActive = false;
      });
      currentTTSProcess.on('error', () => { 
        currentTTSProcess = null; 
        currentTTSProcessId = null;
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
