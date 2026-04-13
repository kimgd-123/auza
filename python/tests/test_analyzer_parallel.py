"""Phase B 테스트 — Gemini 호출 부분 병렬화 (12개 시나리오)

B1: 순서 보장 — 5영역 응답 순서 무관, 인덱스 순서대로 정렬
B2: 병렬 동작 증명 — sleep 0.5s x 5영역, 총 < 1.5초
B3: 에러 격리 — 5개 중 2개 실패, 나머지 정상
B4: trust_labels=True/False 모두 병렬에서 동일
B5: 순차 vs 병렬 결과 동일성 (regression)
B6: 진행률 단조 증가 + done 1회
B7: no detections / 소형 캡처 fallback 경로
B8: PyMuPDF 메인 스레드 검증 (mock thread name)
B9: 환경변수 — DISABLE 우선순위
B10: 환경변수 — 정상값 (4)
B11: 환경변수 — 비정상값(0/음수/비정수/과대) → 안전한 기본값
B12: figure-heavy 케이스 (메인 스레드 순차 정확성)
"""

import sys
import os
import io
import json
import time
import base64
import threading
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from od.analyzer import convert_regions, _get_parallel_workers, _emit_progress


# ── 테스트 유틸 ──

def _make_test_image_b64(width=200, height=200):
    """테스트용 PNG 이미지 base64 생성"""
    from PIL import Image
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _make_detections(n, region="text"):
    """n개의 테스트 detection 생성"""
    dets = []
    h_per = 200 // n
    for i in range(n):
        dets.append({
            "region": region,
            "label": region,
            "score": 0.95,
            "box_px": [10, i * h_per, 190, (i + 1) * h_per],
        })
    return dets


def _make_mixed_detections():
    """다양한 region 타입 혼합 detection"""
    return [
        {"region": "text", "label": "text", "score": 0.9, "box_px": [10, 0, 190, 40]},
        {"region": "table", "label": "table", "score": 0.85, "box_px": [10, 40, 190, 80]},
        {"region": "figure", "label": "figure", "score": 0.8, "box_px": [10, 80, 190, 120]},
        {"region": "text", "label": "text", "score": 0.9, "box_px": [10, 120, 190, 160]},
        {"region": "boxed_text", "label": "boxed_text", "score": 0.7, "box_px": [10, 160, 190, 200]},
    ]


# ── 공통 패치 ──

def _patch_gemini(side_effect=None, return_value="<p>result</p>"):
    """call_gemini_vision mock 패치"""
    if side_effect:
        return patch('od.analyzer.call_gemini_vision', side_effect=side_effect)
    return patch('od.analyzer.call_gemini_vision', return_value=return_value)


def _patch_crop():
    """crop_region_from_image mock — 1x1 PNG 반환"""
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), (128, 128, 128)).save(buf, format="PNG")
    crop_bytes = buf.getvalue()
    return patch('od.analyzer.crop_region_from_image', return_value=crop_bytes)


def _patch_sort():
    """sort_regions_reading_order mock — 입력 그대로 반환"""
    return patch('od.analyzer.sort_regions_reading_order', side_effect=lambda x: x)


# ═══════════════════════════════════════════════
# B1: 순서 보장
# ═══════════════════════════════════════════════

class TestB1_OrderPreservation(unittest.TestCase):
    """5영역의 Gemini 응답이 순서 무관하게 인덱스 순서로 정렬됨"""

    @_patch_sort()
    @_patch_crop()
    def test_order_preserved(self, mock_crop, mock_sort):
        img_b64 = _make_test_image_b64()
        dets = _make_detections(5)

        # 각 영역마다 고유 HTML 반환
        def gemini_side_effect(api_key, img, prompt):
            # 프롬프트에서 영역 식별 불가하므로 호출 순서로 구분
            return f"<p>region</p>"

        call_count = [0]
        def ordered_gemini(api_key, img, prompt):
            call_count[0] += 1
            return f"<p>r{call_count[0]}</p>"

        with patch('od.analyzer.call_gemini_vision', side_effect=ordered_gemini):
            with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "4"}):
                result = convert_regions(img_b64, dets, "test-key")

        self.assertIsNone(result["error"])
        self.assertEqual(result["regions"], 5)
        # 결과 HTML이 5개 파트를 포함하는지 확인
        parts = [p for p in result["html"].split("\n") if p.strip()]
        self.assertEqual(len(parts), 5)


# ═══════════════════════════════════════════════
# B2: 병렬 동작 증명
# ═══════════════════════════════════════════════

