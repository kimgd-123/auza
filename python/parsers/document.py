"""공통 중간 구조 — HTML 파서 → Writer 전달용 dataclass"""

from dataclasses import dataclass, field
from typing import List, Optional, Literal


@dataclass
class MathEquation:
    """수식 데이터"""
    latex: str
    hwp_script: Optional[str] = None  # LaTeX → HWP 변환 결과 (None이면 이미지 fallback)
    is_block: bool = False  # True: $$...$$, False: $...$


@dataclass
class TextRun:
    """텍스트 런 (서식 단위)"""
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    color: Optional[str] = None  # hex color
    font_size: Optional[int] = None  # pt
    math: Optional[MathEquation] = None  # 수식이면 text 대신 이것 사용


@dataclass
class Paragraph:
    """문단"""
    runs: List[TextRun] = field(default_factory=list)
    align: Literal['left', 'center', 'right', 'justify'] = 'left'
    heading_level: int = 0  # 0=본문, 1-6=제목


@dataclass
class TableCell:
    """표 셀"""
    content: str  # HTML 또는 plain text
    colspan: int = 1
    rowspan: int = 1
    bg_color: Optional[str] = None  # hex
    bold: bool = False


@dataclass
class TableData:
    """표 데이터"""
    rows: List[List[TableCell]] = field(default_factory=list)
    col_count: int = 0


@dataclass
class ImageData:
    """이미지 데이터"""
    base64: str  # base64 인코딩된 이미지
    mime_type: str = 'image/png'
    alt: str = ''


@dataclass
class ContentItem:
    """문서 내 하나의 콘텐츠 아이템"""
    item_type: Literal['paragraph', 'table', 'math_block', 'image']
    paragraph: Optional[Paragraph] = None
    table: Optional[TableData] = None
    math: Optional[MathEquation] = None
    image: Optional[ImageData] = None


@dataclass
class DocumentStructure:
    """문서 전체 구조"""
    title: str = ''
    items: List[ContentItem] = field(default_factory=list)
