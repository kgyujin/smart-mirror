const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const wav = require('wav');
const dns = require('node:dns');
const OpenAI = require('openai');

// DNS 설정
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// 모듈 import
const { 
  PORT, 
  OPENAI_API_KEY, 
  ALWAYS_LISTEN
} = require('./js/config');
const { log } = require('./js/logging');
const { 
  fetchWeatherData, 
  environmentalAwareness,
  getKSTNow,
  parseRelativeDate,
  getKoreanDateInfo,
  fetchKSTNowFromAPI
} = require('./js/weather');
const { 
  fetchTodayEvents, 
  getRuleBasedAdviceForDay,
  formatKoreanTime,
  buildDayContext
} = require('./js/calendar');
const { fetchLatestNews, processNewsQuery, isNewsQuery } = require('./js/news');
const { safeTTS, isTTSActive } = require('./js/tts');
const { 
  startContinuousHotwordListener, 
  stopContinuousHotwordListener,
  convertAudioToText,
  isMicListening
} = require('./js/speech');

const { PersonalizationSystem } = require('./js/personalization');
const { 
  ConversationContext, 
  processRecognizedCommand,
  formatKSTTime,
  formatKSTDate
} = require('./js/conversation');
const { 
  conversateWithAssistant, 
  checkTokenExists 
} = require('./js/assistant');
const { initializeWebSocket } = require('./js/websocket');

// ✨ AI 통합 모듈 import 추가
const {
  initializeAIModules,
  processRecognizedCommandWithAI,
  addAIApiRoutes,
  enhanceConversationWithAI
} = require('./ai_integration');

const app = express();
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// 필요한 디렉토리 생성
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
  log.info('tmp 디렉토리 생성:', tmpDir);
}

// Express 미들웨어 설정
app.use(express.static('public'));
app.use(express.json());

// 시스템 인스턴스 생성
const personalizationSystem = new PersonalizationSystem(openai);
const { conversationContext } = require('./js/conversation');

// WebSocket 초기화 (서버 시작 후 설정)
let broadcast = null;

// ========== API 라우트들 ==========

// 날씨 API
app.get('/api/weather', async (req, res) => {
  try {
    const weatherData = await fetchWeatherData(false); // 캐시 무시하고 새로 가져오기
    res.json(weatherData);
  } catch (err) {
    log.error('날씨 API 오류:', err);
    res.status(500).json({ error: '날씨 정보를 가져오는 데 실패했습니다.' });
  }
});

