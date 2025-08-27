const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const ical = require('node-ical');
const { 
  CALENDAR_SOURCES_FILE,
  CREDENTIALS_PATH,
  TOKEN_PATH,
  CALENDAR_ICS_URLS
} = require('./config');
const { log } = require('./logging');

// ========== Google Calendar 연동 ==========
const getOAuth2ClientForCalendar = () => {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris?.[0]);
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
  } catch (error) {
    log.error('Calendar OAuth2 초기화 오류:', error);
    return null;
  }
};

const getTodayDateRangeISO = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
};

// 캘린더 소스 로딩: 파일 > ENV > 구글 API
const loadCalendarSources = () => {
  try {
    if (fs.existsSync(CALENDAR_SOURCES_FILE)) {
      const data = JSON.parse(fs.readFileSync(CALENDAR_SOURCES_FILE, 'utf8'));
      if (Array.isArray(data.ical) && data.ical.length > 0) {
        return { type: 'ical', urls: data.ical };
      }
    }
  } catch (e) { log.warn('calendar_sources.json 읽기 실패:', e.message); }
  const envUrls = CALENDAR_ICS_URLS.split(',').map(s => s.trim()).filter(Boolean);
  if (envUrls.length > 0) return { type: 'ical', urls: envUrls };
  return { type: 'google' };
};

const getKSTNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));

const getKstDayRange = () => {
  const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const start = new Date(kstNow);
  start.setHours(0,0,0,0);
  const end = new Date(kstNow);
  end.setHours(23,59,59,999);
  return { start, end };
};

const getKstDayRangeFor = (dateLike) => {
  const d = new Date(new Date(dateLike).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const start = new Date(d);
  start.setHours(0,0,0,0);
  const end = new Date(d);
  end.setHours(23,59,59,999);
  return { start, end };
};

const getNextUpcomingEvent = (events) => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  // Normalize to Date objects
  const normalized = events.map(ev => ({
    ...ev,
    _start: new Date(ev.start),
    _end: new Date(ev.end || ev.start)
  })).sort((a,b) => a._start - b._start);
  // Ongoing first
  const ongoing = normalized.find(ev => ev._start <= now && now < ev._end);
  if (ongoing) return { type: 'ongoing', event: ongoing };
  // Next upcoming
  const upcoming = normalized.find(ev => ev._start >= now);
  if (upcoming) return { type: 'upcoming', event: upcoming };
  return null;
};

const getEndOfKSTDay = (dateLike) => {
  const d = new Date(new Date(dateLike).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  d.setHours(23, 59, 59, 999);
  return d;
};

const fetchEventsFromICSInRange = async (urls, dayStart, dayEnd) => {
  const start = dayStart;
  const end = dayEnd;
  const events = [];
  const isAllDayByRange = (s, e) => {
    try {
      const ms = e.getTime() - s.getTime();
      return s.getHours() === 0 && s.getMinutes() === 0 && (ms >= 23 * 60 * 60 * 1000 || ms === 0);
    } catch { return false; }
  };
  for (const url of urls) {
    try {
      const data = await ical.async.fromURL(url, { timeout: 8000 });
      for (const key of Object.keys(data)) {
        const item = data[key];
        if (item.type !== 'VEVENT') continue;
        // Expand recurrences if present
        if (item.rrule) {
          const occurrences = item.rrule.between(start, end, true);
          for (const occ of occurrences) {
            const duration = (item.end && item.start) ? (item.end - item.start) : 0;
            const occEnd = new Date(occ.getTime() + Math.max(0, duration));
            const allDay = isAllDayByRange(new Date(occ), new Date(occEnd));
            events.push({
              id: `${item.uid || item.summary}-${occ.toISOString()}`,
              summary: item.summary || '(제목 없음)',
              start: occ.toISOString(),
              end: occEnd.toISOString(),
              isAllDay: allDay,
              location: item.location,
              htmlLink: item.url || item.source || null,
              calendar: url
            });
          }
        } else if (item.recurrences) {
          for (const rkey of Object.keys(item.recurrences)) {
            const ev = item.recurrences[rkey];
            if (ev.start <= end && ev.end >= start) {
              const allDay = isAllDayByRange(new Date(ev.start), new Date(ev.end));
              events.push({
                id: `${ev.uid || ev.summary}-${ev.start.toISOString()}`,
                summary: ev.summary || '(제목 없음)',
                start: ev.start.toISOString(),
                end: ev.end.toISOString(),
                isAllDay: allDay,
                location: ev.location,
                htmlLink: ev.url || null,
                calendar: url
              });
            }
          }
        } else {
          const s = item.start instanceof Date ? item.start : new Date(item.start);
          let e = item.end instanceof Date ? item.end : new Date(item.end || item.start);
          if (e >= start && s <= end) {
            const allDay = isAllDayByRange(new Date(s), new Date(e));
            // Treat zero-length all-day as full-day by normalizing end to end-of-day
            if (allDay && e.getTime() === s.getTime()) {
              e = getEndOfKSTDay(s);
            }
            events.push({
              id: `${item.uid || item.summary}-${s.toISOString()}`,
              summary: item.summary || '(제목 없음)',
              start: s.toISOString(),
              end: e.toISOString(),
              isAllDay: allDay,
              location: item.location,
              htmlLink: item.url || null,
              calendar: url
            });
          }
        }
      }
    } catch (e) {
      log.warn('ICS 로드 실패:', url, e.message);
    }
  }
  // 정렬
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
};

const fetchEventsForDay = async (targetDate = null) => {
  const source = loadCalendarSources();
  if (source.type === 'ical') {
    // For ICS, compute occurrences for the requested KST day
    const base = targetDate ? new Date(targetDate) : getKSTNow();
    const { start, end } = getKstDayRangeFor(base);
    return fetchEventsFromICSInRange(source.urls, start, end);
  }
  const oauth2Client = getOAuth2ClientForCalendar();
  if (!oauth2Client) throw new Error('캘린더 인증 없음');
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const base = targetDate ? new Date(targetDate) : new Date();
  const timeMin = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0).toISOString();
  const timeMax = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59).toISOString();
  const resp = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  });
  const events = (resp.data.items || []).map((ev) => {
    const start = ev.start?.dateTime || ev.start?.date;
    const end = ev.end?.dateTime || ev.end?.date;
    const isAllDay = !!(ev.start?.date && !ev.start?.dateTime);
    return {
      id: ev.id,
      summary: ev.summary || '(제목 없음)',
      start,
      end,
      isAllDay,
      hangoutLink: ev.hangoutLink,
      location: ev.location,
      htmlLink: ev.htmlLink,
    };
  });
  return events;
};

