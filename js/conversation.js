const axios = require('axios');
const { PORT } = require('./config');
const { log } = require('./logging');
const { fetchWeatherData } = require('./weather');
const { fetchTodayEvents, formatKSTTimeFromISO, fetchEventsForDay } = require('./calendar');

// ========== 스마트 문맥 인식 시스템 ==========

// 감정 상태 분석
const analyzeEmotion = (text) => {
  const lowerText = text.toLowerCase();
  
  // 긍정적 감정
  if (/(좋아|행복|즐거워|신나|기쁘|만족|감사|사랑|즐거운|행복한)/.test(lowerText)) {
    return { emotion: 'positive', intensity: 0.8, keywords: ['긍정', '행복'] };
  }
  
  // 부정적 감정
  if (/(나빠|슬퍼|우울|짜증|화나|스트레스|걱정|불안|무서워|지겨워|싫어|기분\s*안\s*좋|기분\s*나쁘)/.test(lowerText)) {
    return { emotion: 'negative', intensity: 0.9, keywords: ['부정', '우울'] };
  }
  
  // 중립적 감정
  if (/(보통|그냥|평범|괜찮|무덤덤|차분|평온)/.test(lowerText)) {
    return { emotion: 'neutral', intensity: 0.5, keywords: ['중립', '평온'] };
  }
  
  return { emotion: 'unknown', intensity: 0.3, keywords: ['미확인'] };
};

// 사용자 의도 분석 (더 정교하게)
const analyzeUserIntent = (text, context) => {
  const lowerText = text.toLowerCase();
  
  // 감정 표현 의도
  if (/(기분|감정|마음|심정|상태|느낌|생각)/.test(lowerText)) {
    if (/(어때|어떠|어떤|어떨까|괜찮|좋|나쁘)/.test(lowerText)) {
      return { type: 'emotion_inquiry', confidence: 0.9, context: 'emotion' };
    }
    if (/(나빠|좋아|슬퍼|기뻐|화나|짜증|스트레스)/.test(lowerText)) {
      return { type: 'emotion_expression', confidence: 0.95, context: 'emotion' };
    }
  }
  
  // 위로/공감 요청 의도
  if (/(위로|공감|이해|동정|힘|조언|도움|말|이야기)/.test(lowerText)) {
    if (/(해줘|해주|바라|원해|필요|좋겠|하고\s*싶)/.test(lowerText)) {
      return { type: 'comfort_request', confidence: 0.9, context: 'emotional_support' };
    }
  }
  
  // 정보 요청 의도 (더 정교하게)
  if (/(뉴스|날씨|시간|일정|날짜)/.test(lowerText)) {
    // 문맥을 고려한 의도 판단
    if (context && context.recentMessages && context.recentMessages.length > 0) {
      const lastMessage = context.recentMessages[context.recentMessages.length - 1];
      
      // 이전 메시지가 감정 표현이었다면, 정보 요청이 아닐 가능성
      if (lastMessage.intent && lastMessage.intent.type === 'emotion_expression') {
        if (/(때문에|그래서|그러니|그래서|그런데)/.test(lowerText)) {
          return { type: 'emotional_continuation', confidence: 0.8, context: 'emotion' };
        }
      }
    }
    
    // 일반적인 정보 요청
    if (/(어때|어떠|어떤|어떨까|알려|보여|확인)/.test(lowerText)) {
      return { type: 'information_request', confidence: 0.8, context: 'information' };
    }
  }
  
  // 대화 지속 의도
  if (/(그래서|그러면|그럼|그런데|근데|그리고|또|추가로|더|다른|다시|아까|그거|그것|그|이것|이거)/.test(lowerText)) {
    return { type: 'conversation_continuation', confidence: 0.9, context: 'conversation' };
  }
  
  // 인사/호칭 의도
  if (/(안녕|하이|반가워|고마워|감사|죄송|미안|부탁|부탁해)/.test(lowerText)) {
    return { type: 'greeting_gratitude', confidence: 0.8, context: 'social' };
  }
  
  return { type: 'general', confidence: 0.5, context: 'general' };
};

