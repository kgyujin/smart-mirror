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
  });
  
  return { wss, broadcast };
};

module.exports = {
  initializeWebSocket,
  broadcast
};
