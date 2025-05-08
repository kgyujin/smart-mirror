#!/usr/bin/env python3

import os
import io
import argparse
import pyaudio
import wave
import time
import json
import requests
import subprocess
import datetime
import threading
import signal
import sys
from dateutil import parser
try:
    import simpleaudio as sa
    HAS_SIMPLEAUDIO = True
except ImportError:
    HAS_SIMPLEAUDIO = False
    print("경고: simpleaudio 패키지가 설치되지 않았습니다. 음성 응답이 불가능합니다.")
    print("다음 명령어로 설치하세요: pip install simpleaudio")

try:
    from google.cloud import speech
    HAS_SPEECH = True
except ImportError:
    HAS_SPEECH = False
    print("경고: google-cloud-speech 패키지가 설치되지 않았습니다.")
    print("다음 명령어로 설치하세요: pip install google-cloud-speech")

try:
    from google.cloud import texttospeech
    HAS_TTS = True
except ImportError:
    HAS_TTS = False
    print("경고: google-cloud-texttospeech 패키지가 설치되지 않았습니다.")
    print("다음 명령어로 설치하세요: pip install google-cloud-texttospeech")

# 오디오 디바이스 설정을 위한 상수
DEFAULT_SAMPLE_RATE = 16000
DEFAULT_CHUNK_SIZE = 1024
DEFAULT_FORMAT = pyaudio.paInt16
DEFAULT_CHANNELS = 1
MAX_RETRY_COUNT = 3

