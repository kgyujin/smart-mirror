// ========== app.js 수정 가이드 ==========

/* 
1. 맨 위에 AI 통합 모듈 import 추가 
*/
const {
  initializeAIModules,
  processRecognizedCommandWithAI,
  addAIApiRoutes,
  enhanceConversationWithAI
} = require('./ai_integration');

/*
2. 서버 시작 부분에서 AI 모듈 초기화 추가
*/
// 기존 서버 시작 코드를 찾아서 이렇게 수정:

const server = app.listen(PORT, async () => {
  log.info(`서버 실행 중: http://localhost:${PORT}`);
  log.info('ETRI 음성인식 기반 스마트 미러 서비스 준비 완료');
  
  // ✨ AI 모듈 초기화 추가
  try {
    const aiInitialized = await initializeAIModules();
    if (aiInitialized) {
      log.info('🤖 AI 기능이 활성화되었습니다.');
    } else {
      log.warn('⚠️ AI 기능 초기화에 실패했습니다. 기본 기능만 사용됩니다.');
    }
  } catch (error) {
    log.error('AI 모듈 초기화 오류:', error);
  }
  
  log.info('스마트 문맥 인식 대화 시스템으로 설정되었습니다.');
  log.info('핫워드 대기 중: "미러야", "밀어야", "미로야", "미라야", "미러", "미로", "미라", "하이미러"');
});

/*
3. WebSocket 초기화 후 AI API 라우트 추가
*/
// WebSocket 초기화 코드 바로 뒤에 추가:

const { broadcast: wsbroadcast } = initializeWebSocket(server);
broadcast = wsbroadcast;

// ✨ AI API 라우트 추가
addAIApiRoutes(app);

/*
4. 기존 음성 인식 처리 부분 교체
*/
// 현재 startContinuousHotwordListener 호출 부분을 찾아서 수정:

if (ALWAYS_LISTEN) {
  const dependencies = {
    conversationContext,
    openai,
    broadcast,
    safeTTS,
    parseRelativeDate,
    formatKSTTime,
    formatKSTDate,
    processNewsQuery,
    fetchTodayEvents,
    getRuleBasedAdviceForDay,
    formatKoreanTime,
    buildDayContext,
    fetchWeatherData,
    environmentalAwareness,
    getKSTNow,
    getKoreanDateInfo,
    fetchKSTNowFromAPI
  };
  
  startContinuousHotwordListener(
    // ✨ 기존 processRecognizedCommand 대신 AI 강화 버전 사용
    (text, deps, emotionData) => processRecognizedCommandWithAI(text, deps, emotionData),
    broadcast,
    dependencies
  );
}

/*
5. 채팅 API에도 AI 기능 통합
*/
// 기존 /api/chat 엔드포인트를 찾아서 수정:

app.post('/api/chat', async (req, res) => {
  try {
    const message = (req.body.message || '').toString();
    if (!message) return res.status(400).json({ error: '메시지가 없습니다.' });
    
    const dependencies = {
      conversationContext,
      openai,
      broadcast,
      safeTTS,
      parseRelativeDate,
      formatKSTTime,
      formatKSTDate,
      processNewsQuery
    };
    
    // ✨ AI 강화 대화 처리 사용
    const reply = await processRecognizedCommandWithAI(message, dependencies);
    res.json({ reply: reply || '' });
  } catch (e) {
    res.status(500).json({ error: '채팅 처리 실패' });
  }
});

/*
6. 환경 변수 설정 (.env 파일에 추가)
*/
// .env 파일에 다음 내용 추가:
/*
# AI 서버 설정
AI_SERVER_HOST=192.168.0.162
AI_SERVER_PORT=5052

# 오디오/비디오 디바이스 설정
AUDIO_DEVICE=default
VIDEO_DEVICE=/dev/video0

# AI 기능 활성화
ENABLE_AI_EMOTION=true
ENABLE_AI_OUTFIT=true
ENABLE_AI_CONVERSATION=true
*/

/*
7. package.json 의존성 추가
*/
// package.json의 dependencies에 추가할 패키지들:
/*
"axios": "^1.6.0",
"node-record-lpcm16": "^1.0.1"
*/

/*
8. 실시간 AI 분석을 위한 WebSocket 이벤트 추가
*/
// WebSocket 초기화 부분에 AI 이벤트 핸들러 추가:

// initializeWebSocket 함수 내부 또는 WebSocket 연결 후에 추가:
function broadcastAIAnalysis(type, data) {
  if (broadcast) {
    broadcast({
      type: 'ai_analysis',
      analysisType: type,  // 'emotion', 'outfit', 'combined'
      data: data,
      timestamp: new Date().toISOString()
    });
  }
}

