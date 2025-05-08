#!/usr/bin/env python3

from google.cloud import speech
import os

def main():
    # 환경 변수 확인
    if 'GOOGLE_APPLICATION_CREDENTIALS' not in os.environ:
        print("GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다.")
        print("서비스 계정 키 파일 경로를 설정하세요:")
        print("export GOOGLE_APPLICATION_CREDENTIALS=\"/path/to/key.json\"")
        return
    
    print(f"인증 파일 경로: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')}")
    
    # 클라이언트 초기화 시도
    try:
        client = speech.SpeechClient()
        print("Speech-to-Text 클라이언트가 성공적으로 초기화되었습니다.")
        print("API에 접근할 수 있습니다.")
    except Exception as e:
        print(f"오류 발생: {e}")
        print("API 접근이 실패했습니다.")

if __name__ == "__main__":
    main()