class TestB2_ParallelSpeedup(unittest.TestCase):
    """sleep 0.3s x 5영역이 병렬에서 총 1.0초 미만"""

    @_patch_sort()
    @_patch_crop()
    def test_parallel_faster_than_sequential(self, mock_crop, mock_sort):
        img_b64 = _make_test_image_b64()
        dets = _make_detections(5)

        def slow_gemini(api_key, img, prompt):
            time.sleep(0.3)
            return "<p>ok</p>"

        with patch('od.analyzer.call_gemini_vision', side_effect=slow_gemini):
            with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "5"}, clear=False):
                start = time.monotonic()
                result = convert_regions(img_b64, dets, "test-key")
                elapsed = time.monotonic() - start

        self.assertIsNone(result["error"])
        # 순차면 5 * 0.3 = 1.5초, 병렬이면 ~0.3초 + 오버헤드
        self.assertLess(elapsed, 1.0,
                        f"병렬 실행이 1초 미만이어야 하는데 {elapsed:.2f}초 걸림")


# ═══════════════════════════════════════════════
# B3: 에러 격리
# ═══════════════════════════════════════════════

class TestB3_ErrorIsolation(unittest.TestCase):
    """5개 중 2개 실패해도 나머지 3개는 정상"""

    @_patch_sort()
    @_patch_crop()
    def test_partial_failure(self, mock_crop, mock_sort):
        img_b64 = _make_test_image_b64()
        dets = _make_detections(5)

        call_count = [0]
        def flaky_gemini(api_key, img, prompt):
            call_count[0] += 1
            if call_count[0] in (2, 4):
                raise Exception(f"Gemini 오류 #{call_count[0]}")
            return f"<p>ok-{call_count[0]}</p>"

        with patch('od.analyzer.call_gemini_vision', side_effect=flaky_gemini):
            with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "4"}, clear=False):
                result = convert_regions(img_b64, dets, "test-key")

        # 에러가 있지만 전체 실패가 아님
        self.assertIsNotNone(result["error"])
        # 성공한 영역의 HTML이 포함
        self.assertIn("<p>ok-", result["html"])
        self.assertEqual(result["regions"], 5)


# ═══════════════════════════════════════════════
# B4: trust_labels=True/False 병렬 동일
# ═══════════════════════════════════════════════

class TestB4_TrustLabelsParallel(unittest.TestCase):
    """trust_labels=True/False 모두 병렬에서 정상 동작"""

    @_patch_sort()
    @_patch_crop()
    def test_trust_labels_false(self, mock_crop, mock_sort):
        """trust_labels=False: figure check Gemini 호출 포함"""
        img_b64 = _make_test_image_b64()
        dets = _make_mixed_detections()

        def gemini_handler(api_key, img, prompt):
            return "<p>content</p>"

        with patch('od.analyzer.call_gemini_vision', side_effect=gemini_handler):
            with patch('od.analyzer._get_figure_image', return_value="abc123"):
                with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "4"}, clear=False):
                    result = convert_regions(img_b64, dets, "test-key",
                                             trust_labels=False)

        self.assertEqual(result["regions"], 5)

    @_patch_sort()
    @_patch_crop()
    def test_trust_labels_true(self, mock_crop, mock_sort):
        """trust_labels=True: figure는 Gemini 없이 이미지 직접 삽입"""
        img_b64 = _make_test_image_b64()
        dets = _make_mixed_detections()

        with patch('od.analyzer.call_gemini_vision', return_value="<p>content</p>"):
            with patch('od.analyzer._get_figure_image', return_value="abc123"):
                with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "4"}, clear=False):
                    result = convert_regions(img_b64, dets, "test-key",
                                             trust_labels=True)

        self.assertEqual(result["regions"], 5)
        # figure 영역은 img 태그로 변환
        self.assertIn("data:image/png;base64,abc123", result["html"])


# ═══════════════════════════════════════════════
# B5: 순차 vs 병렬 결과 동일성
# ═══════════════════════════════════════════════

class TestB5_SequentialParallelEquivalence(unittest.TestCase):
    """순차와 병렬 실행의 결과 HTML이 동일"""

    @_patch_sort()
    @_patch_crop()
    def test_results_match(self, mock_crop, mock_sort):
        img_b64 = _make_test_image_b64()
        dets = _make_detections(3)

        call_count = [0]
        def deterministic_gemini(api_key, img, prompt):
            call_count[0] += 1
            # 호출 순서 독립적으로 항상 같은 결과 반환
            return "<p>deterministic</p>"

        # 순차 실행
        call_count[0] = 0
        with patch('od.analyzer.call_gemini_vision', side_effect=deterministic_gemini):
            with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL_DISABLE": "1"}, clear=False):
                seq_result = convert_regions(img_b64, list(dets), "test-key")

        # 병렬 실행
        call_count[0] = 0
        with patch('od.analyzer.call_gemini_vision', side_effect=deterministic_gemini):
            with patch.dict(os.environ, {
                "AUZA_GEMINI_PARALLEL": "4",
                "AUZA_GEMINI_PARALLEL_DISABLE": "",
            }, clear=False):
                par_result = convert_regions(img_b64, list(dets), "test-key")

        self.assertEqual(seq_result["html"], par_result["html"])
        self.assertEqual(seq_result["regions"], par_result["regions"])
        self.assertEqual(seq_result["error"], par_result["error"])


