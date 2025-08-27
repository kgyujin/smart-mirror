// 채팅 관련 함수들
async function sendChat() {
  const v = $('chatInput').value.trim();
  if (!v) return;
  addCaption('user', v);
  $('chatInput').value = '';
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: v }) });
    const data = await res.json();
    // 답변 자막은 WebSocket 'response' 이벤트로만 처리해 중복 표시를 방지합니다.
  } catch {}
}
