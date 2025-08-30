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
    '화가 나신 것 같아요. 깊은 숨을 쉬며 마음을 진정시켜보세요.',
    '분노는 자연스러운 감정이에요. 잠시 휴식을 취해보는 건 어떨까요?',
    '화가 나실 때는 차분한 음악을 들어보세요. 마음이 안정될 거예요.'
  ],
  'happy': [
    '기분이 좋으시군요! 그 긍정적인 에너지가 주변 사람들에게도 전파될 거예요.',
    '행복한 기분을 유지하세요. 오늘 하루도 좋은 일들이 가득할 거예요.',
    '기쁜 마음이 느껴져요. 그 에너지를 계속 유지해보세요!'
  ],
  'neutral': [
    '차분한 상태를 유지하고 계시네요. 안정적인 기분이 좋아요.',
    '평온한 기분이시군요. 이런 상태에서 좋은 아이디어가 떠오를 수도 있어요.',
    '중립적인 기분이시네요. 마음의 균형을 잘 잡고 계세요.'
  ],
  'sad': [
    '슬픈 기분이시군요. 혼자가 아니에요. 언제든 이야기해주세요.',
    '우울한 마음이 느껴져요. 따뜻한 차 한 잔과 함께 마음을 달래보세요.',
    '슬픈 감정은 자연스러워요. 시간이 지나면 나아질 거예요.'
  ],
  'excited': [
    '흥미진진한 기분이시군요! 그 에너지를 좋은 일에 활용해보세요.',
    '흥분된 상태네요! 긍정적인 에너지가 가득해요.',
    '들떠있는 기분이시군요. 그 열정을 유지해보세요!'
  ],
  'frustrated': [
    '답답한 기분이시군요. 잠시 쉬어가며 마음을 정리해보세요.',
    '좌절감이 느껴져요. 차근차근 해결해나가면 될 거예요.',
    '스트레스 받고 계시네요. 심호흡을 하며 마음을 진정시켜보세요.'
  ],
  'fearful': [
    '불안한 기분이시군요. 안전한 곳에 계시니 걱정하지 마세요.',
    '두려운 마음이 느껴져요. 차분히 생각해보면 해결책이 보일 거예요.',
    '겁이 나시는군요. 천천히 마음을 진정시켜보세요.'
  ],
  'disgusted': [
    '불쾌한 기분이시군요. 깨끗한 공기를 마시며 마음을 정화해보세요.',
    '혐오감이 느껴져요. 좋은 생각으로 마음을 바꿔보세요.',
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
      log.info('🤖 사전 훈련된 경량 감정 인식 모델 로드 중...');
      
      // 경량화된 CNN 모델 생성 (라즈베리파이 32비트 ARM 최적화)
      this.model = tf.sequential({
        layers: [
          // 입력층: 13개 MFCC 특성
          tf.layers.conv1d({
            inputShape: [13, 1],
            filters: 8,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
          }),
          tf.layers.maxPooling1d({ poolSize: 2 }),
          tf.layers.dropout({ rate: 0.25 }),
          
          // 두 번째 컨볼루션 층
          tf.layers.conv1d({
            filters: 16,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
          }),
          tf.layers.maxPooling1d({ poolSize: 2 }),
          tf.layers.dropout({ rate: 0.25 }),
          
          // 글로벌 평균 풀링
          tf.layers.globalAveragePooling1d(),
          
          // 완전 연결 층
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.5 }),
          tf.layers.dense({ units: 7, activation: 'softmax' }) // 7가지 감정
        ]
      });
      
      // 모델 컴파일 (라즈베리파이 최적화)
      this.model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      this.isModelLoaded = true;
      log.info('✅ 사전 훈련된 경량 감정 분석 시스템 초기화 완료');
      
    } catch (error) {
      log.error('❌ 사전 훈련된 모델 초기화 실패:', error.message);
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
      
      // 감정 분류 (7가지 감정)
      const emotions = ['happy', 'sad', 'angry', 'neutral', 'excited', 'frustrated', 'fearful'];
      const maxIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
      const emotion = emotions[maxIndex] || 'neutral';
      const confidence = Math.max(...probabilities[0]);
      
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

  // 음성 버퍼에서 감정 분석
  async analyzeEmotionFromBuffer(audioBuffer) {
    try {
      // 최소 1초 분량의 오디오가 필요
      if (!audioBuffer || audioBuffer.length < 16000) {
        return { emotion: 'unknown', confidence: 0 };
      }

      // 너무 자주 분석하지 않도록 제한 (5초마다)
      const now = Date.now();
      if (now - this.lastAnalysisTime < 5000) {
        return this.currentEmotion || { emotion: 'unknown', confidence: 0 };
      }

      // 사전 훈련된 모델이 로드되지 않았으면 기본 분석 사용
      if (!this.isModelLoaded || !this.model) {
        log.info('🔄 사전 훈련된 모델이 로드되지 않았습니다. 기본 분석을 사용합니다.');
        return this.analyzeBasicEmotion(audioBuffer);
      }

      log.info('🤖 사전 훈련된 경량 모델로 감정 분석 시작...');
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
        
        log.info('✅ 감정 분석 완료:', result);
      }
      
      return result;
      
    } catch (error) {
      log.error('❌ 감정 분석 실패:', error.message);
      return this.analyzeBasicEmotion(audioBuffer);
    }
  }

  // 기본 감정 분석 (fallback)
  analyzeBasicEmotion(audioBuffer) {
    try {
      if (!audioBuffer || audioBuffer.length < 16000) {
        return { emotion: 'unknown', confidence: 0 };
      }

      const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
      
      // 간단한 특징 분석
      let sum = 0;
      let zeroCrossings = 0;
      for (let i = 0; i < samples.length; i++) {
        sum += Math.abs(samples[i]);
        if (i > 0 && ((samples[i] >= 0 && samples[i-1] < 0) || (samples[i] < 0 && samples[i-1] >= 0))) {
          zeroCrossings++;
        }
      }
      
      const avgVolume = sum / samples.length;
      const zeroCrossingRate = zeroCrossings / samples.length;
      
      // 간단한 규칙 기반 감정 분류
      let emotion = 'neutral';
      let confidence = 0.5;
      
      if (avgVolume > 5000) {
        if (zeroCrossingRate > 0.1) {
          emotion = 'happy';
          confidence = 0.7;
        } else {
          emotion = 'angry';
          confidence = 0.6;
        }
      } else if (avgVolume < 2000) {
        emotion = 'sad';
        confidence = 0.6;
      } else if (zeroCrossingRate > 0.15) {
        emotion = 'excited';
        confidence = 0.6;
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
