const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const wav = require('wav');
const dns = require('node:dns');
const OpenAI = require('openai');

// DNS IPv4 우선 설정 (네트워크 안정성 향상)
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// 핵심 모듈 로드
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

let broadcast = null;

// 날씨 데이터 조회
app.get('/api/weather', async (req, res) => {
  try {
    const weatherData = await fetchWeatherData(false);
    res.json(weatherData);
  } catch (err) {
    log.error('날씨 API 오류:', err);
    res.status(500).json({ error: '날씨 정보를 가져오는 데 실패했습니다.' });
  }
});

// 음성 인식 기반 대화형 어시스턴트
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
      verbose: false,
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
          
          const audioBuffer = fs.readFileSync(outputPath);
          const emotionResult = await analyzeEmotion(audioBuffer);
          log.info('음성 감정 분석 결과:', emotionResult);
          
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
          
          log.info('스마트 문맥 인식 대화 시스템 응답:', assistantResponse);
          
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

app.get('/api/calendar/today', async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const events = await fetchTodayEvents();
    
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

app.post('/api/calendar/refresh', async (req, res) => {
  try {
    log.info('캘린더 수동 새로고침 요청됨');
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
  
  try {
    const aiInitialized = await initializeAIModules();
    if (aiInitialized) {
      log.info('AI 기능 (감정분석, 표정인식, 옷차림분석) 활성화 완료');
    } else {
      log.warn('AI 기능 초기화에 실패했습니다. 기본 기능만 사용됩니다.');
    }
  } catch (error) {
    log.error('AI 모듈 초기화 오류:', error);
  }
  
  log.info('자연스러운 AI 상호작용이 가능한 스마트 미러 준비 완료');
});

const { broadcast: wsbroadcast } = initializeWebSocket(server);
broadcast = wsbroadcast;

addAIApiRoutes(app);

personalizationSystem.startMessageUpdates(broadcast, environmentalAwareness);

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

let lastCalendarHash = null;
let calendarUpdateCount = 0;

const checkCalendarUpdates = async () => {
  try {
    const events = await fetchTodayEvents();
    const currentHash = JSON.stringify(events.map(e => `${e.id}-${e.start}-${e.summary}`).sort());
    
    if (lastCalendarHash === null) {
      lastCalendarHash = currentHash;
      log.info(`캘린더 모니터링 시작: ${events.length}개 일정`);
      return;
    }
    
    if (lastCalendarHash !== currentHash) {
      calendarUpdateCount++;
      log.info(`캘린더 변경 감지! (#${calendarUpdateCount}): ${events.length}개 일정 → 즉시 클라이언트 업데이트`);
      
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

setInterval(checkCalendarUpdates, 10 * 1000);

setInterval(async () => {
  try {
    log.debug('캘린더 정기 체크 (1분)');
    await checkCalendarUpdates();
  } catch (error) {
    log.warn('캘린더 정기 체크 실패:', error.message);
  }
}, 60 * 1000);

setTimeout(checkCalendarUpdates, 5000);

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
