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

// 감정 분석 결과 표시
function displayEmotionAnalysis(emotionData) {
  if (emotionData.emotion && emotionData.confidence > 0.5) {
    const emotionElement = document.getElementById('emotion-display');
    if (!emotionElement) {
      // 감정 표시 요소가 없으면 생성
      const newEmotionElement = document.createElement('div');
      newEmotionElement.id = 'emotion-display';
      newEmotionElement.className = 'emotion-info';
      newEmotionElement.innerHTML = `
        <div class="emotion-icon">${getEmotionIcon(emotionData.emotion)}</div>
        <div class="emotion-text">
          <div class="emotion-label">${getEmotionLabel(emotionData.emotion)}</div>
          <div class="emotion-confidence">${Math.round(emotionData.confidence * 100)}%</div>
        </div>
      `;
      document.body.appendChild(newEmotionElement);
    } else {
      // 기존 요소 업데이트
      emotionElement.innerHTML = `
        <div class="emotion-icon">${getEmotionIcon(emotionData.emotion)}</div>
        <div class="emotion-text">
          <div class="emotion-label">${getEmotionLabel(emotionData.emotion)}</div>
          <div class="emotion-confidence">${Math.round(emotionData.confidence * 100)}%</div>
        </div>
      `;
    }
  }
}

// 감정 아이콘 반환
function getEmotionIcon(emotion) {
  const icons = {
    'happy': '😊',
    'sad': '😢',
    'angry': '😠',
    'calm': '😌',
    'surprised': '😲',
    'fearful': '😨',
    'disgust': '🤢',
    'neutral': '😐'
  };
  return icons[emotion] || '😐';
}

// 감정 라벨 반환
function getEmotionLabel(emotion) {
  const labels = {
    'happy': '행복',
    'sad': '슬픔',
    'angry': '분노',
    'calm': '평온',
    'surprised': '놀람',
    'fearful': '두려움',
    'disgust': '혐오',
    'neutral': '중립'
  };
  return labels[emotion] || '알 수 없음';
}

// 클릭 시 모든 자막 서서히 제거
document.addEventListener('click', () => {
  document.querySelectorAll('#captions .caption').forEach(el => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); });
});
