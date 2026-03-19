"""HWP COM 자동화 Writer

GetActiveObject로 실행 중인 한글에 연결하여 콘텐츠를 작성합니다.
PRD §4.6: 커서 위치 확인 → 블록 순서대로 텍스트/표/수식 삽입
"""

import sys
import re
from typing import Optional
from parsers.document import (
    DocumentStructure, ContentItem, Paragraph, TextRun,
    TableData, TableCell, MathEquation, ImageData,
)
from writers.base_writer import BaseWriter

# HWP 색상 변환: hex → RGB 정수
def _hex_to_rgb_int(hex_color: str) -> Optional[int]:
    """#RRGGBB → HWP RGB 정수 (0x00BBGGRR)"""
    if not hex_color:
        return None
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c * 2 for c in hex_color)
    if len(hex_color) < 6:
        return None
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return r | (g << 8) | (b << 16)


def _estimate_text_width_mm(text: str) -> float:
    """텍스트의 대략적 폭(mm)을 계산. 한글/CJK=3.5mm, 영문/숫자=2mm, 공백=1.5mm"""
    width = 0.0
    for ch in text:
        cp = ord(ch)
        if cp <= 0x7F:
            # ASCII: 영문/숫자/기호
            width += 1.5 if ch == ' ' else 2.0
        elif (0xAC00 <= cp <= 0xD7AF or   # 한글 음절
              0x3400 <= cp <= 0x9FFF or    # CJK 통합 한자
              0xF900 <= cp <= 0xFAFF):     # CJK 호환 한자
            width += 3.5
        else:
            width += 2.5  # 기타 유니코드
    return width


