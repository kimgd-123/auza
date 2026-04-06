/**
 * Python child_process 브릿지
 *
 * Python 백엔드(python/main.py)와 stdin/stdout JSON으로 통신합니다.
 * 요청: {"id": string, "command": string, "payload": object}
 * 응답: {"id": string, "success": boolean, "data": object, "error": string|null}
 */

import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { app, BrowserWindow } from 'electron'

interface PythonResponse {
  id: string
  success: boolean
  data: unknown
  error: string | null
}

type PendingCallback = {
  resolve: (value: PythonResponse) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let pythonProcess: ChildProcess | null = null
let requestCounter = 0
const pendingRequests = new Map<string, PendingCallback>()
let lineBuffer = ''

const REQUEST_TIMEOUT_MS = 120_000 // 2분 (수식 너비 조정 등 오래 걸리는 작업)

function getPythonScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'python', 'main.py')
  }
  return path.join(app.getAppPath(), 'python', 'main.py')
}

function findPythonExecutable(): string {
  if (process.platform !== 'win32') return 'python3'

  // Windows: 구체적인 Python 설치 경로를 우선 탐색
  // (WindowsApps 스텁보다 실제 설치된 Python을 우선)
  const fs = require('fs')
  const candidates = [
    // 표준 설치 경로 (Python 3.11, 3.12, 3.13 등)
    ...['313', '312', '311', '310'].map(
      (v) => `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python${v}\\python.exe`,
    ),
    // py launcher (공식 설치 시 함께 설치됨)
    'py',
    // 기본 fallback
    'python',
  ]

  for (const candidate of candidates) {
    try {
      if (candidate.includes('\\')) {
        if (fs.existsSync(candidate)) return candidate
      } else {
        return candidate
      }
    } catch {
      // 계속 탐색
    }
  }

  return 'python'
}

export function startPythonProcess(): void {
  if (pythonProcess) return

  const scriptPath = getPythonScriptPath()
  const pythonExe = findPythonExecutable()

  console.log(`[python-bridge] Starting: ${pythonExe} ${scriptPath}`)

  pythonProcess = spawn(pythonExe, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })

  // stdout: JSON 응답 수신 (line-delimited)
  pythonProcess.stdout?.on('data', (data: Buffer) => {
    lineBuffer += data.toString('utf-8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const response = JSON.parse(trimmed) as PythonResponse
        const pending = pendingRequests.get(response.id)
        if (pending) {
          clearTimeout(pending.timer)
          pendingRequests.delete(response.id)
          pending.resolve(response)
        }
      } catch (err) {
        console.error('[python-bridge] Failed to parse response:', trimmed)
      }
    }
  })

  // stderr: 로그 출력 + OD 진행 상황 파싱
  pythonProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString('utf-8').trim()
    if (!msg) return

    // [od-progress] JSON 라인 파싱 → renderer로 전달
    for (const line of msg.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('[od-progress] ')) {
        try {
          const json = trimmed.slice('[od-progress] '.length)
          const progress = JSON.parse(json)
          const win = BrowserWindow.getAllWindows()[0]
          if (win) {
            win.webContents.send('od:progress', progress)
          }
        } catch {
          // 파싱 실패는 무시
        }
      }
    }

    console.log(`[python] ${msg}`)
  })

  pythonProcess.on('exit', (code) => {
    console.log(`[python-bridge] Process exited with code ${code}`)
    pythonProcess = null

    // 대기 중인 요청 모두 reject
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`Python process exited (code ${code})`))
      pendingRequests.delete(id)
    }
  })

  pythonProcess.on('error', (err) => {
    console.error('[python-bridge] Failed to start Python:', err.message)
    pythonProcess = null
  })
}

export function stopPythonProcess(): void {
  if (!pythonProcess) return
  pythonProcess.stdin?.end()
  pythonProcess.kill()
  pythonProcess = null
}

export async function sendPythonCommand(
  command: string,
  payload: Record<string, unknown> = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<PythonResponse> {
  if (!pythonProcess || !pythonProcess.stdin?.writable) {
    startPythonProcess()
    // 프로세스 시작 대기
    await new Promise((r) => setTimeout(r, 500))
    if (!pythonProcess || !pythonProcess.stdin?.writable) {
      return { id: '', success: false, data: null, error: 'Python 프로세스를 시작할 수 없습니다.' }
    }
  }

  const id = `req-${++requestCounter}-${Date.now()}`
  const request = JSON.stringify({ id, command, payload }) + '\n'

  return new Promise<PythonResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      resolve({ id, success: false, data: null, error: '요청 시간이 초과되었습니다.' })
    }, timeoutMs)

    pendingRequests.set(id, { resolve, reject, timer })
    pythonProcess!.stdin!.write(request, 'utf-8')
  })
}
