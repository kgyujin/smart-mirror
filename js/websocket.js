const WebSocket = require('ws');
const { log } = require('./logging');

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

const initializeWebSocket = (server) => {
  // WebSocket 서버 연결
  wss = new WebSocket.Server({ server });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'status', status: 'connected' }));
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'hotword_detected') {
          // 핵트워드 감지 시그널을 서버 로직에 전달
          broadcast({ type: 'status', status: 'listening_on' });
          broadcast({ type: 'hotword_detected', text: message.text });
        }
      } catch (err) {
        log.error('WebSocket 메시지 처리 오류:', err);
      }
    });
  });
  
  return { wss, broadcast };
};

module.exports = {
  initializeWebSocket,
  broadcast
};
