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
    '슬픈 기분이시군요. 그런 감정을 느끼는 게 당연해요. 혼자가 아니에요. 언제든 이야기해주세요.',
    '우울한 마음이 느껴져요. 따뜻한 차 한 잔과 함께 마음을 달래보는 건 어떨까요?',
    '슬픈 감정은 자연스러워요. 시간이 지나면 조금씩 나아질 거예요. 제가 옆에 있어요.'
  ],
  'excited': [
    '정말 흥미진진한 기분이시군요! 그 에너지를 좋은 일에 활용해보세요.',
    '흥분된 상태가 느껴져요! 긍정적인 에너지가 가득하네요.',
    '들떠있는 기분이시군요! 그 열정을 유지하시고 좋은 일에 활용해보세요!'
  ],
  'frustrated': [
    '답답한 기분이시군요. 잠시 쉬어가며 마음을 정리해보는 건 어떨까요?',
    '좌절감이 느껴져요. 차근차근 해결해나가면 될 거예요. 천천히 접근해보세요.',
    '스트레스 받고 계시는군요. 심호흡을 하며 마음을 진정시켜보세요.'
  ],
  'fearful': [
    '불안한 기분이시군요. 안전한 곳에 계시니 걱정하지 마세요.',
    '두려운 마음이 느껴져요. 차분히 생각해보면 해결책이 보일 거예요.',
    '겁이 나시는군요. 천천히 마음을 진정시켜보세요. 제가 옆에 있어요.'
  ],
  'disgusted': [
    '불쾌한 기분이시군요. 깨끗한 공기를 마시며 마음을 정화해보세요.',
    '혐오감이 느껴져요. 좋은 생각으로 마음을 바꿔보는 건 어떨까요?',
    '기분이 상하신 것 같아요. 잠시 다른 일에 집중해보세요.'
  ],
  'surprised': [
    '놀라신 것 같아요! 예상치 못한 일이 있었나요?',
    '깜짝 놀라셨군요! 그 감정을 긍정적으로 받아들여보세요.',
    '놀란 기분이시네요. 새로운 경험이었나요?'
  ]
};

// 감정별 활동 추천
const EMOTION_ACTIVITIES = {
  'angry': [
    '깊은 호흡 운동',
    '산책하기',
    '운동하기',
    '명상하기'
  ],
  'happy': [
    '좋아하는 음악 듣기',
    '친구와 만나기',
    '취미 활동하기',
    '긍정적인 생각하기'
  ],
  'neutral': [
    '책 읽기',
    '차 한 잔 마시기',
    '산책하기',
    '명상하기'
  ],
  'sad': [
    '따뜻한 차 마시기',
    '좋아하는 음악 듣기',
    '친구와 대화하기',
    '가벼운 운동하기'
  ],
  'excited': [
    '에너지 있는 활동하기',
    '새로운 것 도전하기',
    '창의적인 활동하기',
    '긍정적인 에너지 활용하기'
  ],
  'frustrated': [
    '명상하기',
    '깊은 호흡하기',
    '산책하기',
    '문제를 단계별로 정리하기'
  ],
  'fearful': [
    '안전한 환경에서 휴식하기',
    '차분한 음악 듣기',
    '깊은 호흡하기',
    '신뢰할 수 있는 사람과 대화하기'
  ],
  'disgusted': [
    '깨끗한 환경에서 휴식하기',
    '상쾌한 공기 마시기',
    '좋은 생각으로 마음 바꾸기',
    '긍정적인 활동하기'
  ],
  'surprised': [
    '새로운 경험 즐기기',
    '호기심을 자극하는 활동하기',
    '학습하기',
    '모험적인 활동하기'
  ]
};

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
  EMOTION_ACTIVITIES
};
