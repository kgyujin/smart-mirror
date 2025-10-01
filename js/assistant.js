const { log } = require('./logging');

// GPT 기반 대화 처리 시스템
const processConversation = async (query, context, openai) => {
  try {
    log.info('GPT 기반 대화 처리 시작:', query);
    
    const { emotion, emotionData } = context;
    
    // GPT 프롬프트 작성
    const systemPrompt = `당신은 스마트 미러의 공감적이고 도움이 되는 AI 어시스턴트입니다.

사용자 정보:
- 현재 감정: ${emotion}
- 감정 세부 데이터: ${JSON.stringify(emotionData)}
- 이전 대화: ${context.lastConversation || '없음'}

대화 지침:
1. 공감적 응답:
   - 사용자의 감정을 이해하고 공감하는 대화체
   - 현재 감정에 따른 적절한 톤과 어조 사용

2. 실질적 도움:
   - 필요한 정보 제공 (시간, 날씨, 일정, 뉴스 등)
   - 감정에 맞는 활동 제안 (음악, 명상, 운동 등)
   - 구체적이고 실행 가능한 해결책 제시

3. 상황 인식:
   - 시간대에 따른 적절한 제안
   - 날씨 정보를 고려한 활동 추천
   - 사용자의 일정을 고려한 맞춤형 도움

대화 형식:
- 짧고 명확한 문장 사용
- 자연스럽고 친근한 말투 유지
- 구체적인 행동 제안 포함`;

    // GPT API 호출
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    const response = completion.choices[0].message.content;
    log.info('GPT 응답:', response);
    return response;

  } catch (error) {
    log.error('GPT 대화 처리 오류:', error);
    return '죄송합니다. 잠시 오류가 발생했습니다. 다시 말씀해주시겠습니까?';
  }
    
  } catch (error) {
    log.error('대화 처리 오류:', error);
    return '죄송합니다. 오류가 발생했습니다.';
  }
};

// GPT 기반 대화 함수
const conversateWithAssistant = async (audioData, query, context = {}, openai = null) => {
  try {
    log.info('GPT 기반 대화 처리:', query);
    
    // OpenAI API가 없는 경우 기본 응답 사용
    if (!openai) {
      const basicResponse = getBasicResponse(query);
      return basicResponse;
    }
    
    const response = await processConversation(query, context, openai);
    return response;
  } catch (error) {
    log.error('GPT 대화 처리 오류:', error);
    throw error;
  }
};

// 기본 응답 가져오기
const getBasicResponse = (query) => {
  const responses = {
    '안녕': '안녕하세요! 무엇을 도와드릴까요?',
    '시간': '현재 시간을 알려드리겠습니다.',
    '날씨': '현재 날씨 정보를 확인해드리겠습니다.',
    '도움': '음성 명령으로 시간, 날씨, 뉴스 등을 확인할 수 있습니다.',
    '고마워': '천만에요! 더 필요한 것이 있으면 언제든 말씀해주세요.'
  };
  
  for (const [key, response] of Object.entries(responses)) {
    if (query.includes(key)) {
      return response;
    }
  }
  
  return '시간, 날씨, 뉴스 등에 대해 물어보세요.';
};

// 토큰 확인 (더 이상 필요하지 않음)
const checkTokenExists = () => {
  log.info('Google Assistant 인증이 더 이상 필요하지 않습니다.');
  return true;
};

module.exports = {
  conversateWithAssistant,
  checkTokenExists
};
