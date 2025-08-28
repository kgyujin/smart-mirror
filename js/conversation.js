const axios = require('axios');
const { PORT } = require('./config');
const { log } = require('./logging');
const { fetchWeatherData } = require('./weather');
const { fetchTodayEvents, formatKSTTimeFromISO, fetchEventsForDay } = require('./calendar');

// 대화 컨텍스트 관리 시스템
class ConversationContext {
  constructor() {
    this.contexts = new Map(); // 사용자별 컨텍스트
    this.sessionTimeout = 5 * 60 * 1000; // 5분 세션 타임아웃
    this.maxContextLength = 10; // 최대 컨텍스트 길이
  }

  // 사용자 컨텍스트 가져오기
  getUserContext(userId = 'default') {
    if (!this.contexts.has(userId)) {
      this.contexts.set(userId, {
        messages: [],
        currentTopic: null,
        lastInteraction: Date.now(),
        userIntent: null,
        followUpQuestions: [],
        routineContext: null
      });
    }
    return this.contexts.get(userId);
  }

  // 메시지 추가
  addMessage(userId, role, content, intent = null) {
    const context = this.getUserContext(userId);
    const message = {
      role,
      content,
      intent,
      timestamp: Date.now()
    };
    
    context.messages.push(message);
    context.lastInteraction = Date.now();
    
    // 컨텍스트 길이 제한
    if (context.messages.length > this.maxContextLength) {
      context.messages.shift();
    }
    
    // 의도 업데이트
    if (intent) {
      context.userIntent = intent;
    }
  }

  // 현재 토픽 설정
  setCurrentTopic(userId, topic) {
    const context = this.getUserContext(userId);
    context.currentTopic = topic;
  }

  // 후속 질문 추가
  addFollowUpQuestion(userId, question) {
    const context = this.getUserContext(userId);
    context.followUpQuestions.push({
      question,
      timestamp: Date.now()
    });
  }

  // 루틴 컨텍스트 설정
  setRoutineContext(userId, routine) {
    const context = this.getUserContext(userId);
    context.routineContext = {
      ...routine,
      timestamp: Date.now()
    };
  }

  // 컨텍스트 정리 (오래된 세션)
  cleanup() {
    const now = Date.now();
    for (const [userId, context] of this.contexts.entries()) {
      if (now - context.lastInteraction > this.sessionTimeout) {
        this.contexts.delete(userId);
      }
    }
  }

  // 컨텍스트 요약
  getContextSummary(userId) {
    const context = this.getUserContext(userId);
    return {
      currentTopic: context.currentTopic,
      userIntent: context.userIntent,
      recentMessages: context.messages.slice(-3), // 최근 3개 메시지
      followUpQuestions: context.followUpQuestions.slice(-2), // 최근 2개 후속 질문
      routineContext: context.routineContext
    };
  }
}

// 개인 맞춤형 루틴 시스템
class PersonalizedRoutine {
  constructor() {
    this.routines = new Map(); // 사용자별 루틴
    this.routineTemplates = {
      morning: {
        name: '아침 루틴',
        steps: [
          { id: 'weather', question: '오늘 날씨는 어떠신가요?', priority: 'high' },
          { id: 'traffic', question: '교통 상황을 확인해드릴까요?', priority: 'medium' },
          { id: 'schedule', question: '오늘 일정을 확인해드릴까요?', priority: 'high' },
          { id: 'preparation', question: '준비해야 할 것이 있나요?', priority: 'medium' }
        ]
      },
      work: {
        name: '업무 루틴',
        steps: [
          { id: 'meetings', question: '오늘 미팅 일정을 확인해드릴까요?', priority: 'high' },
          { id: 'tasks', question: '진행 중인 업무가 있나요?', priority: 'medium' },
          { id: 'breaks', question: '휴식 시간을 잊지 마세요', priority: 'low' }
        ]
      },
      evening: {
        name: '저녁 루틴',
        steps: [
          { id: 'dinner', question: '저녁 식사 계획이 있으신가요?', priority: 'medium' },
          { id: 'relaxation', question: '오늘 하루는 어떠셨나요?', priority: 'low' },
          { id: 'tomorrow', question: '내일 준비할 것이 있나요?', priority: 'medium' }
        ]
      }
    };
  }

