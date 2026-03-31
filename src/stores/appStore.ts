import { create } from 'zustand'
import type { ChatMessage, EditorBlock, PanelSizes, SavedOdData } from '@/types'
import type { LayoutMode } from '@/components/layout/LayoutPicker'

interface AppState {
  // PDF
  pdfPath: string | null
  currentPage: number
  totalPages: number
  setPdfPath: (path: string | null) => void
  setCurrentPage: (page: number) => void
  setTotalPages: (total: number) => void

  // 에디터 블록
  blocks: EditorBlock[]
  activeBlockId: string | null
  addBlock: (afterBlockId?: string) => void
  removeBlock: (id: string) => void
  updateBlock: (id: string, updates: Partial<EditorBlock>) => void
  setActiveBlockId: (id: string | null) => void
  reorderBlocks: (fromIndex: number, toIndex: number) => void

  // 레이아웃
  layoutMode: LayoutMode
  setLayoutMode: (mode: LayoutMode) => void

  // 채팅 패널
  isChatOpen: boolean
  toggleChat: () => void

  // 패널 크기
  panelSizes: PanelSizes
  setPanelSizes: (sizes: PanelSizes) => void

  // 캡처
  isCapturing: boolean
  captureLoading: boolean
  captureError: string | null
  setIsCapturing: (capturing: boolean) => void
  setCaptureLoading: (loading: boolean) => void
  setCaptureError: (error: string | null) => void

  // 채팅 히스토리 (블록별)
  chatHistories: Record<string, ChatMessage[]>
  addChatMessage: (blockId: string, message: ChatMessage) => void
  clearChatHistory: (blockId: string) => void

  // OD 모드
  odEnabled: boolean
  setOdEnabled: (enabled: boolean) => void
  odReviewEnabled: boolean
  setOdReviewEnabled: (enabled: boolean) => void

  // OD 결과 저장 (블록별 재편집용)
  savedOdData: Record<string, SavedOdData>
  saveOdData: (blockId: string, data: SavedOdData) => void
  clearOdData: (blockId: string) => void

  // OD 재편집 모달
  reReviewBlockId: string | null
  setReReviewBlockId: (blockId: string | null) => void

  // HWP 연결
  hwpConnected: boolean
  setHwpConnected: (connected: boolean) => void

  // HWP 내보내기
  hwpExporting: boolean
  hwpExportError: string | null
  setHwpExporting: (exporting: boolean) => void
  setHwpExportError: (error: string | null) => void

  // 블록 선택 (컨텍스트 엔진)
  selectedBlockIds: Set<string>
  toggleBlockSelection: (id: string) => void
  selectAllBlocks: () => void
  deselectAllBlocks: () => void

  // 생성 블록 대기 HTML (mount 전 이벤트 유실 방지)
  pendingBlockHtml: Record<string, string>
  setPendingBlockHtml: (blockId: string, html: string) => void
  consumePendingBlockHtml: (blockId: string) => string | null

  // 블록 접기/펴기
  collapsedBlockIds: Set<string>
  toggleBlockCollapse: (id: string) => void
  collapseAllBlocks: () => void
  expandAllBlocks: () => void
}

// 빈 ProseMirror JSON (빈 문단 1개)
const EMPTY_PROSEMIRROR_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})

let blockCounter = 0
function generateBlockId(): string {
  blockCounter += 1
  return `block-${Date.now()}-${blockCounter}`
}