// ETRI 음성인식 기반 Assistant API
app.get('/api/assistant', async (req, res) => {
  try {
    const outputPath = path.join(__dirname, 'user_input.wav');
    const fileWriter = new wav.FileWriter(outputPath, {
      channels: 1,
      sampleRate: 16000,
      bitDepth: 16,
    });

    const record = require('node-record-lpcm16').record;
    const mic = record({
      sampleRateHertz: 16000,
      threshold: 0,
      verbose: false, // 마이크 로그 비활성화
      recordProgram: 'sox',
      silence: '2.0',
    });

    mic.stream()
      .on('data', () => {
        log.verbose('사용자 음성 수신 중...');
      })
      .on('error', (err) => {
        log.error('마이크 오류:', err);
      })
      .pipe(fileWriter);

    let hasResponded = false;

    const sendResponse = (data) => {
      if (!hasResponded) {
        hasResponded = true;
        res.json(data);
      }
    };

    setTimeout(async () => {
      fileWriter.end();
      mic.stop();

      try {
        const audioBuffer = fs.readFileSync(outputPath);
        const transcription = await convertAudioToText(audioBuffer);
        
        if (!transcription) {
          return sendResponse({ error: '음성을 인식할 수 없습니다.' });
        }

        log.info('사용자 음성 인식 결과:', transcription);

        if (
          transcription.toLowerCase().includes('미러야') ||
          transcription.includes('밀어야') ||
          transcription.includes('하이미러')
        ) {
          log.info('Assistant 트리거됨:', transcription);

          const query = transcription.replace(/(미러야|밀어야|하이미러)/gi, '').trim();
          log.info('추출된 쿼리:', query);

          if (isNewsQuery(query)) {
            try {
              const newsRes = await processNewsQuery(query);
              const newsResponse = newsRes.response || '뉴스 정보를 불러올 수 없습니다.';
              log.info('뉴스 직접 응답:', newsResponse);
              safeTTS(newsResponse, broadcast);
              return sendResponse({
                response: newsResponse,
                success: true,
                source: 'rss_news_direct',
                query
              });
            } catch (e) {
              log.error('뉴스 직접 처리 실패:', e);
              return sendResponse({
                error: '뉴스 정보를 가져오는 데 실패했습니다.',
                source: 'rss_news_direct',
                query
              });
            }
          }

                  try {
          log.info('스마트 문맥 인식 대화 시스템 시작...');
          
          // 음성 감정 분석 수행
          const audioBuffer = fs.readFileSync(outputPath);
          const emotionResult = await analyzeEmotion(audioBuffer);
          log.info('😊 음성 감정 분석 결과:', emotionResult);
          
          // 새로운 스마트 대화 시스템 사용
          const dependencies = {
            conversationContext,
            openai,
            broadcast,
            safeTTS,
            parseRelativeDate,
            formatKSTTime,
            formatKSTDate,
            processNewsQuery,
            emotion: emotionResult
          };
          
          const assistantResponse = await processRecognizedCommand(query, dependencies);
          
          log.info('✅ 스마트 문맥 인식 대화 시스템 응답:', assistantResponse);
          
          sendResponse({
            response: assistantResponse,
            success: true,
            source: 'smart_contextual_assistant',
            query: query
          });
          
        } catch (assistantError) {
          log.error('스마트 문맥 인식 대화 시스템 오류:', assistantError);
          sendResponse({
            error: '대화 처리 실패: ' + assistantError.message,
            query: query
          });
        }

        } else {
          sendResponse({ response: `"${transcription}" → 어시스턴트 트리거 조건이 아닙니다.` });
        }
      } catch (err) {
        log.error('음성인식 오류:', err);
        sendResponse({ error: '음성 인식 실패: ' + err.message });
      }
    }, 4000);
  } catch (err) {
    log.error('API 처리 오류:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Assistant 처리 실패: ' + err.message });
    }
  }
});

// 시간 API
app.get('/api/time', (req, res) => {
  const now = new Date();

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const isAM = hours < 12;
  const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
  const formattedTime = `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;

  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
  const formattedDate = `${year}년 ${month}월 ${day}일 (${weekday})`;

  res.json({
    time: formattedTime,
    date: formattedDate
  });
});

// 뉴스 API
app.get('/api/news', async (req, res) => {
  try {
    const result = await fetchLatestNews();
    res.json(result);
  } catch (err) {
    log.error('뉴스 불러오기 실패:', err);
    res.status(500).json({ error: '뉴스 정보를 가져오는 데 실패했습니다.' });
  }
});

app.post('/api/news', async (req, res) => {
  try {
    const userQuery = req.body.query || '';
    const result = await processNewsQuery(userQuery);
    res.json(result);
  } catch (error) {
    log.error('뉴스 질문 처리 실패:', error);
    res.status(500).json({ error: '뉴스 정보를 가져오는 데 실패했습니다.' });
  }
});

// 캘린더 API
app.get('/api/calendar/today', async (req, res) => {
  try {
    // 캐시 무효화 헤더 설정 (실시간 업데이트 보장)
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const events = await fetchTodayEvents();
    
    // 응답에 타임스탬프 포함
    res.json({
      events: events,
      lastUpdated: new Date().toISOString(),
      count: events.length
    });
  } catch (error) {
    log.error('캘린더 API 오류:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// 캘린더 수동 새로고침 API 엔드포인트
app.post('/api/calendar/refresh', async (req, res) => {
  try {
    log.info('📅 캘린더 수동 새로고침 요청됨');
    await checkCalendarUpdates();
    const events = await fetchTodayEvents();
    
    res.json({
      success: true,
      message: 'Calendar refreshed',
      events: events,
      count: events.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    log.error('캘린더 수동 새로고침 실패:', error);
    res.status(500).json({ error: 'Failed to refresh calendar' });
  }
});

// 요약 API
app.get('/api/summary', async (req, res) => {
  try {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const isAM = hours < 12;
    const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
    const formattedTime = `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
    const formattedDate = `${year}년 ${month}월 ${day}일 (${weekday})`;

    const { weatherText, events } = await buildDayContext();
    const advice = getRuleBasedAdviceForDay(events);
    res.json({ time: formattedTime, date: formattedDate, weather: weatherText, events, advice });
  } catch (e) {
    res.status(500).json({ error: '요약을 생성하지 못했습니다.' });
  }
});