  // 루틴 시작
  startRoutine(userId, routineType) {
    const routine = this.routineTemplates[routineType];
    if (!routine) return null;

    const userRoutine = {
      type: routineType,
      name: routine.name,
      steps: [...routine.steps],
      currentStep: 0,
      completedSteps: [],
      startTime: Date.now()
    };

    this.routines.set(userId, userRoutine);
    return userRoutine;
  }

  // 다음 단계 가져오기
  getNextStep(userId) {
    const routine = this.routines.get(userId);
    if (!routine || routine.currentStep >= routine.steps.length) {
      return null;
    }
    return routine.steps[routine.currentStep];
  }

  // 단계 완료
  completeStep(userId, stepId, response) {
    const routine = this.routines.get(userId);
    if (!routine) return false;

    const currentStep = routine.steps[routine.currentStep];
    if (currentStep && currentStep.id === stepId) {
      routine.completedSteps.push({
        ...currentStep,
        response,
        completedAt: Date.now()
      });
      routine.currentStep++;
      return true;
    }
    return false;
  }

  // 루틴 완료 확인
  isRoutineComplete(userId) {
    const routine = this.routines.get(userId);
    return routine && routine.currentStep >= routine.steps.length;
  }

  // 루틴 요약
  getRoutineSummary(userId) {
    const routine = this.routines.get(userId);
    if (!routine) return null;

    return {
      name: routine.name,
      progress: `${routine.currentStep}/${routine.steps.length}`,
      completedSteps: routine.completedSteps,
      remainingSteps: routine.steps.slice(routine.currentStep)
    };
  }
}

// ========== 사용자 의도 분석 및 대화 처리 ==========
const analyzeUserIntent = (text) => {
  const lowerText = text.toLowerCase();
  
  // 루틴 시작 의도
  if (/(출근|등교|학교|회사|일|업무).*(준비|시작|시작하|시작할)/.test(lowerText)) {
    return { type: 'routine_start', routine: 'morning', confidence: 0.9 };
  }
  if (/(업무|일|회사).*(시작|시작하|시작할)/.test(lowerText)) {
    return { type: 'routine_start', routine: 'work', confidence: 0.8 };
  }
  if (/(저녁|밤|집|퇴근).*(준비|시작|시작하|시작할)/.test(lowerText)) {
    return { type: 'routine_start', routine: 'evening', confidence: 0.8 };
  }
  
  // 날씨 관련 의도
  if (/(날씨|기온|온도|비|눈|맑음|우산)/.test(lowerText)) {
    if (/(우산|갖고|챙겨|필요)/.test(lowerText)) {
      return { type: 'weather_umbrella', confidence: 0.9 };
    }
    if (/(어떠|어떤|어때)/.test(lowerText)) {
      return { type: 'weather_general', confidence: 0.8 };
    }
    return { type: 'weather_general', confidence: 0.7 };
  }
  
  // 일정 관련 의도
  if (/(일정|스케줄|미팅|약속|회의)/.test(lowerText)) {
    return { type: 'schedule', confidence: 0.8 };
  }
  
  // 후속 질문 의도
  if (/(그럼|그러면|그래서|그렇다면|그런데|근데)/.test(lowerText)) {
    return { type: 'follow_up', confidence: 0.7 };
  }
  
  return { type: 'general', confidence: 0.5 };
};

