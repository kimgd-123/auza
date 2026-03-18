import { create } from 'zustand'
import type { ChatMessage, EditorBlock, PanelSizes } from '@/types'
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
  addBlock: () => void
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

  // HWP 연결
  hwpConnected: boolean
  setHwpConnected: (connected: boolean) => void

  // HWP 내보내기
  hwpExporting: boolean
  hwpExportError: string | null
  setHwpExporting: (exporting: boolean) => void
  setHwpExportError: (error: string | null) => void
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

export const useAppStore = create<AppState>((set) => ({
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
  addBlock: () =>
    set((state) => {
      const newBlock: EditorBlock = {
        id: generateBlockId(),
        title: '',
        content: EMPTY_PROSEMIRROR_JSON,
        createdAt: Date.now(),
      }
      return { blocks: [...state.blocks, newBlock] }
    }),
  removeBlock: (id) =>
    set((state) => {
      const { [id]: _, ...remainingHistories } = state.chatHistories
      return {
        blocks: state.blocks.filter((b) => b.id !== id),
        activeBlockId: state.activeBlockId === id ? null : state.activeBlockId,
        chatHistories: remainingHistories,
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

  // HWP
  hwpConnected: false,
  setHwpConnected: (connected) => set({ hwpConnected: connected }),

  // HWP 내보내기
  hwpExporting: false,
  hwpExportError: null,
  setHwpExporting: (exporting) => set({ hwpExporting: exporting }),
  setHwpExportError: (error) => set({ hwpExportError: error }),
}))
