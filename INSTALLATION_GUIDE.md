# 🚀 스마트 미러 AI 통합 시스템 - 설치 및 실행 가이드

## 📋 **시스템 요구사항**

### **MacBook (AI 서버)**
```bash
# Python 3.8+ 필수
python3 --version

# 필요한 패키지 설치
pip3 install torch torchvision transformers
pip3 install opencv-python pillow librosa
pip3 install flask flask-cors
pip3 install numpy scipy
```

### **라즈베리파이 3 (클라이언트)**
```bash
# 오디오/비디오 도구 설치
sudo apt update
sudo apt install sox fswebcam alsa-utils

# Node.js 패키지 업데이트
npm install axios node-record-lpcm16
```

---

## 🔧 **1단계: 기존 서버 정리**

### **중요: 기존 분리된 Python 서버들 종료**
```bash
# MacBook에서 실행
pkill -f emotion_server.py
pkill -f vision_server.py

# 프로세스 확인
ps aux | grep python | grep -E "(emotion|vision)"
```

---

## 🚀 **2단계: 통합 AI 서버 시작**

### **MacBook에서 ai_server.py 실행**
```bash
cd /Users/kgyujin/dev/smart-mirror

# 가상환경 사용 권장 (선택사항)
python3 -m venv ai_env
source ai_env/bin/activate  # Linux/Mac
# ai_env\Scripts\activate   # Windows

# 통합 AI 서버 실행
python3 ai_server.py
```

### **성공적인 시작 로그 예시**
```
🚀 통합 AI 분석 서버 초기화 중...
🔧 사용 디바이스: cpu
📷 얼굴 표정 감정 분석 모델 로딩 중...
✅ 표정 분석 모델 로딩 완료!
🎤 음성 감정 분석 준비 완료!
👔 CLIP 모델 로딩 중...
✅ CLIP 모델 로딩 완료!
✅ 얼굴 탐지 모델 로딩 완료!
✅ 통합 AI 분석 서버 초기화 완료!
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5052
```

---

## 🎯 **3단계: Node.js 앱 수정 및 실행**

### **라즈베리파이에서 app.js 수정**

1. **ai_integration.js 파일 복사**
   ```bash
   # MacBook에서 라즈베리파이로 파일 전송
   scp ai_integration.js pi@192.168.0.xxx:/home/pi/smart-mirror/
   ```

2. **app.js 상단에 import 추가**
   ```javascript
   // 기존 require들 아래에 추가
   const {
     initializeAIModules,
     processRecognizedCommandWithAI,
     addAIApiRoutes
   } = require('./ai_integration');
   ```

3. **서버 시작 부분 수정**
   ```javascript
   const server = app.listen(PORT, async () => {
     log.info(`서버 실행 중: http://localhost:${PORT}`);
     
     // ✨ AI 모듈 초기화 추가
     try {
       const aiInitialized = await initializeAIModules();
       if (aiInitialized) {
         log.info('🤖 AI 기능 활성화 완료!');
       }
     } catch (error) {
       log.error('AI 초기화 실패:', error);
     }
   });
   ```

4. **WebSocket 초기화 후 AI API 추가**
   ```javascript
   const { broadcast: wsbroadcast } = initializeWebSocket(server);
   broadcast = wsbroadcast;
   
   // ✨ AI API 라우트 추가
   addAIApiRoutes(app);
   ```

5. **대화 처리 함수 교체**
   ```javascript
   // 기존 startContinuousHotwordListener 호출 부분에서
   startContinuousHotwordListener(
     (text, deps, emotionData) => processRecognizedCommandWithAI(text, deps, emotionData), // ✨ 변경
     broadcast,
     dependencies
   );
   ```

### **환경 설정 (.env 파일 업데이트)**
```bash
# .env 파일에 추가
AI_SERVER_HOST=192.168.0.162
AI_SERVER_PORT=5052
ENABLE_AI_EMOTION=true
ENABLE_AI_OUTFIT=true
```

### **Node.js 앱 실행**
```bash
cd /home/pi/smart-mirror
npm install axios node-record-lpcm16
node app.js
```

---

## ✅ **4단계: 시스템 확인**

### **1. AI 서버 상태 확인**
```bash
# MacBook 터미널에서
curl http://192.168.0.162:5052/health

# 응답 예시:
# {"status":"healthy","models_loaded":true,"services":["voice_emotion","face_emotion","outfit","combined_emotion"]}
```

### **2. 라즈베리파이에서 AI 연결 확인**
```bash
# 라즈베리파이 터미널에서
curl http://192.168.0.162:5052/health

# 또는 Node.js 앱 로그에서 확인:
# "✅ AI 서버 연결 확인 완료" 메시지 확인
```

### **3. 기능 테스트**

#### **A. 감정 분석 테스트**
```bash
# 라즈베리파이에서 스마트 미러에게 말하기:
"미러야, 나 오늘 기분이 안 좋아"
"미러야, 너무 신나!"
"미러야, 화가 나"

# 예상 동작:
# 1. 음성 + 표정 동시 분석
# 2. AI 응답: "목소리 톤과 표정을 보니 조금 우울해 보이시네요. 괜찮으신가요?"
```

#### **B. 옷차림 분석 테스트**
```bash
# 스마트 미러에게 말하기:
"미러야, 오늘 나 어때?"
"미러야, 내 옷차림 어때?"

