// 데이터 로딩 관련 함수들

// 개인화된 메시지 로드
async function loadPersonalizedMessage() {
  try {
    const res = await fetch('/api/personalized-message');
    const data = await res.json();
    $('advice').textContent = data.message || '';
  } catch (e) { 
    console.warn('개인화 메시지 로드 실패', e);
    $('advice').textContent = '';
  }
}

// 요약 데이터 로드
async function loadSummary() {
  try {
    const res = await fetch('/api/summary');
    const data = await res.json();
    $('time').textContent = data.time;
    $('date').textContent = data.date;
    // 개인화된 메시지와 캘린더는 별도로 로드
  } catch (e) { console.warn('요약 로드 실패', e); }
}

// 뉴스 로드
async function loadNews() {
  try {
    const res = await fetch('/api/news');
    const data = await res.json();
    renderNews(data.articles || []);
  } catch (e) { console.warn('뉴스 로드 실패', e); }
}

// 날씨 로드
async function loadWeather() {
  try {
    const res = await fetch('/api/weather');
    const w = await res.json();
    const temp = Math.round(w.main?.temp ?? 0);
    const desc = (w.weather && w.weather[0] && w.weather[0].description) ? w.weather[0].description : '';
    const city = w.name || '';
    const humidity = w.main?.humidity;
    const wind = w.wind?.speed;
    $('temp').textContent = `${isFinite(temp) ? temp : '--'}°C`;
    $('weatherDesc').textContent = `${city ? city + ' · ' : ''}${desc}`;
    const meta = [];
    if (typeof humidity === 'number') meta.push(`습도 ${humidity}%`);
    if (typeof wind === 'number') meta.push(`바람 ${wind}m/s`);
    $('weatherMeta').textContent = meta.join(' · ');
  } catch (e) {
    console.warn('날씨 로드 실패', e);
  }
}

// 캘린더 로드 (초고빈도 실시간 업데이트 최적화)
async function loadCalendar() {
  try {
    const res = await fetch('/api/calendar/today', {
      // 강력한 캐시 무효화
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    const data = await res.json();
    
    // 새로운 API 응답 형식 처리
    const events = data.events || data || [];
    const lastUpdated = data.lastUpdated;
    const count = data.count || events.length;
    
    // 캘린더 렌더링
    renderCalendar(events);
    
    // 상세 로그 출력 (실시간 추적용)
    console.log(`📅 캘린더 폴링 업데이트: ${count}개 일정 ${lastUpdated ? `(서버: ${new Date(lastUpdated).toLocaleTimeString()})` : ''} → 클라이언트: ${new Date().toLocaleTimeString()}`);
    
    // 성공 시 시각적 피드백 (아주 미묘한)
    const calendarHeader = document.querySelector('#calendar h2');
    if (calendarHeader) {
      calendarHeader.style.transition = 'color 0.2s';
      calendarHeader.style.color = '#4CAF50';
      setTimeout(() => {
        calendarHeader.style.color = '';
      }, 500);
    }
    
  } catch (e) {
    console.warn('캘린더 로드 실패', e);
    // 오류 시 빈 배열로 렌더링
    renderCalendar([]);
    
    // 오류 시 시각적 피드백
    const calendarHeader = document.querySelector('#calendar h2');
    if (calendarHeader) {
      calendarHeader.style.transition = 'color 0.2s';
      calendarHeader.style.color = '#f44336';
      setTimeout(() => {
        calendarHeader.style.color = '';
      }, 1000);
    }
  }
}
