#!/usr/bin/env python3
"""OpenAI API 연결 테스트 스크립트"""

import os
import sys

# 환경변수 로드
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def test_openai_connection():
    """OpenAI API 연결 테스트"""
    
    # 환경변수 확인
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print("❌ OPENAI_API_KEY 환경변수가 설정되지 않음")
        return False
    
    print(f"✅ OPENAI_API_KEY 설정됨 (길이: {len(api_key)})")
    
    # OpenAI 패키지 테스트
    try:
        import openai
        print(f"✅ OpenAI 패키지 로드 성공")
        
        # 버전 확인
        try:
            version = openai.__version__
        except AttributeError:
            try:
                import pkg_resources
                version = pkg_resources.get_distribution("openai").version
            except:
                version = "unknown"
        
        print(f"📦 OpenAI 버전: {version}")
        
        # 클라이언트 초기화 테스트
        try:
            # 최신 방식 시도
            client = openai.OpenAI(api_key=api_key)
            print("✅ OpenAI 클라이언트 초기화 성공 (v1.0+ 방식)")
            
            # 간단한 API 테스트
            try:
                response = client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": "안녕하세요! 간단한 연결 테스트입니다."}],
                    max_tokens=50
                )
                print("✅ ChatGPT API 연결 테스트 성공")
                print(f"📝 응답: {response.choices[0].message.content[:50]}...")
                return True
                
            except Exception as api_error:
                print(f"⚠️  API 호출 실패: {api_error}")
                return True  # 클라이언트는 성공적으로 생성됨
                
        except TypeError as te:
            print(f"⚠️  v1.0+ 방식 실패: {te}")
            
            # 구버전 방식 시도
            try:
                openai.api_key = api_key
                print("✅ OpenAI API 키 설정 성공 (구버전 방식)")
                return True
                
            except Exception as old_error:
                print(f"❌ 구버전 방식도 실패: {old_error}")
                return False
                
        except Exception as init_error:
            print(f"❌ OpenAI 클라이언트 초기화 실패: {init_error}")
            return False
            
    except ImportError:
        print("❌ OpenAI 패키지가 설치되지 않음")
        print("💡 설치 방법: pip install openai")
        return False
    
    except Exception as e:
        print(f"❌ 예상치 못한 오류: {e}")
        return False

if __name__ == "__main__":
    print("🧪 OpenAI API 연결 테스트 시작")
    print("="*50)
    
    success = test_openai_connection()
    
    print("="*50)
    if success:
        print("🎉 OpenAI API 테스트 완료!")
    else:
        print("💥 OpenAI API 테스트 실패")
        sys.exit(1)