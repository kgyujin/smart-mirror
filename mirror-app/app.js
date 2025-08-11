require('dotenv').config();

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { OAuth2Client } = require('google-auth-library');
const record = require('node-record-lpcm16').record;
const { SpeechClient } = require('@google-cloud/speech');
const wav = require('wav');
const { exec } = require('child_process');
const dns = require('node:dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
const ical = require('node-ical');
const { google } = require('googleapis');
const WebSocket = require('ws');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALWAYS_LISTEN = process.env.ALWAYS_LISTEN !== 'false';

// ========== 로그 제어 설정 ==========
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
};

const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO; // 이 값을 변경하여 로그 레벨 조정
const ENABLE_ASSISTANT_LOGS = false; // Assistant 응답 로그 on/off
const ENABLE_AUDIO_LOGS = false; // 오디오 관련 로그 on/off
const ENABLE_TTS_LOGS = true; // TTS 로그 on/off

const log = {
  error: (msg, ...args) => CURRENT_LOG_LEVEL >= LOG_LEVELS.ERROR && console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => CURRENT_LOG_LEVEL >= LOG_LEVELS.WARN && console.warn(`[WARN] ${msg}`, ...args),
  info: (msg, ...args) => CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO && console.log(`[INFO] ${msg}`, ...args),
  debug: (msg, ...args) => CURRENT_LOG_LEVEL >= LOG_LEVELS.DEBUG && console.log(`[DEBUG] ${msg}`, ...args),
  verbose: (msg, ...args) => CURRENT_LOG_LEVEL >= LOG_LEVELS.VERBOSE && console.log(`[VERBOSE] ${msg}`, ...args),
  assistant: (msg, ...args) => ENABLE_ASSISTANT_LOGS && console.log(`[ASSISTANT] ${msg}`, ...args),
  audio: (msg, ...args) => ENABLE_AUDIO_LOGS && console.log(`[AUDIO] ${msg}`, ...args),
  tts: (msg, ...args) => ENABLE_TTS_LOGS && console.log(`[TTS] ${msg}`, ...args)
};

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const CITY_ID = process.env.CITY_ID;
const CALENDAR_ICS_URLS = process.env.CALENDAR_ICS_URLS || '';
const CALENDAR_SOURCES_FILE = path.join(__dirname, 'calendar_sources.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const SPEECH_CREDENTIALS_PATH = path.join(__dirname, 'credentials_serviceAccount.json');

const speechClient = new SpeechClient({ keyFilename: SPEECH_CREDENTIALS_PATH });
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// In-memory weather cache for outage/timeout fallback
let weatherCache = { data: null, ts: 0 };

// Wakeword utilities
const WAKEWORD_TEST = /(미러야|밀어야|hi\s*mirror|하이\s*미러|하이미러)/i; // for .test
const WAKEWORD_REMOVE = /(미러야|밀어야|hi\s*mirror|하이\s*미러|하이미러)/ig; // for .replace

// Short beep on wake
const safeBeep = () => {
  try {
    // Requires sox: sudo apt-get install sox libsox-fmt-all
    exec('play -nq -t alsa synth 0.12 sine 880 vol 0.3', (err) => {
      if (err) {
        // Fallback: short, quiet espeak if play is unavailable
        exec('espeak -v ko -s 200 "" >/dev/null 2>&1', () => {});
      }
    });
  } catch {}
};

// Google Assistant gRPC 설정
const ASSISTANT_ENDPOINT = 'embeddedassistant.googleapis.com:443';
const PROTO_PATH = path.join(__dirname, 'google/assistant/embedded/v1alpha2/embedded_assistant.proto');

app.use(express.static('public'));
app.use(express.json());

// ========== 유틸: WebSocket 브로드캐스트 ==========
let wss = null;
const broadcast = (messageObj) => {
  try {
    if (!wss) return;
    const data = JSON.stringify(messageObj);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  } catch (err) {
    log.error('WebSocket 브로드캐스트 오류:', err);
  }
};

// 안전한 TTS 함수
const safeTTS = (text) => {
  if (!text || text.trim() === '') return;
  log.tts('시작:', text);
  try {
    const command = `echo "${text.replace(/"/g, '\\"')}" | espeak -s 150 -v ko`;
    exec(command, (error) => {
      if (error) {
        log.error('TTS 오류:', error.message);
      } else {
        log.tts('완료:', text);
      }
    });
  } catch (error) {
    log.error('TTS 실행 오류:', error);
  }
};

// 개선된 오디오-텍스트 변환 함수
const convertAudioToText = async (audioBuffer) => {
  try {
    const audioBytes = audioBuffer.toString('base64');
    
    // Speech Adaptation 적용
    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'ko-KR',
        // Speech Adaptation으로 정확도 향상
        adaptation: {
          phrase_sets: [
            {
              phrases: [
                { value: "현재 시간", boost: 20 },
                { value: "몇 시", boost: 20 },
                { value: "시간", boost: 15 },
                { value: "날씨", boost: 15 },
                { value: "온도", boost: 15 },
                { value: "서울", boost: 10 },
                { value: "대한민국", boost: 10 },
                { value: "수도", boost: 10 }
              ]
            }
          ]
        },
        // 모델 선택 최적화
        model: 'latest_long',
        useEnhanced: true
      },
    };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join(' ');
    
    return transcription;
  } catch (error) {
    log.error('오디오-텍스트 변환 오류:', error);
    return null;
  }
};

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

const buildDayContext = async () => {
  // 날씨
  let weatherText = '날씨 정보를 불러오지 못했습니다.';
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?id=${CITY_ID}&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
    const response = await axios.get(url);
    const data = response.data;
    weatherText = `현재 ${data.name} ${Math.round(data.main.temp)}°C, ${data.weather?.[0]?.description || ''}`;
  } catch {}

  // 캘린더
  let events = [];
  try {
    events = await fetchTodayEvents();
  } catch (e) {
    log.warn('캘린더 로딩 실패:', e.message);
  }

  return { weatherText, events };
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

