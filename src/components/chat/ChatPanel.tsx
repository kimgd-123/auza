import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { prosemirrorToHtml } from '@/lib/prosemirror-to-html'
import type { ChatMessage } from '@/types'

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

    // 현재 블록 내용을 컨텍스트로 전달
    let context: string | undefined
    if (activeBlock?.content) {
      try {
        const doc = JSON.parse(activeBlock.content)
        context = prosemirrorToHtml(doc)
      } catch { /* ignore */ }
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
                {msg.role === 'assistant' && (
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
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeBlock ? '메시지를 입력하세요...' : '블록을 먼저 선택하세요'}
            disabled={!activeBlock || loading}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-300"
          />
          <button
            onClick={handleSend}
            disabled={!activeBlock || !input.trim() || loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  )
}
