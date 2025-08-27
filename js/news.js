const RSSParser = require('rss-parser');
const { log } = require('./logging');

const rssParser = new RSSParser();

// 뉴스 관련 질의 감지 함수
const isNewsQuery = (query) => {
  const newsKeywords = [
    '뉴스', '오늘 뉴스', '오늘의 뉴스', '어제 뉴스', '주요 뉴스', '속보',
    '정치 뉴스', '경제 뉴스', '사회 뉴스', '국제 뉴스', '연예 뉴스', '스포츠 뉴스'
  ];
  return newsKeywords.some(kw => query.includes(kw));
};

// RSS 맵과 카테고리 키워드 정의
const rssMap = {
  latest: 'https://www.yna.co.kr/rss/news.xml',
  politics: 'https://www.yna.co.kr/rss/politics.xml',
  northkorea: 'https://www.yna.co.kr/rss/northkorea.xml',
  economy: 'https://www.yna.co.kr/rss/economy.xml',
  market: 'https://www.yna.co.kr/rss/market.xml',
  industry: 'https://www.yna.co.kr/rss/industry.xml',
  society: 'https://www.yna.co.kr/rss/society.xml',
  local: 'https://www.yna.co.kr/rss/local.xml',
  international: 'https://www.yna.co.kr/rss/international.xml',
  culture: 'https://www.yna.co.kr/rss/culture.xml',
  health: 'https://www.yna.co.kr/rss/health.xml',
  entertainment: 'https://www.yna.co.kr/rss/entertainment.xml',
  sports: 'https://www.yna.co.kr/rss/sports.xml',
  opinion: 'https://www.yna.co.kr/rss/opinion.xml',
  people: 'https://www.yna.co.kr/rss/people.xml',
  it: 'https://www.yna.co.kr/rss/industry.xml',
  tech: 'https://www.yna.co.kr/rss/industry.xml'
};

const categoryKeywords = {
  politics: ['정치'],
  northkorea: ['북한'],
  economy: ['경제'],
  market: ['마켓', '증시'],
  industry: ['산업'],
  society: ['사회'],
  local: ['지역', '전국'],
  international: ['세계', '국제'],
  culture: ['문화'],
  health: ['건강'],
  entertainment: ['연예', '엔터테인먼트'],
  sports: ['스포츠', '운동'],
  opinion: ['오피니언', '사설'],
  people: ['사람들'],
  it: ['it', '아이티', '테크', '기술', '디지털']
};

const categoryNames = {
  latest: '오늘의 주요 뉴스',
  politics: '정치 뉴스',
  northkorea: '북한 관련 뉴스',
  economy: '경제 뉴스',
  market: '증시 뉴스',
  industry: '산업 뉴스',
  society: '사회 뉴스',
  local: '지역 뉴스',
  international: '국제 뉴스',
  culture: '문화 뉴스',
  health: '건강 뉴스',
  entertainment: '연예 뉴스',
  sports: '스포츠 뉴스',
  opinion: '오피니언 뉴스',
  people: '인물 뉴스',
};

// 뉴스 카테고리 추론
const inferNewsCategory = (userQuery) => {
  const lowerQuery = userQuery.toLowerCase();
  for (const [key, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(k => lowerQuery.includes(k))) {
      return key;
    }
  }
  return null;
};

// 최신 뉴스 가져오기
const fetchLatestNews = async () => {
  try {
    const feed = await rssParser.parseURL(rssMap.latest);
    const articles = feed.items.slice(0, 5).map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
    }));
    return { articles };
  } catch (err) {
    log.error('뉴스 불러오기 실패:', err);
    throw new Error('뉴스 정보를 가져오는 데 실패했습니다.');
  }
};

// 카테고리별 뉴스 처리
const processNewsQuery = async (userQuery) => {
  const category = inferNewsCategory(userQuery);
  
  // 매칭되는 카테고리가 없으면 최신 뉴스로 대응
  if (!category) {
    try {
      const feed = await rssParser.parseURL(rssMap.latest);
      const topItems = feed.items.slice(0, 3);
      const spokenList = topItems.map((item, i) => `(${i + 1}) ${item.title}`).join(' ');
      return { response: `오늘의 주요 뉴스입니다. ${spokenList}`, category: 'latest' };
    } catch (e) {
      return { response: '뉴스를 불러오지 못했습니다.', category: null };
    }
  }
  
  const rssUrl = rssMap[category];
  
  try {
    const feed = await rssParser.parseURL(rssUrl);
    const topItems = feed.items.slice(0, 3);
    const spokenList = topItems.map((item, i) => `(${i + 1}) ${item.title}`).join(' ');
    
    const categoryTitle = categoryNames[category] || '뉴스';
    const responseText = `${categoryTitle}입니다. ${spokenList}`;
    
    return { response: responseText, category };
  } catch (error) {
    log.error('뉴스 질문 처리 실패:', error);
    throw new Error('뉴스 정보를 가져오는 데 실패했습니다.');
  }
};

module.exports = {
  isNewsQuery,
  rssMap,
  categoryKeywords,
  categoryNames,
  inferNewsCategory,
  fetchLatestNews,
  processNewsQuery,
  rssParser
};
