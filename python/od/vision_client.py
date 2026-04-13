"""Vision API 클라이언트 추상화 — Gemini SDK 마이그레이션 (Phase A)

VisionClient 인터페이스 + GeminiDirectClient 구현.
Phase B에서 사내 게이트웨이 클라이언트를 추가할 때 동일 인터페이스로 교체 가능.
"""

import abc
import atexit
import base64
import threading
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class VisionResult:
    """Gemini Vision API 호출 결과"""
    text: str
    attempts: int = 1
    status_code: Optional[int] = None
    model_version: str = ""
    elapsed_ms: int = 0


class VisionClient(abc.ABC):
    """Vision API 클라이언트 인터페이스"""

    @abc.abstractmethod
    def call_vision(self, image_b64: str, prompt: str, timeout: float = 60) -> VisionResult:
        """이미지 + 프롬프트 → 텍스트 결과 반환

        Args:
            image_b64: base64 인코딩된 PNG 이미지
            prompt: 분석 프롬프트
            timeout: 요청 타임아웃 (초)

        Returns:
            VisionResult
        """

    @abc.abstractmethod
    def close(self) -> None:
        """리소스 정리"""


# ── 재시도 대상 HTTP 상태 코드 ──
_RETRYABLE_STATUS_CODES = {429, 503, 504}
_PERMANENT_ERROR_CODES = {400, 401}

# Client 캐시 최대 크기 (api_key별 1개씩, 실사용에선 1~2개)
_MAX_CACHED_CLIENTS = 5


class GeminiDirectClient(VisionClient):
    """google-genai SDK 직접 호출 클라이언트

    - api_key별 Client 싱글턴 캐싱 (threading.Lock 보호)
    - 429/503/504 → exponential backoff 재시도 (최대 3회)
    - 400/401 → 즉시 실패
    - atexit로 close() 자동 호출
    """

    _lock = threading.Lock()
    _clients: dict = {}  # {api_key: genai.Client}
    _model_name: str = "gemini-3.1-pro-preview"

    def __init__(self, api_key: str, model: str = "gemini-3.1-pro-preview"):
        self._api_key = api_key
        self._model_name = model
        atexit.register(self.close)

    def _get_client(self):
        """api_key별 Client 캐싱 (LRU 방식 eviction)"""
        from google import genai
        from google.genai import types

        with self._lock:
            if self._api_key in self._clients:
                return self._clients[self._api_key]

            # eviction: 캐시가 꽉 차면 가장 오래된 항목 제거
            if len(self._clients) >= _MAX_CACHED_CLIENTS:
                oldest_key = next(iter(self._clients))
                old_client = self._clients.pop(oldest_key)
                # Client에 close가 있으면 호출
                if hasattr(old_client, 'close') and callable(old_client.close):
                    try:
                        old_client.close()
                    except Exception:
                        pass

            client = genai.Client(api_key=self._api_key)
            self._clients[self._api_key] = client
            return client

    def call_vision(self, image_b64: str, prompt: str, timeout: float = 60) -> VisionResult:
        """Gemini Vision API 호출 (재시도 포함)"""
        from google.genai import types

        client = self._get_client()
        image_bytes = base64.b64decode(image_b64)

        max_attempts = 3
        backoff_delays = [0.5, 1.0, 2.0]
        last_error = None

        start_time = time.monotonic()

        for attempt in range(1, max_attempts + 1):
            try:
                response = client.models.generate_content(
                    model=self._model_name,
                    contents=[
                        types.Part.from_bytes(
                            data=image_bytes,
                            mime_type="image/png",
                        ),
                        prompt,
                    ],
                    config=types.GenerateContentConfig(
                        http_options=types.HttpOptions(timeout=int(timeout * 1000)),
                    ),
                )

                elapsed_ms = int((time.monotonic() - start_time) * 1000)

                text = response.text or ""
                return VisionResult(
                    text=text.strip(),
                    attempts=attempt,
                    status_code=200,
                    model_version=self._model_name,
                    elapsed_ms=elapsed_ms,
                )

            except Exception as e:
                last_error = e
                status_code = _extract_status_code(e)

                # 영구 오류 → 즉시 실패
                if status_code in _PERMANENT_ERROR_CODES:
                    elapsed_ms = int((time.monotonic() - start_time) * 1000)
                    raise GeminiPermanentError(
                        f"Gemini API 영구 오류 (HTTP {status_code}): {e}",
                        status_code=status_code,
                        attempts=attempt,
                        elapsed_ms=elapsed_ms,
                    ) from e

                # 재시도 가능한 오류 + 아직 재시도 횟수 남음
                if status_code in _RETRYABLE_STATUS_CODES and attempt < max_attempts:
                    time.sleep(backoff_delays[attempt - 1])
                    continue

                # 재시도 불가능하거나 마지막 시도
                if attempt >= max_attempts:
                    break

                # 알 수 없는 오류도 재시도
                if attempt < max_attempts:
                    time.sleep(backoff_delays[attempt - 1])
                    continue

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        raise GeminiRetryExhaustedError(
            f"Gemini API {max_attempts}회 재시도 후 실패: {last_error}",
            status_code=_extract_status_code(last_error),
            attempts=max_attempts,
            elapsed_ms=elapsed_ms,
        ) from last_error

    def close(self) -> None:
        """캐싱된 Client 정리"""
        with self._lock:
            if self._api_key in self._clients:
                client = self._clients.pop(self._api_key)
                if hasattr(client, 'close') and callable(client.close):
                    try:
                        client.close()
                    except Exception:
                        pass


class GeminiPermanentError(Exception):
    """400/401 등 재시도 불가능한 Gemini API 오류"""
    def __init__(self, message: str, status_code: int = 0, attempts: int = 1, elapsed_ms: int = 0):
        super().__init__(message)
        self.status_code = status_code
        self.attempts = attempts
        self.elapsed_ms = elapsed_ms


class GeminiRetryExhaustedError(Exception):
    """재시도 횟수 소진 후 최종 실패"""
    def __init__(self, message: str, status_code: int = 0, attempts: int = 3, elapsed_ms: int = 0):
        super().__init__(message)
        self.status_code = status_code
        self.attempts = attempts
        self.elapsed_ms = elapsed_ms


def _extract_status_code(exc: Exception) -> int:
    """예외에서 HTTP 상태 코드 추출 (google-genai SDK 패턴)"""
    # google.genai의 ClientError / ServerError에서 status_code 속성
    if hasattr(exc, 'status_code'):
        return int(exc.status_code)
    # httpx 기반 예외
    if hasattr(exc, 'response') and hasattr(exc.response, 'status_code'):
        return int(exc.response.status_code)
    # 문자열에서 추출 시도
    import re
    match = re.search(r'\b(4\d{2}|5\d{2})\b', str(exc))
    if match:
        return int(match.group())
    return 0
