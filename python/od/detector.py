"""DocLayout-YOLO OD 모델 로드 및 영역 감지 — docling_pj 적응"""

import sys
from pathlib import Path
from .constants import OD_CONF, OD_IMGSZ, MODEL_REPO, MODEL_FILE, OD_LABEL_MAP


def load_od_model():
    """DocLayout-YOLO 모델 로드 (HuggingFace에서 자동 다운로드)"""
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
