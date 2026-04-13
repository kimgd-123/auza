/**
 * OD 재편집 모달
 *
 * 블록에 저장된 OD 결과를 다시 열어 bounding box를 수정하고 AI 재변환을 실행합니다.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useAssetStore } from '@/stores/assetStore'
import OdReviewOverlay from '@/components/pdf/OdReviewOverlay'
import type { OdDetection, OdProgress } from '@/types'

function stripCodeFences(text: string): string {
  let s = text.trim()
  if (s.startsWith('```html')) s = s.slice(7)
  else if (s.startsWith('```')) s = s.slice(3)
  if (s.endsWith('```')) s = s.slice(0, -3)
  s = s.trim()
  s = s.replace(/<\/?(!doctype[^>]*|html|head|body)[^>]*>/gi, '')
  return s.trim()
}

export default function OdReReviewModal() {
  const reReviewBlockId = useAppStore((s) => s.reReviewBlockId)
  const savedOdData = useAppStore((s) => reReviewBlockId ? s.savedOdData[reReviewBlockId] : undefined)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [odProgress, setOdProgress] = useState<OdProgress | null>(null)

  // OD 진행 상황 수신
  useEffect(() => {
    if (!converting || !window.electronAPI?.onOdProgress) return
    const cleanup = window.electronAPI.onOdProgress((progress) => {
      setOdProgress(progress)
      if (progress.step === 'done') {
        setTimeout(() => setOdProgress(null), 500)
      }
    })
    return cleanup
  }, [converting])

  const handleConfirm = useCallback(async (editedDetections: OdDetection[]) => {
    if (!reReviewBlockId || !savedOdData) return

    setConverting(true)
    setError(null)
    setOdProgress(null)

    try {
      const result = await window.electronAPI.convertRegions({
        imageBase64: savedOdData.imageBase64,
        detections: editedDetections,
        pdfPath: savedOdData.pdfPath || undefined,
        pageNum: savedOdData.pageNum,
        captureBboxNorm: savedOdData.captureBboxNorm,
      })

      if (!result.html) {
        setError(result.error || '인식 결과가 비어 있습니다.')
        setConverting(false)
        return
      }
      // 부분 성공: html이 있으면 삽입 진행, error는 비차단 경고
      if (result.error) {
        console.warn('[OdReReviewModal] 부분 실패 경고:', result.error)
      }

      let html = stripCodeFences(result.html)

      // Asset Store에 캡처 스크린샷 등록
      const { currentPage } = useAppStore.getState()
      useAssetStore.getState().registerAsset({
        type: 'capture',
        base64: savedOdData.imageBase64,
        alt: '캡처 영역',
        sourceBlock: reReviewBlockId,
        sourcePage: currentPage,
      })

      // HTML 내 data-asset-id가 없는 이미지에 Asset ID 부여
      html = html.replace(
        /<img(?![^>]*data-asset-id)\s([^>]*>)/gi,
        (_match, rest: string) => {
          const srcMatch = rest.match(/src="data:image\/[^;]+;base64,([^"]+)"/)
          const imgAssetId = useAssetStore.getState().registerAsset({
            type: 'image',
            base64: srcMatch?.[1] || '',
            alt: 'OD 생성 이미지',
            sourceBlock: reReviewBlockId,
            sourcePage: currentPage,
          })
          return `<img data-asset-id="${imgAssetId}" ${rest}`
        },
      )

      // OD 데이터 갱신 (최신 detections 저장)
      useAppStore.getState().saveOdData(reReviewBlockId, {
        ...savedOdData,
        detections: editedDetections,
      })

      // 블록에 HTML 삽입
      const blockStillExists = useAppStore.getState().blocks.some((b) => b.id === reReviewBlockId)
      if (!blockStillExists) {
        useAppStore.getState().setReReviewBlockId(null)
        setConverting(false)
        return
      }

      const { collapsedBlockIds, toggleBlockCollapse } = useAppStore.getState()
      if (collapsedBlockIds.has(reReviewBlockId)) {
        toggleBlockCollapse(reReviewBlockId)
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('auza:insertHtml', {
            detail: { blockId: reReviewBlockId, html },
          }))
        }, 100)
      } else {
        window.dispatchEvent(new CustomEvent('auza:insertHtml', {
          detail: { blockId: reReviewBlockId, html },
        }))
      }

      // 모달 닫기
      useAppStore.getState().setReReviewBlockId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '변환 중 오류가 발생했습니다.')
    } finally {
      setConverting(false)
      setOdProgress(null)
    }
  }, [reReviewBlockId, savedOdData])

  const handleCancel = useCallback(() => {
    setError(null)
    useAppStore.getState().setReReviewBlockId(null)
  }, [])

  if (!reReviewBlockId || !savedOdData) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      {converting ? (
        <div className="bg-white rounded-lg shadow-xl p-8 flex flex-col items-center gap-4 min-w-[320px]">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600">
            {odProgress ? odProgress.detail : 'AI 변환 준비 중...'}
          </p>
          {odProgress && odProgress.total > 0 && (
            <div className="w-full flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
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
      ) : (
        <div className="flex flex-col items-center gap-2">
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-2 text-sm text-red-700 max-w-lg">
              {error}
            </div>
          )}
          <OdReviewOverlay
            detections={savedOdData.detections}
            captureBase64={savedOdData.imageBase64}
            captureImageSize={{ w: savedOdData.imageWidth, h: savedOdData.imageHeight }}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        </div>
      )}
    </div>
  )
}
