import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { startPythonProcess, stopPythonProcess, sendPythonCommand } from './python-bridge'

let mainWindow: BrowserWindow | null = null

// 사용자가 다이얼로그로 선택한 PDF 경로만 허용
const allowedPdfPaths = new Set<string>()

// 세션 파일 경로
function getSessionPath(): string {
  return path.join(app.getPath('appData'), 'AUZA', 'session.json')
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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  stopPythonProcess()
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

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

// Gemini API 키 로딩: .env.local → %APPDATA%/AUZA/config.json
async function loadGeminiApiKey(): Promise<string | null> {
  // 1. .env.local
  try {
    const envPath = path.join(app.getAppPath(), '.env.local')
    const envContent = await fs.readFile(envPath, 'utf-8')
    const match = envContent.match(/^GEMINI_API_KEY=(.+)$/m)
    if (match?.[1]?.trim()) return match[1].trim()
  } catch { /* not found */ }

  // 2. %APPDATA%/AUZA/config.json
  try {
    const configPath = path.join(app.getPath('appData'), 'AUZA', 'config.json')
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

      // 시스템 프롬프트 + 컨텍스트 구성
      const systemParts: string[] = [
        '당신은 문서 작성을 돕는 AI 어시스턴트입니다.',
        '사용자가 요청하면 텍스트를 수정하거나, 표를 생성/편집하거나, 내용을 요약할 수 있습니다.',
        '응답은 HTML 형식으로 해주세요. 표는 <table> 태그를, 수식은 $...$ 또는 $$...$$ 형식을 사용하세요.',
        '절대 <html>, <head>, <body>, <!DOCTYPE> 태그를 포함하지 마세요. 본문 콘텐츠만 반환하세요.',
        '표를 만들 때 <thead>, <tbody>를 사용하지 말고 <table> 안에 <tr>과 <th>/<td>만 사용하세요.',
        'HTML만 반환하고 마크다운 코드블록(```)으로 감싸지 마세요.',
      ]
      if (payload.context) {
        systemParts.push(`\n현재 에디터 블록 내용:\n${payload.context}`)
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

// IPC: OD 기반 캡처 영역 분석 — Python OD + Gemini Vision
ipcMain.handle('capture:analyze', async (_event, imageBase64: string) => {
  try {
    const apiKey = await loadGeminiApiKey()
    if (!apiKey) {
      return { html: null, regions: 0, error: 'Gemini API 키가 설정되지 않았습니다.' }
    }

    // OD 분석은 모델 로드 + 다중 Gemini 호출로 오래 걸릴 수 있어 5분 타임아웃
    const result = await sendPythonCommand('od_analyze', {
      imageBase64,
      apiKey,
    }, 300_000)

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

// ── HWP 연동 IPC ──

// Python 백엔드 시작 (앱 초기화 시)
app.whenReady().then(() => {
  startPythonProcess()
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
ipcMain.handle('session:allowPdf', async (_event, filePath: string) => {
  try {
    const resolved = path.resolve(filePath)
    if (path.extname(resolved).toLowerCase() !== '.pdf') {
      return { success: false, error: 'PDF 파일이 아닙니다.' }
    }
    await fs.access(resolved)
    allowedPdfPaths.add(resolved)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

// ── Gemini API 키 설정 IPC ──

ipcMain.handle('config:getApiKey', async () => {
  const key = await loadGeminiApiKey()
  return { key: key || '', hasKey: !!key }
})

ipcMain.handle('config:saveApiKey', async (_event, apiKey: string) => {
  try {
    const configDir = path.join(app.getPath('appData'), 'AUZA')
    const configPath = path.join(configDir, 'config.json')
    await fs.mkdir(configDir, { recursive: true })

    let config: Record<string, unknown> = {}
    try {
      const existing = await fs.readFile(configPath, 'utf-8')
      config = JSON.parse(existing)
    } catch { /* first time */ }

    config.geminiApiKey = apiKey.trim()
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
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
