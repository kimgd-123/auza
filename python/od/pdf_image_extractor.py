"""PDF 내장 이미지 추출 — PyMuPDF

OD figure 감지 시 화면 크롭 대신 PDF 원본 이미지를 사용.
"""

import sys
import io
import base64
from typing import Optional


def extract_page_images(pdf_path: str, page_num: int) -> list:
    """PDF 페이지에서 내장 이미지를 추출

    Args:
        pdf_path: PDF 파일 경로
        page_num: 0-based 페이지 번호

    Returns:
        [{"bbox_norm": [x1,y1,x2,y2], "base64": str, "width": int, "height": int}]
        bbox_norm: 페이지 크기 대비 정규화 좌표 (0.0~1.0)
    """
    import fitz

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        sys.stderr.write(f"[pdf-img] PDF 열기 실패: {e}\n")
        return []

    if page_num < 0 or page_num >= len(doc):
        doc.close()
        return []

    page = doc[page_num]
    page_w, page_h = page.rect.width, page.rect.height
    images = []
    seen_xrefs = set()

    for img_info in page.get_images(full=True):
        xref = img_info[0]
        if xref in seen_xrefs:
            continue
        seen_xrefs.add(xref)

        # 이미지 크기 필터 (너무 작은 장식 이미지 제외)
        w, h = img_info[2], img_info[3]
        if w < 30 or h < 30:
            continue

        # 이미지 위치
        try:
            rects = page.get_image_rects(xref)
        except Exception:
            continue

        for rect in rects:
            if rect.is_empty or rect.is_infinite:
                continue

            # 페이지 크롭으로 이미지 추출 (색상 정확도 보장)
            try:
                clip = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y1)
                mat = fitz.Matrix(3.0, 3.0)  # 3x 해상도 (고품질)
                pix = page.get_pixmap(matrix=mat, clip=clip)

                from PIL import Image
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

                # 정규화 좌표 (0.0~1.0)
                bbox_norm = [
                    rect.x0 / page_w,
                    rect.y0 / page_h,
                    rect.x1 / page_w,
                    rect.y1 / page_h,
                ]

                images.append({
                    "bbox_norm": bbox_norm,
                    "base64": img_b64,
                    "width": pix.width,
                    "height": pix.height,
                })
            except Exception as e:
                sys.stderr.write(f"[pdf-img] 이미지 추출 실패 xref={xref}: {e}\n")
                continue

    doc.close()
    sys.stderr.write(f"[pdf-img] page {page_num}: {len(images)} images extracted\n")
    return images


def find_matching_pdf_image(
    pdf_images: list,
    figure_box_norm: list,
    iou_threshold: float = 0.3,
) -> Optional[str]:
    """OD figure 영역과 가장 잘 매칭되는 PDF 이미지의 base64 반환

    Args:
        pdf_images: extract_page_images() 결과
        figure_box_norm: OD figure의 정규화 좌표 [x1,y1,x2,y2] (캡처 영역 내)
        iou_threshold: 최소 IoU

    Returns:
        매칭된 이미지의 base64 또는 None
    """
    best_iou = 0.0
    best_img = None

    for img in pdf_images:
        iou = _compute_iou(figure_box_norm, img["bbox_norm"])
        if iou > best_iou:
            best_iou = iou
            best_img = img

    if best_iou >= iou_threshold and best_img:
        sys.stderr.write(f"[pdf-img] figure matched: IoU={best_iou:.2f}, "
                         f"{best_img['width']}x{best_img['height']}px\n")
        return best_img["base64"]

    return None


def _compute_iou(box_a: list, box_b: list) -> float:
    """두 정규화 bbox의 IoU 계산"""
    xa = max(box_a[0], box_b[0])
    ya = max(box_a[1], box_b[1])
    xb = min(box_a[2], box_b[2])
    yb = min(box_a[3], box_b[3])

    inter = max(0, xb - xa) * max(0, yb - ya)
    if inter == 0:
        return 0.0

    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - inter

    return inter / union if union > 0 else 0.0
