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


def _rescue_abandon(detections: list) -> list:
    """abandon 영역 처리: 넓은 영역(가로세로비 3:1 이상)은 text로 복구, 나머지 제거"""
    rescued = []
    for d in detections:
        if d["region"] == "abandon":
            box = d["box_px"]
            w = box[2] - box[0]
            h = box[3] - box[1]
            aspect = w / max(h, 1)
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
    return rescued


def detect_only(image_base64: str, od_model, emit_done: bool = True) -> dict:
    """캡처 이미지에서 OD 검출만 수행 (Gemini 호출 없음)

    Args:
        emit_done: True면 감지 완료 시 done 이벤트 발행 (atomic 경로에서는 False)

    Returns:
        {"detections": list[dict], "imageWidth": int, "imageHeight": int, "error": str|None}
        각 detection: {"label": str, "region": str, "score": float, "box_px": [x1,y1,x2,y2]}
    """
    from PIL import Image

    image_bytes = base64.b64decode(image_base64)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = img.size

    if img_w < MIN_OD_SIZE or img_h < MIN_OD_SIZE:
        sys.stderr.write(f"[od-analyzer] 소형 캡처 ({img_w}x{img_h}), OD 건너뛰기\n")
        return {"detections": [], "imageWidth": img_w, "imageHeight": img_h, "error": None}

    _emit_progress("od", detail="레이아웃 감지 중...")
    detections = detect_regions_from_image(od_model, image_bytes)
    detections = _rescue_abandon(detections)
    detections = sort_regions_reading_order(detections)

    sys.stderr.write(f"[od-analyzer] detect_only: {len(detections)} 영역 감지\n")
    if emit_done:
        _emit_progress("done", detail="감지 완료")

    return {
        "detections": detections,
        "imageWidth": img_w,
        "imageHeight": img_h,
        "error": None,
    }


def convert_regions(image_base64: str, detections: list, api_key: str,
                    pdf_path: str = None, page_num: int = -1,
                    capture_bbox_norm: list = None,
                    trust_labels: bool = False) -> dict:
    """사용자가 편집한 detections를 기반으로 Gemini Vision 변환 + figure 후처리

    Args:
        image_base64: base64 인코딩된 PNG 이미지
        detections: 편집된 검출 결과 리스트 (box_px, region, label, score)
        api_key: Gemini API 키
        pdf_path, page_num, capture_bbox_norm: figure PDF 렌더링용
        trust_labels: True면 사용자가 설정한 유형을 신뢰 (figure→이미지 직접 삽입, Gemini 재판별 생략)

    Returns:
        {"html": str, "regions": int, "error": str|None}
    """
    from PIL import Image

    image_bytes = base64.b64decode(image_base64)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = img.size

    # ── 디버그: 수신된 detections 원본 로깅 ──
    sys.stderr.write(f"[od-analyzer] convert 호출: trust_labels={trust_labels}, "
                     f"detections={len(detections)}개\n")
    for _i, _d in enumerate(detections):
        sys.stderr.write(f"  [{_i}] region={_d.get('region')}, score={_d.get('score',0)}, "
                         f"box={_d.get('box_px')}, id={_d.get('id','?')}\n")

    # abandon 필터링 + reading-order 재정렬
    detections = [d for d in detections if d.get("region") != "abandon"]
    detections = sort_regions_reading_order(detections)

    if not detections:
        sys.stderr.write("[od-analyzer] convert: 영역 없음, 전체 이미지 Gemini 호출\n")
        _emit_progress("gemini", detail="영역 미감지 — 전체 이미지 인식 중")
        from .gemini_vision import PROMPT_TEXT
        html = call_gemini_vision(api_key, image_base64, PROMPT_TEXT)
        return {"html": html, "regions": 0, "error": None}

    sys.stderr.write(f"[od-analyzer] convert: {len(detections)} 영역 변환 시작\n")

    html_parts = []
    errors = []
    total = len(detections)

    for i, det in enumerate(detections):
        region = det["region"]
        box = det["box_px"]
        score = det.get("score", 0)

        _emit_progress("region", current=i + 1, total=total,
                       detail=f"{region} 영역 인식 중")
        sys.stderr.write(f"[od-analyzer] 영역 {i+1}/{total}: "
                         f"{region} (score={score}) box={box}\n")

        if region == "figure":
            # trust_labels=True (사용자 리뷰 경로): 사용자가 figure로 지정 → Gemini 재판별 없이 이미지 삽입
            if trust_labels:
                sys.stderr.write(f"[od-analyzer] 영역 {i+1}: trust_labels=True, "
                                 f"figure → 이미지 직접 삽입 (Gemini 호출 없음)\n")
                try:
                    img_b64 = _get_figure_image(
                        img, box, pdf_path, page_num, capture_bbox_norm, img_w, img_h
                    )
                    html_parts.append(
                        f'<img src="data:image/png;base64,{img_b64}" '
                        f'alt="캡처 이미지" style="max-width: 100%;" />'
                    )
                except Exception as e:
                    sys.stderr.write(f"[od-analyzer] 영역 {i+1}: figure 이미지 생성 실패: {e}\n")
                    # fallback: 크롭 이미지라도 삽입
                    try:
                        crop_bytes = crop_region_from_image(img, box)
                        fb64 = base64.b64encode(crop_bytes).decode("ascii")
                        html_parts.append(
                            f'<img src="data:image/png;base64,{fb64}" '
                            f'alt="캡처 이미지" style="max-width: 100%;" />'
                        )
                    except Exception as e2:
                        errors.append(f"영역 {i+1} figure 이미지 실패: {e2}")
                continue

            # trust_labels=False (자동 경로): Gemini에게 진짜 figure인지 재판별
            gemini_html = None
            try:
                crop_bytes = crop_region_from_image(img, box)
                crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
                gemini_html = call_gemini_vision(api_key, crop_b64, PROMPT_FIGURE_CHECK)
            except Exception as e:
                sys.stderr.write(f"[od-analyzer] figure 판별 실패: {e}\n")

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