// 채팅 API
app.post('/api/chat', async (req, res) => {
  try {
    const message = (req.body.message || '').toString();
    if (!message) return res.status(400).json({ error: 'message 필요' });
    
    // 음성과 동일한 파이프라인 사용
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

// 마이크 토글 API
app.post('/api/mic/toggle', (req, res) => {
  try {
    if (isMicListening) {
      stopContinuousHotwordListener(broadcast);
      return res.json({ listening: false });
    }
    
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
    
    startContinuousHotwordListener(
      (text, deps, emotionData) => processRecognizedCommandWithAI(text, deps, emotionData),
      broadcast,
      dependencies
    );
    res.json({ listening: true });
  } catch (e) {
    res.status(500).json({ error: '마이크 토글 실패' });
  }
});

// 날짜 파싱 테스트 API
app.post('/api/date-parse', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text 파라미터가 필요합니다.' });
    }
    
    const dateInfo = parseRelativeDate(text);
    const response = await generateDateResponse(dateInfo, text, openai);
    
    res.json({
      original: text,
      parsed: dateInfo,
      response: response
    });
  } catch (error) {
    log.error('날짜 파싱 오류:', error);
    res.status(500).json({ error: '날짜 파싱 실패' });
  }
});

// 개인화된 메시지 API
app.get('/api/personalized-message', (req, res) => {
  try {
    const message = personalizationSystem.getCurrentMessage();
    res.json({ 
      message: message,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('개인화 메시지 API 오류:', error);
    res.status(500).json({ error: '개인화 메시지를 가져오지 못했습니다.' });
  }
});

// 메시지 변경 API
app.post('/api/personalized-message/change', async (req, res) => {
  try {
    const newMessage = await personalizationSystem.changeMessage(broadcast, environmentalAwareness);
    res.json({ 
      message: newMessage,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('메시지 변경 API 오류:', error);
    res.status(500).json({ error: '메시지 변경에 실패했습니다.' });
  }
});



// Vision Analysis API - 표정 분석
app.post('/api/vision/emotion', async (req, res) => {
  try {
    log.info('표정 분석 요청 받음');
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: '이미지가 필요합니다.' });
    }

    // Vision server로 요청 전달
    const visionResponse = await axios.post('http://localhost:5051/analyze/emotion', {
      image: image
    }, {
      timeout: 30000
    });

    log.info('표정 분석 완료:', visionResponse.data);
    res.json(visionResponse.data);
  } catch (error) {
    log.error('표정 분석 오류:', error.message);
    res.status(500).json({ 
      error: '표정 분석에 실패했습니다.',
      details: error.message 
    });
  }
});

// Vision Analysis API - 옷차림 분석
app.post('/api/vision/outfit', async (req, res) => {
  try {
    log.info('옷차림 분석 요청 받음');
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: '이미지가 필요합니다.' });
    }

    // 날씨 정보 가져오기
    const weatherData = await fetchWeatherData();
    const temperature = weatherData?.current?.temperature || 20;

    // Vision server로 요청 전달
    const visionResponse = await axios.post('http://localhost:5051/analyze/outfit', {
      image: image,
      temperature: temperature
    }, {
      timeout: 30000
    });

    log.info('옷차림 분석 완료:', visionResponse.data);
    res.json(visionResponse.data);
  } catch (error) {
    log.error('옷차림 분석 오류:', error.message);
    res.status(500).json({ 
      error: '옷차림 분석에 실패했습니다.',
      details: error.message 
    });
  }
});

