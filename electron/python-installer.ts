/**
 * Python Embeddable 자동 다운로드 & 설치
 *
 * 무설치(portable) 버전에서 Python이 없을 때
 * python.org에서 embed zip을 다운로드하여 %APPDATA%/AUZA-v2/python-embed/에 설치합니다.
 */

import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import { execFile, exec } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

const PYTHON_VERSION = '3.12.9'
const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py'
const INSTALL_MARKER = '.auza-installed'

export function getAppDataEmbedPath(): string {
  const appData = app.getPath('userData') // %APPDATA%/AUZA-v2
  return path.join(appData, 'python-embed')
}

/** 설치 완료 여부 확인 */
export function isInstalled(): boolean {
  const dir = getAppDataEmbedPath()
  return (
    fs.existsSync(path.join(dir, 'python.exe')) &&
    fs.existsSync(path.join(dir, INSTALL_MARKER))
  )
}

function sendProgress(step: string, detail: string, percent: number) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send('python:install-progress', { step, detail, percent })
  }
}

/** URL에서 파일 다운로드 (진행률 콜백 포함) */
function downloadFile(url: string, dest: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (u: string) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location!)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: ${res.statusCode}`))
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
        let downloaded = 0
        const file = fs.createWriteStream(dest)

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          file.write(chunk)
          if (totalBytes > 0) {
            const pct = Math.round((downloaded / totalBytes) * 100)
            sendProgress('download', `${label} 다운로드 중... ${pct}%`, pct)
          }
        })

        res.on('end', () => {
          file.end(() => resolve())
        })

        res.on('error', reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

/** zip 파일 압축 해제 (비동기) */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  sendProgress('extract', 'Python 압축 해제 중...', 0)

  await execAsync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
    { timeout: 120000 },
  )

  sendProgress('extract', 'Python 압축 해제 완료', 100)
}

/** _pth 파일 수정하여 site-packages 활성화 */
function enableSitePackages(embedDir: string): void {
  const pthFile = path.join(embedDir, `python312._pth`)
  if (fs.existsSync(pthFile)) {
    let content = fs.readFileSync(pthFile, 'utf-8')
    content = content.replace('#import site', 'import site')
    fs.writeFileSync(pthFile, content, 'utf-8')
  }
}

/** pip 설치 (비동기) */
async function installPip(embedDir: string): Promise<void> {
  sendProgress('pip', 'pip 설치 중...', 0)

  const getPipPath = path.join(embedDir, 'get-pip.py')
  await downloadFile(GET_PIP_URL, getPipPath, 'pip 설치 도구')

  const pythonExe = path.join(embedDir, 'python.exe')
  await execFileAsync(pythonExe, [getPipPath, '--no-warn-script-location'], {
    cwd: embedDir,
    timeout: 120000,
  })

  // get-pip.py 정리
  fs.unlinkSync(getPipPath)

  sendProgress('pip', 'pip 설치 완료', 100)
}

/** 필수 패키지 설치 (비동기) */
async function installPackages(embedDir: string): Promise<void> {
  sendProgress('packages', '필수 패키지 설치 중...', 0)

  const pythonExe = path.join(embedDir, 'python.exe')
  const packages = ['beautifulsoup4', 'pywin32', 'Pillow']

  await execFileAsync(
    pythonExe,
    ['-m', 'pip', 'install', '--no-warn-script-location', ...packages],
    { cwd: embedDir, timeout: 300000 },
  )

  sendProgress('packages', '필수 패키지 설치 완료', 100)
}

/** smoke test: 핵심 모듈 import 확인 (비동기) */
async function smokeTest(embedDir: string): Promise<boolean> {
  const pythonExe = path.join(embedDir, 'python.exe')
  try {
    await execFileAsync(pythonExe, ['-c', 'import bs4, PIL, win32com; print("OK")'], {
      cwd: embedDir,
      timeout: 30000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Python Embedded 자동 설치 (메인 진입점)
 *
 * 이미 설치되어 있으면 즉시 반환.
 * 설치 실패 시 불완전한 디렉터리를 정리하고 에러를 throw합니다.
 */
export async function ensurePythonEmbed(): Promise<string> {
  const embedDir = getAppDataEmbedPath()
  const pythonExe = path.join(embedDir, 'python.exe')

  // 이미 정상 설치됨
  if (isInstalled() && await smokeTest(embedDir)) {
    return pythonExe
  }

  // 불완전 설치 정리
  if (fs.existsSync(embedDir)) {
    fs.rmSync(embedDir, { recursive: true, force: true })
  }

  console.log('[python-installer] Python embed 설치 시작')
  sendProgress('start', 'Python 환경을 준비하고 있습니다...', 0)

  // temp 디렉터리에서 작업 후 atomic move
  const tempDir = embedDir + '-installing'
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    // 1. 다운로드
    const zipPath = path.join(tempDir, 'python-embed.zip')
    await downloadFile(PYTHON_ZIP_URL, zipPath, 'Python')

    // 2. 압축 해제
    await extractZip(zipPath, tempDir)
    fs.unlinkSync(zipPath)

    // 3. site-packages 활성화
    enableSitePackages(tempDir)

    // 4. pip 설치
    await installPip(tempDir)

    // 5. 필수 패키지 설치
    await installPackages(tempDir)

    // 6. smoke test
    sendProgress('verify', '설치 확인 중...', 50)
    const ok = await smokeTest(tempDir)
    if (!ok) {
      throw new Error('Python smoke test 실패: 필수 모듈 import 불가')
    }

    // 7. 설치 완료 마커 작성
    fs.writeFileSync(path.join(tempDir, INSTALL_MARKER), `${PYTHON_VERSION}\n${new Date().toISOString()}`)

    // 8. atomic rename
    fs.renameSync(tempDir, embedDir)

    sendProgress('done', 'Python 설치 완료!', 100)
    console.log('[python-installer] Python embed 설치 완료')

    return pythonExe
  } catch (err) {
    // 실패 시 정리
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    sendProgress('error', `Python 설치 실패: ${(err as Error).message}`, -1)
    throw err
  }
}
