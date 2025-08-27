require('dotenv').config();

const path = require('path');

// 환경 변수 설정
const PORT = process.env.PORT;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALWAYS_LISTEN = process.env.ALWAYS_LISTEN !== 'false';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const CITY_ID = process.env.CITY_ID;
const CALENDAR_ICS_URLS = process.env.CALENDAR_ICS_URLS || '';

// 파일 경로 설정
const CALENDAR_SOURCES_FILE = path.join(__dirname, '..', 'calendar_sources.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'tokens.json');
const SPEECH_CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials_serviceAccount.json');
const PROTO_PATH = path.join(__dirname, '..', 'google/assistant/embedded/v1alpha2/embedded_assistant.proto');

// TTS 설정
const CAPTION_HIDE_AFTER_TTS_MS = Number(process.env.CAPTION_HIDE_AFTER_TTS_MS || 3000);

// 명령 설정
const COMMAND_SILENCE_TIMEOUT_MS = 12000; // 호출어 후 말할 수 있는 무음 허용 시간
const LISTENING_BROADCAST_INTERVAL_MS = 1000;

// 웨이크워드 설정
const WAKEWORD_TEST = /(미러야|밀어야|미뤄야|hi\s*mirror|하이\s*미러|하이미러)/i; // for .test
const WAKEWORD_REMOVE = /(미러야|밀어야|미뤄야|hi\s*mirror|하이\s*미러|하이미러)/ig; // for .replace

// Google Assistant 설정
const ASSISTANT_ENDPOINT = 'embeddedassistant.googleapis.com:443';

module.exports = {
  PORT,
  OPENAI_API_KEY,
  ALWAYS_LISTEN,
  WEATHER_API_KEY,
  CITY_ID,
  CALENDAR_ICS_URLS,
  CALENDAR_SOURCES_FILE,
  CREDENTIALS_PATH,
  TOKEN_PATH,
  SPEECH_CREDENTIALS_PATH,
  PROTO_PATH,
  CAPTION_HIDE_AFTER_TTS_MS,
  COMMAND_SILENCE_TIMEOUT_MS,
  LISTENING_BROADCAST_INTERVAL_MS,
  WAKEWORD_TEST,
  WAKEWORD_REMOVE,
  ASSISTANT_ENDPOINT
};
