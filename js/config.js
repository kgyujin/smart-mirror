require('dotenv').config();

const path = require('path');

// 환경 변수 설정
const PORT = process.env.PORT;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALWAYS_LISTEN = process.env.ALWAYS_LISTEN !== 'false';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const CITY_ID = process.env.CITY_ID;
const CALENDAR_ICS_URLS = process.env.CALENDAR_ICS_URLS || '';

// ETRI 음성인식 API 설정
const ETRI_API_KEY = process.env.ETRI_API_KEY || 'YOUR_ETRI_API_KEY';
const ETRI_API_URL = 'http://epretx.etri.re.kr:8000/api/WiseASR_Recognition';

// 음성인식 품질 개선 설정
const AUDIO_CHUNK_SIZE = Number(process.env.AUDIO_CHUNK_SIZE || 20); // 오디오 청크 크기 (약 1초)
const MIN_TEXT_LENGTH = Number(process.env.MIN_TEXT_LENGTH || 2); // 최소 텍스트 길이
const MAX_CONSECUTIVE_EMPTY = Number(process.env.MAX_CONSECUTIVE_EMPTY || 10); // 최대 연속 빈 결과

// 파일 경로 설정
const CALENDAR_SOURCES_FILE = path.join(__dirname, '..', 'calendar_sources.json');

// TTS 설정
const CAPTION_HIDE_AFTER_TTS_MS = Number(process.env.CAPTION_HIDE_AFTER_TTS_MS || 3000);

// 명령 설정
const COMMAND_SILENCE_TIMEOUT_MS = 12000; // 호출어 후 말할 수 있는 무음 허용 시간
const LISTENING_BROADCAST_INTERVAL_MS = 1000;

// 웨이크워드 설정
const WAKEWORD_TEST = /(미러야|밀어야|미뤄야|hi\s*mirror|하이\s*미러|하이미러)/i; // for .test
const WAKEWORD_REMOVE = /(미러야|밀어야|미뤄야|hi\s*mirror|하이\s*미러|하이미러)/ig; // for .replace

module.exports = {
  PORT,
  OPENAI_API_KEY,
  ALWAYS_LISTEN,
  WEATHER_API_KEY,
  CITY_ID,
  CALENDAR_ICS_URLS,
  CALENDAR_SOURCES_FILE,
  ETRI_API_KEY,
  ETRI_API_URL,
  AUDIO_CHUNK_SIZE,
  MIN_TEXT_LENGTH,
  MAX_CONSECUTIVE_EMPTY,
  CAPTION_HIDE_AFTER_TTS_MS,
  COMMAND_SILENCE_TIMEOUT_MS,
  LISTENING_BROADCAST_INTERVAL_MS,
  WAKEWORD_TEST,
  WAKEWORD_REMOVE
};
