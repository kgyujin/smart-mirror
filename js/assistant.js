const { log } = require('./logging');

// 간단한 대화 처리 시스템
const processSimpleConversation = async (query) => {
  try {
    log.info('간단한 대화 처리 시작:', query);
    
    // 기본적인 질문에 대한 응답
    const responses = {
      '안녕': '안녕하세요! 무엇을 도와드릴까요?',
      '안녕하세요': '안녕하세요! 무엇을 도와드릴까요?',
      '시간': '현재 시간을 알려드리겠습니다.',
      '날씨': '현재 날씨 정보를 확인해드리겠습니다.',
      '도움': '음성 명령으로 시간, 날씨, 뉴스 등을 확인할 수 있습니다.',
      '고마워': '천만에요! 더 필요한 것이 있으면 언제든 말씀해주세요.',
      '감사합니다': '천만에요! 더 필요한 것이 있으면 언제든 말씀해주세요.'
    };
    
    // 정확한 매칭
    for (const [key, response] of Object.entries(responses)) {
      if (query.includes(key)) {
        return response;
      }
    }
    
    // 기본 응답
    return '죄송합니다. 그 질문에 대한 답변을 제공할 수 없습니다. 시간, 날씨, 뉴스 등에 대해 물어보세요.';
    
  } catch (error) {
    log.error('대화 처리 오류:', error);
    return '죄송합니다. 오류가 발생했습니다.';
  }
};

// 대화 함수 (Google Assistant 대신 간단한 대화 처리 사용)
const conversateWithAssistant = async (audioData, query) => {
  try {
    log.info('간단한 대화 시스템으로 처리:', query);
    const response = await processSimpleConversation(query);
    return response;
  } catch (error) {
    log.error('대화 처리 오류:', error);
    throw error;
  }
};

// 토큰 확인 (더 이상 필요하지 않음)
const checkTokenExists = () => {
  log.info('Google Assistant 인증이 더 이상 필요하지 않습니다.');
  return true;
};

module.exports = {
  processSimpleConversation,
  conversateWithAssistant,
  checkTokenExists
};
