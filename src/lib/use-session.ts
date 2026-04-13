/**
 * 세션 자동 저장/복구 훅
 *
 * PRD §4.6.5: 에디터 블록 변경 시 %APPDATA%/AUZA/session.json에 자동 저장
 * 앱 시작 시 세션 파일이 있으면 복구 다이얼로그 표시
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { SessionData } from '@/types'

const DEBOUNCE_MS = 1000

export function useSessionAutoSave() {
  const blocks = useAppStore((s) => s.blocks)
  const pdfPath = useAppStore((s) => s.pdfPath)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    // 초기 로딩 시에는 저장하지 않음
    if (!initializedRef.current) {
      initializedRef.current = true
      return
    }

    if (!window.electronAPI?.saveSession) return

    // debounce
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const data: SessionData = {
        blocks,
        pdfPath,
        savedAt: Date.now(),
      }
      window.electronAPI.saveSession(JSON.stringify(data))
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [blocks, pdfPath])
}

export function useSessionRecovery() {
  const [pendingSession, setPendingSession] = useState<SessionData | null>(null)
  const [checked, setChecked] = useState(false)
  const [corruptError, setCorruptError] = useState<string | null>(null)
  const [pdfRecoveryError, setPdfRecoveryError] = useState<string | null>(null)

  // 앱 시작 시 세션 확인
  useEffect(() => {
    if (!window.electronAPI?.loadSession) {
      setChecked(true)
      return
    }

    window.electronAPI.loadSession().then((result) => {
      if (result.error) {
        // 세션 파일 손상 — 사용자에게 알리고 파일 정리
        console.warn('[session]', result.error)
        setCorruptError(result.error)
        window.electronAPI?.clearSession?.()
        return
      }
      if (result.data) {
        try {
          const session = JSON.parse(result.data) as SessionData
          if (session.blocks && session.blocks.length > 0) {
            setPendingSession(session)
            return
          }
        } catch { /* invalid JSON — already validated in main */ }
      }
      setChecked(true)
    })
  }, [])

  const acceptRecovery = useCallback(() => {
    if (!pendingSession) return
    const store = useAppStore.getState()

    // 블록 복구
    for (const block of pendingSession.blocks) {
      store.addBlock()
      const newBlocks = useAppStore.getState().blocks
      const lastBlock = newBlocks[newBlocks.length - 1]
      store.updateBlock(lastBlock.id, {
        title: block.title,
        content: block.content,
      })
    }

    // PDF 경로 복구 (allowlist에 먼저 등록)
    if (pendingSession.pdfPath) {
      const pdfPathToRestore = pendingSession.pdfPath
      window.electronAPI?.allowPdf?.(pdfPathToRestore).then((res) => {
        if (res?.success) {
          // canonical path 사용 — allowlist와 store가 동일한 경로를 참조
          useAppStore.getState().setPdfPath(res.canonicalPath || pdfPathToRestore)
        } else {
          console.warn('[session] PDF 복구 실패:', pdfPathToRestore)
          setPdfRecoveryError(`블록은 복구되었지만 PDF를 찾지 못했습니다: ${pdfPathToRestore}`)
        }
      })
    }

    setPendingSession(null)
    setChecked(true)
  }, [pendingSession])

  const rejectRecovery = useCallback(() => {
    setPendingSession(null)
    setChecked(true)
    // 세션 파일 삭제
    window.electronAPI?.clearSession?.()
  }, [])

  const dismissCorruptError = useCallback(() => {
    setCorruptError(null)
    setChecked(true)
  }, [])

  const dismissPdfRecoveryError = useCallback(() => {
    setPdfRecoveryError(null)
  }, [])

  return {
    pendingSession,
    checked,
    corruptError,
    pdfRecoveryError,
    acceptRecovery,
    rejectRecovery,
    dismissCorruptError,
    dismissPdfRecoveryError,
  }
}
