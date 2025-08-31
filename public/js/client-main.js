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
    const emotionElement = document.getElementById('emotion');
    if (emotionElement) {
      // 감정 라벨 가져오기
      const emotionLabel = getEmotionLabel(emotionData.emotion);
      const confidence = Math.round(emotionData.confidence * 100);
      
      // 날짜 패널 아래에 감정 표시
      emotionElement.textContent = `${emotionLabel} (${confidence}%)`;
      
      // 3초 후 자동으로 사라지게 설정
      setTimeout(() => {
        emotionElement.textContent = '';
      }, 3000);
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
    'excited': '흥분',
    'frustrated': '좌절',
    'fearful': '두려움',
    'neutral': '중립'
  };
  return labels[emotion] || '알 수 없음';
}

// 클릭 시 모든 자막 서서히 제거
document.addEventListener('click', () => {
  document.querySelectorAll('#captions .caption').forEach(el => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); });
});
