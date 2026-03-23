"""
Generation IR JSON → DocumentStructure 변환

Phase 10: Gemini가 출력한 schema-validated JSON(Generation IR)을
기존 DocumentStructure로 변환하여 hwp_writer에 그대로 전달.
"""

import sys
from typing import List, Optional

from parsers.document import (
    DocumentStructure,
    ContentItem,
    Paragraph,
    TextRun,
    MathEquation,
    TableData,
    TableCell,
    ImageData,
)


def parse_generation_ir(ir_json: dict, assets: dict = None) -> DocumentStructure:
    """
    Generation IR JSON → DocumentStructure 변환

    Args:
        ir_json: Gemini가 출력한 HWP Generation IR JSON
        assets: Asset Store에서 전달된 {asset_id: base64} 매핑

    Returns:
        DocumentStructure — 기존 hwp_writer.write()에 그대로 전달 가능
    """
    if assets is None:
        assets = {}

    ir_type = ir_json.get("type", "hwp")
    if ir_type != "hwp":
        raise ValueError(f"지원하지 않는 IR 타입: {ir_type} (현재 hwp만 지원)")

    sections = ir_json.get("sections", [])
    if not sections:
        return DocumentStructure(title="", items=[])

    all_items: List[ContentItem] = []
    title = sections[0].get("title", "") if sections else ""

    for section in sections:
        section_title = section.get("title", "")
        # 섹션 제목을 heading으로 추가
        if section_title:
            all_items.append(ContentItem(
                item_type="paragraph",
                paragraph=Paragraph(
                    runs=[TextRun(text=section_title, bold=True)],
                    heading_level=1,
                ),
            ))

        items = section.get("items", [])
        for item in items:
            converted = _convert_item(item, assets)
            if converted:
                all_items.extend(converted)

    return DocumentStructure(title=title, items=all_items)


def _convert_item(item: dict, assets: dict) -> List[ContentItem]:
    """개별 IR 아이템 → ContentItem(s) 변환"""
    item_type = item.get("type", "")

    if item_type == "paragraph":
        return [_convert_paragraph(item)]
    elif item_type == "heading":
        return [_convert_heading(item)]
    elif item_type == "math_block":
        return [_convert_math_block(item)]
    elif item_type == "math_inline":
        return [_convert_math_inline(item)]
    elif item_type == "table":
        return [_convert_table(item)]
    elif item_type == "image":
        result = _convert_image(item, assets)
        return [result] if result else []
    elif item_type == "list":
        return _convert_list(item)
    else:
        sys.stderr.write(f"[generation_ir_parser] 미지원 아이템 타입: {item_type}\n")
        return []


def _convert_paragraph(item: dict) -> ContentItem:
    """IR paragraph → ContentItem"""
    runs = []
    for run_data in item.get("runs", []):
        text = run_data.get("text", "")
        runs.append(TextRun(
            text=text,
            bold=run_data.get("bold", False),
            italic=run_data.get("italic", False),
            underline=run_data.get("underline", False),
            color=run_data.get("color"),
            font_size=run_data.get("fontSize"),
        ))

    return ContentItem(
        item_type="paragraph",
        paragraph=Paragraph(runs=runs),
    )


def _convert_heading(item: dict) -> ContentItem:
    """IR heading → ContentItem (heading_level이 있는 paragraph)"""
    level = item.get("level", 1)
    text = item.get("text", "")

    return ContentItem(
        item_type="paragraph",
        paragraph=Paragraph(
            runs=[TextRun(text=text, bold=True)],
            heading_level=min(level, 6),
        ),
    )


def _convert_math_block(item: dict) -> ContentItem:
    """IR math_block → ContentItem"""
    latex = item.get("latex", "")
    # $$...$$ 래퍼 제거
    if latex.startswith("$$") and latex.endswith("$$"):
        latex = latex[2:-2].strip()

    return ContentItem(
        item_type="math_block",
        math=MathEquation(latex=latex, is_block=True),
    )


def _convert_math_inline(item: dict) -> ContentItem:
    """IR math_inline → paragraph 내 수식 런"""
    latex = item.get("latex", "")
    if latex.startswith("$") and latex.endswith("$"):
        latex = latex[1:-1].strip()

    return ContentItem(
        item_type="paragraph",
        paragraph=Paragraph(runs=[
            TextRun(text="", math=MathEquation(latex=latex, is_block=False)),
        ]),
    )


def _convert_table(item: dict) -> ContentItem:
    """IR table → ContentItem"""
    rows_data = item.get("rows", [])
    rows: List[List[TableCell]] = []
    max_cols = 0

    for row_data in rows_data:
        cells: List[TableCell] = []
        for cell_data in row_data:
            if isinstance(cell_data, str):
                # 단순 문자열 셀
                cells.append(TableCell(content=cell_data))
            elif isinstance(cell_data, dict):
                cells.append(TableCell(
                    content=cell_data.get("text", ""),
                    colspan=cell_data.get("colspan", 1),
                    rowspan=cell_data.get("rowspan", 1),
                    bg_color=cell_data.get("bg_color"),
                    bold=cell_data.get("bold", False),
                    align=cell_data.get("align", "left"),
                ))
            else:
                cells.append(TableCell(content=str(cell_data)))

        max_cols = max(max_cols, len(cells))
        rows.append(cells)

    return ContentItem(
        item_type="table",
        table=TableData(rows=rows, col_count=max_cols),
    )


def _convert_image(item: dict, assets: dict) -> Optional[ContentItem]:
    """IR image → ContentItem (Asset Store에서 base64 조회)"""
    ref = item.get("ref", "")
    alt = item.get("alt", "")

    base64_data = assets.get(ref, "")
    if not base64_data:
        sys.stderr.write(f"[generation_ir_parser] Asset 미발견: {ref}\n")
        # base64가 없으면 플레이스홀더 텍스트로 대체
        return ContentItem(
            item_type="paragraph",
            paragraph=Paragraph(runs=[
                TextRun(text=f"[이미지: {ref}] {alt}", italic=True),
            ]),
        )

    return ContentItem(
        item_type="image",
        image=ImageData(base64=base64_data, alt=alt),
    )


def _convert_list(item: dict) -> List[ContentItem]:
    """IR list → paragraph 목록 (번호/불릿)"""
    ordered = item.get("ordered", False)
    items_text = item.get("items", [])
    result: List[ContentItem] = []

    for i, text in enumerate(items_text):
        prefix = f"{i + 1}. " if ordered else "• "
        result.append(ContentItem(
            item_type="paragraph",
            paragraph=Paragraph(runs=[
                TextRun(text=prefix + text),
            ]),
        ))

    return result
