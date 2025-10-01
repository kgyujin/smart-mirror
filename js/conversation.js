const axios = require('axios');
const { log } = require('./logging');
const { openai } = require('./config');

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

const processUserInput = async (input, emotionData) => {
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
    const completion = await openai.chat.completions.create({
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
    this.sessionTimeout = 30 * 60 * 1000; // 30분
    this.maxContextLength = 20;
  }

  getUserContext(userId = 'default') {
    if (!this.contexts.has(userId)) {
      this.contexts.set(userId, {
        messages: [],
        currentTopic: null,
        lastInteraction: Date.now(),
        emotionHistory: [],
        conversationFlow: [],
        pendingActions: []
      });
    }
    return this.contexts.get(userId);
  }

  addMessage(userId, role, content, emotion = null) {
    const context = this.getUserContext(userId);
    const message = {
      role,
      content,
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
    
    // 문맥 길이 제한
    if (context.messages.length > this.maxContextLength) {
      context.messages.shift();
    }
  }

  getContextSummary(userId) {
    const context = this.getUserContext(userId);
    return {
      currentTopic: context.currentTopic,
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

module.exports = {
  analyzeEmotion,
  combineEmotions,
  processUserInput,
  ConversationContext
};