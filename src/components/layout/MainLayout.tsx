import { useAppStore } from '@/stores/appStore'
import type { LayoutMode } from './LayoutPicker'
import PdfViewer from '../pdf/PdfViewer'
import EditorPanel from '../editor/EditorPanel'
import ChatPanel from '../chat/ChatPanel'
import StatusBar from './StatusBar'
import MenuBar from './MenuBar'

/**
 * 레이아웃 모드별 CSS Grid 설정
 */
const GRID_CONFIG: Record<LayoutMode, { cols: string; rows: string }> = {
  'three-equal':  { cols: '1fr 1fr 1fr', rows: '1fr' },
  'pdf-focus':    { cols: '2fr 1fr 1fr', rows: '1fr' },
  'editor-focus': { cols: '1fr 2fr 1fr', rows: '1fr' },
  'pdf-editor':   { cols: '1fr 1fr',     rows: '1fr' },
  'editor-chat':  { cols: '3fr 2fr',     rows: '1fr' },
  'pdf-stack':    { cols: '1fr 1fr',     rows: '1fr 1fr' },
}

/** 각 레이아웃에서 표시할 패널 */
const PANELS: Record<LayoutMode, { pdf: boolean; editor: boolean; chat: boolean }> = {
  'three-equal':  { pdf: true, editor: true, chat: true },
  'pdf-focus':    { pdf: true, editor: true, chat: true },
  'editor-focus': { pdf: true, editor: true, chat: true },
  'pdf-editor':   { pdf: true, editor: true, chat: false },
  'editor-chat':  { pdf: false, editor: true, chat: true },
  'pdf-stack':    { pdf: true, editor: true, chat: true },
}

/** 패널별 grid area (row-start/col-start/row-end/col-end) */
const AREAS: Record<LayoutMode, { pdf?: string; editor: string; chat?: string }> = {
  'three-equal':  { pdf: '1/1/2/2', editor: '1/2/2/3', chat: '1/3/2/4' },
  'pdf-focus':    { pdf: '1/1/2/2', editor: '1/2/2/3', chat: '1/3/2/4' },
  'editor-focus': { pdf: '1/1/2/2', editor: '1/2/2/3', chat: '1/3/2/4' },
  'pdf-editor':   { pdf: '1/1/2/2', editor: '1/2/2/3' },
  'editor-chat':  { editor: '1/1/2/2', chat: '1/2/2/3' },
  'pdf-stack':    { pdf: '1/1/3/2', editor: '1/2/2/3', chat: '2/2/3/3' },
}

export default function MainLayout() {
  const layoutMode = useAppStore((s) => s.layoutMode)
  const grid = GRID_CONFIG[layoutMode]
  const panels = PANELS[layoutMode]
  const areas = AREAS[layoutMode]

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <MenuBar />

      <div
        className="flex-1 overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: grid.cols,
          gridTemplateRows: grid.rows,
          gap: '1px',
          backgroundColor: '#e5e7eb', // gap 색상 = 디바이더
        }}
      >
        {/* PDF 뷰어 */}
        {panels.pdf && areas.pdf && (
          <div className="bg-white overflow-hidden min-w-0 min-h-0" style={{ gridArea: areas.pdf }}>
            <PdfViewer />
          </div>
        )}

        {/* 에디터 */}
        <div className="bg-white overflow-hidden min-w-0 min-h-0" style={{ gridArea: areas.editor }}>
          <EditorPanel />
        </div>

        {/* 채팅 */}
        {panels.chat && areas.chat && (
          <div className="bg-white overflow-hidden min-w-0 min-h-0" style={{ gridArea: areas.chat }}>
            <ChatPanel />
          </div>
        )}
      </div>

      <StatusBar />
    </div>
  )
}
