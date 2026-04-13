"""Phase A 테스트 — Gemini SDK 마이그레이션 (11개 시나리오)

A1: 회귀 동일성 — 옛/새 SDK 결과 텍스트 동일
A2: Client 캐싱 — 같은 키 1회 생성
A3: Client 캐싱 — 다른 키 분리
A4: Client close 호출 검증
A5: 재시도 분류 — 일시 오류(429/503/504) → 재시도 → 성공
A6: 재시도 분류 — 영구 오류(400/401) → 즉시 실패
A7: 재시도 한계 — 3회 모두 실패 → deterministic 에러
A8: timeout 동작 — http_options.timeout 초과 처리
A9: 빈 응답 처리 — response.text가 None/빈
A10: VisionResult 필드 정확성 (text/attempts/status_code/elapsed_ms)
A11: embed Python에서 google.genai import 성공
"""

import sys
import os
import base64
import time
import unittest
from unittest.mock import patch, MagicMock, PropertyMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from od.vision_client import (
    VisionResult,
    GeminiDirectClient,
    GeminiPermanentError,
    GeminiRetryExhaustedError,
    _extract_status_code,
    _MAX_CACHED_CLIENTS,
)


# 테스트용 더미 base64 이미지 (1x1 PNG)
_DUMMY_IMAGE_B64 = base64.b64encode(
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
    b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00'
    b'\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00'
    b'\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
).decode()


def _make_mock_response(text="<p>test</p>"):
    """generate_content 응답 mock 생성"""
    resp = MagicMock()
    resp.text = text
    return resp


def _make_api_error(status_code: int, message: str = "error"):
    """Gemini API 에러 mock 생성"""
    err = Exception(f"HTTP {status_code}: {message}")
    err.status_code = status_code
    return err


class TestA1_RegressionEquivalence(unittest.TestCase):
    """A1: 결과 텍스트가 기존과 동일한 형태로 반환"""

    @patch('od.vision_client.genai', create=True)
    def test_returns_stripped_text(self, mock_genai_module):
        # google.genai 모듈 mock
        with patch.dict('sys.modules', {
            'google': MagicMock(),
            'google.genai': MagicMock(),
        }):
            from od import vision_client as vc
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value = _make_mock_response("<p>Hello</p>")

            # Client 캐시 직접 주입
            client = GeminiDirectClient.__new__(GeminiDirectClient)
            client._api_key = "test-key"
            client._model_name = "gemini-3.1-pro-preview"

            with patch.object(client, '_get_client', return_value=mock_client):
                result = client.call_vision(_DUMMY_IMAGE_B64, "prompt")
                self.assertEqual(result.text, "<p>Hello</p>")
                self.assertIsInstance(result, VisionResult)


class TestA2_ClientCachingSameKey(unittest.TestCase):
    """A2: 같은 api_key로 2회 호출 시 Client 1번만 생성"""

    def setUp(self):
        GeminiDirectClient._clients.clear()

    def tearDown(self):
        GeminiDirectClient._clients.clear()

    @patch('google.genai.Client')
    def test_same_key_reuses_client(self, MockClient):
        mock_genai_client = MagicMock()
        MockClient.return_value = mock_genai_client

        c = GeminiDirectClient("key-A")
        # 첫 호출
        client1 = c._get_client()
        # 두 번째 호출
        client2 = c._get_client()

        self.assertIs(client1, client2)
        MockClient.assert_called_once_with(api_key="key-A")


class TestA3_ClientCachingDifferentKey(unittest.TestCase):
    """A3: 다른 api_key면 별도 Client 생성"""

    def setUp(self):
        GeminiDirectClient._clients.clear()

    def tearDown(self):
        GeminiDirectClient._clients.clear()

    @patch('google.genai.Client')
    def test_different_keys_create_separate_clients(self, MockClient):
        mock_a = MagicMock()
        mock_b = MagicMock()
        MockClient.side_effect = [mock_a, mock_b]

        c_a = GeminiDirectClient("key-A")
        c_b = GeminiDirectClient("key-B")

        client_a = c_a._get_client()
        client_b = c_b._get_client()

        self.assertIsNot(client_a, client_b)
        self.assertEqual(MockClient.call_count, 2)


