import { useState, useMemo, useEffect } from 'react'
import { RELEASE_NOTES, type ChangeType, type ReleaseNote } from '@/data/releaseNotes'

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest'; version: string }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string }

interface Props {
  open: boolean
  onClose: () => void
  /** 자동 표시(버전 업 후 첫 실행)인지 여부 — 헤더 문구가 달라짐 */
  autoShown?: boolean
}

const TYPE_LABEL: Record<ChangeType, string> = {
  feat: '새 기능',
  fix: '버그 수정',
  perf: '성능 개선',
  refactor: '리팩토링',
  docs: '문서',
  chore: '기타',
}

const TYPE_BADGE_CLASS: Record<ChangeType, string> = {
  feat: 'bg-blue-100 text-blue-700 border-blue-200',
  fix: 'bg-amber-100 text-amber-700 border-amber-200',
  perf: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  refactor: 'bg-purple-100 text-purple-700 border-purple-200',
  docs: 'bg-gray-100 text-gray-700 border-gray-200',
  chore: 'bg-gray-100 text-gray-600 border-gray-200',
}

const TYPE_ORDER: ChangeType[] = ['feat', 'fix', 'perf', 'refactor', 'docs', 'chore']

export default function ReleaseNotesDialog({ open, onClose, autoShown = false }: Props) {
  const currentVersion = __APP_VERSION__
  const [selectedVersion, setSelectedVersion] = useState<string>(
    () => RELEASE_NOTES[0]?.version ?? currentVersion,
  )
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: 'idle' })

  const selected = useMemo(
    () => RELEASE_NOTES.find((r) => r.version === selectedVersion) ?? RELEASE_NOTES[0],
    [selectedVersion],
  )

  // autoUpdater 이벤트 구독 (모달이 열려있는 동안)
  useEffect(() => {
    if (!open) return
    const api = window.electronAPI
    if (!api?.onUpdateEvent) return
    const unsub = api.onUpdateEvent((ev) => {
      if (ev.type === 'available') {
        setUpdateStatus({ kind: 'available', version: String(ev.payload) })
      } else if (ev.type === 'progress') {
        setUpdateStatus((prev) => {
          const version =
            prev.kind === 'available' || prev.kind === 'downloading' ? prev.version : '?'
          return { kind: 'downloading', version, percent: Number(ev.payload) }
        })
      } else if (ev.type === 'downloaded') {
        setUpdateStatus({ kind: 'downloaded', version: String(ev.payload) })
      } else if (ev.type === 'not-available') {
        setUpdateStatus({ kind: 'latest', version: String(ev.payload) || currentVersion })
      } else if (ev.type === 'error') {
        setUpdateStatus({ kind: 'error', message: String(ev.payload) })
      }
    })
    return unsub
  }, [open, currentVersion])

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.checkForUpdates) {
      setUpdateStatus({ kind: 'error', message: '지원하지 않는 환경입니다.' })
      return
    }
    setUpdateStatus({ kind: 'checking' })
    const result = await window.electronAPI.checkForUpdates()
    if (!result.ok) {
      setUpdateStatus({ kind: 'error', message: result.error || '업데이트 확인 실패' })
      return
    }
    // update-available / not-available 이벤트가 상태를 덮어쓰므로 기본값만 설정
    if (!result.hasUpdate) {
      setUpdateStatus({ kind: 'latest', version: result.currentVersion || currentVersion })
    }
    // hasUpdate=true이면 이벤트 수신으로 downloading → downloaded 진행
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-3 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              업데이트 내역
              {autoShown && (
                <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                  NEW
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {autoShown
                ? `v${currentVersion}로 업데이트되었습니다. 주요 변경 사항을 확인해주세요.`
                : `현재 버전: v${currentVersion}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="닫기"
          >
            &times;
          </button>
        </div>

        {/* 본문: 좌측 버전 리스트 + 우측 상세 */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 좌측 버전 리스트 */}
          <div className="w-40 border-r border-gray-200 overflow-y-auto flex-shrink-0 bg-gray-50">
            {RELEASE_NOTES.map((note, idx) => {
              const isSelected = note.version === selectedVersion
              const isCurrent = note.version === currentVersion
              return (
                <button
                  key={note.version}
                  onClick={() => setSelectedVersion(note.version)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-200 text-xs transition-colors ${
                    isSelected
                      ? 'bg-white border-l-2 border-l-blue-500'
                      : 'hover:bg-white/60 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-semibold ${
                        isSelected ? 'text-blue-700' : 'text-gray-800'
                      }`}
                    >
                      v{note.version}
                    </span>
                    {idx === 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-blue-500 text-white rounded-full">
                        최신
                      </span>
                    )}
                    {isCurrent && idx !== 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-gray-400 text-white rounded-full">
                        현재
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{note.date}</div>
                </button>
              )
            })}
          </div>

          {/* 우측 상세 */}
          <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4">
            {selected ? <ReleaseDetail note={selected} /> : (
              <p className="text-sm text-gray-500">릴리즈 노트가 없습니다.</p>
            )}
          </div>
        </div>

        {/* 하단 */}
        <div className="px-5 py-3 border-t flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={handleCheckForUpdates}
              disabled={
                updateStatus.kind === 'checking' ||
                updateStatus.kind === 'downloading' ||
                updateStatus.kind === 'downloaded'
              }
              className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
            >
              {updateStatus.kind === 'checking' && (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
                </svg>
              )}
              업데이트 확인
            </button>
            <UpdateStatusText status={updateStatus} />
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex-shrink-0"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

