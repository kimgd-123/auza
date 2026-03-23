/**
 * Generation IR → HTML 변환 (에디터 미리보기용)
 *
 * Gemini가 출력한 Generation IR JSON을 HTML로 변환하여
 * 새 에디터 블록에 삽입. 사용자가 확인/수정 후 HWP 내보내기.
 */

import type { HwpGenerationIR, IRItem, IRTextRun, IRTableCell } from '@/types/generation'
import { useAssetStore } from '@/stores/assetStore'
import { useAppStore } from '@/stores/appStore'

/** 소스 블록에서 추출한 이미지 풀 (base64 + assetId) */
interface ImageEntry { id: string; base64: string; src: string }
let _sourceImages: ImageEntry[] = []

/**
 * @param ir Generation IR JSON
 * @param sourceBlockIds 원본(선택) 블록 ID 목록
 */
export function generationIrToHtml(ir: HwpGenerationIR, sourceBlockIds?: string[]): string {
  if (!ir.sections || ir.sections.length === 0) return ''

  // 소스 블록의 ProseMirror JSON에서 이미지 직접 추출 (Asset Store 무관)
  _sourceImages = []
  _usedFallbackIdx = 0
  if (sourceBlockIds && sourceBlockIds.length > 0) {
    const blocks = useAppStore.getState().blocks
    for (const blockId of sourceBlockIds) {
      const block = blocks.find((b) => b.id === blockId)
      if (!block?.content) continue
      try {
        const doc = JSON.parse(block.content)
        extractImagesFromDoc(doc)
      } catch { /* ignore */ }
    }
    // Asset Store에서도 수집 (캡처 직후에는 Store에만 있을 수 있음)
    const allAssets = useAssetStore.getState().assets
    for (const asset of Object.values(allAssets)) {
      if (sourceBlockIds.includes(asset.sourceBlock) && asset.base64) {
        if (!_sourceImages.some((img) => img.id === asset.id)) {
          _sourceImages.push({ id: asset.id, base64: asset.base64, src: `data:image/png;base64,${asset.base64}` })
        }
      }
    }
    console.log(`[IR→HTML] sourceImages: ${_sourceImages.length}개 (ids: ${_sourceImages.map(i => i.id).join(', ')})`)
  }

  const parts: string[] = []
  for (const section of ir.sections) {
    for (const item of section.items) {
      const html = renderItem(item)
      if (html) parts.push(html)
    }
  }
  // 최종 후처리: 텍스트에 남은 [asset:XXX] 참조를 실제 이미지로 치환
  return resolveAssetRefsInHtml(parts.join('\n'))
}

function renderItem(item: IRItem): string {
  switch (item.type) {
    case 'paragraph':
      return `<p>${item.runs.map(renderRun).join('')}</p>`

    case 'heading':
      return `<h${item.level}>${escapeHtml(item.text)}</h${item.level}>`

    case 'math_block': {
      // latex 필드에서 $$...$$ 래퍼가 있으면 제거 (raw body로 통일)
      let blockLatex = item.latex
      if (blockLatex.startsWith('$$') && blockLatex.endsWith('$$')) {
        blockLatex = blockLatex.slice(2, -2).trim()
      }
      return `<p>$$${blockLatex}$$</p>`
    }

    case 'math_inline': {
      let inlineLatex = item.latex
      if (inlineLatex.startsWith('$') && inlineLatex.endsWith('$') && !inlineLatex.startsWith('$$')) {
        inlineLatex = inlineLatex.slice(1, -1).trim()
      }
      return `$${inlineLatex}$`
    }

    case 'table':
      return renderTable(item.rows)

    case 'image': {
      // 1. Asset Store에서 정확한 ID로 조회
      const storeAsset = useAssetStore.getState().getAsset(item.ref)
      if (storeAsset?.base64) {
        const mime = storeAsset.base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
        return `<img data-asset-id="${escapeHtml(item.ref)}" src="data:${mime};base64,${storeAsset.base64}" alt="${escapeHtml(item.alt || storeAsset.alt || '')}" style="max-width: 100%;" />`
      }
      // 2. 소스 블록 ProseMirror JSON에서 추출한 이미지 fallback
      const fallback = findFallbackImage(item.ref)
      if (fallback) {
        console.log(`[IR→HTML] image ref="${item.ref}" → fallback "${fallback.id}"`)
        return `<img data-asset-id="${escapeHtml(fallback.id)}" src="${fallback.src}" alt="${escapeHtml(item.alt || '')}" style="max-width: 100%;" />`
      }
      console.warn(`[IR→HTML] FAILED: ref="${item.ref}", sourceImages=${_sourceImages.length}`)
      return `<p><em>[이미지: ${escapeHtml(item.ref)}]${item.alt ? ' ' + escapeHtml(item.alt) : ''}</em></p>`
    }

    case 'list': {
      const tag = item.ordered ? 'ol' : 'ul'
      const items = item.items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')
      return `<${tag}>${items}</${tag}>`
    }

    default:
      return ''
  }
}

