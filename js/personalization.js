const { fetchWeatherData, environmentalAwareness } = require('./weather');
const { fetchTodayEvents } = require('./calendar');
const { log } = require('./logging');

// AI 기반 개인화 학습 시스템
class PersonalizationSystem {
  constructor(openai) {
    this.openai = openai;
    this.userPatterns = {
      lastInteraction: null,
      frequentQueries: new Map(),
      dailyPatterns: new Map(),
      preferences: new Map(),
      moodHistory: []
    };
    this.currentMessage = '';
    this.lastMessageType = '';
    this.messageUpdateInterval = null;
    this.messageVarietyInterval = null;
    this.startMessageUpdates();
  }

  // 사용자 상호작용 기록
  recordInteraction(query, response, context = {}) {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    
    // 마지막 상호작용 시간 기록
    this.userPatterns.lastInteraction = now;
    
    // 자주 묻는 질문 패턴 분석
    if (query) {
      const key = query.toLowerCase().trim();
      this.userPatterns.frequentQueries.set(key, 
        (this.userPatterns.frequentQueries.get(key) || 0) + 1
      );
    }
    
    // 시간대별 패턴 분석
    const timeKey = `${dayOfWeek}-${hour}`;
    this.userPatterns.dailyPatterns.set(timeKey, 
      (this.userPatterns.dailyPatterns.get(timeKey) || 0) + 1
    );
    
    // 선호도 분석 (응답 길이, 질문 유형 등)
    if (response) {
      const responseLength = response.length;
      const queryType = this.analyzeQueryType(query);
      this.userPatterns.preferences.set('responseLength', 
        (this.userPatterns.preferences.get('responseLength') || 0) + responseLength
      );
      this.userPatterns.preferences.set('queryType', queryType);
    }
  }

  // 질문 유형 분석
  analyzeQueryType(query) {
    const lowerQuery = query.toLowerCase();
    if (/(시간|몇\s*시)/.test(lowerQuery)) return 'time';
    if (/(날씨|기온)/.test(lowerQuery)) return 'weather';
    if (/(일정|스케줄|캘린더)/.test(lowerQuery)) return 'schedule';
    if (/(뉴스|속보)/.test(lowerQuery)) return 'news';
    if (/(요일|날짜)/.test(lowerQuery)) return 'date';
    return 'general';
  }

