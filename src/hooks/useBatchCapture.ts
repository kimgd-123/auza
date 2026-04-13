import { useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { BatchCaptureSegment, BatchCaptureState } from '@/types'

let segCounter = 0

export function useBatchCapture() {
  const {
    batchCaptureState,
    setBatchCaptureState,
    updateBatchCaptureState,
    addBatchSegment,
    updateBatchSegment,
    removeBatchSegment,
  } = useAppStore()

  /** 일괄 캡처 모드 시작 */
  const startBatchMode = useCallback(() => {
    setBatchCaptureState({
      active: true,
      status: 'capturing',
      segments: [],
    })
  }, [setBatchCaptureState])

  /** 일괄 캡처 모드 종료 */
  const stopBatchMode = useCallback(() => {
    setBatchCaptureState(null)
  }, [setBatchCaptureState])

  /** 캡처 추가 + 비동기 OD 감지 */
  const addCapture = useCallback(
    async (captureBase64: string, pageNum: number, bboxNorm: number[], pdfPath: string | null) => {
      segCounter += 1
      const id = `batch_${Date.now()}_${segCounter}`
      const seg: BatchCaptureSegment = {
        id,
        pageNum,
        bboxNorm,
        pdfPath,
        captureBase64,
        status: 'detecting',
      }
      addBatchSegment(seg)

      // 비동기 OD 감지
      try {
        const result = await window.electronAPI.detectRegions(captureBase64)
        if (result.error) {
          updateBatchSegment(id, { status: 'error', error: result.error })
        } else {
          // 클라이언트 UUID 부여 (OdReviewOverlay 선택/삭제에 필수)
          const detections = result.detections.map((d, idx) => ({
            ...d,
            id: d.id || `od_${Date.now()}_${idx}`,
          }))
          updateBatchSegment(id, {
            status: 'detected',
            detections,
            imageWidth: result.imageWidth,
            imageHeight: result.imageHeight,
          })
        }
      } catch (err) {
        updateBatchSegment(id, {
          status: 'error',
          error: (err as Error).message,
        })
      }
    },
    [addBatchSegment, updateBatchSegment],
  )

  /** 리뷰 모드 진입 */
  const startReview = useCallback(() => {
    updateBatchCaptureState({ status: 'reviewing' })
  }, [updateBatchCaptureState])

  /** 일괄 변환 + 블록 생성 (병렬) */
  const batchConvertAndInsert = useCallback(async () => {
    // 최신 상태에서 segments 읽기 (handleConfirm에서 저장한 편집 detections 포함)
    const state = useAppStore.getState().batchCaptureState
    if (!state) return

    updateBatchCaptureState({ status: 'converting' })

    const segments = state.segments.filter(
      (s) => (s.status === 'detected' || s.status === 'reviewed') && s.captureBase64,
    )

    // 순차 변환 — Python 백엔드가 단일 stdin 루프이므로
    // 병렬 enqueue 시 뒤 요청이 대기 중 timeout될 수 있음
    const results: Array<{ seg: typeof segments[0]; html: string } | null> = []
    for (const seg of segments) {
      updateBatchSegment(seg.id, { status: 'converting' })
      try {
        const activeDets = (seg.detections || []).filter((d) => d.region !== 'abandon')
        const result = await window.electronAPI.convertRegions({
          imageBase64: seg.captureBase64!,
          detections: activeDets,
          pdfPath: seg.pdfPath || undefined,
          pageNum: seg.pageNum,
          captureBboxNorm: seg.bboxNorm,
        })
        if (result.html) {
          updateBatchSegment(seg.id, { status: 'converted', convertedHtml: result.html })
          results.push({ seg, html: result.html })
        } else {
          updateBatchSegment(seg.id, { status: 'error', error: result.error || '변환 실패' })
          results.push(null)
        }
      } catch (err) {
        updateBatchSegment(seg.id, { status: 'error', error: (err as Error).message })
        results.push(null)
      }
    }

    // 세그먼트별 개별 블록 생성
    const store = useAppStore.getState()
    for (const r of results) {
      if (!r) continue
      const { seg, html } = r

      // 블록 생성
      store.addBlock()
      const blocks = useAppStore.getState().blocks
      const newBlock = blocks[blocks.length - 1]
      if (!newBlock) continue

      const title = `캡처 p.${seg.pageNum + 1}`
      store.updateBlock(newBlock.id, { title })
      store.setActiveBlockId(newBlock.id)

      // Asset 등록 (캡처 이미지)
      const { useAssetStore } = await import('@/stores/assetStore')
      if (seg.captureBase64) {
        useAssetStore.getState().registerAsset({
          type: 'capture',
          base64: seg.captureBase64,
          alt: `캡처 p.${seg.pageNum + 1}`,
          sourceBlock: newBlock.id,
          sourcePage: seg.pageNum + 1,
        })
      }

      // SavedOdData 저장 (재편집용)
      if (seg.detections) {
        store.saveOdData(newBlock.id, {
          imageBase64: seg.captureBase64!,
          imageWidth: seg.imageWidth || 0,
          imageHeight: seg.imageHeight || 0,
          pdfPath: seg.pdfPath,
          pageNum: seg.pageNum,
          captureBboxNorm: seg.bboxNorm,
          detections: seg.detections,
        })
      }

      // HTML 삽입
      store.setPendingBlockHtml(newBlock.id, html)
      // 블록이 접혀 있으면 펼기
      const collapsed = useAppStore.getState().collapsedBlockIds
      if (collapsed.has(newBlock.id)) {
        store.toggleBlockCollapse(newBlock.id)
      }
      window.dispatchEvent(
        new CustomEvent('auza:insertHtml', { detail: { blockId: newBlock.id, html } }),
      )
    }

    // 실패 세그먼트가 있으면 queue 유지 (재시도 가능), 전부 성공이면 클리어
    const finalState = useAppStore.getState().batchCaptureState
    const hasErrors = finalState?.segments.some((s) => s.status === 'error')
    if (hasErrors) {
      updateBatchCaptureState({ status: 'capturing' })
    } else {
      updateBatchCaptureState({ status: 'done' })
      setTimeout(() => setBatchCaptureState(null), 500)
    }
  }, [updateBatchCaptureState, updateBatchSegment, setBatchCaptureState])

  /** 실패한 세그먼트를 reviewed로 복원 → 재리뷰/재변환 가능 */
  const retryErrorSegments = useCallback(() => {
    const state = useAppStore.getState().batchCaptureState
    if (!state) return
    for (const seg of state.segments) {
      if (seg.status === 'error' && seg.detections) {
        updateBatchSegment(seg.id, { status: 'detected', error: undefined })
      }
    }
  }, [updateBatchSegment])

  return {
    batchCaptureState,
    startBatchMode,
    stopBatchMode,
    addCapture,
    removeCapture: removeBatchSegment,
    updateBatchSegment,
    startReview,
    batchConvertAndInsert,
    retryErrorSegments,
  }
}