const generateContextualResponse = async (userText, userIntent, contextSummary, openai) => {
  try {
    if (openai) {
      const system = `당신은 스마트 미러의 AI 비서입니다. 
사용자의 질문에 맥락을 고려하여 자연스럽고 도움이 되는 답변을 제공하세요.

대화 규칙:
- 이전 대화 맥락을 고려하여 답변
- 후속 질문이 자연스럽게 이어지도록 함
- 구체적이고 실용적인 정보 제공
- 존댓말 사용
- 2-3문장 이내로 간결하게`;

      const user = `사용자 질문: ${userText}
사용자 의도: ${JSON.stringify(userIntent)}
대화 맥락: ${JSON.stringify(contextSummary)}

맥락에 맞는 답변을 생성해주세요.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.7,
        max_tokens: 150,
      });
      
      return completion.choices?.[0]?.message?.content?.trim() || '';
    }
  } catch (error) {
    log.warn('맥락적 응답 생성 실패:', error.message);
  }
  
  return null;
};

// 후속 질문인지 판별하는 함수
const checkIfFollowUpQuestion = async (text, currentTopic, userIntent) => {
  if (!currentTopic) return false;
  
  // 명확한 주제 전환 키워드가 있으면 후속 질문이 아님
  const topicChangeKeywords = ['날씨', '뉴스', '시간', '날짜', '일정', '캘린더'];
  const hasTopicChange = topicChangeKeywords.some(keyword => text.includes(keyword));
  
  if (hasTopicChange && !text.includes(currentTopic)) return false;
  
  // 후속 질문을 나타내는 패턴들
  const followUpPatterns = [
    /^(그럼|그러면|그래서|그리고|또|추가로|더|다른|다시|아까|그거|그것|그|이것|이거)/,
    /^(어떻게|왜|언제|어디서|뭐|무엇|누가|얼마나)/,
    /^(맞아|맞네|그렇구나|아|오|우와|진짜|정말)/,
    /(어때|어떨까|괜찮을까|좋을까|나쁠까)$/,
    /(더|추가|또|그리고|아직)(\s+\w+)?$/
  ];
  
  return followUpPatterns.some(pattern => pattern.test(text.trim()));
};

const handleRoutineStep = async (userId, stepId, userResponse, personalizedRoutine) => {
  const routine = personalizedRoutine.getRoutineSummary(userId);
  if (!routine) return null;
  
  personalizedRoutine.completeStep(userId, stepId, userResponse);
  
  const nextStep = personalizedRoutine.getNextStep(userId);
  if (nextStep) {
    return `네, 알겠습니다. ${nextStep.question}`;
  } else {
    const summary = generateRoutineSummary(routine);
    return `루틴이 완료되었습니다. ${summary}`;
  }
};

const generateRoutineSummary = (routine) => {
  const completedCount = routine.completedSteps.length;
  const totalCount = routine.completedSteps.length + routine.remainingSteps.length;
  
  if (completedCount === 0) {
    return '아직 진행된 단계가 없습니다.';
  }
  
  const summary = routine.completedSteps.map(step => {
    switch (step.id) {
      case 'weather': return '날씨 정보를 확인했습니다';
      case 'traffic': return '교통 상황을 확인했습니다';
      case 'schedule': return '일정을 확인했습니다';
      case 'preparation': return '준비사항을 점검했습니다';
      default: return `${step.question}에 대한 답변을 받았습니다`;
    }
  }).join(', ');
  
  return `${summary}. 총 ${completedCount}/${totalCount} 단계가 완료되었습니다.`;
};

// 메인 대화 처리 함수
const processRecognizedCommand = async (text, dependencies) => {
  const {
    conversationContext,
    personalizedRoutine,
    personalizationSystem,
    openai,
    broadcast,
    safeTTS,
    parseRelativeDate,
    isPureDateQuery,
    formatKSTTime,
    formatKSTDate,
    processNewsQuery
  } = dependencies;
  
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  log.info('명령 처리:', trimmed);
  
  const userId = 'default';
  let reply = '';
  
  try {
    // backup 파일의 간단하고 효과적인 방식
    // 1. 뉴스 관련 질문
    if (/뉴스/.test(trimmed)) {
      try {
        const newsRes = await processNewsQuery(trimmed);
        reply = newsRes.response || '뉴스 정보를 불러올 수 없습니다.';
      } catch {
        reply = '뉴스 정보를 가져오는 데 실패했습니다.';
      }
    }
    // 2. 날씨 관련 질문
    else if (/날씨/.test(trimmed)) {
      try {
        const weatherData = await fetchWeatherData();
        reply = `현재 ${weatherData.name} ${Math.round(weatherData.main.temp)}도, ${weatherData.weather?.[0]?.description || ''}입니다.`;
      } catch {
        reply = '날씨 정보를 불러오지 못했습니다.';
      }
    }
    // 3. 시간 질문
    else if (/(몇\s*시|현재\s*시간|지금\s*시간|time)/i.test(trimmed)) {
      reply = `현재 시각은 ${formatKSTTime()}입니다.`;
    }
    // 4. 날짜/요일/일정 관련 질문 (상대적 날짜 처리 포함)
    else if (isPureDateQuery(trimmed)) {
      try {
        // 상대적 날짜 파싱
        const dateInfo = parseRelativeDate(trimmed);
        const lowerQuery = trimmed.toLowerCase();
        
        // 요일 질문인 경우
        if (/(요일|무슨\s*요일)/.test(lowerQuery)) {
          const weekday = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][dateInfo.date.getDay()];
          reply = `${getKoreanDateInfo(dateInfo).split(' (')[0]}는 ${weekday}입니다.`;
        }
        // 시간 질문인 경우
        else if (/(몇\s*시|시간|time)/.test(lowerQuery)) {
          const hours = dateInfo.date.getHours();
          const minutes = dateInfo.date.getMinutes();
          const isAM = hours < 12;
          const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
          const timeStr = `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;
          reply = `${getKoreanDateInfo(dateInfo).split(' (')[0]}는 ${timeStr}입니다.`;
        }
        // 일정 질문인 경우
        else if (/(일정|스케줄|캘린더|미팅|회의|약속|알려\s*줘)/.test(lowerQuery)) {
          const events = await fetchEventsForDay(dateInfo.date);
          if (events && events.length > 0) {
            const now = new Date();
            const currentTime = now.getTime();
            
            // 모든 일정을 시간순으로 정렬
            const sortedEvents = events.sort((a, b) => {
              const aTime = a.isAllDay ? 0 : new Date(a.start).getTime();
              const bTime = b.isAllDay ? 0 : new Date(b.start).getTime();
              return aTime - bTime;
            });
            
            // 지난 일정과 남은 일정 분류
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
            
            // 자연스러운 응답 구성
            let responseParts = [];
            
            // 하루종일 일정이 있으면 먼저 언급
            if (allDayEvents.length > 0) {
              const allDayDescriptions = allDayEvents.map(ev => ev.summary);
              if (allDayDescriptions.length === 1) {
                responseParts.push(`하루종일 ${allDayDescriptions[0]} 일정이 있습니다`);
              } else {
                responseParts.push(`하루종일 ${allDayDescriptions.join(', ')} 일정이 있습니다`);
              }
            }
            
            // 지난 일정이 있으면 언급
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
            
            // 남은 일정이 있으면 언급
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
            
            // 응답 조합 (자연스러운 문장 구성)
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
        }
        // 일반 날짜 질문인 경우
        else {
          reply = `${getKoreanDateInfo(dateInfo)}입니다.`;
        }
      } catch (error) {
        log.error('날짜/일정 처리 실패:', error.message);
        reply = '요청을 처리하는 데 실패했습니다.';
      }
    }
    // 5. 일반 대화는 GPT에 위임
    else {
      reply = await answerWithGPT(trimmed, {}, openai);
    }
    
    // 개인화 시스템에 상호작용 기록
    personalizationSystem.recordInteraction(trimmed, reply);
    
    if (broadcast) {
      broadcast({ type: 'response', role: 'assistant', text: reply });
    }
    await safeTTS(reply, broadcast);
    return reply;
  } catch (e) {
    log.error('명령 처리 오류:', e.message);
    reply = '요청을 처리하는 중 문제가 발생했습니다.';
    
    personalizationSystem.recordInteraction(trimmed, reply);
    
    if (broadcast) {
      broadcast({ type: 'response', role: 'assistant', text: reply });
    }
    await safeTTS(reply, broadcast);
    return reply;
  }
};

