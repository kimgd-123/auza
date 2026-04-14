import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OdDetection, OdRegionType } from '@/types'

// 영역 유형별 색상
const REGION_COLORS: Record<OdRegionType, { border: string; bg: string; label: string }> = {
  text:    { border: '#3B82F6', bg: 'rgba(59,130,246,0.15)',  label: 'bg-blue-500' },
  table:   { border: '#10B981', bg: 'rgba(16,185,129,0.15)',  label: 'bg-green-500' },
  figure:  { border: '#8B5CF6', bg: 'rgba(139,92,246,0.15)',  label: 'bg-purple-500' },
  formula:    { border: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  label: 'bg-amber-500' },
  boxed_text: { border: '#06B6D4', bg: 'rgba(6,182,212,0.15)',  label: 'bg-cyan-500' },
  abandon:    { border: '#EF4444', bg: 'rgba(239,68,68,0.10)',   label: 'bg-red-500' },
}

const REGION_TYPES: OdRegionType[] = ['text', 'table', 'figure', 'formula', 'boxed_text', 'abandon']

interface Props {
  detections: OdDetection[]
  captureBase64: string
  captureImageSize: { w: number; h: number }
  onConfirm: (editedDetections: OdDetection[]) => void
  onCancel: () => void
  /** embedded 모드: backdrop/하단 버튼 없이 콘텐츠만 렌더 (BatchReviewModal 내장용) */
  embedded?: boolean
  /** 부모가 현재 편집 상태를 읽을 수 있도록 콜백 (embedded 모드용) */
  onDetsChange?: (dets: OdDetection[]) => void
}

type DragMode = 'move' | 'resize-nw' | 'resize-n' | 'resize-ne' | 'resize-e' | 'resize-se' | 'resize-s' | 'resize-sw' | 'resize-w' | null

