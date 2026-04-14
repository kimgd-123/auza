import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { autoUpdater } from 'electron-updater'
import { startPythonProcess, stopPythonProcess, sendPythonCommand } from './python-bridge'

let mainWindow: BrowserWindow | null = null

// 사용자가 다이얼로그로 선택한 PDF 경로만 허용
const allowedPdfPaths = new Set<string>()

// 세션 파일 경로
function getSessionPath(): string {
  return path.join(app.getPath('appData'), 'AUZA-v2', 'session.json')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'AUZA — PDF-to-Document 스마트 작성기',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 단일 인스턴스 보장 — 두 번째 실행 시 기존 창에 포커스만 주고 종료.
// in-process config 직렬화 큐(updateConfig)는 단일 main 프로세스에서만 유효하므로,
// 다중 인스턴스 실행 시 config.json race를 방지하기 위해 필수.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  // Electron 기본 메뉴 제거
  Menu.setApplicationMenu(null)

  // ── CSP (Content-Security-Policy) 설정 ──
  const { session: electronSession } = require('electron')
  const isDev = !app.isPackaged
  electronSession.defaultSession.webRequest.onHeadersReceived((details: any, callback: any) => {
    const scriptSrc = isDev ? " script-src 'self' 'unsafe-inline';" : " script-src 'self';"
    const connectSrc = isDev
      ? " connect-src 'self' ws://localhost:* http://localhost:* https://generativelanguage.googleapis.com https://*.googleapis.com;"
      : " connect-src 'self' https://generativelanguage.googleapis.com https://*.googleapis.com;"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          scriptSrc +
          " style-src 'self' 'unsafe-inline';" +
          " img-src 'self' data: blob:;" +
          " font-src 'self' data:;" +
          connectSrc +
          " worker-src 'self' blob:;",
        ],
      },
    })
  })

  createWindow()

  // ── 자동 업데이트 (production만) ──
  if (!process.env.VITE_DEV_SERVER_URL) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update:available', info.version)
    })

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update:progress', Math.round(progress.percent))
    })

    autoUpdater.on('update-downloaded', (info) => {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: '업데이트 준비 완료',
        message: `새 버전 ${info.version}이 다운로드되었습니다.\n지금 재시작하여 업데이트하시겠습니까?`,
        buttons: ['지금 재시작', '나중에'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
    })

    autoUpdater.on('error', (err) => {
      console.error('[auto-updater] 업데이트 체크 실패:', err.message)
    })

    // 앱 시작 후 3초 뒤 업데이트 확인
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 3000)
  }
})