class HwpWriter(BaseWriter):
    def __init__(self):
        self._hwp = None
        self._hwp_setup_done = False  # write-time 설정(RegisterModule/Visible/FileNew) 완료 여부
        self._math_mappings = {}  # {latex: hwp_script} 표 셀 내 수식 변환용

    def _get_body_width(self, hwp) -> int:
        """현재 문서의 본문 영역 폭(HWPUNIT) 반환. 실패 시 A4 기본값(150mm) 사용"""
        hwp_per_mm = 7200 / 25.4
        fallback = int(150 * hwp_per_mm)
        try:
            act = hwp.CreateAction("PageSetup")
            pset = act.CreateSet()
            act.GetDefault(pset)
            pd = pset.Item("PageDef")
            paper_w = pd.Item("PaperWidth")
            left_m = pd.Item("LeftMargin")
            right_m = pd.Item("RightMargin")
            body_w = paper_w - left_m - right_m
            return body_w if body_w > 0 else fallback
        except Exception:
            return fallback

    def _get_column_width(self, hwp) -> int:
        """현재 커서 위치의 단(column) 너비(HWPUNIT) 반환. 1단이면 본문 너비와 동일."""
        body_w = self._get_body_width(hwp)
        try:
            act = hwp.CreateAction("MultiColumn")
            pset = act.CreateSet()
            act.GetDefault(pset)
            col_count = pset.Item("Count")
            if col_count and col_count > 1:
                same_gap = pset.Item("SameGap") or 0
                total_gap = same_gap * (col_count - 1)
                col_w = (body_w - total_gap) // col_count
                return col_w if col_w > 0 else body_w
        except Exception:
            pass
        return body_w

    def _get_hwp(self):
        """한글 프로그램에 연결 — 실행 중이면 연결, 없으면 자동 실행 + write-time 설정"""
        if self._hwp is not None and self._hwp_setup_done:
            return self._hwp

        import win32com.client

        if self._hwp is None:
            # 1. 이미 실행 중인 한글에 연결 시도
            try:
                self._hwp = win32com.client.GetActiveObject("HWPFrame.HwpObject.1")
            except Exception:
                # 2. 없으면 새로 실행
                try:
                    self._hwp = win32com.client.gencache.EnsureDispatch("HWPFrame.HwpObject.1")
                except Exception:
                    self._hwp = win32com.client.Dispatch("HWPFrame.HwpObject.1")

        # write-time 설정 (check_connection에서 캐시된 경우에도 실행)
        if not self._hwp_setup_done:
            # 보안 모듈 등록 시도
            try:
                self._hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
            except Exception:
                pass

            # 창 보이기 (Dispatch로 실행 시 숨겨진 상태일 수 있음)
            try:
                self._hwp.XHwpWindows.Item(0).Visible = True
            except Exception:
                pass

            # 새로 실행된 경우 빈 문서가 없으면 생성
            try:
                if self._hwp.XHwpDocuments.Count == 0:
                    self._hwp.HAction.Run("FileNew")
            except Exception:
                pass

            self._hwp_setup_done = True

        return self._hwp

    # 미연결 시 통일 메시지
    _DISCONNECTED_MSG = "한글 프로그램에 연결할 수 없습니다. 한글을 먼저 실행해주세요."

    def connect(self) -> dict:
        """사용자가 수동으로 한글 연결 — ROT 모니커로 기존 인스턴스에 연결"""
        try:
            import win32com.client
            import pythoncom

            # 기존 연결 초기화
            self._hwp = None
            self._hwp_setup_done = False

            hwp = None

            # 1차: GetActiveObject
            try:
                hwp = win32com.client.GetActiveObject("HWPFrame.HwpObject.1")
                sys.stderr.write("[hwp-writer] connect: GetActiveObject 성공\n")
            except Exception:
                pass

            # 2차: ROT 모니커에서 기존 HWP 인스턴스 검색
            if hwp is None:
                try:
                    rot = pythoncom.GetRunningObjectTable(0)
                    ctx = pythoncom.CreateBindCtx(0)
                    for moniker in rot.EnumRunning():
                        try:
                            name = moniker.GetDisplayName(ctx, None)
                            if 'HwpObject' in name:
                                obj = rot.GetObject(moniker)
                                hwp = win32com.client.Dispatch(
                                    obj.QueryInterface(pythoncom.IID_IDispatch)
                                )
                                sys.stderr.write(f"[hwp-writer] connect: ROT '{name}' 연결 성공\n")
                                break
                        except Exception:
                            continue
                except Exception as e:
                    sys.stderr.write(f"[hwp-writer] connect: ROT 검색 실패: {e}\n")

            if hwp is None:
                return {"connected": False, "error": self._DISCONNECTED_MSG}

            # 보안 모듈 등록
            try:
                hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
            except Exception:
                pass

            doc_count = hwp.XHwpDocuments.Count
            sys.stderr.write(f"[hwp-writer] connect: 문서 {doc_count}개\n")

            self._hwp = hwp
            self._hwp_setup_done = True
            return {"connected": True, "error": None}
        except Exception as e:
            sys.stderr.write(f"[hwp-writer] connect failed: {e}\n")
            self._hwp = None
            self._hwp_setup_done = False
            return {"connected": False, "error": self._DISCONNECTED_MSG}

    def check_connection(self) -> dict:
        """연결 확인 — passive probe. _hwp를 캐시하지만 write-time 설정은 안 함."""
        try:
            import win32com.client
            # 이미 연결된 인스턴스가 있으면 재검증
            if self._hwp is not None:
                try:
                    self._hwp.XHwpDocuments.Count
                    return {"connected": True, "error": None}
                except Exception:
                    self._hwp = None
                    self._hwp_setup_done = False

            # GetActiveObject만 시도
            hwp = win32com.client.GetActiveObject("HWPFrame.HwpObject.1")
            hwp.XHwpDocuments.Count  # 연결 검증
            self._hwp = hwp  # 캐시하여 check_cursor 등에서 재사용
            # _hwp_setup_done은 False 유지 → _get_hwp()에서 write-time 설정 수행
            return {"connected": True, "error": None}
        except Exception as e:
            sys.stderr.write(f"[hwp-writer] check_connection failed: {e}\n")
            self._hwp = None
            self._hwp_setup_done = False
            return {"connected": False, "error": self._DISCONNECTED_MSG}

    def check_cursor_position(self) -> dict:
        """커서가 문서 끝에 있는지 확인 (PRD §4.6.1) — 자동 실행 안 함"""
        try:
            if self._hwp is None:
                return {"at_end": False, "error": "한글이 연결되어 있지 않습니다. 먼저 연결을 확인해주세요."}
            hwp = self._hwp
            # 현재 위치 저장
            cur_pos = hwp.GetPos()
            # 문서 끝으로 이동
            act = hwp.CreateAction("MoveDocEnd")
            act.Run()
            end_pos = hwp.GetPos()
            # 원래 위치로 복원
            hwp.SetPos(*cur_pos)

            at_end = (cur_pos[0] == end_pos[0] and
                      cur_pos[1] == end_pos[1] and
                      cur_pos[2] == end_pos[2])
            return {"at_end": at_end, "error": None}
        except Exception as e:
            return {"at_end": False, "error": str(e)}

    def write(self, doc: DocumentStructure, math_mappings: dict = None) -> dict:
        """DocumentStructure를 활성 HWP 문서에 작성"""
        self._math_mappings = math_mappings or {}
        try:
            hwp = self._get_hwp()
            written = 0
            errors = []

            for i, item in enumerate(doc.items):
                try:
                    if item.item_type == 'paragraph' and item.paragraph:
                        self._write_paragraph(hwp, item.paragraph)
                        written += 1
                    elif item.item_type == 'table' and item.table:
                        self._write_table(hwp, item.table)
                        written += 1
                    elif item.item_type == 'image' and item.image:
                        self._write_image(hwp, item.image)
                        written += 1
                    elif item.item_type == 'math_block' and item.math:
                        self._write_equation(hwp, item.math)
                        written += 1
                except Exception as e:
                    errors.append(f"Item {i}: {str(e)}")
                    sys.stderr.write(f"[hwp-writer] Item {i} error: {e}\n")

            return {
                "success": len(errors) == 0,
                "written": written,
                "total": len(doc.items),
                "errors": errors if errors else None,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _write_paragraph(self, hwp, para: Paragraph):
        """문단 작성"""
        # 제목이면 스타일 적용
        if para.heading_level > 0:
            style_name = f"개요 {para.heading_level}"
            try:
                act = hwp.CreateAction("Style")
                pset = act.CreateSet()
                pset.SetItem("StyleName", style_name)
                act.Execute(pset)
            except Exception:
                pass  # 스타일 없으면 무시

        for run in para.runs:
            if run.math:
                self._write_equation(hwp, run.math)
            else:
                self._write_text_run(hwp, run)

        # 문단 끝 줄바꿈
        act = hwp.CreateAction("BreakPara")
        act.Run()

    def _write_text_run(self, hwp, run: TextRun):
        """서식이 적용된 텍스트 런 작성"""
        if not run.text:
            return

        # 서식 설정
        act = hwp.CreateAction("CharShape")
        pset = act.CreateSet()
        act.GetDefault(pset)

        if run.bold:
            pset.SetItem("Bold", 1)
        if run.italic:
            pset.SetItem("Italic", 1)
        if run.underline:
            pset.SetItem("UnderlineType", 1)
        if run.color:
            rgb = _hex_to_rgb_int(run.color)
            if rgb is not None:
                pset.SetItem("TextColor", rgb)
        if run.font_size:
            # HWP 폰트 크기: pt × 100
            pset.SetItem("Height", run.font_size * 100)

        act.Execute(pset)

        # 텍스트 삽입
        hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
        hwp.HParameterSet.HInsertText.Text = run.text
        hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)

    def _write_table(self, hwp, table: TableData):
        """표 작성"""
        row_count = len(table.rows)
        col_count = table.col_count or (max(sum(c.colspan for c in row) for row in table.rows) if table.rows else 1)

        # 각 열의 텍스트 폭(mm) 계산: 한글=3.5mm, 영문/숫자=2mm, 패딩 8mm
        col_max_mm = [0.0] * col_count
        for row in table.rows:
            actual_col = 0
            for cell in row:
                if actual_col < col_count:
                    content = re.sub(r'<[^>]+>', '', cell.content).strip()
                    width_mm = _estimate_text_width_mm(content) + 8  # 양쪽 패딩
                    col_max_mm[actual_col] = max(col_max_mm[actual_col], width_mm)
                actual_col += cell.colspan

        # HWP 단위 변환 — 현재 문서의 실제 본문 폭 사용
        hwp_per_mm = 7200 / 25.4
        page_width = self._get_body_width(hwp)
        min_col_width = int(12 * hwp_per_mm)  # 최소 열 폭 12mm

        col_widths = []
        for mm in col_max_mm:
            w = int(mm * hwp_per_mm)
            w = max(w, min_col_width)
            col_widths.append(w)

        total_width = sum(col_widths)
        # 페이지 폭 초과 시 비율로 축소
        if total_width > page_width:
            ratio = page_width / total_width
            col_widths = [int(w * ratio) for w in col_widths]
            total_width = sum(col_widths)

        row_height = int(8 * hwp_per_mm)  # 기본 행 높이 8mm

        # 페이지 폭을 콘텐츠 비율로 열 분배
        # col_widths 비율 → 페이지 폭 배분
        proportional_widths = []
        for w in col_widths:
            proportional_widths.append(int(page_width * w / total_width))
        # 반올림 오차 보정
        diff = page_width - sum(proportional_widths)
        if proportional_widths:
            proportional_widths[-1] += diff

        row_height = int(8 * hwp_per_mm)

        # TableCreate — CreateAction/CreateSet 패턴 사용
        # (HParameterSet은 Python에서 속성 접근 시 새 COM 래퍼를 생성하여
        #  ColWidth.SetItem 값이 실제 Execute에 전달되지 않는 버그가 있음)
        act = hwp.CreateAction("TableCreate")
        pset = act.CreateSet()
        act.GetDefault(pset)
        pset.SetItem("Rows", row_count)
        pset.SetItem("Cols", col_count)
        pset.SetItem("WidthType", 2)   # 단에 맞춤
        pset.SetItem("HeightType", 0)  # 자동
        pset.SetItem("WidthValue", page_width)

        # ColWidth — CreateItemArray 반환값을 캡처하여 안정적 참조 확보
        col_width_array = pset.CreateItemArray("ColWidth", col_count)
        for c in range(col_count):
            col_width_array.SetItem(c, proportional_widths[c])

        row_height_array = pset.CreateItemArray("RowHeight", row_count)
        for r in range(row_count):
            row_height_array.SetItem(r, row_height)

        tbl_props = pset.Item("TableProperties")
        tbl_props.SetItem("Width", page_width)
        tbl_props.SetItem("TreatAsChar", 0)
        pset.SetItem("TableProperties", tbl_props)

        act.Execute(pset)

        # 테이블 생성 직후 첫 셀(0,0)의 List ID 캡처
        base_pos = hwp.GetPos()
        base_list = base_pos[0]
        sys.stderr.write(f"[hwp-writer] Table {row_count}x{col_count}, base_list={base_list}\n")

        # ── 2-pass 방식: 그리드 구축 → 내용 채우기 → 병합 ──

        # 1단계: HTML 셀을 N×M 그리드에 매핑
        OCCUPIED = "occupied"
        grid = [[None] * col_count for _ in range(row_count)]
        merge_list = []  # (row, col, rowspan, colspan)

        for row_idx, row in enumerate(table.rows):
            actual_col = 0
            for cell in row:
                # rowspan/colspan으로 점유된 슬롯 건너뛰기
                while actual_col < col_count and grid[row_idx][actual_col] is not None:
                    actual_col += 1
                if actual_col >= col_count:
                    break

                # 셀 배치
                grid[row_idx][actual_col] = cell

                # 병합 영역 점유 등록
                if cell.rowspan > 1 or cell.colspan > 1:
                    merge_list.append((row_idx, actual_col, cell.rowspan, cell.colspan))
                    for dr in range(cell.rowspan):
                        for dc in range(cell.colspan):
                            if dr > 0 or dc > 0:
                                r, c = row_idx + dr, actual_col + dc
                                if r < row_count and c < col_count:
                                    grid[r][c] = OCCUPIED

                actual_col += cell.colspan

        # 2단계: 모든 N×M 셀을 순서대로 순회하며 내용 채우기
        # (HWP 테이블은 아직 병합 전이므로 모든 셀이 개별 존재)
        for row_idx in range(row_count):
            for col_idx in range(col_count):
                cell_data = grid[row_idx][col_idx]

                # 실제 셀 데이터가 있는 경우에만 내용 삽입
                if cell_data is not None and cell_data != OCCUPIED:
                    # 셀 배경색
                    if cell_data.bg_color:
                        try:
                            self._set_cell_bg(hwp, cell_data.bg_color)
                        except Exception:
                            pass

                    # 셀 내용 (HTML 태그 제거 후 텍스트+수식 분리 삽입)
                    content = re.sub(r'<[^>]+>', '', cell_data.content).strip()
                    if content:
                        if cell_data.bold:
                            act = hwp.CreateAction("CharShape")
                            pset = act.CreateSet()
                            act.GetDefault(pset)
                            pset.SetItem("Bold", 1)
                            act.Execute(pset)

                        self._insert_text_with_math(hwp, content)

                # 다음 셀로 이동 (마지막 셀 제외)
                is_last = (row_idx == row_count - 1 and col_idx == col_count - 1)
                if not is_last:
                    act = hwp.CreateAction("TableRightCell")
                    act.Run()

        # 3단계: 병합 수행 — SetPos로 셀 직접 이동 + 블록 확장
        sys.stderr.write(f"[hwp-writer] merge_list={merge_list}\n")
        for (r, c, rs, cs) in merge_list:
            try:
                self._merge_cells(hwp, r, c, rs, cs, base_list, col_count)
                sys.stderr.write(f"[hwp-writer] merged ({r},{c}) span=({rs},{cs}) OK\n")
            except Exception as e:
                sys.stderr.write(f"[hwp-writer] merge ({r},{c}) FAILED: {e}\n")

        # 표 밖으로 나가기
        act = hwp.CreateAction("TableLowerCell")
        act.Run()
        act = hwp.CreateAction("MoveDown")
        act.Run()

    def _merge_cells(self, hwp, row: int, col: int, rowspan: int, colspan: int,
                     base_list: int = 0, total_cols: int = 1):
        """셀 병합 — 현재 HWP COM 버전에서 프로그래밍 방식 셀 블록 선택이
        작동하지 않아 병합 미지원. 향후 HWP 업데이트 또는 대안 발견 시 구현."""
        # TODO: HWP COM에서 셀 블록 선택(TableCellBlock) 후 병합(TableMergeCell)이
        #       False를 반환하는 문제 해결 필요
        #       - SetPos + TableCellBlock: 블록 모드 진입은 True지만 실제 미작동
        #       - MoveSelDown/MoveDown: 블록 확장 실패 (False)
        #       - TableCellBlockExtend: F5 사이클링만 가능 (행→전체), 임의 범위 불가
        #       - hwp.TableCellBlock(r,c,er,ec): COM 타입 라이브러리에 미등록
        sys.stderr.write(f"[hwp-writer] merge skipped: ({row},{col}) span=({rowspan},{colspan}) — 미지원\n")

    def _insert_text_with_math(self, hwp, content: str):
        """텍스트 내 $...$ 수식을 감지하여 텍스트/수식을 분리 삽입"""
        # $$...$$ 블록 수식과 $...$ 인라인 수식 분리
        math_re = re.compile(r'\$\$([\s\S]+?)\$\$|\$([^$]+)\$')
        last_end = 0
        for match in math_re.finditer(content):
            # 수식 앞 텍스트
            before = content[last_end:match.start()]
            if before:
                hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
                hwp.HParameterSet.HInsertText.Text = before
                hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)

            # 수식 삽입 — mathMappings에서 HWP 스크립트 조회
            latex = match.group(1) or match.group(2)
            math_obj = MathEquation(latex=latex, is_block=(match.group(1) is not None))
            hwp_script = self._math_mappings.get(latex)
            if hwp_script:
                math_obj.hwp_script = hwp_script
            else:
                # 매핑 없으면 원본 LaTeX를 fallback으로 사용
                math_obj.hwp_script = latex
            self._write_equation(hwp, math_obj)
            last_end = match.end()

        # 남은 텍스트
        remaining = content[last_end:]
        if remaining:
            hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
            hwp.HParameterSet.HInsertText.Text = remaining
            hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)

    def _set_cell_bg(self, hwp, hex_color: str):
        """셀 배경색 설정 (TableCellBorderFill)"""
        rgb = _hex_to_rgb_int(hex_color)
        if rgb is None:
            return

        hwp.HAction.GetDefault("CellBorderFill", hwp.HParameterSet.HCellBorderFill.HSet)
        fill = hwp.HParameterSet.HCellBorderFill.FillAttr
        fill.SetItem("type", 1)  # 단색 채우기
        fill.SetItem("WindowBrush", rgb)
        hwp.HAction.Execute("CellBorderFill", hwp.HParameterSet.HCellBorderFill.HSet)

    def _write_image(self, hwp, image: ImageData):
        """이미지 삽입 — base64 → 본문 너비에 맞춰 리사이즈 → 임시 파일 → InsertFile

        Raises:
            Exception: base64 디코딩 실패 또는 COM InsertFile 실패 시
        """
        import base64
        import tempfile
        import os
        import io
        from PIL import Image

        # base64 → 임시 PNG 파일
        img_bytes = base64.b64decode(image.base64)

        tmp_path = None
        try:
            fd, tmp_path = tempfile.mkstemp(suffix='.png', prefix='auza_img_')
            os.write(fd, img_bytes)
            os.close(fd)

            # 1단계: InsertFile로 이미지 삽입
            hwp.HAction.GetDefault("InsertFile", hwp.HParameterSet.HInsertFile.HSet)
            hwp.HParameterSet.HInsertFile.filename = tmp_path
            hwp.HParameterSet.HInsertFile.KeepSection = 0
            result = hwp.HAction.Execute("InsertFile", hwp.HParameterSet.HInsertFile.HSet)

            if not result:
                raise RuntimeError(f"InsertFile(image) COM 호출 실패: {tmp_path}")

            # 2단계: 삽입된 이미지를 단 너비에 맞춰 리사이즈
            import time
            time.sleep(0.2)
            target_w = self._get_column_width(hwp)

            try:
                hwp.HAction.Run("MoveLeft")
                hwp.HAction.Run("SelectCtrlFront")
                time.sleep(0.1)
                ctrl = hwp.CurSelectedCtrl
                if ctrl:
                    props = ctrl.Properties
                    cur_w = props.Item("Width")
                    cur_h = props.Item("Height")
                    if cur_w > 0 and cur_w > target_w:
                        ratio = target_w / cur_w
                        new_h = int(cur_h * ratio)
                        props.SetItem("Width", target_w)
                        props.SetItem("Height", new_h)
                        ctrl.Properties = props
                        sys.stderr.write(f"[hwp-writer] image resized: "
                                         f"{cur_w}x{cur_h} → {target_w}x{new_h} HWPUNIT "
                                         f"({target_w*25.4/7200:.0f}x{new_h*25.4/7200:.0f}mm)\n")
                    hwp.HAction.Run("Cancel")
                    # 이미지 뒤로 커서 이동
                    hwp.HAction.Run("MoveRight")
            except Exception as e:
                sys.stderr.write(f"[hwp-writer] image resize failed: {e}\n")
                try:
                    hwp.HAction.Run("Cancel")
                except Exception:
                    pass

        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    def _write_equation(self, hwp, math: MathEquation):
        """수식 삽입 (EquEdit 액션)"""
        hwp_script = math.hwp_script
        if not hwp_script:
            # HWP 스크립트가 없으면 LaTeX 원문을 텍스트로 삽입
            hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
            hwp.HParameterSet.HInsertText.Text = f"[수식: {math.latex}]"
            hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)
            return

        sys.stderr.write(f"[hwp-writer] Equation: latex='{math.latex[:40]}' → hwp='{hwp_script[:40]}'\n")

        # EquationCreate — 새 수식 삽입 (EquEdit은 기존 수식 편집용이라 실패함)
        try:
            pset = hwp.HParameterSet.HEqEdit
            hwp.HAction.GetDefault("EquationCreate", pset.HSet)
            pset.string = hwp_script
            pset.EqFontName = "HancomEQN"
            pset.BaseUnit = hwp.PointToHwpUnit(10.0)
            r = hwp.HAction.Execute("EquationCreate", pset.HSet)
            if not r:
                sys.stderr.write(f"[hwp-writer] EquationCreate FAILED: '{hwp_script[:60]}'\n")
        except Exception as e:
            sys.stderr.write(f"[hwp-writer] EquationCreate ERROR: {e}\n")
