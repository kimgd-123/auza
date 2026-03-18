import { useState, useRef, useEffect } from 'react'

export type LayoutMode =
  | 'three-equal'    // [PDF | Editor | Chat] 균등 3분할
  | 'pdf-focus'      // [PDF 넓게 | Editor | Chat]
  | 'editor-focus'   // [PDF | Editor 넓게 | Chat]
  | 'pdf-editor'     // [PDF | Editor] 채팅 없음
  | 'editor-chat'    // [Editor | Chat] PDF 없음
  | 'pdf-stack'      // [PDF | Editor+Chat 상하]

interface LayoutOption {
  mode: LayoutMode
  label: string
  sections: Array<{
    color: string
    label: string
    // grid area: row-start / col-start / row-end / col-end
    area: string
  }>
  cols: string
  rows: string
}

const LAYOUTS: LayoutOption[] = [
  {
    mode: 'pdf-editor',
    label: 'PDF + 에디터',
    cols: '1fr 1fr',
    rows: '1fr',
    sections: [
      { color: 'bg-blue-400', label: 'PDF', area: '1/1/2/2' },
      { color: 'bg-emerald-400', label: '에디터', area: '1/2/2/3' },
    ],
  },
  {
    mode: 'editor-chat',
    label: '에디터 + 채팅',
    cols: '3fr 2fr',
    rows: '1fr',
    sections: [
      { color: 'bg-emerald-400', label: '에디터', area: '1/1/2/2' },
      { color: 'bg-purple-400', label: '채팅', area: '1/2/2/3' },
    ],
  },
  {
    mode: 'pdf-stack',
    label: 'PDF + 에디터/채팅',
    cols: '1fr 1fr',
    rows: '1fr 1fr',
    sections: [
      { color: 'bg-blue-400', label: 'PDF', area: '1/1/3/2' },
      { color: 'bg-emerald-400', label: '에디터', area: '1/2/2/3' },
      { color: 'bg-purple-400', label: '채팅', area: '2/2/3/3' },
    ],
  },
  {
    mode: 'three-equal',
    label: '3분할 균등',
    cols: '1fr 1fr 1fr',
    rows: '1fr',
    sections: [
      { color: 'bg-blue-400', label: 'PDF', area: '1/1/2/2' },
      { color: 'bg-emerald-400', label: '에디터', area: '1/2/2/3' },
      { color: 'bg-purple-400', label: '채팅', area: '1/3/2/4' },
    ],
  },
  {
    mode: 'pdf-focus',
    label: 'PDF 중심',
    cols: '2fr 1fr 1fr',
    rows: '1fr',
    sections: [
      { color: 'bg-blue-400', label: 'PDF', area: '1/1/2/2' },
      { color: 'bg-emerald-400', label: '에디터', area: '1/2/2/3' },
      { color: 'bg-purple-400', label: '채팅', area: '1/3/2/4' },
    ],
  },
  {
    mode: 'editor-focus',
    label: '에디터 중심',
    cols: '1fr 2fr 1fr',
    rows: '1fr',
    sections: [
      { color: 'bg-blue-400', label: 'PDF', area: '1/1/2/2' },
      { color: 'bg-emerald-400', label: '에디터', area: '1/2/2/3' },
      { color: 'bg-purple-400', label: '채팅', area: '1/3/2/4' },
    ],
  },
]

interface Props {
  current: LayoutMode
  onChange: (mode: LayoutMode) => void
}

export default function LayoutPicker({ current, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1 text-gray-700 hover:bg-gray-100 rounded transition-colors flex items-center gap-1.5"
        title="레이아웃 변경"
      >
        {/* Grid icon */}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2" />
          <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2" />
          <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2" />
          <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2" />
        </svg>
        <span className="text-xs">레이아웃</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 w-[340px]">
          <div className="text-xs text-gray-500 mb-2 font-medium">레이아웃 선택</div>
          <div className="grid grid-cols-3 gap-2">
            {LAYOUTS.map((layout) => (
              <button
                key={layout.mode}
                onClick={() => { onChange(layout.mode); setOpen(false) }}
                className={`p-1.5 rounded-lg border-2 transition-all hover:border-blue-400 ${
                  current === layout.mode
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
                title={layout.label}
              >
                {/* 미니어처 레이아웃 */}
                <div
                  className="w-full aspect-[4/3] rounded gap-[2px]"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: layout.cols,
                    gridTemplateRows: layout.rows,
                  }}
                >
                  {layout.sections.map((sec, i) => (
                    <div
                      key={i}
                      className={`${sec.color} rounded-sm flex items-center justify-center`}
                      style={{ gridArea: sec.area }}
                    >
                      <span className="text-white text-[7px] font-bold leading-none">
                        {sec.label}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-[9px] text-gray-600 mt-1 text-center leading-tight">
                  {layout.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
