// WebSocket 관리
function initWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => console.log('WS 연결됨');
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'status') {
        if (msg.status === 'connected') return;
        if (msg.status === 'listening_on') { setMicUI(true); }
        if (msg.status === 'listening_off') { setMicUI(false); setListeningWindow(0, 0); if (ephemeralEl) { ephemeralEl.remove(); ephemeralEl = null; } }
        if (msg.status === 'hotword_listening') { setMicUI(true, '호출어 대기 중'); setListeningWindow(0, 0); if (ephemeralEl) { ephemeralEl.remove(); ephemeralEl = null; } }
        if (msg.status === 'wakeup') { addCaption('assistant', '네, 말씀하세요.', { autohideMs: 4000 }); }
        if (msg.status === 'processing') { setListeningWindow(0, 0); }
        if (msg.status === 'listening_window') { setListeningWindow(msg.remainingMs, msg.totalMs); }
        if (msg.status === 'listening_timeout') { addCaption('assistant', '다시 불러주세요.', { autohideMs: 4000 }); setListeningWindow(0,0); }
      } else if (msg.type === 'transcript') {
        // Show interim as ephemeral; on final, replace with single final caption and auto-hide
        if (!msg.final) {
          addCaption('user', msg.text, { ephemeral: true });
        } else {
          // remove ephemeral if exists, then add single final caption
          if (ephemeralEl) { ephemeralEl.remove(); ephemeralEl = null; }
          addCaption('user', msg.text, { autohideMs: 8000 });
        }
      } else if (msg.type === 'response') {
        // Show assistant caption immediately; actual auto-hide will be driven by TTS end event
        addCaption('assistant', msg.text);
      } else if (msg.type === 'tts') {
        if (msg.status === 'end') {
          // Hide the last assistant caption after delayMs (default fallback handled server-side)
          const nodes = $('captions').querySelectorAll('.caption.assistant');
          const last = nodes[nodes.length - 1];
          const delay = Number(msg.delayMs || 3000);
          if (last) setTimeout(() => { last.style.opacity = '0'; setTimeout(() => last.remove(), 400); }, delay);
        }
      } else if (msg.type === 'personalized_message') {
        // 개인화된 메시지 업데이트
        $('advice').textContent = msg.message || '';
      } else if (msg.type === 'emotion_analysis') {
        // 감정 분석 결과 표시
        displayEmotionAnalysis({
          emotion: msg.emotion,
          confidence: msg.confidence
        });
        
        // 감정 기반 응답이 있으면 자막으로 표시
        if (msg.response) {
          addCaption('assistant', msg.response, { autohideMs: 6000 });
        }
      }
    } catch (e) {}
  };
  ws.onclose = () => { setMicUI(false); setTimeout(initWS, 2000); };
}
