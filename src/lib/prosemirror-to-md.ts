/**
 * ProseMirror JSON → Markdown 직렬화
 *
 * Gemini 컨텍스트 전달용. HTML 경유 없이 ProseMirror JSON에서 직접 Markdown 생성.
 * 이미지는 base64 대신 [asset:ID] 참조로 대체하여 토큰 절약.
 */

interface ProseMirrorNode {
  type: string
  content?: ProseMirrorNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

export function prosemirrorToMd(doc: ProseMirrorNode): string {
  if (!doc || !doc.content) return ''
  return doc.content.map((node) => serializeNode(node)).join('\n\n')
}

function serializeNode(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph':
      return serializeChildren(node)

    case 'heading': {
      const level = (node.attrs?.level as number) || 1
      const prefix = '#'.repeat(level)
      return `${prefix} ${serializeChildren(node)}`
    }

    case 'bulletList':
      return serializeList(node, 'bullet')

    case 'orderedList':
      return serializeList(node, 'ordered')

    case 'listItem':
      return serializeChildren(node)

    case 'blockquote': {
      const inner = node.content
        ? node.content.map((child) => serializeNode(child)).join('\n')
        : ''
      return inner
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }

    case 'table':
      return serializeTable(node)

    case 'text':
      return serializeText(node)

    case 'hardBreak':
      return '  \n'

    case 'horizontalRule':
      return '---'

    case 'image': {
      const alt = (node.attrs?.alt as string) || ''
      // assetId가 있으면 참조, 없으면 src 축약
      const assetId = node.attrs?.assetId as string | undefined
      if (assetId) {
        return `[asset:${assetId}]${alt ? ` ${alt}` : ''}`
      }
      const src = (node.attrs?.src as string) || ''
      if (src.startsWith('data:')) {
        return `[이미지]${alt ? ` ${alt}` : ''}`
      }
      return `![${alt}](${src})`
    }

    case 'mathematics': {
      const latex = (node.attrs?.latex as string) || ''
      const isBlock = (node.attrs?.isBlock as boolean) || false
      return isBlock ? `$$${latex}$$` : `$${latex}$`
    }

    default:
      return serializeChildren(node)
  }
}

function serializeChildren(node: ProseMirrorNode): string {
  if (!node.content) return ''
  return node.content.map((child) => serializeNode(child)).join('')
}

function serializeText(node: ProseMirrorNode): string {
  let text = node.text || ''
  if (!node.marks) return text

  for (const mark of node.marks) {
    switch (mark.type) {
      case 'bold':
        text = `**${text}**`
        break
      case 'italic':
        text = `*${text}*`
        break
      case 'underline':
        // MD에 underline 없음 — 강조 표시
        text = `__${text}__`
        break
      case 'code':
        text = `\`${text}\``
        break
      case 'strike':
        text = `~~${text}~~`
        break
      // textStyle, highlight 등은 MD에서 표현 불가 — 텍스트만 유지
    }
  }
  return text
}

function serializeList(node: ProseMirrorNode, type: 'bullet' | 'ordered'): string {
  if (!node.content) return ''
  return node.content
    .map((item, i) => {
      const prefix = type === 'bullet' ? '-' : `${i + 1}.`
      const inner = item.content
        ? item.content.map((child) => serializeNode(child)).join('\n')
        : ''
      // 멀티라인 리스트 아이템 들여쓰기
      const lines = inner.split('\n')
      const first = `${prefix} ${lines[0]}`
      const rest = lines.slice(1).map((l) => `  ${l}`)
      return [first, ...rest].join('\n')
    })
    .join('\n')
}

function serializeTable(node: ProseMirrorNode): string {
  if (!node.content) return ''

  // 병합 셀 또는 배경색이 있는지 확인
  let needsHtmlFallback = false
  for (const row of node.content) {
    if (!row.content) continue
    for (const cell of row.content) {
      const colspan = (cell.attrs?.colspan as number) || 1
      const rowspan = (cell.attrs?.rowspan as number) || 1
      if (colspan > 1 || rowspan > 1 || cell.attrs?.backgroundColor) {
        needsHtmlFallback = true
        break
      }
    }
    if (needsHtmlFallback) break
  }

  // 병합 셀/배경색이 있으면 HTML fallback (PRD §13.4.1)
  if (needsHtmlFallback) {
    return serializeTableAsHtml(node)
  }

  // 단순 표는 GFM 테이블
  const rows = node.content.map((row) => {
    if (!row.content) return []
    return row.content.map((cell) => {
      const text = serializeChildren(cell).trim()
      return text || ' '
    })
  })

  if (rows.length === 0) return ''

  const colCount = Math.max(...rows.map((r) => r.length))
  const normalizedRows = rows.map((r) => {
    while (r.length < colCount) r.push(' ')
    return r
  })

  const lines: string[] = []
  normalizedRows.forEach((row, i) => {
    lines.push('| ' + row.join(' | ') + ' |')
    if (i === 0) {
      lines.push('| ' + row.map(() => '---').join(' | ') + ' |')
    }
  })

  return lines.join('\n')
}

/** 병합 셀/배경색이 있는 표는 HTML로 직렬화하여 구조 보존 */
function serializeTableAsHtml(node: ProseMirrorNode): string {
  if (!node.content) return ''
  const rowsHtml = node.content.map((row) => {
    if (!row.content) return '<tr></tr>'
    const cellsHtml = row.content.map((cell) => {
      const tag = cell.type === 'tableHeader' ? 'th' : 'td'
      const parts: string[] = []
      const attrs = cell.attrs || {}
      if (attrs.colspan && (attrs.colspan as number) > 1) parts.push(`colspan="${attrs.colspan}"`)
      if (attrs.rowspan && (attrs.rowspan as number) > 1) parts.push(`rowspan="${attrs.rowspan}"`)
      const styles: string[] = []
      if (attrs.backgroundColor) styles.push(`background-color: ${attrs.backgroundColor}`)
      if (styles.length > 0) parts.push(`style="${styles.join('; ')}"`)
      const attrStr = parts.length > 0 ? ' ' + parts.join(' ') : ''
      const content = serializeChildren(cell).trim()
      return `<${tag}${attrStr}>${content}</${tag}>`
    }).join('')
    return `<tr>${cellsHtml}</tr>`
  }).join('\n')
  return `<table>\n${rowsHtml}\n</table>`
}

/**
 * ProseMirror JSON에서 1줄 요약 + 요소 태그 추출
 * context-builder의 Summary Layer에서 사용
 */
export function extractSummary(doc: ProseMirrorNode): { summary: string; tags: string[] } {
  const tags = new Set<string>()
  let firstText = ''

  function walk(node: ProseMirrorNode) {
    // 요소 태그 수집
    switch (node.type) {
      case 'table':
        tags.add('표')
        break
      case 'mathematics':
        tags.add('수식')
        break
      case 'image':
        tags.add('이미지')
        break
      case 'bulletList':
      case 'orderedList':
        tags.add('목록')
        break
      case 'blockquote':
        tags.add('인용')
        break
      case 'heading':
        tags.add('제목')
        break
    }

    // 첫 텍스트 수집 (60자까지)
    if (node.type === 'text' && node.text && firstText.length < 60) {
      firstText += node.text
    }

    if (node.content) {
      for (const child of node.content) {
        walk(child)
      }
    }
  }

  walk(doc)

  const summary = firstText.length > 60 ? firstText.slice(0, 57) + '...' : firstText
  return { summary: summary || '(빈 블록)', tags: Array.from(tags) }
}
