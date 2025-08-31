const { pipeline, env } = require('@xenova/transformers');
const { log } = require('./logging');
const fs = require('fs');
const path = require('path');

// Pi3 최적화 (WASM 백엔드 옵션)
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.simd = false;

let pipePromise = null;

// 감정 매핑
const EMOTION_MAP = {
  'ang': 'angry',      // 분노
  'hap': 'happy',      // 행복
  'neu': 'neutral',    // 중립
  'sad': 'sad',        // 슬픔
  'exc': 'excited',    // 흥분
  'fru': 'frustrated', // 좌절
  'fea': 'fearful',    // 두려움
  'dis': 'disgusted',  // 혐오
  'sur': 'surprised'   // 놀람
};

// 감정별 음악 추천
const EMOTION_MUSIC_RECOMMENDATIONS = {
  'angry': [
    'Rock music',
    'Heavy metal',
    'Energetic workout',
    'Punk rock'
  ],
  'happy': [
    'Upbeat pop',
    'Dance music',
    'Summer hits',
    'Feel-good songs'
  ],
  'neutral': [
    'Ambient music',
    'Classical piano',
    'Nature sounds',
    'Lo-fi beats'
  ],
  'sad': [
    'Comforting ballads',
    'Melancholic indie',
    'Healing music',
    'Gentle acoustic'
  ],
  'excited': [
    'Electronic dance',
    'High-energy pop',
    'Festival music',
    'Upbeat rock'
  ],
  'frustrated': [
    'Calming classical',
    'Meditation music',
    'Smooth jazz',
    'Relaxing ambient'
  ],
  'fearful': [
    'Calming nature sounds',
    'Soft classical',
    'Peaceful meditation',
    'Gentle lullabies'
  ],
  'disgusted': [
    'Cleansing sounds',
    'Fresh air music',
    'Purifying tones',
    'Renewal songs'
  ],
  'surprised': [
    'Exciting pop',
    'Adventure music',
    'Discovery songs',
    'Wonderful melodies'
  ]
};

// 감정별 메시지
const EMOTION_MESSAGES = {
  'angry': [
    '화가 나시는군요. 그런 감정이 드는 게 당연해요. 어떤 일이 있었는지 편하게 말씀해보세요.',
    '분노는 우리가 느끼는 자연스러운 감정이에요. 깊은 숨을 쉬며 잠시 마음을 진정시켜보는 건 어떨까요?',
    '화가 나실 때는 차분한 음악을 들어보세요. 마음이 조금씩 안정될 거예요.'
  ],
  'happy': [
    '정말 기뻐 보이시네요! 그 긍정적인 에너지가 저한테까지 전해져요. 어떤 좋은 일이 있었나요?',
    '행복한 기분이 느껴져요! 그 에너지를 계속 유지하시고, 오늘 하루도 좋은 일들이 가득하길 바라요.',
    '기쁜 마음이 전해져요! 그런 긍정적인 기분을 함께 나누고 싶어요.'
  ],
  'neutral': [
    '차분하고 안정적인 기분이시군요. 이런 평온한 상태가 좋아요.',
    '평온한 기분이 느껴져요. 이런 상태에서 좋은 아이디어가 떠오를 수도 있겠네요.',
    '중립적인 기분이시네요. 마음의 균형을 잘 잡고 계시는 것 같아요.'
  ],
  'sad': [
    '마음이 슬프시군요. 그런 감정을 느끼는 것은 자연스러워요. 제가 옆에서 들어드릴게요.',
    '슬픈 기분이 느껴져요. 힘든 일이 있었나요? 편하게 말씀해보세요.',
    '우울한 기분이시군요. 이런 때는 따뜻한 차 한 잔과 함께 마음을 진정시켜보는 건 어떨까요?'
  ],
  'excited': [
    '정말 신나 보이시네요! 그 흥미진진한 에너지가 전해져요. 어떤 일이 그렇게 기쁘신가요?',
    '흥분된 기분이 느껴져요! 그런 긍정적인 에너지를 계속 유지하세요.',
    '신나는 기분이 전해져요! 그런 에너지가 저한테까지 전달되고 있어요.'
  ],
  'frustrated': [
    '답답한 기분이시군요. 그런 감정을 느끼는 것은 당연해요. 어떤 일이 힘드신가요?',
    '좌절감이 느껴져요. 힘든 일이 있었나요? 제가 도움이 될 수 있는 부분이 있다면 말씀해주세요.',
    '답답한 마음이시군요. 이런 때는 잠시 쉬어가는 것도 좋은 방법이에요.'
  ],
  'fearful': [
    '두려운 기분이시군요. 그런 감정을 느끼는 것은 자연스러워요. 어떤 일이 걱정되시나요?',
    '불안한 기분이 느껴져요. 걱정되는 일이 있으시면 편하게 말씀해보세요.',
    '두려운 마음이시군요. 그런 감정을 혼자 견디지 마시고, 도움을 요청하는 것도 좋은 방법이에요.'
  ],
  'disgusted': [
    '역겨운 기분이시군요. 그런 감정을 느끼는 것은 당연해요. 어떤 일이 그렇게 싫으신가요?',
    '혐오감이 느껴져요. 불쾌한 일이 있었나요? 그런 감정을 표현하는 것은 자연스러워요.',
    '역겨운 마음이시군요. 그런 감정을 느끼는 것은 정상이에요. 잠시 다른 생각을 해보는 건 어떨까요?'
  ],
  'surprised': [
    '놀라신 기분이시군요! 예상치 못한 일이 있었나요? 그런 반응을 보이는 것은 자연스러워요.',
    '깜짝 놀란 기분이 느껴져요! 어떤 일이 그렇게 놀라우셨나요?',
    '놀란 마음이시군요! 그런 반응을 보이는 것은 당연해요. 어떤 일이 있었는지 궁금해요.'
  ]
};

