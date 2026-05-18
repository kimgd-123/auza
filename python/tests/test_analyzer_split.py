"""reclassify_boxed_text 회귀 테스트 (v2.3.4 트랙 A)

Codex Finding 3 권고:
- dense-text FP: 흰 배경 + 글자 빽빽 → text 유지 (boxed_text 오탐 없음)
- density-variation pair: 같은 배경 + 글자 밀도만 다른 두 crop → 동일 결과 (진동 없음)
- real boxed-text TP: 회색 배경 → boxed_text 정상 분류
"""

import os
import sys
import unittest

import numpy as np
from PIL import Image

# python/ 디렉터리를 import path 에 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from od.detector import reclassify_boxed_text  # noqa: E402


def _make_image(bg_value: int, w: int = 200, h: int = 200, text_pixels: int = 0,
                seed: int = 42, text_margin: int = 25) -> Image.Image:
    """배경색 bg_value 의 균일 배경 + text_pixels 만큼 검정 점을 추가.

    text_margin: 가장자리 여백 (실제 OD crop 은 텍스트 주변에 여백이 있음 →
    edge density 휴리스틱(가장자리 strip) 이 글자 픽셀에 트리거되지 않도록 시뮬레이션).
    text_pixels 가 글자 픽셀 수를 시뮬레이션 — Otsu 가 분리해야 할 전경.
    """
    rng = np.random.default_rng(seed)
    arr = np.full((h, w, 3), bg_value, dtype=np.uint8)
    if text_pixels > 0:
        # 여백 안쪽 영역에만 글자 픽셀 분포
        inner_h = max(1, h - 2 * text_margin)
        inner_w = max(1, w - 2 * text_margin)
        ys = rng.integers(text_margin, text_margin + inner_h, size=text_pixels)
        xs = rng.integers(text_margin, text_margin + inner_w, size=text_pixels)
        arr[ys, xs] = (0, 0, 0)
    return Image.fromarray(arr)


def _make_detection(box=(0, 0, 200, 200), region: str = "text") -> dict:
    return {"region": region, "box_px": list(box), "score": 0.9}


