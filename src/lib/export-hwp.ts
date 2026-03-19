/**
 * HWP 내보내기 로직
 *
 * 에디터 블록 → ProseMirror JSON → HTML → Python 백엔드 → HWP COM
 */

import { useAppStore } from '@/stores/appStore'
import type { EditorBlock } from '@/types'
import { prosemirrorToHtml, extractLatexFromDoc } from './prosemirror-to-html'
import { convertLatexToHwp } from './latex-to-hwp'

export interface ExportResult {
  success: boolean
  error?: string
  written?: number
  total?: number
}

/**
 * HWP 연결 확인
 */
export async function checkHwpConnection(): Promise<{ connected: boolean; error: string | null }> {
  if (!window.electronAPI?.checkHwp) {
    return { connected: false, error: 'Electron API를 사용할 수 없습니다.' }
  }
  return window.electronAPI.checkHwp()
}

/**
 * HWP 커서 위치 확인
 */
export async function checkHwpCursor(): Promise<{ at_end: boolean; error: string | null }> {
  if (!window.electronAPI?.checkHwpCursor) {
    return { at_end: false, error: 'Electron API를 사용할 수 없습니다.' }
  }
  return window.electronAPI.checkHwpCursor()
}

/**
 * 블록 배열 → HTML + mathMappings 변환 (공통 빌더)
 */
function buildHwpPayload(blocks: EditorBlock[]): {
  html: string
  title: string
  mathMappings: Record<string, string>
} {
  const htmlParts: string[] = []
  const allLatex: string[] = []

  for (const block of blocks) {
    try {
      if (block.title?.trim()) {
        const escaped = block.title.trim()
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        htmlParts.push(`<h2>${escaped}</h2>`)
      }

      const doc = JSON.parse(block.content)
      const html = prosemirrorToHtml(doc)
      htmlParts.push(html)

      const latexList = extractLatexFromDoc(doc)
      allLatex.push(...latexList)
    } catch {
      // JSON 파싱 실패 시 스킵
    }
  }

  // 수식 LaTeX → HWP 스크립트 변환 (실패 시 원본 LaTeX fallback — 양쪽 통일)
  const mathMappings: Record<string, string> = {}
  for (const latex of allLatex) {
    const result = convertLatexToHwp(latex)
    if (result.success && result.hwpEquation) {
      mathMappings[latex] = result.hwpEquation
    } else {
      console.warn(`[export-hwp] LaTeX→HWP 변환 실패: "${latex}" — ${result.error}`)
      mathMappings[latex] = latex
    }
  }

  return {
    html: htmlParts.join('\n'),
    title: blocks[0]?.title || 'AUZA 문서',
    mathMappings,
  }
}

/**
 * HWP에 블록 내보내기 (공통 실행)
 */
async function sendToHwp(payload: { html: string; title: string; mathMappings: Record<string, string> }): Promise<ExportResult> {
  if (!window.electronAPI?.writeHwp) {
    return { success: false, error: 'Electron API를 사용할 수 없습니다.' }
  }

  const result = await window.electronAPI.writeHwp(payload)

  if (!result.success) {
    return { success: false, error: result.error || `HWP 작성 실패: ${JSON.stringify(result.data)}` }
  }

  const data = result.data as { written?: number; total?: number }
  return { success: true, written: data?.written, total: data?.total }
}

/**
 * 단일 블록을 HWP에 내보내기
 */
export async function exportBlockToHwp(blockId: string): Promise<ExportResult> {
  const store = useAppStore.getState()
  const block = store.blocks.find((b) => b.id === blockId)

  if (!block) {
    return { success: false, error: '블록을 찾을 수 없습니다.' }
  }

  try {
    const payload = buildHwpPayload([block])
    payload.title = block.title || 'AUZA 블록'
    return await sendToHwp(payload)
  } catch {
    return { success: false, error: '블록 내용을 변환하는 중 오류가 발생했습니다.' }
  }
}

/**
 * 전체 블록을 HWP에 내보내기
 */
export async function exportToHwp(): Promise<ExportResult> {
  const store = useAppStore.getState()
  const blocks = store.blocks

  if (blocks.length === 0) {
    return { success: false, error: '내보낼 블록이 없습니다.' }
  }

  try {
    const payload = buildHwpPayload(blocks)
    return await sendToHwp(payload)
  } catch {
    return { success: false, error: '블록 내용을 변환하는 중 오류가 발생했습니다.' }
  }
}