// ========== External time API (KST) ==========
const fetchKSTNowFromAPI = async () => {
  try {
    const res = await axios.get('https://worldtimeapi.org/api/timezone/Asia/Seoul', { timeout: 5000 });
    // res.data.datetime is ISO 8601
    const now = new Date(res.data.datetime);
    return now;
  } catch (e) {
    log.warn('WorldTimeAPI 실패, 로컬 KST 대체 사용:', e.message);
    return getKSTNow();
  }
};

const formatTimeFromDate = (dateObj) => {
  const h = dateObj.getHours();
  const m = dateObj.getMinutes();
  const isAM = h < 12;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `오${isAM ? '전' : '후'} ${String(hh)}:${String(m).padStart(2, '0')}`;
};

const formatDateFromDate = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
};

const getWeekdayKorean = (dateObj) => ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][dateObj.getDay()];

// Compose natural text using facts only
const composeWithOpenAI = async (facts, instruction) => {
  if (!openai) return null;
  try {
    const system = `다음 사실만을 바탕으로 한국어로 간결하고 자연스럽게 답하세요. 새로운 정보를 추측하지 마세요. ${instruction || ''}`;
    const user = Array.isArray(facts) ? facts.join('\n') : String(facts);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [ { role: 'system', content: system }, { role: 'user', content: user } ],
      temperature: 0.2,
      max_tokens: 150,
    });
    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    log.warn('OpenAI compose 실패:', e.message);
    return null;
  }
};

const sanitizeAssistantText = (text) => {
  if (!text) return '';
  let t = String(text).trim();
  // Remove common greetings and trailing helper questions
  t = t.replace(/^안녕하세요[!！]?[\s,]*/i, '');
  t = t.replace(/다른 도움이 필요하신가요\??$/, '');
  t = t.replace(/더 도와드릴까요\??$/, '');
  // Collapse whitespace
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
};

