import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:openFile', options),
  readPdf: (filePath: string) =>
    ipcRenderer.invoke('file:readPdf', filePath) as Promise<{ data: string | null; error: string | null }>,
  geminiVision: (imageBase64: string, prompt: string) =>
    ipcRenderer.invoke('gemini:vision', imageBase64, prompt) as Promise<{ html: string | null; error: string | null }>,

  // PDF 페이지 이미지 추출
  extractPdfImages: (pdfPath: string, pageNum: number) =>
    ipcRenderer.invoke('pdf:extractImages', pdfPath, pageNum) as Promise<{ images: Array<{ bbox_norm: number[]; base64: string }>; error: string | null }>,

  // OD 기반 캡처 분석
  analyzeCapture: (imageBase64: string, options?: { pdfPath?: string; pageNum?: number; captureBboxNorm?: number[] }) =>
    ipcRenderer.invoke('capture:analyze', imageBase64, options) as Promise<{ html: string | null; regions: number; error: string | null }>,

  // OD 검출만 (v2.1 OD Review Step)
  detectRegions: (imageBase64: string) =>
    ipcRenderer.invoke('capture:detect', imageBase64) as Promise<{ detections: unknown[]; imageWidth: number; imageHeight: number; error: string | null }>,

  // 편집된 detections 기반 변환 (v2.1 OD Review Step)
  convertRegions: (payload: { imageBase64: string; detections: unknown[]; pdfPath?: string; pageNum?: number; captureBboxNorm?: number[] }) =>
    ipcRenderer.invoke('capture:convert', payload) as Promise<{ html: string | null; regions: number; error: string | null }>,

  // Gemini 채팅
  geminiChat: (payload: { messages: Array<{ role: string; text: string }>; context?: string }) =>
    ipcRenderer.invoke('gemini:chat', payload) as Promise<{ text: string | null; error: string | null }>,

  // HWP 연동
  connectHwp: () =>
    ipcRenderer.invoke('hwp:connect') as Promise<{ connected: boolean; error: string | null }>,
  checkHwp: () =>
    ipcRenderer.invoke('hwp:check') as Promise<{ connected: boolean; error: string | null }>,
  checkHwpCursor: () =>
    ipcRenderer.invoke('hwp:checkCursor') as Promise<{ at_end: boolean; error: string | null }>,
  writeHwp: (payload: { html: string; title: string; mathMappings: Record<string, string> }) =>
    ipcRenderer.invoke('hwp:write', payload) as Promise<{ success: boolean; data: unknown; error: string | null }>,
  fixEquationWidth: (payload: { filePath: string; outputPath?: string; delay?: number; limit?: number }) =>
    ipcRenderer.invoke('hwp:fixEquationWidth', payload) as Promise<{ success: boolean; data: unknown; error: string | null }>,

  // Gemini 자료 생성 (Phase 10)
  geminiGenerate: (payload: {
    context: string; presetId: string; presetSystemPrompt: string;
    outputSchema: string; outputExample: string; userInstruction: string
  }) =>
    ipcRenderer.invoke('gemini:generate', payload) as Promise<{
      ir: Record<string, unknown> | null; rawText?: string; error: string | null
    }>,

  // Generation IR → HWP 직접 작성
  writeHwpFromIR: (payload: {
    irJson: Record<string, unknown>;
    mathMappings: Record<string, string>;
    assets: Record<string, string>
  }) =>
    ipcRenderer.invoke('hwp:writeFromIR', payload) as Promise<{
      success: boolean; data: unknown; error: string | null
    }>,

  // 세션 복구 시 PDF allowlist 등록
  allowPdf: (filePath: string) =>
    ipcRenderer.invoke('session:allowPdf', filePath) as Promise<{ success: boolean; error?: string }>,

  // Gemini API 키 설정
  getApiKey: () =>
    ipcRenderer.invoke('config:getApiKey') as Promise<{ key: string; hasKey: boolean }>,
  saveApiKey: (apiKey: string) =>
    ipcRenderer.invoke('config:saveApiKey', apiKey) as Promise<{ success: boolean; error?: string }>,

  // OD 진행 상황 수신
  onOdProgress: (callback: (progress: { step: string; current: number; total: number; detail: string }) => void) => {
    const handler = (_event: unknown, progress: { step: string; current: number; total: number; detail: string }) => callback(progress)
    ipcRenderer.on('od:progress', handler)
    return () => { ipcRenderer.removeListener('od:progress', handler) }
  },

  // OD 패키지 설치 상태 수신
  onOdPackageStatus: (callback: (status: { status: string; error?: string }) => void) => {
    const handler = (_event: unknown, status: { status: string; error?: string }) => callback(status)
    ipcRenderer.on('od:package-status', handler)
    return () => { ipcRenderer.removeListener('od:package-status', handler) }
  },

  // 세션 저장/복구
  saveSession: (data: string) =>
    ipcRenderer.invoke('session:save', data) as Promise<{ success: boolean; error?: string }>,
  loadSession: () =>
    ipcRenderer.invoke('session:load') as Promise<{ data: string | null; error: string | null }>,
  clearSession: () =>
    ipcRenderer.invoke('session:clear') as Promise<{ success: boolean }>,

  // 앱 버전 + 릴리즈 노트 표시 이력
  getAppVersion: () =>
    ipcRenderer.invoke('app:getVersion') as Promise<string>,
  getLastSeenVersion: () =>
    ipcRenderer.invoke('app:getLastSeenVersion') as Promise<{ version: string | null }>,
  setLastSeenVersion: (version: string) =>
    ipcRenderer.invoke('app:setLastSeenVersion', version) as Promise<{ success: boolean; error?: string }>,
})