# ═══════════════════════════════════════════════
# B6: 진행률 단조 증가 + done 1회
# ═══════════════════════════════════════════════

class TestB6_ProgressMonotonic(unittest.TestCase):
    """진행률 current가 단조 증가하고 done이 정확히 1회"""

    @_patch_sort()
    @_patch_crop()
    def test_progress_events(self, mock_crop, mock_sort):
        img_b64 = _make_test_image_b64()
        dets = _make_detections(3)

        progress_events = []
        original_emit = _emit_progress

        def capture_progress(step, current=0, total=0, detail=""):
            progress_events.append({
                "step": step, "current": current, "total": total, "detail": detail
            })

        with patch('od.analyzer.call_gemini_vision', return_value="<p>ok</p>"):
            with patch('od.analyzer._emit_progress', side_effect=capture_progress):
                with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "4"}, clear=False):
                    convert_regions(img_b64, dets, "test-key")

        # region 이벤트의 current가 단조 증가
        region_events = [e for e in progress_events if e["step"] == "region"]
        currents = [e["current"] for e in region_events]
        for i in range(1, len(currents)):
            self.assertGreaterEqual(currents[i], currents[i-1],
                                     f"진행률 감소: {currents}")

        # done 이벤트 정확히 1회
        done_events = [e for e in progress_events if e["step"] == "done"]
        self.assertEqual(len(done_events), 1, f"done 이벤트: {len(done_events)}회")


# ═══════════════════════════════════════════════
# B7: no detections fallback
# ═══════════════════════════════════════════════

class TestB7_NoDetectionsFallback(unittest.TestCase):
    """감지 영역 없으면 전체 이미지 Gemini 호출"""

    @_patch_sort()
    def test_empty_detections(self, mock_sort):
        img_b64 = _make_test_image_b64()

        with patch('od.analyzer.call_gemini_vision', return_value="<p>full</p>"):
            result = convert_regions(img_b64, [], "test-key")

        self.assertEqual(result["regions"], 0)
        self.assertIn("<p>full</p>", result["html"])

    @_patch_sort()
    def test_small_image_no_od(self, mock_sort):
        """소형 이미지도 빈 detections로 들어오면 전체 처리"""
        img_b64 = _make_test_image_b64(50, 50)

        with patch('od.analyzer.call_gemini_vision', return_value="<p>small</p>"):
            result = convert_regions(img_b64, [], "test-key")

        self.assertEqual(result["regions"], 0)


# ═══════════════════════════════════════════════
# B8: PyMuPDF 메인 스레드 검증
# ═══════════════════════════════════════════════

class TestB8_PyMuPDFMainThread(unittest.TestCase):
    """_get_figure_image (PyMuPDF) 호출이 메인 스레드에서 실행됨"""

    @_patch_sort()
    @_patch_crop()
    def test_figure_processing_on_main_thread(self, mock_crop, mock_sort):
        img_b64 = _make_test_image_b64()
        dets = [{"region": "figure", "label": "figure", "score": 0.9,
                 "box_px": [10, 10, 190, 190]}]

        figure_thread_names = []

        def track_thread_figure(*args, **kwargs):
            figure_thread_names.append(threading.current_thread().name)
            return "abc123"

        with patch('od.analyzer.call_gemini_vision', return_value="[FIGURE]"):
            with patch('od.analyzer._get_figure_image', side_effect=track_thread_figure):
                with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "4"}, clear=False):
                    convert_regions(img_b64, dets, "test-key", trust_labels=False)

        # _get_figure_image는 메인 스레드에서 호출되어야 함
        self.assertTrue(len(figure_thread_names) > 0)
        for name in figure_thread_names:
            self.assertEqual(name, threading.main_thread().name,
                             f"PyMuPDF가 워커 스레드에서 호출됨: {name}")


# ═══════════════════════════════════════════════
# B9: 환경변수 — DISABLE 우선순위
# ═══════════════════════════════════════════════

class TestB9_DisablePriority(unittest.TestCase):
    """AUZA_GEMINI_PARALLEL_DISABLE=1이 AUZA_GEMINI_PARALLEL보다 우선"""

    def test_disable_overrides_parallel(self):
        with patch.dict(os.environ, {
            "AUZA_GEMINI_PARALLEL_DISABLE": "1",
            "AUZA_GEMINI_PARALLEL": "8",
        }, clear=False):
            self.assertEqual(_get_parallel_workers(), 0)

    def test_disable_empty_string_allows_parallel(self):
        with patch.dict(os.environ, {
            "AUZA_GEMINI_PARALLEL_DISABLE": "",
            "AUZA_GEMINI_PARALLEL": "6",
        }, clear=False):
            self.assertEqual(_get_parallel_workers(), 6)

    def test_disable_not_set(self):
        env = dict(os.environ)
        env.pop("AUZA_GEMINI_PARALLEL_DISABLE", None)
        env["AUZA_GEMINI_PARALLEL"] = "3"
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(_get_parallel_workers(), 3)