const answerWithGPT = async (userText, extraContext = {}) => {
  try {
    const text = (userText || '').toLowerCase();
    // 주제별로 실시간 외부 API 기반의 결정적 응답 우선
    if (/날씨|기온|비|눈|온도|우산/.test(text)) {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?id=${CITY_ID}&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
        const response = await axios.get(url, { timeout: 6000 });
        const d = response.data;
        const reply = `현재 ${d.name} ${Math.round(d.main.temp)}도, ${d.weather?.[0]?.description || ''}입니다.`;
        return reply.trim();
      } catch {
        // fallback to cached weather if available via route
        try {
          const w = await axios.get(`http://localhost:${PORT}/api/weather`, { timeout: 4000 });
          const d = w.data;
          return `현재 ${d.name} ${Math.round(d.main?.temp ?? 0)}도, ${d.weather?.[0]?.description || ''}입니다.`;
        } catch {
          return '날씨 정보를 불러오지 못했습니다.';
        }
      }
    }
    if (/뉴스|속보|헤드라인/.test(text)) {
      try {
        const news = await axios.get(`http://localhost:${PORT}/api/news`, { timeout: 6000 });
        const items = news.data.articles?.slice(0, 3) || [];
        if (!items.length) return '뉴스를 불러오지 못했습니다.';
        if (openai) {
          // 자연스러운 문장: 제목들을 사실로 제공하고 간결한 문장으로 연결
          const system = '다음 기사 제목들을 바탕으로 오늘의 주요 뉴스를 한국어로 자연스럽게 한두 문장으로 요약하세요.';
          const user = items.map((it, i) => `(${i+1}) ${it.title}`).join('\n');
          try {
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              temperature: 0.2,
              max_tokens: 120,
            });
            const txt = completion.choices?.[0]?.message?.content?.trim();
            if (txt) return txt.replace(/\n+/g, ' ');
          } catch {}
        }
        const spoken = `오늘의 주요 뉴스입니다. ${items.map((it, i) => `${i === 0 ? '첫 번째' : i === 1 ? '두 번째' : '세 번째'} 뉴스는 ${it.title} 입니다.`).join(' ')}`;
        return spoken;
      } catch {
        return '뉴스 정보를 불러오지 못했습니다.';
      }
    }
    // 시간/날짜/요일의 경우에도 외부 API(월드타임)로 사실 확보 후 OpenAI 구성
    if (/(몇\s*시|현재\s*시간|지금\s*시간|time)/i.test(text)) {
      const nowApi = await fetchKSTNowFromAPI();
      const facts = [`현재 KST 시간: ${formatTimeFromDate(nowApi)}`];
      const composed = await composeWithOpenAI(facts, '현재 시간을 한 문장으로 말하세요.');
      return composed || `현재 시각은 ${formatTimeFromDate(nowApi)}입니다.`;
    }
    if (/(오늘|금일).*?(며칠|날짜|date|무슨\s*요일|요일)/i.test(text)) {
      const nowApi = await fetchKSTNowFromAPI();
      const dateStr = formatDateFromDate(nowApi);
      const weekday = getWeekdayKorean(nowApi);
      const facts = [`오늘 날짜: ${dateStr}`, `오늘 요일: ${weekday}`];
      const composed = await composeWithOpenAI(facts, '오늘의 날짜와 요일을 자연스럽게 말하세요.');
      return composed || `오늘은 ${dateStr}입니다${/요일/.test(text) ? ` ${weekday}입니다.` : '.'}`;
    }
    if (/(내일|모레|다음\s*주|이번\s*주)/.test(text) && /(며칠|날짜|요일)/.test(text)) {
      const nowApi = await fetchKSTNowFromAPI();
      let base = new Date(nowApi);
      if (/모레/.test(text)) base = new Date(base.getTime() + 2*24*60*60*1000);
      else if (/내일/.test(text)) base = new Date(base.getTime() + 1*24*60*60*1000);
      // 주 단위: 월요일 시작 기준으로 주중 특정 요일 등은 확장 필요. 우선 기준일을 설명
      const dateStr = formatDateFromDate(base);
      const weekday = getWeekdayKorean(base);
      const facts = [`기준 날짜: ${dateStr}`, `요일: ${weekday}`];
      const composed = await composeWithOpenAI(facts, '기준 날짜와 요일을 한국어 한 문장으로 말하세요.');
      return composed || `${dateStr} ${weekday}입니다.`;
    }
    // 내일/모레 날짜·요일 규칙 처리 (음성/채팅 공통)
    if (/(내일|모레)/.test(text) && /(날짜|며칠|요일)/.test(text)) {
      const offset = /모레/.test(text) ? 2 : 1;
      const { date, weekday } = getRelativeKSTDate(offset);
      const ans = /요일/.test(text) ? `${date} ${weekday}입니다.` : `${date}입니다.`;
      return ans;
    }
    if (/\b(오늘|금일)\b.*(일정|캘린더|스케줄|행사|약속)/.test(text) || /(오늘\s*일정\s*요약|브리핑)/.test(text)) {
      try {
        const events = await fetchEventsForDay(getKSTNow());
        if (!events.length) return '오늘 일정은 없습니다.';
        const lines = events.slice(0, 6).map((ev, i) => {
          const t = ev.isAllDay ? '하루종일' : formatKSTTimeFromISO(ev.start);
          return `(${i + 1}) ${t} ${ev.summary}`;
        }).join(' ');
        if (openai) {
          // 사실(이벤트) 기반으로 문장형 브리핑 생성
          const system = '다음 일정 리스트를 바탕으로 오늘 일정을 한국어로 간결하게 브리핑하세요. 종일은 "하루종일"로 말해 주세요.';
          const user = events.slice(0, 6).map((ev, i) => `(${i+1}) ${ev.isAllDay ? '하루종일' : formatKSTTimeFromISO(ev.start)} ${ev.summary}`).join('\n');
          try {
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              temperature: 0.2,
              max_tokens: 150,
            });
            const txt = completion.choices?.[0]?.message?.content?.trim();
            if (txt) return txt.replace(/\n+/g, ' ');
          } catch {}
        }
        return `오늘 일정 브리핑입니다. ${lines}`;
      } catch {
        return '일정을 가져오지 못했습니다.';
      }
    }
    if (/\b(내일)\b.*(일정|캘린더|스케줄|행사|약속)/.test(text)) {
      try {
        const base = new Date(getKSTNow().getTime() + 24*60*60*1000);
        const events = await fetchEventsForDay(base);
        if (!events.length) return '내일 일정은 없습니다.';
        const lines = events.slice(0, 6).map((ev, i) => {
          const t = ev.isAllDay ? '하루종일' : formatKSTTimeFromISO(ev.start);
          return `(${i + 1}) ${t} ${ev.summary}`;
        }).join(' ');
        return `내일 일정 브리핑입니다. ${lines}`;
      } catch {
        return '일정을 가져오지 못했습니다.';
      }
    }
    if (/(일정|캘린더|스케줄|행사|약속)/.test(text) || /(다음\s*일정|next\s*event)/i.test(text)) {
      try {
        const events = await fetchEventsForDay(getKSTNow());
        if (!events.length) return '오늘 일정은 없습니다.';
        const nextInfo = getNextUpcomingEvent(events) || { type: 'upcoming', event: events[0] };
        const ev = nextInfo.event;
        const timeText = ev.isAllDay ? '하루종일' : `${formatKSTTimeFromISO(ev.start)}`;
        const base = nextInfo.type === 'ongoing'
          ? `지금 진행 중인 일정은 ${ev.summary} 입니다.`
          : `다음 일정은 ${timeText} ${ev.summary} 입니다.`;
        const advice = getRuleBasedAdviceForDay(events);
        return advice ? `${base} ${advice}` : base;
      } catch {
        return '일정을 가져오지 못했습니다.';
      }
    }

    // 일반 대화는 GPT 사용하되, 컨텍스트에는 실시간 날씨/일정 포함
    if (!openai) return 'GPT API 키가 설정되지 않았습니다.';
    const { weatherText, events } = await buildDayContext();
    const calendarSummary = events.slice(0, 5).map((e, i) => `(${i + 1}) ${formatKoreanTime(e.start)} ${e.summary}`).join(' ');
    const system = '당신은 한국어 스마트 미러 비서입니다. 아주 간결하고 실용적으로 답변하세요. 인사말/작별 인사/후속 질문 금지. 사용자가 날씨/일정/뉴스를 명시적으로 묻지 않으면 해당 정보를 답변에 포함하지 마세요. 한 문장 또는 짧은 불릿만.';
    const user = `사용자 발화: ${userText}\n현재 날씨(참고용, 언급 금지): ${weatherText}\n오늘 일정(참고용, 언급 금지): ${calendarSummary || '없음'}\n추가 컨텍스트: ${JSON.stringify(extraContext)}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    const raw = completion.choices?.[0]?.message?.content?.trim() || '';
    return sanitizeAssistantText(raw) || '요청을 이해하지 못했습니다.';
  } catch (e) {
    log.error('GPT 대화 오류:', e.message);
    return '응답 생성에 실패했습니다.';
  }
};

// ========== 핫워드("미러야") 상시 듣기 ==========
let isMicListening = false;
let hotwordMode = 'hotword'; // 'hotword' | 'command'
let recognizeStream = null;
let micInstance = null;
let lastTranscriptAt = 0;
let commandBuffer = '';
let listeningWindowInterval = null;
const COMMAND_SILENCE_TIMEOUT_MS = 12000; // 호출어 후 말할 수 있는 무음 허용 시간
const LISTENING_BROADCAST_INTERVAL_MS = 1000;

const stopListeningWindowTicker = (notifyOff = true) => {
  if (listeningWindowInterval) {
    clearInterval(listeningWindowInterval);
    listeningWindowInterval = null;
  }
  if (notifyOff) {
    broadcast({ type: 'status', status: 'listening_off' });
  }
};

const startListeningWindowTicker = () => {
  stopListeningWindowTicker(false);
  const totalMs = COMMAND_SILENCE_TIMEOUT_MS;
  listeningWindowInterval = setInterval(() => {
    const elapsed = Date.now() - lastTranscriptAt;
    const remainingMs = Math.max(0, totalMs - elapsed);
    broadcast({ type: 'status', status: 'listening_window', remainingMs, totalMs });
    if (remainingMs <= 0) {
      // 타임아웃: 명령 모드 종료
      hotwordMode = 'hotword';
      commandBuffer = '';
      stopListeningWindowTicker();
      broadcast({ type: 'status', status: 'listening_timeout' });
      log.info('명령 청취 타임아웃');
    }
  }, LISTENING_BROADCAST_INTERVAL_MS);
};

// 유틸: 호출어만 말했는지 판별
const isWakewordOnly = (text) => {
  if (!text) return false;
  const normalized = text.replace(/[\s.,!?~]+/g, '').toLowerCase();
  return normalized === '미러야' || normalized === '밀어야' || normalized === 'himirror' || normalized === '하이미러';
};

// 유틸: KST 기준 시간/날짜 포매팅
const getKSTNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
const formatKSTTime = () => {
  const now = getKSTNow();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const isAM = hours < 12;
  const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
  return `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;
};
const formatKSTDate = () => {
  const now = getKSTNow();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
};