app.on('window-all-closed', () => {
  stopPythonProcess()
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// ── PDF 경로 검증 공통 헬퍼 ──
// 모든 PDF 관련 IPC에서 사용. path.resolve() → allowlist 검증.
// allowPdf에서 realpath로 등록하므로, 여기서도 동일하게 resolve 후 검증.
function validatePdfPath(pdfPath: string | undefined): string | null {
  if (!pdfPath) return null
  const resolved = path.resolve(pdfPath)
  if (!allowedPdfPaths.has(resolved)) return null
  return resolved
}

// IPC: 파일 열기 다이얼로그
ipcMain.handle('dialog:openFile', async (_event, options: { filters?: Electron.FileFilter[] }) => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters ?? [{ name: 'PDF Files', extensions: ['pdf'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  // 다이얼로그에서 선택된 경로를 allowlist에 등록
  allowedPdfPaths.add(path.resolve(filePath))
  return filePath
})

// IPC: PDF 파일 읽기 (비동기, allowlist 검증)
ipcMain.handle('file:readPdf', async (_event, filePath: string) => {
  try {
    const resolved = path.resolve(filePath)

    // allowlist 검증: 다이얼로그에서 선택한 경로만 허용
    if (!allowedPdfPaths.has(resolved)) {
      return { data: null, error: '허용되지 않은 파일 경로입니다' }
    }

    // 확장자 검증
    if (path.extname(resolved).toLowerCase() !== '.pdf') {
      return { data: null, error: 'PDF 파일만 읽을 수 있습니다' }
    }

    // 파일 존재 확인
    await fs.access(resolved)

    // 비동기 읽기
    const buffer = await fs.readFile(resolved)
    return { data: buffer.toString('base64'), error: null }
  } catch (err) {
    return { data: null, error: (err as Error).message }
  }
})

// Gemini API 키 로딩: .env.local → %APPDATA%/AUZA-v2/config.json
async function loadGeminiApiKey(): Promise<string | null> {
  // 1. .env.local
  try {
    const envPath = path.join(app.getAppPath(), '.env.local')
    const envContent = await fs.readFile(envPath, 'utf-8')
    const match = envContent.match(/^GEMINI_API_KEY=(.+)$/m)
    if (match?.[1]?.trim()) return match[1].trim()
  } catch { /* not found */ }

  // 2. %APPDATA%/AUZA-v2/config.json
  try {
    const configPath = path.join(app.getPath('appData'), 'AUZA-v2', 'config.json')
    const configContent = await fs.readFile(configPath, 'utf-8')
    const config = JSON.parse(configContent)
    if (config.geminiApiKey) return config.geminiApiKey
  } catch { /* not found */ }

  return null
}

// IPC: Gemini Vision — 이미지를 Gemini에 전송하여 구조화된 콘텐츠 인식
ipcMain.handle('gemini:vision', async (_event, imageBase64: string, prompt: string) => {
  try {
    const apiKey = await loadGeminiApiKey()
    if (!apiKey) {
      return { html: null, error: 'Gemini API 키가 설정되지 않았습니다. .env.local 또는 설정에서 API 키를 입력해주세요.' }
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' })

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64,
        },
      },
      prompt,
    ])

    const response = result.response
    const text = response.text()
    if (!text) {
      return { html: null, error: '인식 결과가 비어 있습니다. 더 크게 확대해서 다시 캡처해주세요.' }
    }

    return { html: text, error: null }
  } catch (err) {
    return { html: null, error: (err as Error).message }
  }
})

// IPC: Gemini 채팅 — 텍스트 기반 대화 (Phase 6)
ipcMain.handle(
  'gemini:chat',
  async (
    _event,
    payload: { messages: Array<{ role: string; text: string }>; context?: string },
  ) => {
    try {
      const apiKey = await loadGeminiApiKey()
      if (!apiKey) {
        return { text: null, error: 'Gemini API 키가 설정되지 않았습니다.' }
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' })

      // 시스템 프롬프트 + 컨텍스트 구성
      const systemParts: string[] = [
        '당신은 교수학습자료 작성을 돕는 AI 어시스턴트입니다.',
        '사용자가 요청하면 텍스트를 수정하거나, 표를 생성/편집하거나, 내용을 요약하거나, 학습자료를 생성할 수 있습니다.',
        '응답은 HTML 형식으로 해주세요. 표는 <table> 태그를, 수식은 $...$ 또는 $$...$$ 형식을 사용하세요.',
        '절대 <html>, <head>, <body>, <!DOCTYPE> 태그를 포함하지 마세요. 본문 콘텐츠만 반환하세요.',
        '표를 만들 때 <thead>, <tbody>를 사용하지 말고 <table> 안에 <tr>과 <th>/<td>만 사용하세요.',
        'HTML만 반환하고 마크다운 코드블록(```)으로 감싸지 마세요.',
        '',
        '## 컨텍스트 구조',
        '아래에 "블록 목록"(요약)과 "선택된 블록 상세"(Markdown 전문)가 제공됩니다.',
        '- 블록 이름 옆 *가 붙은 항목이 사용자가 선택한 블록입니다.',
        '- [asset:ID] 형태의 참조는 이미지를 의미합니다. 이미지 내용을 직접 볼 수 없으니 문맥으로 판단하세요.',
        '- 사용자가 "이 내용"이라고 하면 선택된 블록 전체를 참조하세요.',
      ]
      if (payload.context) {
        systemParts.push(`\n---\n${payload.context}`)
      }

      // Gemini chat history 구성
      const chatHistory = payload.messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.text }],
      }))

      const chat = model.startChat({
        history: chatHistory,
        systemInstruction: { role: 'system' as const, parts: [{ text: systemParts.join('\n') }] },
      })

      const lastMessage = payload.messages[payload.messages.length - 1]
      const result = await chat.sendMessage(lastMessage.text)
      const text = result.response.text()

      return { text: text || null, error: text ? null : '응답이 비어 있습니다.' }
    } catch (err) {
      return { text: null, error: (err as Error).message }
    }
  },
)

