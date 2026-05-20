import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'

const HWP_POLL_INTERVAL = 15_000 // 15초마다 연결 상태 확인

export default function StatusBar() {
  const { blocks, hwpConnected, setHwpConnected, hwpExporting, hwpExportError, setHwpExportError, currentPage, totalPages, openReleaseNotes } = useAppStore()
  const [connecting, setConnecting] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 주기적 HWP 연결 상태 폴링
  // v2.4.0 핫픽스: 변환/캡처 등 무거운 Python IPC 진행 중엔 polling skip.
  // Why: Python 백엔드는 단일 stdin 큐 구조라 od_convert_many(수십 분) 같은 장기 작업 중엔
  //   check_hwp 가 큐에서 대기 → polling timeout → v2.3.2 자동 복구가 Python child 를
  //   강제 종료 → 진행 중이던 변환도 함께 사망. 변환 중엔 HWP 상태를 즉시 알 필요 없음.
  // 작업 종료 후 다음 15초에 자동 polling 복귀.
  useEffect(() => {
    const poll = async () => {
      if (!window.electronAPI?.checkHwp) return
      const state = useAppStore.getState()
      const busy =
        state.batchCaptureState?.status === 'converting' ||
        state.captureLoading ||
        state.hwpExporting ||
        state.twoColumnRunning
      if (busy) return
      try {
        const result = await window.electronAPI.checkHwp()
        setHwpConnected(result.connected)
      } catch {
        // 폴링 실패는 무시
      }
    }

    pollingRef.current = setInterval(poll, HWP_POLL_INTERVAL)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [setHwpConnected])

  const handleConnect = async () => {
    if (connecting || !window.electronAPI?.connectHwp) return
    setConnecting(true)
    try {
      const result = await window.electronAPI.connectHwp()
      setHwpConnected(result.connected)
      if (!result.connected) {
        setHwpExportError(result.error || '한글 연결에 실패했습니다.')
      } else {
        setHwpExportError(null)
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="flex items-center h-7 px-4 bg-gray-100 border-t border-gray-200 text-xs text-gray-500 gap-4 flex-shrink-0">
      <span data-tutorial="hwp-connect" className="flex items-center gap-1">
        HWP: {hwpConnected ? (
          <span className="text-green-600 font-medium">연결됨</span>
        ) : (
          <>
            <span className="text-gray-400">미연결</span>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="text-blue-500 hover:text-blue-700 hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              {connecting ? '연결 중...' : '연결'}
            </button>
          </>
        )}
      </span>
      <span className="border-l border-gray-300 pl-4">
        블록: {blocks.length}개
      </span>
      {totalPages > 0 && (
        <span className="border-l border-gray-300 pl-4">
          PDF: {currentPage} / {totalPages}
        </span>
      )}
      {hwpExporting && (
        <span className="border-l border-gray-300 pl-4 text-orange-600">
          HWP 작성 중...
        </span>
      )}
      {hwpExportError && (
        <span className="border-l border-gray-300 pl-4 text-red-500 flex items-center gap-1">
          {hwpExportError}
          <button onClick={() => setHwpExportError(null)} className="text-red-400 hover:text-red-600 ml-1">x</button>
        </span>
      )}
      <div className="flex-1" />
      <button
        onClick={() => openReleaseNotes(false)}
        className="hover:text-blue-600 hover:underline"
        title="업데이트 내역 보기"
      >
        AUZA v{__APP_VERSION__}
      </button>
    </div>
  )
}
