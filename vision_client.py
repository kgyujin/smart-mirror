#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
라즈베리파이 비전 분석 클라이언트
- 웹캠으로 사진 촬영
- 서버로 이미지 전송 및 분석 결과 수신
"""

import os
import sys
import time
import base64
import json
import logging
import glob
from typing import List, Dict, Any, Optional
from io import BytesIO

import requests
from PIL import Image
import numpy as np
import subprocess
import tempfile

# .env 파일 로딩
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# OpenCV 사용 가능 여부 확인
try:
    import cv2
    USE_OPENCV = True
except ImportError:
    USE_OPENCV = False
    print("⚠️  OpenCV를 사용할 수 없습니다. fswebcam을 사용합니다.")

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VisionAnalysisClient:
    def __init__(self, server_host: str = None, server_port: int = None):
        """비전 분석 클라이언트 초기화
        
        Args:
            server_host: 비전 분석 서버 호스트 (기본값: .env의 VISION_SERVER_IP)
            server_port: 비전 분석 서버 포트 (기본값: .env의 VISION_SERVER_PORT)
        """
        # .env 파일에서 서버 설정만 읽기
        self.server_host = server_host or os.getenv('VISION_SERVER_IP', '192.168.0.162')
        self.server_port = server_port or int(os.getenv('VISION_SERVER_PORT', '5051'))
        self.server_url = f"http://{self.server_host}:{self.server_port}"
        
        # 카메라 설정 (기본값 사용)
        self.camera_index = 0
        self.camera_width = 640
        self.camera_height = 480
        
        # 촬영 설정 (기본값 사용)
        self.emotion_capture_count = 3
        self.emotion_capture_interval = 0.5
        self.outfit_capture_count = 1
        
        self.camera = None
        
        # 카메라 초기화
        self._init_camera()
        
        logger.info(f"비전 분석 클라이언트 초기화 완료 (서버: {self.server_url})")
    
    def _find_working_camera(self) -> Optional[str]:
        """작동하는 카메라 장치 찾기"""
        # /dev/video* 장치 목록 가져오기
        video_devices = sorted(glob.glob('/dev/video*'))
        
        if not video_devices:
            logger.error("카메라 장치를 찾을 수 없습니다")
            return None
        
        logger.info(f"비디오 장치 스캔 중... ({len(video_devices)}개)")
        
        # 낮은 번호 장치부터 우선 테스트 (일반적으로 video0, video1이 메인 카메라)
        priority_devices = [d for d in video_devices if int(d.split('video')[-1]) < 4]
        other_devices = [d for d in video_devices if int(d.split('video')[-1]) >= 4]
        
        test_order = priority_devices + other_devices
        logger.info(f"우선 테스트: {priority_devices}")
        
        # 각 장치를 fswebcam으로 직접 테스트
        for device in test_order:
            try:
                logger.info(f"📷 {device} 테스트 중...")
                test_path = '/tmp/camera_test.jpg'
                
                # 기존 테스트 파일 삭제
                if os.path.exists(test_path):
                    os.unlink(test_path)
                
                # fswebcam으로 실제 촬영 시도
                cmd = ['fswebcam', '-d', device, '-r', '640x480', '--no-banner', '-S', '5', test_path]
                result = subprocess.run(
                    cmd, 
                    capture_output=True, 
                    text=True,
                    timeout=10
                )
                
                # 결과 확인
                if result.returncode == 0 and os.path.exists(test_path):
                    file_size = os.path.getsize(test_path)
                    if file_size > 1000:  # 최소 1KB 이상
                        logger.info(f"✅ 작동하는 카메라 발견: {device} (이미지 크기: {file_size} bytes)")
                        os.unlink(test_path)
                        return device
                    else:
                        logger.warning(f"  {device}: 빈 파일 생성됨 ({file_size} bytes)")
                else:
                    logger.warning(f"  {device}: 촬영 실패")
                    if result.stderr:
                        logger.debug(f"    stderr: {result.stderr[:200]}")
                
                # 실패한 테스트 파일 정리
                if os.path.exists(test_path):
                    os.unlink(test_path)
                    
            except subprocess.TimeoutExpired:
                logger.warning(f"  {device}: 타임아웃 (10초)")
            except Exception as e:
                logger.warning(f"  {device}: 오류 - {e}")
                continue
        
        logger.error("❌ 작동하는 카메라를 찾을 수 없습니다")
        logger.error("수동 확인: lsusb | grep -i camera")
        logger.error("수동 확인: v4l2-ctl --list-devices")
        return None
    
    def _init_camera(self):
        """웹캠 초기화"""
        try:
            if USE_OPENCV:
                logger.info(f"OpenCV로 웹캠 초기화 중... (장치: /dev/video{self.camera_index})")
                self.camera = cv2.VideoCapture(self.camera_index)
                
                if not self.camera.isOpened():
                    raise RuntimeError(f"웹캠을 열 수 없습니다. (장치: /dev/video{self.camera_index})")
                
                self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, self.camera_width)
                self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, self.camera_height)
                self.camera.set(cv2.CAP_PROP_FPS, 30)
            else:
                logger.info("fswebcam을 사용하여 카메라 초기화")
                # fswebcam 사용 가능 여부 확인
                result = subprocess.run(['which', 'fswebcam'], capture_output=True)
                if result.returncode != 0:
                    raise RuntimeError("fswebcam이 설치되지 않았습니다. 'sudo apt install fswebcam'으로 설치하세요.")
                
                # 작동하는 카메라 장치 찾기
                working_device = self._find_working_camera()
                if not working_device:
                    raise RuntimeError("작동하는 카메라를 찾을 수 없습니다")
                
                self.camera = working_device  # 찾은 장치 경로 저장
            
            # 카메라 워밍업 (첫 몇 프레임은 품질이 안 좋을 수 있음)
            if USE_OPENCV:
                # OpenCV 카메라 워밍업
                for _ in range(5):
                    ret, frame = self.camera.read()
                    if not ret:
                        raise RuntimeError("카메라에서 프레임을 읽을 수 없습니다.")
                    time.sleep(0.1)
            
            logger.info("웹캠 초기화 완료!")
            
        except Exception as e:
            logger.error(f"웹캠 초기화 실패: {e}")
            raise
    
    def capture_photo(self) -> Optional[Image.Image]:
        """웹캠으로 사진 촬영 (PIL Image 반환)"""
        try:
            if USE_OPENCV:
                # OpenCV 사용
                if self.camera is None or not self.camera.isOpened():
                    logger.error("카메라가 초기화되지 않았습니다.")
                    return None
                
                ret, frame = self.camera.read()
                if not ret:
                    logger.error("카메라에서 프레임을 캡처할 수 없습니다.")
                    return None
                
                # BGR을 RGB로 변환하고 PIL Image로 변환
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                return Image.fromarray(frame_rgb)
            else:
                # fswebcam 사용 (OpenCV 없음)
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                    tmp_path = tmp.name
                
                # fswebcam으로 사진 촬영 (찾은 카메라 장치 사용)
                cmd = [
                    'fswebcam',
                    '-r', f'{self.camera_width}x{self.camera_height}',
                    '--no-banner',
                    '-S', '10',  # 10 프레임 스킵 (충분한 워밍업)
                    '--jpeg', '85',  # JPEG 품질
                    '-d', self.camera,  # 자동으로 찾은 장치 사용
                    tmp_path
                ]
                
                logger.info(f"fswebcam 명령: {' '.join(cmd)}")
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode != 0:
                    logger.error(f"fswebcam 반환 코드: {result.returncode}")
                    logger.error(f"fswebcam stderr: {result.stderr}")
                    logger.error(f"fswebcam stdout: {result.stdout}")
                    return None
                
                # 파일이 생성되었는지 확인
                if not os.path.exists(tmp_path):
                    logger.error(f"이미지 파일이 생성되지 않았습니다: {tmp_path}")
                    return None
                
                file_size = os.path.getsize(tmp_path)
                if file_size == 0:
                    logger.error(f"이미지 파일 크기가 0입니다: {tmp_path}")
                    os.unlink(tmp_path)
                    return None
                
                logger.info(f"이미지 파일 생성됨: {tmp_path} ({file_size} bytes)")
                
                # 이미지 로드
                try:
                    image = Image.open(tmp_path)
                    # 이미지를 메모리에 로드
                    image.load()
                    logger.info(f"이미지 로드 성공: {image.size}, {image.mode}")
                except Exception as e:
                    logger.error(f"이미지 로드 실패: {e}")
                    os.unlink(tmp_path)
                    return None
                
                # 임시 파일 삭제
                try:
                    os.unlink(tmp_path)
                except:
                    pass
                
                return image
            
        except Exception as e:
            logger.error(f"사진 촬영 실패: {e}")
            return None
    
    def image_to_base64(self, image: Image.Image) -> str:
        """PIL Image를 Base64 문자열로 변환"""
        try:
            # JPEG로 인코딩
            buffer = BytesIO()
            image.save(buffer, format='JPEG', quality=85)
            
            # Base64 인코딩
            image_bytes = buffer.getvalue()
            base64_str = base64.b64encode(image_bytes).decode('utf-8')
            
            return base64_str
            
        except Exception as e:
            logger.error(f"Base64 변환 실패: {e}")
            return ""
    
    def capture_emotion_photos(self) -> List[str]:
        """감정 분석용 사진 촬영 (.env 설정 사용)"""
        try:
            logger.info("감정 분석용 사진 촬영 시작... (3장, 0.5초 간격)")
            photos = []
            
            for i in range(3):
                logger.info(f"사진 {i+1}/3 촬영 중...")
                
                # 사진 촬영
                image = self.capture_photo()
                if image is None:
                    logger.error(f"사진 {i+1} 촬영 실패")
                    continue
                
                # Base64로 변환
                base64_str = self.image_to_base64(image)
                if base64_str:
                    photos.append(base64_str)
                    logger.info(f"사진 {i+1} 촬영 완료 (크기: {len(base64_str)} bytes)")
                else:
                    logger.error(f"사진 {i+1} Base64 변환 실패")
                
                # 마지막 사진이 아니면 0.5초 대기
                if i < 2:
                    time.sleep(0.5)
            
            logger.info(f"총 {len(photos)}장의 사진 촬영 완료")
            return photos
            
        except Exception as e:
            logger.error(f"감정 분석용 사진 촬영 실패: {e}")
            return []
    
    def capture_outfit_photo(self) -> Optional[str]:
        """옷차림 분석용 전신 사진 촬영"""
        try:
            logger.info("옷차림 분석용 사진 촬영 중...")
            
            # 사진 촬영
            image = self.capture_photo()
            if image is None:
                logger.error("옷차림 분석용 사진 촬영 실패")
                return None
            
            # Base64로 변환
            base64_str = self.image_to_base64(image)
            if base64_str:
                logger.info(f"옷차림 분석용 사진 촬영 완료 (크기: {len(base64_str)} bytes)")
                return base64_str
            else:
                logger.error("옷차림 분석용 사진 Base64 변환 실패")
                return None
                
        except Exception as e:
            logger.error(f"옷차림 분석용 사진 촬영 실패: {e}")
            return None
    
    def analyze_emotion(self) -> Dict[str, Any]:
        """서버에 감정 분석 요청"""
        try:
            # 사진 3장 촬영
            photos = self.capture_emotion_photos()
            
            if len(photos) < 1:
                return {
                    'success': False,
                    'error': '사진 촬영에 실패했습니다.'
                }
            
            # 부족한 사진은 첫 번째 사진으로 채우기
            while len(photos) < 3:
                if len(photos) > 0:
                    photos.append(photos[0])
                else:
                    break
            
            if len(photos) < 3:
                return {
                    'success': False,
                    'error': '최소 1장의 사진이 필요합니다.'
                }
            
            # 서버로 요청 전송
            logger.info("서버에 감정 분석 요청 전송 중...")
            
            request_data = {
                'photos': photos
            }
            
            response = requests.post(
                f"{self.server_url}/analyze/emotion",
                json=request_data,
                timeout=30,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"감정 분석 완료: {result.get('emotion')} (신뢰도: {result.get('confidence', 0):.2f})")
                return result
            else:
                logger.error(f"서버 응답 오류 (HTTP {response.status_code}): {response.text}")
                return {
                    'success': False,
                    'error': f'서버 오류 (HTTP {response.status_code})'
                }
                
        except requests.exceptions.ConnectionError:
            logger.error("서버에 연결할 수 없습니다.")
            return {
                'success': False,
                'error': '서버에 연결할 수 없습니다.'
            }
        except requests.exceptions.Timeout:
            logger.error("서버 응답 시간 초과")
            return {
                'success': False,
                'error': '서버 응답 시간이 초과되었습니다.'
            }
        except Exception as e:
            logger.error(f"감정 분석 요청 실패: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def analyze_outfit(self, weather_data: Dict[str, Any]) -> Dict[str, Any]:
        """서버에 옷차림 분석 요청
        
        Args:
            weather_data: 날씨 정보 {'temp': float, 'condition': str}
        """
        try:
            # 전신 사진 촬영
            photo = self.capture_outfit_photo()
            
            if not photo:
                return {
                    'success': False,
                    'error': '옷차림 분석용 사진 촬영에 실패했습니다.'
                }
            
            # 서버로 요청 전송
            logger.info("서버에 옷차림 분석 요청 전송 중...")
            
            request_data = {
                'photo': photo,
                'weather': weather_data
            }
            
            response = requests.post(
                f"{self.server_url}/analyze/outfit",
                json=request_data,
                timeout=30,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"옷차림 분석 완료: {'적절함' if result.get('is_appropriate') else '부적절함'} "
                           f"(신뢰도: {result.get('confidence', 0):.2f})")
                return result
            else:
                logger.error(f"서버 응답 오류 (HTTP {response.status_code}): {response.text}")
                return {
                    'success': False,
                    'error': f'서버 오류 (HTTP {response.status_code})'
                }
                
        except requests.exceptions.ConnectionError:
            logger.error("서버에 연결할 수 없습니다.")
            return {
                'success': False,
                'error': '서버에 연결할 수 없습니다.'
            }
        except requests.exceptions.Timeout:
            logger.error("서버 응답 시간 초과")
            return {
                'success': False,
                'error': '서버 응답 시간이 초과되었습니다.'
            }
        except Exception as e:
            logger.error(f"옷차림 분석 요청 실패: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def check_server_health(self) -> bool:
        """서버 상태 확인"""
        try:
            response = requests.get(f"{self.server_url}/health", timeout=5)
            if response.status_code == 200:
                result = response.json()
                return result.get('status') == 'healthy'
            return False
        except Exception as e:
            logger.error(f"서버 상태 확인 실패: {e}")
            return False
    
    def release_camera(self):
        """카메라 리소스 해제"""
        try:
            if USE_OPENCV and self.camera is not None and hasattr(self.camera, 'release'):
                self.camera.release()
                self.camera = None
                logger.info("카메라 리소스 해제 완료")
            else:
                logger.info("fswebcam은 리소스 해제가 필요 없습니다")
        except Exception as e:
            logger.error(f"카메라 리소스 해제 실패: {e}")
    
    def __del__(self):
        """소멸자 - 카메라 리소스 해제"""
        self.release_camera()

def main():
    """테스트용 메인 함수"""
    client = None
    
    try:
        # 서버 IP 주소 입력 받기 (기본값: 192.168.0.162)
        server_ip = input("비전 분석 서버 IP 주소를 입력하세요 (기본값: 192.168.0.162): ").strip()
        if not server_ip:
            server_ip = "192.168.0.162"
        
        # 클라이언트 초기화
        client = VisionAnalysisClient(server_host=server_ip)
        
        # 서버 상태 확인
        if not client.check_server_health():
            print("❌ 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.")
            return
        
        print("✅ 서버 연결 확인!")
        
        while True:
            print("\n=== 비전 분석 테스트 ===")
            print("1. 감정 분석")
            print("2. 옷차림 분석")
            print("3. 종료")
            
            choice = input("선택하세요 (1-3): ").strip()
            
            if choice == '1':
                print("\n📸 감정 분석을 시작합니다...")
                print("카메라를 보고 자연스러운 표정을 지어주세요!")
                time.sleep(2)
                
                result = client.analyze_emotion()
                
                if result['success']:
                    print(f"\n😊 분석 결과:")
                    print(f"감정: {result['emotion']}")
                    print(f"신뢰도: {result['confidence']:.2f}")
                    print(f"메시지: {result['response_message']}")
                else:
                    print(f"\n❌ 분석 실패: {result['error']}")
            
            elif choice == '2':
                print("\n📸 옷차림 분석을 시작합니다...")
                print("전신이 나오도록 카메라 앞에 서주세요!")
                
                # 날씨 정보 입력
                try:
                    temp = float(input("현재 온도를 입력하세요 (°C): "))
                    condition = input("날씨 상태를 입력하세요 (예: sunny, cloudy, rainy): ").strip()
                    
                    weather_data = {
                        'temp': temp,
                        'condition': condition or 'clear'
                    }
                    
                    time.sleep(2)
                    
                    result = client.analyze_outfit(weather_data)
                    
                    if result['success']:
                        print(f"\n👔 분석 결과:")
                        print(f"적절성: {'적절함' if result['is_appropriate'] else '부적절함'}")
                        print(f"날씨 카테고리: {result['weather_category']}")
                        print(f"신뢰도: {result['confidence']:.2f}")
                        print(f"메시지: {result['response_message']}")
                    else:
                        print(f"\n❌ 분석 실패: {result['error']}")
                        
                except ValueError:
                    print("❌ 올바른 온도 값을 입력해주세요.")
                except KeyboardInterrupt:
                    print("\n입력이 취소되었습니다.")
            
            elif choice == '3':
                print("프로그램을 종료합니다.")
                break
            
            else:
                print("올바른 선택지를 입력해주세요.")
    
    except KeyboardInterrupt:
        print("\n\n프로그램이 중단되었습니다.")
    except Exception as e:
        print(f"오류 발생: {e}")
    finally:
        if client:
            client.release_camera()

if __name__ == '__main__':
    main()