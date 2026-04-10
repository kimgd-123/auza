import { useState } from 'react'
import { BUILT_IN_PRESETS } from '@/lib/presets'
import type { Preset } from '@/types/generation'

interface Props {
  onSelect: (preset: Preset) => void
  disabled?: boolean
}

export default function PresetSelector({ onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
        title="자료 생성 프리셋"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        생성
      </button>

      {open && (
        <>
          {/* 배경 클릭으로 닫기 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute bottom-full left-0 mb-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
            <div className="px-3 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              자료 생성 프리셋
            </div>
            {BUILT_IN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  onSelect(preset)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{preset.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">{preset.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{preset.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