/*
9. 상시 감정 모니터링 (선택사항)
*/
// 주기적 AI 분석을 원하는 경우 추가:

let aiMonitoringInterval = null;

function startAIMonitoring() {
  if (aiMonitoringInterval) return;
  
  aiMonitoringInterval = setInterval(async () => {
    try {
      // 5분마다 자동으로 감정 상태 체크
      const aiClient = require('./ai_integration').aiClient();
      const imageCapture = require('./ai_integration').imageCapture();
      
      if (aiClient && imageCapture) {
        const photos = await imageCapture.captureMultiplePhotos(3, 1000);
        if (photos.length > 0) {
          const result = await aiClient.analyzeFaceEmotion(photos);
          
          if (result.success && result.emotion !== 'neutral') {
            log.info(`🤖 자동 감정 감지: ${result.emotion}`);
            
            // 특정 감정일 때만 반응
            if (result.emotion === 'sad' && result.confidence > 0.7) {
              const response = '혹시 피곤해 보이시는데, 잠시 쉬시는 건 어떠세요?';
              safeTTS(response);
              broadcast({
                type: 'ai_proactive',
                message: response,
                emotion: result.emotion
              });
            }
          }
        }
      }
    } catch (error) {
      log.warn('AI 자동 모니터링 오류:', error);
    }
  }, 5 * 60 * 1000); // 5분마다
}

// 서버 시작 후 자동 모니터링 시작 (선택사항)
// setTimeout(startAIMonitoring, 30000); // 30초 후 시작

/*
10. 기존 Vision API 제거 또는 통합
*/
// 기존의 /api/vision/* 엔드포인트들을 제거하거나 새로운 AI API로 리다이렉트

// 기존 vision API를 새 AI API로 리다이렉트:
app.post('/api/vision/emotion', async (req, res) => {
  // 새로운 AI API로 리다이렉트
  req.url = '/api/ai/analyze-emotion';
  app.handle(req, res);
});

app.post('/api/vision/outfit', async (req, res) => {
  // 새로운 AI API로 리다이렉트
  req.url = '/api/ai/analyze-outfit';
  app.handle(req, res);
});

/*
==================================================
완전한 적용 예시 (기존 app.js의 핵심 부분들 수정)
==================================================
*/

// 1. Import 섹션에 추가
const {
  initializeAIModules,
  processRecognizedCommandWithAI,
  addAIApiRoutes
} = require('./ai_integration');

// 2. 서버 시작 부분 완전 수정 예시:
const server = app.listen(PORT, async () => {
  log.info(`서버 실행 중: http://localhost:${PORT}`);
  log.info('ETRI 음성인식 기반 스마트 미러 서비스 준비 완료');
  
  // AI 모듈 초기화
  try {
    const aiInitialized = await initializeAIModules();
    if (aiInitialized) {
      log.info('🤖 AI 기능 (감정분석, 표정인식, 옷차림분석) 활성화 완료!');
    }
  } catch (error) {
    log.error('AI 모듈 초기화 실패:', error);
  }
  
  log.info('🎭 자연스러운 AI 상호작용이 가능한 스마트 미러 준비 완료!');
  log.info('💬 "나 오늘 기분이 안 좋아", "오늘 나 어때?" 같은 자연스러운 대화를 시도해보세요!');
});

// WebSocket 초기화
const { broadcast: wsbroadcast } = initializeWebSocket(server);
broadcast = wsbroadcast;

// AI API 라우트 추가
addAIApiRoutes(app);

// 개인화 시스템 시작 (기존 코드)
personalizationSystem.startMessageUpdates(broadcast, environmentalAwareness);

// 상시 리스닝 시작 (AI 강화 버전)
if (ALWAYS_LISTEN) {
  const dependencies = {
    conversationContext,
    openai,
    broadcast,
    safeTTS,
    parseRelativeDate,
    formatKSTTime,
    formatKSTDate,
    processNewsQuery,
    fetchTodayEvents,
    getRuleBasedAdviceForDay,
    formatKoreanTime,
    buildDayContext,
    fetchWeatherData,
    environmentalAwareness,
    getKSTNow,
    getKoreanDateInfo,
    fetchKSTNowFromAPI
  };
  
  startContinuousHotwordListener(
    (text, deps, emotionData) => processRecognizedCommandWithAI(text, deps, emotionData),
    broadcast,
    dependencies
  );
}

// 나머지 기존 코드들 (캘린더 모니터링, 정리 등)은 그대로 유지...