const fetchTodayEvents = async () => fetchEventsForDay();

const formatKoreanTime = (isoLike) => {
  if (!isoLike) return '';
  const d = new Date(isoLike);
  const h = d.getHours();
  const m = d.getMinutes();
  const isAM = h < 12;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `오${isAM ? '전' : '후'} ${String(hh)}:${String(m).padStart(2, '0')}`;
};

const formatKSTTimeFromISO = (isoLike) => {
  if (!isoLike) return '';
  const d = new Date(new Date(isoLike).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const h = d.getHours();
  const m = d.getMinutes();
  const isAM = h < 12;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `오${isAM ? '전' : '후'} ${String(hh)}:${String(m).padStart(2, '0')}`;
};

const computeBusyMinutes = (events) => {
  let total = 0;
  for (const ev of events) {
    if (ev.start && ev.end && ev.start.length > 10 && ev.end.length > 10) {
      const s = new Date(ev.start).getTime();
      const e = new Date(ev.end).getTime();
      if (e > s) total += Math.round((e - s) / 60000);
    }
  }
  return total;
};

const scoreEventImportance = (event) => {
  const title = (event.summary || '').toLowerCase();
  const highKeywords = ['마감', '데드라인', '고객', '면접', '발표', '수술', '시험', '출시', '프레젠테이션'];
  const mediumKeywords = ['회의', '미팅', '상담', '보고', '검토', '워크샵'];
  if (highKeywords.some(k => title.includes(k))) return 3;
  if (mediumKeywords.some(k => title.includes(k))) return 2;
  return 1;
};

const getRuleBasedAdviceForDay = (events) => {
  const count = events.length;
  const busy = computeBusyMinutes(events);
  const importanceStats = events.reduce((acc, ev) => { const s = scoreEventImportance(ev); acc.count += 1; acc.sum += s; if (s >= 3) acc.high += 1; else if (s === 2) acc.medium += 1; else acc.low += 1; return acc; }, { count: 0, sum: 0, high: 0, medium: 0, low: 0 });
  if (count === 0) return '일정이 없으니 가벼운 산책이나 정리 시간을 가져보세요.';
  if (count >= 6 || busy >= 360 || importanceStats.high >= 2) return '오늘은 무리하지 않는 편이 좋겠어요.';
  if (count >= 3 || busy >= 180 || importanceStats.high >= 1) return '중간중간 물과 간단한 스트레칭으로 컨디션을 유지해보세요.';
  return '여유로운 하루네요. 해야 할 일을 미리 정리해두면 좋습니다.';
};

// 일상 컨텍스트 빌드
const buildDayContext = async () => {
  // weather.js에서 import해야 할 경우를 위한 지연 로딩
  const { fetchWeatherData } = require('./weather');
  
  // 날씨
  let weatherText = '날씨 정보를 불러오지 못했습니다.';
  try {
    const weatherData = await fetchWeatherData();
    weatherText = `현재 ${weatherData.name} ${Math.round(weatherData.main.temp)}°C, ${weatherData.weather?.[0]?.description || ''}`;
  } catch (error) {
    log.warn('날씨 정보 로딩 실패:', error.message);
  }

  // 캘린더
  let events = [];
  try {
    events = await fetchTodayEvents();
  } catch (e) {
    log.warn('캘린더 로딩 실패:', e.message);
  }

  return { weatherText, events };
};

module.exports = {
  getOAuth2ClientForCalendar,
  getTodayDateRangeISO,
  loadCalendarSources,
  getKSTNow,
  getKstDayRange,
  getKstDayRangeFor,
  getNextUpcomingEvent,
  getEndOfKSTDay,
  fetchEventsFromICSInRange,
  fetchEventsForDay,
  fetchTodayEvents,
  formatKoreanTime,
  formatKSTTimeFromISO,
  computeBusyMinutes,
  scoreEventImportance,
  getRuleBasedAdviceForDay,
  buildDayContext
};
