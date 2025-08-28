const axios = require('axios');
const { WEATHER_API_KEY, CITY_ID } = require('./config');
const { log } = require('./logging');

// In-memory weather cache for outage/timeout fallback
let weatherCache = { data: null, ts: 0 };

// ========== 날짜 인지 및 시간 처리 시스템 ==========
// KST 기준 시간 유틸리티
const getKSTNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));

const formatKSTTime = () => {
  const now = getKSTNow();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const isAM = hours < 12;
  const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
  return `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;
};

const formatKSTDate = () => {
  const now = getKSTNow();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
};

// 상대적 날짜 파싱 (예: 내일, 모레, 3시간 후 등)
const parseRelativeDate = (text) => {
  const lowerText = text.toLowerCase().trim();
  const patterns = {
    today: /(오늘|금일|오늘날)/,
    tomorrow: /(내일|다음날)/,
    dayAfterTomorrow: /(모레|글피)/,
    hoursLater: /(\d{1,2})\s*시간\s*(뒤|후|후에)/,
    minutesLater: /(\d{1,2})\s*분\s*(뒤|후|후에)/,
    specificDate: /(\d{1,2})월\s*(\d{1,2})일/,
    specificDay: /(\d{1,2})일/
  };
  
  const now = getKSTNow();
  const result = { type: 'unknown', date: null, text: text, original: text };
  
  if (patterns.today.test(lowerText)) {
    result.type = 'today';
    result.date = new Date(now);
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
  
  // 시간 단위 처리
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
  
  return result;
};

// 순수한 날짜/시간 질문인지 판별
const isPureDateQuery = (query) => {
  const lowerQuery = query.toLowerCase();
  const excludeKeywords = ['뉴스', '날씨', '음악', '노래', '영화'];
  if (excludeKeywords.some(keyword => lowerQuery.includes(keyword))) return false;
  
  const dateKeywords = ['일정', '스케줄', '시간', '몇 시', '날짜', '며칠', '요일', '내일', '모레', '오늘'];
  return dateKeywords.some(keyword => lowerQuery.includes(keyword));
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
  
  if (isToday) return `오늘 (${weekday})`;
  else if (isTomorrow) return `내일 (${weekday})`;
  else return `${year}년 ${month}월 ${day}일 (${weekday})`;
};

// External time API (KST)
const fetchKSTNowFromAPI = async () => {
  try {
    const res = await axios.get('https://worldtimeapi.org/api/timezone/Asia/Seoul', { timeout: 5000 });
    return new Date(res.data.datetime);
  } catch (e) {
    log.warn('WorldTimeAPI 실패, 로컬 KST 대체 사용:', e.message);
    return getKSTNow();
  }
};

// 주변 환경 감지 시스템
const environmentalAwareness = {
  // 날씨에 따른 제안
  getWeatherBasedSuggestions: (weatherData) => {
    if (!weatherData) return null;
    
    const description = weatherData.weather?.[0]?.description || '';
    const temp = weatherData.main?.temp;
    
    // 비/눈 관련
    if (/비|눈|소나기|장마/.test(description)) {
      return {
        type: 'weather',
        message: '우산을 챙기시는 것이 좋겠습니다',
        priority: 'high'
      };
    }
    
    // 더운 날
    if (temp > 30) {
      return {
        type: 'weather',
        message: '더운 날씨입니다. 수분 섭취를 잊지 마세요',
        priority: 'medium'
      };
    }
    
    // 추운 날
    if (temp < 5) {
      return {
        type: 'weather',
        message: '추운 날씨입니다. 따뜻하게 입으세요',
        priority: 'medium'
      };
    }
    
    // 맑은 날
    if (/맑음|맑은|화창/.test(description)) {
      return {
        type: 'weather',
        message: '날씨가 좋습니다. 산책하기 좋은 날이네요',
        priority: 'low'
      };
    }
    
    return null;
  },
  
  // 계절별 맞춤 정보
  getSeasonalContent: () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    
    if (month >= 3 && month <= 5) {
      // 봄
      return {
        type: 'seasonal',
        message: '봄날씨입니다. 벚꽃 구경하시는 건 어떠세요?',
        priority: 'medium'
      };
    } else if (month >= 6 && month <= 8) {
      // 여름
      return {
        type: 'seasonal',
        message: '여름입니다. 시원한 음료와 함께하세요',
        priority: 'low'
      };
    } else if (month >= 9 && month <= 11) {
      // 가을
      return {
        type: 'seasonal',
        message: '가을입니다. 단풍 구경하기 좋은 계절이네요',
        priority: 'medium'
      };
    } else {
      // 겨울
      return {
        type: 'seasonal',
        message: '겨울입니다. 따뜻하게 보내세요',
        priority: 'low'
      };
    }
  },
  
  // 시간대별 활동 제안
  getTimeBasedSuggestions: (hour) => {
    if (hour >= 6 && hour < 9) {
      return {
        type: 'time',
        message: '상쾌한 아침입니다. 오늘도 좋은 하루 되세요',
        priority: 'medium'
      };
    } else if (hour >= 9 && hour < 12) {
      return {
        type: 'time',
        message: '오전 업무 시간입니다. 집중력이 높은 시간이네요',
        priority: 'low'
      };
    } else if (hour >= 12 && hour < 14) {
      return {
        type: 'time',
        message: '점심 시간입니다. 맛있는 식사 하세요',
        priority: 'medium'
      };
    } else if (hour >= 14 && hour < 18) {
      return {
        type: 'time',
        message: '오후 시간입니다. 오후도 파이팅입니다!',
        priority: 'low'
      };
    } else if (hour >= 18 && hour < 21) {
      return {
        type: 'time',
        message: '저녁 시간입니다. 하루 수고하셨습니다',
        priority: 'medium'
      };
    } else if (hour >= 21 && hour < 24) {
      return {
        type: 'time',
        message: '밤 시간입니다. 편안한 밤 되세요',
        priority: 'low'
      };
    } else {
      return {
        type: 'time',
        message: '새벽 시간입니다. 푹 주무세요',
        priority: 'low'
      };
    }
  }
};

// 안정적인 날씨 API 호출 함수
const fetchWeatherData = async (useCache = true) => {
  // 캐시된 데이터가 있고 30분 이내라면 캐시 사용
  if (useCache && weatherCache.data && Date.now() - weatherCache.ts < 30 * 60 * 1000) {
    return { ...weatherCache.data, _cached: true };
  }
  
  const url = `https://api.openweathermap.org/data/2.5/weather?id=${CITY_ID}&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
  
  // 최대 3번 재시도
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.get(url, { 
        timeout: 8000,
        // DNS 설정 개선
        family: 4, // IPv4만 사용
        // 연결 설정
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });
      
      // 성공 시 캐시 업데이트
      weatherCache = { data: response.data, ts: Date.now() };
      return response.data;
    } catch (error) {
      log.warn(`날씨 API 호출 실패 (시도 ${attempt}/3):`, error.message);
      
      // 마지막 시도가 아니면 잠시 대기 후 재시도
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
    }
  }
  
  // 모든 시도 실패 시 캐시된 데이터 확인
  if (weatherCache.data && Date.now() - weatherCache.ts < 6 * 60 * 60 * 1000) {
    log.info('캐시된 날씨 데이터 사용');
    return { ...weatherCache.data, _stale: true };
  }
  
  // 기본 날씨 정보 제공
  log.warn('날씨 API 완전 실패, 기본 정보 제공');
  return {
    name: '서울',
    main: { temp: 20 },
    weather: [{ description: '날씨 정보를 불러올 수 없습니다' }],
    _error: true
  };
};

module.exports = {
  // 날씨 관련
  environmentalAwareness,
  fetchWeatherData,
  weatherCache,
  // 날짜/시간 관련
  getKSTNow,
  formatKSTTime,
  formatKSTDate,
  parseRelativeDate,
  isPureDateQuery,
  getKoreanDateInfo,
  fetchKSTNowFromAPI
};
