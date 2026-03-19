"""프롬프트 커버리지 테스트

모든 수식 관련 프롬프트에 공통 규칙이 포함되어 있는지 검증.
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestPromptCoverage(unittest.TestCase):
    """수식 프롬프트 공통 규칙 커버리지"""

    def _get_prompts(self):
        from od.gemini_vision import PROMPT_TEXT, PROMPT_TABLE, PROMPT_FORMULA
        return {
            'PROMPT_TEXT': PROMPT_TEXT,
            'PROMPT_TABLE': PROMPT_TABLE,
            'PROMPT_FORMULA': PROMPT_FORMULA,
        }

    def test_all_prompts_have_superscript_rule(self):
        """모든 프롬프트에 위첨자 감지 규칙이 포함"""
        for name, prompt in self._get_prompts().items():
            self.assertIn('위첨자', prompt, f'{name}에 위첨자 규칙 누락')
            self.assertIn('^', prompt, f'{name}에 ^ 기호 누락')

    def test_all_prompts_have_subscript_rule(self):
        """모든 프롬프트에 아래첨자 감지 규칙이 포함"""
        for name, prompt in self._get_prompts().items():
            self.assertIn('아래첨자', prompt, f'{name}에 아래첨자 규칙 누락')
            self.assertIn('_', prompt, f'{name}에 _ 기호 누락')

    def test_all_prompts_have_no_hallucination(self):
        """모든 프롬프트에 해설 생성 금지 지시 포함"""
        for name, prompt in self._get_prompts().items():
            self.assertIn('절대 추가하지 마세요', prompt, f'{name}에 해설 금지 규칙 누락')

    def test_all_prompts_have_latex_dollar(self):
        """모든 프롬프트에 $ 감싸기 규칙 포함"""
        for name, prompt in self._get_prompts().items():
            self.assertIn('$', prompt, f'{name}에 $ 규칙 누락')

    def test_all_prompts_have_frac_example(self):
        """모든 프롬프트에 분수 변환 예시 포함"""
        for name, prompt in self._get_prompts().items():
            self.assertIn('frac', prompt, f'{name}에 frac 예시 누락')


class TestImageSerialization(unittest.TestCase):
    """ProseMirror → HTML 이미지 직렬화 (JS 테스트를 Python에서 간접 검증)"""

    def test_html_parser_handles_img_tag(self):
        """html_parser가 <img src="data:..."> 를 ImageData로 변환"""
        from parsers.html_parser import parse_html

        html = '<p>텍스트</p><img src="data:image/png;base64,AAAA" alt="테스트" /><p>끝</p>'
        doc = parse_html(html)

        image_items = [item for item in doc.items if item.item_type == 'image']
        self.assertEqual(len(image_items), 1)
        self.assertEqual(image_items[0].image.base64, 'AAAA')
        self.assertEqual(image_items[0].image.mime_type, 'image/png')

    def test_html_parser_handles_nested_img(self):
        """html_parser가 <p><img></p> 중첩 구조도 처리"""
        from parsers.html_parser import parse_html

        html = '<p><img src="data:image/png;base64,BBBB" alt="nested" /></p>'
        doc = parse_html(html)

        image_items = [item for item in doc.items if item.item_type == 'image']
        self.assertEqual(len(image_items), 1)
        self.assertEqual(image_items[0].image.base64, 'BBBB')

    def test_html_parser_ignores_external_url(self):
        """외부 URL 이미지는 무시"""
        from parsers.html_parser import parse_html

        html = '<img src="https://example.com/img.png" />'
        doc = parse_html(html)

        image_items = [item for item in doc.items if item.item_type == 'image']
        self.assertEqual(len(image_items), 0)


if __name__ == '__main__':
    unittest.main()
