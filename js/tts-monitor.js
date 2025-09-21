const fs = require('fs');
const path = require('path');
const { log } = require('./logging');

// TTS 사용량 모니터링 함수
const checkUsage = () => {
  const usageFile = path.join(__dirname, '..', 'tts_usage.json');
  
  if (!fs.existsSync(usageFile)) {
    log.info('TTS 사용량 파일이 없습니다. 아직 사용하지 않았습니다.');
    return;
  }
  
  try {
    const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentUsage = usage[currentMonth] || 0;
    
    log.info(`�� 현재 월(${currentMonth}) TTS 사용량: ${currentUsage.toLocaleString()}자`);
    log.info(`💰 무료 사용량: 4,000,000자 중 ${((currentUsage / 4000000) * 100).toFixed(1)}% 사용`);
    
    if (currentUsage > 3500000) {
      log.warn('⚠️ 경고: 무료 사용량의 87.5%에 도달했습니다!');
    } else if (currentUsage > 3000000) {
      log.warn('⚠️ 주의: 무료 사용량의 75%에 도달했습니다.');
    } else if (currentUsage > 2000000) {
      log.info('ℹ️ 무료 사용량의 50%에 도달했습니다.');
    }
    
    // 예상 비용 계산
    if (currentUsage > 4000000) {
      const overage = currentUsage - 4000000;
      const cost = (overage / 1000000) * 4; // 100만 자당 $4
      log.warn(`💸 예상 추가 비용: $${cost.toFixed(2)} (${overage.toLocaleString()}자 초과)`);
    }
    
  } catch (e) {
    log.error('사용량 확인 오류:', e.message);
  }
};

// 사용량 리셋 함수 (월별)
const resetMonthlyUsage = () => {
  const usageFile = path.join(__dirname, '..', 'tts_usage.json');
  
  try {
    if (fs.existsSync(usageFile)) {
      const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      // 이전 달 데이터는 보관하고 현재 달만 리셋
      usage[currentMonth] = 0;
      
      fs.writeFileSync(usageFile, JSON.stringify(usage, null, 2));
      log.info('�� 월별 사용량이 리셋되었습니다.');
    }
  } catch (e) {
    log.error('사용량 리셋 오류:', e.message);
  }
};

module.exports = {
  checkUsage,
  resetMonthlyUsage
};