// 문맥 기반 응답 생성
const generateContextualResponse = async (userText, userIntent, context, openai) => {
  try {
    if (!openai) {
      // GPT 없이도 문맥 기반 응답 생성
      return generateRuleBasedResponse(userText, userIntent, context);
    }
    
    // GPT를 사용한 맥락적 응답
    const systemPrompt = `당신은 스마트 미러의 AI 비서입니다. 
사용자의 질문과 감정 상태를 정확히 파악하여 맥락에 맞는 답변을 제공하세요.

대화 규칙:
- 이전 대화 맥락을 반드시 고려하여 답변
- 사용자의 감정 상태에 공감하고 적절한 반응
- 정보 요청이 아닌 감정 표현에는 위로나 공감을 우선
- 같은 질문을 반복하지 말고 맥락에 맞는 응답
- 존댓말 사용, 2-3문장으로 간결하게

현재 대화 맥락: ${JSON.stringify(context, null, 2)}
사용자 의도: ${JSON.stringify(userIntent, null, 2)}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText }
    ];
    
    // 최근 대화 맥락 추가 (최대 3개)
    if (context.recentMessages && context.recentMessages.length > 0) {
      const recentContext = context.recentMessages.slice(-3);
      recentContext.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 200,
    });
    
    return completion.choices?.[0]?.message?.content?.trim() || '';
  } catch (error) {
    log.warn('맥락적 응답 생성 실패:', error.message);
    return generateRuleBasedResponse(userText, userIntent, context);
  }
};

// 규칙 기반 응답 생성 (GPT 실패 시)
const generateRuleBasedResponse = (userText, userIntent, context) => {
  const emotion = analyzeEmotion(userText);
  
  // 감정 표현에 대한 응답
  if (userIntent.type === 'emotion_expression') {
    if (emotion.emotion === 'negative') {
      if (userText.includes('뉴스')) {
        return '뉴스 때문에 기분이 안 좋으시군요. 특히 어떤 뉴스가 가장 마음에 걸리시나요? 함께 이야기해보면 어떨까요?';
      }
      if (userText.includes('날씨')) {
        return '날씨 때문에 기분이 안 좋으시군요. 날씨는 우리가 통제할 수 없는 부분이라 답답하실 것 같아요.';
      }
      return '기분이 안 좋으시군요. 무슨 일이 있었는지 이야기해보시겠어요? 함께 생각해보면 좋을 것 같아요.';
    }
    if (emotion.emotion === 'positive') {
      return '기분이 좋으시군요! 무엇이 그렇게 기쁘게 만드셨나요?';
    }
  }
  
  // 위로 요청에 대한 응답
  if (userIntent.type === 'comfort_request') {
    return '물론이에요. 언제든 말씀해주세요. 함께 생각해보고 해결책을 찾아보겠습니다.';
  }
  
  // 대화 지속에 대한 응답
  if (userIntent.type === 'conversation_continuation') {
    if (context.currentTopic === 'emotion') {
      return '계속해서 말씀해주세요. 듣고 있겠습니다.';
    }
    return '더 자세히 말씀해주세요.';
  }
  
  // 기본 응답
  return '무슨 말씀인지 더 자세히 설명해주시겠어요?';
};

// ========== 대화 컨텍스트 관리 시스템 ==========

class ConversationContext {
  constructor() {
    this.contexts = new Map();
    this.sessionTimeout = 30 * 60 * 1000;
    this.maxContextLength = 20;
  }

  getUserContext(userId = 'default') {
    if (!this.contexts.has(userId)) {
      this.contexts.set(userId, {
        messages: [],
        currentTopic: null,
        lastInteraction: Date.now(),
        userIntent: null,
        emotionHistory: [],
        conversationFlow: [],
        userPreferences: {},
        pendingActions: []
      });
    }
    return this.contexts.get(userId);
  }

  addMessage(userId, role, content, intent = null, emotion = null) {
    const context = this.getUserContext(userId);
    const message = {
      role,
      content,
      intent,
      emotion,
      timestamp: Date.now()
    };
    
    context.messages.push(message);
    context.lastInteraction = Date.now();
    
    // 감정 히스토리 업데이트
    if (emotion) {
      context.emotionHistory.push({
        ...emotion,
        timestamp: Date.now()
      });
      
      // 최근 10개 감정만 유지
      if (context.emotionHistory.length > 10) {
        context.emotionHistory.shift();
      }
    }
    
    // 현재 토픽 업데이트
    if (intent && intent.context) {
      context.currentTopic = intent.context;
    }
    
    // 컨텍스트 길이 제한
    if (context.messages.length > this.maxContextLength) {
      context.messages.shift();
    }
  }

  getContextSummary(userId) {
    const context = this.getUserContext(userId);
    return {
      currentTopic: context.currentTopic,
      userIntent: context.userIntent,
      recentMessages: context.messages.slice(-5),
      emotionHistory: context.emotionHistory.slice(-3),
      conversationFlow: context.conversationFlow.slice(-5),
      pendingActions: context.pendingActions
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [userId, context] of this.contexts.entries()) {
      if (now - context.lastInteraction > this.sessionTimeout) {
        this.contexts.delete(userId);
      }
    }
  }
}

// ========== 스마트 질문 분류 시스템 ==========

const classifyUserQuestion = async (userText, context, openai) => {
  try {
    if (!openai) {
      return classifyWithoutGPT(userText, context);
    }

    const systemPrompt = `사용자의 질문을 다음 카테고리 중 하나로 분류해주세요.
문맥을 고려하여 분류하세요.

1. weather - 날씨 관련 질문 (비, 눈, 온도, 날씨 등)
2. time - 시간 관련 질문 (몇 시, 현재 시간 등)
3. date - 날짜/요일 관련 질문 (오늘, 내일, 요일 등)
4. schedule - 일정 관련 질문 (일정, 스케줄, 미팅, 약속 등)
5. news - 뉴스 관련 질문
6. emotion - 감정 표현 또는 위로 요청
7. conversation - 대화 지속 또는 일반적인 대화
8. information - 정보 검색 요청
9. action - 액션 요청 (등록, 추가, 알림 등)

JSON 형태로 응답해주세요: {"type": "카테고리", "confidence": 0.0-1.0, "reason": "분류 이유"}`;

    const contextInfo = context ? JSON.stringify(context) : '{}';
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `사용자 질문: ${userText}\n대화 맥락: ${contextInfo}` }
      ],
      temperature: 0.1,
      max_tokens: 150,
    });

    const response = completion.choices?.[0]?.message?.content?.trim();
    if (response) {
      try {
        const result = JSON.parse(response);
        return result;
      } catch (e) {
        log.warn('질문 분류 JSON 파싱 실패:', e.message);
      }
    }
  } catch (error) {
    log.warn('질문 분류 실패:', error.message);
  }

  return classifyWithoutGPT(userText, context);
};

// GPT 없이 문맥 기반 분류
const classifyWithoutGPT = (userText, context) => {
  const lowerText = userText.toLowerCase();
  const emotion = analyzeEmotion(userText);
  const intent = analyzeUserIntent(userText, context);
  
  // 감정 표현 우선 분류
  if (intent.type === 'emotion_expression' || intent.type === 'comfort_request') {
    return { type: 'emotion', confidence: 0.95, reason: '감정 표현 또는 위로 요청' };
  }
  
  // 대화 지속
  if (intent.type === 'conversation_continuation') {
    return { type: 'conversation', confidence: 0.9, reason: '대화 지속 의도' };
  }
  
  // 문맥을 고려한 분류
  if (context && context.recentMessages && context.recentMessages.length > 0) {
    const lastMessage = context.recentMessages[context.recentMessages.length - 1];
    
    // 이전 메시지가 감정 표현이었다면
    if (lastMessage.intent && lastMessage.intent.type === 'emotion_expression') {
      if (/(뉴스|날씨|일정|시간)/.test(lowerText)) {
        // 감정과 관련된 맥락적 질문으로 분류
        return { type: 'emotion', confidence: 0.85, reason: '감정 맥락에서의 질문' };
      }
    }
  }
  
  // 일반적인 키워드 기반 분류
  if (/(날씨|비|눈|온도|더워|추워|우산)/.test(lowerText)) {
    return { type: 'weather', confidence: 0.8, reason: '날씨 관련 키워드' };
  }
  if (/(몇\s*시|현재\s*시간|지금\s*시간|time)/.test(lowerText)) {
    return { type: 'time', confidence: 0.9, reason: '시간 관련 키워드' };
  }
  if (/(오늘|내일|모레|요일|날짜)/.test(lowerText)) {
    return { type: 'date', confidence: 0.7, reason: '날짜 관련 키워드' };
  }
  if (/(일정|스케줄|미팅|약속|회의)/.test(lowerText)) {
    return { type: 'schedule', confidence: 0.8, reason: '일정 관련 키워드' };
  }
  if (/뉴스/.test(lowerText)) {
    return { type: 'news', confidence: 0.9, reason: '뉴스 관련 키워드' };
  }
  
  return { type: 'conversation', confidence: 0.6, reason: '일반적인 대화' };
};

// ========== 메인 대화 처리 함수 ==========

const processRecognizedCommand = async (text, dependencies) => {
  const {
    conversationContext,
    openai,
    broadcast,
    safeTTS,
    parseRelativeDate,
    formatKSTTime,
    formatKSTDate,
    processNewsQuery,
  } = dependencies;
  
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  
  log.info('스마트 대화 시스템 - 명령 처리 시작:', trimmed);
  
  const userId = 'default';
  let reply = '';
  
  try {
    // 대화 컨텍스트 가져오기
    const context = conversationContext.getUserContext(userId);
    const contextSummary = conversationContext.getContextSummary(userId);
    
    // 감정 및 의도 분석
    const emotion = analyzeEmotion(trimmed);
    const intent = analyzeUserIntent(trimmed, contextSummary);
    
    // 1단계: 스마트 질문 분류
    const questionClassification = await classifyUserQuestion(trimmed, contextSummary, openai);
    log.info(`질문 분류: ${questionClassification.type} (신뢰도: ${(questionClassification.confidence * 100).toFixed(1)}%, 이유: ${questionClassification.reason})`);
    
    // 2단계: 문맥을 고려한 응답 생성
    switch (questionClassification.type) {
      case 'emotion':
        // 감정 표현이나 위로 요청에 대한 응답
        reply = await generateContextualResponse(trimmed, intent, contextSummary, openai);
        break;
        
      case 'conversation':
        // 대화 지속이나 일반적인 대화
        reply = await generateContextualResponse(trimmed, intent, contextSummary, openai);
        break;
        
      case 'weather':
        try {
          const weatherData = await fetchWeatherData();
          reply = `현재 ${weatherData.name} ${Math.round(weatherData.main.temp)}도, ${weatherData.weather?.[0]?.description || ''}입니다.`;
        } catch {
          reply = '날씨 정보를 불러오지 못했습니다.';
        }
        break;
        
      case 'time':
        reply = `현재 시각은 ${formatKSTTime()}입니다.`;
        break;
        
      case 'date':
        try {
          const dateInfo = parseRelativeDate(trimmed);
          const lowerQuery = trimmed.toLowerCase();
          
          if (!dateInfo || !dateInfo.date) {
            const todayInfo = parseRelativeDate('오늘');
            if (todayInfo && todayInfo.date) {
              const weekday = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][todayInfo.date.getDay()];
              reply = `오늘은 ${weekday}입니다.`;
            } else {
              reply = '날짜 정보를 가져올 수 없습니다.';
            }
          } else if (/(요일|무슨\s*요일)/.test(lowerQuery)) {
            const weekday = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][dateInfo.date.getDay()];
            const dateText = getKoreanDateInfo(dateInfo).split(' (')[0];
            const particle = (dateText === '내일' || dateText === '오늘' || dateText === '어제') ? '은' : '는';
            reply = `${dateText}${particle} ${weekday}입니다.`;
          } else {
            reply = `${getKoreanDateInfo(dateInfo)}입니다.`;
          }
        } catch (error) {
          log.error('날짜 처리 실패:', error.message);
          reply = '날짜 정보를 처리하는 데 실패했습니다.';
        }
        break;
        
      case 'schedule':
        try {
          const dateInfo = parseRelativeDate(trimmed) || parseRelativeDate('오늘');
          const events = await fetchEventsForDay(dateInfo.date);
          if (events && events.length > 0) {
            const now = new Date();
            const currentTime = now.getTime();
            
            const sortedEvents = events.sort((a, b) => {
              const aTime = a.isAllDay ? 0 : new Date(a.start).getTime();
              const bTime = b.isAllDay ? 0 : new Date(b.start).getTime();
              return aTime - bTime;
            });
            
            const pastEvents = [];
            const upcomingEvents = [];
            const allDayEvents = [];
            
            sortedEvents.forEach(ev => {
              if (ev.isAllDay) {
                allDayEvents.push(ev);
              } else {
                const endTime = ev.end ? new Date(ev.end).getTime() : new Date(ev.start).getTime() + (60 * 60 * 1000);
                if (endTime <= currentTime) {
                  pastEvents.push(ev);
                } else {
                  upcomingEvents.push(ev);
                }
              }
            });
            
            let responseParts = [];
            
            if (allDayEvents.length > 0) {
              const allDayDescriptions = allDayEvents.map(ev => ev.summary);
              if (allDayDescriptions.length === 1) {
                responseParts.push(`하루종일 ${allDayDescriptions[0]} 일정이 있습니다`);
              } else {
                responseParts.push(`하루종일 ${allDayDescriptions.join(', ')} 일정이 있습니다`);
              }
            }
            
            if (pastEvents.length > 0) {
              const pastDescriptions = pastEvents.map(ev => {
                const time = formatKSTTimeFromISO(ev.start);
                return `${time} ${ev.summary}`;
              });
              if (pastDescriptions.length === 1) {
                responseParts.push(`${pastDescriptions[0]}는 이미 지났습니다`);
              } else {
                responseParts.push(`${pastDescriptions.join(', ')}는 이미 지났습니다`);
              }
            }
            
            if (upcomingEvents.length > 0) {
              const upcomingDescriptions = upcomingEvents.map(ev => {
                const time = formatKSTTimeFromISO(ev.start);
                return `${time} ${ev.summary}`;
              });
              if (upcomingDescriptions.length === 1) {
                responseParts.push(`앞으로 ${upcomingDescriptions[0]}가 남아있습니다`);
              } else {
                responseParts.push(`앞으로 ${upcomingDescriptions.join(', ')}가 남아있습니다`);
              }
            }
            
            if (responseParts.length === 1) {
              reply = responseParts[0] + '.';
            } else if (responseParts.length === 2) {
              reply = responseParts[0] + '이고, ' + responseParts[1] + '.';
            } else {
              reply = responseParts.slice(0, -1).join(', ') + '이고, ' + responseParts[responseParts.length - 1] + '.';
            }
          } else {
            reply = `${getKoreanDateInfo(dateInfo).split(' (')[0]} 등록된 일정이 없습니다.`;
          }
        } catch (error) {
          log.error('일정 처리 실패:', error.message);
          reply = '일정 정보를 처리하는 데 실패했습니다.';
        }
        break;
        
      case 'news':
        // 문맥을 고려한 뉴스 응답
        if (contextSummary.emotionHistory && contextSummary.emotionHistory.length > 0) {
          const lastEmotion = contextSummary.emotionHistory[contextSummary.emotionHistory.length - 1];
          if (lastEmotion.emotion === 'negative') {
            reply = '뉴스 때문에 기분이 안 좋으시군요. 하지만 뉴스는 단순한 정보일 뿐이에요. 기분 전환이 필요하시다면 다른 이야기를 해드릴까요?';
          } else {
            try {
              const newsRes = await processNewsQuery(trimmed);
              reply = newsRes.response || '뉴스 정보를 불러올 수 없습니다.';
            } catch {
              reply = '뉴스 정보를 가져오는 데 실패했습니다.';
            }
          }
        } else {
          try {
            const newsRes = await processNewsQuery(trimmed);
            reply = newsRes.response || '뉴스 정보를 불러올 수 없습니다.';
          } catch {
            reply = '뉴스 정보를 가져오는 데 실패했습니다.';
          }
        }
        break;
        
      default:
        // 기타 질문은 문맥 기반 응답
        reply = await generateContextualResponse(trimmed, intent, contextSummary, openai);
        break;
    }
    
    // 대화 컨텍스트에 메시지 추가
    conversationContext.addMessage(userId, 'user', trimmed, intent, emotion);
    conversationContext.addMessage(userId, 'assistant', reply, { type: 'response' });
    
    if (broadcast) {
      broadcast({ type: 'response', role: 'assistant', text: reply });
    }
    
    log.info('TTS 응답 시작:', reply);
    await safeTTS(reply, broadcast);
    log.info('대화 처리 완료');
    return reply;
    
  } catch (e) {
    log.error('명령 처리 오류:', e.message);
    reply = '요청을 처리하는 중 문제가 발생했습니다.';
    
    conversationContext.addMessage(userId, 'user', trimmed);
    conversationContext.addMessage(userId, 'assistant', reply);
    
    if (broadcast) {
      broadcast({ type: 'response', role: 'assistant', text: reply });
    }
    
    await safeTTS(reply, broadcast);
    return reply;
  }
};

// ========== 유틸리티 함수들 ==========

const getKSTNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));

const formatKSTTime = (date = new Date()) => {
  const targetDate = new Date(date);
  const hours = targetDate.getHours();
  const minutes = targetDate.getMinutes();
  const isAM = hours < 12;
  const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
  return `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;
};

const formatKSTDate = (date = new Date()) => {
  const targetDate = new Date(date);
  const year = targetDate.getFullYear();
  const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
  const day = targetDate.getDate().toString().padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
};

const parseRelativeDate = (text) => {
  const lowerText = text.toLowerCase().trim();
  
  const patterns = {
    today: /(오늘|금일|오늘날)/,
    yesterday: /(어제|작일)/,
    tomorrow: /(내일|다음날)/,
    dayAfterTomorrow: /(모레|글피)/,
    nextMonday: /(다음\s*월요일|월요일)/,
    nextTuesday: /(다음\s*화요일|화요일)/,
    nextWednesday: /(다음\s*수요일|수요일)/,
    nextThursday: /(다음\s*목요일|목요일)/,
    nextFriday: /(다음\s*금요일|금요일)/,
    nextSaturday: /(다음\s*토요일|토요일)/,
    nextSunday: /(다음\s*일요일|일요일)/,
    nextWeek: /(다음\s*주|다음주)/,
    thisWeek: /(이번\s*주|이번주|금주)/,
    nextMonth: /(다음\s*달|다음달|내달)/,
    thisMonth: /(이번\s*달|이번달|금월)/,
    hoursLater: /(\d{1,2})\s*시간\s*(뒤|후|후에)/,
    minutesLater: /(\d{1,2})\s*분\s*(뒤|후|후에)/,
    specificDate: /(\d{1,2})월\s*(\d{1,2})일/,
    specificDay: /(\d{1,2})일/
  };
  
  const now = getKSTNow();
  const result = {
    type: 'unknown',
    date: null,
    text: text,
    original: text
  };
  
  if (patterns.today.test(lowerText)) {
    result.type = 'today';
    result.date = new Date(now);
    return result;
  }
  
  if (patterns.yesterday.test(lowerText)) {
    result.type = 'yesterday';
    result.date = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return result;
  }
  
  if (patterns.tomorrow.test(lowerText)) {
    result.type = 'tomorrow';
    result.date = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return result;
  }
  
  if (patterns.dayAfterTomorrow.test(lowerText)) {
    result.type = 'dayAfterTomorrow';
    result.date = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    return result;
  }
  
  const hoursMatch = lowerText.match(patterns.hoursLater);
  const minutesMatch = lowerText.match(patterns.minutesLater);
  
  if (hoursMatch || minutesMatch) {
    let totalMs = 0;
    let timeDescription = '';
    
    if (hoursMatch) {
      const hours = parseInt(hoursMatch[1], 10);
      totalMs += hours * 60 * 60 * 1000;
      timeDescription += `${hours}시간`;
    }
    
    if (minutesMatch) {
      const minutes = parseInt(minutesMatch[1], 10);
      totalMs += minutes * 60 * 1000;
      timeDescription += `${minutes}분`;
    }
    
    result.type = 'timeLater';
    result.date = new Date(now.getTime() + totalMs);
    result.timeDescription = timeDescription;
    return result;
  }
  
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekdayPatterns = [
    patterns.nextSunday, patterns.nextMonday, patterns.nextTuesday, 
    patterns.nextWednesday, patterns.nextThursday, patterns.nextFriday, patterns.nextSaturday
  ];
  
  for (let i = 0; i < weekdayPatterns.length; i++) {
    if (weekdayPatterns[i].test(lowerText)) {
      const targetDay = i;
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      
      result.type = 'nextWeekday';
      result.date = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      result.weekday = weekdays[i];
      return result;
    }
  }
  
  if (patterns.nextWeek.test(lowerText)) {
    result.type = 'nextWeek';
    const nextMonday = new Date(now.getTime());
    const daysUntilMonday = (8 - now.getDay()) % 7;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    result.date = nextMonday;
    return result;
  }
  
  if (patterns.thisWeek.test(lowerText)) {
    result.type = 'thisWeek';
    const thisMonday = new Date(now.getTime());
    const daysSinceMonday = now.getDay() === 0 ? 6 : now.getDay() - 1;
    thisMonday.setDate(now.getDate() - daysSinceMonday);
    thisMonday.setHours(0, 0, 0, 0);
    result.date = thisMonday;
    return result;
  }
  
  const specificDateMatch = lowerText.match(patterns.specificDate);
  if (specificDateMatch) {
    const month = parseInt(specificDateMatch[1], 10) - 1;
    const day = parseInt(specificDateMatch[2], 10);
    const targetDate = new Date(now.getFullYear(), month, day);
    
    if (targetDate < now) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }
    
    result.type = 'specificDate';
    result.date = targetDate;
    return result;
  }
  
  const specificDayMatch = lowerText.match(patterns.specificDay);
  if (specificDayMatch) {
    const day = parseInt(specificDayMatch[1], 10);
    const targetDate = new Date(now.getFullYear(), now.getMonth(), day);
    
    if (targetDate < now) {
      targetDate.setMonth(targetDate.getMonth() + 1);
    }
    
    result.type = 'specificDay';
    result.date = targetDate;
    return result;
  }
  
  return result;
};

const getKoreanDateInfo = (dateInfo) => {
  if (!dateInfo || !dateInfo.date) return '';
  
  const date = dateInfo.date;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][date.getDay()];
  
  const now = getKSTNow();
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
  const isYesterday = date.toDateString() === new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString();
  
  if (isToday) {
    return `오늘 (${weekday})`;
  } else if (isTomorrow) {
    return `내일 (${weekday})`;
  } else if (isYesterday) {
    return `어제 (${weekday})`;
  } else {
    return `${year}년 ${month}월 ${day}일 (${weekday})`;
  }
};

module.exports = {
  ConversationContext,
  analyzeEmotion,
  analyzeUserIntent,
  generateContextualResponse,
  classifyUserQuestion,
  processRecognizedCommand,
  parseRelativeDate,
  getKoreanDateInfo,
  getKSTNow,
  formatKSTTime,
  formatKSTDate
};