class VoiceAssistant:
    def __init__(self, language_code='ko-KR', device_index=None):
        self.language_code = language_code
        self.device_index = device_index
        self.is_running = True
        self.error_messages = {
            "alsa_card_error": "오디오 카드를 찾을 수 없습니다. USB 마이크가 제대로 연결되어 있는지 확인하세요.",
            "jack_server_error": "JACK 오디오 서버에 연결할 수 없습니다. 오디오 시스템이 다른 프로그램에 의해 사용 중일 수 있습니다.",
            "no_such_file": "필요한 오디오 설정 파일을 찾을 수 없습니다. ALSA 설정을 확인하세요.",
            "invalid_card": "올바르지 않은 오디오 카드입니다. 마이크 설정을 확인하세요.",
            "unknown_pcm": "알 수 없는 PCM 오디오 형식입니다. 호환되는 오디오 장치를 사용하세요."
        }
        
        # 시스템 오디오 상태 확인
        self.check_audio_system()
        
        # 환경 변수 설정 확인
        if 'GOOGLE_APPLICATION_CREDENTIALS' not in os.environ:
            print("경고: GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다.")
            print("서비스 계정 키 파일 경로를 설정하세요:")
            print("export GOOGLE_APPLICATION_CREDENTIALS=\"/path/to/key.json\"")
        else:
            cred_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
            print(f"인증 파일 경로: {cred_path}")
            if not os.path.exists(cred_path):
                print("경고: 지정된 인증 파일이 존재하지 않습니다. 올바른 경로를 설정하세요.")
        
        # Speech-to-Text 클라이언트 초기화
        if HAS_SPEECH:
            try:
                self.speech_client = speech.SpeechClient()
                print("✅ Speech-to-Text 클라이언트가 성공적으로 초기화되었습니다.")
            except Exception as e:
                print(f"❌ Speech-to-Text 클라이언트 초기화 실패: {e}")
                print("Google Cloud 인증 설정을 확인하세요.")
                self.speech_client = None
        else:
            self.speech_client = None
            print("❌ Speech-to-Text 기능을 사용할 수 없습니다.")
        
        # Text-to-Speech 클라이언트 초기화
        self.tts_client = None
        if HAS_TTS:
            try:
                self.tts_client = texttospeech.TextToSpeechClient()
                print("✅ Text-to-Speech 클라이언트가 성공적으로 초기화되었습니다.")
            except Exception as e:
                print(f"❌ Text-to-Speech 클라이언트 초기화 실패: {e}")
                print("Google Cloud 인증 설정을 확인하세요.")
        else:
            print("❌ Text-to-Speech 기능을 사용할 수 없습니다.")
        
        # 오디오 장치 설정
        self.available_devices = self.setup_audio_devices()
        
        # 학습된 명령어 목록
        self.commands = {
            "안녕": self.greet,
            "날씨": self.get_weather,
            "시간": self.get_time,
            "날짜": self.get_date,
            "요일": self.get_day,
            "이름": self.get_name,
            "종료": self.shutdown,
            "도움말": self.help,
            "능력": self.capabilities,
            "음악": self.play_music,
            "뉴스": self.get_news
        }
        
        # 소개 메시지 준비
        self.welcome_message = "라즈베리파이 음성 비서가 시작되었습니다. 무엇을 도와드릴까요?"
    
    def check_audio_system(self):
        """시스템 오디오 설정을 확인합니다."""
        print("오디오 시스템 확인 중...")
        
        # 마이크 확인
        try:
            mic_result = subprocess.run(["arecord", "-l"], capture_output=True, text=True)
            if "card" in mic_result.stdout:
                print("✅ 마이크가 감지되었습니다.")
            else:
                print("❌ 마이크가 감지되지 않았습니다. USB 마이크를 연결하세요.")
        except Exception as e:
            print(f"❌ 마이크 확인 중 오류: {e}")
        
        # 스피커 확인
        try:
            speaker_result = subprocess.run(["aplay", "-l"], capture_output=True, text=True)
            if "card" in speaker_result.stdout:
                print("✅ 스피커가 감지되었습니다.")
            else:
                print("❌ 스피커가 감지되지 않았습니다. 오디오 출력 장치를 확인하세요.")
        except Exception as e:
            print(f"❌ 스피커 확인 중 오류: {e}")
        
        # ALSA 임시 설정 파일 생성
        try:
            home_dir = os.path.expanduser("~")
            asound_path = os.path.join(home_dir, ".asoundrc")
            
            # 기존 파일이 없을 경우에만 생성
            if not os.path.exists(asound_path):
                with open(asound_path, "w") as f:
                    f.write("""
pcm.!default {
    type asym
    capture.pcm "mic"
    playback.pcm "speaker"
}

pcm.mic {
    type plug
    slave {
        pcm "hw:2,0"  # USB 마이크를 사용하는 경우 (카드 2, 장치 0)
    }
}

pcm.speaker {
    type plug
    slave {
        pcm "hw:0,0"  # 기본 스피커 (카드 0, 장치 0)
    }
}
                    """)
                print("✅ ALSA 설정 파일이 생성되었습니다.")
            else:
                print("✅ ALSA 설정 파일이 이미 존재합니다.")
        except Exception as e:
            print(f"❌ ALSA 설정 파일 생성 중 오류: {e}")
    
    def setup_audio_devices(self):
        """오디오 장치를 설정하고 사용 가능한 장치 목록을 반환합니다."""
        devices = {"input": [], "output": []}
        
        try:
            p = pyaudio.PyAudio()
            info = p.get_host_api_info_by_index(0)
            num_devices = info.get('deviceCount')
            
            print("\n사용 가능한 오디오 장치:")
            for i in range(0, num_devices):
                device_info = p.get_device_info_by_host_api_device_index(0, i)
                if (device_info.get('maxInputChannels')) > 0:
                    print(f"입력 장치 {i}: {device_info.get('name')}")
                    devices["input"].append({
                        "index": i,
                        "name": device_info.get('name')
                    })
                if (device_info.get('maxOutputChannels')) > 0:
                    print(f"출력 장치 {i}: {device_info.get('name')}")
                    devices["output"].append({
                        "index": i,
                        "name": device_info.get('name')
                    })
            
            p.terminate()
            return devices
        
        except Exception as e:
            print(f"❌ 오디오 장치 확인 중 오류: {e}")
            return devices
    
    def find_usb_audio_device(self):
        """USB 오디오 장치를 찾습니다."""
        for device in self.available_devices["input"]:
            if "USB" in device["name"] or "usb" in device["name"].lower():
                return device["index"]
        
        # USB 장치가 없으면 기본 입력 장치 반환
        if self.available_devices["input"]:
            return self.available_devices["input"][0]["index"]
        
        return None
    
    def record_audio(self, sample_rate=DEFAULT_SAMPLE_RATE, chunk_size=DEFAULT_CHUNK_SIZE, record_seconds=5):
        """마이크에서 오디오를 녹음합니다."""
        retry_count = 0
        
        # 장치 인덱스가 설정되지 않았다면 USB 오디오 장치를 찾음
        if self.device_index is None:
            self.device_index = self.find_usb_audio_device()
            if self.device_index is not None:
                print(f"입력 장치 인덱스: {self.device_index}를 사용합니다.")
        
        while retry_count < MAX_RETRY_COUNT:
            try:
                p = pyaudio.PyAudio()
                
                # 오디오 스트림 열기
                stream = p.open(format=DEFAULT_FORMAT,
                               channels=DEFAULT_CHANNELS,
                               rate=sample_rate,
                               input=True,
                               input_device_index=self.device_index,
                               frames_per_buffer=chunk_size)
                
                print("🎤 녹음 시작...")
                frames = []
                
                # 녹음 진행
                for i in range(0, int(sample_rate / chunk_size * record_seconds)):
                    data = stream.read(chunk_size, exception_on_overflow=False)
                    frames.append(data)
                
                print("✅ 녹음 완료.")
                
                # 리소스 정리
                stream.stop_stream()
                stream.close()
                p.terminate()
                
                return b''.join(frames), sample_rate
            
            except OSError as e:
                retry_count += 1
                error_msg = str(e).lower()
                
                if "no such file" in error_msg:
                    print(f"❌ {self.error_messages['no_such_file']}")
                elif "invalid card" in error_msg or "card" in error_msg:
                    print(f"❌ {self.error_messages['invalid_card']}")
                elif "unknown pcm" in error_msg:
                    print(f"❌ {self.error_messages['unknown_pcm']}")
                elif "jack server" in error_msg:
                    print(f"❌ {self.error_messages['jack_server_error']}")
                else:
                    print(f"❌ 오디오 녹음 오류: {e}")
                
                if retry_count < MAX_RETRY_COUNT:
                    print(f"재시도 중... ({retry_count}/{MAX_RETRY_COUNT})")
                    time.sleep(1)  # 잠시 대기 후 재시도
                    
                    # 재시도할 때 다른 입력 장치 시도
                    if self.available_devices["input"] and len(self.available_devices["input"]) > 1:
                        current_idx = 0 if self.device_index is None else self.device_index
                        for device in self.available_devices["input"]:
                            if device["index"] != current_idx:
                                self.device_index = device["index"]
                                print(f"다른 입력 장치(인덱스: {self.device_index})로 시도합니다.")
                                break
                else:
                    print("❌ 최대 재시도 횟수를 초과했습니다.")
                    break
        
        return None, sample_rate
    
    def recognize_speech(self, audio_data, sample_rate):
        """Google Cloud Speech-to-Text API를 사용하여 오디오를 텍스트로 변환합니다."""
        if audio_data is None or self.speech_client is None:
            return None
            
        audio = speech.RecognitionAudio(content=audio_data)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=sample_rate,
            language_code=self.language_code,
            model="command_and_search",  # 명령 인식에 최적화된 모델
            speech_contexts=[{
                "phrases": list(self.commands.keys()),  # 명령어 목록을 인식 힌트로 제공
                "boost": 15.0  # 명령어 인식 확률 향상
            }],
        )
        
        print("🔍 음성 인식 중...")
        try:
            response = self.speech_client.recognize(config=config, audio=audio)
            
            if not response.results:
                print("❌ 인식된 결과가 없습니다.")
                return None
            
            transcript = response.results[0].alternatives[0].transcript
            confidence = response.results[0].alternatives[0].confidence
            
            print(f"인식 정확도: {confidence:.2f}")
            return transcript
        except Exception as e:
            print(f"❌ 음성 인식 중 오류 발생: {e}")
            return None
    
    def text_to_speech(self, text):
        """텍스트를 음성으로 변환합니다."""
        if not HAS_TTS or self.tts_client is None:
            print(f"💬 응답: {text}")
            return None
            
        try:
            synthesis_input = texttospeech.SynthesisInput(text=text)
            
            # 여성 음성으로 설정 (NEUTRAL이 지원되지 않으므로)
            voice = texttospeech.VoiceSelectionParams(
                language_code=self.language_code,
                ssml_gender=texttospeech.SsmlVoiceGender.FEMALE
            )
            
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.LINEAR16,
                speaking_rate=1.0,  # 말하기 속도 (0.25-4.0)
                pitch=0.0,  # 음높이 (-20.0-20.0)
                volume_gain_db=0.0  # 볼륨 (-96.0-16.0)
            )
            
            response = self.tts_client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            
            return response.audio_content
        except Exception as e:
            print(f"❌ 텍스트를 음성으로 변환 중 오류 발생: {e}")
            print("다른 음성 유형으로 시도합니다...")
            
            try:
                # 남성 음성으로 재시도
                voice = texttospeech.VoiceSelectionParams(
                    language_code=self.language_code,
                    ssml_gender=texttospeech.SsmlVoiceGender.MALE
                )
                
                response = self.tts_client.synthesize_speech(
                    input=synthesis_input, voice=voice, audio_config=audio_config
                )
                
                return response.audio_content
            except Exception as e2:
                print(f"❌ 두 번째 시도도 실패: {e2}")
                return None
    
    def play_audio(self, audio_content):
        """오디오 콘텐츠를 재생합니다."""
        if audio_content is None or not HAS_SIMPLEAUDIO:
            return
            
        try:
            # 임시 WAV 파일로 저장
            with open("temp_response.wav", "wb") as out:
                out.write(audio_content)
            
            # WAV 파일 재생
            wave_obj = sa.WaveObject.from_wave_file("temp_response.wav")
            play_obj = wave_obj.play()
            play_obj.wait_done()
            
            # 임시 파일 삭제
            os.remove("temp_response.wav")
        except Exception as e:
            print(f"❌ 오디오 재생 중 오류 발생: {e}")
    
    # 명령어 처리 함수들
    def greet(self):
        """인사 명령을 처리합니다."""
        current_hour = datetime.datetime.now().hour
        
        if 5 <= current_hour < 12:
            return "안녕하세요! 좋은 아침입니다. 라즈베리파이 음성 비서입니다. 무엇을 도와드릴까요?"
        elif 12 <= current_hour < 18:
            return "안녕하세요! 즐거운 오후입니다. 라즈베리파이 음성 비서입니다. 무엇을 도와드릴까요?"
        else:
            return "안녕하세요! 편안한 저녁입니다. 라즈베리파이 음성 비서입니다. 무엇을 도와드릴까요?"
    
    def get_weather(self):
        """날씨 정보를 제공합니다."""
        try:
            # 간단한 날씨 API (OpenWeatherMap 등) 사용 예시
            # 실제 구현에서는 API 키와 위치 정보를 설정해야 합니다.
            # api_key = "YOUR_API_KEY"
            # city = "Seoul"
            # url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={api_key}&units=metric"
            # response = requests.get(url)
            # data = response.json()
            
            # 테스트용 더미 데이터
            now = datetime.datetime.now()
            data = {
                "main": {"temp": 22, "humidity": 65},
                "weather": [{"description": "맑음"}],
                "wind": {"speed": 3.5}
            }
            
            # 실제 API 연동 시 아래 주석 해제
            # temp = data["main"]["temp"]
            # humidity = data["main"]["humidity"]
            # description = data["weather"][0]["description"]
            # wind_speed = data["wind"]["speed"]
            
            # 테스트용 날씨 정보
            temp = data["main"]["temp"]
            humidity = data["main"]["humidity"]
            description = data["weather"][0]["description"]
            wind_speed = data["wind"]["speed"]
            
            return f"현재 서울의 날씨는 {description}이며, 기온은 {temp}도, 습도는 {humidity}%, 풍속은 {wind_speed}m/s입니다."
        except Exception as e:
            print(f"날씨 정보 가져오기 실패: {e}")
            return "죄송합니다. 현재 날씨 정보를 가져올 수 없습니다."
    
    def get_time(self):
        """현재 시간을 알려줍니다."""
        now = datetime.datetime.now()
        return f"현재 시간은 {now.hour}시 {now.minute}분 {now.second}초입니다."
    
    def get_date(self):
        """오늘 날짜를 알려줍니다."""
        now = datetime.datetime.now()
        return f"오늘은 {now.year}년 {now.month}월 {now.day}일입니다."
    
    def get_day(self):
        """오늘의 요일을 알려줍니다."""
        now = datetime.datetime.now()
        days = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
        day_index = now.weekday()
        return f"오늘은 {days[day_index]}입니다."
    
    def get_name(self):
        """비서의 이름을 알려줍니다."""
        return "저는 라즈베리파이에서 실행되는 인공지능 음성 비서입니다. 제 이름은 라즈비입니다."
    
    def shutdown(self):
        """음성 비서를 종료합니다."""
        self.is_running = False
        return "음성 비서를 종료합니다. 안녕히 계세요."
    
    def help(self):
        """도움말을 제공합니다."""
        commands_list = ", ".join(self.commands.keys())
        return f"사용 가능한 명령어: {commands_list}. 원하는 명령을 말씀해주세요."
    
    def capabilities(self):
        """비서의 기능을 설명합니다."""
        return "저는 시간 알림, 날짜 확인, 날씨 정보 제공, 간단한 대화 등을 할 수 있습니다. '도움말'이라고 말씀하시면 모든 명령어를 확인할 수 있습니다."
    
    def play_music(self):
        """음악 재생을 시뮬레이션합니다."""
        return "죄송합니다. 현재 음악 재생 기능은 구현되어 있지 않습니다. 추후 업데이트에서 제공될 예정입니다."
    
    def get_news(self):
        """뉴스 헤드라인을 알려줍니다."""
        return "오늘의 주요 뉴스를 알려드립니다. 현재 이 기능은 데모 버전으로, 실제 뉴스 API와 연동되어 있지 않습니다."
    
    def process_command(self, text):
        """사용자의 명령을 처리합니다."""
        if not text:
            return "음성 인식에 실패했습니다. 다시 말씀해 주세요."
        
        text_lower = text.lower()
        
        # 명령어 찾기
        for command, handler in self.commands.items():
            if command in text_lower:
                return handler()
        
        # 일반적인 대화 응답
        if "뭐해" in text_lower or "뭐 해" in text_lower:
            return "저는 당신의 명령을 기다리고 있어요. 무엇을 도와드릴까요?"
        elif "고마워" in text_lower or "감사" in text_lower:
            return "천만에요. 더 필요한 것이 있으시면 말씀해주세요."
        elif "안녕히" in text_lower or "잘 가" in text_lower:
            return "안녕히 계세요. 좋은 하루 되세요."
        
        # 명령을 이해하지 못한 경우
        return "죄송합니다. 이해하지 못했습니다. '도움말'이라고 말씀하시면 사용 가능한 명령어를 알려드립니다."
    
    def signal_handler(self, sig, frame):
        """Ctrl+C 키 입력을 처리합니다."""
        print("\n프로그램을 종료합니다...")
        self.is_running = False
        sys.exit(0)
    
    def run(self, duration=5):
        """음성 비서를 실행합니다."""
        # Ctrl+C 핸들러 등록
        signal.signal(signal.SIGINT, self.signal_handler)
        
        print("\n" + "="*50)
        print("🤖 라즈베리파이 음성 비서가 시작되었습니다")
        print("종료하려면 '종료'라고 말하거나 Ctrl+C를 누르세요")
        print("="*50 + "\n")
        
        # 시작 메시지 음성 출력
        welcome_audio = self.text_to_speech(self.welcome_message)
        self.play_audio(welcome_audio)
        
        while self.is_running:
            try:
                print("\n🎙️ Enter 키를 눌러 녹음 시작 (Ctrl+C로 종료)...")
                input()
                
                # 오디오 녹음
                audio_data, sample_rate = self.record_audio(record_seconds=duration)
                
                # 음성 인식
                transcript = self.recognize_speech(audio_data, sample_rate)
                
                if not transcript:
                    error_message = "음성을 인식하지 못했습니다. 다시 시도해주세요."
                    print(f"❌ {error_message}")
                    error_audio = self.text_to_speech(error_message)
                    self.play_audio(error_audio)
                    continue
                
                print(f"🗣️ 인식된 텍스트: {transcript}")
                
                # 명령 처리
                response_text = self.process_command(transcript)
                print(f"🤖 응답: {response_text}")
                
                # 음성 합성 및 재생
                audio_response = self.text_to_speech(response_text)
                self.play_audio(audio_response)
                
                # 종료 명령 확인
                if "종료" in transcript.lower():
                    break
                
            except KeyboardInterrupt:
                print("\n프로그램을 종료합니다...")
                break
            except Exception as e:
                print(f"❌ 오류 발생: {e}")
                error_message = "시스템 오류가 발생했습니다. 다시 시도해주세요."
                error_audio = self.text_to_speech(error_message)
                self.play_audio(error_audio)
        
        print("음성 비서를 종료했습니다. 안녕히 계세요! 👋")