const getRelativeKSTDate = (offsetDays) => {
  const base = getKSTNow();
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const weekday = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][d.getDay()];
  return { date: `${year}년 ${month}월 ${day}일`, weekday };
};

const getEndOfKSTDay = (dateLike) => {
  const d = new Date(new Date(dateLike).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  d.setHours(23, 59, 59, 999);
  return d;
};

const startContinuousHotwordListener = () => {
  if (isMicListening) return;
  isMicListening = true;
  hotwordMode = 'hotword';
  commandBuffer = '';
  lastTranscriptAt = Date.now();

  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'ko-KR',
      adaptation: {
        phrase_sets: [
          { phrases: [
            { value: '미러야', boost: 40 },
            { value: '밀어야', boost: 35 },
            { value: '하이 미러', boost: 35 },
            { value: '하이미러', boost: 35 },
            { value: 'Hi Mirror', boost: 35 }
          ] }
        ]
      },
      model: 'latest_long',
      useEnhanced: true,
    },
    interimResults: true,
  };

  recognizeStream = speechClient
    .streamingRecognize(request)
    .on('error', (err) => {
      log.error('스트리밍 STT 오류:', err.message);
      broadcast({ type: 'status', status: 'stt_error', message: err.message });
      stopContinuousHotwordListener();
      setTimeout(() => startContinuousHotwordListener(), 3000);
    })
    .on('data', async (data) => {
      try {
        const result = data.results?.[0];
        if (!result) return;
        const transcript = result.alternatives?.[0]?.transcript || '';
        const isFinal = !!result.isFinal;
        if (!transcript) return;
        lastTranscriptAt = Date.now();
        // Only show live captions when in command mode and exclude wakewords
        if (hotwordMode === 'command') {
          const cleanText = transcript.replace(WAKEWORD_REMOVE, '').trim();
          if (cleanText) {
            broadcast({ type: 'transcript', role: 'user', text: cleanText, final: isFinal, mode: hotwordMode });
          }
        }

        if (hotwordMode === 'hotword' && WAKEWORD_TEST.test(transcript)) {
          hotwordMode = 'command';
          commandBuffer = '';
          broadcast({ type: 'status', status: 'listening_on' });
          safeBeep();
          lastTranscriptAt = Date.now();
          startListeningWindowTicker();
          return;
        }

        if (hotwordMode === 'command') {
          // 사용자가 말하는 동안에는 대기만 하고, 최종 문장 확정 시에만 처리
          if (isFinal) {
            const finalCommand = transcript.replace(WAKEWORD_REMOVE, '').trim();
            // 호출어만 인식되었거나 아직 내용이 없는 경우에는 계속 대기
            if (!finalCommand) {
              lastTranscriptAt = Date.now();
              return;
            }
            commandBuffer = '';
            stopListeningWindowTicker();
            broadcast({ type: 'status', status: 'processing' });
            await processRecognizedCommand(finalCommand);
            hotwordMode = 'hotword';
            broadcast({ type: 'status', status: 'listening_off' });
          }
        }
      } catch (e) {
        log.error('STT 데이터 처리 오류:', e);
      }
    });

  micInstance = record({
    sampleRateHertz: 16000,
    threshold: 0,
    verbose: false,
    recordProgram: 'arecord',
    silence: '1.0',
  });
  micInstance.stream().on('error', (err) => log.error('마이크 오류:', err)).pipe(recognizeStream);
  log.info('상시 듣기 시작(핫워드: "미러야")');
};

const stopContinuousHotwordListener = () => {
  if (!isMicListening) return;
  try { if (micInstance) micInstance.stop(); } catch {}
  try { if (recognizeStream) recognizeStream.destroy(); } catch {}
  micInstance = null;
  recognizeStream = null;
  isMicListening = false;
  hotwordMode = 'hotword';
  commandBuffer = '';
  broadcast({ type: 'status', status: 'listening_off' });
  log.info('상시 듣기 중지');
};

