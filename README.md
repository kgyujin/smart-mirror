# Smart Mirror (mirror-app)

AI 기반 한국어 스마트 미러 애플리케이션으로, 음성 인식, TTS, 개인화, 날씨/뉴스/일정 표시 등의 기능을 제공합니다.

| 항목 | 버전/설명 |
| --- | -------- |
| Node.js |  |
| Express.js |  |
| OpenAI GPT | 자연어 대화 처리 |
| Google Cloud API | 음성 인식 |
| WebSocket | 실시간 통신 |

## 기능
| 기능 | 설명 |
| --- | --- |
| 음성 인식 | "미러야", "하이 미러" 웨이크워드로 음성 명령 수신 |
| TTS 음성 합성 | Google Cloud TTS로 자연스러운 한국어 음성 출력 |
| AI 대화 | OpenAI GPT 기반 맥락적 대화 및 루틴 처리 |
| 날씨 정보 | OpenWeatherMap API 기반 실시간 날씨 표시 |
| 일정 관리 | Google Calendar 연동으로 일정 표시 |
| 뉴스 | RSS 피드 기반 최신 뉴스 제공 |
| 개인화 | 사용자 패턴 학습 및 맞춤형 메시지 생성 |
| 대화 컨텍스트 | 이전 대화 기억 및 후속 질문 처리 |
| 웹 인터페이스 | 실시간 정보 표시 및 채팅 기능 |
| 루틴 시스템 | 아침/업무/저녁 루틴 자동화 |
| 날짜 시간 처리 | 상대적 날짜 파싱 및 KST 기준 시간 표시 |
| Google Assistant 연동 | gRPC 기반 Google Assistant 대화 |

## 구조
```
mirror-app/
├─ css/
│  └─ main.css
├─ js/
│  ├─ assistant.js
│  ├─ calendar.js
│  ├─ config.js
│  ├─ conversation.js
│  ├─ frontend/
│  │  ├─ client-captions.js
│  │  ├─ client-chat.js
│  │  ├─ client-data.js
│  │  ├─ client-main.js
│  │  ├─ client-render.js
│  │  ├─ client-ui.js
│  │  └─ client-websocket.js
│  ├─ logging.js
│  ├─ news.js
│  ├─ personalization.js
│  ├─ speech.js
│  ├─ tts.js
│  ├─ weather.js
│  └─ websocket.js
├─ public/
│  └─ index.html
├─ app.js.backup
├─ main.js
└─ README.md
```

## 환경변수(.env) 설정

```env
# 서버 설정
PORT=3000

# OpenAI API
OPENAI_API_KEY=

# 날씨 API (OpenWeatherMap)
WEATHER_API_KEY=
CITY_ID=1835848  # 서울

# 음성 인식/합성
ALWAYS_LISTEN=true

# TTS 설정 (선택사항)
TTS_VOICE=ko-KR-Wavenet-A
TTS_RATE=1.0
TTS_PITCH=0.0
CAPTION_HIDE_AFTER_TTS_MS=3000

# 캘린더 (선택사항)
CALENDAR_ICS_URLS=https://example.com/calendar.ics
```

## 사용 방법
1. `.env` 파일에 환경변수 설정
2. Google Cloud 인증 파일 배치
   - `credentials.json`: Google Calendar OAuth2 인증 정보
   - `tokens.json`: Google Calendar 액세스 토큰
   - `credentials_serviceAccount.json`: Google Cloud Speech/TTS 서비스 계정 키
   - `google/assistant/embedded/v1alpha2/embedded_assistant.proto`: Google Assistant gRPC proto 파일
3. 의존성 설치
   ```bash
   npm install
   ```
4. 서버 실행
   ```bash
   node main.js
   ```
5. 웹 인터페이스 접속
   ```
   http://localhost:3000
   ```

## API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/weather` | GET | 현재 날씨 정보 |
| `/api/time` | GET | 현재 시간/날짜 |
| `/api/calendar/today` | GET | 오늘 일정 |
| `/api/news` | GET/POST | 뉴스 정보 |
| `/api/chat` | POST | 텍스트 대화 처리 |
| `/api/mic/toggle` | POST | 마이크 토글 |
| `/api/personalized-message` | GET | 개인화 메시지 |
| `/api/summary` | GET | 일일 요약 |
| `/api/health` | GET | 서버 상태 체크 |

## 참고
- 애플리케이션이 정상적으로 동작하려면 OpenAI API 키와 Google Cloud 인증 파일이 필요합니다.
- 음성 인식 기능을 사용하려면 마이크 하드웨어와 권한 설정이 필요합니다.
- 웹 인터페이스는 `http://localhost:3000`에서 접속할 수 있습니다.
- 로그는 서버 실행 시 콘솔에 출력됩니다.