def main():
    parser = argparse.ArgumentParser(description='라즈베리파이 음성 비서')
    parser.add_argument('--duration', type=int, default=5, help='녹음 시간(초)')
    parser.add_argument('--language', default='ko-KR', help='언어 코드')
    parser.add_argument('--verbose', '-v', action='store_true', help='상세 로깅 활성화')
    parser.add_argument('--device', type=int, help='입력 오디오 장치 인덱스')
    args = parser.parse_args()
    
    # ALSA 오류 메시지 숨기기
    if not args.verbose:
        # stderr 리다이렉트 (ALSA 오류 메시지 숨김)
        devnull = open(os.devnull, 'w')
        stderr_backup = sys.stderr
        sys.stderr = devnull
    
    try:
        assistant = VoiceAssistant(language_code=args.language, device_index=args.device)
        
        # stderr 복원
        if not args.verbose:
            sys.stderr = stderr_backup
        
        assistant.run(duration=args.duration)
    except Exception as e:
        # stderr 복원 (오류 출력을 위해)
        if not args.verbose:
            sys.stderr = stderr_backup
        
        print(f"❌ 치명적인 오류 발생: {e}")
        print("프로그램을 종료합니다.")
    finally:
        # 임시 파일 정리
        if os.path.exists("temp_response.wav"):
            try:
                os.remove("temp_response.wav")
            except:
                pass

if __name__ == "__main__":
    main()
