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
  detectRegions: (imageBase64: string) => Promise<OdDetectionResult>
  convertRegions: (payload: OdConvertPayload) => Promise<{ html: string | null; regions: number; error: string | null }>
  geminiChat: (payload: { messages: Array<{ role: string; text: string }>; context?: string }) => Promise<{ text: string | null; error: string | null }>

  // HWP 연동
  connectHwp: () => Promise<{ connected: boolean; error: string | null }>
  checkHwp: () => Promise<{ connected: boolean; error: string | null }>
  checkHwpCursor: () => Promise<{ at_end: boolean; error: string | null }>
  writeHwp: (payload: HwpWritePayload) => Promise<HwpWriteResult>
  fixEquationWidth: (payload: { filePath: string; outputPath?: string; delay?: number; limit?: number }) => Promise<HwpWriteResult>

  // Gemini 자료 생성 (Phase 10)
  geminiGenerate: (payload: {
    context: string; presetId: string; presetSystemPrompt: string;
    outputSchema: string; outputExample: string; userInstruction: string
  }) => Promise<{ ir: Record<string, unknown> | null; rawText?: string; error: string | null }>

  // Generation IR → HWP 직접 작성
  writeHwpFromIR: (payload: {
    irJson: Record<string, unknown>;
    mathMappings: Record<string, string>;
    assets: Record<string, string>
  }) => Promise<{ success: boolean; data: unknown; error: string | null }>

  // Gemini API 키 설정
  getApiKey: () => Promise<{ key: string; hasKey: boolean }>
  saveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>

  // 세션 복구 시 PDF allowlist 등록
  allowPdf: (filePath: string) => Promise<{ success: boolean; error?: string; canonicalPath?: string | null }>

  // OD 진행 상황 수신
  onOdProgress: (callback: (progress: OdProgress) => void) => () => void

  // OD 패키지 설치 상태 수신
  onOdPackageStatus: (callback: (status: { status: string; error?: string }) => void) => () => void

  // 세션 저장/복구
  saveSession: (data: string) => Promise<{ success: boolean; error?: string }>
  loadSession: () => Promise<{ data: string | null; error: string | null }>
  clearSession: () => Promise<{ success: boolean }>

  // 앱 버전 + 릴리즈 노트 표시 이력
  getAppVersion: () => Promise<string>
  getLastSeenVersion: () => Promise<{ version: string | null }>
  setLastSeenVersion: (version: string) => Promise<{ success: boolean; error?: string }>
}

// OD 진행 상황
export interface OdProgress {
  step: string  // 'od' | 'region' | 'gemini' | 'done'
  current: number
  total: number
  detail: string
}

// OD Review Step (v2.1) — 검출 결과 편집
export type OdRegionType = 'text' | 'table' | 'figure' | 'formula' | 'boxed_text' | 'abandon'

export interface OdDetection {
  id: string                    // 클라이언트 UUID (편집 추적용)
  label: string                 // YOLO 원본 라벨
  region: OdRegionType          // 매핑된 유형
  score: number                 // 신뢰도 0-1
  box_px: [number, number, number, number]  // [x1, y1, x2, y2] 캡처 이미지 좌표
}

export interface OdDetectionResult {
  detections: OdDetection[]
  imageWidth: number
  imageHeight: number
  error: string | null
}

export interface OdConvertPayload {
  imageBase64: string
  detections: OdDetection[]
  pdfPath?: string
  pageNum?: number
  captureBboxNorm?: number[]
}

/** 리뷰 세션 — detect 시점에 생성, source context를 immutable하게 고정 */
export interface PendingOdReview {
  imageBase64: string
  imageWidth: number
  imageHeight: number
  pdfPath: string | null
  pageNum: number               // 0-based
  captureBboxNorm: number[]
  blockId: string
  detections: OdDetection[]     // 편집 가능 (mutable copy)
}

/** 블록별 저장된 OD 결과 — 재편집 및 AI 재변환용 */
export interface SavedOdData {
  imageBase64: string
  imageWidth: number
  imageHeight: number
  pdfPath: string | null
  pageNum: number
  captureBboxNorm: number[]
  detections: OdDetection[]
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

// Asset (이미지 ID 참조 시스템)
export interface Asset {
  id: string                    // "IMG_001", "CAP_003"
  type: 'image' | 'capture' | 'template_analysis'
  base64: string                // 로컬 전용 — LLM에 전달하지 않음
  alt: string
  caption?: string
  sourceBlock: string           // 해당 블록 ID
  sourcePage?: number           // PDF 페이지 번호
}

// 일괄 캡처 (Batch Capture)
export interface BatchCaptureSegment {
  id: string                    // "batch_{timestamp}_{order}"
  pageNum: number               // 0-based
  bboxNorm: number[]            // [x0, y0, x1, y1] normalized
  pdfPath: string | null
  captureBase64?: string
  imageWidth?: number
  imageHeight?: number
  detections?: OdDetection[]
  convertedHtml?: string
  status: 'pending' | 'capturing' | 'detecting' | 'detected' | 'reviewed' | 'converting' | 'converted' | 'error'
  error?: string
}

export interface BatchCaptureState {
  active: boolean
  status: 'capturing' | 'reviewing' | 'converting' | 'done' | 'cancelled'
  segments: BatchCaptureSegment[]
}

// 앱 상태
export interface PanelSizes {
  pdf: number
  editor: number
  chat: number
}
