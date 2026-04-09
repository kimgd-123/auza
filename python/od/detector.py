"""DocLayout-YOLO OD 모델 로드 및 영역 감지 — docling_pj 적응"""

import sys
import os
import subprocess
from pathlib import Path
from .constants import OD_CONF, OD_IMGSZ, MODEL_REPO, MODEL_FILE, OD_LABEL_MAP


def _get_od_packages_dir() -> str:
    """OD 패키지 설치 경로 반환 — %APPDATA%/AUZA-v2/od-packages/
    앱 업데이트 시에도 패키지가 유지되도록 사용자 데이터 영역에 설치"""
    od_dir = os.path.join(
        os.environ.get('APPDATA', os.path.expanduser('~')),
        'AUZA-v2', 'od-packages',
    )
    os.makedirs(od_dir, exist_ok=True)
    return od_dir


def _ensure_od_site_path():
    """OD 패키지 경로를 sys.path 최우선에 추가 (import 가능하도록)"""
    od_dir = _get_od_packages_dir()
    if od_dir not in sys.path:
        sys.path.insert(0, od_dir)


def _add_dll_search_paths():
    """embed Python의 VC++ DLL을 torch 등에서 찾을 수 있도록 DLL 검색 경로 추가"""
    python_dir = os.path.dirname(sys.executable)
    od_dir = _get_od_packages_dir()
    # Windows 10 1607+ 에서 DLL 검색 경로 추가
    if hasattr(os, 'add_dll_directory'):
        for d in [python_dir, od_dir]:
            try:
                os.add_dll_directory(d)
            except OSError:
                pass
        # torch DLL 경로도 추가
        torch_lib = os.path.join(od_dir, 'torch', 'lib')
        if os.path.isdir(torch_lib):
            try:
                os.add_dll_directory(torch_lib)
            except OSError:
                pass
    # PATH에도 추가 (fallback)
    for d in [python_dir, od_dir]:
        if d not in os.environ.get('PATH', ''):
            os.environ['PATH'] = d + ';' + os.environ.get('PATH', '')


def _od_progress(step: str, detail: str):
    """OD 패키지 설치 진행상황을 stderr로 출력 (renderer에서 파싱)"""
    import json
    sys.stderr.write(f"[od-progress] {json.dumps({'step': 'setup', 'current': 0, 'total': 0, 'detail': detail})}\n")
    sys.stderr.flush()


def _is_in_od_dir(mod_name: str) -> bool:
    """모듈이 od-packages 경로에서 로드되었는지 확인"""
    import importlib.util
    od_dir = _get_od_packages_dir().lower()
    spec = importlib.util.find_spec(mod_name)
    if spec and spec.origin:
        return spec.origin.lower().startswith(od_dir)
    return False


def _cleanup_legacy_site_packages():
    """python-embed/Lib/site-packages에 남아있는 OD 관련 패키지 제거"""
    import shutil
    site_pkg = os.path.join(os.path.dirname(sys.executable), 'Lib', 'site-packages')
    if not os.path.isdir(site_pkg):
        return
    targets = ['torch', 'torchvision', 'torchaudio', 'doclayout_yolo',
               'huggingface_hub']
    for name in os.listdir(site_pkg):
        name_lower = name.lower()
        for t in targets:
            if name_lower == t or name_lower.startswith(t + '-') or name_lower.startswith(t + '.'):
                full = os.path.join(site_pkg, name)
                try:
                    if os.path.isdir(full):
                        shutil.rmtree(full, ignore_errors=True)
                    else:
                        os.remove(full)
                    sys.stderr.write(f"[od] legacy 정리: {full}\n")
                except Exception as e:
                    sys.stderr.write(f"[od] legacy 정리 실패: {full} — {e}\n")
                break