// 감정별 활동 추천
const EMOTION_ACTIVITIES = {
  'angry': [
    '깊은 숨을 쉬며 명상하기',
    '가벼운 운동으로 스트레스 해소하기',
    '차분한 음악 듣기',
    '산책하기'
  ],
  'happy': [
    '좋은 기분을 유지하며 활동하기',
    '친구들과 만나기',
    '즐거운 음악 듣기',
    '창작 활동하기'
  ],
  'neutral': [
    '현재 상태를 유지하며 일상 활동하기',
    '새로운 취미 탐색하기',
    '편안한 음악 듣기',
    '독서하기'
  ],
  'sad': [
    '따뜻한 차 마시기',
    '위로가 되는 음악 듣기',
    '가벼운 산책하기',
    '일기 쓰기'
  ],
  'excited': [
    '그 에너지를 활용한 활동하기',
    '새로운 도전하기',
    '활기찬 음악 듣기',
    '창의적인 활동하기'
  ],
  'frustrated': [
    '명상이나 요가로 마음 진정시키기',
    '차분한 음악 듣기',
    '가벼운 운동하기',
    '문제를 단계별로 정리하기'
  ],
  'fearful': [
    '깊은 숨을 쉬며 마음 진정시키기',
    '편안한 음악 듣기',
    '신뢰할 수 있는 사람과 대화하기',
    '긍정적인 생각으로 전환하기'
  ],
  'disgusted': [
    '깨끗한 환경에서 휴식하기',
    '상쾌한 음악 듣기',
    '새로운 공간으로 이동하기',
    '긍정적인 활동으로 전환하기'
  ],
  'surprised': [
    '그 감정을 받아들이며 상황 파악하기',
    '적응할 시간 갖기',
    '긍정적인 관점에서 바라보기',
    '새로운 기회로 생각하기'
  ]
};

// 감정 분석 시스템 클래스
class EmotionAnalysisSystem {
  constructor() {
    this.isActive = false;
    this.currentEmotion = 'neutral';
    this.confidence = 0.5;
    this.history = [];
    this.analysisInterval = null;
  }

  start() {
    this.isActive = true;
    log.info('감정 분석 시스템 시작');
  }

  stop() {
    this.isActive = false;
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    log.info('감정 분석 시스템 중지');
  }

  analyze(audioBuffer) {
    if (!this.isActive) {
      return { emotion: 'neutral', confidence: 0.5 };
    }
    
    // 실제 감정 분석 로직은 analyzeEmotionAudio 함수 사용
    return analyzeEmotionAudio(audioBuffer);
  }

  getCurrentEmotion() {
    return {
      emotion: this.currentEmotion,
      confidence: this.confidence,
      history: this.history
    };
  }
}

