"""OD 기반 캡처 영역 분석 오케스트레이터

캡처 이미지 → OD 감지 → 영역별 크롭 → Gemini Vision 호출 → 통합 HTML 반환
figure 영역은 PDF 원본 이미지를 우선 사용 (PyMuPDF)
"""

import sys
import io
import re
import json
import base64
from .constants import MIN_OD_SIZE
from .detector import detect_regions_from_image, crop_region_from_image, sort_regions_reading_order
from .gemini_vision import call_gemini_vision, get_prompt_for_region, PROMPT_FIGURE_CHECK


def _emit_progress(step: str, current: int = 0, total: int = 0, detail: str = ""):
    """진행 상황을 stderr JSON으로 출력 — Electron이 파싱하여 UI에 전달"""
    msg = json.dumps({
        "type": "od-progress",
        "step": step,
        "current": current,
        "total": total,
        "detail": detail,
    }, ensure_ascii=False)
    sys.stderr.write(f"[od-progress] {msg}\n")
    sys.stderr.flush()


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
        _emit_progress("gemini", detail="소형 캡처 — 직접 인식 중")
        from .gemini_vision import PROMPT_TEXT
        html = call_gemini_vision(api_key, image_base64, PROMPT_TEXT)
        return {"html": html, "regions": 0, "error": None}

    # OD 감지
    _emit_progress("od", detail="레이아웃 감지 중...")
    detections = detect_regions_from_image(od_model, image_bytes)

    # abandon 영역 처리: 선지(① ② ③ ④ ⑤) 패턴은 text로 복구
    rescued = []
    for d in detections:
        if d["region"] == "abandon":
            box = d["box_px"]
            w = box[2] - box[0]
            h = box[3] - box[1]
            aspect = w / max(h, 1)
            # 넓고 얇은 영역(가로세로비 3:1 이상)은 선지일 가능성 → text로 복구
            if aspect >= 3.0:
                sys.stderr.write(f"[od-analyzer] abandon 복구 → text: "
                                 f"aspect={aspect:.1f}, box={box}\n")
                d["region"] = "text"
                d["label"] = "abandon→text"
                rescued.append(d)
            else:
                sys.stderr.write(f"[od-analyzer] abandon 제거: "
                                 f"aspect={aspect:.1f}, box={box}\n")
        else:
            rescued.append(d)
    detections = rescued

    if not detections:
        sys.stderr.write("[od-analyzer] OD 감지 없음, 전체 이미지 Gemini 호출\n")
        _emit_progress("gemini", detail="영역 미감지 — 전체 이미지 인식 중")
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

    total = len(detections)
    for i, det in enumerate(detections):
        region = det["region"]
        box = det["box_px"]
        score = det["score"]

        _emit_progress("region", current=i + 1, total=total,
                       detail=f"{region} 영역 인식 중")
        sys.stderr.write(f"[od-analyzer] 영역 {i+1}/{total}: "
                         f"{region} (score={score}) box={box}\n")

        if region == "figure":
            # Gemini에게 진짜 figure인지 텍스트/수식인지 판별 요청
            gemini_html = None
            try:
                crop_bytes = crop_region_from_image(img, box)
                crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
                gemini_html = call_gemini_vision(api_key, crop_b64, PROMPT_FIGURE_CHECK)
            except Exception as e:
                sys.stderr.write(f"[od-analyzer] figure 판별 실패: {e}\n")

            # Gemini가 [FIGURE]를 반환하면 진짜 이미지, 아니면 텍스트/수식
            is_real_figure = (not gemini_html or
                              gemini_html.strip().upper() == "[FIGURE]")

            if is_real_figure:
                sys.stderr.write(f"[od-analyzer] 영역 {i+1}: 진짜 figure → 이미지 삽입\n")
                img_b64 = _get_figure_image(
                    img, box, pdf_path, page_num, capture_bbox_norm, img_w, img_h
                )
                html_parts.append(
                    f'<img src="data:image/png;base64,{img_b64}" '
                    f'alt="캡처 이미지" style="max-width: 100%;" />'
                )
            else:
                sys.stderr.write(f"[od-analyzer] 영역 {i+1}: figure→text 재분류 성공\n")
                # figure→text 재분류된 결과에도 [FIGURE] 마커가 있을 수 있음
                html_parts.append(_replace_figure_markers(
                    gemini_html, img, box, pdf_path, page_num,
                    capture_bbox_norm, img_w, img_h
                ))
        else:
            try:
                crop_bytes = crop_region_from_image(img, box)
                crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
                prompt = get_prompt_for_region(region)
                result_html = call_gemini_vision(api_key, crop_b64, prompt)
                if result_html:
                    # text 영역에서 [FIGURE] 마커 감지 → 이미지로 교체
                    result_html = _replace_figure_markers(
                        result_html, img, box, pdf_path, page_num,
                        capture_bbox_norm, img_w, img_h
                    )
                    html_parts.append(result_html)
            except Exception as e:
                err_msg = f"영역 {i+1} ({region}) 처리 실패: {e}"
                sys.stderr.write(f"[od-analyzer] {err_msg}\n")
                errors.append(err_msg)

    _emit_progress("done", current=total, total=total, detail="완료")

    combined_html = "\n".join(html_parts)

    return {
        "html": combined_html,
        "regions": len(detections),
        "error": "; ".join(errors) if errors else None,
    }


def _replace_figure_markers(html: str, img, box_px: list,
                            pdf_path: str, page_num: int,
                            capture_bbox_norm: list,
                            img_w: int, img_h: int) -> str:
    """HTML 내 [FIGURE] 마커를 <img> 태그로 교체

    OD가 text로 잘못 분류한 영역에서 Gemini가 [FIGURE]를 반환했을 때,
    해당 위치에 크롭 이미지를 삽입합니다.
    """
    if "[FIGURE]" not in html.upper():
        return html

    sys.stderr.write(f"[od-analyzer] [FIGURE] 마커 감지 → 이미지로 교체\n")
    img_b64 = _get_figure_image(
        img, box_px, pdf_path, page_num, capture_bbox_norm, img_w, img_h
    )
    img_tag = (
        f'<img src="data:image/png;base64,{img_b64}" '
        f'alt="캡처 이미지" style="max-width: 100%;" />'
    )
    # [FIGURE] 마커를 이미지 태그로 교체 (대소문자 무시)
    return re.sub(r'\[FIGURE\]', img_tag, html, flags=re.IGNORECASE)


def _get_figure_image(img, box_px: list, pdf_path: str, page_num: int,
                      capture_bbox_norm: list, img_w: int, img_h: int) -> str:
    """figure 영역의 최적 이미지를 반환 — PDF 렌더링 우선, 없으면 캡처 크롭

    Returns:
        base64 인코딩된 PNG 이미지
    """
    # PDF 페이지에서 해당 영역을 고해상도로 렌더링 (벡터/래스터 모두 지원)
    if pdf_path and page_num >= 0 and capture_bbox_norm:
        try:
            from .pdf_image_extractor import render_page_region

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

            rendered = render_page_region(pdf_path, page_num, fig_norm, dpi=300)
            if rendered:
                sys.stderr.write("[od-analyzer] figure: PDF 300DPI 렌더링 사용\n")
                return rendered
        except Exception as e:
            sys.stderr.write(f"[od-analyzer] PDF 렌더링 실패: {e}\n")

    # fallback: 캡처에서 크롭
    sys.stderr.write("[od-analyzer] figure: 캡처 크롭 fallback\n")
    crop_bytes = crop_region_from_image(img, box_px)
    return base64.b64encode(crop_bytes).decode("ascii")
