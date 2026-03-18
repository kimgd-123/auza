import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

interface Props {
  editor: Editor
}

const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '28', '32']
const CELL_COLORS = ['#ffffff', '#f3f4f6', '#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#e0e7ff']
const TEXT_COLORS = [
  '#000000', '#374151', '#6b7280', '#dc2626', '#ea580c', '#ca8a04',
  '#16a34a', '#2563eb', '#7c3aed', '#db2777',
]

export default function EditorToolbar({ editor }: Props) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 컬러 피커 닫기
  useEffect(() => {
    if (!showColorPicker) return
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColorPicker])

  const btnClass = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-medium transition-colors ${
      active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`

  const handleFontSize = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = e.target.value
    if (size) {
      editor.chain().focus().setMark('textStyle', { fontSize: `${size}px` }).run()
    }
  }

  const handleTextColor = (color: string) => {
    editor.chain().focus().setColor(color).run()
    setShowColorPicker(false)
  }

  const handleCellBgColor = (color: string) => {
    editor.chain().focus().setCellAttribute('backgroundColor', color).run()
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-white flex-wrap">
      {/* 서식 */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive('bold'))}
        title="굵게 (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive('italic'))}
        title="기울임 (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btnClass(editor.isActive('underline'))}
        title="밑줄 (Ctrl+U)"
      >
        <u>U</u>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btnClass(editor.isActive('strike'))}
        title="취소선"
      >
        <s>S</s>
      </button>

      <div className="w-px h-4 bg-gray-300 mx-1" />

      {/* 글꼴 크기 */}
      <select
        onChange={handleFontSize}
        value=""
        className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none"
        title="글꼴 크기"
      >
        <option value="" disabled>크기</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}px</option>
        ))}
      </select>

      {/* 글꼴 색상 */}
      <div className="relative" ref={colorPickerRef}>
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className={btnClass(false)}
          title="글꼴 색상"
        >
          <span style={{ color: editor.getAttributes('textStyle').color || '#000000' }}>A</span>
          <span
            className="block h-0.5 w-full rounded"
            style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }}
          />
        </button>
        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 grid grid-cols-5 gap-1 w-[130px]">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleTextColor(color)}
                className="w-5 h-5 rounded border border-gray-300 hover:scale-125 transition-transform"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
            <button
              onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false) }}
              className="col-span-5 text-xs text-gray-500 hover:text-gray-700 mt-1"
            >
              색상 초기화
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-gray-300 mx-1" />

      {/* 정렬 */}
      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={btnClass(editor.isActive({ textAlign: 'left' }))}
        title="왼쪽 정렬"
      >
        ≡L
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={btnClass(editor.isActive({ textAlign: 'center' }))}
        title="가운데 정렬"
      >
        ≡C
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={btnClass(editor.isActive({ textAlign: 'right' }))}
        title="오른쪽 정렬"
      >
        ≡R
      </button>

      <div className="w-px h-4 bg-gray-300 mx-1" />

      {/* 제목 */}
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={btnClass(editor.isActive('heading', { level: 1 }))}
        title="제목 1"
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btnClass(editor.isActive('heading', { level: 2 }))}
        title="제목 2"
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btnClass(editor.isActive('heading', { level: 3 }))}
        title="제목 3"
      >
        H3
      </button>

      <div className="w-px h-4 bg-gray-300 mx-1" />

      {/* 목록 */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btnClass(editor.isActive('bulletList'))}
        title="글머리 기호"
      >
        &bull; 목록
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btnClass(editor.isActive('orderedList'))}
        title="번호 목록"
      >
        1. 목록
      </button>

      <div className="w-px h-4 bg-gray-300 mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btnClass(editor.isActive('blockquote'))}
        title="인용구"
      >
        &ldquo; 인용
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={btnClass(false)}
        title="구분선"
      >
        ─
      </button>

      <div className="w-px h-4 bg-gray-300 mx-1" />

      {/* 표 */}
      <button
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        className={btnClass(false)}
        title="표 삽입 (3x3)"
      >
        표
      </button>
      {editor.isActive('table') && (
        <>
          <button onClick={() => editor.chain().focus().addColumnAfter().run()} className={btnClass(false)} title="열 추가">+열</button>
          <button onClick={() => editor.chain().focus().addRowAfter().run()} className={btnClass(false)} title="행 추가">+행</button>
          <button onClick={() => editor.chain().focus().deleteColumn().run()} className={btnClass(false)} title="열 삭제">-열</button>
          <button onClick={() => editor.chain().focus().deleteRow().run()} className={btnClass(false)} title="행 삭제">-행</button>
          <button onClick={() => editor.chain().focus().mergeCells().run()} className={btnClass(false)} title="셀 병합">병합</button>
          <button onClick={() => editor.chain().focus().splitCell().run()} className={btnClass(false)} title="셀 분할">분할</button>

          {/* 셀 배경색 */}
          <div className="flex items-center gap-0.5 mx-1" title="셀 배경색">
            {CELL_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleCellBgColor(color)}
                className="w-4 h-4 rounded border border-gray-300 hover:scale-125 transition-transform"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <button
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            title="표 삭제"
          >
            표삭제
          </button>
        </>
      )}

      <div className="w-px h-4 bg-gray-300 mx-1" />

      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-30"
        title="실행 취소 (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-30"
        title="다시 실행 (Ctrl+Y)"
      >
        ↪
      </button>
    </div>
  )
}