function UpdateStatusText({ status }: { status: UpdateStatus }) {
  if (status.kind === 'idle') {
    return (
      <span className="text-xs text-gray-400 truncate">
        새 버전은 자동으로 다운로드됩니다
      </span>
    )
  }
  if (status.kind === 'checking') {
    return <span className="text-xs text-gray-500">확인 중...</span>
  }
  if (status.kind === 'latest') {
    return (
      <span className="text-xs text-emerald-700">
        ✓ 최신 버전입니다 (v{status.version})
      </span>
    )
  }
  if (status.kind === 'available') {
    return (
      <span className="text-xs text-blue-700">
        새 버전 v{status.version} 다운로드 시작...
      </span>
    )
  }
  if (status.kind === 'downloading') {
    return (
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs text-blue-700 whitespace-nowrap">
          v{status.version} 다운로드 중 {status.percent}%
        </span>
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${status.percent}%` }}
          />
        </div>
      </div>
    )
  }
  if (status.kind === 'downloaded') {
    return (
      <span className="text-xs text-emerald-700">
        ✓ v{status.version} 다운로드 완료 — 재시작 대기
      </span>
    )
  }
  // error
  return (
    <span className="text-xs text-red-600 truncate" title={status.message}>
      {status.message}
    </span>
  )
}

function ReleaseDetail({ note }: { note: ReleaseNote }) {
  // 타입별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<ChangeType, string[]>()
    for (const c of note.changes) {
      if (!map.has(c.type)) map.set(c.type, [])
      map.get(c.type)!.push(c.text)
    }
    return map
  }, [note])

  return (
    <div className="space-y-4">
      {/* 버전 헤더 */}
      <div>
        <div className="flex items-baseline gap-2">
          <h4 className="text-xl font-bold text-gray-900">v{note.version}</h4>
          <span className="text-xs text-gray-500">{note.date}</span>
        </div>
        {note.title && (
          <p className="text-sm text-gray-700 mt-0.5 font-medium">{note.title}</p>
        )}
      </div>

      {/* 하이라이트 */}
      {note.highlights && note.highlights.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <h5 className="text-xs font-semibold text-blue-800 mb-1.5">주요 변경 사항</h5>
          <ul className="list-disc pl-4 space-y-1 text-xs text-blue-900">
            {note.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 타입별 변경 사항 */}
      <div className="space-y-3">
        {TYPE_ORDER.filter((t) => grouped.has(t)).map((type) => (
          <div key={type}>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 border rounded-full ${TYPE_BADGE_CLASS[type]}`}
              >
                {TYPE_LABEL[type]}
              </span>
              <span className="text-[10px] text-gray-400">
                {grouped.get(type)!.length}건
              </span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700 leading-relaxed">
              {grouped.get(type)!.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
