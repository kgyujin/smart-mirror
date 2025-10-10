const axios = require('axios');
const { log } = require('./logging');

// ========== 감정 분석 시스템 ==========

const analyzeEmotion = (text) => {
  const lowerText = text.toLowerCase();
  
  const emotionPatterns = {
    happy: {
      pattern: /(좋아|행복|즐거워|신나|기쁘|만족|감사|사랑)/,
      intensity: 0.8
    },
    sad: {
      pattern: /(슬퍼|우울|짜증|걱정|힘들|지침)/,
      intensity: 0.7
    },
    angry: {
      pattern: /(화나|짜증|분노|답답|짜증나)/,
      intensity: 0.9
    },
    fearful: {
      pattern: /(무서워|불안|걱정|두려워|겁나)/,
      intensity: 0.6
    },
    neutral: {
      pattern: /(보통|괜찮|그냥|평범|무덤덤)/,
      intensity: 0.5
    }
  };

  let maxEmotion = 'neutral';
  let maxIntensity = 0;
  const probabilities = {};

  // 각 감정에 대한 확률 계산
  for (const [emotion, data] of Object.entries(emotionPatterns)) {
    const matches = (lowerText.match(data.pattern) || []).length;
    const probability = matches ? data.intensity * (matches / lowerText.split(' ').length) : 0;
    probabilities[emotion] = probability;

    if (probability > maxIntensity) {
      maxIntensity = probability;
      maxEmotion = emotion;
    }
  }

  return {
    emotion: maxEmotion,
    probability: probabilities,
    intensity: maxIntensity
  };
};

const combineEmotions = (textEmotion, audioEmotion) => {
  const emotions = ['happy', 'sad', 'angry', 'fearful', 'neutral'];
  const combinedProbabilities = {};
  
  // 각 감정에 대한 확률 합치기 (음성:텍스트 = 7:3)
  for (const emotion of emotions) {
    combinedProbabilities[emotion] = (
      (textEmotion.probability[emotion] || 0) * 0.3 +
      (audioEmotion.probability[emotion] || 0) * 0.7
    );
  }
  
  // 최대 확률의 감정 찾기
  let maxEmotion = 'neutral';
  let maxProbability = 0;
  
  for (const [emotion, probability] of Object.entries(combinedProbabilities)) {
    if (probability > maxProbability) {
      maxProbability = probability;
      maxEmotion = emotion;
    }
  }
  
  return {
    emotion: maxEmotion,
    probability: combinedProbabilities,
    intensity: maxProbability
  };
};

// ========== 대화 처리 시스템 ==========

const processUserInput = async (input, emotionData, openaiClient) => {
  try {
    // 입력 텍스트 감정 분석
    const textEmotion = analyzeEmotion(input);
    
    // 음성과 텍스트 감정 분석 결과 합치기
    const combinedEmotionData = {
      emotion: emotionData.emotion,
      probability: {
        happy: emotionData.probability.happy * 0.7 + (textEmotion.probability.happy || 0) * 0.3,
        sad: emotionData.probability.sad * 0.7 + (textEmotion.probability.sad || 0) * 0.3,
        angry: emotionData.probability.angry * 0.7 + (textEmotion.probability.angry || 0) * 0.3,
        fearful: emotionData.probability.fearful * 0.7 + (textEmotion.probability.fearful || 0) * 0.3,
        neutral: emotionData.probability.neutral * 0.7 + (textEmotion.probability.neutral || 0) * 0.3
      }
    };
    
    // GPT 시스템 프롬프트 작성
    const systemPrompt = `당신은 스마트 미러의 감정적이고 도움이 되는 AI 어시스턴트입니다.

사용자 정보:
- 현재 감정: ${combinedEmotionData.emotion}
- 감정 데이터: ${JSON.stringify(combinedEmotionData.probability)}

대화 지침:
1. 감정 기반 응답:
   - 사용자의 감정을 이해하고 공감하는 대화체
   - 현재 감정에 따른 적절한 톤과 어조 사용
   - 감정에 따른 맞춤형 공감과 지원

2. 실질적 도움:
   - 사용자의 감정과 상황에 맞는 구체적 제안
   - 실행 가능한 해결책과 조언
   - 감정 관리를 위한 실용적 팁 제공
   - 상황 개선을 위한 단계별 가이드

3. 맥락 인식:
   - 시간대별 맞춤 활동 추천
   - 날씨를 고려한 기분 전환 방법
   - 일정을 고려한 스트레스 관리 팁

4. 대화 형식:
   - 따뜻하고 친근한 말투
   - 짧고 명확한 응답
   - 구체적이고 실행 가능한 제안

5. 감정별 특화 응답:
   - 기쁨: 긍정적 감정 강화와 지속 방법
   - 슬픔: 위로와 격려, 기분 전환 방법
   - 분노: 감정 조절과 건설적 해결 방법
   - 불안: 안정감 제공과 불안 해소 방법
   - 중립: 상황에 따른 적절한 감정 유도`;

    // GPT 응답 생성
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return {
      response: completion.choices[0].message.content,
      emotion: combinedEmotionData
    };
  } catch (error) {
    log.error('사용자 입력 처리 오류:', error);
    throw error;
  }
};

