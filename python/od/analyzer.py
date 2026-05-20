"""OD 기반 캡처 영역 분석 오케스트레이터

캡처 이미지 → OD 감지 → 영역별 크롭 → Gemini Vision 호출 → 통합 HTML 반환
figure 영역은 PDF 원본 이미지를 우선 사용 (PyMuPDF)

Phase B: Gemini 호출 부분 병렬화 (ThreadPoolExecutor)
- figure/PyMuPDF 후처리는 메인 스레드 순차 유지
- AUZA_GEMINI_PARALLEL_DISABLE=1 → 순차 fallback
- AUZA_GEMINI_PARALLEL=N (1~10) → 워커 수 조절 (기본 8, v2.3.0~)
"""

import os
import sys
import io
import re
import json
import time
import base64
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from .constants import MIN_OD_SIZE
from .detector import detect_regions_from_image, crop_region_from_image, sort_regions_reading_order, reclassify_boxed_text
from .gemini_vision import (
    call_gemini_vision,
    call_gemini_answer_solution,
    get_prompt_for_region,
    PROMPT_FIGURE_CHECK,
)


# ── 다중 Gemini API 키 풀 (v2.4.0) ──

class KeyPool:
    """다중 Gemini API 키 풀 — 라운드로빈 + 429 cooldown 관리

    Args:
        keys: API 키 리스트 (중복 제거 권장)
        cooldown_sec: 429 받은 키를 풀에서 일시 제외할 시간(초)
    """

    def __init__(self, keys: list, cooldown_sec: int = 60):
        # 빈 문자열 / 중복 제거
        seen = set()
        deduped = []
        for k in keys:
            if isinstance(k, str) and k.strip() and k not in seen:
                deduped.append(k.strip())
                seen.add(k)
        if not deduped:
            raise ValueError("KeyPool: 키 리스트가 비어있습니다")
        self._lock = threading.Lock()
        self._keys = deduped
        self._cooldown_until = {k: 0.0 for k in deduped}
        self._rr_counter = 0
        self._cooldown_sec = cooldown_sec

    def acquire(self, exclude=None):
        """활성(cooldown 아님) + exclude 에 없는 키 1개를 라운드로빈 순서로 반환.

        없으면 None. Thread-safe.
        """
        now = time.monotonic()
        exclude_set = set(exclude) if exclude else set()
        with self._lock:
            n = len(self._keys)
            for _ in range(n):
                idx = self._rr_counter % n
                self._rr_counter += 1
                key = self._keys[idx]
                if key in exclude_set:
                    continue
                if self._cooldown_until[key] <= now:
                    return key
            return None

    def mark_cooldown(self, key: str):
        """해당 키를 cooldown_sec 초 동안 풀에서 제외."""
        with self._lock:
            self._cooldown_until[key] = time.monotonic() + self._cooldown_sec

    def active_count(self) -> int:
        now = time.monotonic()
        with self._lock:
            return sum(1 for k in self._keys if self._cooldown_until[k] <= now)

    def total_count(self) -> int:
        return len(self._keys)


def _call_vision_with_pool(key_pool: KeyPool, crop_b64: str, prompt: str) -> str:
    """KeyPool 라운드로빈으로 키를 받아 call_gemini_vision 호출.

    429 (GeminiRetryExhaustedError with status_code==429) 발생 시
    해당 키를 cooldown 등록하고 다른 키로 즉시 재시도. 같은 task 는 각 키에
    최대 1회 시도 → 모든 키 cooldown 이면 마지막 에러 raise.
    """
    from .vision_client import GeminiRetryExhaustedError, GeminiPermanentError

    tried = set()
    last_error = None
    while True:
        key = key_pool.acquire(exclude=tried)
        if key is None:
            if last_error is not None:
                raise last_error
            raise RuntimeError("사용 가능한 API 키가 없습니다 (모두 cooldown)")
        try:
            return call_gemini_vision(key, crop_b64, prompt)
        except GeminiRetryExhaustedError as e:
            if getattr(e, 'status_code', 0) == 429:
                key_pool.mark_cooldown(key)
                tried.add(key)
                last_error = e
                sys.stderr.write(
                    f"[od-analyzer] key cooldown (429) — 활성 키 {key_pool.active_count()}/{key_pool.total_count()} 남음\n"
                )
                continue
            raise
        except GeminiPermanentError:
            # 400/401 은 키 자체 문제 → 다른 키로 재시도해도 의미 없음. 그대로 raise.
            raise