// IPC: Gemini 자료 생성 — 프리셋 기반 schema-validated JSON 출력 (Phase 10)
ipcMain.handle(
  'gemini:generate',
  async (
    _event,
    payload: {
      context: string          // 2계층 컨텍스트 (buildContext 결과)
      presetId: string         // 프리셋 ID
      presetSystemPrompt: string  // 프리셋 시스템 프롬프트
      outputSchema: string     // JSON 스키마 설명
      outputExample: string    // 출력 예시
      userInstruction: string  // 사용자 지시
    },
  ) => {
    try {
      const apiKey = await loadGeminiApiKey()
      if (!apiKey) {
        return { ir: null, error: 'Gemini API 키가 설정되지 않았습니다.' }
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' })

      // PRD §13.6.2 생성 프롬프트 계약
      const systemPrompt = [
        payload.presetSystemPrompt,
        '',
        '## 출력 JSON 스키마',
        payload.outputSchema,
        '',
        '## 출력 예시',
        payload.outputExample,
        '',
        '## 컨텍스트 (선택 블록 내용)',
        payload.context,
      ].join('\n')

      const chat = model.startChat({
        systemInstruction: { role: 'system' as const, parts: [{ text: systemPrompt }] },
      })

      const result = await chat.sendMessage(payload.userInstruction)
      let text = result.response.text()

      if (!text) {
        return { ir: null, error: '생성 결과가 비어 있습니다.' }
      }

      // JSON 코드블록 래퍼 제거
      text = text.trim()
      if (text.startsWith('```json')) text = text.slice(7)
      else if (text.startsWith('```')) text = text.slice(3)
      if (text.endsWith('```')) text = text.slice(0, -3)
      text = text.trim()

      // JSON 파싱 검증
      let ir
      try {
        ir = JSON.parse(text)
      } catch {
        return { ir: null, rawText: text, error: 'Gemini 출력이 유효한 JSON이 아닙니다.' }
      }

      // 기본 스키마 검증
      if (!ir.type || !ir.sections) {
        return { ir: null, rawText: text, error: 'Generation IR 스키마가 올바르지 않습니다 (type, sections 필수).' }
      }

      return { ir, error: null }
    } catch (err) {
      return { ir: null, error: (err as Error).message }
    }
  },
)

// IPC: Generation IR → HWP 직접 작성 (Python 백엔드 경유)
ipcMain.handle(
  'hwp:writeFromIR',
  async (
    _event,
    payload: {
      irJson: Record<string, unknown>
      mathMappings: Record<string, string>
      assets: Record<string, string>  // {asset_id: base64}
    },
  ) => {
    const result = await sendPythonCommand('write_hwp_from_ir', payload)
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  },
)

// IPC: PDF 페이지 이미지 추출 (PyMuPDF)
ipcMain.handle('pdf:extractImages', async (_event, pdfPath: string, pageNum: number) => {
  try {
    const validated = validatePdfPath(pdfPath)
    if (!validated) {
      return { images: [], error: '허용되지 않은 PDF 경로입니다.' }
    }
    const result = await sendPythonCommand('extract_pdf_images', { pdfPath: validated, pageNum })
    if (!result.success || !result.data) {
      return { images: [], error: result.error }
    }
    const data = result.data as { images: Array<{ bbox_norm: number[]; base64: string }>; error: string | null }
    return { images: data.images || [], error: data.error }
  } catch (err) {
    return { images: [], error: (err as Error).message }
  }
})

// IPC: OD 기반 캡처 영역 분석 — Python OD + Gemini Vision
ipcMain.handle('capture:analyze', async (_event, imageBase64: string, options?: {
  pdfPath?: string; pageNum?: number; captureBboxNorm?: number[]
}) => {
  try {
    const apiKey = await loadGeminiApiKey()
    if (!apiKey) {
      return { html: null, regions: 0, error: 'Gemini API 키가 설정되지 않았습니다.' }
    }

    // pdfPath allowlist 검증
    const validatedPdfPath = validatePdfPath(options?.pdfPath) || ''

    // OD 분석: 첫 실행 시 패키지 설치(~10분) + 모델 로드 + Gemini 호출 → 15분 타임아웃
    const result = await sendPythonCommand('od_analyze', {
      imageBase64,
      apiKey,
      pdfPath: validatedPdfPath,
      pageNum: options?.pageNum ?? -1,
      captureBboxNorm: options?.captureBboxNorm || null,
    }, 900_000)

    if (!result.success || !result.data) {
      return { html: null, regions: 0, error: result.error || 'OD 분석에 실패했습니다.' }
    }

    const data = result.data as { html: string; regions: number; error: string | null }
    return {
      html: data.html || null,
      regions: data.regions || 0,
      error: data.error || null,
    }
  } catch (err) {
    return { html: null, regions: 0, error: (err as Error).message }
  }
})

// IPC: OD 검출만 수행 (Gemini 호출 없음) — v2.1 OD Review Step
ipcMain.handle('capture:detect', async (_event, imageBase64: string) => {
  try {
    // cold start: 첫 실행 시 패키지 설치(~10분) + 모델 로드 → 15분 타임아웃
    const result = await sendPythonCommand('od_detect', { imageBase64 }, 900_000)
    if (!result.success || !result.data) {
      return { detections: [], imageWidth: 0, imageHeight: 0, error: result.error || 'OD 검출 실패' }
    }
    const data = result.data as { detections: unknown[]; imageWidth: number; imageHeight: number; error: string | null }
    return {
      detections: data.detections || [],
      imageWidth: data.imageWidth || 0,
      imageHeight: data.imageHeight || 0,
      error: data.error || null,
    }
  } catch (err) {
    return { detections: [], imageWidth: 0, imageHeight: 0, error: (err as Error).message }
  }
})

// IPC: 사용자 편집된 detections 기반 Gemini 변환 + figure 후처리 — v2.1 OD Review Step
ipcMain.handle('capture:convert', async (_event, payload: {
  imageBase64: string; detections: unknown[]; pdfPath?: string; pageNum?: number; captureBboxNorm?: number[]
}) => {
  try {
    const apiKey = await loadGeminiApiKey()
    if (!apiKey) {
      return { html: null, regions: 0, error: 'Gemini API 키가 설정되지 않았습니다.' }
    }
    // pdfPath allowlist 검증
    const validatedPdfPath = validatePdfPath(payload.pdfPath) || ''

    const result = await sendPythonCommand('od_convert', {
      imageBase64: payload.imageBase64,
      detections: payload.detections,
      apiKey,
      pdfPath: validatedPdfPath,
      pageNum: payload.pageNum ?? -1,
      captureBboxNorm: payload.captureBboxNorm || null,
    }, 300_000)
    if (!result.success || !result.data) {
      return { html: null, regions: 0, error: result.error || '변환에 실패했습니다.' }
    }
    const data = result.data as { html: string; regions: number; error: string | null }
    return {
      html: data.html || null,
      regions: data.regions || 0,
      error: data.error || null,
    }
  } catch (err) {
    return { html: null, regions: 0, error: (err as Error).message }
  }
})

// IPC: 일괄 캡처 전용 — 여러 세그먼트를 한 번에 변환 (Python 내부 단일 Pool 병렬화)
ipcMain.handle('capture:convertMany', async (_event, payload: {
  segments: Array<{
    imageBase64: string
    detections: unknown[]
    pdfPath?: string
    pageNum?: number
    captureBboxNorm?: number[]
  }>
}) => {
  try {
    const apiKey = await loadGeminiApiKey()
    if (!apiKey) {
      return { results: [], error: 'Gemini API 키가 설정되지 않았습니다.' }
    }
    const segments = Array.isArray(payload?.segments) ? payload.segments : []
    if (segments.length === 0) {
      return { results: [], error: 'segments가 비어있습니다.' }
    }

    // 각 세그먼트의 pdfPath를 allowlist로 검증
    const normalizedSegments = segments.map((s) => ({
      imageBase64: s.imageBase64,
      detections: s.detections,
      pdfPath: validatePdfPath(s.pdfPath) || '',
      pageNum: s.pageNum ?? -1,
      captureBboxNorm: s.captureBboxNorm || null,
    }))

    // 실제 Gemini task 수 기반 동적 timeout (wave 단위 계산)
    // Why: 단순히 세그먼트 수만 기반으로 잡으면 region-heavy 배치(세그먼트당 detection 4+)에서
    //      Python은 계속 일하는데 Electron이 먼저 timeout → 이후 Python 명령도 블로킹됨 (F1 High).
    // 공식: base + ceil(totalTasks / effectiveWorkers) * perWaveTime
    //   - totalTasks: 각 세그먼트의 non-figure detection 수 합계 (detections 없으면 1 — whole-image fallback)
    //   - effectiveWorkers: AUZA_GEMINI_PARALLEL_DISABLE=1 이면 1, 아니면 AUZA_GEMINI_PARALLEL (기본 4)
    //     — Python _get_parallel_workers() 와 동일한 규칙으로 정렬해 실제 실행 모드와 일치시킴
    //   - PER_WAVE_TIMEOUT: Gemini Vision 1 wave 보수적 상한 (180초 = 60초 × 재시도 3회 + backoff)
    //   - legacyFloor: 예전 공식(세그먼트당 2분 + 기본 3분)을 최소값으로 보장해 regression 방지
    const countTasks = (s: { detections: unknown[] }): number => {
      const dets = Array.isArray(s.detections) ? s.detections : []
      if (dets.length === 0) return 1
      // figure detection은 Gemini 호출 없이 이미지 직접 삽입(trust_labels)이라 task에 포함 안 함
      const nonFigure = dets.filter((d) => {
        const region = (d as { region?: string })?.region
        return region !== 'figure' && region !== 'abandon'
      }).length
      return Math.max(nonFigure, 1)
    }
    const totalTasks = segments.reduce((sum, s) => sum + countTasks(s), 0)

    const parallelDisabled = (process.env.AUZA_GEMINI_PARALLEL_DISABLE || '').trim() === '1'
    const workersRaw = parseInt(process.env.AUZA_GEMINI_PARALLEL || '8', 10)
    const configuredWorkers = Number.isFinite(workersRaw) && workersRaw >= 1 && workersRaw <= 10 ? workersRaw : 8
    const effectiveWorkers = parallelDisabled ? 1 : configuredWorkers
    const waves = Math.ceil(totalTasks / effectiveWorkers)

    const BASE_TIMEOUT = 5 * 60 * 1000           // 5분 base (IPC + Python 초기화 + 여유)
    const PER_WAVE_TIMEOUT = 180 * 1000          // wave당 180초 (Gemini 60s × 재시도 3회 + backoff 상한)
    const MAX_TIMEOUT = 60 * 60 * 1000           // 60분 절대 상한
    const taskBasedTimeout = BASE_TIMEOUT + waves * PER_WAVE_TIMEOUT
    const legacyFloor = 3 * 60 * 1000 + segments.length * 2 * 60 * 1000
    const timeout = Math.min(Math.max(taskBasedTimeout, legacyFloor), MAX_TIMEOUT)

    console.log(`[capture:convertMany] segments=${segments.length} totalTasks=${totalTasks} ` +
                `effectiveWorkers=${effectiveWorkers} (parallelDisabled=${parallelDisabled}) ` +
                `waves=${waves} timeout=${Math.round(timeout / 1000)}s ` +
                `(taskBased=${Math.round(taskBasedTimeout / 1000)}s, legacyFloor=${Math.round(legacyFloor / 1000)}s)`)

    const result = await sendPythonCommand('od_convert_many', {
      segments: normalizedSegments,
      apiKey,
    }, timeout)

    if (!result.success || !result.data) {
      return { results: [], error: result.error || '일괄 변환에 실패했습니다.' }
    }
    const data = result.data as {
      results: Array<{ html: string; regions: number; error: string | null }>
      error: string | null
    }
    return {
      results: data.results || [],
      error: data.error || null,
    }
  } catch (err) {
    return { results: [], error: (err as Error).message }
  }
})

// ── HWP 연동 IPC ──

// Python 백엔드 시작 + OD 패키지 사전 설치 (앱 초기화 시)
app.whenReady().then(async () => {
  try {
    await startPythonProcess()

    // renderer 로드 완료 대기 후 OD 패키지 설치
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return

    const sendStatus = (status: string, error?: string) => {
      try { win.webContents.send('od:package-status', { status, error }) } catch { /* ignore */ }
    }

    // renderer가 로드된 후 실행
    const startInstall = async () => {
      // React 마운트 대기 (1초)
      await new Promise((r) => setTimeout(r, 1000))
      sendStatus('checking')

      const result = await sendPythonCommand('ensure_od_packages', {}, 900_000)

      if (result.success && (result.data as { installed: boolean })?.installed) {
        sendStatus('ready')
        console.log('[main] OD 패키지 설치 완료')
      } else {
        sendStatus('error', result.error || 'OD 패키지 설치 실패')
        console.error('[main] OD 패키지 설치 실패:', result.error)
      }
    }

    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => startInstall())
    } else {
      startInstall()
    }
  } catch (err) {
    console.error('[main] Python 시작 실패:', (err as Error).message)
  }
})