// ========== 대화 문맥 관리 시스템 ==========

class ConversationContext {
  constructor() {
    this.contexts = new Map();
    this.maxContextLength = 10;
    this.sessionTimeout = 1000 * 60 * 30; // 30분 세션 타임아웃
  }

  // 새로운 컨텍스트 생성 또는 기존 컨텍스트 가져오기
  getOrCreateContext(userId) {
    if (!this.contexts.has(userId)) {
      this.contexts.set(userId, {
        messages: [],
        currentTopic: null,
        emotionHistory: [],
        lastInteraction: Date.now(),
        conversationFlow: [],
        pendingActions: []
      });
    }
    return this.contexts.get(userId);
  }

  // 메시지 추가
  addMessage(userId, role, content) {
    const context = this.getOrCreateContext(userId);
    context.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    context.lastInteraction = Date.now();

    // 컨텍스트 크기 제한
    if (context.messages.length > this.maxContextLength) {
      context.messages.shift();
    }
  }

  // 감정 추가
  addEmotion(userId, emotion) {
    const context = this.getOrCreateContext(userId);
    if (!context.emotionHistory) {
      context.emotionHistory = [];
    }
    
    context.emotionHistory.push({
      emotion: emotion.emotion,
      intensity: emotion.intensity,
      timestamp: emotion.timestamp || Date.now()
    });

    if (context.emotionHistory.length > 10) {
      context.emotionHistory.shift();
    }
  }

  // 컨텍스트 요약 가져오기
  getContextSummary(userId) {
    const context = this.getOrCreateContext(userId);
    return {
      currentTopic: context.currentTopic,
      recentMessages: context.messages.slice(-5),
      emotionHistory: context.emotionHistory.slice(-3),
      conversationFlow: context.conversationFlow.slice(-5),
      pendingActions: context.pendingActions
    };
  }

  // 세션 타임아웃 체크 및 정리
  cleanup() {
    const now = Date.now();
    for (const [userId, context] of this.contexts.entries()) {
      if (now - context.lastInteraction > this.sessionTimeout) {
        this.contexts.delete(userId);
      }
    }
  }
}

// 감정 관리 시스템
const EmotionManager = {
  currentEmotionState: {
    emotion: 'neutral',
    intensity: 0.5,
    timestamp: Date.now()
  },

  // 감정 상태 업데이트
  updateEmotionState(emotion, intensity) {
    this.currentEmotionState = {
      emotion,
      intensity,
      timestamp: Date.now()
    };
  },

  // 현재 감정 상태 조회
  getCurrentEmotionState() {
    return this.currentEmotionState;
  }
};

// ========== 명령 처리 시스템 ==========

const processRecognizedCommand = async (command, dependencies, emotionData = null) => {
  try {
    log.info('명령 처리 시작:', command);
    
    // 기본 감정 데이터 설정
    if (!emotionData) {
      emotionData = {
        emotion: 'neutral',
        intensity: 0.5,
        confidence: 0.5
      };
    }

    // 감정 상태 업데이트
    EmotionManager.updateEmotionState(emotionData.emotion, emotionData.intensity);

    // 텍스트 감정 분석
    const textEmotion = analyzeEmotion(command);
    
    // 음성과 텍스트 감정 합성
    const combinedEmotion = combineEmotions(textEmotion, {
      emotion: emotionData.emotion,
      probability: {
        [emotionData.emotion]: emotionData.confidence || 0.5,
        neutral: 1 - (emotionData.confidence || 0.5)
      }
    });

    let response;
    const lowerCommand = command.toLowerCase();

    // 뉴스 관련 명령 처리
    if (lowerCommand.includes('뉴스') || lowerCommand.includes('소식')) {
      response = await handleNewsCommand(command, dependencies, combinedEmotion);
    }
    // 날씨 관련 명령 처리  
    else if (lowerCommand.includes('날씨') || lowerCommand.includes('기온') || lowerCommand.includes('온도')) {
      response = await handleWeatherCommand(command, dependencies, combinedEmotion);
    }
    // 시간 관련 명령 처리
    else if (lowerCommand.includes('시간') || lowerCommand.includes('몇 시')) {
      const currentTime = formatKSTTime();
      response = {
        response: `현재 시간은 ${currentTime}입니다.`,
        emotion: combinedEmotion
      };
    }
    // 날짜 관련 명령 처리
    else if (lowerCommand.includes('날짜') || lowerCommand.includes('몇 일') || lowerCommand.includes('며칠')) {
      const currentDate = formatKSTDate();
      response = {
        response: `오늘은 ${currentDate}입니다.`,
        emotion: combinedEmotion
      };
    }
    // 일정 관련 명령 처리
    else if (lowerCommand.includes('일정') || lowerCommand.includes('약속') || lowerCommand.includes('스케줄')) {
      response = await handleCalendarCommand(command, dependencies, combinedEmotion);
    }
    // 기타 명령은 기존 방식으로 처리 (감정을 고려한 GPT 응답)
    else {
      const openaiClient = dependencies && dependencies.openai;
      if (!openaiClient) {
        response = {
          response: '죄송합니다. AI 응답 서비스를 사용할 수 없습니다.',
          emotion: combinedEmotion
        };
      } else {
        response = await processUserInput(command, combinedEmotion, openaiClient);
      }
    }
    
    // TTS로 응답
    if (dependencies && dependencies.safeTTS) {
      await dependencies.safeTTS(response.response);
    }

    // WebSocket으로 응답 브로드캐스트 (자막 표시용)
    if (dependencies && dependencies.broadcast) {
      dependencies.broadcast({
        type: 'assistant_response',
        text: response.response,
        emotion: response.emotion,
        timestamp: Date.now(),
        display_text: response.response, // 자막 표시용
        command: command // 원본 명령어
      });
      
      // 별도로 자막 표시 이벤트 전송
      dependencies.broadcast({
        type: 'display_subtitle',
        text: response.response,
        duration: 5000 // 5초간 표시
      });
    }

    return response;
  } catch (error) {
    log.error('명령 처리 중 오류:', error);
    
    const errorResponse = '죄송합니다. 요청을 처리하는 중에 문제가 발생했습니다.';
    
    // 오류 응답도 TTS로 재생
    if (dependencies && dependencies.safeTTS) {
      await dependencies.safeTTS(errorResponse);
    }

    // 오류 응답 브로드캐스트
    if (dependencies && dependencies.broadcast) {
      dependencies.broadcast({
        type: 'assistant_response',
        text: errorResponse,
        emotion: { emotion: 'neutral', intensity: 0.5 },
        timestamp: Date.now(),
        display_text: errorResponse
      });
      
      // 자막 표시
      dependencies.broadcast({
        type: 'display_subtitle',
        text: errorResponse,
        duration: 3000
      });
    }

    return {
      response: errorResponse,
      emotion: { emotion: 'neutral', intensity: 0.5 }
    };
  }
};