def _ensure_od_packages():
    """OD 기능에 필요한 패키지 누락 시 %APPDATA%/AUZA-v2/od-packages/에 자동 설치"""
    od_dir = _get_od_packages_dir()
    _ensure_od_site_path()

    # 0. legacy site-packages 정리 (업그레이드 시 1회)
    _cleanup_legacy_site_packages()

    # 1. torch 확인 — od-packages 경로에서 로드되는지까지 검증
    torch_ok = False
    try:
        import torch
        if torch.version.cuda is not None:
            sys.stderr.write("[od] CUDA torch detected, replacing with CPU\n")
        elif not _is_in_od_dir('torch'):
            sys.stderr.write(f"[od] torch가 od-packages 밖에서 로드됨: {getattr(torch, '__file__', '?')}, 재설치\n")
        else:
            torch_ok = True
            sys.stderr.write("[od] PyTorch CPU OK\n")
    except Exception as e:
        sys.stderr.write(f"[od] torch import failed: {e}\n")

    if not torch_ok:
        _od_progress('setup', 'PyTorch CPU 설치 중... (첫 실행 시 5~10분 소요)')
        # 기존 설치 제거
        subprocess.call(
            [sys.executable, '-m', 'pip', 'uninstall', '-y',
             'torch', 'torchvision', 'torchaudio'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        # od-packages 내 잔재도 정리
        import shutil
        for name in os.listdir(od_dir):
            if name.lower().startswith(('torch', 'torchvision', 'torchaudio')):
                full = os.path.join(od_dir, name)
                shutil.rmtree(full, ignore_errors=True) if os.path.isdir(full) else os.remove(full)

        subprocess.check_call(
            [sys.executable, '-m', 'pip', 'install', '--quiet',
             '--force-reinstall', '--target', od_dir,
             'torch', 'torchvision',
             '--index-url', 'https://download.pytorch.org/whl/cpu'],
            stdout=subprocess.DEVNULL,
        )
        # smoke test
        try:
            import importlib
            importlib.invalidate_caches()
            # 기존 모듈 캐시 제거 후 재로드
            for m in list(sys.modules.keys()):
                if m == 'torch' or m.startswith('torch.'):
                    del sys.modules[m]
            __import__('torch')
            _od_progress('setup', 'PyTorch CPU 설치 완료')
        except Exception as e:
            sys.stderr.write(f"[od] PyTorch CPU 설치 후에도 실패: {e}\n")
            raise

    # 2. huggingface_hub, doclayout-yolo 설치
    required = {
        'huggingface_hub': 'huggingface_hub',
        'doclayout_yolo': 'doclayout-yolo',
    }
    missing = []
    for mod, pkg in required.items():
        try:
            __import__(mod)
            if not _is_in_od_dir(mod):
                sys.stderr.write(f"[od] {mod}가 od-packages 밖에서 로드됨, 재설치\n")
                missing.append(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        _od_progress('setup', f'OD 패키지 설치 중: {", ".join(missing)}')
        subprocess.check_call(
            [sys.executable, '-m', 'pip', 'install', '--quiet',
             '--target', od_dir, *missing],
            stdout=subprocess.DEVNULL,
        )
        import importlib
        importlib.invalidate_caches()
        _od_progress('setup', 'OD 패키지 설치 완료')


def load_od_model():
    """DocLayout-YOLO 모델 로드 (HuggingFace에서 자동 다운로드)"""
    _add_dll_search_paths()
    _ensure_od_site_path()
    _ensure_od_packages()
    from huggingface_hub import hf_hub_download
    from doclayout_yolo import YOLOv10

    models_dir = Path(__file__).parent.parent / "models"
    models_dir.mkdir(exist_ok=True)
    model_path = hf_hub_download(
        repo_id=MODEL_REPO, filename=MODEL_FILE,
        repo_type="model", local_dir=str(models_dir),
    )
    sys.stderr.write(f"[od] 모델 로드: {model_path}\n")
    return YOLOv10(model_path)


def detect_regions_from_image(model, image_bytes: bytes) -> list:
    """PIL Image 바이트에서 영역 감지

    Args:
        model: 로드된 YOLO 모델
        image_bytes: PNG 이미지 바이트

    Returns:
        [{"label", "region", "score", "box_px": [x1,y1,x2,y2]}]
    """
    import io
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = img.size

    results = model.predict(img, conf=OD_CONF, verbose=False, imgsz=OD_IMGSZ)

    detections = []
    for r in results:
        boxes = r.boxes
        for i in range(len(boxes)):
            x1, y1, x2, y2 = boxes.xyxy[i].tolist()
            label = model.names[int(boxes.cls[i])]
            score = float(boxes.conf[i])
            region = OD_LABEL_MAP.get(label, "text")

            detections.append({
                "label": label,
                "region": region,
                "score": round(score, 3),
                "box_px": [round(x1), round(y1), round(x2), round(y2)],
            })

    sys.stderr.write(f"[od] {len(detections)} raw detections in {img_w}x{img_h} image\n")

    # 겹치는 영역 제거 (IoU 기반 NMS)
    detections = _remove_overlapping(detections)
    sys.stderr.write(f"[od] {len(detections)} detections after overlap removal\n")

    return detections


def _remove_overlapping(detections: list, iou_threshold: float = 0.3) -> list:
    """겹치는 영역 제거 — IoU가 threshold 이상이면 confidence 높은 것만 유지

    Args:
        detections: 감지 결과 리스트
        iou_threshold: 겹침 판정 기준 (0.3 = 30% 이상 겹치면 중복)

    Returns:
        중복 제거된 리스트
    """
    if len(detections) <= 1:
        return detections

    # confidence 내림차순 정렬
    sorted_dets = sorted(detections, key=lambda d: d["score"], reverse=True)
    keep = []

    while sorted_dets:
        best = sorted_dets.pop(0)
        keep.append(best)

        remaining = []
        for det in sorted_dets:
            if _calc_iou(best["box_px"], det["box_px"]) < iou_threshold:
                remaining.append(det)
            else:
                sys.stderr.write(
                    f"[od] 중복 제거: {det['region']}(score={det['score']}) "
                    f"← {best['region']}(score={best['score']})과 겹침\n"
                )
        sorted_dets = remaining

    return keep


def _calc_iou(box_a: list, box_b: list) -> float:
    """두 박스의 IoU(Intersection over Union) 계산

    또한 한 박스가 다른 박스에 대부분 포함되는 경우도 감지
    (작은 박스 면적 대비 교집합 비율도 반환값에 반영)
    """
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    # 교집합
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    if ix1 >= ix2 or iy1 >= iy2:
        return 0.0

    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)

    # 표준 IoU
    union = area_a + area_b - inter
    iou = inter / union if union > 0 else 0.0

    # 작은 박스가 큰 박스에 포함되는 비율 (containment ratio)
    min_area = min(area_a, area_b)
    containment = inter / min_area if min_area > 0 else 0.0

    # IoU 또는 containment 중 큰 값 사용
    return max(iou, containment)


def crop_region_from_image(pil_img, box_px: list, padding: int = 5) -> bytes:
    """PIL Image에서 특정 영역을 크롭하여 PNG 바이트 반환

    Args:
        pil_img: PIL Image 객체
        box_px: [x1, y1, x2, y2] 픽셀 좌표
        padding: 크롭 여백 (px)

    Returns:
        PNG 바이트
    """
    import io

    x1, y1, x2, y2 = box_px
    w, h = pil_img.size
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(w, x2 + padding)
    y2 = min(h, y2 + padding)

    cropped = pil_img.crop((x1, y1, x2, y2))
    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    return buf.getvalue()


def reclassify_boxed_text(pil_img, detections: list) -> list:
    """text 영역 중 글상자(테두리 또는 배경색 차이)가 감지되면 boxed_text로 재분류

    감지 방법 (OR 조건):
    1. 가장자리 edge 밀도: crop의 상하좌우 가장자리에 직선이 3변 이상 존재
    2. 배경색 차이: crop 내부 평균 밝기가 페이지 배경(255 근처)보다 현저히 어두움
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return detections

    import sys

    result = []
    for det in detections:
        det = dict(det)  # shallow copy
        if det.get("region") != "text":
            result.append(det)
            continue

        box = det["box_px"]
        x1, y1, x2, y2 = box
        img_w, img_h = pil_img.size

        # padding 포함 crop
        pad = 8
        cx1 = max(0, int(x1) - pad)
        cy1 = max(0, int(y1) - pad)
        cx2 = min(img_w, int(x2) + pad)
        cy2 = min(img_h, int(y2) + pad)

        crop = pil_img.crop((cx1, cy1, cx2, cy2))
        crop_np = np.array(crop)
        if crop_np.size == 0:
            result.append(det)
            continue

        gray = cv2.cvtColor(crop_np, cv2.COLOR_RGB2GRAY)
        crop_h, crop_w = gray.shape[:2]

        # 너무 작은 영역은 skip
        if crop_h < 40 or crop_w < 40:
            result.append(det)
            continue

        is_boxed = False
        reason = ""

        # ── 방법 1: 가장자리 edge 밀도 체크 ──
        strip = max(5, min(crop_h, crop_w) // 20)  # 가장자리 strip 두께
        edges = cv2.Canny(gray, 30, 100)

        # 상/하/좌/우 가장자리 strip에서 edge 비율 계산
        top_strip = edges[:strip, :]
        bot_strip = edges[-strip:, :]
        left_strip = edges[:, :strip]
        right_strip = edges[:, -strip:]

        def edge_ratio(strip_img):
            return np.count_nonzero(strip_img) / max(strip_img.size, 1)

        edge_threshold = 0.15  # 15% 이상 edge가 있으면 테두리 선으로 판단
        sides_with_border = sum(1 for s in [top_strip, bot_strip, left_strip, right_strip]
                                if edge_ratio(s) > edge_threshold)

        if sides_with_border >= 3:
            is_boxed = True
            reason = f"edge 감지 ({sides_with_border}변)"

        # ── 방법 2: 배경색 차이 ──
        if not is_boxed:
            # crop 내부 중앙 영역의 평균 밝기
            margin = max(strip + 2, 10)
            if crop_h > margin * 2 and crop_w > margin * 2:
                inner = gray[margin:-margin, margin:-margin]
                inner_mean = np.mean(inner)
                # 페이지 배경은 보통 250+ (흰색), 글상자 배경은 220 이하 (회색)
                if inner_mean < 235:
                    is_boxed = True
                    reason = f"배경색 차이 (밝기={inner_mean:.0f})"

        if is_boxed:
            det["region"] = "boxed_text"
            sys.stderr.write(
                f"[od-detector] 재분류: text → boxed_text ({reason}, box={box})\n"
            )

        result.append(det)

    return result


def sort_regions_reading_order(detections: list) -> list:
    """감지된 영역을 읽기 순서(위→아래, 같은 줄이면 왼→오른)로 정렬

    같은 줄 판정: y 중심점 차이가 영역 높이의 50% 이내
    """
    if not detections:
        return detections

    def sort_key(det):
        box = det["box_px"]
        cy = (box[1] + box[3]) / 2
        cx = (box[0] + box[2]) / 2
        return (cy, cx)

    sorted_dets = sorted(detections, key=sort_key)

    # 같은 줄 그룹핑: y 중심 차이가 영역 높이 50% 이내면 같은 줄
    result = []
    current_line = [sorted_dets[0]]

    for det in sorted_dets[1:]:
        prev = current_line[-1]
        prev_box = prev["box_px"]
        cur_box = det["box_px"]

        prev_cy = (prev_box[1] + prev_box[3]) / 2
        prev_h = prev_box[3] - prev_box[1]
        cur_cy = (cur_box[1] + cur_box[3]) / 2

        threshold = max(prev_h * 0.5, 20)  # 최소 20px

        if abs(cur_cy - prev_cy) <= threshold:
            current_line.append(det)
        else:
            # 이전 줄을 x 순서로 정렬 후 추가
            current_line.sort(key=lambda d: d["box_px"][0])
            result.extend(current_line)
            current_line = [det]

    # 마지막 줄
    current_line.sort(key=lambda d: d["box_px"][0])
    result.extend(current_line)

    return result
