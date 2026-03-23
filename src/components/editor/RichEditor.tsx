import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Mathematics } from '@tiptap/extension-mathematics'
import BaseImage from '@tiptap/extension-image'

// Image 확장에 assetId 속성 추가 (Asset Store 연동)
const Image = BaseImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-asset-id'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.assetId) return {}
          return { 'data-asset-id': attributes.assetId }
        },
      },
    }
  },
})
import { FontSize } from '@/lib/tiptap-font-size'
import { CustomTableCell, CustomTableHeader } from '@/lib/tiptap-table-cell-bg'
import { useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { normalizeContentForEditor } from '@/lib/content-normalizer'
import EditorToolbar from './EditorToolbar'
import 'katex/dist/katex.min.css'

const EMPTY_DOC = { type: 'doc' as const, content: [{ type: 'paragraph' as const }] }

interface Props {
  blockId: string
  content: string
  onUpdate: (content: string) => void
  isActive: boolean
}

export default function RichEditor({ blockId, content, onUpdate, isActive }: Props) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      CustomTableHeader,
      CustomTableCell,
      Mathematics.configure({
        regex: /\$\$([^\$]+)\$\$|\$([^\$]+)\$/gi,
      }),
      Image.configure({
        allowBase64: true,
        inline: false,
      }),
    ],
    content: (() => {
      try { return JSON.parse(content) } catch { return EMPTY_DOC }
    })(),
    onUpdate: ({ editor }) => {
      onUpdate(JSON.stringify(editor.getJSON()))
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-4 py-3',
      },
      // PDF에서 복사 시 흰색/투명 폰트 색상 제거
      transformPastedHTML(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html')
        doc.body.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
          const color = el.style.color?.toLowerCase().replace(/\s/g, '')
          if (
            color === 'white' ||
            color === '#fff' ||
            color === '#ffffff' ||
            color === 'rgb(255,255,255)' ||
            color === 'transparent'
          ) {
            el.style.removeProperty('color')
          }
        })
        return doc.body.innerHTML
      },
    },
  })

  // 외부에서 content가 변경되면 에디터에 반영 (예: AI 응답 적용)
  useEffect(() => {
    if (!editor || !content) return
    try {
      const parsed = JSON.parse(content)
      const currentJson = editor.getJSON()
      if (JSON.stringify(parsed) !== JSON.stringify(currentJson)) {
        editor.commands.setContent(parsed)
      }
    } catch {
      // content가 JSON이 아닌 경우 무시
    }
  }, [content, editor])

  // mount 시 대기 중인 HTML이 있으면 삽입 (생성 블록 레이스 방지)
  useEffect(() => {
    if (!editor) return
    const pendingHtml = useAppStore.getState().consumePendingBlockHtml(blockId)
    if (pendingHtml) {
      const safeHtml = normalizeContentForEditor(pendingHtml)
      try {
        editor.commands.setContent(safeHtml, true)
        onUpdateRef.current(JSON.stringify(editor.getJSON()))
      } catch {
        // fallback 무시
      }
    }
  }, [editor, blockId])

  // AI 응답 HTML 삽입 이벤트 리스닝
  useEffect(() => {
    if (!editor) return

    const handler = (e: Event) => {
      const { blockId: targetId, html } = (e as CustomEvent).detail
      if (targetId !== blockId) return
      // HTML + LaTeX 공통 정규화 후 블록 내용 교체
      const safeHtml = normalizeContentForEditor(html)
      try {
        editor.commands.setContent(safeHtml, true)
        // setContent 후 store에 즉시 반영 (onUpdate 미발화 방지)
        onUpdateRef.current(JSON.stringify(editor.getJSON()))
      } catch (err) {
        console.warn('[RichEditor] setContent failed, retrying as text:', err)
        const text = new DOMParser().parseFromString(safeHtml, 'text/html').body.textContent || ''
        if (text.trim()) {
          editor.commands.setContent(text, true)
          onUpdateRef.current(JSON.stringify(editor.getJSON()))
        }
      }
    }

    window.addEventListener('auza:insertHtml', handler)
    return () => window.removeEventListener('auza:insertHtml', handler)
  }, [editor, blockId])

  if (!editor) return null

  return (
    <div className="flex flex-col">
      {isActive && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
