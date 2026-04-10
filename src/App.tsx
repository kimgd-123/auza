import { useEffect } from 'react'
import MainLayout from './components/layout/MainLayout'
import OdReReviewModal from './components/editor/OdReReviewModal'
import ReleaseNotesDialog from './components/layout/ReleaseNotesDialog'
import { useSessionAutoSave, useSessionRecovery } from './lib/use-session'
import { useAppStore } from './stores/appStore'

function SessionRecoveryDialog() {
  const { pendingSession, checked, corruptError, pdfRecoveryError, acceptRecovery, rejectRecovery, dismissCorruptError, dismissPdfRecoveryError } = useSessionRecovery()

  // 손상된 세션 파일 알림
  if (corruptError) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">세션 복구 실패</h3>
          <p className="text-sm text-gray-600 mb-4">
            {corruptError}
          </p>
          <div className="flex justify-end">
            <button
              onClick={dismissCorruptError}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    )
  }

  // PDF 복구 실패 배너
  if (pdfRecoveryError) {
    return (
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 max-w-lg">
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 shadow-lg flex items-start gap-3">
          <span className="text-amber-600 text-sm flex-1">{pdfRecoveryError}</span>
          <button onClick={dismissPdfRecoveryError} className="text-amber-400 hover:text-amber-600 text-sm font-bold">x</button>
        </div>
      </div>
    )
  }

  if (checked) return null
  if (!pendingSession) return null

  const blockCount = pendingSession.blocks.length
  const savedAt = new Date(pendingSession.savedAt).toLocaleString('ko-KR')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">세션 복구</h3>
        <p className="text-sm text-gray-600 mb-1">
          이전 작업을 복구하시겠습니까?
        </p>
        <p className="text-xs text-gray-400 mb-4">
          {blockCount}개 블록 | 저장 시각: {savedAt}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={rejectRecovery}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            아니오
          </button>
          <button
            onClick={acceptRecovery}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            복구
          </button>
        </div>
      </div>
    </div>
  )
}

function AutoSaveProvider({ children }: { children: React.ReactNode }) {
  useSessionAutoSave()

  // 앱 시작 시 HWP 연결 상태 동기화
  useEffect(() => {
    if (!window.electronAPI?.checkHwp) return
    window.electronAPI.checkHwp().then((result) => {
      useAppStore.getState().setHwpConnected(result.connected)
    })
  }, [])

  return <>{children}</>
}

function ReleaseNotesDialogHost() {
  const { releaseNotesOpen, releaseNotesAutoShown, closeReleaseNotes } = useAppStore()
  // 닫힐 때 완전히 unmount → 다음 열림 시 selectedVersion이 항상 최신 버전으로 초기화됨
  // (Codex recheck #2에서 잡은 회귀: 이전 선택 버전이 그대로 유지되던 문제)
  if (!releaseNotesOpen) return null
  return (
    <ReleaseNotesDialog
      open={true}
      onClose={closeReleaseNotes}
      autoShown={releaseNotesAutoShown}
    />
  )
}

function App() {
  return (
    <AutoSaveProvider>
      <SessionRecoveryDialog />
      <MainLayout />
      <OdReReviewModal />
      <ReleaseNotesDialogHost />
    </AutoSaveProvider>
  )
}

export default App
