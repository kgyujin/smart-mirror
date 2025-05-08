#!/usr/bin/env python3

import os
import io
import argparse
import pyaudio
import wave
import time
try:
    import simpleaudio as sa
    HAS_SIMPLEAUDIO = True
except ImportError:
    HAS_SIMPLEAUDIO = False
    print("simpleaudio 패키지가 설치되지 않았습니다. 음성 응답은 비활성화됩니다.")

from google.cloud import speech
try:
    from google.cloud import texttospeech
    HAS_TTS = True
except ImportError:
    HAS_TTS = False
    print("google-cloud-texttospeech 패키지가 설치되지 않았습니다. TTS는 비활성화됩니다.")

class VoiceAssistant:
    def __init__(self, language_code='ko-KR'):
        self.language_code = language_code
        
        # 환경 변수 확인
        if 'GOOGLE_APPLICATION_CREDENTIALS' not in os.environ:
            print("경고: GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다.")
            print("서비스 계정 키 파일 경로를 설정하세요.")
            print("예: export GOOGLE_APPLICATION_CREDENTIALS=\"/path/to/key.json\"")
        else:
            print(f"인증 파일 경로: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')}")
            if not os.path.exists(os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')):
                print("경고: 지정된 인증 파일이 존재하지 않습니다!")
        
        # Speech 클라이언트 초기화
        try:
            self.speech_client = speech.SpeechClient()
            print("Speech-to-Text 클라이언트가 성공적으로 초기화되었습니다.")
        except Exception as e:
            print(f"Speech-to-Text 클라이언트 초기화 실패: {e}")
            raise
        
        # TTS 클라이언트 초기화 (사용 가능한 경우)
        self.tts_client = None
        if HAS_TTS:
            try:
                self.tts_client = texttospeech.TextToSpeechClient()
                print("Text-to-Speech 클라이언트가 성공적으로 초기화되었습니다.")
            except Exception as e:
                print(f"Text-to-Speech 클라이언트 초기화 실패: {e}")
    
    def record_audio(self, sample_rate=16000, chunk_size=1024, record_seconds=5):
        """마이크에서 오디오를 녹음합니다."""
        audio_format = pyaudio.paInt16
        channels = 1
        
        try:
            p = pyaudio.PyAudio()
            
            stream = p.open(format=audio_format,
                            channels=channels,
                            rate=sample_rate,
                            input=True,
                            frames_per_buffer=chunk_size)
            
            print("녹음 시작...")
            frames = []
            
            for i in range(0, int(sample_rate / chunk_size * record_seconds)):
                data = stream.read(chunk_size, exception_on_overflow=False)
                frames.append(data)
            
            print("녹음 완료.")
            
            stream.stop_stream()
            stream.close()
            p.terminate()
            
            return b''.join(frames), sample_rate
        except Exception as e:
            print(f"녹음 중 오류 발생: {e}")
            return None, sample_rate
    
    def recognize_speech(self, audio_data, sample_rate):
        """Google Cloud Speech-to-Text API를 사용하여 오디오를 텍스트로 변환합니다."""
        if audio_data is None:
            return None
            
        audio = speech.RecognitionAudio(content=audio_data)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=sample_rate,
            language_code=self.language_code,
        )
        
        print("음성 인식 중...")
        try:
            response = self.speech_client.recognize(config=config, audio=audio)
            
            if not response.results:
                print("인식된 결과가 없습니다.")
                return None
            
            transcript = response.results[0].alternatives[0].transcript
            return transcript
        except Exception as e:
            print(f"음성 인식 중 오류 발생: {e}")
            return None
    
    def text_to_speech(self, text):
        """텍스트를 음성으로 변환합니다."""
        if not HAS_TTS or self.tts_client is None:
            print(f"TTS 응답 (텍스트): {text}")
            return None
            
        try:
            synthesis_input = texttospeech.SynthesisInput(text=text)
            
            voice = texttospeech.VoiceSelectionParams(
                language_code=self.language_code,
                ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
            )
            
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.LINEAR16
            )
            
            response = self.tts_client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            
            return response.audio_content
        except Exception as e:
            print(f"텍스트를 음성으로 변환 중 오류 발생: {e}")
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
            print(f"오디오 재생 중 오류 발생: {e}")
    
    def process_command(self, text):
        """사용자의 명령을 처리합니다."""
        text_lower = text.lower()
        
        if "안녕" in text_lower:
            return "안녕하세요! 라즈베리파이 음성 비서입니다. 무엇을 도와드릴까요?"
        elif "날씨" in text_lower:
            return "오늘 날씨 정보는 제공할 수 없습니다. 이 기능은 샘플입니다."
        elif "시간" in text_lower:
            from datetime import datetime
            now = datetime.now()
            return f"현재 시간은 {now.hour}시 {now.minute}분입니다."
        elif "이름" in text_lower:
            return "저는 라즈베리파이에서 실행되는 음성 비서입니다."
        elif "종료" in text_lower:
            return "음성 비서를 종료합니다. 안녕히 계세요."
        else:
            return "죄송합니다. 이해하지 못했습니다. 다시 말씀해 주시겠어요?"
    
    def run(self, duration=5):
        """음성 비서를 실행합니다."""
        print("음성 비서를 시작합니다. '종료'라고 말하면 프로그램이 종료됩니다.")
        
        while True:
            input("Enter 키를 눌러 녹음 시작...")
            
            audio_data, sample_rate = self.record_audio(record_seconds=duration)
            transcript = self.recognize_speech(audio_data, sample_rate)
            
            if not transcript:
                print("인식된 텍스트가 없습니다. 다시 시도해주세요.")
                continue
            
            print(f"인식된 텍스트: {transcript}")
            
            response_text = self.process_command(transcript)
            print(f"응답: {response_text}")
            
            audio_response = self.text_to_speech(response_text)
            self.play_audio(audio_response)
            
            if "종료" in transcript.lower():
                break

def main():
    parser = argparse.ArgumentParser(description='음성 비서')
    parser.add_argument('--duration', type=int, default=5, help='녹음 시간(초)')
    parser.add_argument('--language', default='ko-KR', help='언어 코드')
    args = parser.parse_args()
    
    try:
        assistant = VoiceAssistant(language_code=args.language)
        assistant.run(duration=args.duration)
    except Exception as e:
        print(f"오류 발생: {e}")
        print("프로그램을 종료합니다.")

if __name__ == "__main__":
    main()

