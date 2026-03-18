/**
 * TipTap insertContent 전에 HTML 테이블 구조를 정규화한다.
 * TipTap Table 스키마: table > tableRow(tr) > tableCell(td) | tableHeader(th)
 *
 * Gemini가 반환하는 비정상 구조를 보정:
 * - <tr> 없이 바로 <td>/<th> → <tr>로 감싸기
 * - <table> 없이 <tr> → <table>로 감싸기
 * - <thead>/<tbody>/<tfoot> → 풀어서 <tr>만 남기기 (TipTap은 이 래퍼를 무시)
 * - 빈 <td>/<th> → 최소 <p><br></p> 삽입 (ProseMirror 빈 셀 요구)
 */
export function normalizeHtmlForTipTap(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 0. 블록 요소 사이의 독립 <br> 제거 (빈 행 방지)
  removeOrphanBrs(doc.body)

  // 1. 독립 <tr>을 <table>로 감싸기
  wrapOrphanRows(doc.body)

  // 2. 각 <table> 내부 정규화
  doc.body.querySelectorAll('table').forEach(normalizeTable)

  return doc.body.innerHTML
}

/** 블록 요소(p, table, ul, ol, h1~h6 등) 사이의 독립 <br> 태그 제거 */
function removeOrphanBrs(container: HTMLElement) {
  const blockTags = new Set(['P', 'TABLE', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'BLOCKQUOTE', 'HR', 'IMG'])
  const children = Array.from(container.childNodes)
  children.forEach((node) => {
    if (node instanceof HTMLBRElement) {
      const prev = node.previousElementSibling
      const next = node.nextElementSibling
      // 앞뒤가 블록 요소이거나 처음/끝이면 제거
      const prevIsBlock = !prev || blockTags.has(prev.tagName)
      const nextIsBlock = !next || blockTags.has(next.tagName)
      if (prevIsBlock && nextIsBlock) {
        node.remove()
      }
    }
  })
}

/** <table> 밖에 있는 <tr>을 <table>로 감싸기 */
function wrapOrphanRows(container: HTMLElement) {
  const children = Array.from(container.childNodes)
  let i = 0
  while (i < children.length) {
    const node = children[i]
    if (node instanceof HTMLTableRowElement && !node.closest('table')) {
      const table = document.createElement('table')
      // 연속된 orphan <tr>을 모두 한 테이블로 묶기
      while (i < children.length && children[i] instanceof HTMLTableRowElement) {
        table.appendChild(children[i])
        i++
      }
      container.insertBefore(table, children[i] ?? null)
    } else {
      i++
    }
  }
}

function normalizeTable(table: HTMLTableElement) {
  // thead/tbody/tfoot 풀기 — 안에 있는 tr을 table 직속으로 이동
  const sections = table.querySelectorAll('thead, tbody, tfoot')
  sections.forEach((section) => {
    while (section.firstChild) {
      table.insertBefore(section.firstChild, section)
    }
    section.remove()
  })

  // table 직속 자식 중 tr이 아닌 td/th가 있으면 tr로 감싸기
  const directChildren = Array.from(table.childNodes)
  let currentRow: HTMLTableRowElement | null = null
  directChildren.forEach((child) => {
    if (child instanceof HTMLTableCellElement) {
      if (!currentRow) {
        currentRow = document.createElement('tr')
        table.insertBefore(currentRow, child)
      }
      currentRow.appendChild(child)
    } else {
      currentRow = null
    }
  })

  // 각 tr 내부 확인 — 빈 셀에 최소 콘텐츠 삽입
  table.querySelectorAll('td, th').forEach((cell) => {
    if (!cell.innerHTML.trim()) {
      cell.innerHTML = '<p></p>'
    }
  })

  // tr에 td/th가 하나도 없으면 제거 (빈 행)
  table.querySelectorAll('tr').forEach((tr) => {
    if (tr.querySelectorAll('td, th').length === 0) {
      tr.remove()
    }
  })

  // 테이블에 tr이 하나도 없으면 제거 (빈 테이블)
  if (table.querySelectorAll('tr').length === 0) {
    table.remove()
  }
}
