import { useAppStore } from '@/stores/appStore'

export default function StatusBar() {
  const { blocks, hwpConnected, hwpExporting, hwpExportError, setHwpExportError, currentPage, totalPages } = useAppStore()

  return (
    <div className="flex items-center h-7 px-4 bg-gray-100 border-t border-gray-200 text-xs text-gray-500 gap-4 flex-shrink-0">
      <span>
        HWP: {hwpConnected ? (
          <span className="text-green-600 font-medium">연결됨</span>
        ) : (
          <span className="text-gray-400">미연결</span>
        )}
      </span>
      <span className="border-l border-gray-300 pl-4">
        블록: {blocks.length}개
      </span>
      {totalPages > 0 && (
        <span className="border-l border-gray-300 pl-4">
          PDF: {currentPage} / {totalPages}
        </span>
      )}
      {hwpExporting && (
        <span className="border-l border-gray-300 pl-4 text-orange-600">
          HWP 작성 중...
        </span>
      )}
      {hwpExportError && (
        <span className="border-l border-gray-300 pl-4 text-red-500 flex items-center gap-1">
          {hwpExportError}
          <button onClick={() => setHwpExportError(null)} className="text-red-400 hover:text-red-600 ml-1">x</button>
        </span>
      )}
      <div className="flex-1" />
      <span>AUZA v1.0</span>
    </div>
  )
}
