import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { EditorBlock as EditorBlockType } from '@/types'
import RichEditor from './RichEditor'
import { exportBlockToHwp, checkHwpConnection } from '@/lib/export-hwp'

interface Props {
  block: EditorBlockType
  index: number
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (index: number) => void
}

export default function EditorBlock({ block, index, onDragStart, onDragOver, onDrop }: Props) {
  const { activeBlockId, setActiveBlockId, updateBlock, removeBlock } = useAppStore()
  const isActive = activeBlockId === block.id
  const [isDraggable, setIsDraggable] = useState(false)
  const [hwpWriting, setHwpWriting] = useState(false)
  const blockRef = useRef<HTMLDivElement>(null)

  const handleWriteHwp = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hwpWriting) return
    setHwpWriting(true)
    try {
      const conn = await checkHwpConnection()
      if (!conn.connected) {
        alert(conn.error || '한글 프로그램에 연결할 수 없습니다. 한글을 먼저 실행해주세요.')
        return
      }
      const result = await exportBlockToHwp(block.id)
      if (!result.success) {
        console.error('[HWP export]', result)
        alert(result.error || 'HWP 작성에 실패했습니다.')
      } else {
        console.log('[HWP export] 성공', result)
      }
    } finally {
      setHwpWriting(false)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('이 블록을 삭제하시겠습니까?')) {
      removeBlock(block.id)
    }
  }

  // 핸들에서만 draggable 활성화
  const enableDrag = useCallback(() => setIsDraggable(true), [])
  const disableDrag = useCallback(() => setIsDraggable(false), [])

  return (
    <div
      ref={blockRef}
      className={`border rounded-lg transition-all ${
        isActive ? 'border-blue-400 shadow-sm' : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={() => setActiveBlockId(block.id)}
      draggable={isDraggable}
      onDragStart={() => onDragStart(index)}
      onDragEnd={disableDrag}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
    >
      {/* 블록 헤더 */}
      <div className="flex items-center px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
        {/* 드래그 핸들 — 여기서만 drag 시작 */}
        <div
          className="cursor-grab active:cursor-grabbing mr-2 text-gray-300 hover:text-gray-500"
          title="드래그하여 순서 변경"
          onMouseDown={enableDrag}
          onMouseUp={disableDrag}
          onMouseLeave={disableDrag}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>

        <input
          type="text"
          value={block.title}
          onChange={(e) => updateBlock(block.id, { title: e.target.value })}
          placeholder="블록 제목 (선택)"
          className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-300"
        />
        <button
          onClick={handleWriteHwp}
          disabled={hwpWriting}
          className={`ml-2 px-2 py-0.5 text-xs rounded transition-colors ${
            hwpWriting
              ? 'bg-gray-300 text-gray-500 cursor-wait'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
          title="이 블록만 HWP에 작성"
        >
          {hwpWriting ? '작성 중...' : 'HWP'}
        </button>
        <button
          onClick={handleDelete}
          className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="블록 삭제"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* TipTap 에디터 */}
      <RichEditor
        blockId={block.id}
        content={block.content}
        onUpdate={(content) => updateBlock(block.id, { content })}
        isActive={isActive}
      />
    </div>
  )
}
