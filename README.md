# Smart Mirror Application

스마트 미러를 위한 Node.js 기반 애플리케이션입니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| 음성 인식 | ETRI 음성인식 API를 통한 한국어 음성 명령 인식 |
| TTS 음성 합성 | Festival TTS를 통한 자연스러운 한국어 음성 출력 |
| 일정 관리 | ICS 파일 기반 일정 표시 |
| 날씨 정보 | OpenWeatherMap API를 통한 실시간 날씨 정보 |
| 뉴스 표시 | RSS 피드를 통한 최신 뉴스 표시 |
| 개인화 시스템 | 사용자 맞춤형 메시지 및 루틴 |
| **스마트 대화 시스템** | **문맥 인식 및 감정 분석 기반 지능형 대화** |

## 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# 서버 포트
PORT=8000

# OpenAI API 키 (선택사항)
OPENAI_API_KEY=your_openai_api_key_here

# 날씨 API 설정
WEATHER_API_KEY=your_openweathermap_api_key_here
CITY_ID=1835848

# ICS 캘린더 URL (쉼표로 구분)
CALENDAR_ICS_URLS=https://example.com/calendar1.ics,https://example.com/calendar2.ics

# ETRI 음성인식 API 키
ETRI_API_KEY=your_etri_api_key_here

# TTS 설정
CAPTION_HIDE_AFTER_TTS_MS=3000

# 상시 듣기 모드
ALWAYS_LISTEN=true

# 음성인식 품질 개선 설정 (선택사항)
AUDIO_CHUNK_SIZE=20        # 오디오 청크 크기 (약 1초)
MIN_TEXT_LENGTH=2          # 최소 텍스트 길이
MAX_CONSECUTIVE_EMPTY=10   # 최대 연속 빈 결과
```

**중요**: `.env` 파일은 반드시 프로젝트 루트 디렉토리에 있어야 하며, 파일명 앞에 점(.)이 있어야 합니다.

### 3. ETRI 음성인식 API 키 발급

1. [ETRI e-PreTX](https://epretx.etri.re.kr/apiDetail?id=88) 사이트에 접속
2. 회원가입 및 로그인
3. API 키 발급 신청
4. 발급받은 API 키를 `.env` 파일의 `ETRI_API_KEY`에 설정

### 4. ICS 캘린더 설정 (선택사항)

`calendar_sources.json` 파일을 생성하고 ICS URL을 추가하세요:

```json
{
  "ical": [
    "https://example.com/calendar1.ics",
    "https://example.com/calendar2.ics"
  ]
}
```

## 실행

```bash
npm start
```

서버가 시작되면 `http://localhost:8000`에서 접근할 수 있습니다.

## 음성 명령

### 호출어
- "미러야", "밀어야", "미뤄야", "미로야", "미라야"
- "미러", "미로", "미라"
- "하이미러", "하이 미러"

### 기본 명령
- "현재 시간 알려줘"
- "오늘 날씨는?"
- "뉴스 보여줘"
- "일정 확인해줘"

## API 엔드포인트

- `GET /api/weather` - 현재 날씨 정보
- `GET /api/time` - 현재 시간 정보
- `GET /api/news` - 최신 뉴스
- `POST /api/news` - 뉴스 질문 처리
- `GET /api/calendar/today` - 오늘 일정
- `GET /api/assistant` - 음성 기반 어시스턴트

## 기술 스택

- **백엔드**: Node.js, Express
- **음성인식**: ETRI 음성인식 API
- **TTS**: espeak
- **웹소켓**: ws
- **AI**: OpenAI GPT (선택사항)
- **스마트 대화**: 문맥 인식, 감정 분석, 의도 파악

## 제약사항

- ETRI 음성인식 API는 하루 1,000건으로 제한됩니다
- 음성 파일은 20초 이내여야 합니다
- 샘플링 주파수는 16kHz를 권장합니다

## 문제 해결

### 음성인식이 안 되는 경우
1. ETRI API 키가 올바르게 설정되었는지 확인
2. `.env` 파일이 프로젝트 루트에 있는지 확인
3. 마이크 권한 확인
4. 오디오 드라이버 상태 확인

### 대화가 맥락을 이해하지 못하는 경우
1. OpenAI API 키가 설정되어 있는지 확인 (GPT 기반 맥락 분석)
2. 환경 변수 `OPENAI_API_KEY` 설정 확인
3. 서버 재시작으로 대화 컨텍스트 초기화

### TTS가 작동하지 않는 경우
1. espeak 설치 확인
2. 오디오 출력 장치 확인

### 환경 변수가 로드되지 않는 경우
1. `.env` 파일이 프로젝트 루트 디렉토리에 있는지 확인
2. 파일명이 정확히 `.env`인지 확인 (숨김 파일)
3. 서버 재시작

### 음성인식 품질이 낮은 경우
1. `AUDIO_CHUNK_SIZE` 값을 조정 (기본값: 20)
2. `MIN_TEXT_LENGTH` 값을 증가 (기본값: 2)
3. `MAX_CONSECUTIVE_EMPTY` 값을 조정 (기본값: 10)
4. 마이크 위치 및 환경 소음 확인

### ETRI API 429 에러 (동시 요청 제한)
1. 음성인식 간격을 늘리기 위해 `AUDIO_CHUNK_SIZE` 증가
2. 불필요한 음성 인식 결과 필터링 강화
3. API 호출 빈도 조절

## 라이선스

ISC License
