"""HTML → DocumentStructure 변환

TipTap 에디터에서 직렬화된 HTML을 파싱하여 DocumentStructure로 변환합니다.
"""

import re
from typing import List, Optional
from bs4 import BeautifulSoup, Tag, NavigableString
from parsers.document import (
    DocumentStructure, ContentItem, Paragraph, TextRun,
    TableData, TableCell, MathEquation, ImageData,
)

# 수식 패턴: $$...$$ 블록 우선, $...$ 인라인 (결합 regex로 오버랩 방지)
COMBINED_MATH_RE = re.compile(r'\$\$([\s\S]+?)\$\$|\$([^$]+)\$')
BLOCK_MATH_RE = re.compile(r'\$\$([\s\S]+?)\$\$')


def parse_html(html: str, title: str = '') -> DocumentStructure:
    """HTML 문자열을 DocumentStructure로 변환"""
    soup = BeautifulSoup(html, 'html.parser')
    doc = DocumentStructure(title=title)

    for element in soup.children:
        if isinstance(element, NavigableString):
            text = str(element).strip()
            if text:
                doc.items.append(_text_to_item(text))
            continue

        if not isinstance(element, Tag):
            continue

        tag = element.name.lower()

        if tag == 'img':
            img_item = _parse_image(element)
            if img_item:
                doc.items.append(img_item)
            continue
        elif tag == 'table':
            table_item = _parse_table(element)
            if table_item:
                doc.items.append(table_item)
        elif tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            level = int(tag[1])
            para = _parse_paragraph(element, heading_level=level)
            doc.items.append(ContentItem(item_type='paragraph', paragraph=para))
        elif tag in ('p', 'div', 'blockquote', 'li'):
            # 블록 안에 <img>가 있으면 이미지를 먼저 추출
            _extract_nested_images(element, doc)
            para = _parse_paragraph(element)
            # 이미지만 있고 텍스트가 없는 경우 빈 문단 생략
            if para.runs or not element.find('img'):
                doc.items.append(ContentItem(item_type='paragraph', paragraph=para))
        elif tag in ('ul', 'ol'):
            for li in element.find_all('li', recursive=False):
                para = _parse_paragraph(li)
                doc.items.append(ContentItem(item_type='paragraph', paragraph=para))
        else:
            # 기타 태그는 텍스트 추출
            text = element.get_text(strip=True)
            if text:
                doc.items.append(_text_to_item(text))

    return doc


def _text_to_item(text: str) -> ContentItem:
    """일반 텍스트를 ContentItem으로"""
    # 블록 수식 체크
    block_match = BLOCK_MATH_RE.match(text.strip())
    if block_match:
        return ContentItem(
            item_type='math_block',
            math=MathEquation(latex=block_match.group(1), is_block=True),
        )

    para = Paragraph(runs=[TextRun(text=text)])
    return ContentItem(item_type='paragraph', paragraph=para)


def _parse_paragraph(element: Tag, heading_level: int = 0) -> Paragraph:
    """HTML 요소를 Paragraph로 변환"""
    align = 'left'
    style = element.get('style', '')
    if 'text-align: center' in style or 'text-align:center' in style:
        align = 'center'
    elif 'text-align: right' in style or 'text-align:right' in style:
        align = 'right'

    runs = _extract_runs(element)
    return Paragraph(runs=runs, align=align, heading_level=heading_level)


def _extract_runs(element: Tag) -> List[TextRun]:
    """HTML 요소에서 TextRun 리스트 추출"""
    runs: List[TextRun] = []

    for child in element.children:
        if isinstance(child, NavigableString):
            text = str(child)
            if text.strip():
                # 인라인 수식 체크
                _split_math_runs(text, runs)
            continue

        if not isinstance(child, Tag):
            continue

        tag = child.name.lower()
        text = child.get_text()

        if not text.strip():
            continue

        bold = tag in ('b', 'strong') or _has_parent_tag(child, ('b', 'strong'))
        italic = tag in ('i', 'em') or _has_parent_tag(child, ('i', 'em'))
        underline = tag == 'u' or _has_parent_tag(child, ('u',))

        color = _extract_color(child)
        font_size = _extract_font_size(child)

        if tag == 'span':
            # span 안에 중첩된 서식 확인
            inner_runs = _extract_runs(child)
            for run in inner_runs:
                run.color = run.color or color
                run.font_size = run.font_size or font_size
                runs.append(run)
        else:
            _split_math_runs(text, runs, bold=bold, italic=italic,
                             underline=underline, color=color, font_size=font_size)

    return runs


def _split_math_runs(text: str, runs: List[TextRun],
                     bold: bool = False, italic: bool = False,
                     underline: bool = False, color: Optional[str] = None,
                     font_size: Optional[int] = None):
    """텍스트에서 블록/인라인 수식을 분리하여 TextRun으로 추가 ($$...$$ 우선)"""
    last_end = 0
    for match in COMBINED_MATH_RE.finditer(text):
        # 수식 앞 텍스트
        before = text[last_end:match.start()]
        if before:
            runs.append(TextRun(text=before, bold=bold, italic=italic,
                                underline=underline, color=color, font_size=font_size))
        # 수식: group(1)=블록($$), group(2)=인라인($)
        latex = match.group(1) or match.group(2)
        is_block = match.group(1) is not None
        runs.append(TextRun(
            text='',
            math=MathEquation(latex=latex, is_block=is_block),
        ))
        last_end = match.end()

    # 남은 텍스트
    remaining = text[last_end:]
    if remaining:
        runs.append(TextRun(text=remaining, bold=bold, italic=italic,
                            underline=underline, color=color, font_size=font_size))


