"""번들 Python 필수 패키지 import 검증 테스트

embed Python에서 핵심 패키지 누락을 조기에 잡기 위한 smoke test.
v2.1.9 PyMuPDF 누락 회귀 방지 목적.
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestEmbedImports(unittest.TestCase):
    """번들 Python에서 필수 패키지 import 가능 여부 검증"""

    def test_fitz_import(self):
        """PyMuPDF(fitz) import 성공 확인"""
        import fitz
        self.assertTrue(hasattr(fitz, '__version__'))

    def test_fitz_open_callable(self):
        """fitz.open이 실제 PyMuPDF Document를 생성하는지 확인 (namespace 패키지 오탐 방지)"""
        import fitz
        self.assertTrue(hasattr(fitz, 'open'), 'fitz.open이 존재하지 않음 — namespace 패키지일 가능성')
        doc = fitz.open()
        self.assertEqual(type(doc).__name__, 'Document')
        doc.close()

    def test_bs4_import(self):
        """beautifulsoup4(bs4) import 성공 확인"""
        import bs4
        self.assertTrue(hasattr(bs4, '__version__'))

    def test_pil_import(self):
        """Pillow(PIL) import 성공 확인"""
        from PIL import Image
        self.assertTrue(callable(Image.open))

    def test_pdf_image_extractor_import(self):
        """od.pdf_image_extractor 모듈 import 및 함수 존재 확인"""
        from od.pdf_image_extractor import extract_page_images
        self.assertTrue(callable(extract_page_images))

    def test_google_genai_import(self):
        """google-genai SDK import 성공 확인"""
        from google import genai
        self.assertTrue(hasattr(genai, 'Client'))

    def test_google_genai_types_import(self):
        """google.genai.types import 성공 확인"""
        from google.genai import types
        self.assertTrue(hasattr(types, 'Part'))
        self.assertTrue(hasattr(types, 'HttpOptions'))

    def test_ensure_packages_includes_fitz(self):
        """_ensure_packages() 목록에 fitz가 포함되어 있는지 확인"""
        import main
        import inspect
        source = inspect.getsource(main._ensure_packages)
        self.assertIn('fitz', source)
        self.assertIn('PyMuPDF', source)

    def test_ensure_packages_includes_google_genai(self):
        """_ensure_packages() 목록에 google.genai가 포함되어 있는지 확인"""
        import main
        import inspect
        source = inspect.getsource(main._ensure_packages)
        self.assertIn('google.genai', source)
        self.assertIn('google-genai', source)


if __name__ == '__main__':
    unittest.main()
