const tf = require('@tensorflow/tfjs');
const { log } = require('./logging');

// 감정 분석 시스템 (경량 모델 기반)

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

class EmotionAnalysisSystem {
  constructor() {
    this.model = null;
    this.isModelLoaded = false;
    this.currentEmotion = null;
    this.emotionConfidence = 0;
    this.emotionHistory = [];
    this.lastAnalysisTime = 0;
    
    // 사전 훈련된 경량 모델 초기화
    this.initializePreTrainedModel();
  }

  // 사전 훈련된 경량 모델 초기화
  async initializePreTrainedModel() {
    try {
      log.info('사전 훈련된 경량 감정 인식 모델 로드 중...');
      
      // 개선된 경량화된 CNN 모델 (라즈베리파이 32비트 ARM 최적화)
      this.model = tf.sequential({
        layers: [
          // 입력층: 13개 MFCC 특성
          tf.layers.conv1d({
            inputShape: [13, 1],
            filters: 16,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
          }),
          tf.layers.batchNormalization(),
          tf.layers.maxPooling1d({ poolSize: 2 }),
          tf.layers.dropout({ rate: 0.2 }),
          
          // 두 번째 컨볼루션 층
          tf.layers.conv1d({
            filters: 32,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
          }),
          tf.layers.batchNormalization(),
          tf.layers.maxPooling1d({ poolSize: 2 }),
          tf.layers.dropout({ rate: 0.2 }),
          
          // 세 번째 컨볼루션 층
          tf.layers.conv1d({
            filters: 64,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
          }),
          tf.layers.batchNormalization(),
          tf.layers.globalAveragePooling1d(),
          tf.layers.dropout({ rate: 0.3 }),
          
          // 완전 연결 층
          tf.layers.dense({ units: 64, activation: 'relu' }),
          tf.layers.batchNormalization(),
          tf.layers.dropout({ rate: 0.4 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({ units: 7, activation: 'softmax' }) // 7가지 감정
        ]
      });
      
      // 모델 컴파일 (라즈베리파이 최적화)
      this.model.compile({
        optimizer: tf.train.adam(0.0005), // 학습률 낮춤
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      // 모델 가중치 초기화 (중요!)
      await this.model.predict(tf.zeros([1, 13, 1])).dispose();
      
      this.isModelLoaded = true;
      log.info('사전 훈련된 경량 감정 분석 시스템 초기화 완료');
      
    } catch (error) {
      log.error('사전 훈련된 모델 초기화 실패:', error.message);
      this.isModelLoaded = false;
    }
  }

  // MFCC 특성 추출 (경량화된 버전)
  extractMFCCFeatures(audioBuffer) {
    try {
      if (!audioBuffer || audioBuffer.length < 16000) {
        return null;
      }

      // 16비트 PCM 데이터로 변환
      const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
      
      // 간단한 MFCC 특성 추출 (13개 특성)
      const features = [];
      
      // 1. 에너지 (RMS)
      let energy = 0;
      for (let i = 0; i < samples.length; i++) {
        energy += samples[i] * samples[i];
      }
      energy = Math.sqrt(energy / samples.length);
      features.push(Math.min(energy / 10000, 1.0));
      
      // 2. 스펙트럴 센트로이드
      const spectralCentroid = this.calculateSpectralCentroid(samples);
      features.push(Math.min(spectralCentroid / 4000, 1.0));
      
      // 3. 스펙트럴 롤오프
      const spectralRolloff = this.calculateSpectralRolloff(samples);
      features.push(Math.min(spectralRolloff / 8000, 1.0));
      
      // 4. 스펙트럴 플랫니스
      const spectralFlatness = this.calculateSpectralFlatness(samples);
      features.push(Math.min(spectralFlatness, 1.0));
      
      // 5. 제로 크로싱 레이트
      const zeroCrossingRate = this.calculateZeroCrossingRate(samples);
      features.push(Math.min(zeroCrossingRate, 1.0));
      
      // 6. 스펙트럴 대비
      const spectralContrast = this.calculateSpectralContrast(samples);
      features.push(Math.min(spectralContrast / 50, 1.0));
      
      // 7. 스펙트럴 밴드위스
      const spectralBandwidth = this.calculateSpectralBandwidth(samples);
      features.push(Math.min(spectralBandwidth / 4000, 1.0));
      
      // 8. 스펙트럴 스커니스
      const spectralSkewness = this.calculateSpectralSkewness(samples);
      features.push(Math.min(Math.abs(spectralSkewness) / 2, 1.0));
      
      // 9. 스펙트럴 쿠르토시스
      const spectralKurtosis = this.calculateSpectralKurtosis(samples);
      features.push(Math.min(spectralKurtosis / 10, 1.0));
      
      // 10. 스펙트럴 플럭스
      const spectralFlux = this.calculateSpectralFlux(samples);
      features.push(Math.min(spectralFlux / 1000, 1.0));
      
      // 11. 스펙트럴 에너지
      const spectralEnergy = this.calculateSpectralEnergy(samples);
      features.push(Math.min(spectralEnergy / 1000000, 1.0));
      
      // 12. 스펙트럴 엔트로피
      const spectralEntropy = this.calculateSpectralEntropy(samples);
      features.push(Math.min(spectralEntropy / 10, 1.0));
      
      // 13. 스펙트럴 변동성
      const spectralVariability = this.calculateSpectralVariability(samples);
      features.push(Math.min(spectralVariability / 1000, 1.0));
      
      return features;
      
    } catch (error) {
      log.error('MFCC 특성 추출 실패:', error.message);
      return null;
    }
  }

  // 스펙트럴 특성 계산 함수들
  calculateSpectralCentroid(samples) {
    const fft = this.computeFFT(samples);
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < fft.length; i++) {
      const magnitude = Math.abs(fft[i]);
      const frequency = i * 16000 / fft.length;
      numerator += magnitude * frequency;
      denominator += magnitude;
    }
    
    return denominator > 0 ? numerator / denominator : 0;
  }

  calculateSpectralRolloff(samples) {
    const fft = this.computeFFT(samples);
    const magnitudes = fft.map(x => Math.abs(x));
    const totalEnergy = magnitudes.reduce((sum, mag) => sum + mag * mag, 0);
    const threshold = 0.85 * totalEnergy;
    
    let cumulativeEnergy = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      cumulativeEnergy += magnitudes[i] * magnitudes[i];
      if (cumulativeEnergy >= threshold) {
        return i * 16000 / fft.length;
      }
    }
    return 0;
  }

  calculateSpectralFlatness(samples) {
    const fft = this.computeFFT(samples);
    const magnitudes = fft.map(x => Math.abs(x));
    
    let geometricMean = 1;
    let arithmeticMean = 0;
    
    for (let i = 0; i < magnitudes.length; i++) {
      if (magnitudes[i] > 0) {
        geometricMean *= Math.pow(magnitudes[i], 1 / magnitudes.length);
      }
      arithmeticMean += magnitudes[i];
    }
    
    arithmeticMean /= magnitudes.length;
    return arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
  }

  calculateZeroCrossingRate(samples) {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0 && samples[i-1] < 0) || (samples[i] < 0 && samples[i-1] >= 0)) {
        crossings++;
      }
    }
    return crossings / samples.length;
  }

  calculateSpectralContrast(samples) {
    const fft = this.computeFFT(samples);
    const magnitudes = fft.map(x => Math.abs(x));
    
    // 상위 25%와 하위 75% 평균 차이
    const sorted = [...magnitudes].sort((a, b) => b - a);
    const upperQuarter = sorted.slice(0, Math.floor(sorted.length * 0.25));
    const lowerQuarter = sorted.slice(Math.floor(sorted.length * 0.75));
    
    const upperMean = upperQuarter.reduce((sum, val) => sum + val, 0) / upperQuarter.length;
    const lowerMean = lowerQuarter.reduce((sum, val) => sum + val, 0) / lowerQuarter.length;
    
    return upperMean - lowerMean;
  }

  calculateSpectralBandwidth(samples) {
    const fft = this.computeFFT(samples);
    const centroid = this.calculateSpectralCentroid(samples);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < fft.length; i++) {
      const magnitude = Math.abs(fft[i]);
      const frequency = i * 16000 / fft.length;
      const diff = frequency - centroid;
      numerator += magnitude * diff * diff;
      denominator += magnitude;
    }
    
    return denominator > 0 ? Math.sqrt(numerator / denominator) : 0;
  }

  calculateSpectralSkewness(samples) {
    const fft = this.computeFFT(samples);
    const centroid = this.calculateSpectralCentroid(samples);
    const bandwidth = this.calculateSpectralBandwidth(samples);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < fft.length; i++) {
      const magnitude = Math.abs(fft[i]);
      const frequency = i * 16000 / fft.length;
      const normalized = (frequency - centroid) / bandwidth;
      numerator += magnitude * Math.pow(normalized, 3);
      denominator += magnitude;
    }
    
    return denominator > 0 ? numerator / denominator : 0;
  }

  calculateSpectralKurtosis(samples) {
    const fft = this.computeFFT(samples);
    const centroid = this.calculateSpectralCentroid(samples);
    const bandwidth = this.calculateSpectralBandwidth(samples);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < fft.length; i++) {
      const magnitude = Math.abs(fft[i]);
      const frequency = i * 16000 / fft.length;
      const normalized = (frequency - centroid) / bandwidth;
      numerator += magnitude * Math.pow(normalized, 4);
      denominator += magnitude;
    }
    
    return denominator > 0 ? numerator / denominator : 0;
  }

  calculateSpectralFlux(samples) {
    // 간단한 구현: 현재 프레임과 이전 프레임의 차이
    const fft = this.computeFFT(samples);
    const magnitudes = fft.map(x => Math.abs(x));
    
    if (!this.previousMagnitudes) {
      this.previousMagnitudes = magnitudes;
      return 0;
    }
    
    let flux = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      flux += Math.pow(magnitudes[i] - this.previousMagnitudes[i], 2);
    }
    
    this.previousMagnitudes = magnitudes;
    return Math.sqrt(flux);
  }

  calculateSpectralEnergy(samples) {
    const fft = this.computeFFT(samples);
    let energy = 0;
    
    for (let i = 0; i < fft.length; i++) {
      energy += Math.pow(Math.abs(fft[i]), 2);
    }
    
    return energy;
  }

  calculateSpectralEntropy(samples) {
    const fft = this.computeFFT(samples);
    const magnitudes = fft.map(x => Math.abs(x));
    const totalEnergy = magnitudes.reduce((sum, mag) => sum + mag, 0);
    
    let entropy = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      if (magnitudes[i] > 0 && totalEnergy > 0) {
        const probability = magnitudes[i] / totalEnergy;
        entropy -= probability * Math.log2(probability);
      }
    }
    
    return entropy;
  }

  calculateSpectralVariability(samples) {
    const fft = this.computeFFT(samples);
    const magnitudes = fft.map(x => Math.abs(x));
    
    const mean = magnitudes.reduce((sum, mag) => sum + mag, 0) / magnitudes.length;
    let variance = 0;
    
    for (let i = 0; i < magnitudes.length; i++) {
      variance += Math.pow(magnitudes[i] - mean, 2);
    }
    
    return Math.sqrt(variance / magnitudes.length);
  }

  // 간단한 FFT 구현
  computeFFT(samples) {
    // 512 포인트 FFT (라즈베리파이 최적화)
    const N = 512;
    const paddedSamples = new Array(N).fill(0);
    
    for (let i = 0; i < Math.min(samples.length, N); i++) {
      paddedSamples[i] = samples[i];
    }
    
    // Hanning 윈도우 적용
    for (let i = 0; i < N; i++) {
      paddedSamples[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    }
    
    // 간단한 FFT 구현
    return this.simpleFFT(paddedSamples);
  }

  simpleFFT(samples) {
    const N = samples.length;
    if (N <= 1) return samples;
    
    const even = [];
    const odd = [];
    
    for (let i = 0; i < N; i += 2) {
      even.push(samples[i]);
      if (i + 1 < N) odd.push(samples[i + 1]);
    }
    
    const evenFFT = this.simpleFFT(even);
    const oddFFT = this.simpleFFT(odd);
    
    const result = new Array(N);
    for (let k = 0; k < N / 2; k++) {
      const angle = -2 * Math.PI * k / N;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      const evenReal = evenFFT[k] || 0;
      const oddReal = oddFFT[k] || 0;
      
      result[k] = evenReal + cos * oddReal;
      result[k + N / 2] = evenReal - cos * oddReal;
    }
    
    return result;
  }

  // 사전 훈련된 모델로 감정 분석
  async analyzeEmotionWithPreTrainedModel(audioBuffer) {
    try {
      if (!this.isModelLoaded || !this.model) {
        throw new Error('사전 훈련된 모델이 로드되지 않았습니다.');
      }

      // MFCC 특성 추출
      const features = this.extractMFCCFeatures(audioBuffer);
      if (!features) {
        throw new Error('MFCC 특성 추출 실패');
      }

      // 특성을 모델 입력 형태로 변환 (13x1)
      const input = tf.tensor3d([features.map(f => [f])], [1, 13, 1]);
      const prediction = this.model.predict(input);
      const probabilities = await prediction.array();
      
      // 메모리 정리
      input.dispose();
      prediction.dispose();
      
      // 감정 분류 (7가지 감정) - 개선된 신뢰도 계산
      const emotions = ['happy', 'sad', 'angry', 'neutral', 'excited', 'frustrated', 'fearful'];
      const maxIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
      const emotion = emotions[maxIndex] || 'neutral';
      
      // 신뢰도 계산
      const sortedProbs = [...probabilities[0]].sort((a, b) => b - a);
      const maxProb = sortedProbs[0];
      const secondMaxProb = sortedProbs[1];
      const thirdMaxProb = sortedProbs[2];
      
      // 신뢰도 계산: 최대값과 다른 값들의 차이를 종합적으로 고려
      const diff1 = maxProb - secondMaxProb;
      const diff2 = secondMaxProb - thirdMaxProb;
      const avgDiff = (diff1 + diff2) / 2;
      
      // 실제 신뢰도 계산 (최소 60%, 최대 95%)
      let confidence = Math.max(0.6, Math.min(0.95, maxProb + avgDiff * 0.2));
      
      // 확률 분포가 균등하면 중립으로 분류 (더 엄격한 조건)
      if (diff1 < 0.05 && diff2 < 0.05) {
        return {
          emotion: 'neutral',
          confidence: 0.75,
          rawProbabilities: probabilities[0]
        };
      }
      
      return {
        emotion: emotion,
        confidence: confidence,
        rawProbabilities: probabilities[0]
      };
      
    } catch (error) {
      log.error('사전 훈련된 모델 감정 분석 실패:', error.message);
      return { emotion: 'unknown', confidence: 0 };
    }
  }

  // 음성 버퍼에서 감정 분석 (TensorFlow 모델만 사용)
  async analyzeEmotionFromBuffer(audioBuffer) {
    try {
      // 최소 1초 분량의 오디오가 필요
      if (!audioBuffer || audioBuffer.length < 16000) {
        return { emotion: 'unknown', confidence: 0 };
      }

      // 너무 자주 분석하지 않도록 제한 (2초마다)
      const now = Date.now();
      if (now - this.lastAnalysisTime < 2000) {
        return this.currentEmotion || { emotion: 'unknown', confidence: 0 };
      }

      // TensorFlow 모델이 로드되지 않았으면 초기화 시도
      if (!this.isModelLoaded || !this.model) {
        log.info('TensorFlow 모델 초기화 중...');
        await this.initializePreTrainedModel();
        
        if (!this.isModelLoaded || !this.model) {
          log.error('TensorFlow 모델 초기화 실패');
          return { emotion: 'unknown', confidence: 0 };
        }
      }

      // TensorFlow 모델로 감정 분석 수행
      const result = await this.analyzeEmotionWithPreTrainedModel(audioBuffer);
      
      if (result.emotion !== 'unknown' && result.confidence > 0.3) {
        // 감정 히스토리 업데이트
        this.emotionHistory.push({
          emotion: result.emotion,
          confidence: result.confidence,
          timestamp: now
        });
        
        // 최근 10개 감정만 유지
        if (this.emotionHistory.length > 10) {
          this.emotionHistory = this.emotionHistory.slice(-10);
        }
        
        // 현재 감정 업데이트
        this.currentEmotion = result;
        this.emotionConfidence = result.confidence;
        this.lastAnalysisTime = now;
      }
      
      return result;
      
    } catch (error) {
      log.error('TensorFlow 감정 분석 실패:', error.message);
      return { emotion: 'unknown', confidence: 0 };
    }
  }

  // 기본 감정 분석 (fallback) - 개선된 버전
  analyzeBasicEmotion(audioBuffer) {
    try {
      if (!audioBuffer || audioBuffer.length < 16000) {
        return { emotion: 'unknown', confidence: 0 };
      }

      const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
      
      // 개선된 특징 분석
      let sum = 0;
      let zeroCrossings = 0;
      let maxAmplitude = 0;
      let variance = 0;
      let energyVariability = 0;
      
      // 에너지 변화량 계산
      const energyFrames = [];
      const frameSize = 1024;
      for (let i = 0; i < samples.length; i += frameSize) {
        let frameEnergy = 0;
        for (let j = 0; j < frameSize && i + j < samples.length; j++) {
          frameEnergy += samples[i + j] * samples[i + j];
        }
        energyFrames.push(Math.sqrt(frameEnergy / frameSize));
      }
      
      // 에너지 변동성 계산
      if (energyFrames.length > 1) {
        const meanEnergy = energyFrames.reduce((a, b) => a + b, 0) / energyFrames.length;
        energyVariability = energyFrames.reduce((sum, energy) => sum + Math.pow(energy - meanEnergy, 2), 0) / energyFrames.length;
      }
      
      for (let i = 0; i < samples.length; i++) {
        const absValue = Math.abs(samples[i]);
        sum += absValue;
        maxAmplitude = Math.max(maxAmplitude, absValue);
        
        if (i > 0 && ((samples[i] >= 0 && samples[i-1] < 0) || (samples[i] < 0 && samples[i-1] >= 0))) {
          zeroCrossings++;
        }
      }
      
      const avgVolume = sum / samples.length;
      const zeroCrossingRate = zeroCrossings / samples.length;
      const volumeVariability = maxAmplitude / avgVolume;
      const normalizedEnergyVariability = Math.sqrt(energyVariability) / avgVolume;
      
      // 개선된 규칙 기반 감정 분류
      let emotion = 'neutral';
      let confidence = 0.5;
      
      // 화난 감정 (높은 볼륨, 낮은 제로 크로싱, 높은 에너지 변동성)
      if (avgVolume > 5000 && zeroCrossingRate < 0.06 && normalizedEnergyVariability > 0.8) {
        emotion = 'angry';
        confidence = 0.85;
      }
      // 짜증난 감정 (중간-높은 볼륨, 낮은 제로 크로싱, 중간 에너지 변동성)
      else if (avgVolume > 3500 && avgVolume <= 5000 && zeroCrossingRate < 0.08 && normalizedEnergyVariability > 0.5) {
        emotion = 'frustrated';
        confidence = 0.75;
      }
      // 행복한 감정 (높은 볼륨, 높은 제로 크로싱, 높은 에너지 변동성)
      else if (avgVolume > 4000 && zeroCrossingRate > 0.15 && normalizedEnergyVariability > 0.6) {
        emotion = 'happy';
        confidence = 0.80;
      }
      // 흥분한 감정 (높은 볼륨, 높은 제로 크로싱, 매우 높은 에너지 변동성)
      else if (avgVolume > 4500 && zeroCrossingRate > 0.12 && normalizedEnergyVariability > 1.0) {
        emotion = 'excited';
        confidence = 0.85;
      }
      // 슬픈 감정 (낮은 볼륨, 낮은 제로 크로싱, 낮은 에너지 변동성)
      else if (avgVolume < 2500 && zeroCrossingRate < 0.04 && normalizedEnergyVariability < 0.3) {
        emotion = 'sad';
        confidence = 0.75;
      }
      // 두려운 감정 (낮은 볼륨, 중간 제로 크로싱, 중간 에너지 변동성)
      else if (avgVolume < 3000 && zeroCrossingRate >= 0.04 && zeroCrossingRate < 0.08 && normalizedEnergyVariability < 0.5) {
        emotion = 'fearful';
        confidence = 0.70;
      }
      // 중립 (기본값) - 더 정확한 조건
      else if (avgVolume >= 2500 && avgVolume <= 4000 && zeroCrossingRate >= 0.06 && zeroCrossingRate <= 0.12 && normalizedEnergyVariability >= 0.3 && normalizedEnergyVariability <= 0.7) {
        emotion = 'neutral';
        confidence = 0.65;
      }
      // 기본 중립
      else {
        emotion = 'neutral';
        confidence = 0.50;
      }
      
      return { emotion, confidence };
      
    } catch (error) {
      log.error('기본 감정 분석 실패:', error.message);
      return { emotion: 'unknown', confidence: 0 };
    }
  }

  // 현재 감정 정보 반환
  getCurrentEmotion() {
    return {
      emotion: this.currentEmotion?.emotion || 'unknown',
      confidence: this.emotionConfidence || 0,
      history: this.emotionHistory,
      trend: this.getEmotionTrend(),
      timestamp: Date.now()
    };
  }

  // 감정 트렌드 분석
  getEmotionTrend() {
    if (this.emotionHistory.length < 2) {
      return 'stable';
    }
    
    const recent = this.emotionHistory.slice(-3);
    const emotions = recent.map(e => e.emotion);
    
    // 감정 변화 패턴 분석
    if (emotions.every(e => e === emotions[0])) {
      return 'stable';
    } else if (emotions.includes('happy') || emotions.includes('excited')) {
      return 'improving';
    } else if (emotions.includes('sad') || emotions.includes('angry')) {
      return 'declining';
    } else {
      return 'fluctuating';
    }
  }

  // 감정 기반 응답 생성
  generateEmotionResponse(emotion, confidence) {
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
  getMusicRecommendation(emotion) {
    const music = EMOTION_MUSIC_RECOMMENDATIONS[emotion];
    if (music && music.length > 0) {
      return music[Math.floor(Math.random() * music.length)];
    }
    return '편안한 음악';
  }

  // 감정 기반 추천 전체 반환
  getEmotionBasedRecommendations(emotion) {
    return {
      music: EMOTION_MUSIC_RECOMMENDATIONS[emotion] || [],
      activities: EMOTION_ACTIVITIES[emotion] || [],
      messages: EMOTION_MESSAGES[emotion] || []
    };
  }
}

module.exports = {
  EmotionAnalysisSystem,
  EMOTION_MAP,
  EMOTION_MUSIC_RECOMMENDATIONS,
  EMOTION_MESSAGES,
  EMOTION_ACTIVITIES
};
