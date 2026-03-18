"""OD 레이아웃 분석 상수 — docling_pj에서 포팅"""

# OD 모델 설정
OD_CONF = 0.3           # confidence threshold
OD_IMGSZ = 1024         # 모델 입력 이미지 크기
MODEL_REPO = "juliozhao/DocLayout-YOLO-DocStructBench"
MODEL_FILE = "doclayout_yolo_docstructbench_imgsz1024.pt"

# 소형 캡처 OD 건너뛰기 기준 (px)
MIN_OD_SIZE = 200

# OD 라벨 → 캡처 분석용 region 매핑
OD_LABEL_MAP = {
    "title": "text",
    "Text": "text",
    "text": "text",
    "plain text": "text",
    "figure": "figure",
    "figure_caption": "text",
    "table": "table",
    "table_caption": "text",
    "table_footnote": "text",
    "isolate_formula": "formula",
    "formula_caption": "text",
    "abandon": "abandon",
    "header": "text",
    "footer": "text",
    "page-header": "text",
    "page-footer": "text",
    "footnote": "text",
    "reference": "text",
    "list-item": "text",
    "section-header": "text",
    "picture": "figure",
    "document index": "text",
    "code": "text",
}
