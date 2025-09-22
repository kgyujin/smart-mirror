#!/usr/bin/env python3
"""
감정 분석 서버 테스트 스크립트
"""

import requests
import base64
import json
import time
import os

# 서버 설정
SERVER_URL = "http://localhost:5001"

def test_health_check():
    """서버 상태 확인 테스트"""
    print("🔍 서버 상태 확인 중...")
    try:
        response = requests.get(f"{SERVER_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 서버 상태: {data['status']}")
            print(f"📱 모델 로드됨: {data['model_loaded']}")
            print(f"🖥️ 디바이스: {data['device']}")
            return True
        else:
            print(f"❌ 서버 상태 확인 실패: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 서버 연결 실패: {e}")
        return False

def create_test_audio():
    """테스트용 오디오 데이터 생성 (실제로는 WAV 파일을 사용해야 함)"""
    # 간단한 테스트 데이터 (실제로는 WAV 파일을 base64로 인코딩)
    test_audio_data = b"RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x40\x1f\x00\x00\x80\x3e\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
    return base64.b64encode(test_audio_data).decode('utf-8')

def test_emotion_analysis():
    """감정 분석 테스트 (파일 기반)"""
    print("\n🎯 감정 분석 테스트 중...")
    
    # 실제 오디오 파일 사용
    if not os.path.exists('test_audio.wav'):
        print("❌ test_audio.wav 파일이 없습니다.")
        return False
    
    try:
        with open('test_audio.wav', 'rb') as f:
            audio_data = f.read()
        
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        start_time = time.time()
        
        response = requests.post(
            f"{SERVER_URL}/analyze_emotion",
            json={"audio_base64": audio_base64},
            timeout=15
        )
        
        processing_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print(f"✅ 감정 분석 성공!")
                print(f"😊 감정: {data['emotion']}")
                print(f"📊 신뢰도: {data['confidence']:.3f}")
                print(f"💬 응답: {data['response']}")
                print(f"⏱️ 처리 시간: {processing_time:.3f}초")
                
                # 감정 점수 출력
                if 'emotion_scores' in data:
                    print("\n📈 감정 점수:")
                    for emotion, score in data['emotion_scores'].items():
                        print(f"  {emotion}: {score:.3f}")
                
                return True
            else:
                print(f"❌ 감정 분석 실패: {data.get('error', 'Unknown error')}")
                return False
        else:
            print(f"❌ HTTP 오류: {response.status_code}")
            print(f"응답: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 감정 분석 테스트 실패: {e}")
        return False

def test_file_upload():
    """파일 업로드 테스트"""
    print("\n📁 파일 업로드 테스트 중...")
    
    # 테스트용 WAV 파일 생성
    test_wav_content = b"RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x40\x1f\x00\x00\x80\x3e\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
    
    try:
        files = {'file': ('test.wav', test_wav_content, 'audio/wav')}
        
        start_time = time.time()
        
        response = requests.post(
            f"{SERVER_URL}/analyze_emotion_file",
            files=files,
            timeout=15
        )
        
        processing_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print(f"✅ 파일 업로드 분석 성공!")
                print(f"😊 감정: {data['emotion']}")
                print(f"📊 신뢰도: {data['confidence']:.3f}")
                print(f"💬 응답: {data['response']}")
                print(f"⏱️ 처리 시간: {processing_time:.3f}초")
                return True
            else:
                print(f"❌ 파일 분석 실패: {data.get('error', 'Unknown error')}")
                return False
        else:
            print(f"❌ HTTP 오류: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 파일 업로드 테스트 실패: {e}")
        return False

def main():
    """메인 테스트 함수"""
    print("🚀 감정 분석 서버 테스트 시작")
    print("=" * 50)
    
    # 1. 서버 상태 확인
    if not test_health_check():
        print("\n❌ 서버가 실행되지 않았습니다.")
        print("다음 명령으로 서버를 시작하세요:")
        print("python emotion_server.py")
        return
    
    # 2. 감정 분석 테스트
    test_emotion_analysis()
    
    # 3. 파일 업로드 테스트
    test_file_upload()
    
    print("\n" + "=" * 50)
    print("✅ 테스트 완료!")
    print("\n📝 라즈베리파이에서 사용할 주소:")
    print(f"http://{get_local_ip()}:5001")

def get_local_ip():
    """로컬 IP 주소 가져오기"""
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "192.168.1.100"  # 기본값

if __name__ == "__main__":
    main()
