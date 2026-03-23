import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useAssetStore } from '@/stores/assetStore'
import type { OdProgress } from '@/types'

const VISION_PROMPT = `이 영역의 콘텐츠를 분석하여 HTML로 구조화해주세요.

## 출력 규칙
- 일반 텍스트 → HTML (<p>, <b>, <i> 등)
- 표 → HTML <table> (셀 병합 colspan/rowspan, 스타일 포함). <thead>/<tbody> 사용 금지, <tr>+<th>/<td> 직접 사용
- 빈칸/답란 (□, 네모 상자) → 빈 괄호 \`( )\` 또는 밑줄 \`____\`로 표현

## ⚠️ 박스/테두리 감지 — 반드시 감지하세요! ⚠️
텍스트 주위에 사각형 테두리(선)가 있는 모든 경우를 감지하여 \`<div style="border: ...">\`로 감싸세요.

**반드시 감지해야 하는 박스 유형:**
- **지문 박스**: 긴 텍스트가 테두리로 둘러싸인 경우
- **보기 박스**: <보기>, ㄱ, ㄴ, ㄷ 등이 테두리 안에 있는 경우
- **인용문 박스**: 인용문이나 참고 자료가 테두리로 구분된 경우
- **정의/공식 박스**: 수학 정의, 공식, 정리가 테두리 안에 있는 경우
- **회색/음영 배경**: 배경색이 있는 영역 → \`background-color\` 추가

**HTML 변환 규칙:**
- 실선 테두리 → \`<div style="border: 1px solid #000; padding: 8px;">\`
- 둥근 테두리 → \`border-radius: 4px\` 추가
- 배경색 → \`background-color: #f0f0f0\` 등 추가
- 중괄호({) 형태의 경계 → 수식 \`\\begin{cases}...\\end{cases}\` 사용

⚠️ 테두리가 보이면 절대 무시하지 마세요! 반드시 \`<div style="border:...">\`로 감싸세요!
- HTML만 반환하고 마크다운 코드블록(\`\`\`)이나 <html>/<body> 태그로 감싸지 마세요

## ⚠️ 수식 처리 — 최우선 규칙! ⚠️
모든 수학 수식은 **반드시** 달러 기호로 감싸서 LaTeX 형식으로 출력하세요.

**필수 규칙:**
- 인라인 수식: \`$수식$\` (예: "함수 $f(x) = x^2$의 값")
- 블록 수식: \`$$수식$$\` (예: $$\\frac{a}{b}$$)
- 수식 내 부등호: < → &lt;, > → &gt; (HTML 엔티티로 변환!)

**변환 예시:**
- 분수 a/b → $\\frac{a}{b}$
- 음수/마이너스:
  - 단순 음수: -1 → $-1$
  - 루트 앞 마이너스: -√5 → $-\\sqrt{5}$
  - 분수 앞 마이너스: -a/b → $-\\frac{a}{b}$
  - ⚠️ 분수 분자가 루트일 때 마이너스: -√5/2 → $-\\frac{\\sqrt{5}}{2}$
- 제곱근 √x → $\\sqrt{x}$
- n제곱근: ∛x → $\\sqrt[3]{x}$, ∜x → $\\sqrt[4]{x}$
- 지수 x² → $x^2$, 아래첨자 x₁ → $x_1$
- 그리스 문자: α→$\\alpha$, β→$\\beta$, π→$\\pi$
- 특수기호: ∞→$\\infty$, ≤→$\\leq$, ≥→$\\geq$, ≠→$\\neq$
- 함수: sin→$\\sin$, cos→$\\cos$, log→$\\log$, lim→$\\lim$
- 적분 ∫ → $\\int$, 시그마 Σ → $\\sum$

⚠️ **위첨자/아래첨자 감지 — 절대 놓치지 마세요!** ⚠️
이미지에서 글자 크기가 작거나 위/아래로 치우친 숫자/문자는 반드시 지수(^) 또는 아래첨자(_)로 변환하세요!
- x2 → $x^2$ (2가 위에 작게 있으면 지수)
- P(x)=4x4 → $P(x)=4x^4$ (4가 위첨자)
- (n-2)2 → $(n-2)^2$ (2가 위첨자)
- a1, a2 → $a_1$, $a_2$ (숫자가 아래에 작게 있으면 아래첨자)

⚠️ 수식이 있으면 반드시 $로 감싸세요! √, ², ₁ 같은 유니코드를 그대로 두지 말고 반드시 LaTeX로 변환하세요!

## ⚠️ 절대 금지 사항 ⚠️
- 이미지에 없는 내용을 **절대 추가하지 마세요** (해설, 풀이, 답 생성 금지)
- 보이는 텍스트만 정확히 변환하세요
- 추론이나 계산을 하지 마세요`