  // 개인화된 메시지 생성
  async generatePersonalizedMessage(broadcast, envAwareness = null) {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const dayOfWeekName = ['일', '월', '화', '수', '목', '금', '토'][dayOfWeek];
    
    try {
      // 현재 상황 분석
      const context = await this.analyzeCurrentContext();
      
      // 일정 기반 메시지 우선 확인
      const scheduleSuggestion = this.getScheduleBasedMessage(context.events, hour);
      
      // 환경 인식 기반 메시지 우선 생성 (매개변수 또는 import된 객체 사용)
      const envAwarenessObj = envAwareness || environmentalAwareness;
      const weatherSuggestion = envAwarenessObj?.getWeatherBasedSuggestions?.(context.weather);
      const seasonalContent = envAwarenessObj?.getSeasonalContent?.();
      const timeSuggestion = envAwarenessObj?.getTimeBasedSuggestions?.(hour);
      
      // 우선순위에 따른 메시지 선택
      let selectedMessage = null;
      let selectedType = '';
      
      // 1. 일정 관련 (최고 우선순위)
      if (scheduleSuggestion) {
        selectedMessage = scheduleSuggestion.message;
        selectedType = 'schedule';
      }
      // 2. 날씨 관련 (높은 우선순위)
      else if (weatherSuggestion && weatherSuggestion.priority === 'high') {
        selectedMessage = weatherSuggestion.message;
        selectedType = 'weather_high';
      }
      // 3. 계절 관련 (중간 우선순위)
      else if (seasonalContent && seasonalContent.priority === 'medium') {
        selectedMessage = seasonalContent.message;
        selectedType = 'seasonal_medium';
      }
      // 4. 시간대 관련 (중간 우선순위)
      else if (timeSuggestion && timeSuggestion.priority === 'medium') {
        selectedMessage = timeSuggestion.message;
        selectedType = 'time_medium';
      }
      // 5. 기타 환경 메시지
      else if (weatherSuggestion) {
        selectedMessage = weatherSuggestion.message;
        selectedType = 'weather';
      } else if (seasonalContent) {
        selectedMessage = seasonalContent.message;
        selectedType = 'seasonal';
      } else if (timeSuggestion) {
        selectedMessage = timeSuggestion.message;
        selectedType = 'time';
      }
      
      // 메시지 타입이 변경되었거나 GPT를 사용해야 하는 경우
      if (selectedType !== this.lastMessageType || !selectedMessage) {
        // GPT 기반 개인화 메시지 생성
        if (this.openai) {
          const system = `당신은 스마트 미러의 개인화된 AI 비서입니다. 
사용자의 패턴과 현재 상황을 바탕으로 자연스럽고 도움이 되는 한 문장 메시지를 생성하세요.

규칙:
- 20자 이내의 간결한 메시지
- 시간대와 상황에 맞는 적절한 제안
- 사용자 패턴을 고려한 개인화
- 필요하지 않으면 빈 문자열 반환
- 존댓말로 정중하게`;

          const user = `현재 상황: ${JSON.stringify(context)}
사용자 패턴: ${JSON.stringify(this.getUserPatterns())}
현재 시간: ${hour}시, ${dayOfWeekName}요일

개인화된 메시지를 생성해주세요.`;

          const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ],
            temperature: 0.7,
            max_tokens: 50,
          });
          
          const gptMessage = completion.choices?.[0]?.message?.content?.trim() || '';
          if (gptMessage) {
            selectedMessage = gptMessage;
            selectedType = 'gpt';
          }
        }
      }
      
      // 메시지 타입 업데이트
      this.lastMessageType = selectedType;
      
      return selectedMessage || this.generateRuleBasedMessage(now, hour, dayOfWeekName);
    } catch (error) {
      log.warn('개인화 메시지 생성 실패:', error.message);
    }
    
    // GPT 실패 시 기본 규칙 기반 메시지
    return this.generateRuleBasedMessage(now, hour, dayOfWeekName);
  }

  // 현재 상황 분석
  async analyzeCurrentContext() {
    const context = {
      time: new Date().toLocaleTimeString('ko-KR'),
      dayOfWeek: new Date().getDay(),
      hour: new Date().getHours(),
      weather: null,
      events: [],
      lastInteraction: this.userPatterns.lastInteraction
    };

    try {
      // 날씨 정보 (함수가 정의된 경우에만 호출)
      if (typeof fetchWeatherData === 'function') {
        const weatherData = await fetchWeatherData();
        context.weather = {
          temp: weatherData.main?.temp,
          description: weatherData.weather?.[0]?.description,
          isRaining: /비|눈/.test(weatherData.weather?.[0]?.description || '')
        };
      }

      // 오늘 일정 (함수가 정의된 경우에만 호출)
      if (typeof fetchTodayEvents === 'function') {
        const events = await fetchTodayEvents();
        context.events = events.slice(0, 3).map(ev => ({
          time: ev.start,
          summary: ev.summary,
          isAllDay: ev.isAllDay
        }));
      }
    } catch (error) {
      log.warn('상황 분석 실패:', error.message);
    }

    return context;
  }

  // 일정 기반 메시지 생성
  getScheduleBasedMessage(events, currentHour) {
    if (!events || events.length === 0) {
      return null;
    }

    const now = new Date();
    const currentTime = now.getTime();

    // 현재 진행 중인 일정 확인
    const ongoingEvent = events.find(event => {
      if (event.isAllDay) return false;
      const startTime = new Date(event.time).getTime();
      const endTime = event.end ? new Date(event.end).getTime() : startTime + (60 * 60 * 1000); // 기본 1시간
      return startTime <= currentTime && currentTime <= endTime;
    });

    if (ongoingEvent) {
      return {
        message: `현재 "${ongoingEvent.summary}" 진행 중입니다`,
        type: 'schedule'
      };
    }

    // 다음 일정 확인 (1시간 이내)
    const upcomingEvent = events.find(event => {
      if (event.isAllDay) return false;
      const startTime = new Date(event.time).getTime();
      const timeDiff = startTime - currentTime;
      return timeDiff > 0 && timeDiff <= 60 * 60 * 1000; // 1시간 이내
    });

    if (upcomingEvent) {
      const startTime = new Date(upcomingEvent.time);
      const minutesUntil = Math.round((startTime.getTime() - currentTime) / (1000 * 60));
      return {
        message: `${minutesUntil}분 후 "${upcomingEvent.summary}" 예정입니다`,
        type: 'schedule'
      };
    }

    // 오늘 일정 개수에 따른 메시지
    const todayEvents = events.filter(event => {
      const eventDate = new Date(event.time);
      const today = new Date();
      return eventDate.getDate() === today.getDate() && 
             eventDate.getMonth() === today.getMonth() && 
             eventDate.getFullYear() === today.getFullYear();
    });

    if (todayEvents.length > 0) {
      return {
        message: `오늘 ${todayEvents.length}개의 일정이 있습니다`,
        type: 'schedule'
      };
    }

    return null;
  }

  // 규칙 기반 메시지 생성
  generateRuleBasedMessage(now, hour, dayOfWeekName) {
    // 시간대별 기본 메시지
    if (hour >= 6 && hour < 9) {
      return '좋은 아침입니다! 오늘도 힘내세요';
    } else if (hour >= 9 && hour < 12) {
      return '오전 업무 화이팅입니다!';
    } else if (hour >= 12 && hour < 14) {
      return '점심 맛있게 드세요';
    } else if (hour >= 14 && hour < 18) {
      return '오후도 파이팅입니다!';
    } else if (hour >= 18 && hour < 21) {
      return '하루 수고하셨습니다';
    } else if (hour >= 21 && hour < 24) {
      return '편안한 밤 되세요';
    } else {
      return '새벽 시간입니다. 푹 주무세요';
    }
  }

  // 사용자 패턴 요약
  getUserPatterns() {
    const patterns = {
      mostFrequentQuery: '',
      preferredTime: '',
      averageResponseLength: 0,
      lastInteractionHours: 0
    };

    // 가장 자주 묻는 질문
    let maxCount = 0;
    for (const [query, count] of this.userPatterns.frequentQueries) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostFrequentQuery = query;
      }
    }

    // 선호하는 시간대
    let maxTimeCount = 0;
    for (const [timeKey, count] of this.userPatterns.dailyPatterns) {
      if (count > maxTimeCount) {
        maxTimeCount = count;
        patterns.preferredTime = timeKey;
      }
    }

    // 평균 응답 길이
    const totalLength = this.userPatterns.preferences.get('responseLength') || 0;
    const interactionCount = this.userPatterns.frequentQueries.size;
    patterns.averageResponseLength = interactionCount > 0 ? Math.round(totalLength / interactionCount) : 0;

    // 마지막 상호작용으로부터 경과 시간
    if (this.userPatterns.lastInteraction) {
      const hoursSince = (Date.now() - this.userPatterns.lastInteraction.getTime()) / (1000 * 60 * 60);
      patterns.lastInteractionHours = Math.round(hoursSince);
    }

    return patterns;
  }

  // 메시지 업데이트 시작
  startMessageUpdates(broadcast, envAwareness = null) {
    // 3분마다 메시지 다양성 업데이트 (메시지 타입 변경)
    this.messageVarietyInterval = setInterval(async () => {
      // 메시지 타입을 리셋하여 새로운 메시지 생성 유도
      this.lastMessageType = '';
      const newMessage = await this.generatePersonalizedMessage(broadcast, envAwareness);
      if (newMessage && newMessage !== this.currentMessage) {
        this.currentMessage = newMessage;
        // WebSocket을 통해 클라이언트에 전송
        if (broadcast) {
          broadcast({ 
            type: 'personalized_message', 
            message: newMessage,
            timestamp: Date.now()
          });
        }
      }
    }, 3 * 60 * 1000); // 3분

    // 5분마다 상황 변화에 따른 메시지 업데이트
    this.messageUpdateInterval = setInterval(async () => {
      const newMessage = await this.generatePersonalizedMessage(broadcast, envAwareness);
      if (newMessage && newMessage !== this.currentMessage) {
        this.currentMessage = newMessage;
        // WebSocket을 통해 클라이언트에 전송
        if (broadcast) {
          broadcast({ 
            type: 'personalized_message', 
            message: newMessage,
            timestamp: Date.now()
          });
        }
      }
    }, 5 * 60 * 1000); // 5분

    // 초기 메시지 생성을 약간 지연시켜 다른 함수들이 정의된 후 실행
    setTimeout(async () => {
      const message = await this.generatePersonalizedMessage(broadcast, envAwareness);
      this.currentMessage = message;
      if (broadcast) {
        broadcast({ 
          type: 'personalized_message', 
          message: message,
          timestamp: Date.now()
        });
      }
    }, 1000); // 1초 지연
  }

  // 현재 메시지 가져오기
  getCurrentMessage() {
    return this.currentMessage;
  }

  // 시스템 정리
  cleanup() {
    if (this.messageUpdateInterval) {
      clearInterval(this.messageUpdateInterval);
      this.messageUpdateInterval = null;
    }
    if (this.messageVarietyInterval) {
      clearInterval(this.messageVarietyInterval);
      this.messageVarietyInterval = null;
    }
  }
}

module.exports = {
  PersonalizationSystem
};
