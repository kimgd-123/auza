// Electron API (preload에서 노출)
export interface HwpWritePayload {
  html: string
  title: string
  mathMappings: Record<string, string>
}

export interface HwpWriteResult {
  success: boolean
  data: unknown
  error: string | null
}

export interface ElectronAPI {
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
  readPdf: (filePath: string) => Promise<{ data: string | null; error: string | null }>
  geminiVision: (imageBase64: string, prompt: string) => Promise<VisionResult>
  extractPdfImages: (pdfPath: string, pageNum: number) => Promise<{ images: Array<{ bbox_norm: number[]; base64: string }>; error: string | null }>
  analyzeCapture: (imageBase64: string, options?: { pdfPath?: string; pageNum?: number; captureBboxNorm?: number[] }) => Promise<{ html: string | null; regions: number; error: string | null }>
  geminiChat: (payload: { messages: Array<{ role: string; text: string }>; context?: string }) => Promise<{ text: string | null; error: string | null }>

  // HWP 연동
  connectHwp: () => Promise<{ connected: boolean; error: string | null }>
  checkHwp: () => Promise<{ connected: boolean; error: string | null }>
  checkHwpCursor: () => Promise<{ at_end: boolean; error: string | null }>
  writeHwp: (payload: HwpWritePayload) => Promise<HwpWriteResult>
  fixEquationWidth: (payload: { filePath: string; outputPath?: string; delay?: number; limit?: number }) => Promise<HwpWriteResult>

  // Gemini API 키 설정
  getApiKey: () => Promise<{ key: string; hasKey: boolean }>
  saveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>

  // 세션 복구 시 PDF allowlist 등록
  allowPdf: (filePath: string) => Promise<{ success: boolean; error?: string }>

  // 세션 저장/복구
  saveSession: (data: string) => Promise<{ success: boolean; error?: string }>
  loadSession: () => Promise<{ data: string | null; error: string | null }>
  clearSession: () => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// 에디터 블록
export interface EditorBlock {
  id: string
  title: string
  content: string // ProseMirror JSON (직렬화)
  createdAt: number
}

// 채팅 메시지
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// 캡처 영역
export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

// Vision 인식 결과
export interface VisionResult {
  html: string | null
  error: string | null
}

// 세션 데이터
export interface SessionData {
  blocks: EditorBlock[]
  pdfPath: string | null
  savedAt: number
}

// 앱 상태
export interface PanelSizes {
  pdf: number
  editor: number
  chat: number
}