const processRecognizedCommand = async (text) => {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  log.info('명령 처리:', trimmed);
  let reply = '';
  try {
    if (/뉴스/.test(trimmed)) {
      try {
        // 우선 카테고리 추론용 POST 시도
        const newsRes = await axios.post(`http://localhost:${PORT}/api/news`, { query: trimmed });
        if (newsRes.data?.response) {
          reply = newsRes.data.response;
        } else {
          // 없으면 최신 뉴스 GET으로 대체
          const latest = await axios.get(`http://localhost:${PORT}/api/news`);
          const items = latest.data.articles?.slice(0, 3) || [];
          reply = items.length ? `오늘의 주요 뉴스입니다. ${items.map((it, i) => `(${i + 1}) ${it.title}`).join(' ')}` : '뉴스 정보를 불러올 수 없습니다.';
        }
      } catch {
        // 최종 폴백: GET으로 재시도
        try {
          const latest = await axios.get(`http://localhost:${PORT}/api/news`);
          const items = latest.data.articles?.slice(0, 3) || [];
          reply = items.length ? `오늘의 주요 뉴스입니다. ${items.map((it, i) => `(${i + 1}) ${it.title}`).join(' ')}` : '뉴스 정보를 불러올 수 없습니다.';
        } catch {
          reply = '뉴스 정보를 가져오는 데 실패했습니다.';
        }
      }
    } else if (/날씨/.test(trimmed)) {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?id=${CITY_ID}&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
        const response = await axios.get(url);
        const d = response.data;
        reply = `현재 ${d.name} ${Math.round(d.main.temp)}도, ${d.weather?.[0]?.description || ''}입니다.`;
      } catch {
        reply = '날씨 정보를 불러오지 못했습니다.';
      }
    } else if (/(일정|캘린더|스케줄)/.test(trimmed) || /(다음\s*일정|next\s*event)/i.test(trimmed)) {
      try {
        const events = await fetchTodayEvents();
        if (!events.length) {
          reply = '오늘 일정은 없습니다.';
        } else {
          const nextInfo = getNextUpcomingEvent(events) || { type: 'upcoming', event: events[0] };
          const ev = nextInfo.event;
          const timeText = ev.isAllDay ? '하루종일' : `${formatKSTTimeFromISO(ev.start)}`;
          reply = nextInfo.type === 'ongoing'
            ? `지금 진행 중인 일정은 ${ev.summary} 입니다.`
            : `다음 일정은 ${timeText} ${ev.summary} 입니다.`;
          // GPT 조언 추가
          const advice = getRuleBasedAdviceForDay(events);
          if (advice) reply += ` ${advice}`;
        }
      } catch (e) {
        reply = '일정을 가져오지 못했습니다.';
      }
    } else if (/(몇\s*시|현재\s*시간|지금\s*시간|time)/i.test(trimmed)) {
      reply = `현재 시각은 ${formatKSTTime()}입니다.`;
    } else if (/(며칠|날짜|date|무슨\s*요일|요일)/i.test(trimmed)) {
      const now = getKSTNow();
      const weekday = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][now.getDay()];
      reply = `오늘은 ${formatKSTDate()}입니다.`;
      if (/(요일)/.test(trimmed)) reply += ` ${weekday}입니다.`;
    } else {
      // 일반 대화는 GPT에 위임
      reply = await answerWithGPT(trimmed);
    }
  } catch (e) {
    log.error('명령 처리 오류:', e.message);
    reply = '요청을 처리하는 중 문제가 발생했습니다.';
  }
  broadcast({ type: 'response', role: 'assistant', text: reply });
  safeTTS(reply);
  // mic 상태 복귀는 호출부에서 제어 (최종 응답 이후)
  return reply;
};

// 뉴스 관련 질의 감지 함수 추가
const isNewsQuery = (query) => {
  const newsKeywords = [
    '뉴스', '오늘 뉴스', '오늘의 뉴스', '어제 뉴스', '주요 뉴스', '속보',
    '정치 뉴스', '경제 뉴스', '사회 뉴스', '국제 뉴스', '연예 뉴스', '스포츠 뉴스'
  ];
  return newsKeywords.some(kw => query.includes(kw));
};

// OAuth2 토큰 기반 gRPC credentials 생성
const createOAuth2Credentials = async () => {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
    
    const { client_secret, client_id } = credentials.installed || credentials.web;
    
    const oauth2Client = new OAuth2Client(client_id, client_secret);
    oauth2Client.setCredentials(tokens);
    
    const { credentials: refreshedTokens } = await oauth2Client.refreshAccessToken();
    
    const metadata = new grpc.Metadata();
    metadata.add('authorization', `Bearer ${refreshedTokens.access_token}`);
    
    return {
      credentials: grpc.credentials.createSsl(),
      metadata: metadata
    };
  } catch (error) {
    log.error('OAuth2 credentials 생성 오류:', error);
    throw error;
  }
};

// Google Assistant gRPC 클라이언트 생성
const createAssistantClient = async () => {
  try {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [
        path.join(__dirname), // 현재 디렉토리
        path.join(__dirname, 'google'),
        path.join(__dirname, 'google/assistant/embedded/v1alpha2'),
      ],
    });

    const assistantProto = grpc.loadPackageDefinition(packageDefinition);

    // 구조 검증
    const assistantConstructor = assistantProto?.google?.assistant?.embedded?.v1alpha2?.EmbeddedAssistant;
    if (!assistantConstructor) {
      throw new Error('[FATAL] assistantProto 구조 로딩 실패: EmbeddedAssistant 없음');
    }

    const { credentials } = await createOAuth2Credentials();

    const client = new assistantConstructor(ASSISTANT_ENDPOINT, credentials);

    return client;
  } catch (error) {
    log.error('Assistant 클라이언트 생성 오류:', error);
    throw error;
  }
};


