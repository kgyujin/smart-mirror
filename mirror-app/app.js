const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const GoogleAssistant = require('google-assistant');
const record = require('node-record-lpcm16').record;
const { SpeechClient } = require('@google-cloud/speech');
const wav = require('wav');
const say = require('say');
const { exec } = require('child_process');

const app = express();
const PORT = 8000;

const WEATHER_API_KEY = 'f6c4d3e4478abac841a6401b7d23bdba';
const CITY_ID = '1835848';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const SPEECH_CREDENTIALS_PATH = path.join(__dirname, 'credentials_serviceAccount.json');

const speechClient = new SpeechClient({ keyFilename: SPEECH_CREDENTIALS_PATH });

// 타임아웃 설정
const ASSISTANT_TIMEOUT = 20000; // 20초
const AUDIO_CHUNK_SIZE = 1600; // 50ms 청크

app.use(express.static('public'));
app.use(express.json());

// 안전한 TTS 함수 - espeak 직접 사용
const safeTTS = (text) => {
  if (!text || text.trim() === '') {
    console.log('TTS: 빈 텍스트, 건너뜀');
    return;
  }
  
  console.log('TTS 시작:', text);
  
  try {
    // espeak 직접 실행
    const command = `echo "${text.replace(/"/g, '\\"')}" | espeak -s 150 -v ko`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('TTS 오류:', error.message);
        // espeak이 실패하면 aplay로 간단한 비프음
        exec('echo -e "\\a"', () => {});
      } else {
        console.log('TTS 완료:', text);
      }
    });
  } catch (error) {
    console.error('TTS 실행 오류:', error);
  }
};

// 토큰 파일 존재 여부 확인
const checkTokenExists = () => {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.log('❌ tokens.json 파일이 없습니다.');
    console.log('다음 명령어를 실행하여 인증을 완료해주세요:');
    console.log('node auth.js');
    return false;
  }
  
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
    if (!tokens.refresh_token) {
      console.log('❌ refresh_token이 없습니다. 재인증이 필요합니다.');
      console.log('다음 명령어를 실행하여 재인증해주세요:');
      console.log('rm tokens.json && node auth.js');
      return false;
    }
    return true;
  } catch (error) {
    console.error('토큰 파일 읽기 오류:', error);
    return false;
  }
};

// 시간 기반 응답 생성 함수
const generateTimeResponse = (query) => {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ko-KR', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  if (query.includes('몇 시') || query.includes('시간')) {
    return `현재 시간은 ${timeStr}입니다.`;
  } else if (query.includes('날씨')) {
    return '날씨 정보를 확인하고 있습니다.';
  } else if (query.includes('안녕') || query.includes('hello')) {
    return '안녕하세요! 무엇을 도와드릴까요?';
  } else {
    return '죄송합니다. 요청을 처리할 수 없습니다.';
  }
};

// 개선된 오디오 청크 전송 함수
const sendAudioInChunks = (conversation, audioBuffer) => {
  return new Promise((resolve, reject) => {
    let offset = 0;
    const totalSize = audioBuffer.length;
    
    console.log(`총 오디오 크기: ${totalSize} bytes, 청크 크기: ${AUDIO_CHUNK_SIZE} bytes`);
    
    const sendNextChunk = () => {
      if (offset >= totalSize) {
        console.log('모든 오디오 청크 전송 완료');
        setTimeout(() => {
          conversation.end();
          resolve();
        }, 1000);
        return;
      }
      
      const chunkSize = Math.min(AUDIO_CHUNK_SIZE, totalSize - offset);
      const chunk = audioBuffer.slice(offset, offset + chunkSize);
      
      try {
        conversation.write(chunk);
        offset += chunkSize;
        setTimeout(sendNextChunk, 50);
      } catch (error) {
        console.error('청크 전송 오류:', error);
        reject(error);
      }
    };
    
    sendNextChunk();
  });
};

app.get('/api/weather', async (req, res) => {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?id=${CITY_ID}&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (err) {
    console.error('날씨 API 오류:', err);
    res.status(500).json({ error: '날씨 정보를 가져오는 데 실패했습니다.' });
  }
});

