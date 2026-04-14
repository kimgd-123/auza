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

    // 일괄 변환 — 단일 IPC 호출, Python 내부에서 모든 세그먼트의 Gemini 호출을
    // 하나의 ThreadPoolExecutor로 병렬 처리 (워커 수는 AUZA_GEMINI_PARALLEL, 기본 4)
    for (const seg of segments) {
      updateBatchSegment(seg.id, { status: 'converting' })
    }

    const results: Array<{ seg: typeof segments[0]; html: string } | null> = []
    try {
      const payload = {
        segments: segments.map((seg) => ({
          imageBase64: seg.captureBase64!,
          detections: (seg.detections || []).filter((d) => d.region !== 'abandon'),
          pdfPath: seg.pdfPath || undefined,
          pageNum: seg.pageNum,
          captureBboxNorm: seg.bboxNorm,
        })),
      }
      const res = await window.electronAPI.convertManyRegions(payload)
      const manyResults = res.results || []

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const r = manyResults[i]
        if (r && r.html) {
          updateBatchSegment(seg.id, { status: 'converted', convertedHtml: r.html })
          if (r.error) {
            // 부분 성공: HTML은 있지만 일부 영역 실패 → 비차단 경고
            console.warn(`[batch-capture] seg ${seg.id} 부분 오류:`, r.error)
          }
          results.push({ seg, html: r.html })
        } else {
          const errMsg = (r && r.error) || res.error || '변환 실패'
          updateBatchSegment(seg.id, { status: 'error', error: errMsg })
          results.push(null)
        }
      }

      // 전체 호출이 실패해 results가 비어있는 경우(혹은 길이 불일치): 남은 세그먼트를 일괄 error 처리
      if (manyResults.length < segments.length) {
        for (let i = manyResults.length; i < segments.length; i++) {
          updateBatchSegment(segments[i].id, {
            status: 'error',
            error: res.error || '변환 결과 누락',
          })
          results.push(null)
        }
      }
    } catch (err) {
      const message = (err as Error).message
      for (const seg of segments) {
        updateBatchSegment(seg.id, { status: 'error', error: message })
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

  /** 실패한 세그먼트를 reviewed로 복원 → 재리뷰/재변환 가능
   *  Why: 변환(converting) 중에 호출되면 in-flight 루프의 snapshot과 상태가 갈려
   *       재변환 없이 큐가 비어버리는 회귀가 있었음. UI에서도 버튼을 숨기지만
   *       훅 수준에서도 이중 방어.
   */
  const retryErrorSegments = useCallback(() => {
    const state = useAppStore.getState().batchCaptureState
    if (!state) return
    if (state.status === 'converting') {
      console.warn('[batch-capture] 변환 중에는 재시도 불가')
      return
    }
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