export const useAppStore = create<AppState>((set, get) => ({
  // PDF
  pdfPath: null,
  currentPage: 1,
  totalPages: 0,
  setPdfPath: (path) => set({ pdfPath: path, currentPage: 1, totalPages: 0 }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),

  // 에디터 블록
  blocks: [],
  activeBlockId: null,
  addBlock: (afterBlockId?: string) =>
    set((state) => {
      const newBlock: EditorBlock = {
        id: generateBlockId(),
        title: '',
        content: EMPTY_PROSEMIRROR_JSON,
        createdAt: Date.now(),
      }
      if (afterBlockId) {
        const idx = state.blocks.findIndex((b) => b.id === afterBlockId)
        if (idx !== -1) {
          const blocks = [...state.blocks]
          blocks.splice(idx + 1, 0, newBlock)
          return { blocks }
        }
      }
      return { blocks: [...state.blocks, newBlock] }
    }),
  removeBlock: (id) =>
    set((state) => {
      const { [id]: _, ...remainingHistories } = state.chatHistories
      const nextSelected = new Set(state.selectedBlockIds)
      nextSelected.delete(id)
      const nextCollapsed = new Set(state.collapsedBlockIds)
      nextCollapsed.delete(id)
      const { [id]: _p, ...remainingPending } = state.pendingBlockHtml
      const { [id]: _od, ...remainingOdData } = state.savedOdData
      // Asset Store 정리 (별도 store이므로 side-effect로 호출)
      import('@/stores/assetStore').then(({ useAssetStore }) => {
        useAssetStore.getState().removeAssetsByBlock(id)
      })
      return {
        blocks: state.blocks.filter((b) => b.id !== id),
        activeBlockId: state.activeBlockId === id ? null : state.activeBlockId,
        chatHistories: remainingHistories,
        selectedBlockIds: nextSelected,
        collapsedBlockIds: nextCollapsed,
        pendingBlockHtml: remainingPending,
        savedOdData: remainingOdData,
        reReviewBlockId: state.reReviewBlockId === id ? null : state.reReviewBlockId,
      }
    }),
  updateBlock: (id, updates) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    })),
  setActiveBlockId: (id) => set({ activeBlockId: id }),
  reorderBlocks: (fromIndex, toIndex) =>
    set((state) => {
      const blocks = [...state.blocks]
      const [moved] = blocks.splice(fromIndex, 1)
      blocks.splice(toIndex, 0, moved)
      return { blocks }
    }),

  // 레이아웃
  layoutMode: 'three-equal',
  setLayoutMode: (mode) => set({ layoutMode: mode }),

  // 채팅
  isChatOpen: true,
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),

  // 패널 크기 (퍼센트)
  panelSizes: { pdf: 30, editor: 40, chat: 30 },
  setPanelSizes: (sizes) => set({ panelSizes: sizes }),

  // 캡처
  isCapturing: false,
  captureLoading: false,
  captureError: null,
  setIsCapturing: (capturing) => set({ isCapturing: capturing }),
  setCaptureLoading: (loading) => set({ captureLoading: loading }),
  setCaptureError: (error) => set({ captureError: error }),

  // 채팅 히스토리
  chatHistories: {},
  addChatMessage: (blockId, message) =>
    set((state) => ({
      chatHistories: {
        ...state.chatHistories,
        [blockId]: [...(state.chatHistories[blockId] || []), message],
      },
    })),
  clearChatHistory: (blockId) =>
    set((state) => {
      const { [blockId]: _, ...rest } = state.chatHistories
      return { chatHistories: rest }
    }),

  // OD 모드
  odEnabled: false,
  setOdEnabled: (enabled) => set({ odEnabled: enabled }),
  odReviewEnabled: false,
  setOdReviewEnabled: (enabled) => set({ odReviewEnabled: enabled }),

  // OD 결과 저장
  savedOdData: {},
  saveOdData: (blockId, data) =>
    set((state) => ({
      savedOdData: { ...state.savedOdData, [blockId]: data },
    })),
  clearOdData: (blockId) =>
    set((state) => {
      const { [blockId]: _, ...rest } = state.savedOdData
      return { savedOdData: rest }
    }),

  // OD 재편집 모달
  reReviewBlockId: null,
  setReReviewBlockId: (blockId) => set({ reReviewBlockId: blockId }),

  // HWP
  hwpConnected: false,
  setHwpConnected: (connected) => set({ hwpConnected: connected }),

  // HWP 내보내기
  hwpExporting: false,
  hwpExportError: null,
  setHwpExporting: (exporting) => set({ hwpExporting: exporting }),
  setHwpExportError: (error) => set({ hwpExportError: error }),

  // 생성 블록 대기 HTML
  pendingBlockHtml: {},
  setPendingBlockHtml: (blockId, html) =>
    set((state) => ({
      pendingBlockHtml: { ...state.pendingBlockHtml, [blockId]: html },
    })),
  consumePendingBlockHtml: (blockId) => {
    const html = get().pendingBlockHtml[blockId] || null
    if (html) {
      set((state) => {
        const { [blockId]: _, ...rest } = state.pendingBlockHtml
        return { pendingBlockHtml: rest }
      })
    }
    return html
  },

  // 블록 선택
  selectedBlockIds: new Set<string>(),
  toggleBlockSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedBlockIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedBlockIds: next }
    }),
  selectAllBlocks: () =>
    set((state) => ({
      selectedBlockIds: new Set(state.blocks.map((b) => b.id)),
    })),
  deselectAllBlocks: () => set({ selectedBlockIds: new Set<string>() }),

  // 블록 접기/펴기
  collapsedBlockIds: new Set<string>(),
  toggleBlockCollapse: (id) =>
    set((state) => {
      const next = new Set(state.collapsedBlockIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { collapsedBlockIds: next }
    }),
  collapseAllBlocks: () =>
    set((state) => ({
      collapsedBlockIds: new Set(state.blocks.map((b) => b.id)),
    })),
  expandAllBlocks: () => set({ collapsedBlockIds: new Set<string>() }),
}))
