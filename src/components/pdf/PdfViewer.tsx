import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useAppStore } from '@/stores/appStore'
import AreaCapture from './AreaCapture'

// pdf.js worker — node_modules에서 직접 import (개발/패키징 모두 호환)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

export default function PdfViewer() {
  const { pdfPath, currentPage, totalPages, setCurrentPage, setTotalPages, captureLoading, captureError, setCaptureError } = useAppStore()
  const [scale, setScale] = useState(1.0)
  const [tool, setTool] = useState<'select' | 'capture'>('select')
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pageInputValue, setPageInputValue] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const pageWrapperRef = useRef<HTMLDivElement>(null)
  const [pageCanvas, setPageCanvas] = useState<HTMLCanvasElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(0)

  // react-pdf file prop 메모이제이션 (ArrayBuffer detach 방지)
  const pdfFile = useMemo(() => {
    if (!pdfData) return null
    return { data: pdfData.slice() }
  }, [pdfData])

  // 컨테이너 너비 측정 (반응형 PDF 렌더링)
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // PDF 파일을 IPC로 읽기
  useEffect(() => {
    if (!pdfPath) {
      setPdfData(null)
      return
    }
    setLoadError(null)

    const loadPdf = async () => {
      if (!window.electronAPI) {
        setLoadError('Electron API를 사용할 수 없습니다')
        return
      }
      const result = await window.electronAPI.readPdf(pdfPath)
      if (result.error || !result.data) {
        setLoadError(result.error || 'PDF를 읽을 수 없습니다')
        return
      }
      // base64 → Uint8Array
      const binary = atob(result.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      setPdfData(bytes)
    }

    loadPdf()
  }, [pdfPath])

  const handleOpenPdf = async () => {
    if (!window.electronAPI) return
    const filePath = await window.electronAPI.openFile({
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })
    if (filePath) {
      useAppStore.getState().setPdfPath(filePath)
    }
  }

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setTotalPages(numPages)
    setCurrentPage(1)
  }, [setTotalPages, setCurrentPage])

  const onPageRenderSuccess = useCallback(() => {
    // Page 렌더링 완료 후 canvas 참조 획득
    if (pageWrapperRef.current) {
      const canvas = pageWrapperRef.current.querySelector('canvas')
      setPageCanvas(canvas)
    }
  }, [])

  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(pageInputValue, 10)
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page)
      }
      setPageInputValue('')
    }
  }

  if (!pdfPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-4">
        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">PDF 파일을 불러와주세요</p>
        <button
          onClick={handleOpenPdf}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors"
        >
          PDF 열기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 상단 도구바 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 text-sm flex-shrink-0">
        <button
          onClick={() => setTool('select')}
          className={`px-2 py-1 rounded text-xs font-medium ${
            tool === 'select' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          선택
        </button>
        <button
          onClick={() => setTool('capture')}
          className={`px-2 py-1 rounded text-xs font-medium ${
            tool === 'capture' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          캡처
        </button>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        <button
          onClick={() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(1)))}
          className="px-1.5 py-0.5 hover:bg-gray-200 rounded text-xs"
          title="축소"
        >
          -
        </button>
        <span className="text-xs text-gray-500 w-10 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale((s) => Math.min(3.0, +(s + 0.1).toFixed(1)))}
          className="px-1.5 py-0.5 hover:bg-gray-200 rounded text-xs"
          title="확대"
        >
          +
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="px-2 py-0.5 hover:bg-gray-200 rounded disabled:opacity-30 text-xs"
        >
          &lt;
        </button>
        <input
          type="text"
          value={pageInputValue}
          onChange={(e) => setPageInputValue(e.target.value)}
          onKeyDown={handlePageInput}
          placeholder={`${currentPage}`}
          className="w-8 text-center text-xs border border-gray-300 rounded px-1 py-0.5 outline-none focus:border-blue-400"
        />
        <span className="text-xs text-gray-400">/ {totalPages}</span>
        <button
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="px-2 py-0.5 hover:bg-gray-200 rounded disabled:opacity-30 text-xs"
        >
          &gt;
        </button>
      </div>

      {/* 캡처 상태 */}
      {captureLoading && (
        <div className="px-3 py-1.5 bg-orange-50 border-b border-orange-200 text-xs text-orange-700 flex items-center gap-2 flex-shrink-0">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" /></svg>
          Gemini Vision 인식 중...
        </div>
      )}
      {captureError && (
        <div className="px-3 py-1.5 bg-red-50 border-b border-red-200 text-xs text-red-600 flex items-center justify-between flex-shrink-0">
          <span>{captureError}</span>
          <div className="flex items-center gap-2 ml-2">
            {(window as unknown as { __auzaRetryCapture?: () => void }).__auzaRetryCapture && (
              <button
                onClick={() => (window as unknown as { __auzaRetryCapture?: () => void }).__auzaRetryCapture?.()}
                className="text-orange-600 hover:text-orange-800 font-medium"
              >
                재시도
              </button>
            )}
            <button onClick={() => setCaptureError(null)} className="text-red-400 hover:text-red-600">x</button>
          </div>
        </div>
      )}

      {/* PDF 렌더링 */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-auto flex justify-center bg-gray-100 p-4 ${
          tool === 'capture' ? 'cursor-crosshair' : ''
        }`}
      >
        {loadError ? (
          <div className="flex items-center justify-center h-full text-red-400 text-sm">
            {loadError}
          </div>
        ) : !pdfFile ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            PDF 로딩 중...
          </div>
        ) : (
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center text-gray-400 text-sm py-20">
                PDF 렌더링 중...
              </div>
            }
            error={
              <div className="flex items-center justify-center text-red-400 text-sm py-20">
                PDF를 렌더링할 수 없습니다
              </div>
            }
          >
            <div ref={pageWrapperRef} className="relative inline-block">
              <Page
                pageNumber={currentPage}
                scale={scale}
                width={containerWidth > 0 ? Math.min(containerWidth - 32, 2000) : undefined}
                renderTextLayer={tool === 'select'}
                renderAnnotationLayer={false}
                onRenderSuccess={onPageRenderSuccess}
              />
              {tool === 'capture' && pageCanvas && (
                <AreaCapture pageCanvas={pageCanvas} scale={scale} pdfData={pdfData} />
              )}
            </div>
          </Document>
        )}
      </div>
    </div>
  )
}
