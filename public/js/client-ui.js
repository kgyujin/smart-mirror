// UI 관련 유틸리티 함수들
const $ = (id) => document.getElementById(id);

const formatTime = (date) => {
  const h = date.getHours();
  const m = date.getMinutes();
  const isAM = h < 12; const hh = h % 12 === 0 ? 12 : h % 12;
  return `오${isAM ? '전' : '후'} ${hh}:${String(m).padStart(2,'0')}`;
};

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth()+1).padStart(2,'0');
  const day = String(date.getDate()).padStart(2,'0');
  const weekday = ['일','월','화','수','목','금','토'][date.getDay()];
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
};

const escapeHtml = (s) => {
  return s?.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) || '';
};

const formatEventTime = (start, end) => {
  try {
    const s = new Date(start), e = new Date(end);
    const sH = s.getHours(); const sM = String(s.getMinutes()).padStart(2,'0');
    const eH = e.getHours(); const eM = String(e.getMinutes()).padStart(2,'0');
    const sAM = sH < 12; const eAM = eH < 12;
    const sh = sH % 12 === 0 ? 12 : sH % 12; const eh = eH % 12 === 0 ? 12 : eH % 12;
    return `오${sAM?'전':'후'} ${sh}:${sM} ~ 오${eAM?'전':'후'} ${eh}:${eM}`;
  } catch { return ''; }
};

const setMicUI = (on, message = null) => {
  $('micDot').className = `status-dot ${on ? 'dot-on' : 'dot-off'}`;
  $('micText').textContent = message || (on ? '마이크 켜짐' : '마이크 꺼짐');
};

const setListeningWindow = (remainingMs, totalMs) => {
  const bar = $('listenBar');
  if (!bar) return;
  const fill = bar.querySelector('span');
  if (!totalMs || !remainingMs) { bar.style.opacity = 0; fill.style.width = '0%'; return; }
  const pct = Math.max(0, Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100)));
  fill.style.width = `${pct}%`;
  bar.style.opacity = 1;
};
