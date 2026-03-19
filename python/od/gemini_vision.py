"""Python 측 Gemini Vision 클라이언트 — OD 크롭 영역별 호출"""

import sys
import base64


# ── 수식 공통 규칙 (모든 프롬프트에서 재사용) ──
_MATH_RULES = """
## ⚠️ 수식 처리 — 최우선 규칙! ⚠️
모든 수학 수식은 **반드시** 달러 기호로 감싸서 LaTeX 형식으로 출력하세요.

**필수 규칙:**
- 인라인 수식: `$수식$` (예: "함수 $f(x) = x^2$의 값")
- 블록 수식: `$$수식$$` (예: $$\\frac{a}{b}$$)
- 수식 내 부등호: < → &lt;, > → &gt; (HTML 엔티티로 변환!)

**변환 예시:**
- 분수 a/b → $\\frac{a}{b}$
- 제곱근 √x → $\\sqrt{x}$
- 지수 x² → $x^2$, 아래첨자 x₁ → $x_1$
- 그리스 문자: α→$\\alpha$, β→$\\beta$, π→$\\pi$
- 특수기호: ∞→$\\infty$, ≤→$\\leq$, ≥→$\\geq$, ≠→$\\neq$

⚠️ **위첨자/아래첨자 감지 — 절대 놓치지 마세요!** ⚠️
이미지에서 글자 크기가 작거나 위/아래로 치우친 숫자/문자는 반드시 지수(^) 또는 아래첨자(_)로 변환하세요!
- x2 → $x^2$ (2가 위에 작게 있으면 지수)
- P(x)=4x4 → $P(x)=4x^4$ (4가 위첨자)
- (n-2)2 → $(n-2)^2$ (2가 위첨자)
- a1, a2 → $a_1$, $a_2$ (숫자가 아래에 작게 있으면 아래첨자)

⚠️ 변수 바로 뒤에 오는 숫자가 **본문 크기보다 작거나 위/아래로 치우쳐 있으면** 반드시 ^(지수) 또는 _(아래첨자)를 사용하세요!

⚠️ 수식이 있으면 반드시 $로 감싸세요! √, ², ₁ 같은 유니코드를 그대로 두지 말고 반드시 LaTeX로 변환하세요!"""

_NO_HALLUCINATION = """
## ⚠️ 절대 금지 사항 ⚠️
- 이미지에 없는 내용을 **절대 추가하지 마세요** (해설, 풀이, 답 생성 금지)
- 보이는 텍스트만 정확히 변환하세요
- 추론이나 계산을 하지 마세요
- HTML만 반환하고 마크다운 코드블록(```)이나 <html>/<body> 태그로 감싸지 마세요"""


# 텍스트 영역용 프롬프트
PROMPT_TEXT = f"""이 영역의 콘텐츠를 분석하여 HTML로 구조화해주세요.

## 출력 규칙
- 일반 텍스트 → HTML (<p>, <b>, <i> 등)
- 표 → HTML <table> (셀 병합 colspan/rowspan, 스타일 포함). <thead>/<tbody> 사용 금지, <tr>+<th>/<td> 직접 사용
- 빈칸/답란 (□, 네모 상자) → 빈 괄호 `( )` 또는 밑줄 `____`로 표현

## ⚠️ 박스/테두리 감지 — 반드시 감지하세요! ⚠️
텍스트 주위에 사각형 테두리(선)가 있는 모든 경우를 감지하여 `<div style="border: ...">`로 감싸세요.

**반드시 감지해야 하는 박스 유형:**
- **지문 박스**: 긴 텍스트가 테두리로 둘러싸인 경우
- **보기 박스**: <보기>, ㄱ, ㄴ, ㄷ 등이 테두리 안에 있는 경우
- **인용문 박스**: 인용문이나 참고 자료가 테두리로 구분된 경우
- **정의/공식 박스**: 수학 정의, 공식, 정리가 테두리 안에 있는 경우
- **회색/음영 배경**: 배경색이 있는 영역 → `background-color` 추가

**HTML 변환 규칙:**
- 실선 테두리 → `<div style="border: 1px solid #000; padding: 8px;">`
- 둥근 테두리 → `border-radius: 4px` 추가
- 배경색 → `background-color: #f0f0f0` 등 추가

⚠️ 테두리가 보이면 절대 무시하지 마세요! 반드시 `<div style="border:...">`로 감싸세요!

{_MATH_RULES}
{_NO_HALLUCINATION}"""

# 표 영역용 프롬프트
PROMPT_TABLE = f"""이 영역의 표를 HTML <table>로 구조화해주세요.

## 출력 규칙
- HTML <table> 사용 (셀 병합 colspan/rowspan, 스타일 포함)
- <thead>/<tbody> 사용 금지, <tr>+<th>/<td> 직접 사용
- 배경색이 있으면 style="background-color: #xxx" 추가
- 셀 내 수식은 $...$로 감싸기
{_MATH_RULES}
{_NO_HALLUCINATION}"""

# 수식 영역용 프롬프트
PROMPT_FORMULA = f"""이 영역의 수식을 LaTeX 형식으로 변환해주세요.

## 출력 규칙
- 블록 수식: $$수식$$ 형식으로 출력
- 분수, 루트, 첨자, 합, 적분, 극한 등 모든 수식 구조를 LaTeX로 정확히 변환
- 수식 전후 텍스트가 있으면 <p> 안에 포함
{_MATH_RULES}
{_NO_HALLUCINATION}"""


def call_gemini_vision(api_key: str, image_base64: str, prompt: str) -> str:
    """Gemini Vision API 호출

    Args:
        api_key: Gemini API 키
        image_base64: base64 인코딩된 PNG 이미지
        prompt: 분석 프롬프트

    Returns:
        Gemini 응답 텍스트 (HTML)
    """
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-3.1-pro-preview")

    # google-generativeai SDK: inline_data 형식으로 base64 이미지 전달
    response = model.generate_content([
        {"inline_data": {"mime_type": "image/png", "data": image_base64}},
        prompt,
    ])

    text = response.text.strip()

    # 코드 펜스 제거
    if text.startswith("```html"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    # <html>/<body> 래퍼 제거
    import re
    text = re.sub(r'</?(!doctype[^>]*|html|head|body)[^>]*>', '', text, flags=re.IGNORECASE)

    return text.strip()


def get_prompt_for_region(region: str) -> str:
    """영역 타입에 맞는 프롬프트 반환"""
    if region == "table":
        return PROMPT_TABLE
    elif region == "formula":
        return PROMPT_FORMULA
    else:
        return PROMPT_TEXT