class TestReclassifyBoxedText_DenseTextFP(unittest.TestCase):
    """흰 배경 + 글자 빽빽한 plain text 가 boxed_text 로 오탐되지 않아야 함"""

    def test_dense_text_on_white_background_stays_text(self):
        # 흰 배경(255) + 30% 검정 점 (글자 시뮬레이션)
        img = _make_image(bg_value=255, text_pixels=200 * 200 * 3 // 10)
        det = _make_detection()
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(
            result[0]["region"], "text",
            f"흰 배경의 dense text 가 boxed_text 로 오탐됨 (Otsu 미적용 회귀)",
        )

    def test_extreme_dense_text_on_white_stays_text(self):
        # 50% 검정 (매우 빽빽한 글자)
        img = _make_image(bg_value=255, text_pixels=200 * 200 * 5 // 10)
        det = _make_detection()
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(result[0]["region"], "text")


class TestReclassifyBoxedText_DensityVariationPair(unittest.TestCase):
    """같은 흰 배경 + 글자 밀도만 다른 두 crop 은 같은 결과여야 함 (진동 차단)"""

    def test_low_vs_high_density_same_classification(self):
        img_low = _make_image(bg_value=255, text_pixels=200 * 200 * 1 // 10, seed=1)
        img_high = _make_image(bg_value=255, text_pixels=200 * 200 * 4 // 10, seed=2)

        det_low = _make_detection()
        det_high = _make_detection()

        r_low = reclassify_boxed_text(img_low, [det_low])
        r_high = reclassify_boxed_text(img_high, [det_high])

        self.assertEqual(
            r_low[0]["region"], r_high[0]["region"],
            "글자 밀도 차이만으로 boxed_text/text 진동 발생",
        )
        # 둘 다 흰 배경이므로 boxed_text 가 되어선 안 됨
        self.assertEqual(r_low[0]["region"], "text")
        self.assertEqual(r_high[0]["region"], "text")


class TestReclassifyBoxedText_RealBoxedTP(unittest.TestCase):
    """진짜 회색/컬러 배경은 boxed_text 로 정상 분류되어야 함"""

    def test_gray_background_classified_as_boxed(self):
        # 회색 배경 (220) + 글자 약간
        img = _make_image(bg_value=220, text_pixels=200 * 200 * 1 // 20)
        det = _make_detection()
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(
            result[0]["region"], "boxed_text",
            "회색 배경이 boxed_text 로 분류되지 않음",
        )

    def test_colored_box_background_classified_as_boxed(self):
        # 한국사 PDF 흔암리 안내 같은 연한 컬러 배경 시뮬레이션
        # RGB (240, 220, 200) → grayscale ~225
        rng = np.random.default_rng(7)
        arr = np.full((200, 200, 3), (240, 220, 200), dtype=np.uint8)
        # 글자는 안쪽 영역에만
        n_text = 200 * 200 // 30
        ys = rng.integers(25, 175, size=n_text)
        xs = rng.integers(25, 175, size=n_text)
        arr[ys, xs] = (0, 0, 0)
        img = Image.fromarray(arr)
        det = _make_detection()
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(result[0]["region"], "boxed_text")


class TestReclassifyBoxedText_PassThrough(unittest.TestCase):
    """text 가 아닌 region 은 그대로 통과"""

    def test_figure_region_unchanged(self):
        img = _make_image(bg_value=255, text_pixels=0)
        det = _make_detection(region="figure")
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(result[0]["region"], "figure")

    def test_table_region_unchanged(self):
        img = _make_image(bg_value=180, text_pixels=200 * 200 // 20)
        det = _make_detection(region="table")
        result = reclassify_boxed_text(img, [det])
        # table 인 회색 배경이라도 region 변경 없음
        self.assertEqual(result[0]["region"], "table")


class TestReclassifyBoxedText_SmallCropSkip(unittest.TestCase):
    """40px 미만 crop 은 분류 시도 안 함 (기존 동작 유지)"""

    def test_small_crop_skipped(self):
        img = _make_image(bg_value=180, w=30, h=30)
        det = _make_detection(box=(0, 0, 30, 30))
        result = reclassify_boxed_text(img, [det])
        # 작은 crop 은 boxed 분류 시도 자체를 건너뜀
        self.assertEqual(result[0]["region"], "text")


class TestReclassifyBoxedText_TightCropEdgeFP(unittest.TestCase):
    """Codex Finding 1: tight crop (margin 0~8px) plain text 가 edge 경로로
    boxed_text 로 오탐되지 않아야 함. 이전 버전은 edge 단독으로 승격해서 회귀."""

    def test_tight_crop_dense_text_stays_text(self):
        # margin 2 (거의 가장자리에 글자) + 흰 배경 + dense text
        img = _make_image(
            bg_value=255, w=120, h=80, text_pixels=120 * 80 * 3 // 10,
            text_margin=2,
        )
        det = _make_detection(box=(0, 0, 120, 80))
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(
            result[0]["region"], "text",
            "tight crop plain text 가 edge 경로로 boxed_text 오탐 (Codex F1 회귀)",
        )

    def test_tight_crop_glyph_grid_stays_text(self):
        # 글자 grid 시뮬레이션 — 가장자리에도 글자가 있는 경우
        img = _make_image(
            bg_value=255, w=160, h=100, text_pixels=160 * 100 * 4 // 10,
            text_margin=4,
        )
        det = _make_detection(box=(0, 0, 160, 100))
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(result[0]["region"], "text")


class TestReclassifyBoxedText_OffWhiteFP(unittest.TestCase):
    """Codex Finding 2: 스캔된 off-white 종이(배경 242/244) plain text 가
    absolute 임계로 boxed_text 로 회귀하지 않아야 함.
    tight-crop 케이스(margin=2) 에서도 회귀 없는지 확인."""

    def test_off_white_244_stays_text(self):
        img = _make_image(bg_value=244, text_pixels=200 * 200 // 30)
        det = _make_detection()
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(
            result[0]["region"], "text",
            "off-white 244 plain text 가 boxed_text 오탐 (Codex F2 회귀)",
        )

    def test_off_white_242_stays_text(self):
        img = _make_image(bg_value=242, text_pixels=200 * 200 // 30)
        det = _make_detection()
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(result[0]["region"], "text")

    def test_tight_crop_off_white_244_stays_text(self):
        # Codex recheck 에서 발견: tight crop(margin=2) + off-white(244) +
        # text 픽셀이 가장자리에 닿아 edge density 가 4변 트리거 → 이전엔
        # edge+weak_bg 경로로 boxed 회귀. edge 경로 폐기 후 text 유지 확인.
        img = _make_image(
            bg_value=244, w=120, h=80,
            text_pixels=120 * 80 * 3 // 10, text_margin=2,
        )
        det = _make_detection(box=(0, 0, 120, 80))
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(
            result[0]["region"], "text",
            "tight-crop off-white 244 가 edge+weak_bg 경로로 boxed 오탐 (Codex recheck F2)",
        )

    def test_tight_crop_off_white_242_stays_text(self):
        img = _make_image(
            bg_value=242, w=120, h=80,
            text_pixels=120 * 80 * 3 // 10, text_margin=2,
        )
        det = _make_detection(box=(0, 0, 120, 80))
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(result[0]["region"], "text")


class TestReclassifyBoxedText_StrongBgBoundary(unittest.TestCase):
    """강한 배경 증거 임계 (240) 경계 케이스"""

    def test_bg_239_classified_as_boxed(self):
        # 240 미만 = 강한 배경 증거 → boxed
        img = _make_image(bg_value=239, text_pixels=200 * 200 // 30)
        det = _make_detection()
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(result[0]["region"], "boxed_text")

    def test_bg_230_clearly_boxed(self):
        img = _make_image(bg_value=230, text_pixels=200 * 200 // 30)
        det = _make_detection()
        result = reclassify_boxed_text(img, [det])
        self.assertEqual(result[0]["region"], "boxed_text")


if __name__ == "__main__":
    unittest.main()
