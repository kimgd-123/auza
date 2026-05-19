import { useCallback, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useBatchCapture } from './useBatchCapture'
import type { TwoColumnRegions } from '@/types'

interface RunProgress {
  current: number
  total: number
  detail: string
}

interface UseTwoColumnCaptureReturn {
  running: boolean
  progress: RunProgress | null
  error: string | null
  run: (pdfData: Uint8Array) => Promise<void>
}

/**
 * 2단 자동 캡처 hook (v2.4.0)
 *
 * 사용자가 1페이지에서 지정한 col1/col2 비율을 PDF 전체 페이지에 적용.
 * 각 페이지를 고해상도(300dpi)로 렌더링 → 두 영역 크롭 → BatchCaptureSegment 큐에 추가.
 * 큐에 들어간 세그먼트는 useBatchCapture.addCapture 가 비동기 detectRegions 를 트리거.
 * 모든 페이지 큐잉 완료 후 BatchCaptureState.status = 'reviewing' 으로 전환.
 */
export function useTwoColumnCapture(): UseTwoColumnCaptureReturn {
  const {
    twoColumnRegions, twoColumnMode, setTwoColumnRunning,
    pdfPath, totalPages,
    setBatchCaptureState, updateBatchCaptureState,
  } = useAppStore()
  const { addCapture } = useBatchCapture()

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (pdfData: Uint8Array) => {
      const regions = twoColumnRegions
      if (!regions || regions.col1.w === 0 || regions.col2.w === 0) {
        setError('1단/2단 영역이 모두 지정되어야 합니다.')
        return
      }
      if (totalPages <= 0) {
        setError('PDF가 로드되지 않았습니다.')
        return
      }

      setRunning(true)
      setTwoColumnRunning(true)
      setError(null)
      setProgress({ current: 0, total: totalPages, detail: 'PDF 열기 중...' })

      // 새 배치 시작 — 기존 큐 초기화
      setBatchCaptureState({ active: true, status: 'capturing', segments: [] })

      try {
        const { pdfjs } = await import('react-pdf')
        const loadingTask = pdfjs.getDocument({ data: pdfData.slice() })
        const pdfDoc = await loadingTask.promise

        // 300dpi 렌더링 스케일 (PDF 기본 72dpi 기준)
        const HIRES_SCALE = 300 / 72

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          setProgress({
            current: pageNum,
            total: totalPages,
            detail: `p.${pageNum} 렌더링 중...`,
          })

          const page = await pdfDoc.getPage(pageNum)
          const viewport = page.getViewport({ scale: HIRES_SCALE })

          // 페이지 전체를 오프스크린 캔버스에 렌더링
          const pageCanvas = document.createElement('canvas')
          pageCanvas.width = Math.round(viewport.width)
          pageCanvas.height = Math.round(viewport.height)
          const pageCtx = pageCanvas.getContext('2d')
          if (!pageCtx) {
            console.warn(`[two-column] p.${pageNum} canvas context 실패`)
            continue
          }
          await page.render({ canvasContext: pageCtx, viewport }).promise

          // 두 영역 크롭 → batch 큐 추가
          for (const which of ['col1', 'col2'] as const) {
            const norm = regions[which]
            const cropX = Math.round(norm.x * viewport.width)
            const cropY = Math.round(norm.y * viewport.height)
            const cropW = Math.round(norm.w * viewport.width)
            const cropH = Math.round(norm.h * viewport.height)
            if (cropW < 10 || cropH < 10) continue

            const cropCanvas = document.createElement('canvas')
            cropCanvas.width = cropW
            cropCanvas.height = cropH
            const cropCtx = cropCanvas.getContext('2d')
            if (!cropCtx) continue
            cropCtx.drawImage(pageCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

            const base64 = cropCanvas
              .toDataURL('image/png')
              .replace(/^data:image\/png;base64,/, '')
            const bboxNorm = [norm.x, norm.y, norm.x + norm.w, norm.y + norm.h]

            // detectRegions 는 addCapture 내부에서 비동기 트리거 — 여기서는 fire-and-forget
            void addCapture(base64, pageNum - 1, bboxNorm, pdfPath)
          }

          // 페이지 캔버스 정리
          pageCanvas.width = 0
          pageCanvas.height = 0
        }

        pdfDoc.destroy()

        // Codex F2: 큐잉 완료 후 모든 detect 완료까지 polling, 그 다음에 reviewing 으로 전환.
        // 큐잉 직후 reviewing 으로 가면 BatchCaptureQueue 가 숨겨져 진행 표시가 사라지고,
        // BatchReviewModal 수동 변환 경로(확인/전체 건너뛰기)가 미완료 segment 를 누락시킬 수 있음.
        const POLL_INTERVAL_MS = 500
        const POLL_TIMEOUT_MS = 60 * 60 * 1000  // 60분 절대 상한 (batch dynamic timeout 과 동일)
        const pollStart = Date.now()
        while (true) {
          const state = useAppStore.getState().batchCaptureState
          // 큐가 사라졌으면(사용자가 모드 종료) polling 종료
          if (!state || !state.active) break
          const segments = state.segments
          const pending = segments.filter(
            (s) => s.status === 'detecting' || s.status === 'capturing',
          ).length
          const done = segments.length - pending
          setProgress({
            current: done,
            total: segments.length,
            detail: pending > 0 ? `검출 중 (${pending}개 남음)` : '검출 완료',
          })
          if (pending === 0) break
          if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
            setError('검출 단계가 60분 안에 끝나지 않아 검토 단계로 강제 전환합니다.')
            break
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }
        updateBatchCaptureState({ status: 'reviewing' })
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setRunning(false)
        setTwoColumnRunning(false)
      }
    },
    [
      twoColumnRegions, totalPages, pdfPath,
      addCapture, setBatchCaptureState, updateBatchCaptureState, setTwoColumnRunning,
    ],
  )

  return { running, progress, error, run }
}