// IPC: HWP 수동 연결 (사용자 트리거)
ipcMain.handle('hwp:connect', async () => {
  const result = await sendPythonCommand('connect_hwp')
  if (!result.success || !result.data) {
    return { connected: false, error: result.error || 'Python 백엔드에 연결할 수 없습니다.' }
  }
  return result.data as { connected: boolean; error: string | null }
})

// IPC: HWP 연결 확인
ipcMain.handle('hwp:check', async () => {
  const result = await sendPythonCommand('check_hwp')
  if (!result.success || !result.data) {
    return { connected: false, error: result.error || 'Python 백엔드에 연결할 수 없습니다. Python과 pywin32가 설치되어 있는지 확인해주세요.' }
  }
  return result.data as { connected: boolean; error: string | null }
})

// IPC: HWP 커서 위치 확인
ipcMain.handle('hwp:checkCursor', async () => {
  const result = await sendPythonCommand('check_cursor')
  if (!result.success || !result.data) {
    return { at_end: false, error: result.error || 'Python 백엔드에 연결할 수 없습니다.' }
  }
  return result.data as { at_end: boolean; error: string | null }
})

// IPC: HWP에 콘텐츠 작성
ipcMain.handle(
  'hwp:write',
  async (
    _event,
    payload: { html: string; title: string; mathMappings: Record<string, string> },
  ) => {
    const result = await sendPythonCommand('write_hwp', payload)
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  },
)

