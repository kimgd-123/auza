"""OD 기반 캡처 영역 분석 오케스트레이터

캡처 이미지 → OD 감지 → 영역별 크롭 → Gemini Vision 호출 → 통합 HTML 반환
"""

import sys
import io
import base64
from .constants import MIN_OD_SIZE
from .detector import detect_regions_from_image, crop_region_from_image, sort_regions_reading_order
from .gemini_vision import call_gemini_vision, get_prompt_for_region


def analyze_capture(image_base64: str, api_key: str, od_model) -> dict:
    """캡처 이미지를 OD로 분석하고 영역별 Gemini Vision 호출

    Args:
        image_base64: base64 인코딩된 PNG 이미지
        api_key: Gemini API 키
        od_model: 로드된 YOLO 모델

    Returns:
        {"html": str, "regions": int, "error": str|None}
    """
    from PIL import Image

    image_bytes = base64.b64decode(image_base64)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = img.size

    # 소형 캡처는 OD 건너뛰고 직접 Gemini 호출
    if img_w < MIN_OD_SIZE or img_h < MIN_OD_SIZE:
        sys.stderr.write(f"[od-analyzer] 소형 캡처 ({img_w}x{img_h}), OD 건너뛰기\n")
        from .gemini_vision import PROMPT_TEXT
        html = call_gemini_vision(api_key, image_base64, PROMPT_TEXT)
        return {"html": html, "regions": 0, "error": None}

    # OD 감지
    detections = detect_regions_from_image(od_model, image_bytes)

    # abandon 영역 제거
    detections = [d for d in detections if d["region"] != "abandon"]

    if not detections:
        # OD가 아무것도 감지 못하면 전체 이미지를 텍스트로 처리
        sys.stderr.write("[od-analyzer] OD 감지 없음, 전체 이미지 Gemini 호출\n")
        from .gemini_vision import PROMPT_TEXT
        html = call_gemini_vision(api_key, image_base64, PROMPT_TEXT)
        return {"html": html, "regions": 0, "error": None}

    # 읽기 순서로 정렬
    detections = sort_regions_reading_order(detections)

    sys.stderr.write(f"[od-analyzer] {len(detections)} 영역 감지: "
                     f"{[d['region'] for d in detections]}\n")

    # 영역별 처리
    html_parts = []
    errors = []

    for i, det in enumerate(detections):
        region = det["region"]
        box = det["box_px"]
        score = det["score"]

        sys.stderr.write(f"[od-analyzer] 영역 {i+1}/{len(detections)}: "
                         f"{region} (score={score}) box={box}\n")

        if region == "figure":
            # 이미지 영역: 크롭 → base64 data URI로 <img> 태그 생성
            crop_bytes = crop_region_from_image(img, box)
            crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
            html_parts.append(
                f'<img src="data:image/png;base64,{crop_b64}" '
                f'alt="캡처 이미지" style="max-width: 100%;" />'
            )
        else:
            # text/table/formula: 크롭 → Gemini Vision 호출
            try:
                crop_bytes = crop_region_from_image(img, box)
                crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
                prompt = get_prompt_for_region(region)
                result_html = call_gemini_vision(api_key, crop_b64, prompt)
                if result_html:
                    html_parts.append(result_html)
            except Exception as e:
                err_msg = f"영역 {i+1} ({region}) 처리 실패: {e}"
                sys.stderr.write(f"[od-analyzer] {err_msg}\n")
                errors.append(err_msg)

    combined_html = "\n".join(html_parts)

    return {
        "html": combined_html,
        "regions": len(detections),
        "error": "; ".join(errors) if errors else None,
    }