async function initEmotionPipeline() {
  if (!pipePromise) {
    try {
      log.info('사전 훈련된 감정 인식 모델 로드 중...');
      pipePromise = pipeline(
        'audio-classification',
        'speechbrain/emotion-recognition-wav2vec2-IEMOCAP', // 이미 학습된 모델
        { quantized: true }
      );
      log.info('사전 훈련된 감정 인식 모델 로드 완료');
    } catch (error) {
      log.error('감정 인식 모델 로드 실패:', error.message);
      throw error;
    }
  }
  return pipePromise;
}

async function analyzeEmotionAudio(audioBuffer) {
  try {
    const clf = await initEmotionPipeline();
    
    // 오디오 버퍼를 임시 WAV 파일로 저장
    const tempWavPath = path.join('/tmp', `emotion_${Date.now()}.wav`);
    
    // 16kHz, mono WAV 형식으로 변환하여 저장
    await saveAudioBufferAsWav(audioBuffer, tempWavPath);
    
    const result = await clf(tempWavPath, { topk: 3 });
    const top1 = result[0];
    
    // 임시 파일 삭제
    try {
      fs.unlinkSync(tempWavPath);
    } catch (e) {
      // 파일 삭제 실패는 무시
    }
    
    // 감정 라벨 매핑
    const emotion = EMOTION_MAP[top1.label] || top1.label;
    
    return {
      emotion: emotion,
      confidence: top1.score,
      rawProbabilities: result,
      label: top1.label
    };
    
  } catch (error) {
    log.error('감정 분석 실패:', error.message);
    return { emotion: 'unknown', confidence: 0 };
  }
}

// 오디오 버퍼를 WAV 파일로 저장하는 함수
async function saveAudioBufferAsWav(audioBuffer, filePath) {
  return new Promise((resolve, reject) => {
    try {
      // 16비트 PCM 데이터를 WAV 형식으로 변환
      const wavBuffer = createWavBuffer(audioBuffer);
      fs.writeFileSync(filePath, wavBuffer);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

// WAV 파일 헤더 생성
function createWavBuffer(audioBuffer) {
  const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
  const sampleRate = 16000;
  const channels = 1;
  const bitsPerSample = 16;
  
  const dataLength = samples.length * channels * (bitsPerSample / 8);
  const bufferLength = 44 + dataLength;
  const buffer = Buffer.alloc(bufferLength);
  
  let offset = 0;
  
  // RIFF 헤더
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(bufferLength - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;
  
  // fmt 청크
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4; // fmt 청크 크기
  buffer.writeUInt16LE(1, offset); offset += 2; // PCM 형식
  buffer.writeUInt16LE(channels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), offset); offset += 4; // 바이트 레이트
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), offset); offset += 2; // 블록 얼라인
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
  
  // data 청크
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataLength, offset); offset += 4;
  
  // 오디오 데이터 복사
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], offset);
    offset += 2;
  }
  
  return buffer;
}

// 감정 기반 응답 생성
function generateEmotionResponse(emotion, confidence) {
  const messages = EMOTION_MESSAGES[emotion] || ['기분이 어떤지 말씀해주세요.'];
  const activities = EMOTION_ACTIVITIES[emotion] || ['산책하기'];
  const music = EMOTION_MUSIC_RECOMMENDATIONS[emotion] || ['편안한 음악'];
  
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  const randomActivity = activities[Math.floor(Math.random() * activities.length)];
  const randomMusic = music[Math.floor(Math.random() * music.length)];
  
  return {
    response: randomMessage,
    recommendations: {
      activity: randomActivity,
      music: randomMusic,
      confidence: confidence
    }
  };
}

// 음악 추천
function getMusicRecommendation(emotion) {
  const music = EMOTION_MUSIC_RECOMMENDATIONS[emotion];
  if (music && music.length > 0) {
    return music[Math.floor(Math.random() * music.length)];
  }
  return '편안한 음악';
}

// 감정 기반 추천 전체 반환
function getEmotionBasedRecommendations(emotion) {
  return {
    music: EMOTION_MUSIC_RECOMMENDATIONS[emotion] || [],
    activities: EMOTION_ACTIVITIES[emotion] || [],
    messages: EMOTION_MESSAGES[emotion] || []
  };
}

module.exports = {
  analyzeEmotionAudio,
  generateEmotionResponse,
  getMusicRecommendation,
  getEmotionBasedRecommendations,
  EMOTION_MAP,
  EMOTION_MUSIC_RECOMMENDATIONS,
  EMOTION_MESSAGES,
  EMOTION_ACTIVITIES,
  EmotionAnalysisSystem
};