// IPC: 수식 너비 자동 조정
ipcMain.handle(
  'hwp:fixEquationWidth',
  async (
    _event,
    payload: { filePath: string; outputPath?: string; delay?: number; limit?: number },
  ) => {
    // 수식 너비 조정은 수식 수에 따라 오래 걸릴 수 있어 10분 타임아웃
    const result = await sendPythonCommand('fix_equation_width', payload, 600_000)
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  },
)

// IPC: 세션 복구 시 PDF 경로를 allowlist에 등록
// 보안: 확장자 검증 + 파일 존재 확인 + 정규화된 경로(canonical path) 반환
// 렌더러 store와 allowlist가 동일한 경로를 참조하도록 canonicalPath를 반환
ipcMain.handle('session:allowPdf', async (_event, filePath: string) => {
  try {
    const resolved = path.resolve(filePath)
    if (path.extname(resolved).toLowerCase() !== '.pdf') {
      return { success: false, error: 'PDF 파일이 아닙니다.', canonicalPath: null }
    }
    const stat = await fs.stat(resolved)
    if (!stat.isFile()) {
      return { success: false, error: 'PDF 파일이 아닙니다.', canonicalPath: null }
    }
    allowedPdfPaths.add(resolved)
    return { success: true, canonicalPath: resolved }
  } catch (err) {
    return { success: false, error: (err as Error).message, canonicalPath: null }
  }
})