// 개선된 Google Assistant 대화 함수
const conversateWithAssistant = async (audioData, query) => {
  return new Promise(async (resolve, reject) => {
    try {
      const client = await createAssistantClient();
      const { metadata } = await createOAuth2Credentials();
      
      const call = client.Assist(metadata);
      let assistantResponse = '';
      let hasResponse = false;
      let audioResponseBuffer = Buffer.alloc(0);
      let responseCount = 0;
      
      // 타임아웃을 30초로 증가 (복잡한 질문 대응)
      const timeout = setTimeout(() => {
        if (!hasResponse) {
          call.cancel();
          reject(new Error('Google Assistant 응답 시간 초과'));
        }
      }, 30000);
      
      call.on('data', async (response) => {
        responseCount++;
        log.assistant(`응답 수신 #${responseCount}`);
        
        // 텍스트 응답 처리 (우선순위 1)
        if (response.dialog_state_out && response.dialog_state_out.supplemental_display_text) {
          assistantResponse = response.dialog_state_out.supplemental_display_text;
          hasResponse = true;
          log.info('✅ Google Assistant 텍스트 응답:', assistantResponse);
          clearTimeout(timeout);
          return;
        }
        
        // 오디오 응답 수집 (우선순위 2)
        if (response.audio_out && response.audio_out.audio_data) {
          log.audio(`오디오 응답 수신됨, 크기: ${response.audio_out.audio_data.length}`);
          const audioChunk = Buffer.from(response.audio_out.audio_data);
          audioResponseBuffer = Buffer.concat([audioResponseBuffer, audioChunk]);
        }
      });
      
      call.on('end', async () => {
        log.info('Assistant 대화 종료');
        clearTimeout(timeout);
        
        // 텍스트 응답이 있으면 그것을 사용
        if (hasResponse && assistantResponse) {
          resolve(assistantResponse);
          return;
        }
        
        // 텍스트 응답이 없고 오디오 응답이 있으면 STT로 변환
        if (audioResponseBuffer.length > 0) {
          log.info(`오디오 응답을 텍스트로 변환 중... (총 크기: ${audioResponseBuffer.length} bytes)`);
          
          try {
            const convertedText = await convertAudioToText(audioResponseBuffer);
            if (convertedText && convertedText.trim()) {
              assistantResponse = convertedText.trim();
              log.info('✅ 오디오에서 변환된 텍스트:', assistantResponse);
              resolve(assistantResponse);
            } else {
              reject(new Error('오디오 응답을 텍스트로 변환할 수 없습니다.'));
            }
          } catch (conversionError) {
            log.error('오디오-텍스트 변환 실패:', conversionError);
            reject(new Error('오디오 응답 변환 실패'));
          }
        } else {
          reject(new Error('Google Assistant로부터 응답을 받지 못했습니다.'));
        }
      });
      
      call.on('error', (error) => {
        log.error('Assistant 대화 오류:', error);
        clearTimeout(timeout);
        reject(error);
      });
      
      // 개선된 설정
      const config = {
        audio_in_config: {
          encoding: 'LINEAR16',
          sample_rate_hertz: 16000
        },
        audio_out_config: {
          encoding: 'LINEAR16',
          sample_rate_hertz: 16000,
          volume_percentage: 100
        },
        dialog_state_in: {
          language_code: 'ko-KR',
          is_new_conversation: true,
          // 대화 상태 개선
          device_location: {
            country_code: 'KR',
            coordinates: {
              latitude: 37.5665,
              longitude: 126.9780
            }
          }
        },
        device_config: {
          device_id: 'smart-mirror-' + Date.now(),
          device_model_id: 'smart-mirror-model',
          // 디바이스 기능 명시
          supported_traits: [
            'action.devices.traits.OnOff',
            'action.devices.traits.Brightness'
          ]
        }
      };
      
      call.write({ config });
      
      // 오디오 데이터를 청크로 전송
      const chunkSize = 3200;
      let offset = 0;
      
      const sendAudioChunk = () => {
        if (offset >= audioData.length) {
          call.end();
          return;
        }
        
        const chunk = audioData.slice(offset, offset + chunkSize);
        call.write({ audio_in: chunk });
        offset += chunkSize;
        
        setTimeout(sendAudioChunk, 100);
      };
      
      setTimeout(sendAudioChunk, 100);
      
    } catch (error) {
      log.error('Assistant 대화 설정 오류:', error);
      reject(error);
    }
  });
};

// 토큰 확인
const checkTokenExists = () => {
  const requiredFiles = [
    CREDENTIALS_PATH,
    TOKEN_PATH,
    PROTO_PATH,
    path.join(__dirname, 'google/api/annotations.proto'),
    path.join(__dirname, 'google/api/http.proto'),
    path.join(__dirname, 'google/type/latlng.proto')
  ];
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      log.error(`필요한 파일이 없습니다: ${file}`);
      return false;
    }
  }
  
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
    if (!tokens.refresh_token) {
      log.error('refresh_token이 없습니다. node auth.js를 실행해주세요.');
      return false;
    }
  } catch (error) {
    log.error('tokens.json 파일을 읽을 수 없습니다.');
    return false;
  }
  
  return true;
};

app.get('/api/weather', async (req, res) => {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?id=${CITY_ID}&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
    const response = await axios.get(url, { timeout: 6000 });
    // 캐시 저장
    weatherCache = { data: response.data, ts: Date.now() };
    res.json(response.data);
  } catch (err) {
    log.error('날씨 API 오류:', err);
    if (weatherCache.data && Date.now() - weatherCache.ts < 6 * 60 * 60 * 1000) {
      // 6시간 내 마지막 성공값을 제공 (stale 표시)
      return res.json({ ...weatherCache.data, _stale: true });
    }
    res.status(500).json({ error: '날씨 정보를 가져오는 데 실패했습니다.' });
  }
});

