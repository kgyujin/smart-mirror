# 🔧 설정 완료 체크리스트

## ✅ **1. OpenAI API 설정**

### **설치 및 설정**
```bash
# 1. OpenAI 패키지 설치
pip install openai==1.52.0

# 2. 설정 스크립트 실행
chmod +x setup_openai.sh
./setup_openai.sh
```

### **API 키 발급 및 설정**
1. https://platform.openai.com/api-keys 방문
2. 로그인 후 "Create new secret key" 클릭  
3. 생성된 키를 `.env` 파일에 추가:

```env
# .env 파일에 추가
OPENAI_API_KEY=sk-1234567890abcdef...
```

### **설정 확인**
```bash
# API 키 설정 확인
grep OPENAI_API_KEY .env

# AI 서버 실행
python ai_server.py
```

**성공 시 출력:**
```
ChatGPT API 연결 설정 완료 (OpenAI v1.52.0)
```

## ✅ **2. 날씨 정보 연동 확인**

### **옷차림 분석 테스트**
1. 라즈베리파이에서 Node.js 앱 실행
2. "미러야" → "오늘 나 어때?" 발화
3. 로그에서 날씨 정보 연동 확인:

```
라즈베리파이에서 날씨 정보 획득: {temperature: 19, condition: 'clear'}
옷차림 분석용 날씨 정보: {temp: 19, condition: 'clear'}
```

## 🔧 **문제 해결**

### **OpenAI 관련 오류**
- `⚠️ OpenAI 패키지가 설치되지 않음`
  → `pip install openai==1.52.0` 실행
  
- `⚠️ OPENAI_API_KEY 환경변수가 설정되지 않음`  
  → `.env` 파일에 API 키 추가

- `ChatGPT API 초기화 실패`
  → API 키 형식 확인 (sk-로 시작하는지)

### **날씨 정보 오류**
- `날씨 정보 획득 실패, 기본값 사용`
  → OpenWeatherMap API 키 설정 확인
  → 인터넷 연결 상태 확인

## 💡 **추가 팁**

1. **API 키 보안**: `.env` 파일을 `.gitignore`에 추가
2. **비용 관리**: OpenAI 사용량 모니터링 설정
3. **Fallback**: API 키 없이도 기본 응답 시스템 작동
4. **로그 확인**: `LOG_LEVEL=DEBUG`로 상세 로그 확인 가능