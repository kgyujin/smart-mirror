#!/usr/bin/env python3
"""Python 구문 오류 검사 스크립트"""

import ast
import sys

def check_syntax(filename):
    """Python 파일의 구문을 검사합니다"""
    try:
        with open(filename, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # AST 파싱으로 구문 검사
        ast.parse(content)
        print(f"✅ {filename}: 구문 오류 없음")
        return True
        
    except SyntaxError as e:
        print(f"❌ {filename}: 구문 오류 발견")
        print(f"   줄 {e.lineno}: {e.text.strip() if e.text else ''}")
        print(f"   오류: {e.msg}")
        return False
    except Exception as e:
        print(f"❌ {filename}: 파일 읽기 실패 - {e}")
        return False

if __name__ == "__main__":
    filename = "/Users/kgyujin/dev/smart-mirror/ai_server.py"
    if check_syntax(filename):
        print("🎉 구문 검사 통과!")
    else:
        print("🔧 구문 오류를 수정해주세요.")
        sys.exit(1)