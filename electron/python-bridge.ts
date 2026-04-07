/**
 * Python child_process 브릿지
 *
 * Python 백엔드(python/main.py)와 stdin/stdout JSON으로 통신합니다.
 * 요청: {"id": string, "command": string, "payload": object}
 * 응답: {"id": string, "success": boolean, "data": object, "error": string|null}
 */

import { spawn, ChildProcess, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
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

/** Python 런타임 초기화 promise — 동시 호출 방지 */
let runtimeReady: Promise<string> | null = null

const REQUEST_TIMEOUT_MS = 120_000 // 2분 (수식 너비 조정 등 오래 걸리는 작업)

function getPythonScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'python', 'main.py')
  }
  return path.join(app.getAppPath(), 'python', 'main.py')
}

function findPythonExecutable(): string | null {
  if (process.platform !== 'win32') return 'python3'

  // 1순위: 번들된 embed Python (패키지된 설치 버전에서만 사용)
  if (app.isPackaged) {
    const bundledPath = path.join(process.resourcesPath, 'python-embed', 'python.exe')
    if (fs.existsSync(bundledPath)) {
      console.log(`[python-bridge] Using bundled embed Python: ${bundledPath}`)
      return bundledPath
    }
  }

  // 2순위: 시스템에 설치된 Python (실행 검증 포함)
  const candidates = [
    ...['313', '312', '311', '310'].map(
      (v) => `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python${v}\\python.exe`,
    ),
    'py',
    'python',
  ]

  for (const candidate of candidates) {
    try {
      if (candidate.includes('\\')) {
        if (!fs.existsSync(candidate)) continue
      }
      // 실제 실행 가능 여부 probe
      execFileSync(candidate, ['--version'], { stdio: 'pipe', timeout: 5000 })
      console.log(`[python-bridge] Using system Python: ${candidate}`)
      return candidate
    } catch {
      // probe 실패 → 다음 후보
    }
  }

  // Python을 찾을 수 없음
  return null
}

/** Python 런타임 확보 — 번들/시스템 순서 */
async function ensurePythonRuntime(): Promise<string> {
  const existing = findPythonExecutable()
  if (existing) return existing
  throw new Error('Python을 찾을 수 없습니다. 설치 버전을 사용해주세요.')
}

function spawnPythonProcess(pythonExe: string): void {
  const scriptPath = getPythonScriptPath()
  console.log(`[python-bridge] Starting: ${pythonExe} ${scriptPath}`)

  // Python embed 디렉토리를 PATH에 추가 — torch 등 외부 패키지가
  // vcruntime140.dll 등 VC++ DLL을 찾을 수 있도록 함
  const pythonDir = path.dirname(pythonExe)
  const envPath = `${pythonDir};${process.env.PATH || ''}`

  pythonProcess = spawn(pythonExe, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PATH: envPath },
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

export async function startPythonProcess(): Promise<void> {
  if (pythonProcess) return

  if (!runtimeReady) {
    runtimeReady = ensurePythonRuntime()
  }

  try {
    const pythonExe = await runtimeReady
    spawnPythonProcess(pythonExe)
  } catch (err) {
    console.error('[python-bridge] Failed to ensure Python runtime:', (err as Error).message)
    runtimeReady = null
  }
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
    await startPythonProcess()
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
