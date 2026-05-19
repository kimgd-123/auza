import { useAppStore } from '@/stores/appStore'
import { useTwoColumnCapture } from '@/hooks/useTwoColumnCapture'

interface Props {
  pdfData: Uint8Array | null
}

/**
 * 2단 자동 캡처 가이드 배너 (v2.4.0)
 *
 * - 도구바 아래 인라인 배너 (PDF 영역을 가리지 않음)
 * - 단계 표시 (col1 → col2 → ready), 다시 잡기, 실행 버튼
 * - 영역 시각화는 AreaCapture 가 percent 좌표로 PDF 위에 직접 그림
 */
export default function TwoColumnGuide({ pdfData }: Props) {
  const {
    twoColumnMode, twoColumnRegions, twoColumnStep,
    setTwoColumnMode, setTwoColumnStep, resetTwoColumn,
    totalPages, currentPage, setCurrentPage,
  } = useAppStore()
  const { running, progress, error, run } = useTwoColumnCapture()

  if (!twoColumnMode) return null

  const col1Set = !!twoColumnRegions?.col1 && twoColumnRegions.col1.w > 0
  const col2Set = !!twoColumnRegions?.col2 && twoColumnRegions.col2.w > 0
  const ready = col1Set && col2Set

  const handleExit = () => {
    setTwoColumnMode(false)
    resetTwoColumn()
  }

  const handleRun = async () => {
    if (!pdfData) return
    if (currentPage !== 1) setCurrentPage(1)
    await run(pdfData)
  }

  // 단계별 큰 안내 문구
  const stepMessage =
    twoColumnStep === 'col1' ? '① 1단(왼쪽 단) 영역을 드래그' :
    twoColumnStep === 'col2' ? '② 2단(오른쪽 단) 영역을 드래그' :
    '두 영역 설정 완료 — 실행 가능'

  return (
    <div className="border-b border-orange-200 bg-orange-50 px-3 py-2 flex-shrink-0">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-orange-800">2단 자동 캡처</span>

        {/* 단계 인디케이터 */}
        <div className="flex items-center gap-1.5">
          <StepBadge
            num={1}
            active={twoColumnStep === 'col1'}
            done={col1Set}
            color="blue"
            onClick={() => setTwoColumnStep('col1')}
          />
          <span className="text-gray-300 text-xs">→</span>
          <StepBadge
            num={2}
            active={twoColumnStep === 'col2'}
            done={col2Set}
            color="green"
            onClick={() => setTwoColumnStep('col2')}
          />
        </div>

        <span className="text-xs text-gray-700">{stepMessage}</span>

        {currentPage !== 1 && !ready && (
          <span className="text-[11px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
            1페이지에서 지정 (현재 p.{currentPage})
          </span>
        )}

        <div className="flex-1" />

        {/* 진행률 (실행 중) */}
        {progress && (
          <div className="flex items-center gap-1.5 text-[11px] text-blue-800 bg-blue-50 px-2 py-1 rounded">
            <span>{progress.detail}</span>
            <span className="font-semibold">
              {progress.current}/{progress.total}
            </span>
          </div>
        )}

        {error && (
          <span className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded">
            {error}
          </span>
        )}

        <button
          onClick={handleRun}
          disabled={!ready || running || !pdfData || totalPages === 0}
          className={`text-xs px-3 py-1 rounded font-semibold ${
            ready && !running
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {running ? '실행 중...' : ready ? `전체 ${totalPages}p 적용 + OD 실행` : '두 영역 지정 필요'}
        </button>

        <button
          onClick={handleExit}
          className="text-xs text-gray-500 hover:text-gray-800 px-1"
          title="2단 자동 모드 종료"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

interface StepBadgeProps {
  num: 1 | 2
  active: boolean
  done: boolean
  color: 'blue' | 'green'
  onClick: () => void
}

function StepBadge({ num, active, done, color, onClick }: StepBadgeProps) {
  const colorMap = {
    blue: {
      done: 'bg-blue-600 text-white',
      active: 'bg-blue-100 text-blue-700 ring-2 ring-blue-400',
      idle: 'bg-gray-100 text-gray-500',
    },
    green: {
      done: 'bg-green-600 text-white',
      active: 'bg-green-100 text-green-700 ring-2 ring-green-400',
      idle: 'bg-gray-100 text-gray-500',
    },
  }
  const state = done ? 'done' : active ? 'active' : 'idle'
  const titleSuffix = done ? ' (다시 잡기)' : ''
  return (
    <button
      onClick={onClick}
      title={`${num}단 영역${titleSuffix}`}
      className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors hover:opacity-80 ${colorMap[color][state]}`}
    >
      {done ? '✓' : num}
    </button>
  )
}
