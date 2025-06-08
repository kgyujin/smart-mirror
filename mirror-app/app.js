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

const app = express();
const PORT = 8000;

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

const WEATHER_API_KEY = 'f6c4d3e4478abac841a6401b7d23bdba';
const CITY_ID = '1835848';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const SPEECH_CREDENTIALS_PATH = path.join(__dirname, 'credentials_serviceAccount.json');

const speechClient = new SpeechClient({ keyFilename: SPEECH_CREDENTIALS_PATH });

// Google Assistant gRPC 설정
const ASSISTANT_ENDPOINT = 'embeddedassistant.googleapis.com:443';
const PROTO_PATH = path.join(__dirname, 'google/assistant/embedded/v1alpha2/embedded_assistant.proto');

app.use(express.static('public'));
app.use(express.json());

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
    const response = await axios.get(url);
    res.json(response.data);
  } catch (err) {
    log.error('날씨 API 오류:', err);
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

app.listen(PORT, () => {
  log.info(`서버 실행 중: http://localhost:${PORT}`);
  log.info('Google Assistant 향상된 서비스 준비 완료');
  
  if (!checkTokenExists()) {
    log.warn('필요한 파일들을 확인해주세요.');
  } else {
    log.info('✅ 모든 설정 파일이 확인되었습니다.');
  }
});

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