def _call_answer_solution_with_pool(key_pool: KeyPool, image_b64: str,
                                     thinking_budget: int = -1) -> dict:
    """KeyPool 라운드로빈으로 정답·풀이 추론 호출 (v2.5.0).

    Returns: call_gemini_answer_solution 의 반환 dict (실패 시 {"items": []}).
    KeyPool / 429 처리는 _call_vision_with_pool 와 동일.
    """
    from .vision_client import GeminiRetryExhaustedError, GeminiPermanentError

    tried = set()
    last_error = None
    while True:
        key = key_pool.acquire(exclude=tried)
        if key is None:
            if last_error is not None:
                raise last_error
            raise RuntimeError("사용 가능한 API 키가 없습니다 (모두 cooldown)")
        try:
            return call_gemini_answer_solution(key, image_b64,
                                                thinking_budget=thinking_budget)
        except GeminiRetryExhaustedError as e:
            if getattr(e, 'status_code', 0) == 429:
                key_pool.mark_cooldown(key)
                tried.add(key)
                last_error = e
                sys.stderr.write(
                    f"[od-analyzer] answer key cooldown (429) — 활성 키 "
                    f"{key_pool.active_count()}/{key_pool.total_count()} 남음\n"
                )
                continue
            raise
        except GeminiPermanentError:
            raise


def _emit_progress(step: str, current: int = 0, total: int = 0, detail: str = "",
                   segment_index: int = -1, segment_total: int = 0):
    """진행 상황을 stderr JSON으로 출력 — Electron이 파싱하여 UI에 전달

    segment_index/segment_total: 일괄 변환 시 세그먼트 컨텍스트 (없으면 -1/0)
    """
    payload = {
        "type": "od-progress",
        "step": step,
        "current": current,
        "total": total,
        "detail": detail,
    }
    if segment_index >= 0:
        payload["segmentIndex"] = segment_index
        payload["segmentTotal"] = segment_total
    msg = json.dumps(payload, ensure_ascii=False)
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
    detections = reclassify_boxed_text(img, detections)
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


def _get_parallel_workers() -> int:
    """병렬화 워커 수 반환. 0이면 순차 실행.

    환경변수:
        AUZA_GEMINI_PARALLEL_DISABLE=1 → 0 (순차)
        AUZA_GEMINI_PARALLEL=N (1~10) → N (기본 8)

    기본 8 사유: 유료 티어 Gemini API 사용 시 동시 호출 상한 여유로 region 많은
    일반 교재 캡처(세그먼트당 region 4~10개)에서 wave 수 절반으로 단축.
    """
    if os.environ.get("AUZA_GEMINI_PARALLEL_DISABLE", "").strip() == "1":
        return 0
    raw = os.environ.get("AUZA_GEMINI_PARALLEL", "8").strip()
    try:
        n = int(raw)
        if n < 1 or n > 10:
            return 8
        return n
    except (ValueError, TypeError):
        return 8


