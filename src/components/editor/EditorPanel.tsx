import { useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import EditorBlock from './EditorBlock'

export default function EditorPanel() {
  const { blocks, addBlock, reorderBlocks } = useAppStore()
  const dragIndexRef = useRef<number | null>(null)

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, _index: number) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((toIndex: number) => {
    const fromIndex = dragIndexRef.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderBlocks(fromIndex, toIndex)
    }
    dragIndexRef.current = null
  }, [reorderBlocks])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-sm">에디터 블록을 추가하여 시작하세요</p>
            <button
              onClick={addBlock}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors"
            >
              + 블록 추가
            </button>
          </div>
        ) : (
          <>
            {blocks.map((block, index) => (
              <EditorBlock
                key={block.id}
                block={block}
                index={index}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}

            <button
              onClick={addBlock}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm"
            >
              + 블록 추가
            </button>
          </>
        )}
      </div>
    </div>
  )
}
