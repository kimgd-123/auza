"""OD 기반 캡처 영역 분석 오케스트레이터

캡처 이미지 → OD 감지 → 영역별 크롭 → Gemini Vision 호출 → 통합 HTML 반환
figure 영역은 PDF 원본 이미지를 우선 사용 (PyMuPDF)
"""

import sys
import io
import base64
from .constants import MIN_OD_SIZE
from .detector import detect_regions_from_image, crop_region_from_image, sort_regions_reading_order
from .gemini_vision import call_gemini_vision, get_prompt_for_region


def analyze_capture(image_base64: str, api_key: str, od_model,
                    pdf_path: str = None, page_num: int = -1,
                    capture_bbox_norm: list = None) -> dict:
    """캡처 이미지를 OD로 분석하고 영역별 Gemini Vision 호출

    Args:
        image_base64: base64 인코딩된 PNG 이미지
        api_key: Gemini API 키
        od_model: 로드된 YOLO 모델
        pdf_path: PDF 파일 경로 (figure 원본 추출용, 없으면 크롭 fallback)
        page_num: 0-based 페이지 번호
        capture_bbox_norm: 캡처 영역의 페이지 내 정규화 좌표 [x1,y1,x2,y2]

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

    # PDF 내장 이미지 사전 추출 (figure 대체용)
    pdf_images = []
    if pdf_path and page_num >= 0:
        try:
            from .pdf_image_extractor import extract_page_images
            pdf_images = extract_page_images(pdf_path, page_num)
        except Exception as e:
            sys.stderr.write(f"[od-analyzer] PDF 이미지 추출 실패: {e}\n")

    # OD 감지
    detections = detect_regions_from_image(od_model, image_bytes)

    # abandon 영역 제거
    detections = [d for d in detections if d["region"] != "abandon"]

    if not detections:
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
            img_b64 = _get_figure_image(
                img, box, pdf_images, capture_bbox_norm, img_w, img_h
            )
            html_parts.append(
                f'<img src="data:image/png;base64,{img_b64}" '
                f'alt="캡처 이미지" style="max-width: 100%;" />'
            )
        else:
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


def _get_figure_image(img, box_px: list, pdf_images: list,
                      capture_bbox_norm: list, img_w: int, img_h: int) -> str:
    """figure 영역의 최적 이미지를 반환 — PDF 원본 우선, 없으면 캡처 크롭

    Returns:
        base64 인코딩된 PNG 이미지
    """
    # PDF 이미지가 있으면 위치 매칭 시도
    if pdf_images and capture_bbox_norm:
        try:
            from .pdf_image_extractor import find_matching_pdf_image

            # OD box_px → 캡처 영역 내 정규화 → 페이지 전체 정규화 좌표로 변환
            cap_x1, cap_y1, cap_x2, cap_y2 = capture_bbox_norm
            cap_w = cap_x2 - cap_x1
            cap_h = cap_y2 - cap_y1

            fig_norm = [
                cap_x1 + (box_px[0] / img_w) * cap_w,
                cap_y1 + (box_px[1] / img_h) * cap_h,
                cap_x1 + (box_px[2] / img_w) * cap_w,
                cap_y1 + (box_px[3] / img_h) * cap_h,
            ]

            matched = find_matching_pdf_image(pdf_images, fig_norm)
            if matched:
                sys.stderr.write("[od-analyzer] figure: PDF 원본 이미지 사용\n")
                return matched
        except Exception as e:
            sys.stderr.write(f"[od-analyzer] PDF 이미지 매칭 실패: {e}\n")

    # fallback: 캡처에서 크롭
    sys.stderr.write("[od-analyzer] figure: 캡처 크롭 사용\n")
    crop_bytes = crop_region_from_image(img, box_px)
    return base64.b64encode(crop_bytes).decode("ascii")
