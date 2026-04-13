import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useBatchCapture } from '@/hooks/useBatchCapture'
import OdReviewOverlay from './OdReviewOverlay'
import type { OdDetection } from '@/types'

export default function BatchReviewModal() {
  const { batchCaptureState } = useAppStore()
  const { updateBatchSegment, batchConvertAndInsert, stopBatchMode } = useBatchCapture()
  const [activeTab, setActiveTab] = useState(0)
  const autoConvertFired = useRef(false)
  const currentDetsRef = useRef<OdDetection[] | null>(null)

  // 리뷰 가능한 세그먼트 (detected + reviewed)
  const tabSegments = useMemo(() => {
    if (!batchCaptureState) return []
    return batchCaptureState.segments
      .map((seg, idx) => ({ seg, idx }))
      .filter(({ seg }) =>
        (seg.status === 'detected' || seg.status === 'reviewed') &&
        seg.captureBase64 &&
        seg.detections
      )
  }, [batchCaptureState])

  // 리뷰 가능한 세그먼트가 없으면 자동 변환
  useEffect(() => {
    if (!batchCaptureState || batchCaptureState.status !== 'reviewing') return
    if (tabSegments.length === 0 && !autoConvertFired.current) {
      autoConvertFired.current = true
      batchConvertAndInsert()
    }
  }, [batchCaptureState, tabSegments.length, batchConvertAndInsert])

  if (!batchCaptureState || batchCaptureState.status !== 'reviewing') return null
  if (tabSegments.length === 0) return null

  const currentTab = tabSegments[Math.min(activeTab, tabSegments.length - 1)]
  if (!currentTab) return null

  const { seg } = currentTab

  const handleConfirm = (editedDetections: OdDetection[]) => {
    console.log(`[batch-review] confirm seg ${seg.id}: ${editedDetections.length} dets, ids: ${editedDetections.map(d=>d.id).join(',')}`)
    updateBatchSegment(seg.id, { detections: editedDetections, status: 'reviewed' })

    // 다음 미리뷰 탭으로 이동
    const nextUnreviewed = tabSegments.findIndex(
      (t, i) => i > activeTab && t.seg.status === 'detected'
    )
    if (nextUnreviewed !== -1) {
      setActiveTab(nextUnreviewed)
    } else if (activeTab < tabSegments.length - 1) {
      setActiveTab(activeTab + 1)
    } else {
      // 모든 탭 리뷰 완료 → 변환 실행
      batchConvertAndInsert()
    }
  }

  const handleSkipAll = () => {
    // 현재 탭의 편집 상태 저장
    if (currentDetsRef.current && seg.id) {
      updateBatchSegment(seg.id, { detections: currentDetsRef.current, status: 'reviewed' })
    }
    // 나머지 detected를 reviewed로 마킹
    for (const { seg: s } of tabSegments) {
      if (s.status === 'detected') {
        updateBatchSegment(s.id, { status: 'reviewed' })
      }
    }
    batchConvertAndInsert()
  }

  const handleCancel = () => {
    stopBatchMode()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-lg shadow-xl flex flex-col" style={{ maxWidth: 780, maxHeight: '92vh', width: '95vw' }}>
        {/* 탭 헤더 */}
        <div className="px-4 py-2 border-b bg-gray-50 rounded-t-lg flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabSegments.map(({ seg: s }, i) => (
              <button
                key={s.id}
                onClick={() => {
                  // 탭 전환 전 현재 탭의 편집 상태 자동 저장
                  if (currentDetsRef.current && seg.id) {
                    updateBatchSegment(seg.id, { detections: currentDetsRef.current, status: 'reviewed' })
                  }
                  currentDetsRef.current = null
                  setActiveTab(i)
                }}
                className={`px-2 py-1 text-xs rounded font-medium flex-shrink-0 ${
                  i === activeTab
                    ? 'bg-blue-600 text-white'
                    : s.status === 'reviewed'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            <button
              onClick={handleSkipAll}
              className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
            >
              전체 건너뛰기
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
            >
              취소
            </button>
          </div>
        </div>

        {/* OdReviewOverlay — key로 강제 remount (Finding 3 대응) */}
        <div className="flex-1 min-h-0 overflow-auto">
          <OdReviewOverlay
            key={seg.id}
            detections={seg.detections!}
            captureBase64={seg.captureBase64!}
            captureImageSize={{ w: seg.imageWidth || 800, h: seg.imageHeight || 600 }}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            embedded
            onDetsChange={(dets) => { currentDetsRef.current = dets }}
          />
        </div>

        {/* 하단 */}
        <div className="px-4 py-2 border-t bg-gray-50 rounded-b-lg flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-500">
            {activeTab + 1} / {tabSegments.length} | p.{seg.pageNum + 1}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              취소
            </button>
            <button
              onClick={() => handleConfirm(currentDetsRef.current || seg.detections!)}
              className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              확인 ({(currentDetsRef.current || seg.detections || []).filter(d => d.region !== 'abandon').length}개)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