// 헬스체크 API
app.get('/api/health', (req, res) => {
  const tokenExists = checkTokenExists();
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    tokenExists: tokenExists
  });
});

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
  log.error('서버 에러:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });
});

// 서버 시작
const server = app.listen(PORT, async () => {
  log.info(`서버 실행 중: http://localhost:${PORT}`);
  log.info('ETRI 음성인식 기반 스마트 미러 서비스 준비 완료');
  
  // ✨ AI 모듈 초기화 추가
  try {
    const aiInitialized = await initializeAIModules();
    if (aiInitialized) {
      log.info('🤖 AI 기능 (감정분석, 표정인식, 옷차림분석) 활성화 완료!');
    } else {
      log.warn('⚠️ AI 기능 초기화에 실패했습니다. 기본 기능만 사용됩니다.');
    }
  } catch (error) {
    log.error('AI 모듈 초기화 오류:', error);
  }
  
  log.info('🎭 자연스러운 AI 상호작용이 가능한 스마트 미러 준비 완료!');
  log.info('💬 "나 오늘 기분이 안 좋아", "오늘 나 어때?" 같은 자연스러운 대화를 시도해보세요!');
});

// WebSocket 초기화
const { broadcast: wsbroadcast } = initializeWebSocket(server);
broadcast = wsbroadcast;

// ✨ AI API 라우트 추가
addAIApiRoutes(app);

// 개인화 시스템 시작 (WebSocket 초기화 후)
personalizationSystem.startMessageUpdates(broadcast, environmentalAwareness);

// 상시 리스닝 시작
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

// 캘린더 실시간 모니터링 시스템 (초고빈도)
let lastCalendarHash = null;
let calendarUpdateCount = 0;

const checkCalendarUpdates = async () => {
  try {
    const events = await fetchTodayEvents();
    const currentHash = JSON.stringify(events.map(e => `${e.id}-${e.start}-${e.summary}`).sort());
    
    if (lastCalendarHash === null) {
      // 초기 해시 설정
      lastCalendarHash = currentHash;
      log.info(`📅 캘린더 모니터링 시작: ${events.length}개 일정`);
      return;
    }
    
    if (lastCalendarHash !== currentHash) {
      calendarUpdateCount++;
      log.info(`📅 캘린더 변경 감지! (#${calendarUpdateCount}): ${events.length}개 일정 → 즉시 클라이언트 업데이트`);
      
      // 모든 WebSocket 클라이언트에 즉시 업데이트 전송
      if (broadcast) {
        broadcast({
          type: 'calendar_update',
          events: events,
          timestamp: new Date().toISOString(),
          updateCount: calendarUpdateCount,
          reason: 'change_detected'
        });
      }
      
      lastCalendarHash = currentHash;
    }
  } catch (error) {
    log.warn('캘린더 업데이트 확인 실패:', error.message);
  }
};

// 🚀 초고빈도 캘린더 모니터링 (10초마다!)
setInterval(checkCalendarUpdates, 10 * 1000);

// 추가: 1분마다 강제 체크 (안전장치)
setInterval(async () => {
  try {
    log.debug('📅 캘린더 정기 체크 (1분)');
    await checkCalendarUpdates();
  } catch (error) {
    log.warn('캘린더 정기 체크 실패:', error.message);
  }
}, 60 * 1000);

// 초기 캘린더 해시 설정 (5초 후)
setTimeout(checkCalendarUpdates, 5000);

// 주기적 컨텍스트 정리
setInterval(() => {
  conversationContext.cleanup();
}, 10 * 60 * 1000);

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
  log.info('서버 종료 중...');
  personalizationSystem.cleanup();
  conversationContext.cleanup();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log.error('처리되지 않은 예외 (계속 실행):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('처리되지 않은 Promise 거부 (계속 실행):', reason);
});

// 주기적 컨텍스트 정리 (10분마다)
setInterval(() => {
  conversationContext.cleanup();
}, 10 * 60 * 1000);

process.on('uncaughtException', (err) => {
  log.error('처리되지 않은 예외 (계속 실행):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('처리되지 않은 Promise 거부 (계속 실행):', reason);
});