function renderRun(run: IRTextRun): string {
  let text = escapeHtml(run.text)
  if (run.bold) text = `<b>${text}</b>`
  if (run.italic) text = `<i>${text}</i>`
  if (run.underline) text = `<u>${text}</u>`
  if (run.color) text = `<span style="color: ${run.color}">${text}</span>`
  return text
}

/** 셀 텍스트에서 Gemini가 잘못 넣은 이미지 JSON/참조를 제거 */
function cleanCellText(text: string): string {
  return text
    // {"type": "image", "ref": "IMG_007"} 같은 JSON 스니펫 제거
    .replace(/\{[^}]*"type"\s*:\s*"image"[^}]*\}/g, '')
    // [asset:XXX] 참조 제거
    .replace(/\[asset:[\w_]+\]\s*/g, '')
    // 이미지 활용: 같은 설명 텍스트도 정리
    .replace(/이미지\s*활용\s*:\s*/g, '')
    .trim()
}

function renderTable(rows: IRTableCell[][]): string {
  const rowsHtml = rows.map((row) => {
    const cells = row.map((cell) => {
      if (typeof cell === 'string') {
        return `<td>${escapeHtml(cleanCellText(cell))}</td>`
      }
      const parts: string[] = []
      if (cell.colspan && cell.colspan > 1) parts.push(`colspan="${cell.colspan}"`)
      if (cell.rowspan && cell.rowspan > 1) parts.push(`rowspan="${cell.rowspan}"`)
      const styles: string[] = []
      if (cell.bg_color) styles.push(`background-color: ${cell.bg_color}`)
      if (styles.length > 0) parts.push(`style="${styles.join('; ')}"`)
      const attrStr = parts.length > 0 ? ' ' + parts.join(' ') : ''
      const tag = cell.bold ? 'th' : 'td'
      return `<${tag}${attrStr}>${escapeHtml(cleanCellText(cell.text || ''))}</${tag}>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('\n')
  return `<table>\n${rowsHtml}\n</table>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** ProseMirror JSON에서 이미지 노드를 재귀 추출 */
function extractImagesFromDoc(node: Record<string, unknown>) {
  if (node.type === 'image' && node.attrs) {
    const attrs = node.attrs as Record<string, string>
    const src = attrs.src || ''
    const assetId = attrs.assetId || ''
    if (src.startsWith('data:')) {
      const base64Match = src.match(/base64,(.+)/)
      if (base64Match) {
        _sourceImages.push({
          id: assetId || `img_${_sourceImages.length}`,
          base64: base64Match[1],
          src,
        })
      }
    }
  }
  const content = node.content as Record<string, unknown>[] | undefined
  if (content) {
    for (const child of content) {
      extractImagesFromDoc(child)
    }
  }
}

/**
 * 소스 블록 이미지 풀에서 fallback 찾기
 */
let _usedFallbackIdx = 0
function findFallbackImage(ref: string): ImageEntry | undefined {
  if (_sourceImages.length === 0) return undefined

  // 1. 정확한 ID 매칭
  const exact = _sourceImages.find((img) => img.id === ref)
  if (exact) return exact

  // 2. 순서대로 할당 (Gemini가 ID를 임의 생성한 경우)
  if (_sourceImages.length > 0) {
    const idx = _usedFallbackIdx % _sourceImages.length
    _usedFallbackIdx++
    return _sourceImages[idx]
  }

  return undefined
}

/**
 * HTML 텍스트 내 [asset:XXX] 참조를 실제 <img> 태그로 치환
 * Gemini가 IR image item 대신 텍스트로 참조를 넣는 경우 대응
 */
function resolveAssetRefsInHtml(html: string): string {
  return html.replace(
    /\[asset:([\w_]+)\](?:\s*([^\[<\n]*))?/g,
    (_match, assetId: string, altText?: string) => {
      // Asset Store → 소스 블록 이미지 fallback
      const storeAsset = useAssetStore.getState().getAsset(assetId)
      if (storeAsset?.base64) {
        const mime = storeAsset.base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
        return `</p><img data-asset-id="${assetId}" src="data:${mime};base64,${storeAsset.base64}" alt="${altText?.trim() || ''}" style="max-width: 100%;" /><p>`
      }
      const fallback = findFallbackImage(assetId)
      if (fallback) {
        return `</p><img data-asset-id="${fallback.id}" src="${fallback.src}" alt="${altText?.trim() || ''}" style="max-width: 100%;" /><p>`
      }
      return _match
    },
  )
}
