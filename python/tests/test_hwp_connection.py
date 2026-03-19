"""HWP 연결 정책 회귀 테스트

check_connection()이 passive probe인지 검증:
- GetActiveObject만 사용
- Dispatch/EnsureDispatch 호출 안 함
- Visible 설정 안 함
- FileNew 실행 안 함
- 미연결 시 통일된 사용자 메시지 반환
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestCheckConnectionPassive(unittest.TestCase):
    """check_connection()이 부작용 없는 passive probe인지 검증"""

    @patch('win32com.client.GetActiveObject')
    def test_connected_via_get_active_object(self, mock_gao):
        """GetActiveObject 성공 시 connected=True"""
        from writers.hwp_writer import HwpWriter

        mock_hwp = MagicMock()
        mock_hwp.XHwpDocuments.Count = 1
        mock_gao.return_value = mock_hwp

        writer = HwpWriter()
        result = writer.check_connection()

        self.assertTrue(result["connected"])
        self.assertIsNone(result["error"])
        mock_gao.assert_called_once_with("HWPFrame.HwpObject.1")

    @patch('win32com.client.GetActiveObject')
    def test_disconnected_returns_friendly_message(self, mock_gao):
        """GetActiveObject 실패 시 사용자 친화적 메시지 반환"""
        from writers.hwp_writer import HwpWriter

        mock_gao.side_effect = Exception("COM error")

        writer = HwpWriter()
        result = writer.check_connection()

        self.assertFalse(result["connected"])
        self.assertIn("한글", result["error"])
        self.assertIn("실행", result["error"])

    @patch('win32com.client.GetActiveObject')
    @patch('win32com.client.Dispatch')
    def test_no_dispatch_called(self, mock_dispatch, mock_gao):
        """check_connection은 Dispatch를 호출하지 않음"""
        from writers.hwp_writer import HwpWriter

        mock_gao.side_effect = Exception("not running")

        writer = HwpWriter()
        writer.check_connection()

        mock_dispatch.assert_not_called()

    @patch('win32com.client.GetActiveObject')
    def test_no_visible_or_filenew(self, mock_gao):
        """check_connection은 Visible 설정이나 FileNew를 실행하지 않음"""
        from writers.hwp_writer import HwpWriter

        mock_hwp = MagicMock()
        mock_hwp.XHwpDocuments.Count = 1
        mock_gao.return_value = mock_hwp

        writer = HwpWriter()
        writer.check_connection()

        # RegisterModule 호출 안 함 (passive probe)
        mock_hwp.RegisterModule.assert_not_called()
        # HAction.Run("FileNew") 호출 안 함
        mock_hwp.HAction.Run.assert_not_called()

    @patch('win32com.client.GetActiveObject')
    def test_disconnected_message_consistent(self, mock_gao):
        """모든 실패 경로에서 동일한 메시지 반환"""
        from writers.hwp_writer import HwpWriter

        mock_gao.side_effect = Exception("any error")

        writer = HwpWriter()
        result = writer.check_connection()

        expected = HwpWriter._DISCONNECTED_MSG
        self.assertEqual(result["error"], expected)


class TestCheckThenWriteSequence(unittest.TestCase):
    """check_connection → cursor/write 시퀀스 검증"""

    @patch('win32com.client.GetActiveObject')
    def test_check_caches_hwp_for_cursor(self, mock_gao):
        """check_connection 성공 후 _hwp 캐시됨 (cursor에서 사용)"""
        from writers.hwp_writer import HwpWriter

        mock_hwp = MagicMock()
        mock_hwp.XHwpDocuments.Count = 1
        mock_gao.return_value = mock_hwp

        writer = HwpWriter()
        result = writer.check_connection()

        self.assertTrue(result["connected"])
        self.assertIsNotNone(writer._hwp)  # 캐시되어 cursor에서 사용 가능
        self.assertFalse(writer._hwp_setup_done)  # write-time 설정은 아직 안 됨

    @patch('win32com.client.GetActiveObject')
    def test_check_then_cursor_works(self, mock_gao):
        """check 후 cursor가 정상 동작"""
        from writers.hwp_writer import HwpWriter

        mock_hwp = MagicMock()
        mock_hwp.XHwpDocuments.Count = 1
        mock_hwp.GetPos.return_value = (0, 0, 0)
        mock_gao.return_value = mock_hwp

        writer = HwpWriter()
        conn = writer.check_connection()
        self.assertTrue(conn["connected"])

        cursor = writer.check_cursor_position()
        self.assertIsNone(cursor.get("error"))

    @patch('win32com.client.GetActiveObject')
    def test_write_runs_setup_after_passive_check(self, mock_gao):
        """check 후 write 시 _get_hwp()가 write-time 설정을 실행"""
        from writers.hwp_writer import HwpWriter
        from parsers.document import DocumentStructure, ContentItem, Paragraph, TextRun

        mock_hwp = MagicMock()
        mock_hwp.XHwpDocuments.Count = 1
        mock_gao.return_value = mock_hwp

        writer = HwpWriter()
        writer.check_connection()
        self.assertFalse(writer._hwp_setup_done)

        doc = DocumentStructure(items=[
            ContentItem(item_type='paragraph', paragraph=Paragraph(runs=[TextRun(text='test')]))
        ])
        writer.write(doc)

        # write 후 setup 완료
        self.assertTrue(writer._hwp_setup_done)
        # RegisterModule이 호출되었는지 확인
        mock_hwp.RegisterModule.assert_called_once()


class TestWriteImageFailure(unittest.TestCase):
    """_write_image() 실패가 올바르게 전파되는지 검증"""

    def test_invalid_base64_raises(self):
        """잘못된 base64 입력 시 예외 발생"""
        from writers.hwp_writer import HwpWriter
        from parsers.document import ImageData, ContentItem, DocumentStructure

        writer = HwpWriter()
        writer._hwp = MagicMock()

        doc = DocumentStructure(items=[
            ContentItem(item_type='image', image=ImageData(base64='not-valid-base64!!!'))
        ])

        result = writer.write(doc)

        self.assertFalse(result["success"])
        self.assertEqual(result["written"], 0)
        self.assertIsNotNone(result["errors"])
        self.assertEqual(len(result["errors"]), 1)


if __name__ == '__main__':
    unittest.main()
