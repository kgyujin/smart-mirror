// ========== 개선된 로깅 시스템 ==========
// Winston 기반 로그 레벨 관리

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 로그 레벨 설정 (환경변수로 제어)
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
const ENABLE_FILE_LOGGING = process.env.ENABLE_FILE_LOGGING === 'true';

// 로그 디렉토리 생성
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 커스텀 로그 포맷
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    // 이모지 매핑 (INFO 레벨에서만 핵심 이모지 사용)
    const emojis = {
      error: '❌',
      warn: '⚠️',
      info: '',      // INFO는 이모지 제거하여 깔끔하게
      debug: '🔍'
    };
    
    const emoji = emojis[level] || '';
    const prefix = emoji ? `${emoji} ` : '';
    
    if (stack) {
      return `[${timestamp}] [${level.toUpperCase()}] ${prefix}${message}\n${stack}`;
    }
    return `[${timestamp}] [${level.toUpperCase()}] ${prefix}${message}`;
  })
);

// 콘솔 출력용 간소화된 포맷 (발표용)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message }) => {
    // LOG_LEVEL이 INFO인 경우 깔끔한 출력
    if (LOG_LEVEL === 'INFO') {
      // 핵심 메시지만 간결하게 표시
      if (level.includes('error')) {
        return `❌ ${message}`;
      } else if (level.includes('warn')) {
        return `⚠️ ${message}`;
      } else if (level.includes('info')) {
        return message; // 이모지 없이 깔끔하게
      }
      return message;
    } else {
      // DEBUG 레벨에서는 상세 정보 포함
      return `[${level}] ${message}`;
    }
  })
);

// Winston 로거 설정
const transports = [
  // 콘솔 출력
  new winston.transports.Console({
    format: consoleFormat,
    level: LOG_LEVEL.toLowerCase()
  })
];

// 파일 로깅 (옵션)
if (ENABLE_FILE_LOGGING) {
  transports.push(
    // 에러 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: customFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // 전체 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: customFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  );
}

const logger = winston.createLogger({
  level: LOG_LEVEL.toLowerCase(),
  transports: transports,
  exitOnError: false
});

// 기존 log 객체와 호환성을 위한 래퍼
const enhancedLog = {
  // 핵심 메서드 (기존 log.info, log.error 등과 동일)
  info: (message, ...args) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.info(fullMessage);
  },
  
  error: (message, ...args) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.error(fullMessage);
  },
  
  warn: (message, ...args) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.warn(fullMessage);
  },
  
  debug: (message, ...args) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.debug(fullMessage);
  },
  
  // 새로운 메서드들
  
  // 사용자 명령 인식 (발표용 핵심 로그)
  userCommand: (command, result = null) => {
    if (result) {
      logger.info(`사용자 명령: "${command}" → ${result}`);
    } else {
      logger.info(`사용자 명령: "${command}"`);
    }
  },
  
  // AI 분석 결과 (발표용 핵심 로그)
  aiResult: (type, emotion, confidence, additionalInfo = '') => {
    const confPercentage = Math.round(confidence * 100);
    const info = additionalInfo ? ` (${additionalInfo})` : '';
    logger.info(`${type} 분석: ${emotion} (${confPercentage}%)${info}`);
  },
  
  // 시스템 상태 (발표용)
  systemStatus: (status, details = '') => {
    const info = details ? ` - ${details}` : '';
    logger.info(`시스템 상태: ${status}${info}`);
  },
  
  // API 요청/응답 (DEBUG 전용)
  apiCall: (method, url, status, responseTime = null) => {
    const timing = responseTime ? ` (${responseTime}ms)` : '';
    logger.debug(`API ${method} ${url} → ${status}${timing}`);
  },
  
  // 파일 작업 (DEBUG 전용)
  fileOperation: (operation, filePath, result) => {
    logger.debug(`파일 ${operation}: ${filePath} → ${result}`);
  },
  
  // 성능 측정
  performance: (operation, duration) => {
    logger.debug(`성능: ${operation} 완료 (${duration}ms)`);
  },
  
  // 레벨 설정 확인
  getLevel: () => LOG_LEVEL,
  isDebug: () => LOG_LEVEL.toLowerCase() === 'debug',
  isInfo: () => LOG_LEVEL.toLowerCase() === 'info',
  
  // 기존 verbose 메서드 (DEBUG 모드에서만 출력)
  verbose: (message, ...args) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.debug(`[VERBOSE] ${fullMessage}`);
  }
};

// 시작 시 로그 레벨 정보 출력
enhancedLog.systemStatus(`로그 레벨 ${LOG_LEVEL}로 시작`, 
  `파일 로깅: ${ENABLE_FILE_LOGGING ? '활성화' : '비활성화'}`);

module.exports = { 
  log: enhancedLog,
  logger: logger // 원본 winston 로거 (고급 사용)
};