const axios = require('axios');
const { PORT } = require('./config');
const { log } = require('./logging');
const { fetchWeatherData } = require('./weather');

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
    const userIntent = analyzeUserIntent(trimmed);
    const contextSummary = conversationContext.getContextSummary(userId);
    
    conversationContext.addMessage(userId, 'user', trimmed, userIntent);
    
    // 루틴 진행 중인지 확인
    const currentRoutine = personalizedRoutine.getRoutineSummary(userId);
    if (currentRoutine && currentRoutine.remainingSteps.length > 0) {
      const currentStep = personalizedRoutine.getNextStep(userId);
      if (currentStep) {
        reply = await handleRoutineStep(userId, currentStep.id, trimmed, personalizedRoutine);
        if (reply) {
          conversationContext.addMessage(userId, 'assistant', reply);
          return reply;
        }
      }
    }
    
    // 루틴 시작 의도 처리
    if (userIntent.type === 'routine_start') {
      const routine = personalizedRoutine.startRoutine(userId, userIntent.routine);
      if (routine) {
        const firstStep = routine.steps[0];
        reply = `네, ${routine.name}을 시작하겠습니다. ${firstStep.question}`;
        conversationContext.setRoutineContext(userId, routine);
        conversationContext.addMessage(userId, 'assistant', reply);
        return reply;
      }
    }
    
    // 날씨 관련 후속 질문 처리
    if (userIntent.type === 'weather_umbrella') {
      try {
        const weatherData = await fetchWeatherData();
        const isRaining = /비|눈|소나기/.test(weatherData.weather?.[0]?.description || '');
        
        if (isRaining) {
          reply = '네, 오후에 소나기 예보가 있습니다. 우산을 챙기시는 것이 좋겠습니다.';
        } else {
          reply = '현재는 비 소식이 없습니다. 하지만 날씨는 변할 수 있으니 확인해보시는 것이 좋겠습니다.';
        }
        
        conversationContext.setCurrentTopic(userId, 'weather');
        conversationContext.addMessage(userId, 'assistant', reply);
        return reply;
      } catch (error) {
        log.warn('날씨 후속 질문 처리 실패:', error.message);
      }
    }
    
    // 맥락적 응답 시도
    if (contextSummary.recentMessages.length > 0) {
      const contextualReply = await generateContextualResponse(trimmed, userIntent, contextSummary, openai);
      if (contextualReply) {
        reply = contextualReply;
        conversationContext.addMessage(userId, 'assistant', reply);
        return reply;
      }
    }
    
    // 날짜 정보 파싱
    const dateInfo = parseRelativeDate(trimmed);
    
    // 맥락 기반 후속 질문 처리
    const currentTopic = contextSummary.currentTopic;
    const isFollowUpQuestion = await checkIfFollowUpQuestion(trimmed, currentTopic, userIntent);
    
    // 우선순위 기반 명령 처리
    // 1. 뉴스 관련 질문 (직접 언급하거나 후속 질문)
    if (/뉴스/.test(trimmed) || (isFollowUpQuestion && currentTopic === 'news')) {
      try {
        const newsRes = await processNewsQuery(trimmed);
        reply = newsRes.response || '뉴스 정보를 불러올 수 없습니다.';
      } catch {
        reply = '뉴스 정보를 가져오는 데 실패했습니다.';
      }
      conversationContext.setCurrentTopic(userId, 'news');
    }
    // 2. 날씨 관련 질문 (직접 언급하거나 후속 질문)
    else if (/날씨|온도|기온|춥|덥|비|눈/.test(trimmed) || (isFollowUpQuestion && currentTopic === 'weather')) {
      try {
        const weatherData = await fetchWeatherData();
        if (/(춥|덥|기온|온도)/.test(trimmed)) {
          const temp = Math.round(weatherData.main.temp);
          if (temp < 10) reply = `현재 ${temp}도로 춥습니다. 따뜻하게 입으세요.`;
          else if (temp > 25) reply = `현재 ${temp}도로 덥습니다. 시원하게 입으세요.`;
          else reply = `현재 ${temp}도로 적당한 날씨입니다.`;
        } else {
          reply = `현재 ${weatherData.name} ${Math.round(weatherData.main.temp)}도, ${weatherData.weather?.[0]?.description || ''}입니다.`;
        }
      } catch {
        reply = '날씨 정보를 불러오지 못했습니다.';
      }
      conversationContext.setCurrentTopic(userId, 'weather');
    }
    // 3. 시간 질문
    else if (/(몇\s*시|현재\s*시간|지금\s*시간|time)/i.test(trimmed)) {
      reply = `현재 시각은 ${formatKSTTime()}입니다.`;
    }
    // 4. 날짜/요일 질문
    else if (/(며칠|날짜|date|무슨\s*요일|요일)/i.test(trimmed)) {
      const now = new Date();
      const weekday = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][now.getDay()];
      reply = `오늘은 ${formatKSTDate()}입니다.`;
      if (/(요일)/.test(trimmed)) reply += ` ${weekday}입니다.`;
    }
    // 5. 맥락 기반 응답 시도 (이전 대화와 연결)
    else {
      // 먼저 맥락적 응답 시도
      const contextualReply = await generateContextualResponse(trimmed, userIntent, contextSummary, openai);
      if (contextualReply) {
        reply = contextualReply;
      } else {
        // 맥락이 없으면 일반 GPT 응답
        reply = await answerWithGPT(trimmed, contextSummary, openai);
      }
    }
    
    conversationContext.addMessage(userId, 'assistant', reply);
    personalizationSystem.recordInteraction(trimmed, reply);
    
    if (broadcast) {
      broadcast({ type: 'response', role: 'assistant', text: reply });
    }
    await safeTTS(reply, broadcast);
    return reply;
  } catch (e) {
    log.error('명령 처리 오류:', e.message);
    reply = '요청을 처리하는 중 문제가 발생했습니다.';
    
    conversationContext.addMessage(userId, 'assistant', reply);
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
  getWeekdayShortKorean
};
