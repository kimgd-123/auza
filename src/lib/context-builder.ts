/**
 * 2계층 컨텍스트 빌더
 *
 * - Summary Layer: 각 블록의 1줄 요약 + 요소 태그 (항상 전송)
 * - Full Content Layer: 선택 블록의 전체 MD (생성 요청 시만)
 */

import type { EditorBlock } from '@/types'
import { prosemirrorToMd, extractSummary } from './prosemirror-to-md'

export interface ContextResult {
  /** Gemini에 전달할 전체 컨텍스트 문자열 */
  text: string
  /** Summary Layer만 */
  summaryOnly: string
  /** 선택 블록 수 */
  selectedCount: number
}

/**
 * 블록 목록과 선택 ID로 2계층 컨텍스트 생성
 *
 * @param blocks - 전체 블록 목록
 * @param selectedIds - 선택된 블록 ID Set
 */
export function buildContext(
  blocks: EditorBlock[],
  selectedIds: Set<string>,
): ContextResult {
  if (blocks.length === 0) {
    return { text: '', summaryOnly: '', selectedCount: 0 }
  }

  // === Summary Layer ===
  const summaryLines: string[] = ['## 블록 목록']
  for (const block of blocks) {
    let doc = null
    try {
      doc = JSON.parse(block.content)
    } catch { /* empty */ }

    const { summary, tags } = doc
      ? extractSummary(doc)
      : { summary: '(파싱 실패)', tags: [] as string[] }

    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : ''
    const selected = selectedIds.has(block.id) ? ' *' : ''
    const title = block.title || '제목 없음'
    summaryLines.push(`- **${title}**${selected}: ${summary}${tagStr}`)
  }
  const summaryText = summaryLines.join('\n')

  // === Full Content Layer (선택 블록만) ===
  const selectedBlocks = blocks.filter((b) => selectedIds.has(b.id))
  const fullParts: string[] = []

  for (const block of selectedBlocks) {
    let md = ''
    try {
      const doc = JSON.parse(block.content)
      md = prosemirrorToMd(doc)
    } catch {
      md = '(변환 실패)'
    }
    const title = block.title || '제목 없음'
    fullParts.push(`### [${title}]\n${md}`)
  }

  const fullText = fullParts.length > 0
    ? `\n\n## 선택된 블록 상세\n\n${fullParts.join('\n\n---\n\n')}`
    : ''

  const combined = summaryText + fullText

  return {
    text: combined,
    summaryOnly: summaryText,
    selectedCount: selectedBlocks.length,
  }
}