class TestA4_ClientClose(unittest.TestCase):
    """A4: close() 호출 시 캐시된 Client 정리"""

    def setUp(self):
        GeminiDirectClient._clients.clear()

    def tearDown(self):
        GeminiDirectClient._clients.clear()

    @patch('google.genai.Client')
    def test_close_removes_from_cache(self, MockClient):
        mock_client = MagicMock()
        mock_client.close = MagicMock()
        MockClient.return_value = mock_client

        c = GeminiDirectClient("key-close")
        c._get_client()
        self.assertIn("key-close", GeminiDirectClient._clients)

        c.close()
        self.assertNotIn("key-close", GeminiDirectClient._clients)
        mock_client.close.assert_called_once()


class TestA5_RetryTransientErrors(unittest.TestCase):
    """A5: 429/503/504 → 재시도 → 성공"""

    def setUp(self):
        GeminiDirectClient._clients.clear()

    def tearDown(self):
        GeminiDirectClient._clients.clear()

    def test_retries_on_429_then_succeeds(self):
        mock_client = MagicMock()
        error_429 = _make_api_error(429, "Rate limited")
        success_resp = _make_mock_response("<p>ok</p>")
        mock_client.models.generate_content.side_effect = [error_429, success_resp]

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            with patch('od.vision_client.time.sleep'):  # backoff 건너뛰기
                result = c.call_vision(_DUMMY_IMAGE_B64, "prompt")
                self.assertEqual(result.text, "<p>ok</p>")
                self.assertEqual(result.attempts, 2)

    def test_retries_on_503(self):
        mock_client = MagicMock()
        error_503 = _make_api_error(503, "Service unavailable")
        success_resp = _make_mock_response("<p>ok</p>")
        mock_client.models.generate_content.side_effect = [error_503, success_resp]

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            with patch('od.vision_client.time.sleep'):
                result = c.call_vision(_DUMMY_IMAGE_B64, "prompt")
                self.assertEqual(result.attempts, 2)


class TestA6_PermanentErrors(unittest.TestCase):
    """A6: 400/401 → 즉시 실패 (재시도 안 함)"""

    def test_400_raises_immediately(self):
        mock_client = MagicMock()
        error_400 = _make_api_error(400, "Bad request")
        mock_client.models.generate_content.side_effect = error_400

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            with self.assertRaises(GeminiPermanentError) as ctx:
                c.call_vision(_DUMMY_IMAGE_B64, "prompt")
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertEqual(ctx.exception.attempts, 1)

    def test_401_raises_immediately(self):
        mock_client = MagicMock()
        error_401 = _make_api_error(401, "Unauthorized")
        mock_client.models.generate_content.side_effect = error_401

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            with self.assertRaises(GeminiPermanentError) as ctx:
                c.call_vision(_DUMMY_IMAGE_B64, "prompt")
            self.assertEqual(ctx.exception.status_code, 401)


class TestA7_RetryExhausted(unittest.TestCase):
    """A7: 3회 모두 실패 → GeminiRetryExhaustedError"""

    def test_all_retries_fail(self):
        mock_client = MagicMock()
        error_429 = _make_api_error(429, "Rate limited")
        mock_client.models.generate_content.side_effect = [error_429, error_429, error_429]

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            with patch('od.vision_client.time.sleep'):
                with self.assertRaises(GeminiRetryExhaustedError) as ctx:
                    c.call_vision(_DUMMY_IMAGE_B64, "prompt")
                self.assertEqual(ctx.exception.attempts, 3)
                self.assertEqual(ctx.exception.status_code, 429)


