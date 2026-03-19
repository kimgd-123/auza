/**
 * ProseMirror JSON → HTML 직렬화
 *
 * 에디터 블록의 ProseMirror JSON을 HTML로 변환하여 Python 백엔드에 전달합니다.
 * 수식($...$, $$...$$)은 HTML 내에 그대로 포함되며, Python 파서가 추출합니다.
 */

interface ProseMirrorNode {
  type: string
  content?: ProseMirrorNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

export function prosemirrorToHtml(doc: ProseMirrorNode): string {
  if (!doc || !doc.content) return ''
  return doc.content.map((node) => serializeNode(node)).join('')
}

function serializeNode(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph':
      return `<p${attrString(node)}>${serializeChildren(node)}</p>`
    case 'heading': {
      const level = (node.attrs?.level as number) || 1
      return `<h${level}>${serializeChildren(node)}</h${level}>`
    }
    case 'bulletList':
      return `<ul>${serializeChildren(node)}</ul>`
    case 'orderedList':
      return `<ol>${serializeChildren(node)}</ol>`
    case 'listItem':
      return `<li>${serializeChildren(node)}</li>`
    case 'blockquote':
      return `<blockquote>${serializeChildren(node)}</blockquote>`
    case 'table':
      return `<table>${serializeChildren(node)}</table>`
    case 'tableRow':
      return `<tr>${serializeChildren(node)}</tr>`
    case 'tableHeader':
      return `<th${tableCellAttrs(node)}>${serializeChildren(node)}</th>`
    case 'tableCell':
      return `<td${tableCellAttrs(node)}>${serializeChildren(node)}</td>`
    case 'text':
      return serializeText(node)
    case 'hardBreak':
      return '<br>'
    case 'horizontalRule':
      return '<hr>'
    case 'image': {
      const src = (node.attrs?.src as string) || ''
      const alt = escapeHtml((node.attrs?.alt as string) || '')
      if (!src) return ''
      const imgStyles: string[] = []
      if (node.attrs?.width) imgStyles.push(`width: ${node.attrs.width}px`)
      if (node.attrs?.height) imgStyles.push(`height: ${node.attrs.height}px`)
      const styleAttr = imgStyles.length > 0 ? ` style="${imgStyles.join('; ')}"` : ''
      return `<img src="${src}" alt="${alt}"${styleAttr} />`
    }
    case 'mathematics': {
      // 수식 노드 — LaTeX를 $...$ 또는 $$...$$ 형태로 출력
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
  let html = escapeHtml(node.text || '')

  if (!node.marks) return html

  for (const mark of node.marks) {
    switch (mark.type) {
      case 'bold':
        html = `<b>${html}</b>`
        break
      case 'italic':
        html = `<i>${html}</i>`
        break
      case 'underline':
        html = `<u>${html}</u>`
        break
      case 'textStyle': {
        const styles: string[] = []
        if (mark.attrs?.color) styles.push(`color: ${mark.attrs.color}`)
        if (mark.attrs?.fontSize) styles.push(`font-size: ${mark.attrs.fontSize}`)
        if (styles.length > 0) {
          html = `<span style="${styles.join('; ')}">${html}</span>`
        }
        break
      }
      case 'highlight': {
        const color = (mark.attrs?.color as string) || 'yellow'
        html = `<span style="background-color: ${color}">${html}</span>`
        break
      }
    }
  }

  return html
}

function tableCellAttrs(node: ProseMirrorNode): string {
  const parts: string[] = []
  const attrs = node.attrs || {}
  if (attrs.colspan && (attrs.colspan as number) > 1) parts.push(`colspan="${attrs.colspan}"`)
  if (attrs.rowspan && (attrs.rowspan as number) > 1) parts.push(`rowspan="${attrs.rowspan}"`)

  const styles: string[] = []
  if (attrs.backgroundColor) styles.push(`background-color: ${attrs.backgroundColor}`)

  // 첫 paragraph의 textAlign을 셀 스타일로 반영
  const firstChild = node.content?.[0]
  if (firstChild?.type === 'paragraph' && firstChild.attrs?.textAlign && firstChild.attrs.textAlign !== 'left') {
    styles.push(`text-align: ${firstChild.attrs.textAlign}`)
  }

  if (styles.length > 0) parts.push(`style="${styles.join('; ')}"`)

  return parts.length > 0 ? ' ' + parts.join(' ') : ''
}

function attrString(node: ProseMirrorNode): string {
  const attrs = node.attrs || {}
  const styles: string[] = []
  if (attrs.textAlign && attrs.textAlign !== 'left') {
    styles.push(`text-align: ${attrs.textAlign}`)
  }
  return styles.length > 0 ? ` style="${styles.join('; ')}"` : ''
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * ProseMirror JSON에서 수식 LaTeX 추출 (HWP 스크립트 변환용)
 */
export function extractLatexFromDoc(doc: ProseMirrorNode): string[] {
  const result: string[] = []
  walkNodes(doc, (node) => {
    if (node.type === 'mathematics' && node.attrs?.latex) {
      result.push(node.attrs.latex as string)
    }
    // 텍스트 내 인라인/블록 수식도 추출 ($$...$$ 우선, $...$ 인라인)
    if (node.type === 'text' && node.text) {
      const combinedRe = /\$\$([\s\S]+?)\$\$|\$([^$]+)\$/g
      let match
      while ((match = combinedRe.exec(node.text)) !== null) {
        result.push(match[1] || match[2])
      }
    }
  })
  return result
}

function walkNodes(node: ProseMirrorNode, visitor: (n: ProseMirrorNode) => void): void {
  visitor(node)
  if (node.content) {
    for (const child of node.content) {
      walkNodes(child, visitor)
    }
  }
}