interface Props {
  pageCanvas: HTMLCanvasElement | null
  scale: number
}

interface DragRect {
  startX: number
  startY: number
  endX: number
  endY: number
}

function stripCodeFences(text: string): string {
  let s = text.trim()
  if (s.startsWith('```html')) s = s.slice(7)
  else if (s.startsWith('```')) s = s.slice(3)
  if (s.endsWith('```')) s = s.slice(0, -3)
  s = s.trim()
  // Gemini가 <html><body> 래퍼를 포함하는 경우 벗겨내기
  s = s.replace(/<\/?(!doctype[^>]*|html|head|body)[^>]*>/gi, '')
  return s.trim()
}

export default function AreaCapture({ pageCanvas, scale }: Props) {
  const { captureLoading, setCaptureLoading, setCaptureError, odEnabled, setOdEnabled } = useAppStore()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [dragRect, setDragRect] = useState<DragRect | null>(null)
  const isDraggingRef = useRef(false)
  const [lastCapture, setLastCapture] = useState<{ base64: string; blockId: string; captureBboxNorm?: number[] } | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [odProgress, setOdProgress] = useState<OdProgress | null>(null)

  // OD 진행 상황 수신
  useEffect(() => {
    if (!window.electronAPI?.onOdProgress) return
    const cleanup = window.electronAPI.onOdProgress((progress) => {
      setOdProgress(progress)
      if (progress.step === 'done') {
        // 완료 후 잠시 뒤 초기화
        setTimeout(() => setOdProgress(null), 500)
      }
    })
    return cleanup
  }, [])

  // window-level mouseup으로 페이지 밖 드래그 종료 보장
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        setDragRect(null)
      }
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (captureLoading) return
    if (!overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDragRect({ startX: x, startY: y, endX: x, endY: y })
    isDraggingRef.current = true
  }, [captureLoading])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))

    // 드래그 가이드: 커서 위치에 크로스헤어 표시용
    setMousePos({ x, y })

    if (isDraggingRef.current) {
      setDragRect((prev) => prev ? { ...prev, endX: x, endY: y } : null)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setMousePos(null)
  }, [])

  const performCapture = useCallback(async (captureBase64: string, targetBlockId: string, captureBboxNorm?: number[]) => {
    if (!window.electronAPI) {
      setCaptureError('Electron API를 사용할 수 없습니다.')
      return
    }

    setCaptureLoading(true)
    setCaptureError(null)
    setOdProgress(null)

    let html: string | null = null
    let error: string | null = null

    if (odEnabled && window.electronAPI.analyzeCapture) {
      // OD 모드: Python OD 분석 → 영역별 Gemini Vision + PDF 원본 이미지 추출
      const { pdfPath, currentPage } = useAppStore.getState()
      const result = await window.electronAPI.analyzeCapture(captureBase64, {
        pdfPath: pdfPath || undefined,
        pageNum: pdfPath ? currentPage - 1 : undefined,  // 0-based
        captureBboxNorm: captureBboxNorm,
      })
      html = result.html
      error = result.error
      if (result.regions > 0 && !error) {
        // OD 감지 성공 시 코드 펜스 제거만 수행
        html = html ? stripCodeFences(html) : null
      } else if (html) {
        html = stripCodeFences(html)
      }
    } else {
      // 기존 모드: 직접 Gemini Vision 호출
      const result = await window.electronAPI.geminiVision(captureBase64, VISION_PROMPT)
      html = result.html ? stripCodeFences(result.html) : null
      error = result.error

      // PDF 이미지 추출 — 캡처 영역과 겹치는 이미지만 필터링 + Asset Store 등록
      if (html && window.electronAPI.extractPdfImages && captureBboxNorm) {
        const { pdfPath, currentPage } = useAppStore.getState()
        if (pdfPath) {
          try {
            const imgResult = await window.electronAPI.extractPdfImages(pdfPath, currentPage - 1)
            if (imgResult.images && imgResult.images.length > 0) {
              // 캡처 영역과 겹치는 이미지만 필터 (IoU > 0 = overlap 있음)
              const overlapping = imgResult.images.filter((img) => {
                const [ax1, ay1, ax2, ay2] = captureBboxNorm
                const [bx1, by1, bx2, by2] = img.bbox_norm
                const ox1 = Math.max(ax1, bx1), oy1 = Math.max(ay1, by1)
                const ox2 = Math.min(ax2, bx2), oy2 = Math.min(ay2, by2)
                return ox1 < ox2 && oy1 < oy2 // overlap 존재
              })
              if (overlapping.length > 0) {
                const imgTags = overlapping.map((img) => {
                  const imgAssetId = useAssetStore.getState().registerAsset({
                    type: 'image',
                    base64: img.base64,
                    alt: 'PDF 이미지',
                    sourceBlock: targetBlockId,
                    sourcePage: currentPage,
                  })
                  return `<img data-asset-id="${imgAssetId}" src="data:image/png;base64,${img.base64}" alt="PDF 이미지" style="max-width: 100%;" />`
                }).join('\n')
                html = imgTags + '\n' + html
              }
            }
          } catch {
            // 이미지 추출 실패는 무시
          }
        }
      }
    }

    setCaptureLoading(false)
    setOdProgress(null)

    if (error || !html) {
      setCaptureError(error || '인식 결과가 비어 있습니다. 더 크게 확대해서 다시 캡처해주세요.')
      return
    }
    if (!html) return

    // Asset Store에 캡처 스크린샷 등록
    const { currentPage } = useAppStore.getState()
    useAssetStore.getState().registerAsset({
      type: 'capture',
      base64: captureBase64,
      alt: '캡처 영역',
      sourceBlock: targetBlockId,
      sourcePage: currentPage,
    })

    // HTML 내 data-asset-id가 없는 이미지에 개별 Asset ID 부여
    const currentHtml = html
    html = currentHtml.replace(
      /<img(?![^>]*data-asset-id)\s([^>]*>)/gi,
      (_match, rest: string) => {
        // 이미지 src에서 base64 추출
        const srcMatch = rest.match(/src="data:image\/[^;]+;base64,([^"]+)"/)
        const imgAssetId = useAssetStore.getState().registerAsset({
          type: 'image',
          base64: srcMatch?.[1] || '',
          alt: 'Gemini 생성 이미지',
          sourceBlock: targetBlockId,
          sourcePage: currentPage,
        })
        return `<img data-asset-id="${imgAssetId}" ${rest}`
      },
    )

    // F2 수정: TipTap insertContent로 HTML 구조 보존 (표/서식/수식)
    // RichEditor가 리스닝하는 커스텀 이벤트 발행
    const blockStillExists = useAppStore.getState().blocks.some((b) => b.id === targetBlockId)
    if (!blockStillExists) return

    window.dispatchEvent(new CustomEvent('auza:insertHtml', {
      detail: { blockId: targetBlockId, html },
    }))
  }, [setCaptureLoading, setCaptureError, odEnabled])

  const handleMouseUp = useCallback(async () => {
    if (!isDraggingRef.current || !dragRect || !pageCanvas) {
      setDragRect(null)
      isDraggingRef.current = false
      return
    }

    const x = Math.min(dragRect.startX, dragRect.endX)
    const y = Math.min(dragRect.startY, dragRect.endY)
    const w = Math.abs(dragRect.endX - dragRect.startX)
    const h = Math.abs(dragRect.endY - dragRect.startY)

    setDragRect(null)
    isDraggingRef.current = false

    if (w < 10 || h < 10) return

    const targetBlockId = useAppStore.getState().activeBlockId
    if (!targetBlockId) {
      setCaptureError('먼저 에디터 블록을 선택하거나 추가해주세요.')
      return
    }

    // 캡처 스케일 결정 (PRD §4.3.4)
    // 소스 해상도: 화면 canvas의 DPR 적용된 픽셀 / 화면 표시 크기
    const dpr = pageCanvas.width / pageCanvas.clientWidth
    const srcW = w * dpr
    const srcH = h * dpr

    // 최소 캡처 해상도 보장 — OD ON: 크롭 후에도 품질 유지 위해 2000px, OFF: 800px
    const minLongSide = odEnabled ? 2000 : 800
    const longSide = Math.max(srcW, srcH)
    let captureScale = longSide < minLongSide ? minLongSide / longSide : 1.0

    // 소형 영역은 추가 확대
    const shortSide = Math.min(w, h)
    if (shortSide < 100) captureScale = Math.max(captureScale, 3.0 / (scale * dpr))

    // 최대 크기 제한 (4096px)
    const maxDim = Math.max(srcW * captureScale, srcH * captureScale)
    if (maxDim > 4096) {
      captureScale = 4096 / Math.max(srcW, srcH)
    }

    const finalW = Math.round(srcW * captureScale)
    const finalH = Math.round(srcH * captureScale)

    const captureCanvas = document.createElement('canvas')
    captureCanvas.width = finalW
    captureCanvas.height = finalH
    const ctx = captureCanvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(
      pageCanvas,
      x * dpr, y * dpr, w * dpr, h * dpr,
      0, 0, finalW, finalH,
    )

    const dataUrl = captureCanvas.toDataURL('image/png')
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')

    // 캡처 영역의 페이지 내 정규화 좌표 (0.0~1.0) — PDF 이미지 매칭용
    const canvasW = pageCanvas.clientWidth
    const canvasH = pageCanvas.clientHeight
    const captureBboxNorm = [
      x / canvasW,
      y / canvasH,
      (x + w) / canvasW,
      (y + h) / canvasH,
    ]

    setLastCapture({ base64, blockId: targetBlockId, captureBboxNorm })

    await performCapture(base64, targetBlockId, captureBboxNorm)
  }, [dragRect, pageCanvas, scale, setCaptureError, performCapture])

  // 재시도 핸들러
  const handleRetry = useCallback(async () => {
    if (!lastCapture) return
    const { base64, blockId, captureBboxNorm } = lastCapture
    await performCapture(base64, blockId, captureBboxNorm)
  }, [lastCapture, performCapture])

  // 재시도 버튼을 PdfViewer의 에러 배너에서 사용할 수 있도록 window에 등록
  useEffect(() => {
    (window as unknown as { __auzaRetryCapture?: () => void }).__auzaRetryCapture = lastCapture ? handleRetry : undefined
    return () => {
      delete (window as unknown as { __auzaRetryCapture?: () => void }).__auzaRetryCapture
    }
  }, [lastCapture, handleRetry])

  // 드래그 선택 영역
  const selectionStyle = dragRect
    ? {
        left: Math.min(dragRect.startX, dragRect.endX),
        top: Math.min(dragRect.startY, dragRect.endY),
        width: Math.abs(dragRect.endX - dragRect.startX),
        height: Math.abs(dragRect.endY - dragRect.startY),
      }
    : null

  // 선택 영역 크기 텍스트
  const selectionSize = selectionStyle
    ? `${Math.round(selectionStyle.width)} x ${Math.round(selectionStyle.height)}`
    : null

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* F4: 드래그 전 크로스헤어 가이드라인 */}
      {!isDraggingRef.current && mousePos && !captureLoading && (
        <>
          <div
            className="absolute pointer-events-none bg-orange-400/40"
            style={{ left: mousePos.x, top: 0, width: 1, height: '100%' }}
          />
          <div
            className="absolute pointer-events-none bg-orange-400/40"
            style={{ left: 0, top: mousePos.y, width: '100%', height: 1 }}
          />
        </>
      )}

      {/* F4: 드래그 중 선택 영역 가이드 박스 */}
      {selectionStyle && (
        <>
          {/* 선택 영역 외부 어둡게 (4면 마스크) */}
          <div className="absolute inset-0 pointer-events-none">
            {/* 상단 */}
            <div
              className="absolute bg-black/20"
              style={{ left: 0, top: 0, width: '100%', height: selectionStyle.top }}
            />
            {/* 하단 */}
            <div
              className="absolute bg-black/20"
              style={{ left: 0, top: selectionStyle.top + selectionStyle.height, width: '100%', bottom: 0 }}
            />
            {/* 좌측 */}
            <div
              className="absolute bg-black/20"
              style={{ left: 0, top: selectionStyle.top, width: selectionStyle.left, height: selectionStyle.height }}
            />
            {/* 우측 */}
            <div
              className="absolute bg-black/20"
              style={{ left: selectionStyle.left + selectionStyle.width, top: selectionStyle.top, right: 0, height: selectionStyle.height }}
            />
          </div>

          {/* 선택 영역 테두리 (점선) */}
          <div
            className="absolute pointer-events-none"
            style={{
              ...selectionStyle,
              border: '2px dashed #f97316',
              boxShadow: '0 0 0 1px rgba(249, 115, 22, 0.3)',
            }}
          />

          {/* 모서리 핸들 */}
          {[
            { left: selectionStyle.left - 3, top: selectionStyle.top - 3 },
            { left: selectionStyle.left + selectionStyle.width - 3, top: selectionStyle.top - 3 },
            { left: selectionStyle.left - 3, top: selectionStyle.top + selectionStyle.height - 3 },
            { left: selectionStyle.left + selectionStyle.width - 3, top: selectionStyle.top + selectionStyle.height - 3 },
          ].map((pos, i) => (
            <div
              key={i}
              className="absolute w-[6px] h-[6px] bg-orange-500 rounded-sm pointer-events-none"
              style={pos}
            />
          ))}

          {/* 크기 표시 라벨 */}
          {selectionSize && selectionStyle.width > 40 && selectionStyle.height > 20 && (
            <div
              className="absolute pointer-events-none text-[10px] text-white bg-orange-500/80 px-1.5 py-0.5 rounded"
              style={{
                left: selectionStyle.left + selectionStyle.width / 2,
                top: selectionStyle.top + selectionStyle.height + 4,
                transform: 'translateX(-50%)',
              }}
            >
              {selectionSize}
            </div>
          )}
        </>
      )}

      {/* 캡처 모드 안내 배지 */}
      {!isDraggingRef.current && !captureLoading && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-orange-500/90 text-white text-xs px-3 py-1 rounded-full shadow">
            드래그하여 캡처 영역을 선택하세요
          </div>
        </div>
      )}

      {/* OD 토글 버튼 — 오버레이 위에 별도 배치하여 클릭 가능 */}
      {!isDraggingRef.current && !captureLoading && (
        <div
          className="absolute top-2 right-2 z-50"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <button
            className={`text-xs px-2.5 py-1 rounded-full shadow transition-colors cursor-pointer ${
              odEnabled
                ? 'bg-blue-500 text-white'
                : 'bg-white/90 text-gray-600 hover:bg-gray-100'
            }`}
            onClick={() => setOdEnabled(!odEnabled)}
            title={odEnabled ? 'OD 레이아웃 분석 ON' : 'OD 레이아웃 분석 OFF'}
          >
            {odEnabled ? 'OD ON' : 'OD OFF'}
          </button>
        </div>
      )}

      {captureLoading && (
        <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-auto cursor-wait">
          <div className="bg-white rounded-lg px-4 py-3 shadow text-sm text-orange-700 flex flex-col items-center gap-1.5 min-w-[200px]">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
              </svg>
              {odEnabled && odProgress
                ? odProgress.detail
                : odEnabled ? 'OD 레이아웃 분석 중...' : 'Gemini Vision 인식 중...'}
            </div>
            {odEnabled && odProgress && odProgress.total > 0 && (
              <div className="w-full flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((odProgress.current / odProgress.total) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {odProgress.current}/{odProgress.total}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