// ========== 유틸리티 함수들 ==========
const composeWithOpenAI = async (facts, instruction, openai) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: facts },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });
    return completion.choices?.[0]?.message?.content?.trim() || '';
  } catch (e) {
    log.warn('OpenAI 구성 실패:', e.message);
    return '';
  }
};

const sanitizeAssistantText = (text) => {
  return text
    .replace(/[\*\#\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const getWeekdayShortKorean = (dateLike) => ['일','월','화','수','목','금','토'][new Date(dateLike).getDay()];

// ========== 상대적 날짜 처리 함수들 ==========
const getKSTNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));

const parseRelativeDate = (text) => {
  const lowerText = text.toLowerCase().trim();
  
  // 상대적 날짜 패턴 매칭
  const patterns = {
    // 오늘
    today: /(오늘|금일|오늘날)/,
    
    // 어제/내일/모레
    yesterday: /(어제|작일)/,
    tomorrow: /(내일|다음날)/,
    dayAfterTomorrow: /(모레|글피)/,
    
    // 요일 기반
    nextMonday: /(다음\s*월요일|월요일)/,
    nextTuesday: /(다음\s*화요일|화요일)/,
    nextWednesday: /(다음\s*수요일|수요일)/,
    nextThursday: /(다음\s*목요일|목요일)/,
    nextFriday: /(다음\s*금요일|금요일)/,
    nextSaturday: /(다음\s*토요일|토요일)/,
    nextSunday: /(다음\s*일요일|일요일)/,
    
    // 주 단위
    nextWeek: /(다음\s*주|다음주)/,
    thisWeek: /(이번\s*주|이번주|금주)/,
    
    // 월 단위
    nextMonth: /(다음\s*달|다음달|내달)/,
    thisMonth: /(이번\s*달|이번달|금월)/,
    
    // 시간 단위
    hoursLater: /(\d{1,2})\s*시간\s*(뒤|후|후에)/,
    minutesLater: /(\d{1,2})\s*분\s*(뒤|후|후에)/,
    
    // 특정 날짜
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
  
  // 오늘
  if (patterns.today.test(lowerText)) {
    result.type = 'today';
    result.date = new Date(now);
    return result;
  }
  
  // 어제
  if (patterns.yesterday.test(lowerText)) {
    result.type = 'yesterday';
    result.date = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return result;
  }
  
  // 내일
  if (patterns.tomorrow.test(lowerText)) {
    result.type = 'tomorrow';
    result.date = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return result;
  }
  
  // 모레
  if (patterns.dayAfterTomorrow.test(lowerText)) {
    result.type = 'dayAfterTomorrow';
    result.date = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    return result;
  }
  
  // 시간 단위
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
  
  // 요일 기반
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
      
      // 다음 주로 설정
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      
      result.type = 'nextWeekday';
      result.date = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      result.weekday = weekdays[i];
      return result;
    }
  }
  
  // 주 단위
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
  
  // 특정 날짜 (이번 달)
  const specificDateMatch = lowerText.match(patterns.specificDate);
  if (specificDateMatch) {
    const month = parseInt(specificDateMatch[1], 10) - 1; // 0-based
    const day = parseInt(specificDateMatch[2], 10);
    const targetDate = new Date(now.getFullYear(), month, day);
    
    // 과거 날짜면 다음 해로 설정
    if (targetDate < now) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }
    
    result.type = 'specificDate';
    result.date = targetDate;
    return result;
  }
  
  // 특정 일 (이번 달)
  const specificDayMatch = lowerText.match(patterns.specificDay);
  if (specificDayMatch) {
    const day = parseInt(specificDayMatch[1], 10);
    const targetDate = new Date(now.getFullYear(), now.getMonth(), day);
    
    // 과거 날짜면 다음 달로 설정
    if (targetDate < now) {
      targetDate.setMonth(targetDate.getMonth() + 1);
    }
    
    result.type = 'specificDay';
    result.date = targetDate;
    return result;
  }
  
  return result;
};

