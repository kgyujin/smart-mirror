// WebSocket 관리
window.wsConnection = null;

function initWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  window.wsConnection = new WebSocket(`${proto}://${location.host}`);
  window.wsConnection.onopen = () => console.log('WS 연결됨');
  wsConnection.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'status') {
        if (msg.status === 'connected') return;
        if (msg.status === 'listening_on') { setMicUI(true); }
        if (msg.status === 'listening_off') { setMicUI(false); setListeningWindow(0, 0); if (ephemeralEl) { ephemeralEl.remove(); ephemeralEl = null; } }
        if (msg.status === 'hotword_listening') { setMicUI(true, '호출어 대기 중'); setListeningWindow(0, 0); if (ephemeralEl) { ephemeralEl.remove(); ephemeralEl = null; } }
        if (msg.status === 'wakeup') { 
          // 시스템 상태 변경
          setMicUI(true);
          addCaption('assistant', '네, 말씀하세요.', { autohideMs: 4000 });
          // 마이크 활성화 상태 전환
          if (window.wsConnection?.readyState === WebSocket.OPEN) {
            window.wsConnection.send(JSON.stringify({
              type: 'status',
              status: 'listening_on'
            }));
          }
        }
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
      } else if (msg.type === 'calendar_update') {
        // 🚀 캘린더 실시간 업데이트 처리
        console.log(`📅 실시간 캘린더 업데이트 수신! (변경 #${msg.updateCount || '?'}) - ${msg.reason || 'unknown'}`);
        
        if (msg.events) {
          renderCalendar(msg.events);
          console.log(`📅 ${msg.events.length}개 일정으로 즉시 업데이트됨 (${new Date(msg.timestamp).toLocaleTimeString()})`);
        } else {
          // 서버에서 변경 알림만 받은 경우 다시 로드
          console.log('📅 캘린더 변경 알림 → 데이터 다시 로드');
          if (typeof loadCalendar === 'function') {
            loadCalendar();
          }
        }
        
        // 시각적 피드백 (선택사항)
        const calendarPanel = document.getElementById('calendar');
        if (calendarPanel) {
          calendarPanel.style.transition = 'background-color 0.3s';
          calendarPanel.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
          setTimeout(() => {
            calendarPanel.style.backgroundColor = '';
          }, 1000);
        }
      } else if (msg.type === 'personalized_message') {
        // 개인화된 메시지 업데이트
        $('advice').textContent = msg.message || '';
      } else if (msg.type === 'request_face_capture') {
        // 표정 분석 요청 - Raspberry Pi가 이미지를 보내면 서버로 전달
        console.log('📸 표정 분석 요청 받음');
        addCaption('assistant', '표정을 분석 중입니다...', { autohideMs: 3000 });
      } else if (msg.type === 'request_outfit_capture') {
        // 옷차림 분석 요청
        console.log('👔 옷차림 분석 요청 받음');
        addCaption('assistant', '옷차림을 확인 중입니다...', { autohideMs: 3000 });
      } else if (msg.type === 'face_emotion_result') {
        // 표정 분석 결과 표시
        const emotion = msg.emotion || 'neutral';
        const confidence = (msg.confidence * 100).toFixed(1);
        const message = msg.message || `${emotion} 표정이 ${confidence}% 감지되었습니다.`;
        addCaption('assistant', message, { autohideMs: 8000 });
      } else if (msg.type === 'outfit_analysis_result') {
        // 옷차림 분석 결과 표시
        const message = msg.message || '옷차림 분석이 완료되었습니다.';
        addCaption('assistant', message, { autohideMs: 8000 });
      }
    } catch (e) {}
  };
  wsConnection.onclose = () => { setMicUI(false); setTimeout(initWS, 2000); };
}