class TestA8_Timeout(unittest.TestCase):
    """A8: timeout 파라미터가 http_options에 반영됨"""

    def test_timeout_passed_to_config(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_mock_response("<p>ok</p>")

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            c.call_vision(_DUMMY_IMAGE_B64, "prompt", timeout=30)

            # generate_content에 전달된 config 인자 검증
            call_kwargs = mock_client.models.generate_content.call_args
            config = call_kwargs.kwargs.get('config') or call_kwargs[1].get('config')
            # config.http_options.timeout이 30000ms인지 확인
            self.assertIsNotNone(config)
            self.assertEqual(config.http_options.timeout, 30000)


class TestA9_EmptyResponse(unittest.TestCase):
    """A9: response.text가 None 또는 빈 문자열"""

    def test_none_response_text(self):
        mock_client = MagicMock()
        resp = MagicMock()
        resp.text = None
        mock_client.models.generate_content.return_value = resp

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            result = c.call_vision(_DUMMY_IMAGE_B64, "prompt")
            self.assertEqual(result.text, "")

    def test_empty_response_text(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_mock_response("")

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            result = c.call_vision(_DUMMY_IMAGE_B64, "prompt")
            self.assertEqual(result.text, "")


class TestA10_VisionResultFields(unittest.TestCase):
    """A10: VisionResult 필드 정확성"""

    def test_all_fields_populated(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_mock_response("<p>result</p>")

        c = GeminiDirectClient.__new__(GeminiDirectClient)
        c._api_key = "test"
        c._model_name = "gemini-3.1-pro-preview"

        with patch.object(c, '_get_client', return_value=mock_client):
            result = c.call_vision(_DUMMY_IMAGE_B64, "prompt")

            self.assertEqual(result.text, "<p>result</p>")
            self.assertEqual(result.attempts, 1)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.model_version, "gemini-3.1-pro-preview")
            self.assertGreaterEqual(result.elapsed_ms, 0)

    def test_vision_result_dataclass(self):
        """VisionResult 생성자 확인"""
        r = VisionResult(
            text="hello",
            attempts=2,
            status_code=200,
            model_version="test-model",
            elapsed_ms=123,
        )
        self.assertEqual(r.text, "hello")
        self.assertEqual(r.attempts, 2)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.model_version, "test-model")
        self.assertEqual(r.elapsed_ms, 123)


class TestA11_GoogleGenaiImport(unittest.TestCase):
    """A11: google.genai import 성공 (embed Python 호환)"""

    def test_import_genai(self):
        from google import genai
        self.assertTrue(hasattr(genai, 'Client'))

    def test_import_types(self):
        from google.genai import types
        self.assertTrue(hasattr(types, 'Part'))


class TestExtractStatusCode(unittest.TestCase):
    """_extract_status_code 유틸 테스트"""

    def test_from_status_code_attr(self):
        err = Exception("fail")
        err.status_code = 429
        self.assertEqual(_extract_status_code(err), 429)

    def test_from_response_attr(self):
        err = Exception("fail")
        err.response = MagicMock()
        err.response.status_code = 503
        self.assertEqual(_extract_status_code(err), 503)

    def test_from_string(self):
        err = Exception("HTTP 429: rate limited")
        self.assertEqual(_extract_status_code(err), 429)

    def test_unknown(self):
        err = Exception("unknown error")
        self.assertEqual(_extract_status_code(err), 0)


class TestClientEviction(unittest.TestCase):
    """Client 캐시 eviction 테스트"""

    def setUp(self):
        GeminiDirectClient._clients.clear()

    def tearDown(self):
        GeminiDirectClient._clients.clear()

    @patch('google.genai.Client')
    def test_evicts_oldest_when_full(self, MockClient):
        """캐시가 _MAX_CACHED_CLIENTS에 도달하면 가장 오래된 항목 evict"""
        mock_clients = []
        for i in range(_MAX_CACHED_CLIENTS + 1):
            mc = MagicMock()
            mc.close = MagicMock()
            mock_clients.append(mc)
        MockClient.side_effect = mock_clients

        # 캐시를 꽉 채움
        for i in range(_MAX_CACHED_CLIENTS):
            c = GeminiDirectClient(f"key-{i}")
            c._get_client()

        self.assertEqual(len(GeminiDirectClient._clients), _MAX_CACHED_CLIENTS)

        # 하나 더 추가 → 가장 오래된 것 evict
        c_new = GeminiDirectClient("key-new")
        c_new._get_client()

        self.assertEqual(len(GeminiDirectClient._clients), _MAX_CACHED_CLIENTS)
        self.assertNotIn("key-0", GeminiDirectClient._clients)
        self.assertIn("key-new", GeminiDirectClient._clients)
        # 가장 오래된 Client의 close가 호출되었는지
        mock_clients[0].close.assert_called_once()


class TestStripCodeFences(unittest.TestCase):
    """_strip_code_fences 유틸 테스트"""

    def test_strip_html_fence(self):
        from od.gemini_vision import _strip_code_fences
        self.assertEqual(_strip_code_fences("```html\n<p>test</p>\n```"), "<p>test</p>")

    def test_strip_generic_fence(self):
        from od.gemini_vision import _strip_code_fences
        self.assertEqual(_strip_code_fences("```\n<p>test</p>\n```"), "<p>test</p>")

    def test_strip_html_body(self):
        from od.gemini_vision import _strip_code_fences
        result = _strip_code_fences("<html><body><p>test</p></body></html>")
        self.assertEqual(result, "<p>test</p>")

    def test_no_fence(self):
        from od.gemini_vision import _strip_code_fences
        self.assertEqual(_strip_code_fences("<p>test</p>"), "<p>test</p>")


if __name__ == '__main__':
    unittest.main()
