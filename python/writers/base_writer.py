"""추상 Writer 클래스 — Strategy 패턴 공통 인터페이스"""

from abc import ABC, abstractmethod
from parsers.document import DocumentStructure


class BaseWriter(ABC):
    """HWP/PPT Writer 공통 인터페이스"""

    @abstractmethod
    def write(self, doc: DocumentStructure) -> dict:
        """문서 구조를 대상 앱에 작성

        Returns:
            dict: {"success": bool, "error": str|None, ...}
        """
        pass

    @abstractmethod
    def check_connection(self) -> dict:
        """대상 앱 연결 상태 확인

        Returns:
            dict: {"connected": bool, "error": str|None}
        """
        pass

    @abstractmethod
    def check_cursor_position(self) -> dict:
        """커서가 문서 끝에 있는지 확인

        Returns:
            dict: {"at_end": bool, "error": str|None}
        """
        pass