# 예상 동작:
# 1. 현재 날씨 확인
# 2. 옷차림 사진 5장 촬영
# 3. AI 분석 후 응답: "따뜻한 날씨(25°C)에 시원하게 잘 입으셨어요!"
```

### **4. 로그 확인**

#### **MacBook AI 서버 로그**
```
🎤 음성 감정 분석 완료: happy (신뢰도: 0.72)
📷 표정 감정 분석 완료: happy
🎭 통합 감정 분석 완료: happy
👔 옷차림 분석 완료: 적절
```

#### **라즈베리파이 Node.js 로그**
```
🤖 AI가 대화를 처리함
😊 감정 표현 감지: happy
👔 옷차림 질문 감지
🎤 API를 통한 오디오 캡처 완료
📷 API를 통한 사진 캡처 완료: 5장
```

---

## 🎭 **5단계: 자연스러운 대화 테스트**

### **감정 관련 대화**
```
사용자: "미러야, 오늘 힘든 일이 있었어"
AI 응답: "목소리 톤과 표정을 보니 조금 우울해 보이시네요. 괜찮으신가요?"

사용자: "미러야, 정말 기뻐!"  
AI 응답: "목소리와 표정 모두 정말 기쁘신 것 같아요! 좋은 일 있으셨나 봐요?"
```

### **옷차림 관련 대화**
```
사용자: "미러야, 오늘 나 어때?"
AI 응답: "따뜻한 날씨(25°C)에 시원하게 잘 입으셨어요!"

사용자: "미러야, 내 스타일 어울려?"
AI 응답: "선선한 날씨(19°C)에 딱 맞는 옷차림이네요!"
```

---

## 🚨 **문제 해결**

### **1. AI 서버 연결 실패**
```bash
# 방화벽 확인 (MacBook)
sudo ufw status
sudo ufw allow 5052

# 네트워크 연결 확인 (라즈베리파이)
ping 192.168.0.162
telnet 192.168.0.162 5052
```

### **2. 오디오 캡처 실패**
```bash
# 라즈베리파이에서 마이크 확인
arecord -l
arecord -D hw:1,0 -d 3 -f cd test.wav
```

### **3. 카메라 캡처 실패**
```bash
# 라즈베리파이에서 웹캠 확인
lsusb | grep -i camera
fswebcam -d /dev/video0 test.jpg
```

### **4. 메모리 부족 (MacBook)**
```bash
# GPU 사용 불가능 시 CPU 모드로 강제 실행
export CUDA_VISIBLE_DEVICES=""
python3 ai_server.py
```

---

## 📊 **성능 최적화**

### **AI 서버 최적화 (MacBook)**
```python
# ai_server.py에서 배치 크기 조정
# GPU 메모리가 부족하면:
device = torch.device("cpu")  # 강제 CPU 모드

# 또는 모델 경량화:
torch.backends.cudnn.benchmark = False
```

### **라즈베리파이 최적화**
```bash
# 불필요한 서비스 정지
sudo systemctl stop bluetooth
sudo systemctl stop avahi-daemon

# 스왑 파일 늘리기 (메모리 부족 시)
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile  # CONF_SWAPSIZE=1024
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

---

## 🎯 **고급 기능 활성화**

### **상시 감정 모니터링 (선택사항)**
```javascript
// app.js에 추가 - 5분마다 자동 감정 체크
function startAIMonitoring() {
  setInterval(async () => {
    const photos = await imageCapture.captureMultiplePhotos(3, 1000);
    const result = await aiClient.analyzeFaceEmotion(photos);
    
    if (result.emotion === 'sad' && result.confidence > 0.7) {
      safeTTS('혹시 피곤해 보이시는데, 잠시 쉬시는 건 어떠세요?');
    }
  }, 5 * 60 * 1000);
}

// 서버 시작 30초 후 활성화
setTimeout(startAIMonitoring, 30000);
```

### **실시간 WebSocket 이벤트**
```javascript
// 클라이언트 측 JavaScript (public/js/)에서 AI 이벤트 수신
socket.on('ai_analysis', (data) => {
  console.log('AI 분석 결과:', data);
  // UI 업데이트, 애니메이션 등
});
```

---

## ✅ **최종 확인 체크리스트**

- [ ] **MacBook**: ai_server.py 실행 중, 포트 5052 Listen
- [ ] **라즈베리파이**: app.js 실행 중, AI 모듈 초기화 성공
- [ ] **네트워크**: 192.168.0.162:5052 연결 가능
- [ ] **하드웨어**: 마이크, 웹캠 정상 작동
- [ ] **기능 테스트**: 
  - [ ] "나 오늘 기분이 안 좋아" → AI 감정 분석 + 공감 응답
  - [ ] "오늘 나 어때?" → 옷차림 분석 + 날씨 기반 조언
  - [ ] 기존 기능 (날씨, 뉴스, 캘린더) 정상 작동

---

## 🎉 **성공! 이제 자연스러운 AI 스마트 미러 완성!**

사용자가 자연스럽게 감정을 표현하거나 외모에 대해 묻기만 하면, AI가 자동으로:
1. 🎤 **음성 톤 분석**
2. 📷 **얼굴 표정 분석** (연속 5장)
3. 👔 **옷차림 적절성 분석** (날씨 기반)
4. 💬 **공감적이고 자연스러운 응답** 생성

이 모든 과정이 하나의 대화 흐름에서 자동으로 실행됩니다! 🎭✨