// ── 공용 config.json 접근 계층 ──
// 단일 config 파일(%APPDATA%/AUZA-v2/config.json)에 대한 read-modify-write를
// 프로세스 내부 Promise 큐로 직렬화하고 tmp-write/rename으로 원자적 저장.
// geminiApiKey, lastSeenVersion 등 모든 필드 저장은 이 경로를 거쳐야 race 없이
// 병합된다. (Codex F2 대응)

function getConfigPath(): string {
  return path.join(app.getPath('appData'), 'AUZA-v2', 'config.json')
}

async function readConfigRaw(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

async function writeConfigAtomic(config: Record<string, unknown>): Promise<void> {
  const configPath = getConfigPath()
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  const tmpPath = configPath + '.tmp'
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
  await fs.rename(tmpPath, configPath)
}

// 프로세스 내 직렬화 큐: 모든 read-modify-write를 한 번에 하나씩 처리
let configWriteQueue: Promise<unknown> = Promise.resolve()

function updateConfig<T>(
  mutator: (config: Record<string, unknown>) => T | Promise<T>,
): Promise<T> {
  const next = configWriteQueue.then(async () => {
    const config = await readConfigRaw()
    const result = await mutator(config)
    await writeConfigAtomic(config)
    return result
  })
  // 큐 자체는 실패해도 이어져야 하므로 rejection을 삼킨다
  configWriteQueue = next.catch(() => undefined)
  return next
}

// ── Gemini API 키 설정 IPC ──

ipcMain.handle('config:getApiKey', async () => {
  const key = await loadGeminiApiKey()
  return { key: key || '', hasKey: !!key }
})

ipcMain.handle('config:saveApiKey', async (_event, apiKey: string) => {
  try {
    await updateConfig((config) => {
      config.geminiApiKey = apiKey.trim()
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

// ── 릴리즈 노트 표시 이력 (lastSeenVersion) ──
// 버전 업 후 첫 실행 시 ReleaseNotesDialog 자동 표시 여부 결정

// IPC: 현재 앱 버전 반환
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

// IPC: 마지막으로 사용자가 본 릴리즈 노트 버전
ipcMain.handle('app:getLastSeenVersion', async () => {
  try {
    const config = await readConfigRaw()
    return { version: (config.lastSeenVersion as string) || null }
  } catch {
    return { version: null }
  }
})

// IPC: 사용자가 본 릴리즈 노트 버전 저장
ipcMain.handle('app:setLastSeenVersion', async (_event, version: string) => {
  try {
    await updateConfig((config) => {
      config.lastSeenVersion = version
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

// ── 세션 자동 저장/복구 IPC ──

// IPC: 세션 저장 (원자적 — 임시 파일 작성 후 rename)
ipcMain.handle('session:save', async (_event, data: string) => {
  try {
    const sessionPath = getSessionPath()
    const dir = path.dirname(sessionPath)
    await fs.mkdir(dir, { recursive: true })
    const tmpPath = sessionPath + '.tmp'
    await fs.writeFile(tmpPath, data, 'utf-8')
    await fs.rename(tmpPath, sessionPath)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

// IPC: 세션 로드 (파일 없음 vs 손상 구분)
ipcMain.handle('session:load', async () => {
  const sessionPath = getSessionPath()
  try {
    await fs.access(sessionPath)
  } catch {
    return { data: null, error: null } // 파일 없음 — 에러 아님
  }
  try {
    const raw = await fs.readFile(sessionPath, 'utf-8')
    // JSON 유효성 검증
    JSON.parse(raw)
    return { data: raw, error: null }
  } catch {
    return { data: null, error: '세션 파일이 손상되었습니다. 새로 시작합니다.' }
  }
})

// IPC: 세션 삭제
ipcMain.handle('session:clear', async () => {
  try {
    const sessionPath = getSessionPath()
    await fs.unlink(sessionPath)
    return { success: true }
  } catch {
    return { success: true } // 파일 없어도 성공
  }
})
