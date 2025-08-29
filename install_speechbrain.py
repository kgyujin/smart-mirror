#!/usr/bin/env python3
"""
SpeechBrain 감정 인식 모델 설치 스크립트
라즈베리파이에서 실행하여 SpeechBrain과 필요한 의존성을 설치합니다.
"""

import subprocess
import sys
import os
import json

def run_command(command, description):
    """명령어 실행 및 결과 출력"""
    print(f"\n🔧 {description}...")
    print(f"실행 명령어: {command}")
    
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ {description} 완료")
            if result.stdout:
                print(f"출력: {result.stdout.strip()}")
        else:
            print(f"❌ {description} 실패")
            print(f"오류: {result.stderr.strip()}")
            return False
            
    except Exception as e:
        print(f"❌ {description} 중 예외 발생: {str(e)}")
        return False
    
    return True

def check_python_version():
    """Python 버전 확인"""
    print("🐍 Python 버전 확인...")
    version = sys.version_info
    print(f"현재 Python 버전: {version.major}.{version.minor}.{version.micro}")
    
    if version.major < 3 or (version.major == 3 and version.minor < 7):
        print("❌ Python 3.7 이상이 필요합니다.")
        return False
    
    print("✅ Python 버전 확인 완료")
    return True

def install_system_dependencies():
    """시스템 의존성 설치"""
    print("\n📦 시스템 의존성 설치...")
    
    # 필요한 시스템 패키지들
    packages = [
        "python3-pip",
        "python3-dev",
        "build-essential",
        "libffi-dev",
        "libssl-dev",
        "libjpeg-dev",
        "libpng-dev",
        "libfreetype6-dev",
        "liblcms2-dev",
        "libopenjp2-7-dev",
        "libtiff5-dev",
        "zlib1g-dev",
        "libfreetype6-dev",
        "liblcms2-dev",
        "libwebp-dev",
        "libharfbuzz-dev",
        "libfribidi-dev",
        "libxcb1-dev"
    ]
    
    for package in packages:
        if not run_command(f"sudo apt-get install -y {package}", f"{package} 설치"):
            print(f"⚠️ {package} 설치 실패, 계속 진행...")

def install_python_dependencies():
    """Python 의존성 설치"""
    print("\n🐍 Python 의존성 설치...")
    
    # pip 업그레이드
    run_command("python3 -m pip install --upgrade pip", "pip 업그레이드")
    
    # 기본 의존성들
    basic_deps = [
        "numpy>=1.21.0",
        "scipy>=1.7.0",
        "scikit-learn>=1.0.0",
        "torch>=1.9.0",
        "torchaudio>=0.9.0",
        "soundfile>=0.10.0",
        "librosa>=0.9.0",
        "tqdm>=4.60.0"
    ]
    
    for dep in basic_deps:
        if not run_command(f"pip3 install --user {dep}", f"{dep} 설치"):
            print(f"⚠️ {dep} 설치 실패, 계속 진행...")
    
    # SpeechBrain 설치
    print("\n🎤 SpeechBrain 설치...")
    if not run_command("pip3 install --user git+https://github.com/speechbrain/speechbrain.git@develop", "SpeechBrain 설치"):
        print("❌ SpeechBrain 설치 실패")
        return False
    
    return True

def test_speechbrain_installation():
    """SpeechBrain 설치 테스트"""
    print("\n🧪 SpeechBrain 설치 테스트...")
    
    test_script = """
import torch
import speechbrain
from speechbrain.pretrained import EncoderClassifier

try:
    print("SpeechBrain 버전:", speechbrain.__version__)
    print("PyTorch 버전:", torch.__version__)
    print("CUDA 사용 가능:", torch.cuda.is_available())
    
    # 모델 다운로드 테스트
    print("\\n모델 다운로드 테스트 중...")
    classifier = EncoderClassifier.from_hparams(
        source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
        savedir="models/emotion_model"
    )
    print("✅ SpeechBrain 모델 로드 성공!")
    
except Exception as e:
    print(f"❌ 테스트 실패: {str(e)}")
    exit(1)
"""
    
    # 테스트 스크립트를 임시 파일로 저장
    with open("test_speechbrain.py", "w") as f:
        f.write(test_script)
    
    # 테스트 실행
    success = run_command("python3 test_speechbrain.py", "SpeechBrain 테스트")
    
    # 임시 파일 삭제
    try:
        os.remove("test_speechbrain.py")
    except:
        pass
    
    return success

def create_models_directory():
    """models 디렉토리 생성"""
    print("\n📁 models 디렉토리 생성...")
    
    models_dir = "models"
    if not os.path.exists(models_dir):
        os.makedirs(models_dir)
        print(f"✅ {models_dir} 디렉토리 생성 완료")
    else:
        print(f"✅ {models_dir} 디렉토리 이미 존재")

def main():
    """메인 설치 프로세스"""
    print("🎤 SpeechBrain 감정 인식 시스템 설치")
    print("=" * 50)
    
    # Python 버전 확인
    if not check_python_version():
        sys.exit(1)
    
    # models 디렉토리 생성
    create_models_directory()
    
    # 시스템 의존성 설치
    install_system_dependencies()
    
    # Python 의존성 설치
    if not install_python_dependencies():
        print("❌ Python 의존성 설치 실패")
        sys.exit(1)
    
    # SpeechBrain 설치 테스트
    if not test_speechbrain_installation():
        print("❌ SpeechBrain 설치 테스트 실패")
        sys.exit(1)
    
    print("\n🎉 SpeechBrain 설치 완료!")
    print("\n다음 단계:")
    print("1. 스마트 미러 서버를 재시작하세요")
    print("2. 음성 감정 분석이 자동으로 시작됩니다")
    print("3. '내 기분이 어때?'라고 물어보시면 감정 분석 결과를 확인할 수 있습니다")

if __name__ == "__main__":
    main()