app.get('/api/assistant', async (req, res) => {
  try {
    if (!checkTokenExists()) {
      return res.status(401).json({ 
        error: '인증이 필요합니다. "node auth.js" 명령어를 실행하여 인증을 완료해주세요.' 
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
      verbose: true,
      recordProgram: 'sox',
      silence: '2.0',
    });

    mic.stream()
      .on('data', () => {
        console.log('사용자 음성 수신 중...');
      })
      .on('error', (err) => {
        console.error('마이크 오류:', err);
      })
      .pipe(fileWriter);

    let responseTimeout;
    let hasResponded = false;

    const sendResponse = (data) => {
      if (!hasResponded) {
        hasResponded = true;
        if (responseTimeout) clearTimeout(responseTimeout);
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
        console.log('사용자 음성 인식 결과:', transcription);

        if (
          transcription.toLowerCase().includes('ok google') ||
          transcription.includes('오케이 구글')
        ) {
          console.log('Assistant 트리거됨: ', transcription);

          // 쿼리 추출
          const query = transcription.replace(/ok google|오케이 구글/gi, '').trim();
          console.log('추출된 쿼리:', query);

          // 타임아웃 설정
          responseTimeout = setTimeout(() => {
            console.log('Assistant 응답 타임아웃 - 대체 응답 사용');
            const fallbackResponse = generateTimeResponse(query);
            safeTTS(fallbackResponse);
            sendResponse({ 
              response: fallbackResponse,
              success: true,
              source: 'fallback'
            });
          }, ASSISTANT_TIMEOUT);

          try {
            const assistant = new GoogleAssistant({
              keyFilePath: CREDENTIALS_PATH,
              savedTokensPath: TOKEN_PATH,
            });

            assistant.on('ready', () => {
              console.log('Assistant 준비 완료');
              
              const config = {
                lang: 'ko-KR',
                isNew: true,
                screen: {
                  isOn: true,
                },
                audio: {
                  encodingIn: 'LINEAR16',
                  sampleRateIn: 16000,
                  encodingOut: 'LINEAR16',
                  sampleRateOut: 16000,
                },
                device: {
                  deviceId: 'smart-mirror-device-' + Date.now(),
                  deviceModelId: 'smart-mirror-model'
                }
              };

              assistant.start(config, async (conversation) => {
                let assistantResponse = '';
                let hasReceivedResponse = false;
                let responseTimer;

                // 3초 후 대체 응답 제공
                responseTimer = setTimeout(() => {
                  if (!hasReceivedResponse && !hasResponded) {
                    console.log('Assistant 응답 지연 - 대체 응답 제공');
                    const fallbackResponse = generateTimeResponse(query);
                    assistantResponse = fallbackResponse;
                    hasReceivedResponse = true;
                    safeTTS(fallbackResponse);
                    
                    sendResponse({ 
                      response: fallbackResponse,
                      success: true,
                      source: 'timeout_fallback'
                    });
                  }
                }, 3000);

                conversation
                  .on('response', (text) => {
                    console.log('Assistant 응답 수신:', `"${text}"`);
                    if (responseTimer) clearTimeout(responseTimer);
                    
                    if (text && text.trim() && text.trim() !== '') {
                      assistantResponse = text.trim();
                      hasReceivedResponse = true;
                      console.log('유효한 응답 처리:', assistantResponse);
                      safeTTS(assistantResponse);
                    } else {
                      // 빈 응답인 경우 대체 응답 사용
                      console.log('빈 응답 수신 - 대체 응답 사용');
                      assistantResponse = generateTimeResponse(query);
                      hasReceivedResponse = true;
                      safeTTS(assistantResponse);
                    }
                  })
                  .on('audio-out', (audio) => {
                    console.log('오디오 응답 수신됨, 크기:', audio.length);
                    if (!hasReceivedResponse && audio.length > 0) {
                      if (responseTimer) clearTimeout(responseTimer);
                      assistantResponse = generateTimeResponse(query);
                      hasReceivedResponse = true;
                      safeTTS(assistantResponse);
                    }
                  })
                  .on('device-action', (action) => {
                    console.log('디바이스 액션:', action);
                    if (!hasReceivedResponse) {
                      if (responseTimer) clearTimeout(responseTimer);
                      assistantResponse = generateTimeResponse(query);
                      hasReceivedResponse = true;
                      safeTTS(assistantResponse);
                    }
                  })
                  .on('transcription', (data) => {
                    console.log('전사 완료:', data);
                  })
                  .on('ended', () => {
                    console.log('Assistant 대화 종료');
                    if (responseTimer) clearTimeout(responseTimer);
                    
                    if (!hasResponded) {
                      if (!hasReceivedResponse) {
                        assistantResponse = generateTimeResponse(query);
                        safeTTS(assistantResponse);
                      }
                      
                      sendResponse({ 
                        response: assistantResponse || generateTimeResponse(query),
                        success: true,
                        source: hasReceivedResponse ? 'assistant' : 'ended_fallback'
                      });
                    }
                  })
                  .on('error', (err) => {
                    console.error('Assistant 대화 오류:', err);
                    if (responseTimer) clearTimeout(responseTimer);
                    
                    if (!hasResponded) {
                      const fallbackResponse = generateTimeResponse(query);
                      safeTTS(fallbackResponse);
                      sendResponse({ 
                        response: fallbackResponse,
                        success: true,
                        source: 'error_fallback'
                      });
                    }
                  });

                // 오디오 전송
                try {
                  const audioBuffer = fs.readFileSync(outputPath);
                  const pcmData = audioBuffer.slice(44);
                  
                  console.log('Assistant에 오디오 청크 전송 시작');
                  await sendAudioInChunks(conversation, pcmData);
                  
                } catch (audioError) {
                  console.error('오디오 처리 오류:', audioError);
                  if (!hasResponded) {
                    const fallbackResponse = generateTimeResponse(query);
                    safeTTS(fallbackResponse);
                    sendResponse({ 
                      response: fallbackResponse,
                      success: true,
                      source: 'audio_error_fallback'
                    });
                  }
                }
              });
            });

            assistant.on('error', (err) => {
              console.error('Assistant 초기화 오류:', err);
              if (!hasResponded) {
                const fallbackResponse = generateTimeResponse(query);
                safeTTS(fallbackResponse);
                sendResponse({ 
                  response: fallbackResponse,
                  success: true,
                  source: 'init_error_fallback'
                });
              }
            });

          } catch (assistantError) {
            console.error('Assistant 생성 오류:', assistantError);
            if (!hasResponded) {
              const fallbackResponse = generateTimeResponse(query);
              safeTTS(fallbackResponse);
              sendResponse({ 
                response: fallbackResponse,
                success: true,
                source: 'creation_error_fallback'
              });
            }
          }

        } else {
          sendResponse({ response: `"${transcription}" → 어시스턴트 트리거 조건이 아닙니다.` });
        }
      } catch (err) {
        console.error('STT 오류:', err);
        sendResponse({ error: '음성 인식 실패: ' + err.message });
      }
    }, 4000);
  } catch (err) {
    console.error('API 처리 오류:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Assistant 처리 실패: ' + err.message });
    }
  }
});

// 헬스체크 엔드포인트 추가
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
  console.error('서버 에러:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: '서버 내부 오류' });
  }
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log('Assistant 서비스 준비 완료');
  
  if (!checkTokenExists()) {
    console.log('⚠️  인증이 필요합니다. "node auth.js" 명령어를 실행해주세요.');
  } else {
    console.log('✅ 인증 토큰이 확인되었습니다.');
  }
});

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
  console.log('서버 종료 중...');
  process.exit(0);
});

// 예외 처리 강화 - 프로세스 종료 방지
process.on('uncaughtException', (err) => {
  console.error('처리되지 않은 예외 (계속 실행):', err.message);
  // 프로세스를 종료하지 않음
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('처리되지 않은 Promise 거부 (계속 실행):', reason);
  // 프로세스를 종료하지 않음
});