def convert_regions(image_base64: str, detections: list, api_key: str,
                    pdf_path: str = None, page_num: int = -1,
                    capture_bbox_norm: list = None,
                    trust_labels: bool = False) -> dict:
    """사용자가 편집한 detections를 기반으로 Gemini Vision 변환 + figure 후처리

    Phase B: Gemini 호출을 ThreadPoolExecutor로 병렬 실행.
    figure/PyMuPDF 후처리는 메인 스레드에서 순차 처리.

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

    total = len(detections)
    workers = _get_parallel_workers()
    use_parallel = workers > 0 and total > 1

    sys.stderr.write(f"[od-analyzer] convert: {total} 영역 변환 시작 "
                     f"(parallel={use_parallel}, workers={workers})\n")

    # ────────────────────────────────────────────
    # Phase 1: 준비 — 크롭 + 태스크 분류 (메인 스레드)
    # ────────────────────────────────────────────
    tasks = []  # [{index, det, type, crop_b64?, prompt?}]

    for i, det in enumerate(detections):
        region = det["region"]
        box = det["box_px"]

        if region == "figure" and trust_labels:
            # Gemini 불필요 — 이미지 직접 삽입
            tasks.append({"index": i, "det": det, "type": "figure_direct"})
        elif region == "figure":
            # Gemini figure check 필요
            crop_bytes = crop_region_from_image(img, box)
            crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
            tasks.append({
                "index": i, "det": det, "type": "figure_check",
                "crop_b64": crop_b64, "prompt": PROMPT_FIGURE_CHECK,
            })
        else:
            # Gemini 내용 추출
            crop_bytes = crop_region_from_image(img, box)
            crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
            prompt = get_prompt_for_region(region)
            tasks.append({
                "index": i, "det": det, "type": "gemini",
                "crop_b64": crop_b64, "prompt": prompt,
            })

    # ────────────────────────────────────────────
    # Phase 2: Gemini 호출 (병렬 또는 순차)
    # ────────────────────────────────────────────
    gemini_tasks = [t for t in tasks if t["type"] in ("figure_check", "gemini")]

    # 진행률 카운터 (atomic, 단조 증가)
    progress_lock = threading.Lock()
    progress_counter = [0]  # mutable for closure

    def _tick_progress(region_name: str):
        with progress_lock:
            progress_counter[0] += 1
            current = progress_counter[0]
        _emit_progress("region", current=current, total=total,
                       detail=f"{region_name} 영역 인식 완료")

    if use_parallel and len(gemini_tasks) > 1:
        # ── 병렬 실행 ──
        sys.stderr.write(f"[od-analyzer] 병렬 Gemini 호출: {len(gemini_tasks)}건, "
                         f"workers={workers}\n")
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_task = {}
            for task in gemini_tasks:
                future = executor.submit(
                    call_gemini_vision, api_key, task["crop_b64"], task["prompt"]
                )
                future_to_task[future] = task

            for future in as_completed(future_to_task):
                task = future_to_task[future]
                region = task["det"]["region"]
                idx = task["index"]
                try:
                    task["gemini_result"] = future.result()
                    sys.stderr.write(f"[od-analyzer] 영역 {idx+1}/{total}: "
                                     f"{region} Gemini 완료\n")
                except Exception as e:
                    task["gemini_error"] = e
                    sys.stderr.write(f"[od-analyzer] 영역 {idx+1}/{total}: "
                                     f"{region} Gemini 실패: {e}\n")
                _tick_progress(region)
    else:
        # ── 순차 실행 ──
        for task in gemini_tasks:
            region = task["det"]["region"]
            idx = task["index"]
            sys.stderr.write(f"[od-analyzer] 영역 {idx+1}/{total}: "
                             f"{region} Gemini 호출 중\n")
            try:
                task["gemini_result"] = call_gemini_vision(
                    api_key, task["crop_b64"], task["prompt"]
                )
            except Exception as e:
                task["gemini_error"] = e
                sys.stderr.write(f"[od-analyzer] 영역 {idx+1}/{total}: "
                                 f"{region} Gemini 실패: {e}\n")
            _tick_progress(region)

    # figure_direct 태스크도 진행률에 반영
    for task in tasks:
        if task["type"] == "figure_direct":
            _tick_progress("figure")

    # ────────────────────────────────────────────
    # Phase 3: 후처리 — figure 이미지/마커 교체 (메인 스레드, 순차)
    # ────────────────────────────────────────────
    html_parts = [None] * total
    errors = []

    for task in tasks:
        i = task["index"]
        det = task["det"]
        region = det["region"]
        box = det["box_px"]

        if task["type"] == "figure_direct":
            # trust_labels=True: 이미지 직접 삽입 (Gemini 없음)
            sys.stderr.write(f"[od-analyzer] 영역 {i+1}: trust_labels=True, "
                             f"figure → 이미지 직접 삽입\n")
            try:
                img_b64 = _get_figure_image(
                    img, box, pdf_path, page_num, capture_bbox_norm, img_w, img_h
                )
                html_parts[i] = (
                    f'<img src="data:image/png;base64,{img_b64}" '
                    f'alt="캡처 이미지" style="max-width: 100%;" />'
                )
            except Exception as e:
                sys.stderr.write(f"[od-analyzer] 영역 {i+1}: figure 이미지 생성 실패: {e}\n")
                try:
                    crop_bytes = crop_region_from_image(img, box)
                    fb64 = base64.b64encode(crop_bytes).decode("ascii")
                    html_parts[i] = (
                        f'<img src="data:image/png;base64,{fb64}" '
                        f'alt="캡처 이미지" style="max-width: 100%;" />'
                    )
                except Exception as e2:
                    errors.append(f"영역 {i+1} figure 이미지 실패: {e2}")

        elif task["type"] == "figure_check":
            gemini_html = task.get("gemini_result")
            gemini_err = task.get("gemini_error")

            if gemini_err:
                sys.stderr.write(f"[od-analyzer] figure 판별 실패: {gemini_err}\n")

            is_real_figure = (not gemini_html or
                              gemini_html.strip().upper() == "[FIGURE]")

            if is_real_figure:
                sys.stderr.write(f"[od-analyzer] 영역 {i+1}: 진짜 figure → 이미지 삽입\n")
                img_b64 = _get_figure_image(
                    img, box, pdf_path, page_num, capture_bbox_norm, img_w, img_h
                )
                html_parts[i] = (
                    f'<img src="data:image/png;base64,{img_b64}" '
                    f'alt="캡처 이미지" style="max-width: 100%;" />'
                )
            else:
                sys.stderr.write(f"[od-analyzer] 영역 {i+1}: figure→text 재분류 성공\n")
                html_parts[i] = _replace_figure_markers(
                    gemini_html, img, box, pdf_path, page_num,
                    capture_bbox_norm, img_w, img_h
                )

        else:  # type == "gemini"
            gemini_err = task.get("gemini_error")
            if gemini_err:
                err_msg = f"영역 {i+1} ({region}) 처리 실패: {gemini_err}"
                sys.stderr.write(f"[od-analyzer] {err_msg}\n")
                errors.append(err_msg)
                continue

            result_html = task.get("gemini_result")
            if not result_html:
                continue

            # figure 마커 교체 (메인 스레드 — PyMuPDF 사용)
            result_html = _replace_figure_markers(
                result_html, img, box, pdf_path, page_num,
                capture_bbox_norm, img_w, img_h
            )

            # boxed_text 래핑
            if region == "boxed_text":
                result_html = (
                    '<table style="border: 1px solid #000; width: 100%; border-collapse: collapse;">'
                    '<tr><td style="padding: 8px;">'
                    + result_html
                    + '</td></tr></table>'
                )

            html_parts[i] = result_html

    _emit_progress("done", current=total, total=total, detail="완료")

    combined_html = "\n".join(p for p in html_parts if p)

    return {
        "html": combined_html,
        "regions": total,
        "error": "; ".join(errors) if errors else None,
    }


def convert_regions_many(segments: list, api_keys,
                          answer_mode: bool = False,
                          answer_thinking_budget: int = -1) -> dict:
    """여러 세그먼트를 한 번에 변환 — 모든 세그먼트의 Gemini 호출을
    다중 키 풀(KeyPool) 위 ThreadPoolExecutor에서 병렬 처리.

    Args:
        segments: [{imageBase64, detections, pdfPath?, pageNum?, captureBboxNorm?}, ...]
        api_keys: API 키 리스트 (list[str]) 또는 단일 키 (str, 하위호환)
        answer_mode: True 면 본문 변환 후 세그먼트별 정답·풀이 추론 호출 추가 (v2.5.0)
        answer_thinking_budget: thinking 토큰 한도 (-1=자동, 0=비활성)

    Returns:
        {"results": [{html, regions, error, answer?, solution?, answerError?}, ...], "error": None}
        results는 segments와 동일 순서/길이.
        answer/solution/answerError 필드는 answer_mode=True 일 때만 존재.

    v2.4.0: workers = len(api_keys) × _get_parallel_workers().
        키별 라운드로빈 + 429 발생 시 해당 키 60초 cooldown → 같은 task 다른 키 재시도.
    v2.5.0: answer_mode=True 시 본문 변환 후 Phase 2B에서 세그먼트별로
        정답·풀이 추론 호출을 같은 KeyPool 위에서 병렬 실행.
    """
    from PIL import Image

    # 하위호환: 단일 키 문자열 입력도 허용
    if isinstance(api_keys, str):
        api_keys = [api_keys]
    if not isinstance(api_keys, list) or not api_keys:
        return {"results": [], "error": "api_keys 가 필요합니다"}

    if not segments:
        return {"results": [], "error": None}

    seg_count = len(segments)
    sys.stderr.write(f"[od-analyzer] convert_many 시작: {seg_count} 세그먼트\n")

    # ────────────────────────────────────────────
    # Phase 1: 세그먼트별 준비 (크롭 + 태스크 분류)
    # ────────────────────────────────────────────
    seg_states = []  # [{img, img_w, img_h, detections, tasks, pdf_path, page_num, capture_bbox_norm, error}]
    flat_gemini_tasks = []  # [(seg_idx, task), ...]

    for seg_idx, seg in enumerate(segments):
        image_base64 = seg.get('imageBase64', '')
        detections = seg.get('detections', []) or []
        pdf_path = seg.get('pdfPath', '') or ''
        page_num = seg.get('pageNum', -1)
        capture_bbox_norm = seg.get('captureBboxNorm')

        if not image_base64:
            seg_states.append({
                "tasks": [], "error": "imageBase64가 필요합니다",
                "img": None, "img_w": 0, "img_h": 0, "detections": [],
                "pdf_path": pdf_path, "page_num": page_num,
                "capture_bbox_norm": capture_bbox_norm,
            })
            continue

        try:
            image_bytes = base64.b64decode(image_base64)
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img_w, img_h = img.size
        except Exception as e:
            seg_states.append({
                "tasks": [], "error": f"이미지 디코드 실패: {e}",
                "img": None, "img_w": 0, "img_h": 0, "detections": [],
                "pdf_path": pdf_path, "page_num": page_num,
                "capture_bbox_norm": capture_bbox_norm,
            })
            continue

        # abandon 필터 + reading-order 재정렬
        detections = [d for d in detections if d.get("region") != "abandon"]
        detections = sort_regions_reading_order(detections)

        tasks = []
        if not detections:
            # 영역 없음 → 전체 이미지 Gemini 호출 (단일 task로 등록)
            from .gemini_vision import PROMPT_TEXT
            whole_b64 = base64.b64encode(io.BytesIO(image_bytes).getvalue()).decode("ascii")
            task = {
                "index": 0, "det": {"region": "text", "box_px": [0, 0, img_w, img_h]},
                "type": "gemini_whole",
                "crop_b64": whole_b64, "prompt": PROMPT_TEXT,
            }
            tasks.append(task)
            flat_gemini_tasks.append((seg_idx, task))
        else:
            for i, det in enumerate(detections):
                region = det["region"]
                box = det["box_px"]

                if region == "figure":
                    # trust_labels=True 고정 — 일괄 변환은 사용자 리뷰 후 진입
                    tasks.append({"index": i, "det": det, "type": "figure_direct"})
                else:
                    try:
                        crop_bytes = crop_region_from_image(img, box)
                        crop_b64 = base64.b64encode(crop_bytes).decode("ascii")
                    except Exception as e:
                        sys.stderr.write(f"[od-analyzer] seg{seg_idx} 영역 {i+1} crop 실패: {e}\n")
                        tasks.append({"index": i, "det": det, "type": "skip",
                                      "error": f"crop 실패: {e}"})
                        continue
                    prompt = get_prompt_for_region(region)
                    task = {
                        "index": i, "det": det, "type": "gemini",
                        "crop_b64": crop_b64, "prompt": prompt,
                    }
                    tasks.append(task)
                    flat_gemini_tasks.append((seg_idx, task))

        seg_states.append({
            "tasks": tasks, "error": None,
            "img": img, "img_w": img_w, "img_h": img_h,
            "detections": detections,
            "pdf_path": pdf_path, "page_num": page_num,
            "capture_bbox_norm": capture_bbox_norm,
        })

    # ────────────────────────────────────────────
    # Phase 2: 다중 키 풀에서 ThreadPoolExecutor 병렬 실행
    # v2.4.0: max_workers = activeKeys × _get_parallel_workers()
    # 라운드로빈은 워커 실행 시점에 KeyPool.acquire() — 동적 분배
    # ────────────────────────────────────────────
    workers_per_key = _get_parallel_workers()
    key_pool = KeyPool(api_keys, cooldown_sec=60)
    workers = max(1, key_pool.total_count() * workers_per_key) if workers_per_key > 0 else 1
    total_gemini = len(flat_gemini_tasks)
    use_parallel = workers_per_key > 0 and total_gemini > 1

    sys.stderr.write(
        f"[od-analyzer] convert_many: Gemini 호출 {total_gemini}건 "
        f"(keys={key_pool.total_count()}, workersPerKey={workers_per_key}, "
        f"total_workers={workers}, parallel={use_parallel})\n"
    )

    progress_lock = threading.Lock()
    progress_counter = [0]

    def _tick(seg_idx: int, region_name: str):
        with progress_lock:
            progress_counter[0] += 1
            current = progress_counter[0]
        _emit_progress("region", current=current, total=max(total_gemini, 1),
                       detail=f"[{seg_idx+1}/{seg_count}] {region_name} 완료",
                       segment_index=seg_idx, segment_total=seg_count)

    if use_parallel:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_map = {}
            for seg_idx, task in flat_gemini_tasks:
                future = executor.submit(
                    _call_vision_with_pool, key_pool, task["crop_b64"], task["prompt"]
                )
                future_map[future] = (seg_idx, task)

            for future in as_completed(future_map):
                seg_idx, task = future_map[future]
                region = task["det"]["region"]
                try:
                    task["gemini_result"] = future.result()
                except Exception as e:
                    task["gemini_error"] = e
                    sys.stderr.write(f"[od-analyzer] seg{seg_idx} {region} Gemini 실패: {e}\n")
                _tick(seg_idx, region)
    else:
        for seg_idx, task in flat_gemini_tasks:
            region = task["det"]["region"]
            try:
                task["gemini_result"] = _call_vision_with_pool(
                    key_pool, task["crop_b64"], task["prompt"]
                )
            except Exception as e:
                task["gemini_error"] = e
                sys.stderr.write(f"[od-analyzer] seg{seg_idx} {region} Gemini 실패: {e}\n")
            _tick(seg_idx, region)

    # ────────────────────────────────────────────
    # Phase 3: 세그먼트별 후처리 (메인 스레드, 순차)
    # ────────────────────────────────────────────
    results = []
    for seg_idx, state in enumerate(seg_states):
        if state["error"]:
            results.append({"html": "", "regions": 0, "error": state["error"]})
            continue

        img = state["img"]
        img_w = state["img_w"]
        img_h = state["img_h"]
        pdf_path = state["pdf_path"]
        page_num = state["page_num"]
        capture_bbox_norm = state["capture_bbox_norm"]
        tasks = state["tasks"]
        detections = state["detections"]

        # 영역 미감지 → 전체 이미지 Gemini 결과 사용
        if not detections and tasks:
            whole_task = tasks[0]
            if whole_task.get("gemini_error"):
                results.append({
                    "html": "", "regions": 0,
                    "error": f"Gemini 호출 실패: {whole_task['gemini_error']}",
                })
            else:
                results.append({
                    "html": whole_task.get("gemini_result") or "",
                    "regions": 0, "error": None,
                })
            continue

        total = len(detections)
        html_parts = [None] * total
        errors = []

        for task in tasks:
            i = task["index"]
            det = task["det"]
            region = det["region"]
            box = det["box_px"]

            if task["type"] == "skip":
                errors.append(f"영역 {i+1}: {task.get('error', 'skipped')}")
                continue

            if task["type"] == "figure_direct":
                try:
                    img_b64 = _get_figure_image(
                        img, box, pdf_path, page_num, capture_bbox_norm, img_w, img_h
                    )
                    html_parts[i] = (
                        f'<img src="data:image/png;base64,{img_b64}" '
                        f'alt="캡처 이미지" style="max-width: 100%;" />'
                    )
                except Exception as e:
                    sys.stderr.write(f"[od-analyzer] seg{seg_idx} 영역 {i+1} "
                                     f"figure 이미지 생성 실패: {e}\n")
                    try:
                        crop_bytes = crop_region_from_image(img, box)
                        fb64 = base64.b64encode(crop_bytes).decode("ascii")
                        html_parts[i] = (
                            f'<img src="data:image/png;base64,{fb64}" '
                            f'alt="캡처 이미지" style="max-width: 100%;" />'
                        )
                    except Exception as e2:
                        errors.append(f"영역 {i+1} figure 이미지 실패: {e2}")

            else:  # type == "gemini"
                gemini_err = task.get("gemini_error")
                if gemini_err:
                    errors.append(f"영역 {i+1} ({region}) 처리 실패: {gemini_err}")
                    continue

                result_html = task.get("gemini_result")
                if not result_html:
                    continue

                result_html = _replace_figure_markers(
                    result_html, img, box, pdf_path, page_num,
                    capture_bbox_norm, img_w, img_h
                )

                if region == "boxed_text":
                    result_html = (
                        '<table style="border: 1px solid #000; width: 100%; border-collapse: collapse;">'
                        '<tr><td style="padding: 8px;">'
                        + result_html
                        + '</td></tr></table>'
                    )

                html_parts[i] = result_html

        combined = "\n".join(p for p in html_parts if p)
        results.append({
            "html": combined,
            "regions": total,
            "error": "; ".join(errors) if errors else None,
        })

    # ────────────────────────────────────────────
    # Phase 2B: 정답·풀이 추론 (v2.5.0, answer_mode=True 시)
    # 세그먼트별 전체 이미지를 같은 KeyPool 위 ThreadPoolExecutor 로 병렬 호출.
    # 본문 변환에 실패한(state.error 또는 모든 region 실패) 세그먼트는 skip.
    # ────────────────────────────────────────────
    if answer_mode:
        # 호출 대상: 본문 변환에 실패하지 않은 세그먼트 + 이미지가 있는 세그먼트
        answer_targets = []  # [(seg_idx, image_b64)]
        for seg_idx, state in enumerate(seg_states):
            if state["error"] or state["img"] is None:
                continue
            seg = segments[seg_idx]
            img_b64 = seg.get('imageBase64', '')
            if not img_b64:
                continue
            answer_targets.append((seg_idx, img_b64))

        total_answer = len(answer_targets)
        if total_answer > 0:
            sys.stderr.write(
                f"[od-analyzer] convert_many: 정답·풀이 추론 시작 — "
                f"{total_answer}/{seg_count} 세그먼트 (thinking_budget={answer_thinking_budget})\n"
            )

            # 진행률: Phase 2A 끝났으니 새 카운터로 시작
            answer_progress_lock = threading.Lock()
            answer_progress = [0]

            def _tick_answer(seg_idx: int, ok: bool):
                with answer_progress_lock:
                    answer_progress[0] += 1
                    cur = answer_progress[0]
                _emit_progress(
                    "answer", current=cur, total=total_answer,
                    detail=f"[{seg_idx+1}/{seg_count}] 정답·풀이 {'완료' if ok else '실패'}",
                    segment_index=seg_idx, segment_total=seg_count,
                )

            answer_results = {}  # seg_idx -> {"items": [...]} or {"error": str}
            use_answer_parallel = workers_per_key > 0 and total_answer > 1

            if use_answer_parallel:
                with ThreadPoolExecutor(max_workers=workers) as executor:
                    fut_map = {}
                    for seg_idx, img_b64 in answer_targets:
                        fut = executor.submit(
                            _call_answer_solution_with_pool,
                            key_pool, img_b64, answer_thinking_budget,
                        )
                        fut_map[fut] = seg_idx
                    for fut in as_completed(fut_map):
                        seg_idx = fut_map[fut]
                        try:
                            answer_results[seg_idx] = fut.result()
                            _tick_answer(seg_idx, True)
                        except Exception as e:
                            sys.stderr.write(f"[od-analyzer] seg{seg_idx} answer 실패: {e}\n")
                            answer_results[seg_idx] = {"error": str(e)}
                            _tick_answer(seg_idx, False)
            else:
                for seg_idx, img_b64 in answer_targets:
                    try:
                        answer_results[seg_idx] = _call_answer_solution_with_pool(
                            key_pool, img_b64, answer_thinking_budget,
                        )
                        _tick_answer(seg_idx, True)
                    except Exception as e:
                        sys.stderr.write(f"[od-analyzer] seg{seg_idx} answer 실패: {e}\n")
                        answer_results[seg_idx] = {"error": str(e)}
                        _tick_answer(seg_idx, False)

            # 세그먼트 결과에 answer/solution 부착
            # Codex F1: items=[] 빈 응답도 "추론 실패" 로 명시 부착해 검토 탭에서 누락 방지
            EMPTY_ANSWER_ERROR = "정답·풀이 추론 결과가 비어있습니다 (모델 미응답 또는 파싱 실패)"
            for seg_idx in range(seg_count):
                ans = answer_results.get(seg_idx)
                if ans is None:
                    # answer_mode 인데 호출 skip (본문 실패 등) — 빈 값 부착
                    results[seg_idx]["answer"] = ""
                    results[seg_idx]["solution"] = ""
                    results[seg_idx]["answerItems"] = []
                    continue
                if "error" in ans:
                    results[seg_idx]["answer"] = ""
                    results[seg_idx]["solution"] = ""
                    results[seg_idx]["answerItems"] = []
                    results[seg_idx]["answerError"] = ans["error"]
                    continue
                items = ans.get("items", [])
                results[seg_idx]["answerItems"] = items
                # 단일 문제: items[0] 의 answer/solution 을 평탄화
                # 여러 문제: 첫 답을 answer 로, 모든 풀이를 합쳐서 solution 으로
                if len(items) == 1:
                    results[seg_idx]["answer"] = items[0].get("answer", "")
                    results[seg_idx]["solution"] = items[0].get("solution", "")
                elif len(items) > 1:
                    answers_joined = "; ".join(
                        (f"{it.get('questionNo','').strip()}. " if it.get('questionNo','').strip() else "")
                        + it.get("answer", "")
                        for it in items if it.get("answer")
                    )
                    solutions_joined = "\n\n".join(
                        (f"[{it.get('questionNo','').strip()}] " if it.get('questionNo','').strip() else "")
                        + it.get("solution", "")
                        for it in items if it.get("solution")
                    )
                    results[seg_idx]["answer"] = answers_joined
                    results[seg_idx]["solution"] = solutions_joined
                else:
                    # Codex F1: 호출은 성공했으나 items=[] — answerError 로 승격
                    results[seg_idx]["answer"] = ""
                    results[seg_idx]["solution"] = ""
                    results[seg_idx]["answerError"] = EMPTY_ANSWER_ERROR

    _emit_progress("done", current=total_gemini, total=max(total_gemini, 1),
                   detail=f"일괄 변환 완료 ({seg_count}건)")

    return {"results": results, "error": None}


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
