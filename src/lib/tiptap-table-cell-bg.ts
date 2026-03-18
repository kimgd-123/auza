import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

const bgColorAttribute = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
    renderHTML: (attributes: Record<string, string | null>) => {
      if (!attributes.backgroundColor) return {}
      return { style: `background-color: ${attributes.backgroundColor}` }
    },
  },
}

// TableCell에 backgroundColor 속성 추가
export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...bgColorAttribute }
  },
})

// TableHeader에도 동일 속성 추가
export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...bgColorAttribute }
  },
})
