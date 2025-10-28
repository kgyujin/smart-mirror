#!/bin/bash
# ========== OpenAI API 설정 가이드 ==========

echo "🔑 OpenAI API 설정을 시작합니다..."
echo ""

# 1. OpenAI 패키지 설치
echo "📦 1단계: OpenAI 패키지 설치"
echo "다음 명령어를 실행하세요:"
echo ""
echo "pip install openai==1.52.0"
echo ""

# 2. API 키 발급 안내
echo "🔐 2단계: OpenAI API 키 발급"
echo "1. https://platform.openai.com/api-keys 방문"
echo "2. 로그인 또는 회원가입"
echo "3. 'Create new secret key' 클릭"
echo "4. API 키 복사 (sk-로 시작하는 긴 문자열)"
echo ""

# 3. 환경변수 설정 방법 안내
echo "⚙️ 3단계: 환경변수 설정 방법"
echo ""
echo "방법 1: .env 파일에 추가 (권장)"
echo "다음 내용을 .env 파일에 추가하세요:"
echo ""
echo "# OpenAI API 설정"
echo "OPENAI_API_KEY=여기에_복사한_API키_입력"
echo ""
echo "예시:"
echo "OPENAI_API_KEY=sk-1234567890abcdef..."
echo ""
echo "방법 2: 터미널에서 직접 설정"
echo "export OPENAI_API_KEY='여기에_복사한_API키_입력'"
echo ""

# 4. 설정 확인 방법
echo "✅ 4단계: 설정 확인"
echo "다음 명령어로 설정이 올바른지 확인하세요:"
echo ""
echo "# .env 파일 확인"
echo "grep OPENAI_API_KEY .env"
echo ""
echo "# 환경변수 확인"
echo "echo \$OPENAI_API_KEY"
echo ""

# 5. AI 서버 재시작 안내
echo "🔄 5단계: AI 서버 재시작"
echo "설정 완료 후 AI 서버를 재시작하세요:"
echo ""
echo "python ai_server.py"
echo ""
echo "성공 시 다음과 같은 로그가 출력됩니다:"
echo "✅ ChatGPT API 연결 설정 완료"
echo ""

# 6. 문제 해결
echo "🔧 문제 해결"
echo ""
echo "만약 여전히 경고가 나타나면:"
echo "1. .env 파일에 API 키가 올바르게 입력되었는지 확인"
echo "2. API 키에 따옴표나 공백이 없는지 확인"  
echo "3. OpenAI 계정에 크레딧이 있는지 확인"
echo "4. 터미널을 재시작하고 다시 시도"
echo ""

echo "💡 참고: API 키가 없어도 기본 응답 시스템이 작동합니다."
echo "하지만 ChatGPT 기반의 자연스러운 응답을 위해서는 API 키가 필요합니다."
echo ""