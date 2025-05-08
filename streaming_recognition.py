#!/usr/bin/env python3

import pyaudio
import queue
import threading
import os
from google.cloud import speech

# 오디오 설정
RATE = 16000
CHUNK = int(RATE / 10)  # 100ms
LANGUAGE_CODE = 'ko-KR'  # 한국어

class MicrophoneStream:
    """마이크에서 오디오를 스트리밍하기 위한 클래스."""
    
    def __init__(self, rate, chunk):
        self._rate = rate
        self._chunk = chunk
        self._buff = queue.Queue()
        self.closed = True
    
    def __enter__(self):
        self._audio_interface = pyaudio.PyAudio()
        self._audio_stream = self._audio_interface.open(
            format=pyaudio.paInt16,
            channels=1, rate=self._rate,
            input=True, frames_per_buffer=self._chunk,
            stream_callback=self._fill_buffer,
        )
        
        self.closed = False
        return self
    
    def __exit__(self, type, value, traceback):
        self._audio_stream.stop_stream()
        self._audio_stream.close()
        self.closed = True
        self._buff.put(None)
        self._audio_interface.terminate()
    
    def _fill_buffer(self, in_data, frame_count, time_info, status_flags):
        """오디오 스트림에서 버퍼를 채웁니다."""
        self._buff.put(in_data)
        return None, pyaudio.paContinue
    
    def generator(self):
        """오디오 청크 스트림을 생성합니다."""
        while not self.closed:
            chunk = self._buff.get()
            if chunk is None:
                return
            data = [chunk]
            
            while True:
                try:
                    chunk = self._buff.get(block=False)
                    if chunk is None:
                        return
                    data.append(chunk)
                except queue.Empty:
                    break
            
            yield b''.join(data)

def listen_print_loop(responses):
    """응답 스트림에서 인식된 텍스트를 처리합니다."""
    num_chars_printed = 0
    for response in responses:
        if not response.results:
            continue
        
        result = response.results[0]
        if not result.alternatives:
            continue
        
        transcript = result.alternatives[0].transcript
        
        if not result.is_final:
            # 임시 결과 출력
            overwrite_chars = ' ' * (num_chars_printed - len(transcript))
            print(f"\r인식 중: {transcript}{overwrite_chars}", end='')
            num_chars_printed = len(transcript)
        else:
            # 최종 결과 출력 및 간단한 처리
            print(f"\r인식된 텍스트: {transcript}")
            num_chars_printed = 0
            
            # 간단한 응답 처리
            transcript_lower = transcript.lower()
            if "종료" in transcript_lower:
                print("음성 인식을 종료합니다.")
                return True
            elif "안녕" in transcript_lower:
                print("응답: 안녕하세요! 무엇을 도와드릴까요?")
            elif "날씨" in transcript_lower:
                print("응답: 오늘 날씨 정보는 제공할 수 없습니다. 이 기능은 샘플입니다.")
            elif "시간" in transcript_lower:
                from datetime import datetime
                now = datetime.now()
                print(f"응답: 현재 시간은 {now.hour}시 {now.minute}분입니다.")
            else:
                print("응답: 죄송합니다. 이해하지 못했습니다.")
    
    return False

def main():
    client = speech.SpeechClient()
    
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=RATE,
        language_code=LANGUAGE_CODE,
    )
    
    streaming_config = speech.StreamingRecognitionConfig(
        config=config,
        interim_results=True,
    )
    
    print("실시간 음성 인식을 시작합니다. '종료'라고 말하면 프로그램이 종료됩니다.")
    
    while True:
        with MicrophoneStream(RATE, CHUNK) as stream:
            audio_generator = stream.generator()
            requests = (speech.StreamingRecognizeRequest(audio_content=content)
                        for content in audio_generator)
            
            responses = client.streaming_recognize(streaming_config, requests)
            
            # 응답 처리
            if listen_print_loop(responses):
                break
        
        print("\n다시 시작하려면 Enter 키를 누르세요...")
        input()

if __name__ == '__main__':
    main()
