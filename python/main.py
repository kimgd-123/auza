#!/usr/bin/env python3
"""
AUZA Python 백엔드 — stdin/stdout JSON IPC

Electron Main 프로세스에서 child_process로 실행되며,
stdin으로 JSON 명령을 받고 stdout으로 JSON 결과를 반환합니다.

프로토콜:
  요청: {"id": "...", "command": "...", "payload": {...}}
  응답: {"id": "...", "success": bool, "data": {...}, "error": str|None}
"""

import sys
import os
import json
import traceback
import subprocess

# python/ 디렉토리를 sys.path에 추가하여 절대 임포트 지원
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _ensure_packages():
    """필수 패키지 누락 시 자동 설치"""
    required = {
        'bs4': 'beautifulsoup4',
        'win32com': 'pywin32',
        'PIL': 'Pillow',
        'google.genai': 'google-genai',
        'fitz': 'PyMuPDF',
    }
    missing = []
    for mod, pkg in required.items():
        try:
            __import__(mod)
        except ImportError:
            missing.append(pkg)

    if missing:
        sys.stderr.write(f"[python] 누락 패키지 설치 중: {', '.join(missing)}\n")
        subprocess.check_call(
            [sys.executable, '-m', 'pip', 'install', '--quiet', *missing],
            stdout=subprocess.DEVNULL,
        )
        sys.stderr.write(f"[python] 패키지 설치 완료\n")


_ensure_packages()

from utils.config import log


_hwp_writer = None
_od_model = None

def _get_hwp_writer():
    """HwpWriter 싱글턴 — 동일 한글 인스턴스 재사용"""
    global _hwp_writer
    if _hwp_writer is None:
        from writers.hwp_writer import HwpWriter
        _hwp_writer = HwpWriter()
    return _hwp_writer


def _get_od_model():
    """OD 모델 싱글턴 — 첫 호출 시 로드, 이후 재사용"""
    global _od_model
    if _od_model is None:
        from od.detector import load_od_model
        log("OD 모델 로딩 중...")
        _od_model = load_od_model()
        log("OD 모델 로드 완료")
    return _od_model


