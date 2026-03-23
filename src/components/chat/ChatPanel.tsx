import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { buildContext } from '@/lib/context-builder'
import { generationIrToHtml } from '@/lib/generation-ir-to-html'
import PresetSelector from './PresetSelector'
import type { ChatMessage } from '@/types'
import type { Preset, HwpGenerationIR } from '@/types/generation'

function stripCodeFences(text: string): string {
  let s = text.trim()
  if (s.startsWith('```html')) s = s.slice(7)
  else if (s.startsWith('```')) s = s.slice(3)
  if (s.endsWith('```')) s = s.slice(0, -3)
  s = s.trim()
  // Gemini가 <html><body> 래퍼를 포함하는 경우 벗겨내기
  s = s.replace(/^<\/?(!doctype[^>]*|html|head|body)[^>]*>/gi, '')
  s = s.replace(/<\/?(!doctype[^>]*|html|head|body)[^>]*>$/gi, '')
  s = s.replace(/<\/?(!doctype[^>]*|html|head|body)[^>]*>/gi, '')
  return s.trim()
}

export default function ChatPanel() {
  const { activeBlockId, blocks, chatHistories, addChatMessage, updateBlock } = useAppStore()
  const [input, setInput] = useState('')
  const [loadingBlockId, setLoadingBlockId] = useState<string | null>(null)
  const loading = loadingBlockId === activeBlockId
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeBlock = blocks.find((b) => b.id === activeBlockId)
  const messages = activeBlockId ? (chatHistories[activeBlockId] || []) : []

  // 메시지 추가 시 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeBlockId || loading) return
    if (!window.electronAPI?.geminiChat) return

    const sendBlockId = activeBlockId // 요청 시점의 블록 ID 고정

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    }
    addChatMessage(sendBlockId, userMsg)
    setInput('')
    setLoadingBlockId(sendBlockId)

    // 일반 채팅은 Summary Layer만 전송 (비용 최적화 — PRD §13.4.3)
    let context: string | undefined
    const { blocks: allBlocks, selectedBlockIds } = useAppStore.getState()
    const blockIdSet = new Set(allBlocks.map((b) => b.id))
    const validSelected = new Set([...selectedBlockIds].filter((id) => blockIdSet.has(id)))
    const effectiveIds = validSelected.size > 0
      ? validSelected
      : sendBlockId ? new Set([sendBlockId]) : new Set<string>()
    const ctxResult = buildContext(allBlocks, effectiveIds)
    if (ctxResult.summaryOnly) {
      context = ctxResult.summaryOnly
    }

    // 채팅 히스토리를 Gemini 형식으로 변환
    const currentMessages = useAppStore.getState().chatHistories[sendBlockId] || []
    const geminiMessages = currentMessages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.content,
    }))

    const result = await window.electronAPI.geminiChat({ messages: geminiMessages, context })

    setLoadingBlockId(null)

    // 블록이 삭제되었으면 응답 무시
    const blockStillExists = useAppStore.getState().blocks.some((b) => b.id === sendBlockId)
    if (!blockStillExists) return

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: result.text || result.error || '응답을 받지 못했습니다.',
      timestamp: Date.now(),
    }
    addChatMessage(sendBlockId, assistantMsg)
  }, [input, activeBlockId, activeBlock, loadingBlockId, addChatMessage])

  // 선택된 프리셋 (생성 모드)
  const [activePreset, setActivePreset] = useState<Preset | null>(null)
  const [generating, setGenerating] = useState(false)

  // 프리셋 선택 시 기본 프롬프트를 입력란에 채우고 프리셋 활성화
  const handlePresetSelect = useCallback((preset: Preset) => {
    setActivePreset(preset)
    setInput(preset.defaultUserPrompt)
  }, [])

  // 프리셋 생성 실행
  const handleGenerate = useCallback(async () => {
    if (!activePreset || !input.trim() || !activeBlockId || generating) return
    if (!window.electronAPI?.geminiGenerate) return

    const sendBlockId = activeBlockId
    setGenerating(true)

    // 컨텍스트 빌드
    const { blocks: allBlocks, selectedBlockIds } = useAppStore.getState()
    const blockIdSet = new Set(allBlocks.map((b) => b.id))
    const validSelected = new Set([...selectedBlockIds].filter((id) => blockIdSet.has(id)))
    const effectiveIds = validSelected.size > 0
      ? validSelected
      : sendBlockId ? new Set([sendBlockId]) : new Set<string>()
    const ctxResult = buildContext(allBlocks, effectiveIds)

    // 채팅에 사용자 메시지 표시
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `[${activePreset.icon} ${activePreset.name}] ${input.trim()}`,
      timestamp: Date.now(),
    }
    addChatMessage(sendBlockId, userMsg)
    setInput('')

    const result = await window.electronAPI.geminiGenerate({
      context: ctxResult.text,
      presetId: activePreset.id,
      presetSystemPrompt: activePreset.systemPrompt,
      outputSchema: activePreset.outputSchemaDescription,
      outputExample: activePreset.outputExample,
      userInstruction: input.trim(),
    })

    setGenerating(false)

    const blockStillExists = useAppStore.getState().blocks.some((b) => b.id === sendBlockId)
    if (!blockStillExists) return

    if (result.error || !result.ir) {
      addChatMessage(sendBlockId, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `생성 실패: ${result.error || '알 수 없는 오류'}`,
        timestamp: Date.now(),
      })
      return
    }

    // Generation IR → HTML → 새 에디터 블록에 삽입
    const ir = result.ir as unknown as HwpGenerationIR
    console.log('[Generate] IR:', JSON.stringify(ir, null, 2).slice(0, 2000))
    console.log('[Generate] effectiveIds:', [...effectiveIds])
    const html = generationIrToHtml(ir, [...effectiveIds])
    console.log('[Generate] HTML preview:', html.slice(0, 500))
    const sectionTitle = ir.sections?.[0]?.title || activePreset.name

    // 새 블록 생성 — 선택 블록 중 마지막 뒤에 삽입
    const store = useAppStore.getState()
    const selectedIds = [...store.selectedBlockIds]
    let lastSelectedId: string | undefined
    if (selectedIds.length > 0) {
      // blocks 배열에서 선택된 블록 중 가장 뒤에 있는 것
      for (let i = store.blocks.length - 1; i >= 0; i--) {
        if (selectedIds.includes(store.blocks[i].id)) {
          lastSelectedId = store.blocks[i].id
          break
        }
      }
    }
    store.addBlock(lastSelectedId)
    const newBlocks = useAppStore.getState().blocks
    // afterBlockId로 삽입했으면 해당 위치+1, 아니면 마지막
    const insertIdx = lastSelectedId
      ? newBlocks.findIndex((b) => b.id === lastSelectedId) + 1
      : newBlocks.length - 1
    const newBlock = newBlocks[insertIdx] || newBlocks[newBlocks.length - 1]
    if (newBlock) {
      useAppStore.getState().updateBlock(newBlock.id, {
        title: `[생성] ${sectionTitle}`,
      })
      // store에 pending HTML 저장 → RichEditor mount 시 소비
      useAppStore.getState().setPendingBlockHtml(newBlock.id, html)
      useAppStore.getState().setActiveBlockId(newBlock.id)
    }

    // 성공 메시지
    addChatMessage(sendBlockId, {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `${activePreset.icon} "${sectionTitle}" 생성 완료! 새 블록에서 확인하세요.\n\n수정 후 "HWP" 버튼으로 내보낼 수 있습니다.`,
      timestamp: Date.now(),
    })

    setActivePreset(null)
  }, [activePreset, input, activeBlockId, generating, addChatMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // AI 응답을 에디터 블록에 적용 (커스텀 이벤트로 에디터에 HTML 삽입 요청)
  const handleApply = useCallback((messageContent: string) => {
    if (!activeBlockId) return

    const html = stripCodeFences(messageContent)
    if (!html) return

    // 에디터 컴포넌트가 리스닝하는 커스텀 이벤트 발행
    window.dispatchEvent(new CustomEvent('auza:insertHtml', {
      detail: { blockId: activeBlockId, html },
    }))
  }, [activeBlockId])

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <span className="text-sm font-medium text-gray-700">Gemini 채팅</span>
        <div className="flex-1" />
        <span className="text-xs text-gray-400">
          {activeBlock ? `블록: ${activeBlock.title || '제목 없음'}` : '블록을 선택하세요'}
        </span>
      </div>

      {/* 채팅 히스토리 */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {!activeBlock ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <p>에디터 블록을 선택하면 채팅을 시작할 수 있습니다</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-gray-300 text-sm text-center mt-8">
            메시지를 입력하여 AI와 대화를 시작하세요
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                {msg.role === 'assistant' && !msg.content.includes('생성 완료!') && !msg.content.startsWith('생성 실패:') && (
                  <button
                    onClick={() => handleApply(msg.content)}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    에디터에 적용
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
              </svg>
              응답 생성 중...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="border-t border-gray-200 p-3 flex-shrink-0">
        {/* 프리셋 활성 표시 */}
        {activePreset && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-purple-50 rounded-md text-xs text-purple-700">
            <span>{activePreset.icon} {activePreset.name}</span>
            <button
              onClick={() => setActivePreset(null)}
              className="ml-auto text-purple-400 hover:text-purple-600"
            >
              취소
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <PresetSelector
            onSelect={handlePresetSelect}
            disabled={!activeBlock || loading || generating}
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (activePreset) handleGenerate()
                else handleSend()
              }
            }}
            placeholder={
              !activeBlock ? '블록을 먼저 선택하세요'
              : activePreset ? `${activePreset.name} 지시사항...`
              : '메시지를 입력하세요...'
            }
            disabled={!activeBlock || loading || generating}
            className={`flex-1 px-3 py-2 text-sm border rounded-lg outline-none disabled:bg-gray-50 disabled:text-gray-300 ${
              activePreset ? 'border-purple-300 focus:border-purple-500' : 'border-gray-200 focus:border-blue-400'
            }`}
          />
          {activePreset ? (
            <button
              onClick={handleGenerate}
              disabled={!activeBlock || !input.trim() || generating}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              {generating ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
                  </svg>
                  생성 중
                </>
              ) : '생성'}
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!activeBlock || !input.trim() || loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              전송
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