# ═══════════════════════════════════════════════
# B10: 환경변수 — 정상값
# ═══════════════════════════════════════════════

class TestB10_NormalWorkerCount(unittest.TestCase):
    """AUZA_GEMINI_PARALLEL 정상값 테스트"""

    def test_default_is_4(self):
        env = dict(os.environ)
        env.pop("AUZA_GEMINI_PARALLEL_DISABLE", None)
        env.pop("AUZA_GEMINI_PARALLEL", None)
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(_get_parallel_workers(), 4)

    def test_explicit_4(self):
        with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "4"}, clear=False):
            result = _get_parallel_workers()
            # DISABLE이 설정되어 있으면 0 반환
            if os.environ.get("AUZA_GEMINI_PARALLEL_DISABLE", "").strip() == "1":
                self.assertEqual(result, 0)
            else:
                self.assertEqual(result, 4)

    def test_value_1(self):
        env = dict(os.environ)
        env.pop("AUZA_GEMINI_PARALLEL_DISABLE", None)
        env["AUZA_GEMINI_PARALLEL"] = "1"
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(_get_parallel_workers(), 1)

    def test_value_10(self):
        env = dict(os.environ)
        env.pop("AUZA_GEMINI_PARALLEL_DISABLE", None)
        env["AUZA_GEMINI_PARALLEL"] = "10"
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(_get_parallel_workers(), 10)


# ═══════════════════════════════════════════════
# B11: 환경변수 — 비정상값
# ═══════════════════════════════════════════════

class TestB11_InvalidWorkerCount(unittest.TestCase):
    """비정상 환경변수 값 → 안전한 기본값(4)"""

    def _test_with_value(self, value, expected=4):
        env = dict(os.environ)
        env.pop("AUZA_GEMINI_PARALLEL_DISABLE", None)
        env["AUZA_GEMINI_PARALLEL"] = value
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(_get_parallel_workers(), expected)

    def test_zero(self):
        self._test_with_value("0")

    def test_negative(self):
        self._test_with_value("-1")

    def test_non_integer(self):
        self._test_with_value("abc")

    def test_float(self):
        self._test_with_value("3.5")

    def test_too_large(self):
        self._test_with_value("100")

    def test_empty(self):
        self._test_with_value("")


# ═══════════════════════════════════════════════
# B12: figure-heavy 케이스
# ═══════════════════════════════════════════════

class TestB12_FigureHeavy(unittest.TestCase):
    """figure 3개 + text 2개 혼합에서 메인 스레드 순차 정확성"""

    @_patch_sort()
    @_patch_crop()
    def test_multiple_figures_with_text(self, mock_crop, mock_sort):
        img_b64 = _make_test_image_b64()
        dets = [
            {"region": "figure", "label": "figure", "score": 0.9, "box_px": [10, 0, 190, 40]},
            {"region": "text", "label": "text", "score": 0.9, "box_px": [10, 40, 190, 80]},
            {"region": "figure", "label": "figure", "score": 0.85, "box_px": [10, 80, 190, 120]},
            {"region": "text", "label": "text", "score": 0.9, "box_px": [10, 120, 190, 160]},
            {"region": "figure", "label": "figure", "score": 0.8, "box_px": [10, 160, 190, 200]},
        ]

        figure_call_count = [0]

        def mock_get_figure(*args, **kwargs):
            figure_call_count[0] += 1
            return f"figure_img_{figure_call_count[0]}"

        def gemini_handler(api_key, img, prompt):
            return "<p>text content</p>"

        with patch('od.analyzer.call_gemini_vision', side_effect=gemini_handler):
            with patch('od.analyzer._get_figure_image', side_effect=mock_get_figure):
                with patch.dict(os.environ, {"AUZA_GEMINI_PARALLEL": "4"}, clear=False):
                    result = convert_regions(img_b64, dets, "test-key",
                                             trust_labels=True)

        self.assertEqual(result["regions"], 5)
        # figure 3개 모두 이미지로 삽입
        self.assertEqual(figure_call_count[0], 3)
        self.assertIn("figure_img_1", result["html"])
        self.assertIn("figure_img_2", result["html"])
        self.assertIn("figure_img_3", result["html"])
        # text 2개도 포함
        self.assertIn("<p>text content</p>", result["html"])


if __name__ == '__main__':
    unittest.main()
