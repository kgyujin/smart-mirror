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
    // 개인화된 메시지는 별도로 로드
    // Calendar
    renderCalendar(data.events || []);
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
