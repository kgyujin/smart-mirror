# Smart Mirror Application

스마트 미러를 위한 Node.js 기반 애플리케이션입니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| 음성 인식 | ETRI 음성인식 API를 통한 한국어 음성 명령 인식 |
| TTS 음성 합성 | espeak를 통한 한국어 음성 출력 |
| 일정 관리 | ICS 파일 기반 일정 표시 |
| 날씨 정보 | OpenWeatherMap API를 통한 실시간 날씨 정보 |
| 뉴스 표시 | RSS 피드를 통한 최신 뉴스 표시 |
| 개인화 시스템 | 사용자 맞춤형 메시지 및 루틴 |
| 대화 시스템 | 간단한 대화 처리 및 명령 실행 |

## 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# 서버 포트
PORT=3000

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
```

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

서버가 시작되면 `http://localhost:3000`에서 접근할 수 있습니다.

## 음성 명령

### 호출어
- "미러야"
- "밀어야"
- "하이미러"

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

## 제약사항

- ETRI 음성인식 API는 하루 1,000건으로 제한됩니다
- 음성 파일은 20초 이내여야 합니다
- 샘플링 주파수는 16kHz를 권장합니다

## 문제 해결

### 음성인식이 안 되는 경우
1. ETRI API 키가 올바르게 설정되었는지 확인
2. 마이크 권한 확인
3. 오디오 드라이버 상태 확인

### TTS가 작동하지 않는 경우
1. espeak 설치 확인
2. 오디오 출력 장치 확인

## 라이선스

ISC License