def analyze_capture(image_base64: str, api_key: str, od_model,
                    pdf_path: str = None, page_num: int = -1,
                    capture_bbox_norm: list = None) -> dict:
    """캡처 이미지를 OD로 분석하고 영역별 Gemini Vision 호출 (기존 atomic 경로, 하위 호환)

    내부적으로 detect_only() + convert_regions()를 순차 호출합니다.
    """
    det_result = detect_only(image_base64, od_model, emit_done=False)

    if det_result.get("error"):
        return {"html": "", "regions": 0, "error": det_result["error"]}

    detections = det_result["detections"]

    # 소형 캡처 또는 감지 없음 → 전체 이미지 Gemini 호출
    if not detections:
        from PIL import Image
        image_bytes = base64.b64decode(image_base64)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img.size

        if img_w < MIN_OD_SIZE or img_h < MIN_OD_SIZE:
            _emit_progress("gemini", detail="소형 캡처 — 직접 인식 중")
        else:
            _emit_progress("gemini", detail="영역 미감지 — 전체 이미지 인식 중")

        from .gemini_vision import PROMPT_TEXT
        html = call_gemini_vision(api_key, image_base64, PROMPT_TEXT)
        return {"html": html, "regions": 0, "error": None}

    return convert_regions(
        image_base64, detections, api_key,
        pdf_path=pdf_path, page_num=page_num,
        capture_bbox_norm=capture_bbox_norm,
    )


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
    """figure 영역의 최적 이미지를 반환 — hybrid 전략

    1) PDF 렌더링(300DPI) 시도 — 벡터 그래픽에 유리
    2) 캡처 크롭 생성 — 브라우저(PDF.js) 렌더링 품질 활용
    3) 두 결과의 픽셀 수를 비교하여 더 큰 쪽을 채택
       (래스터 이미지는 DPI 올려도 원본 해상도 이상 불가 → 캡처 크롭이 이김)
       (벡터 그래픽은 300DPI 렌더가 훨씬 큼 → PDF 렌더가 이김)

    Returns:
        base64 인코딩된 PNG 이미지
    """
    # 1) 캡처 크롭 (항상 생성)
    crop_bytes = crop_region_from_image(img, box_px)
    crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
    crop_w = box_px[2] - box_px[0]
    crop_h = box_px[3] - box_px[1]
    crop_pixels = crop_w * crop_h

    sys.stderr.write(f"[od-analyzer] figure: 캡처 크롭 {crop_w}x{crop_h}px\n")

    # 2) PDF 렌더링 시도
    if pdf_path and page_num >= 0 and capture_bbox_norm:
        try:
            from .pdf_image_extractor import render_page_region

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
                # 렌더 결과 크기 확인
                from PIL import Image
                render_bytes = base64.b64decode(rendered)
                render_img = Image.open(io.BytesIO(render_bytes))
                render_w, render_h = render_img.size
                render_pixels = render_w * render_h

                sys.stderr.write(f"[od-analyzer] figure: PDF 300DPI {render_w}x{render_h}px "
                                 f"vs 캡처 크롭 {crop_w}x{crop_h}px\n")

                # 3) 더 큰 쪽 채택
                if render_pixels > crop_pixels:
                    sys.stderr.write(f"[od-analyzer] figure: → PDF 렌더 채택 (벡터)\n")
                    return rendered
                else:
                    sys.stderr.write(f"[od-analyzer] figure: → 캡처 크롭 채택 (래스터)\n")
                    return crop_b64
        except Exception as e:
            sys.stderr.write(f"[od-analyzer] figure: PDF 렌더 실패: {e} → 캡처 크롭 사용\n")

    return crop_b64