app.get('/api/assistant', async (req, res) => {
  try {
    if (!checkTokenExists()) {
      return res.status(401).json({ 
        error: '필요한 파일들이 없습니다. 설정을 확인해주세요.' 
      });
    }

    const outputPath = path.join(__dirname, 'user_input.wav');
    const fileWriter = new wav.FileWriter(outputPath, {
      channels: 1,
      sampleRate: 16000,
      bitDepth: 16,
    });

    const mic = record({
      sampleRateHertz: 16000,
      threshold: 0,
      verbose: false, // 마이크 로그 비활성화
      recordProgram: 'sox',
      silence: '2.0',
    });

    mic.stream()
      .on('data', () => {
        log.verbose('사용자 음성 수신 중...');
      })
      .on('error', (err) => {
        log.error('마이크 오류:', err);
      })
      .pipe(fileWriter);

    let hasResponded = false;

    const sendResponse = (data) => {
      if (!hasResponded) {
        hasResponded = true;
        res.json(data);
      }
    };

    setTimeout(async () => {
      fileWriter.end();
      mic.stop();

      const file = fs.readFileSync(outputPath);
      const audioBytes = file.toString('base64');

      const request = {
        audio: { content: audioBytes },
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'ko-KR',
        },
      };

      try {
        const [response] = await speechClient.recognize(request);
        const transcription = response.results
          .map(result => result.alternatives[0].transcript)
          .join('\n');
        log.info('사용자 음성 인식 결과:', transcription);

        if (
          transcription.toLowerCase().includes('ok google') ||
          transcription.includes('오케이 구글')
        ) {
          log.info('Assistant 트리거됨:', transcription);

          const query = transcription.replace(/ok google|오케이 구글/gi, '').trim();
          log.info('추출된 쿼리:', query);

          if (isNewsQuery(query)) {
            try {
              const newsRes = await axios.post(`http://localhost:${PORT}/api/news`, { query });
              const newsResponse = newsRes.data.response || '뉴스 정보를 불러올 수 없습니다.';
              log.info('뉴스 직접 응답:', newsResponse);
              safeTTS(newsResponse);
              return sendResponse({
                response: newsResponse,
                success: true,
                source: 'rss_news_direct',
                query
              });
            } catch (e) {
              log.error('뉴스 직접 처리 실패:', e);
              return sendResponse({
                error: '뉴스 정보를 가져오는 데 실패했습니다.',
                source: 'rss_news_direct',
                query
              });
            }
          }

          try {
            const audioBuffer = fs.readFileSync(outputPath);
            const pcmData = audioBuffer.slice(44);
            
            log.info('Google Assistant와 실제 대화 시작...');
            const assistantResponse = await conversateWithAssistant(pcmData, query);
            
            log.info('✅ Google Assistant 실제 응답:', assistantResponse);
            safeTTS(assistantResponse);
            
            sendResponse({ 
              response: assistantResponse,
              success: true,
              source: 'google_assistant_enhanced',
              query: query
            });
            
          } catch (assistantError) {
            log.error('Google Assistant 오류:', assistantError);
            sendResponse({ 
              error: 'Google Assistant 처리 실패: ' + assistantError.message,
              query: query
            });
          }

        } else {
          sendResponse({ response: `"${transcription}" → 어시스턴트 트리거 조건이 아닙니다.` });
        }
      } catch (err) {
        log.error('STT 오류:', err);
        sendResponse({ error: '음성 인식 실패: ' + err.message });
      }
    }, 4000);
  } catch (err) {
    log.error('API 처리 오류:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Assistant 처리 실패: ' + err.message });
    }
  }
});

// 현재 시간/날짜 제공 API
/*
app.get('/api/time', (req, res) => {
  const now = new Date();

  // 한국 시간(KST) 기준
  // const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC +9

  const hours = kstNow.getHours();
  const minutes = kstNow.getMinutes();
  const isAM = hours < 12;
  const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
  const formattedTime = `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;

  const year = kstNow.getFullYear();
  const month = (kstNow.getMonth() + 1).toString().padStart(2, '0');
  const day = kstNow.getDate().toString().padStart(2, '0');
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][kstNow.getDay()];
  const formattedDate = `${year}년 ${month}월 ${day}일 (${weekday})`;

  res.json({
    time: formattedTime,
    date: formattedDate
  });
});
*/

