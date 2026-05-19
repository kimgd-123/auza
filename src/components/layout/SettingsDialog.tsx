import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiKeyEntry } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
}

interface DraftKey extends ApiKeyEntry {
  // UI 전용 — 신규 추가 직후 입력 중인 키는 별도 표시
  isNew?: boolean
  testStatus?: 'idle' | 'testing' | 'ok' | 'error'
  testMessage?: string
}

// 신규 추가 시 기본 source 는 'config' (사용자가 UI 로 추가한 키)
const DEFAULT_NEW_SOURCE: 'config' = 'config'

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

export default function SettingsDialog({ open, onClose }: Props) {
  const [keys, setKeys] = useState<DraftKey[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSuccess(false)
    setLoading(true)
    window.electronAPI?.getApiKeys?.().then((res) => {
      const list = (res?.keys || []).map<DraftKey>((e) => ({
        key: e.key,
        label: e.label || '키',
        disabled: e.disabled === true,
        source: e.source,
        testStatus: 'idle',
      }))
      setKeys(list)
      setLoading(false)
    }).catch((err) => {
      setError((err as Error).message)
      setLoading(false)
    })
  }, [open])

  const activeCount = useMemo(
    () => keys.filter((k) => !k.disabled && k.key.trim()).length,
    [keys],
  )

  const handleAdd = useCallback(() => {
    setKeys((prev) => [
      ...prev,
      {
        key: '',
        label: `키 ${prev.length + 1}`,
        disabled: false,
        source: DEFAULT_NEW_SOURCE,
        isNew: true,
        testStatus: 'idle',
      },
    ])
  }, [])

  const handleRemove = useCallback((idx: number) => {
    setKeys((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleChangeKey = useCallback((idx: number, value: string) => {
    setKeys((prev) =>
      prev.map((k, i) => (i === idx ? { ...k, key: value, testStatus: 'idle' } : k)),
    )
  }, [])

  const handleChangeLabel = useCallback((idx: number, value: string) => {
    setKeys((prev) => prev.map((k, i) => (i === idx ? { ...k, label: value } : k)))
  }, [])

  const handleToggleDisabled = useCallback((idx: number) => {
    setKeys((prev) =>
      prev.map((k, i) => (i === idx ? { ...k, disabled: !k.disabled } : k)),
    )
  }, [])

  const handleTest = useCallback(async (idx: number) => {
    const target = keys[idx]
    if (!target?.key.trim()) return
    setKeys((prev) =>
      prev.map((k, i) => (i === idx ? { ...k, testStatus: 'testing', testMessage: undefined } : k)),
    )
    try {
      const res = await window.electronAPI?.testApiKey?.(target.key.trim())
      setKeys((prev) =>
        prev.map((k, i) =>
          i === idx
            ? {
                ...k,
                testStatus: res?.ok ? 'ok' : 'error',
                testMessage: res?.ok ? '인증 성공' : (res?.error || '실패'),
              }
            : k,
        ),
      )
    } catch (err) {
      setKeys((prev) =>
        prev.map((k, i) =>
          i === idx
            ? { ...k, testStatus: 'error', testMessage: (err as Error).message }
            : k,
        ),
      )
    }
  }, [keys])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const payload: ApiKeyEntry[] = keys
        .filter((k) => k.key.trim())
        .map((k) => ({
          key: k.key.trim(),
          label: k.label.trim() || '키',
          disabled: k.disabled === true,
        }))
      const res = await window.electronAPI?.saveApiKeys?.(payload)
      if (res?.success) {
        setSuccess(true)
        setTimeout(() => onClose(), 800)
      } else {
        setError(res?.error || '저장에 실패했습니다.')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [keys, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">설정 — Gemini API 키</h3>
        <p className="text-xs text-gray-500 mb-4">
          여러 키를 등록하면 일괄 변환 시 키별 워커 풀로 병렬 호출됩니다. 429(quota 초과) 발생 시
          해당 키는 60초간 cooldown 되고 다른 키로 자동 재시도됩니다.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : (
          <div className="space-y-2">
            {keys.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center border border-dashed rounded">
                등록된 키가 없습니다. 아래 "키 추가" 버튼으로 시작하세요.
              </p>
            )}
            {keys.map((k, idx) => {
              const isEnv = k.source === 'env'
              return (
                <div
                  key={idx}
                  className={`border rounded p-3 ${
                    isEnv ? 'bg-amber-50 border-amber-200' :
                    k.disabled ? 'bg-gray-50 opacity-60' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={k.label}
                      onChange={(e) => handleChangeLabel(idx, e.target.value)}
                      placeholder="별칭"
                      disabled={isEnv}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    {!isEnv && (
                      <>
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={!k.disabled}
                            onChange={() => handleToggleDisabled(idx)}
                          />
                          활성
                        </label>
                        <button
                          onClick={() => handleRemove(idx)}
                          className="text-xs text-red-600 hover:text-red-800 px-2"
                          title="키 삭제"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type={k.isNew ? 'text' : 'password'}
                      value={k.key}
                      onChange={(e) => handleChangeKey(idx, e.target.value)}
                      placeholder={k.isNew ? 'AIza...' : maskKey(k.key)}
                      disabled={isEnv}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={() => handleTest(idx)}
                      disabled={!k.key.trim() || k.testStatus === 'testing'}
                      className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {k.testStatus === 'testing' ? '확인 중...' : '테스트'}
                    </button>
                  </div>
                  {isEnv && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      .env.local 출처 — 별칭/비활성/삭제는 파일에서 직접 편집하세요.
                    </p>
                  )}
                  {k.testStatus === 'ok' && (
                    <p className="text-xs text-green-600 mt-1">✓ {k.testMessage}</p>
                  )}
                  {k.testStatus === 'error' && (
                    <p className="text-xs text-red-600 mt-1">✗ {k.testMessage}</p>
                  )}
                </div>
              )
            })}
            <button
              onClick={handleAdd}
              className="w-full py-2 text-sm text-blue-600 border border-dashed border-blue-300 rounded hover:bg-blue-50"
            >
              + 키 추가
            </button>
          </div>
        )}

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        {success && <p className="text-xs text-green-600 mt-3">저장되었습니다.</p>}

        <div className="flex items-center justify-between gap-3 mt-6">
          <p className="text-xs text-gray-500">
            활성 키: <span className="font-semibold">{activeCount}</span>개
            {activeCount === 0 && <span className="text-red-500 ml-2">— OD 변환 불가</span>}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              닫기
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className={`px-4 py-2 text-sm text-white rounded ${
                saving ? 'bg-gray-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
