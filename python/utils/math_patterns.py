"""수식 정규식 패턴 — Python 모듈 전체에서 공유"""

import re

# $$...$$ 블록 수식 + $...$ 인라인 수식 (결합 — 오버랩 방지)
COMBINED_MATH_RE = re.compile(r'\$\$([\s\S]+?)\$\$|\$([^$]+)\$')

# $$...$$ 블록 수식만
BLOCK_MATH_RE = re.compile(r'\$\$([\s\S]+?)\$\$')
