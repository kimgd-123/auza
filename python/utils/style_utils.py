"""CSS/HTML 스타일 파싱 + HWP 변환 공통 유틸리티

hwp_writer.py와 html_parser.py에서 공유하는 색상/치수 변환 함수.
"""

import re
from typing import Optional


def hex_to_rgb_int(color: str) -> Optional[int]:
    """#RRGGBB 또는 rgb(r,g,b) → HWP RGB 정수 (0x00BBGGRR)"""
    if not color:
        return None
    color = color.strip()
    # rgb(r, g, b) / rgba(r, g, b, a) 처리
    if color.startswith('rgb'):
        m = re.search(r'(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', color)
        if not m:
            return None
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return r | (g << 8) | (b << 16)
    # hex 처리
    hex_color = color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c * 2 for c in hex_color)
    if len(hex_color) < 6:
        return None
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return r | (g << 8) | (b << 16)


def estimate_text_width_mm(text: str) -> float:
    """텍스트의 대략적 폭(mm) 계산. 한글/CJK=3.5mm, 영문/숫자=2mm, 공백=1.5mm"""
    width = 0.0
    for ch in text:
        cp = ord(ch)
        if cp <= 0x7F:
            width += 1.5 if ch == ' ' else 2.0
        elif (0xAC00 <= cp <= 0xD7AF or
              0x3400 <= cp <= 0x9FFF or
              0xF900 <= cp <= 0xFAFF):
            width += 3.5
        else:
            width += 2.5
    return width


# HWP 단위 상수
HWPUNIT_PER_MM = 7200 / 25.4  # 1mm ≈ 283.46 HWPUNIT
