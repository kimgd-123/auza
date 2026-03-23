import { useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import EditorBlock from './EditorBlock'

export default function EditorPanel() {
  const {
    blocks, addBlock, reorderBlocks,
    selectedBlockIds, toggleBlockSelection, selectAllBlocks, deselectAllBlocks,
    collapsedBlockIds, toggleBlockCollapse, collapseAllBlocks, expandAllBlocks,
  } = useAppStore()
  const dragIndexRef = useRef<number | null>(null)

  const allSelected = blocks.length > 0 && blocks.every((b) => selectedBlockIds.has(b.id))
  const allCollapsed = blocks.length > 0 && blocks.every((b) => collapsedBlockIds.has(b.id))

  const handleToggleAll = useCallback(() => {
    if (allSelected) deselectAllBlocks()
    else selectAllBlocks()
  }, [allSelected, selectAllBlocks, deselectAllBlocks])

  const handleToggleCollapseAll = useCallback(() => {
    if (allCollapsed) expandAllBlocks()
    else collapseAllBlocks()
  }, [allCollapsed, collapseAllBlocks, expandAllBlocks])

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
              onClick={() => addBlock()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors"
            >
              + 블록 추가
            </button>
          </div>
        ) : (
          <>
            {/* 상단 툴바: 전체 선택 + 전체 접기/펴기 */}
            <div className="flex items-center gap-4 px-1 pb-1">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleToggleAll}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                전체 선택 ({selectedBlockIds.size}/{blocks.length})
              </label>
              <button
                onClick={handleToggleCollapseAll}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                title={allCollapsed ? '전체 펴기' : '전체 접기'}
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${allCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {allCollapsed ? '전체 펴기' : '전체 접기'}
              </button>
            </div>

            {blocks.map((block, index) => (
              <div key={block.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedBlockIds.has(block.id)}
                  onChange={() => toggleBlockSelection(block.id)}
                  className="mt-3 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                  title="컨텍스트에 포함"
                />
                <div className="flex-1 min-w-0">
                  <EditorBlock
                    block={block}
                    index={index}
                    collapsed={collapsedBlockIds.has(block.id)}
                    onToggleCollapse={() => toggleBlockCollapse(block.id)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                </div>
              </div>
            ))}

            <button
              onClick={() => addBlock()}
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