// 날짜 정보를 한국어로 표현
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

// 순수한 날짜/시간 질문인지 판별
const isPureDateQuery = (query) => {
  const lowerQuery = query.toLowerCase();
  
  // 다른 주제와 혼재된 질문 제외
  const excludeKeywords = [
    '뉴스', '날씨', '음악', '노래', '영화', '드라마', '게임', '쇼핑', '맛집', '레스토랑',
    '운동', '헬스', '요리', '레시피', '여행', '호텔', '항공', '버스', '지하철', '택시',
    '은행', '주식', '투자', '쇼핑몰', '마트', '편의점', '병원', '약국', '학교', '학원'
  ];
  
  // 제외 키워드가 포함된 경우 순수한 날짜 질문이 아님
  if (excludeKeywords.some(keyword => lowerQuery.includes(keyword))) {
    return false;
  }
  
  // 날짜/시간 관련 키워드가 명확히 포함된 경우만
  const dateKeywords = [
    '일정', '스케줄', '캘린더', '약속', '행사', '시간', '몇 시', '날짜', '며칠', '요일',
    '내일', '모레', '오늘', '어제', '다음 주', '이번 주', '시간 후', '분 후'
  ];
  
  return dateKeywords.some(keyword => lowerQuery.includes(keyword));
};

