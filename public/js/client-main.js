// 메인 애플리케이션 로직

// Auto update clock per second
setInterval(() => {
  const now = new Date();
  $('time').textContent = formatTime(now);
  $('date').textContent = formatDate(now);
}, 1000);

// Initial load
loadSummary();
loadWeather();
loadNews();
loadCalendar(); // 캘린더 데이터 초기 로드
loadPersonalizedMessage(); // 개인화된 메시지 로드

// 주기적 업데이트 설정 (캘린더는 초고빈도)
setInterval(loadNews, 1000 * 60 * 1);           // 1분마다 뉴스 업데이트
setInterval(loadSummary, 1000 * 60 * 1);        // 1분마다 요약 업데이트
setInterval(loadWeather, 1000 * 60 * 1);        // 1분마다 날씨 업데이트
setInterval(loadCalendar, 1000 * 30);           // 🚀 30초마다 캘린더 업데이트 (초고빈도!)
setInterval(loadPersonalizedMessage, 1000 * 60 * 1); // 1분마다 개인화 메시지 업데이트
initWS();

$('sendBtn').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// 메시지 클릭 시 변경
$('advice').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/personalized-message/change', { method: 'POST' });
    if (response.ok) {
      const data = await response.json();
      $('advice').textContent = data.message;
    }
  } catch (error) {
    console.error('메시지 변경 실패:', error);
  }
});



// 클릭 시 모든 자막 서서히 제거
document.addEventListener('click', () => {
  document.querySelectorAll('#captions .caption').forEach(el => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); });
});
