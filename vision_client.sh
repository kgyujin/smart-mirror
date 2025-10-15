#!/bin/bash

# Vision Client 실행 스크립트

# 기본 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PATH="$SCRIPT_DIR/vision_client_env"

# .env 파일에서 설정 읽기
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
    DEFAULT_SERVER="http://${VISION_SERVER_IP:-localhost}:${VISION_SERVER_PORT:-5051}"
else
    DEFAULT_SERVER="http://localhost:5051"
fi

# 도움말 함수
show_help() {
    echo "🎥 Vision Client 실행 스크립트"
    echo ""
    echo "사용법:"
    echo "  $0 [옵션]"
    echo ""
    echo "옵션:"
    echo "  -s, --server <URL>     Vision Server 주소 (기본값: $DEFAULT_SERVER)"
    echo "  -c, --camera <INDEX>   카메라 장치 인덱스 (기본값: 0)"
    echo "  -t, --test             테스트 모드로 실행"
    echo "  -h, --help            이 도움말 표시"
    echo ""
    echo "예시:"
    echo "  $0 --server http://192.168.0.162:5051"
    echo "  $0 --camera 1 --server http://192.168.0.162:5051"
    echo "  $0 --test"
}

# 파라미터 파싱
SERVER_URL="$DEFAULT_SERVER"
CAMERA_INDEX=0
TEST_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--server)
            SERVER_URL="$2"
            shift 2
            ;;
        -c|--camera)
            CAMERA_INDEX="$2"
            shift 2
            ;;
        -t|--test)
            TEST_MODE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "❌ 알 수 없는 옵션: $1"
            show_help
            exit 1
            ;;
    esac
done

echo "🎥 Vision Client 시작 중..."
echo "📡 서버 주소: $SERVER_URL"
echo "📷 카메라 인덱스: $CAMERA_INDEX"

# 가상환경 확인 및 활성화
if [ ! -d "$VENV_PATH" ]; then
    echo "❌ 가상환경이 없습니다. setup_vision_client.sh를 먼저 실행하세요."
    exit 1
fi

echo "🐍 가상환경 활성화 중..."
source "$VENV_PATH/bin/activate"

# Python 스크립트 존재 확인
if [ ! -f "$SCRIPT_DIR/vision_client.py" ]; then
    echo "❌ vision_client.py 파일이 없습니다."
    exit 1
fi

# 카메라 장치 확인
echo "📷 카메라 장치 확인 중..."
if ls /dev/video* > /dev/null 2>&1; then
    VIDEO_COUNT=$(ls /dev/video* 2>/dev/null | wc -l)
    echo "✅ $VIDEO_COUNT개의 비디오 장치 발견"
    echo "   (자동으로 작동하는 카메라를 찾습니다)"
else
    echo "❌ 카메라 장치를 찾을 수 없습니다."
    echo "   웹캠이 연결되어 있는지 확인하세요."
fi

# 서버 연결 테스트
echo "🔍 서버 연결 테스트 중..."
if ! curl -s --connect-timeout 5 "$SERVER_URL/health" > /dev/null 2>&1; then
    echo "⚠️  경고: Vision Server에 연결할 수 없습니다 ($SERVER_URL)"
    echo "   계속 진행하시겠습니까? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Vision Client 실행
echo "🚀 Vision Client 실행 중..."

if [ "$TEST_MODE" = true ]; then
    echo "🧪 테스트 모드로 실행합니다."
    python3 "$SCRIPT_DIR/vision_client.py" --server "$SERVER_URL" --camera "$CAMERA_INDEX" --test
else
    python3 "$SCRIPT_DIR/vision_client.py" --server "$SERVER_URL" --camera "$CAMERA_INDEX"
fi

# 실행 결과 확인
exit_code=$?
if [ $exit_code -eq 0 ]; then
    echo "✅ Vision Client가 정상적으로 종료되었습니다."
else
    echo "❌ Vision Client가 오류와 함께 종료되었습니다. (종료 코드: $exit_code)"
fi

deactivate
exit $exit_code