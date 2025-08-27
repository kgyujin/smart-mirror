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
loadPersonalizedMessage(); // 개인화된 메시지 로드
setInterval(loadNews, 1000 * 60 * 10);
setInterval(loadSummary, 1000 * 60 * 5);
setInterval(loadWeather, 1000 * 60 * 10);
setInterval(loadPersonalizedMessage, 1000 * 60 * 5); // 5분마다 개인화 메시지 업데이트
initWS();

$('sendBtn').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// 클릭 시 모든 자막 서서히 제거
document.addEventListener('click', () => {
  document.querySelectorAll('#captions .caption').forEach(el => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); });
});
