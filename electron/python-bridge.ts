/**
 * Python child_process 브릿지
 *
 * Python 백엔드(python/main.py)와 stdin/stdout JSON으로 통신합니다.
 * 요청: {"id": string, "command": string, "payload": object}
 * 응답: {"id": string, "success": boolean, "data": object, "error": string|null}
 */

import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { app } from 'electron'

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
  // Windows에서 python 경로 탐색
  return process.platform === 'win32' ? 'python' : 'python3'
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

  // stderr: 로그 출력
  pythonProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString('utf-8').trim()
    if (msg) console.log(`[python] ${msg}`)
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