app.get('/api/time', (req, res) => {
  const now = new Date();

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const isAM = hours < 12;
  const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
  const formattedTime = `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;

  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
  const formattedDate = `${year}년 ${month}월 ${day}일 (${weekday})`;

  res.json({
    time: formattedTime,
    date: formattedDate
  });
});

app.get('/api/news', async (req, res) => {
  const rssParser = new (require('rss-parser'))();
  const rssUrl = 'https://www.yna.co.kr/rss/news.xml';

  try {
    const feed = await rssParser.parseURL(rssUrl);
    const articles = feed.items.slice(0, 5).map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
    }));
    res.json({ articles });
  } catch (err) {
    log.error('뉴스 불러오기 실패:', err);
    res.status(500).json({ error: '뉴스 정보를 가져오는 데 실패했습니다.' });
  }
});

const RSSParser = require('rss-parser');
const rssParser = new RSSParser();
app.post('/api/news', async (req, res) => {
  const userQuery = (req.body.query || '').toLowerCase();
  const rssMap = {
    latest: 'https://www.yna.co.kr/rss/news.xml',
    politics: 'https://www.yna.co.kr/rss/politics.xml',
    northkorea: 'https://www.yna.co.kr/rss/northkorea.xml',
    economy: 'https://www.yna.co.kr/rss/economy.xml',
    market: 'https://www.yna.co.kr/rss/market.xml',
    industry: 'https://www.yna.co.kr/rss/industry.xml',
    society: 'https://www.yna.co.kr/rss/society.xml',
    local: 'https://www.yna.co.kr/rss/local.xml',
    international: 'https://www.yna.co.kr/rss/international.xml',
    culture: 'https://www.yna.co.kr/rss/culture.xml',
    health: 'https://www.yna.co.kr/rss/health.xml',
    entertainment: 'https://www.yna.co.kr/rss/entertainment.xml',
    sports: 'https://www.yna.co.kr/rss/sports.xml',
    opinion: 'https://www.yna.co.kr/rss/opinion.xml',
    people: 'https://www.yna.co.kr/rss/people.xml',
    it: 'https://www.yna.co.kr/rss/industry.xml',
    tech: 'https://www.yna.co.kr/rss/industry.xml'
  };

  const categoryKeywords = {
    politics: ['정치'],
    northkorea: ['북한'],
    economy: ['경제'],
    market: ['마켓', '증시'],
    industry: ['산업'],
    society: ['사회'],
    local: ['지역', '전국'],
    international: ['세계', '국제'],
    culture: ['문화'],
    health: ['건강'],
    entertainment: ['연예', '엔터테인먼트'],
    sports: ['스포츠', '운동'],
    opinion: ['오피니언', '사설'],
    people: ['사람들'],
    it: ['it', '아이티', '테크', '기술', '디지털']
  };

  // 쿼리에서 카테고리 추론
  let category = null;
  for (const [key, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(k => userQuery.includes(k))) {
      category = key;
      break;
    }
  }
  
  // 매칭되는 카테고리가 없으면 에러 응답
  if (!category) {
    // category 미매칭 시 최신 뉴스로 대응
    try {
      const feed = await rssParser.parseURL(rssMap.latest);
      const topItems = feed.items.slice(0, 3);
      const spokenList = topItems.map((item, i) => `(${i + 1}) ${item.title}`).join(' ');
      return res.json({ response: `오늘의 주요 뉴스입니다. ${spokenList}`, category: 'latest' });
    } catch (e) {
      return res.status(200).json({ response: '뉴스를 불러오지 못했습니다.', category: null });
    }
  }
  
  const rssUrl = rssMap[category];
  
  try {
    const feed = await rssParser.parseURL(rssUrl);
    const topItems = feed.items.slice(0, 3);
    const spokenList = topItems.map((item, i) => `(${i + 1}) ${item.title}`).join(' ');
    
    const categoryNames = {
      latest: '오늘의 주요 뉴스',
      politics: '정치 뉴스',
      northkorea: '북한 관련 뉴스',
      economy: '경제 뉴스',
      market: '증시 뉴스',
      industry: '산업 뉴스',
      society: '사회 뉴스',
      local: '지역 뉴스',
      international: '국제 뉴스',
      culture: '문화 뉴스',
      health: '건강 뉴스',
      entertainment: '연예 뉴스',
      sports: '스포츠 뉴스',
      opinion: '오피니언 뉴스',
      people: '인물 뉴스',
    };
    
    const categoryTitle = categoryNames[category] || '뉴스';
    
    const responseText = `${categoryTitle}입니다. ${spokenList}`;
    res.json({ response: responseText, category });
  } catch (error) {
    log.error('뉴스 질문 처리 실패:', error);
    res.status(500).json({ error: '뉴스 정보를 가져오는 데 실패했습니다.' });
  }
});

// ========== 캘린더/요약/GPT/마이크 API ==========
app.get('/api/calendar/today', async (req, res) => {
  try {
    const events = await fetchTodayEvents();
    res.json({ events });
  } catch (e) {
    log.error('캘린더 today 오류:', e.message);
    res.status(500).json({ error: '캘린더를 불러오지 못했습니다.' });
  }
});

app.get('/api/summary', async (req, res) => {
  try {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const isAM = hours < 12;
    const hourDisplay = hours % 12 === 0 ? 12 : hours % 12;
    const formattedTime = `오${isAM ? '전' : '후'} ${hourDisplay}:${minutes.toString().padStart(2, '0')}`;
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
    const formattedDate = `${year}년 ${month}월 ${day}일 (${weekday})`;

    const { weatherText, events } = await buildDayContext();
    const advice = getRuleBasedAdviceForDay(events);
    res.json({ time: formattedTime, date: formattedDate, weather: weatherText, events, advice });
  } catch (e) {
    res.status(500).json({ error: '요약을 생성하지 못했습니다.' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const message = (req.body.message || '').toString();
    if (!message) return res.status(400).json({ error: 'message 필요' });
    // 음성과 동일한 파이프라인 사용
    const reply = await processRecognizedCommand(message);
    res.json({ reply: reply || '' });
  } catch (e) {
    res.status(500).json({ error: '채팅 처리 실패' });
  }
});

app.post('/api/mic/toggle', (req, res) => {
  try {
    if (isMicListening) {
      stopContinuousHotwordListener();
      return res.json({ listening: false });
    }
    startContinuousHotwordListener();
    res.json({ listening: true });
  } catch (e) {
    res.status(500).json({ error: '마이크 토글 실패' });
  }
});

// 헬스체크 엔드포인트
app.get('/api/health', (req, res) => {
  const tokenExists = checkTokenExists();
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    tokenExists: tokenExists
  });
});

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
  log.error('서버 에러:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });
});

const server = app.listen(PORT, () => {
  log.info(`서버 실행 중: http://localhost:${PORT}`);
  log.info('Google Assistant 향상된 서비스 준비 완료');
  
  if (!checkTokenExists()) {
    log.warn('필요한 파일들을 확인해주세요.');
  } else {
    log.info('✅ 모든 설정 파일이 확인되었습니다.');
  }
});

// WebSocket 서버 연결
wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'status', status: 'connected' }));
});

// 상시 리스닝 시작
if (ALWAYS_LISTEN) {
  startContinuousHotwordListener();
}

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
  log.info('서버 종료 중...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log.error('처리되지 않은 예외 (계속 실행):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('처리되지 않은 Promise 거부 (계속 실행):', reason);
});