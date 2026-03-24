import { useCallback, useEffect, useState } from 'react'

const TUTORIAL_DONE_KEY = 'auza_tutorial_done'

interface Step {
  title: string
  description: string
  targetSelector?: string  // 하이라이트할 요소 CSS 선택자
  position: 'center' | 'bottom-left' | 'bottom-right' | 'top-center'
}

const STEPS: Step[] = [
  {
    title: 'AUZA에 오신 것을 환영합니다!',
    description: 'PDF에서 본문, 표, 이미지 등을 캡처하고, AI로 변환하여 한글(HWP) 문서를 자동 생성하는 도구입니다.\n\n간단한 사용법을 안내해 드릴게요.',
    position: 'center',
  },
  {
    title: '① PDF 열기',
    description: '상단 "PDF 열기" 버튼을 클릭하여 변환할 PDF 파일을 엽니다.',
    targetSelector: '[data-tutorial="open-pdf"]',
    position: 'bottom-left',
  },
  {
    title: '② 텍스트 선택 (드래그)',
    description: '"선택" 탭에서 PDF 텍스트를 드래그하여 복사할 수 있습니다.\n\n선택한 텍스트를 Ctrl+C로 복사한 뒤 에디터에 Ctrl+V로 붙여넣으면 됩니다.',
    targetSelector: '[data-tutorial="select-tab"]',
    position: 'bottom-left',
  },
  {
    title: '③ 영역 캡처 (AI 변환)',
    description: '"캡처" 탭을 선택한 뒤 PDF 위에서 드래그하여 변환할 영역을 선택합니다.\nAI(Gemini)가 텍스트, 표, 수식 등을 자동으로 인식하여 에디터에 삽입합니다.\n\n• OD ON: AI가 레이아웃을 자동 감지합니다\n• Review ON: 감지 결과를 편집할 수 있습니다\n• IMG: 이미지 크롭 모드입니다',
    targetSelector: '[data-tutorial="capture-tab"]',
    position: 'bottom-left',
  },
  {
    title: '④ 에디터 편집',
    description: '캡처된 내용이 오른쪽 에디터에 자동 삽입됩니다.\n툴바를 사용하여 텍스트 서식, 표 편집, 수식 등을 수정할 수 있습니다.',
    targetSelector: '[data-tutorial="editor-area"]',
    position: 'bottom-right',
  },
  {
    title: '⑤ 한글(HWP) 연결',
    description: '한글 프로그램을 먼저 실행한 뒤, 하단 상태바의 "연결" 버튼을 클릭합니다.\n\n연결되면 "HWP: 연결됨"으로 표시됩니다.\n한글이 실행 중이면 자동으로 연결되기도 합니다.',
    targetSelector: '[data-tutorial="hwp-connect"]',
    position: 'top-center',
  },
  {
    title: '⑥ HWP 내보내기',
    description: '한글 문서에서 커서를 원하는 위치에 놓은 뒤,\n블록의 "HWP" 버튼을 클릭하면 한글 문서에 자동 삽입됩니다.',
    targetSelector: '[data-tutorial="hwp-button"]',
    position: 'bottom-right',
  },
  {
    title: '⑦ 레이아웃 변경',
    description: '작업 스타일에 맞게 화면 레이아웃을 변경할 수 있습니다.\n\n• PDF + 에디터 + 채팅 3분할\n• PDF 중심 / 에디터 중심\n• PDF + 에디터 (채팅 없음)\n• 에디터 + 채팅 (PDF 없음) 등',
    targetSelector: '[data-tutorial="layout-picker"]',
    position: 'bottom-right',
  },
  {
    title: '⑧ 설정',
    description: '⚙ 버튼에서 Gemini API 키를 설정할 수 있습니다.\nAPI 키는 Google AI Studio에서 무료로 발급받을 수 있습니다.',
    targetSelector: '[data-tutorial="settings-button"]',
    position: 'bottom-right',
  },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function TutorialOverlay({ open, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!open) { setStep(0); return }

    const currentStep = STEPS[step]
    if (currentStep.targetSelector) {
      const el = document.querySelector(currentStep.targetSelector)
      if (el) {
        setHighlightRect(el.getBoundingClientRect())
        return
      }
    }
    setHighlightRect(null)
  }, [open, step])

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      localStorage.setItem(TUTORIAL_DONE_KEY, 'true')
      onClose()
    }
  }, [step, onClose])

  const handlePrev = useCallback(() => {
    if (step > 0) setStep(step - 1)
  }, [step])

  const handleSkip = useCallback(() => {
    localStorage.setItem(TUTORIAL_DONE_KEY, 'true')
    onClose()
  }, [onClose])

  if (!open) return null

  const currentStep = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  // 툴팁 위치 계산 — 뷰포트 내 클램핑
  const vh = window.innerHeight
  const tooltipH = 220 // 추정 높이
  let tooltipStyle: React.CSSProperties = {}

  if (currentStep.position === 'center' || !highlightRect) {
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  } else if (highlightRect) {
    const belowOk = highlightRect.bottom + 12 + tooltipH < vh
    const aboveOk = highlightRect.top - 12 - tooltipH > 0

    if (currentStep.position === 'bottom-left') {
      tooltipStyle = {
        top: belowOk ? highlightRect.bottom + 12 : aboveOk ? highlightRect.top - 12 - tooltipH : Math.max(16, (vh - tooltipH) / 2),
        left: Math.max(16, highlightRect.left),
      }
    } else if (currentStep.position === 'bottom-right') {
      tooltipStyle = {
        top: belowOk ? highlightRect.bottom + 12 : aboveOk ? highlightRect.top - 12 - tooltipH : Math.max(16, (vh - tooltipH) / 2),
        right: 16,
      }
    } else if (currentStep.position === 'top-center') {
      tooltipStyle = {
        top: aboveOk ? highlightRect.top - 12 - tooltipH : belowOk ? highlightRect.bottom + 12 : Math.max(16, (vh - tooltipH) / 2),
        left: '50%',
        transform: 'translateX(-50%)',
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/50" onClick={handleSkip} />

      {/* 하이라이트 영역 (구멍) */}
      {highlightRect && (
        <div
          className="absolute border-2 border-blue-400 rounded-lg z-[101]"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            background: 'transparent',
          }}
        />
      )}

      {/* 툴팁 카드 */}
      <div
        className="absolute z-[102] bg-white rounded-xl shadow-2xl p-5 max-w-sm"
        style={tooltipStyle}
      >
        <h3 className="text-base font-bold text-gray-900 mb-2">{currentStep.title}</h3>
        <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
          {currentStep.description}
        </p>

        {/* 진행 바 */}
        <div className="flex gap-1 mt-4 mb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-blue-500' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {/* 버튼 */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            건너뛰기
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                이전
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {isLast ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 튜토리얼 완료 여부 확인 */
export function isTutorialDone(): boolean {
  return localStorage.getItem(TUTORIAL_DONE_KEY) === 'true'
}

/** 튜토리얼 완료 상태 초기화 (다시 보기용) */
export function resetTutorial(): void {
  localStorage.removeItem(TUTORIAL_DONE_KEY)
}
