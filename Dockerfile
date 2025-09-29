# Python 3.11 기반 이미지 사용
FROM python:3.11-slim

# 작업 디렉토리 생성 및 이동
WORKDIR /app

# requirements.txt 복사 및 패키지 설치
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 소스 코드 복사
COPY . .

# emotion_server.py 실행 (필요에 따라 CMD 수정 가능)
CMD ["python", "emotion_server.py"]
