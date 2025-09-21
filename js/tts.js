const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
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
    isTTSActive = false; // 강제 중단 시에도 상태 초기화
  }
};

// 텍스트 전처리 함수 - 자연스러운 읽기를 위한 텍스트 정리
const preprocessText = (text) => {
  if (!text) return '';
  
  let processedText = text.trim();
  
  // 특수 문자 처리
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
    .replace(/°F/g, '도화씨')   // °F -> 도화씨
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
  
  // 문장 부호 정리
  processedText = processedText
    .replace(/\.{2,}/g, ' 잠깐만요 ')      // ... -> 잠깐만요
    .replace(/!{2,}/g, '!')               // !! -> !
    .replace(/\?{2,}/g, '?')              // ?? -> ?
    .replace(/,,+/g, ',')                 // ,, -> ,
    .replace(/\.\.+/g, '.');              // .. -> .
  
  // 공백 정리
  processedText = processedText
    .replace(/\s+/g, ' ')                 // 여러 공백을 하나로
    .replace(/\s*([,.!?;:])\s*/g, '$1 ')  // 문장부호 주변 공백 정리
    .trim();
  
  return processedText;
};

// Kokoro TTS Python 스크립트 생성
const createKokoroScript = () => {
  const scriptPath = path.join(__dirname, '..', 'kokoro_tts.py');
  const scriptContent = `#!/usr/bin/env python3
import sys
import os
import json
import subprocess
import tempfile
from pathlib import Path

def install_kokoro():
    """Kokoro TTS 설치"""
    try:
        # pip install kokoro-onnx soundfile
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'kokoro-onnx', 'soundfile'], 
                      check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Kokoro TTS 설치 실패: {e}", file=sys.stderr)
        return False

def download_kokoro_model():
    """Kokoro 모델 다운로드"""
    try:
        models_dir = os.path.join(os.path.dirname(__file__), 'models')
        os.makedirs(models_dir, exist_ok=True)
        
        model_file = os.path.join(models_dir, 'kokoro-v1.0.int8.onnx')
        voices_file = os.path.join(models_dir, 'voices-v1.0.bin')
        
        if not os.path.exists(model_file):
            print("Kokoro 모델 다운로드 중...", file=sys.stderr)
            # wget으로 모델 다운로드
            model_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx"
            voices_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
            
            subprocess.run(['wget', '-O', model_file, model_url], check=True)
            subprocess.run(['wget', '-O', voices_file, voices_url], check=True)
            print("Kokoro 모델 다운로드 완료", file=sys.stderr)
        
        return model_file, voices_file
    except Exception as e:
        print(f"모델 다운로드 실패: {e}", file=sys.stderr)
        return None, None

def synthesize_speech(text, output_file):
    """Kokoro TTS로 음성 합성"""
    try:
        # Kokoro TTS 사용
        from kokoro_onnx import Kokoro
        
        # 모델 로드
        model_file, voices_file = download_kokoro_model()
        if not model_file or not voices_file:
            return False
            
        kokoro = Kokoro(model_file, voices_file)
        
        # 음성 합성 (영어 음성 사용)
        samples, sample_rate = kokoro.create(
            text, voice="af_heart", speed=1.0, lang="en-us"
        )
        
        # WAV 파일로 저장
        import soundfile as sf
        sf.write(output_file, samples, sample_rate)
        
        return True
    except ImportError:
        # kokoro-onnx가 없으면 espeak 사용
        print("Kokoro TTS를 사용할 수 없습니다. espeak으로 폴백합니다.", file=sys.stderr)
        return False
    except Exception as e:
        print(f"음성 합성 실패: {e}", file=sys.stderr)
        return False

def main():
    if len(sys.argv) < 2:
        print("사용법: python kokoro_tts.py <텍스트>", file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    
    # 임시 파일 생성
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
        output_file = tmp_file.name
    
    try:
        # Kokoro TTS 시도
        if synthesize_speech(text, output_file):
            # 성공 시 파일 경로 출력
            print(output_file)
        else:
            # 실패 시 espeak 사용
            print("espeak_fallback", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"오류: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
  
  fs.writeFileSync(scriptPath, scriptContent);
  return scriptPath;
};

// 안전한 TTS 함수
const safeTTS = async (text, broadcast) => {
  if (!text || text.trim() === '') return;
  stopTTS();
  
  // 텍스트 전처리
  const processedText = preprocessText(text);
  log.tts('시작:', processedText);
  
  isTTSActive = true;
  if (broadcast) {
    broadcast({ type: 'tts', status: 'start', text: processedText });
  }
  
  try {
    // Kokoro TTS Python 스크립트 생성
    const scriptPath = createKokoroScript();
    
    // Python 스크립트 실행
    const pythonProcess = spawn('python3', [scriptPath, processedText], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let outputData = '';
    let errorData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0 && outputData.trim()) {
        // Kokoro TTS 성공
        const wavPath = outputData.trim();
        
        if (fs.existsSync(wavPath)) {
          // 플랫폼별 재생 방법 선택
          let playCmd = '';
          if (process.platform === 'win32') {
            const psPath = wavPath.replace(/\\/g, '/');
            playCmd = `powershell -NoProfile -Command $p=New-Object System.Media.SoundPlayer; $p.SoundLocation='${psPath}'; $p.Load(); $p.PlaySync()`;
          } else {
            playCmd = `aplay -q "${wavPath}"`;
          }
          
          currentTTSProcess = exec(playCmd, (error) => {
            try { fs.unlinkSync(wavPath); } catch {}
            isTTSActive = false;
            if (broadcast) {
              broadcast({ type: 'tts', status: 'end', text: processedText, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
            }
          });
          
          if (currentTTSProcess && typeof currentTTSProcess.on === 'function') {
            currentTTSProcess.on('exit', () => { currentTTSProcess = null; });
            currentTTSProcess.on('close', () => { currentTTSProcess = null; });
          }
        } else {
          // WAV 파일이 없으면 espeak 폴백
          fallbackToEspeak(processedText, broadcast);
        }
      } else {
        // Kokoro TTS 실패, espeak 폴백
        log.warn('Kokoro TTS 실패, espeak로 폴백:', errorData);
        fallbackToEspeak(processedText, broadcast);
      }
    });
    
    currentTTSProcess = pythonProcess;
    
  } catch (error) {
    log.error('TTS 실행 오류:', error);
    fallbackToEspeak(processedText, broadcast);
  }
};

// espeak 폴백 함수 (최적화된 설정)
const fallbackToEspeak = (text, broadcast) => {
  try {
    // 최적화된 espeak 설정 - 자연스러운 한국어 음성
    const command = `echo "${text.replace(/"/g, '\\"')}" | espeak -v ko -s 100 -p 30 -a 70 -g 15 -k 0`;
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
    log.error('espeak 실행 오류:', error);
    isTTSActive = false;
    if (broadcast) {
      broadcast({ type: 'tts', status: 'end', text, delayMs: CAPTION_HIDE_AFTER_TTS_MS });
    }
  }
};

module.exports = {
  safeTTS,
  stopTTS,
  isTTSActive: getTTSActive,
  ttsClient: null // Google Cloud TTS 제거
};