def _extract_nested_images(element: Tag, doc: DocumentStructure):
    """블록 요소 안에 중첩된 <img> 태그를 찾아 doc.items에 추가"""
    for img in element.find_all('img', recursive=True):
        img_item = _parse_image(img)
        if img_item:
            doc.items.append(img_item)


def _parse_image(element: Tag) -> Optional[ContentItem]:
    """<img src="data:image/...;base64,..."> 를 ImageData로 변환"""
    src = element.get('src', '')
    alt = element.get('alt', '')

    if not src:
        return None

    # data URI 파싱: data:image/png;base64,xxxxx
    data_prefix = 'data:'
    if src.startswith(data_prefix):
        # data:image/png;base64,... 형태
        try:
            meta, base64_data = src.split(',', 1)
            # meta = "data:image/png;base64"
            mime_type = meta.split(';')[0].replace('data:', '')
        except (ValueError, IndexError):
            return None

        return ContentItem(
            item_type='image',
            image=ImageData(
                base64=base64_data,
                mime_type=mime_type,
                alt=alt,
            ),
        )

    # 외부 URL 이미지는 무시 (보안)
    return None


def _parse_table(element: Tag) -> Optional[ContentItem]:
    """HTML <table>을 TableData로 변환"""
    rows: List[List[TableCell]] = []
    max_cols = 0

    for tr in element.find_all('tr'):
        cells: List[TableCell] = []
        for td in tr.find_all(['td', 'th']):
            colspan = int(td.get('colspan', 1))
            rowspan = int(td.get('rowspan', 1))
            bg_color = _extract_bg_color(td)
            align = _extract_text_align(td)
            content = td.decode_contents()  # 내부 HTML 유지
            is_header = td.name == 'th'
            cells.append(TableCell(
                content=content,
                colspan=colspan,
                rowspan=rowspan,
                bg_color=bg_color,
                bold=is_header,
                align=align,
            ))
        if cells:
            rows.append(cells)
            col_count = sum(c.colspan for c in cells)
            if col_count > max_cols:
                max_cols = col_count

    if not rows:
        return None

    return ContentItem(
        item_type='table',
        table=TableData(rows=rows, col_count=max_cols),
    )


def _has_parent_tag(element: Tag, tag_names: tuple) -> bool:
    """부모 중 특정 태그가 있는지 확인"""
    parent = element.parent
    while parent and isinstance(parent, Tag):
        if parent.name.lower() in tag_names:
            return True
        parent = parent.parent
    return False


def _extract_color(element: Tag) -> Optional[str]:
    """style에서 color 추출"""
    style = element.get('style', '')
    match = re.search(r'(?<![bg-])color:\s*(#[0-9a-fA-F]{3,8}|rgb[^)]+\))', style)
    if match:
        return match.group(1)
    return None


def _extract_font_size(element: Tag) -> Optional[int]:
    """style에서 font-size 추출 → pt 단위로 반환. px인 경우 pt로 변환."""
    style = element.get('style', '')
    match = re.search(r'font-size:\s*(\d+(?:\.\d+)?)\s*(px|pt|em|rem)?', style)
    if match:
        size = float(match.group(1))
        unit = match.group(2) or 'px'
        if unit == 'px':
            # px → pt 변환 (1px = 0.75pt at 96 DPI)
            return max(1, round(size * 72 / 96))
        elif unit in ('em', 'rem'):
            # em/rem → pt (기본 16px = 12pt 기준)
            return max(1, round(size * 12))
        else:
            return max(1, round(size))  # pt
    return None


def _extract_text_align(element: Tag) -> str:
    """style에서 text-align 추출 (기본 left). 자식 <p>의 정렬도 확인."""
    # 직접 style 확인
    style = element.get('style', '')
    if 'text-align: center' in style or 'text-align:center' in style:
        return 'center'
    elif 'text-align: right' in style or 'text-align:right' in style:
        return 'right'
    # 자식 <p>의 style 확인 (TipTap이 <td><p style="text-align:center">로 직렬화)
    first_p = element.find('p')
    if first_p and isinstance(first_p, Tag):
        p_style = first_p.get('style', '')
        if 'text-align: center' in p_style or 'text-align:center' in p_style:
            return 'center'
        elif 'text-align: right' in p_style or 'text-align:right' in p_style:
            return 'right'
    return 'left'


def _extract_bg_color(element: Tag) -> Optional[str]:
    """style에서 background-color 추출"""
    style = element.get('style', '')
    match = re.search(r'background-color:\s*(#[0-9a-fA-F]{3,8}|rgb[^)]+\))', style)
    if match:
        return match.group(1)
    return None
