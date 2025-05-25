const GoogleAssistant = require('google-assistant');
const path = require('path');

const config = {
  keyFilePath: path.resolve(__dirname, 'credentials.json'),
  savedTokensPath: path.resolve(__dirname, 'tokens.json'),
};

const assistant = new GoogleAssistant(config);

assistant.on('ready', () => {
  console.log('✅ 인증 완료, tokens.json 파일이 생성되었습니다.');
});

assistant.on('error', (err) => {
  console.error('❌ 인증 실패:', err);
});