export default function OdReviewOverlay({
  detections: initialDetections,
  captureBase64,
  captureImageSize,
  onConfirm,
  onCancel,
  embedded = false,
  onDetsChange,
}: Props) {
  const [dets, setDets] = useState<OdDetection[]>(() =>
    initialDetections.map(d => ({ ...d }))
  )

  // embedded 모드: 편집 상태를 부모에 실시간 전달
  useEffect(() => {
    if (onDetsChange) onDetsChange(dets)
  }, [dets, onDetsChange])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawRect, setDrawRect] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null)
  const [newRegionType, setNewRegionType] = useState<OdRegionType>('text')
  const [clipboard, setClipboard] = useState<OdDetection | null>(null)
  const dragStartRef = useRef<{ mx: number; my: number; origBox: [number, number, number, number] } | null>(null)
  const drawStartRef = useRef<{ mx: number; my: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 오버레이 표시 크기 — 캡처 이미지 비율 유지, 최대 폭/높이 제한
  const maxW = 700
  const maxH = Math.min(window.innerHeight * 0.65, 600)
  const scaleW = maxW / captureImageSize.w
  const scaleH = maxH / captureImageSize.h
  const scale = Math.min(scaleW, scaleH, 1)
  const displayW = Math.round(captureImageSize.w * scale)
  const displayH = Math.round(captureImageSize.h * scale)

  // 픽셀 좌표 ↔ 표시 좌표 변환
  const toDisplay = useCallback((px: number) => px * scale, [scale])
  const toImage = useCallback((dp: number) => dp / scale, [scale])

  const selectedDet = useMemo(() => dets.find(d => d.id === selectedId), [dets, selectedId])

  // 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key === 'Enter' && !e.shiftKey) { onConfirm(dets); return }
      if (e.key === 'Delete' && selectedId) {
        setDets(prev => prev.filter(d => d.id !== selectedId))
        setSelectedId(null)
      }
      // Ctrl+C: 선택 영역 복사
      if (e.ctrlKey && e.key === 'c' && selectedDet) {
        e.preventDefault()
        setClipboard({ ...selectedDet })
      }
      // Ctrl+V: 붙여넣기 (20px 오프셋)
      if (e.ctrlKey && e.key === 'v' && clipboard) {
        e.preventDefault()
        const offset = 20
        const imgW = captureImageSize.w
        const imgH = captureImageSize.h
        const [cx1, cy1, cx2, cy2] = clipboard.box_px
        const bw = cx2 - cx1, bh = cy2 - cy1
        const nx1 = Math.min(imgW - bw, cx1 + offset)
        const ny1 = Math.min(imgH - bh, cy1 + offset)
        const newDet: OdDetection = {
          ...clipboard,
          id: `paste_${Date.now()}`,
          box_px: [Math.round(nx1), Math.round(ny1), Math.round(nx1 + bw), Math.round(ny1 + bh)],
        }
        setDets(prev => [...prev, newDet])
        setSelectedId(newDet.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, selectedDet, dets, clipboard, captureImageSize, onCancel, onConfirm])

  // 마우스 이벤트 — 이동/리사이즈
  const handleMouseDown = useCallback((e: React.MouseEvent, detId: string, mode: DragMode) => {
    e.stopPropagation()
    e.preventDefault()
    const det = dets.find(d => d.id === detId)
    if (!det) return
    setSelectedId(detId)
    setDragMode(mode)
    dragStartRef.current = { mx: e.clientX, my: e.clientY, origBox: [...det.box_px] }
  }, [dets])

  // 컨테이너 좌표로 clamp
  const clampToContainer = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: Math.max(0, Math.min(displayW, clientX - rect.left)),
      y: Math.max(0, Math.min(displayH, clientY - rect.top)),
    }
  }, [displayW, displayH])

  // 마우스 이벤트 — 새 영역 그리기
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) {
      setSelectedId(null)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const pos = clampToContainer(e.clientX, e.clientY)
    drawStartRef.current = { mx: pos.x, my: pos.y }
    setDrawRect({ sx: pos.x, sy: pos.y, ex: pos.x, ey: pos.y })
  }, [isDrawing, clampToContainer])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 드래그 중 프리뷰 업데이트
      if (isDrawing && drawStartRef.current) {
        const pos = clampToContainer(e.clientX, e.clientY)
        setDrawRect({
          sx: drawStartRef.current.mx,
          sy: drawStartRef.current.my,
          ex: pos.x,
          ey: pos.y,
        })
        return
      }

      if (dragMode && dragStartRef.current && selectedId) {
        const dx = e.clientX - dragStartRef.current.mx
        const dy = e.clientY - dragStartRef.current.my
        const orig = dragStartRef.current.origBox
        const imgW = captureImageSize.w
        const imgH = captureImageSize.h

        setDets(prev => prev.map(d => {
          if (d.id !== selectedId) return d
          let [x1, y1, x2, y2] = orig

          if (dragMode === 'move') {
            const w = x2 - x1, h = y2 - y1
            x1 = Math.max(0, Math.min(imgW - w, x1 + toImage(dx)))
            y1 = Math.max(0, Math.min(imgH - h, y1 + toImage(dy)))
            x2 = x1 + w; y2 = y1 + h
          } else if (dragMode === 'resize-nw') {
            x1 = Math.max(0, Math.min(x2 - 10, x1 + toImage(dx)))
            y1 = Math.max(0, Math.min(y2 - 10, y1 + toImage(dy)))
          } else if (dragMode === 'resize-ne') {
            x2 = Math.max(x1 + 10, Math.min(imgW, x2 + toImage(dx)))
            y1 = Math.max(0, Math.min(y2 - 10, y1 + toImage(dy)))
          } else if (dragMode === 'resize-sw') {
            x1 = Math.max(0, Math.min(x2 - 10, x1 + toImage(dx)))
            y2 = Math.max(y1 + 10, Math.min(imgH, y2 + toImage(dy)))
          } else if (dragMode === 'resize-se') {
            x2 = Math.max(x1 + 10, Math.min(imgW, x2 + toImage(dx)))
            y2 = Math.max(y1 + 10, Math.min(imgH, y2 + toImage(dy)))
          } else if (dragMode === 'resize-n') {
            y1 = Math.max(0, Math.min(y2 - 10, y1 + toImage(dy)))
          } else if (dragMode === 'resize-s') {
            y2 = Math.max(y1 + 10, Math.min(imgH, y2 + toImage(dy)))
          } else if (dragMode === 'resize-e') {
            x2 = Math.max(x1 + 10, Math.min(imgW, x2 + toImage(dx)))
          } else if (dragMode === 'resize-w') {
            x1 = Math.max(0, Math.min(x2 - 10, x1 + toImage(dx)))
          }

          return { ...d, box_px: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)] as [number, number, number, number] }
        }))
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      // 새 영역 그리기 완료
      if (isDrawing && drawStartRef.current && containerRef.current) {
        const pos = clampToContainer(e.clientX, e.clientY)
        const sx = drawStartRef.current.mx
        const sy = drawStartRef.current.my

        const imgW = captureImageSize.w
        const imgH = captureImageSize.h
        const x1 = Math.max(0, Math.min(imgW, toImage(Math.min(sx, pos.x))))
        const y1 = Math.max(0, Math.min(imgH, toImage(Math.min(sy, pos.y))))
        const x2 = Math.max(0, Math.min(imgW, toImage(Math.max(sx, pos.x))))
        const y2 = Math.max(0, Math.min(imgH, toImage(Math.max(sy, pos.y))))

        if (x2 - x1 > 10 && y2 - y1 > 10) {
          const newDet: OdDetection = {
            id: `manual_${Date.now()}`,
            label: 'manual',
            region: newRegionType,
            score: 1.0,
            box_px: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
          }
          setDets(prev => [...prev, newDet])
          setSelectedId(newDet.id)
        }
        drawStartRef.current = null
        setDrawRect(null)
        setIsDrawing(false)
        return
      }

      setDragMode(null)
      dragStartRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragMode, selectedId, isDrawing, captureImageSize, toImage, newRegionType, clampToContainer, displayW, displayH])

  // 유형 변경
  const handleTypeChange = useCallback((type: OdRegionType) => {
    if (!selectedId) return
    setDets(prev => prev.map(d => d.id === selectedId ? { ...d, region: type } : d))
  }, [selectedId])

  // 선택 영역 삭제
  const handleDelete = useCallback(() => {
    if (!selectedId) return
    setDets(prev => prev.filter(d => d.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  // 리사이즈 핸들 렌더링 — 8방향 (코너 4 + 엣지 4)
  const renderHandles = (detId: string) => {
    const handleSize = 8
    const edgeW = 16 // 엣지 핸들 폭
    const positions: { mode: DragMode; style: React.CSSProperties }[] = [
      // 코너 4개
      { mode: 'resize-nw', style: { top: -handleSize/2, left: -handleSize/2, width: handleSize, height: handleSize, cursor: 'nw-resize' } },
      { mode: 'resize-ne', style: { top: -handleSize/2, right: -handleSize/2, width: handleSize, height: handleSize, cursor: 'ne-resize' } },
      { mode: 'resize-sw', style: { bottom: -handleSize/2, left: -handleSize/2, width: handleSize, height: handleSize, cursor: 'sw-resize' } },
      { mode: 'resize-se', style: { bottom: -handleSize/2, right: -handleSize/2, width: handleSize, height: handleSize, cursor: 'se-resize' } },
      // 엣지 4개
      { mode: 'resize-n', style: { top: -handleSize/2, left: '50%', marginLeft: -edgeW/2, width: edgeW, height: handleSize, cursor: 'n-resize' } },
      { mode: 'resize-s', style: { bottom: -handleSize/2, left: '50%', marginLeft: -edgeW/2, width: edgeW, height: handleSize, cursor: 's-resize' } },
      { mode: 'resize-e', style: { right: -handleSize/2, top: '50%', marginTop: -edgeW/2, width: handleSize, height: edgeW, cursor: 'e-resize' } },
      { mode: 'resize-w', style: { left: -handleSize/2, top: '50%', marginTop: -edgeW/2, width: handleSize, height: edgeW, cursor: 'w-resize' } },
    ]
    return positions.map((p) => (
      <div
        key={p.mode}
        className="absolute bg-white border-2 border-gray-700 z-20"
        style={{ ...p.style }}
        onMouseDown={(e) => handleMouseDown(e, detId, p.mode)}
      />
    ))
  }

  // 드래그 중 프리뷰 사각형
  const drawPreviewStyle = drawRect ? {
    left: Math.min(drawRect.sx, drawRect.ex),
    top: Math.min(drawRect.sy, drawRect.ey),
    width: Math.abs(drawRect.ex - drawRect.sx),
    height: Math.abs(drawRect.ey - drawRect.sy),
  } : null

  // embedded 모드: 헤더+이미지+편집 UI만 렌더 (backdrop/하단 버튼 없음)
  const content = (
    <div className={embedded ? 'flex flex-col' : 'bg-white rounded-lg shadow-xl flex flex-col'} style={embedded ? {} : { maxWidth: maxW + 40, maxHeight: '90vh' }}>
      {/* 헤더 */}
      <div className="px-4 py-2 border-b flex items-center justify-between bg-gray-50 rounded-t-lg flex-shrink-0">
        <span className="text-sm font-medium text-gray-700">
          OD 검출 결과 확인 — {dets.length}개 영역
        </span>
          <div className="flex items-center gap-2 text-xs">
            {selectedDet && (
              <>
                <select
                  className="border rounded px-1 py-0.5 text-xs"
                  value={selectedDet.region}
                  onChange={(e) => handleTypeChange(e.target.value as OdRegionType)}
                >
                  {REGION_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button onClick={handleDelete} className="text-red-600 hover:text-red-800 font-medium">
                  삭제
                </button>
                <span className="text-gray-300">|</span>
              </>
            )}
            <button
              onClick={() => { setIsDrawing(!isDrawing); setDrawRect(null) }}
              className={`px-2 py-0.5 rounded ${isDrawing ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              {isDrawing ? '그리기 중...' : '+ 영역 추가'}
            </button>
            {isDrawing && (
              <select
                className="border rounded px-1 py-0.5 text-xs"
                value={newRegionType}
                onChange={(e) => setNewRegionType(e.target.value as OdRegionType)}
              >
                {REGION_TYPES.filter(t => t !== 'abandon').map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 캡처 이미지 + 바운딩 박스 */}
        <div className="overflow-auto p-4 flex-1 min-h-0">
          <div
            ref={containerRef}
            className="relative select-none overflow-hidden"
            style={{ width: displayW, height: displayH, cursor: isDrawing ? 'crosshair' : 'default' }}
            onMouseDown={handleContainerMouseDown}
          >
            <img
              src={`data:image/png;base64,${captureBase64}`}
              alt="캡처 영역"
              className="absolute inset-0 w-full h-full pointer-events-none"
              draggable={false}
            />

            {dets.map((det) => {
              const [x1, y1, x2, y2] = det.box_px
              const color = REGION_COLORS[det.region] || REGION_COLORS.text
              const isSelected = det.id === selectedId
              return (
                <div
                  key={det.id}
                  className="absolute"
                  style={{
                    left: toDisplay(x1),
                    top: toDisplay(y1),
                    width: toDisplay(x2 - x1),
                    height: toDisplay(y2 - y1),
                    border: `${isSelected ? 3 : 2}px ${det.region === 'abandon' ? 'dashed' : 'solid'} ${color.border}`,
                    backgroundColor: color.bg,
                    cursor: isDrawing ? 'crosshair' : 'move',
                    zIndex: isSelected ? 15 : 10,
                  }}
                  onMouseDown={(e) => {
                    if (isDrawing) return
                    handleMouseDown(e, det.id, 'move')
                  }}
                >
                  {/* 라벨 배지 */}
                  <span
                    className={`absolute -top-5 left-0 text-[10px] text-white px-1 rounded ${color.label}`}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {det.region} {(det.score * 100).toFixed(0)}%
                  </span>
                  {/* 리사이즈 핸들 */}
                  {isSelected && !isDrawing && renderHandles(det.id)}
                </div>
              )
            })}

            {/* 드래그 중 프리뷰 */}
            {drawPreviewStyle && (
              <div
                className="absolute pointer-events-none z-30"
                style={{
                  ...drawPreviewStyle,
                  border: '2px dashed #3B82F6',
                  backgroundColor: 'rgba(59,130,246,0.1)',
                }}
              />
            )}
          </div>
        </div>

        {/* 하단 버튼 — embedded 모드에서는 숨김 (부모가 처리) */}
        {!embedded && (
          <div className="px-4 py-2 border-t flex items-center justify-between bg-gray-50 rounded-b-lg flex-shrink-0">
            <div className="text-xs text-gray-500">
              Delete: 삭제 | Ctrl+C/V: 복사/붙여넣기 | Enter: 변환 실행 | Esc: 취소
            </div>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-3 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                취소
              </button>
              <button
                onClick={() => onConfirm(dets)}
                className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                변환 실행 ({dets.filter(d => d.region !== 'abandon').length}개)
              </button>
            </div>
          </div>
        )}
      </div>
  )

  if (embedded) return content

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </div>
  )
}
