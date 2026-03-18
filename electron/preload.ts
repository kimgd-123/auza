import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:openFile', options),
  readPdf: (filePath: string) =>
    ipcRenderer.invoke('file:readPdf', filePath) as Promise<{ data: string | null; error: string | null }>,
  geminiVision: (imageBase64: string, prompt: string) =>
    ipcRenderer.invoke('gemini:vision', imageBase64, prompt) as Promise<{ html: string | null; error: string | null }>,

  // OD 기반 캡처 분석
  analyzeCapture: (imageBase64: string) =>
    ipcRenderer.invoke('capture:analyze', imageBase64) as Promise<{ html: string | null; regions: number; error: string | null }>,

  // Gemini 채팅
  geminiChat: (payload: { messages: Array<{ role: string; text: string }>; context?: string }) =>
    ipcRenderer.invoke('gemini:chat', payload) as Promise<{ text: string | null; error: string | null }>,

  // HWP 연동
  checkHwp: () =>
    ipcRenderer.invoke('hwp:check') as Promise<{ connected: boolean; error: string | null }>,
  checkHwpCursor: () =>
    ipcRenderer.invoke('hwp:checkCursor') as Promise<{ at_end: boolean; error: string | null }>,
  writeHwp: (payload: { html: string; title: string; mathMappings: Record<string, string> }) =>
    ipcRenderer.invoke('hwp:write', payload) as Promise<{ success: boolean; data: unknown; error: string | null }>,
  fixEquationWidth: (payload: { filePath: string; outputPath?: string; delay?: number; limit?: number }) =>
    ipcRenderer.invoke('hwp:fixEquationWidth', payload) as Promise<{ success: boolean; data: unknown; error: string | null }>,

  // 세션 복구 시 PDF allowlist 등록
  allowPdf: (filePath: string) =>
    ipcRenderer.invoke('session:allowPdf', filePath) as Promise<{ success: boolean; error?: string }>,

  // Gemini API 키 설정
  getApiKey: () =>
    ipcRenderer.invoke('config:getApiKey') as Promise<{ key: string; hasKey: boolean }>,
  saveApiKey: (apiKey: string) =>
    ipcRenderer.invoke('config:saveApiKey', apiKey) as Promise<{ success: boolean; error?: string }>,

  // 세션 저장/복구
  saveSession: (data: string) =>
    ipcRenderer.invoke('session:save', data) as Promise<{ success: boolean; error?: string }>,
  loadSession: () =>
    ipcRenderer.invoke('session:load') as Promise<{ data: string | null; error: string | null }>,
  clearSession: () =>
    ipcRenderer.invoke('session:clear') as Promise<{ success: boolean }>,
})
