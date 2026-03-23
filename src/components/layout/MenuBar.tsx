import { useCallback, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { checkHwpConnection, checkHwpCursor, exportToHwp } from '@/lib/export-hwp'
import LayoutPicker from './LayoutPicker'
import SettingsDialog from './SettingsDialog'

export default function MenuBar() {
  const { layoutMode, setLayoutMode, hwpExporting, setHwpExporting, setHwpExportError, setHwpConnected } = useAppStore()
  const [showCursorDialog, setShowCursorDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [eqFixing, setEqFixing] = useState(false)

  const handleOpenPdf = async () => {
    if (!window.electronAPI) return
    const filePath = await window.electronAPI.openFile({
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })
    if (filePath) {
      useAppStore.getState().setPdfPath(filePath)
    }
  }

  const hwpBusy = hwpExporting || eqFixing

  const handleExportHwp = useCallback(async () => {
    if (hwpBusy) return

    // precheck 시작부터 busy 상태 설정
    setHwpExporting(true)
    setHwpExportError(null)

    try {
      // 1. HWP 연결 확인 + 상태 동기화
      const conn = await checkHwpConnection()
      setHwpConnected(conn.connected)
      if (!conn.connected) {
        setHwpExportError(conn.error || '한글 프로그램에 연결할 수 없습니다. 한글을 먼저 실행해주세요.')
        setHwpExporting(false)
        return
      }

      // 2. 커서 위치 확인 (PRD §4.6.1)
      const cursor = await checkHwpCursor()
      if (cursor.error) {
        setHwpExportError(cursor.error)
        setHwpExporting(false)
        return
      }
      if (!cursor.at_end) {
        setShowCursorDialog(true)
        setHwpExporting(false)
        return
      }

      // 3. 내보내기 실행
      await doExport()
    } catch {
      setHwpExportError('HWP 작성 중 오류가 발생했습니다.')
      setHwpExporting(false)
    }
  }, [hwpBusy, setHwpExporting, setHwpExportError])

  const handleFixEquationWidth = useCallback(async () => {
    if (hwpBusy || !window.electronAPI) return

    // HWP 파일 선택
    const filePath = await window.electronAPI.openFile({
      filters: [{ name: 'HWP Files', extensions: ['hwp', 'hwpx'] }],
    })
    if (!filePath) return

    setEqFixing(true)
    setHwpExportError(null)

    try {
      const result = await window.electronAPI.fixEquationWidth({ filePath })
      if (!result.success) {
        setHwpExportError(result.error || '수식 너비 조정에 실패했습니다.')
      } else {
        const data = result.data as { processed?: number; total_equations?: number; output_path?: string }
        setHwpExportError(null)
        alert(`수식 너비 조정 완료\n처리: ${data.processed ?? 0}/${data.total_equations ?? 0}개\n저장: ${data.output_path ?? ''}`)
      }
    } catch {
      setHwpExportError('수식 너비 조정 중 오류가 발생했습니다.')
    } finally {
      setEqFixing(false)
    }
  }, [hwpBusy, setHwpExportError])

  const doExport = useCallback(async () => {
    setShowCursorDialog(false)
    setHwpExporting(true)
    setHwpExportError(null)

    const result = await exportToHwp()

    setHwpExporting(false)

    if (!result.success) {
      setHwpExportError(result.error || 'HWP 작성에 실패했습니다.')
    }
  }, [setHwpExporting, setHwpExportError])

  return (
    <>
      <div className="flex items-center h-10 px-4 bg-white border-b border-gray-200 text-sm gap-4 flex-shrink-0">
        <span className="font-bold text-blue-600 mr-4">AUZA</span>

        <button
          onClick={handleOpenPdf}
          className="px-3 py-1 text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          PDF 열기
        </button>

        <button
          onClick={() => useAppStore.getState().addBlock()}
          className="px-3 py-1 text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          + 블록 추가
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setShowSettings(true)}
          className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
          title="설정"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <LayoutPicker current={layoutMode} onChange={setLayoutMode} />

        {/* 수식너비 버튼 — HWP 자체 수식 너비가 충분하므로 비활성화
        <button
          onClick={handleFixEquationWidth}
          disabled={hwpBusy}
          className={`px-3 py-1 rounded transition-colors ${
            hwpBusy
              ? 'bg-gray-400 text-white cursor-wait'
              : 'bg-gray-600 text-white hover:bg-gray-700'
          }`}
          title="HWP 파일의 수식 너비를 자동 조정합니다"
        >
          {eqFixing ? '수식 조정 중...' : '수식 너비'}
        </button>
        */}

        <button
          onClick={handleExportHwp}
          disabled={hwpBusy}
          className={`px-3 py-1 rounded transition-colors ${
            hwpBusy
              ? 'bg-gray-400 text-white cursor-wait'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {hwpExporting ? 'HWP 작성 중...' : '전체 HWP 작성'}
        </button>
      </div>

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />

      {/* 커서 위치 확인 다이얼로그 (PRD §4.6.1) */}
      {showCursorDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">커서 위치 확인</h3>
            <p className="text-sm text-gray-600 mb-4">
              한글 문서의 커서가 문서 끝이 아닙니다.
              현재 커서 위치에 콘텐츠가 삽입됩니다. 계속 진행하시겠습니까?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCursorDialog(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={doExport}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                계속 작성
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
