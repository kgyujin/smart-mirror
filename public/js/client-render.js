// 렌더링 관련 함수들

function renderCalendar(events) {
  const box = $('calendarList');
  box.innerHTML = '';
  if (!events.length) {
    box.innerHTML = '<div class="item"><div class="left"><span class="title">오늘 일정이 없습니다.</span></div></div>';
    return;
  }
  const now = new Date();
  const upcomingOrCurrent = [];
  const past = [];
  for (const ev of events) {
    const div = document.createElement('div');
    const start = new Date(ev.start);
    const end = new Date(ev.end || ev.start);
    const isAllDay = !!ev.isAllDay || (
      start.getHours() === 0 && start.getMinutes() === 0 &&
      ((end.getHours() === 23 && end.getMinutes() >= 50) || (end.getHours() === 0 && end.getMinutes() === 0))
    );
    let itemClass = 'item';
    if (!isAllDay) {
      if (end <= now) itemClass += ' past';
      else if (start <= now && now < end) itemClass += ' current';
    }
    div.className = itemClass;
    const timeStr = isAllDay ? '하루종일' : formatEventTime(start, end);
    div.innerHTML = `<div class="left"><span class="time">${timeStr}</span><span class="title">${escapeHtml(ev.summary || '(제목 없음)')}</span></div>` + (ev.htmlLink ? `<a href="${ev.htmlLink}" target="_blank">열기</a>` : '<span></span>');
    if (!isAllDay && end <= now) past.push(div); else upcomingOrCurrent.push(div);
  }
  const ordered = [...upcomingOrCurrent, ...past];
  for (const el of ordered.slice(0, 8)) box.appendChild(el);
}

function renderNews(articles) {
  const box = $('newsList');
  box.innerHTML = '';
  if (!articles.length) {
    box.innerHTML = '<div class="item"><div class="left"><span class="title">뉴스를 불러오지 못했습니다.</span></div></div>';
    return;
  }
  for (const a of articles.slice(0, 6)) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<div class="left"><span class="title">${escapeHtml(a.title)}</span></div>`;
    box.appendChild(div);
  }
}
