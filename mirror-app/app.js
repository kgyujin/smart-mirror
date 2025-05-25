const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const GoogleAssistant = require('google-assistant');
const record = require('node-record-lpcm16').record;
const { SpeechClient } = require('@google-cloud/speech');
const wav = require('wav');
let responseSent = false;

const app = express();
const PORT = 8000;

const WEATHER_API_KEY = 'f6c4d3e4478abac841a6401b7d23bdba';
const CITY_ID = '1835848';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const SPEECH_CREDENTIALS_PATH = path.join(__dirname, 'credentials_serviceAccount.json');

const speechClient = new SpeechClient({ keyFilename: SPEECH_CREDENTIALS_PATH });

app.use(express.static('public'));
app.use(express.json());

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
    const assistant = new GoogleAssistant({
      keyFilePath: CREDENTIALS_PATH,
      savedTokensPath: TOKEN_PATH,
    });

    assistant.on('ready', () => {
      const config = {
        lang: 'ko-KR',
        isNew: true,
        audio: { encodingOut: 'LINEAR16', sampleRateOut: 16000 },
      };

      assistant.start(config, (conversation) => {
        const outputPath = path.join(__dirname, 'assistant_output.wav');
        const fileWriter = new wav.FileWriter(outputPath, {
          channels: 1,
          sampleRate: 16000,
          bitDepth: 16,
        });

	if (conversation.audioStream) {
	  conversation.audioStream.pipe(fileWriter);
	} else {
	  console.warn('⚠️ audioStream이 정의되지 않았습니다. 응답 오디오가 없습니다.');
	  responseSent = true;
	  return res.status(500).json({ error: 'audioStream 없음 - Assistant 응답 실패' });
	}

        conversation
          .on('ended', async (error) => {
            fileWriter.end();
            if (error) {
              console.error('Assistant 종료 오류:', error);
              return res.status(500).json({ error: '대화 종료 오류' });
            }

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
              console.log('🎧 Assistant 음성 → 텍스트:', transcription);
              res.json({ response: transcription || 'Assistant 응답을 인식하지 못했습니다.' });
            } catch (err) {
              console.error('STT 오류:', err);
              res.status(500).json({ error: 'Assistant 응답 텍스트 변환 실패' });
            }
          })
          .on('error', (err) => {
            console.error('Assistant 대화 오류:', err);
            res.status(500).json({ error: 'Assistant 오류' });
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
            console.log('🎤 사용자 음성 수신 중...');
          })
          .on('error', (err) => {
            console.error('마이크 오류:', err);
          })
          .pipe(conversation);

        process.on('SIGINT', () => {
          if (mic && mic.stop) {
            mic.stop();
            console.log('마이크 종료됨');
          }
          process.exit();
        });
      });
    });

    assistant.on('error', (err) => {
      console.error('Assistant 초기화 오류:', err);
      res.status(500).json({ error: 'Assistant 초기화 실패' });
    });

  } catch (err) {
    console.error('API 처리 오류:', err);
    res.status(500).json({ error: 'Assistant 처리 실패' });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});

