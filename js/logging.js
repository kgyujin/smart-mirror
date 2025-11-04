const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
};

const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;
const ENABLE_ASSISTANT_LOGS = false;
const ENABLE_AUDIO_LOGS = false;
const ENABLE_TTS_LOGS = true;

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

module.exports = {
  LOG_LEVELS,
  CURRENT_LOG_LEVEL,
  ENABLE_ASSISTANT_LOGS,
  ENABLE_AUDIO_LOGS,
  ENABLE_TTS_LOGS,
  log
};