// GPT 기반 일반 대화 (맥락 포함)
const answerWithGPT = async (userText, extraContext = {}, openai) => {
  try {
    const text = (userText || '').toLowerCase();
    
    if (!openai) return 'GPT API 키가 설정되지 않았습니다.';
    
    // 맥락 정보 구성
    const contextInfo = extraContext.recentMessages || [];
    const currentTopic = extraContext.currentTopic;
    
    let systemPrompt = '당신은 한국어 스마트 미러 비서입니다. 간결하고 실용적으로 답변하세요. 1-2문장으로 답변.';
    
    if (currentTopic) {
      systemPrompt += `\n현재 대화 주제: ${currentTopic}`;
    }
    
    if (contextInfo.length > 0) {
      systemPrompt += '\n이전 대화를 참고하여 자연스럽게 연결된 답변을 하세요.';
    }
    
    const messages = [{ role: 'system', content: systemPrompt }];
    
    // 최근 대화 맥락 추가 (최대 4개)
    if (contextInfo.length > 0) {
      const recentContext = contextInfo.slice(-4);
      recentContext.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }
    
    // 현재 사용자 질문 추가
    messages.push({ role: 'user', content: userText });
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.4,
      max_tokens: 150,
    });
    
    const raw = completion.choices?.[0]?.message?.content?.trim() || '';
    return raw || '요청을 이해하지 못했습니다.';
  } catch (e) {
    log.error('GPT 대화 오류:', e.message);
    return '응답 생성에 실패했습니다.';
  }
};

module.exports = {
  ConversationContext,
  PersonalizedRoutine,
  analyzeUserIntent,
  generateContextualResponse,
  handleRoutineStep,
  generateRoutineSummary,
  processRecognizedCommand,
  answerWithGPT,
  composeWithOpenAI,
  sanitizeAssistantText,
  getWeekdayShortKorean,
  parseRelativeDate,
  getKoreanDateInfo,
  isPureDateQuery,
  getKSTNow
};
