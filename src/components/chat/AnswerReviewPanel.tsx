import { useMemo, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { AnswerSolutionItem, EditorBlock } from '@/types'

/**
 * 정답 검토 패널 (v2.5.0)
 *
 * 채팅 패널 [📋 정답 검토] 탭에서 사용. 블록별 정답 일람, 체크박스 진행상황,
 * 행 클릭 시 에디터에서 해당 블록으로 스크롤 + (옵션) 접힌 블록 자동 펼침.
 *
 * answerItems 가 비어있는 블록은 표시 X. answerError 만 있는 블록은 빨간 배지로 표시.
 */
export default function AnswerReviewPanel() {
  const blocks = useAppStore((s) => s.blocks)
  const answerReviewChecked = useAppStore((s) => s.answerReviewChecked)
  const toggleChecked = useAppStore((s) => s.toggleAnswerReviewChecked)
  const clearChecked = useAppStore((s) => s.clearAnswerReviewChecked)
  const collapsedBlockIds = useAppStore((s) => s.collapsedBlockIds)
  const toggleBlockCollapse = useAppStore((s) => s.toggleBlockCollapse)
  const setActiveBlockId = useAppStore((s) => s.setActiveBlockId)

  // 블록별 풀이 펼침 상태 (로컬, 새로고침 시 초기화)
  const [solutionExpanded, setSolutionExpanded] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)

  // 정답·풀이가 있는(또는 답안 호출 시도가 있었던) 블록만 필터
  // Codex F1: answerItems 가 빈 배열이어도 "시도됨" 흔적이라 검토 탭에 노출
  // — Phase 2B 에서 빈 응답은 answerError 로 승격되지만, 그 경로도 함께 보존
  const reviewable = useMemo(
    () =>
      blocks.filter(
        (b) => Array.isArray(b.answerItems) || !!b.answerError,
      ),
    [blocks],
  )

  const checkedCount = reviewable.filter((b) => answerReviewChecked.has(b.id)).length
  const totalCount = reviewable.length

  const handleScrollTo = (blockId: string) => {
    setActiveBlockId(blockId)
    // 접혀 있으면 펼침
    if (collapsedBlockIds.has(blockId)) {
      toggleBlockCollapse(blockId)
    }
    // DOM 스크롤
    setTimeout(() => {
      const el = document.querySelector(`[data-block-id="${blockId}"]`)
      if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 50)
  }

  const toggleSolution = (blockId: string) => {
    setSolutionExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
  }

  const toggleAllSolutions = () => {
    if (allExpanded) {
      setSolutionExpanded(new Set())
      setAllExpanded(false)
    } else {
      setSolutionExpanded(new Set(reviewable.map((b) => b.id)))
      setAllExpanded(true)
    }
  }

  if (reviewable.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <span className="text-sm font-medium text-gray-700">📋 정답 검토</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-4 text-center">
          <p>
            답안 모드가 켜진 상태로 일괄 변환을 실행하면<br />
            여기에 블록별 정답·풀이가 표시됩니다.
          </p>
        </div>
      </div>
    )
  }

  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 — 진행률 + 일괄 토글 */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">📋 정답 검토</span>
          <span className="text-xs text-gray-500">
            {checkedCount} / {totalCount} 검토 완료
          </span>
        </div>
        <div className="h-1 bg-gray-200 rounded overflow-hidden mb-2">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={toggleAllSolutions}
            className="px-2 py-0.5 rounded border border-gray-300 hover:bg-white text-gray-700"
          >
            {allExpanded ? '풀이 모두 접기' : '풀이 모두 펼치기'}
          </button>
          <button
            onClick={clearChecked}
            className="px-2 py-0.5 rounded border border-gray-300 hover:bg-white text-gray-700"
            title="체크박스 진행상황 초기화"
          >
            진행 초기화
          </button>
        </div>
      </div>

      {/* 블록별 정답·풀이 일람 */}
      <div className="flex-1 overflow-auto divide-y divide-gray-100">
        {reviewable.map((b) => (
          <BlockReviewRow
            key={b.id}
            block={b}
            checked={answerReviewChecked.has(b.id)}
            solutionExpanded={solutionExpanded.has(b.id)}
            onToggleChecked={() => toggleChecked(b.id)}
            onToggleSolution={() => toggleSolution(b.id)}
            onScrollTo={() => handleScrollTo(b.id)}
          />
        ))}
      </div>
    </div>
  )
}


interface BlockReviewRowProps {
  block: EditorBlock
  checked: boolean
  solutionExpanded: boolean
  onToggleChecked: () => void
  onToggleSolution: () => void
  onScrollTo: () => void
}

function BlockReviewRow({
  block,
  checked,
  solutionExpanded,
  onToggleChecked,
  onToggleSolution,
  onScrollTo,
}: BlockReviewRowProps) {
  const items = block.answerItems || []
  const hasError = !!block.answerError
  const blockLabel = block.title?.trim() || `블록 ${block.id.slice(-6)}`

  return (
    <div className={`px-3 py-2 ${checked ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
      {/* 첫 줄: 체크박스 + 블록 제목 + 정답 배지 + 풀이 토글 */}
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleChecked}
          className="mt-1 accent-blue-600"
          title="검토 완료 표시"
        />
        <button
          onClick={onScrollTo}
          className="flex-1 text-left text-sm text-gray-800 hover:text-blue-600 truncate"
          title="에디터에서 이 블록으로 이동"
        >
          {blockLabel}
        </button>
      </div>

      {/* 정답 배지 영역 */}
      {hasError && (
        <div className="ml-6 mt-1 text-xs text-red-500">
          ⚠ 정답·풀이 추론 실패
        </div>
      )}
      {items.length > 0 && (
        <div className="ml-6 mt-1 flex flex-wrap gap-1.5">
          {items.map((it, idx) => (
            <AnswerBadge key={idx} item={it} />
          ))}
        </div>
      )}

      {/* 풀이 펼침/접힘 */}
      {items.length > 0 && items.some((it) => it.solution) && (
        <div className="ml-6 mt-1">
          <button
            onClick={onToggleSolution}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {solutionExpanded ? '▾ 풀이 숨기기' : '▸ 풀이 보기'}
          </button>
          {solutionExpanded && (
            <div className="mt-1 space-y-2">
              {items.map((it, idx) => (
                it.solution ? (
                  <div key={idx} className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2 border border-gray-100">
                    {it.questionNo && (
                      <div className="text-gray-500 font-medium mb-1">[{it.questionNo}]</div>
                    )}
                    {it.solution}
                  </div>
                ) : null
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function AnswerBadge({ item }: { item: AnswerSolutionItem }) {
  const ans = item.answer?.trim() || '—'
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-xs">
      {item.questionNo && (
        <span className="text-gray-500">{item.questionNo}.</span>
      )}
      <span className="font-medium text-gray-800">{ans}</span>
    </span>
  )
}