// ========== 기능별 핸들러 함수들 ==========

// 뉴스 명령 처리
const handleNewsCommand = async (command, dependencies, emotion) => {
  try {
    log.info('뉴스 명령 처리:', command);
    
    // 기존 뉴스 처리 함수 사용
    if (dependencies && dependencies.processNewsQuery) {
      const newsResult = await dependencies.processNewsQuery(command);
      
      // 감정에 따른 뉴스 소개 문구 추가
      let emotionPrefix = '';
      if (emotion.emotion === 'sad') {
        emotionPrefix = '기분이 좋지 않으신 것 같아요. 희망적인 소식들을 위주로 알려드릴게요. ';
      } else if (emotion.emotion === 'happy') {
        emotionPrefix = '좋은 기분이시네요! 오늘의 주요 소식들을 알려드릴게요. ';
      }
      
      return {
        response: emotionPrefix + (newsResult.response || newsResult),
        emotion: emotion
      };
    }
    
    return {
      response: '뉴스 서비스를 사용할 수 없습니다.',
      emotion: emotion
    };
  } catch (error) {
    log.error('뉴스 처리 오류:', error);
    return {
      response: '뉴스를 가져오는 중 오류가 발생했습니다.',
      emotion: emotion
    };
  }
};

// 날씨 명령 처리
const handleWeatherCommand = async (command, dependencies, emotion) => {
  try {
    log.info('날씨 명령 처리:', command);
    
    // 기존 날씨 처리 로직 (임시로 간단한 응답)
    let emotionPrefix = '';
    if (emotion.emotion === 'sad') {
      emotionPrefix = '기분이 안 좋으시군요. ';
    } else if (emotion.emotion === 'happy') {
      emotionPrefix = '좋은 하루네요! ';
    }
    
    return {
      response: emotionPrefix + '현재 날씨 정보를 확인하고 있습니다. 잠시만 기다려주세요.',
      emotion: emotion
    };
  } catch (error) {
    log.error('날씨 처리 오류:', error);
    return {
      response: '날씨 정보를 가져오는 중 오류가 발생했습니다.',
      emotion: emotion
    };
  }
};

// 일정 명령 처리
const handleCalendarCommand = async (command, dependencies, emotion) => {
  try {
    log.info('일정 명령 처리:', command);
    
    return {
      response: '일정 관리 기능을 확인하고 있습니다.',
      emotion: emotion
    };
  } catch (error) {
    log.error('일정 처리 오류:', error);
    return {
      response: '일정 정보를 가져오는 중 오류가 발생했습니다.',
      emotion: emotion
    };
  }
};

// 시간 포맷팅 함수들
const formatKSTTime = (date = new Date()) => {
  return date.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatKSTDate = (date = new Date()) => {
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
};

// 전역 인스턴스 생성
const conversationContext = new ConversationContext();

module.exports = {
  analyzeEmotion,
  combineEmotions,
  processUserInput,
  processRecognizedCommand,
  formatKSTTime,
  formatKSTDate,
  emotionManager: EmotionManager,
  ConversationContext,
  conversationContext
};