import { Extension } from '@tiptap/react'
import '@tiptap/extension-text-style'

// TextStyle에 fontSize 속성을 추가하는 확장
declare module '@tiptap/extension-text-style' {
  interface TextStyleOptions {
    types: string[]
  }
}

export const FontSize = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
})
