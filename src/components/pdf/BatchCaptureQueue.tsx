import { useBatchCapture } from '@/hooks/useBatchCapture'

export default function BatchCaptureQueue() {
  const { batchCaptureState, removeCapture, startReview, stopBatchMode, retryErrorSegments } = useBatchCapture()

  if (!batchCaptureState || !batchCaptureState.active) return null
  // 리뷰 중이거나 done이면 숨김 (모달이 대신 처리)
  if (batchCaptureState.status === 'reviewing' || batchCaptureState.status === 'done') return null

  const isConverting = batchCaptureState.status === 'converting'
  const segments = batchCaptureState.segments
  const detectedCount = segments.filter((s) => s.status === 'detected' || s.status === 'reviewed').length
  const detectingCount = segments.filter((s) => s.status === 'detecting').length
  const convertingCount = segments.filter((s) => s.status === 'converting').length
  const convertedCount = segments.filter((s) => s.status === 'converted').length
  const errorCount = segments.filter((s) => s.status === 'error').length
  const canReview = detectedCount > 0 && detectingCount === 0 && !isConverting

  return (
    <div className="border-b border-gray-200 bg-gray-50 flex-shrink-0">
      <div className="px-3 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="font-medium text-gray-800">일괄 캡처</span>
          <span>{segments.length}개</span>
          {detectingCount > 0 && (
            <span className="text-orange-600">
              <svg className="w-3 h-3 animate-spin inline mr-0.5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
              </svg>
              {detectingCount}개 감지 중
            </span>
          )}
          {isConverting && (
            <span className="text-blue-600">
              <svg className="w-3 h-3 animate-spin inline mr-0.5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
              </svg>
              변환 중 {convertedCount}/{segments.length}
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-red-600">
              {errorCount}개 오류
              {!isConverting && (
                <button
                  onClick={retryErrorSegments}
                  className="ml-1 underline hover:text-red-800"
                >
                  재시도
                </button>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startReview}
            disabled={!canReview}
            className={`px-3 py-1 text-xs rounded font-medium ${
              canReview
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            리뷰 ({detectedCount})
          </button>
          <button
            onClick={stopBatchMode}
            disabled={isConverting}
            className={`px-2 py-1 text-xs rounded ${isConverting ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
          >
            취소
          </button>
        </div>
      </div>

      {/* 썸네일 스트립 — 인라인 */}
      {segments.length > 0 && (
        <div className="px-3 pb-1.5 flex gap-1.5 overflow-x-auto">
          {segments.map((seg, idx) => (
            <div
              key={seg.id}
              className="relative flex-shrink-0 w-10 h-10 rounded border border-gray-300 overflow-hidden group"
            >
              {seg.captureBase64 && (
                <img
                  src={`data:image/png;base64,${seg.captureBase64}`}
                  alt={`캡처 ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              )}
              {/* 상태 오버레이 */}
              <div className="absolute inset-0 flex items-center justify-center">
                {seg.status === 'detecting' && (
                  <svg className="w-4 h-4 animate-spin text-white drop-shadow" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
                  </svg>
                )}
                {seg.status === 'detected' && (
                  <span className="text-green-500 text-lg drop-shadow font-bold">&#10003;</span>
                )}
                {seg.status === 'error' && (
                  <span className="text-red-500 text-lg drop-shadow font-bold">!</span>
                )}
              </div>
              {/* 페이지 번호 */}
              <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl">
                p.{seg.pageNum + 1}
              </span>
              {/* 삭제 버튼 */}
              <button
                onClick={() => !isConverting && removeCapture(seg.id)}
                className={`absolute top-0 right-0 bg-black/60 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-bl transition-opacity ${isConverting ? 'hidden' : 'opacity-0 group-hover:opacity-100'}`}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
