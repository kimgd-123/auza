import { useCallback, useEffect, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsDialog({ open, onClose }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSuccess(false)
    window.electronAPI?.getApiKey?.().then((res) => {
      setApiKey(res.key || '')
    })
  }, [open])

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('API 키를 입력해주세요.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await window.electronAPI?.saveApiKey?.(apiKey.trim())
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
  }, [apiKey, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">설정</h3>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Gemini API 키
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="AIza..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          Google AI Studio에서 발급받은 API 키를 입력하세요.
        </p>

        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}
        {success && (
          <p className="text-xs text-green-600 mt-2">저장되었습니다.</p>
        )}

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            닫기
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 text-sm text-white rounded ${
              saving ? 'bg-gray-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