def handle_command(command: str, payload: dict) -> dict:
    """명령 디스패치"""

    if command == 'ping':
        return {"pong": True}

    elif command == 'ensure_od_packages':
        # 앱 시작 시 OD 패키지 사전 설치
        try:
            from od.detector import _add_dll_search_paths, _ensure_od_packages
            _add_dll_search_paths()
            _ensure_od_packages()
            return {"installed": True, "error": None}
        except Exception as e:
            return {"installed": False, "error": str(e)}

    elif command == 'check_hwp':
        return _get_hwp_writer().check_connection()

    elif command == 'connect_hwp':
        return _get_hwp_writer().connect()

    elif command == 'check_cursor':
        return _get_hwp_writer().check_cursor_position()

    elif command == 'write_hwp':
        from parsers.html_parser import parse_html

        html = payload.get('html', '')
        title = payload.get('title', '')
        math_mappings = payload.get('mathMappings', {})  # {latex: hwpScript}

        doc = parse_html(html, title=title)

        # 디버그: mathMappings 키 목록
        sys.stderr.write(f"[write_hwp] mathMappings keys ({len(math_mappings)}): {list(math_mappings.keys())[:5]}\n")

        # 수식 HWP 스크립트 매핑 적용
        math_found = 0
        math_matched = 0
        for item in doc.items:
            if item.item_type == 'math_block' and item.math:
                math_found += 1
                hwp_script = math_mappings.get(item.math.latex)
                if hwp_script:
                    item.math.hwp_script = hwp_script
                    math_matched += 1
                else:
                    sys.stderr.write(f"[write_hwp] MISS block: '{item.math.latex[:50]}'\n")
            elif item.item_type == 'paragraph' and item.paragraph:
                for run in item.paragraph.runs:
                    if run.math:
                        math_found += 1
                        hwp_script = math_mappings.get(run.math.latex)
                        if hwp_script:
                            run.math.hwp_script = hwp_script
                            math_matched += 1
                        else:
                            sys.stderr.write(f"[write_hwp] MISS inline: '{run.math.latex[:50]}'\n")

        sys.stderr.write(f"[write_hwp] math: found={math_found}, matched={math_matched}\n")

        return _get_hwp_writer().write(doc, math_mappings=math_mappings)

    elif command == 'write_hwp_from_ir':
        from parsers.generation_ir_parser import parse_generation_ir

        ir_json = payload.get('irJson', {})
        math_mappings = payload.get('mathMappings', {})
        assets = payload.get('assets', {})  # {asset_id: base64}

        doc = parse_generation_ir(ir_json, assets=assets)

        # 수식 HWP 스크립트 매핑 적용
        for item in doc.items:
            if item.item_type == 'math_block' and item.math:
                hwp_script = math_mappings.get(item.math.latex)
                if hwp_script:
                    item.math.hwp_script = hwp_script
            elif item.item_type == 'paragraph' and item.paragraph:
                for run in item.paragraph.runs:
                    if run.math:
                        hwp_script = math_mappings.get(run.math.latex)
                        if hwp_script:
                            run.math.hwp_script = hwp_script

        return _get_hwp_writer().write(doc, math_mappings=math_mappings)

    elif command == 'fix_equation_width':
        from scripts.fix_equation_width import fix_equation_widths

        file_path = payload.get('filePath', '')
        output_path = payload.get('outputPath')
        delay = payload.get('delay', 0.5)
        limit = payload.get('limit', 0)

        return fix_equation_widths(file_path, output_path, delay, limit)

    elif command == 'extract_pdf_images':
        from od.pdf_image_extractor import extract_page_images

        pdf_path = payload.get('pdfPath', '')
        page_num = payload.get('pageNum', -1)

        if not pdf_path:
            return {"images": [], "error": "pdfPath가 필요합니다"}

        images = extract_page_images(pdf_path, page_num)
        return {"images": images, "error": None}

    elif command == 'od_analyze':
        from od.analyzer import analyze_capture

        image_base64 = payload.get('imageBase64', '')
        api_key = payload.get('apiKey', '')
        pdf_path = payload.get('pdfPath', '')
        page_num = payload.get('pageNum', -1)
        capture_bbox_norm = payload.get('captureBboxNorm')

        if not image_base64:
            return {"error": "imageBase64가 필요합니다"}
        if not api_key:
            return {"error": "apiKey가 필요합니다"}

        od_model = _get_od_model()
        return analyze_capture(
            image_base64, api_key, od_model,
            pdf_path=pdf_path, page_num=page_num,
            capture_bbox_norm=capture_bbox_norm,
        )

    elif command == 'od_detect':
        from od.analyzer import detect_only

        image_base64 = payload.get('imageBase64', '')
        if not image_base64:
            return {"error": "imageBase64가 필요합니다"}

        od_model = _get_od_model()
        return detect_only(image_base64, od_model)

    elif command == 'od_convert':
        from od.analyzer import convert_regions

        image_base64 = payload.get('imageBase64', '')
        detections = payload.get('detections', [])
        api_key = payload.get('apiKey', '')
        pdf_path = payload.get('pdfPath', '')
        page_num = payload.get('pageNum', -1)
        capture_bbox_norm = payload.get('captureBboxNorm')

        if not image_base64:
            return {"error": "imageBase64가 필요합니다"}
        if not api_key:
            return {"error": "apiKey가 필요합니다"}

        return convert_regions(
            image_base64, detections, api_key,
            pdf_path=pdf_path, page_num=page_num,
            capture_bbox_norm=capture_bbox_norm,
            trust_labels=True,  # 사용자가 리뷰에서 편집한 유형을 신뢰
        )

    else:
        return {"error": f"Unknown command: {command}"}


def main():
    log("Python 백엔드 시작")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = {"id": None, "success": False, "error": f"Invalid JSON: {e}"}
            print(json.dumps(response, ensure_ascii=False), flush=True)
            continue

        req_id = request.get('id')
        command = request.get('command', '')
        payload = request.get('payload', {})

        log(f"명령 수신: {command} (id={req_id})")

        try:
            result = handle_command(command, payload)
            success = result.get('success', True) if isinstance(result, dict) else True
            error = result.get('error') if isinstance(result, dict) else None

            response = {
                "id": req_id,
                "success": success if error is None else False,
                "data": result,
                "error": error,
            }
        except Exception as e:
            log(f"명령 실패: {command} — {traceback.format_exc()}")
            response = {
                "id": req_id,
                "success": False,
                "data": None,
                "error": str(e),
            }

        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
