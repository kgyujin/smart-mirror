const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { OAuth2Client } = require('google-auth-library');
const wav = require('wav');
const record = require('node-record-lpcm16').record;
const { convertAudioToText } = require('./speech');
const { isNewsQuery, processNewsQuery } = require('./news');
const { 
  ASSISTANT_ENDPOINT,
  PROTO_PATH,
  CREDENTIALS_PATH,
  TOKEN_PATH
} = require('./config');
const { log } = require('./logging');

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
        path.join(__dirname, '..'), // 현재 디렉토리
        path.join(__dirname, '..', 'google'),
        path.join(__dirname, '..', 'google/assistant/embedded/v1alpha2'),
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
    path.join(__dirname, '..', 'test/google/api/annotations.proto'),
    path.join(__dirname, '..', 'test/google/api/http.proto'),
    path.join(__dirname, '..', 'test/google/type/latlng.proto')
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

module.exports = {
  createOAuth2Credentials,
  createAssistantClient,
  conversateWithAssistant,
  checkTokenExists
};
