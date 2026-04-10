import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function InfoDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<'usage' | 'capture' | 'shortcuts' | 'dev'>('usage')

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-3 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900">AUZA v2.1</h3>
            <p className="text-xs text-gray-500 mt-0.5">PDF-to-HWP 스마트 작성기</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 px-5 pt-3 flex-shrink-0">
          {([
            { key: 'usage', label: '사용법' },
            { key: 'capture', label: '캡처 모드' },
            { key: 'shortcuts', label: '단축키' },
            { key: 'dev', label: '개발' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs rounded-t font-medium border-b-2 ${
                tab === t.key ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 콘텐츠 */}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 text-sm text-gray-700 leading-relaxed">
          {tab === 'usage' && <UsageTab />}
          {tab === 'capture' && <CaptureTab />}
          {tab === 'shortcuts' && <ShortcutsTab />}
          {tab === 'dev' && <DevTab />}
        </div>

        {/* 하단 */}
        <div className="px-5 py-3 border-t flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-400">Gemini API 키는 설정(⚙)에서 변경</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function UsageTab() {
  return (
    <div className="space-y-4">
      <Section title="시스템 요구사항">
        <ul className="list-disc pl-4 space-y-1 text-xs text-gray-600">
          <li>Windows 10/11 (64-bit)</li>
          <li>한컴오피스 한글 2020 이상 (HWP 내보내기용)</li>
          <li>Gemini API 키 — Google AI Studio에서 무료 발급</li>
        </ul>
        <p className="text-xs text-gray-500 mt-2">
          * 한글 프로그램이 없어도 PDF 캡처 → 에디터 편집까지는 사용 가능합니다.
        </p>
      </Section>

      <Section title="기본 워크플로우">
        <div className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2 font-mono">
          <span>PDF 열기</span><Arrow /><span>영역 캡처</span><Arrow /><span>AI 변환</span><Arrow /><span>에디터 편집</span><Arrow /><span>HWP 내보내기</span>
        </div>
      </Section>

      <Section title="사용 순서">
        <ol className="list-decimal pl-4 space-y-2 text-xs text-gray-600">
          <li><b>PDF 열기</b> — 상단 "PDF 열기" 버튼 클릭</li>
          <li><b>텍스트 선택</b> — "선택" 탭에서 드래그하여 텍스트 복사 (Ctrl+C → Ctrl+V)</li>
          <li><b>영역 캡처</b> — "캡처" 탭에서 드래그하면 AI가 자동 변환하여 에디터에 삽입</li>
          <li><b>에디터 편집</b> — 툴바로 서식/표/수식 수정</li>
          <li><b>한글 연결</b> — 한글 실행 후 하단 "연결" 클릭</li>
          <li><b>HWP 내보내기</b> — 블록의 "HWP" 버튼 또는 상단 "전체 HWP 작성"</li>
        </ol>
      </Section>

      <Section title="Gemini API 키 설정">
        <ol className="list-decimal pl-4 space-y-1 text-xs text-gray-600">
          <li>Google AI Studio에서 API 키 발급</li>
          <li>⚙ 설정 버튼 → API 키 입력 → 저장</li>
          <li>한번 저장하면 재시작 후에도 유지됩니다</li>
        </ol>
      </Section>
    </div>
  )
}

function CaptureTab() {
  return (
    <div className="space-y-4">
      <Section title="캡처 모드">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-2 py-1.5 border-b font-medium">모드</th>
              <th className="text-left px-2 py-1.5 border-b font-medium">설명</th>
            </tr>
          </thead>
          <tbody className="text-gray-600">
            <tr><td className="px-2 py-1.5 border-b font-medium">일반</td><td className="px-2 py-1.5 border-b">선택 영역을 Gemini Vision으로 직접 인식</td></tr>
            <tr><td className="px-2 py-1.5 border-b font-medium text-green-700">OD ON</td><td className="px-2 py-1.5 border-b">AI가 레이아웃(텍스트/표/이미지/수식)을 자동 감지</td></tr>
            <tr><td className="px-2 py-1.5 border-b font-medium text-purple-700">Review ON</td><td className="px-2 py-1.5 border-b">감지 결과를 편집(삭제/타입 변경/리사이즈) 후 변환</td></tr>
            <tr><td className="px-2 py-1.5 font-medium text-orange-700">IMG</td><td className="px-2 py-1.5">이미지 크롭 전용 모드 (고해상도)</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="OD Review 모드">
        <ul className="space-y-1 text-xs text-gray-600">
          <li><b>클릭</b> — 영역 선택</li>
          <li><b>드래그</b> — 영역 이동</li>
          <li><b>코너/엣지 핸들</b> — 8방향 리사이즈</li>
          <li><b>드롭다운</b> — 영역 타입 변경 (text/table/figure/formula/abandon)</li>
          <li><b>+ 영역 추가</b> — 새 영역 수동 그리기</li>
          <li><b>Delete</b> — 선택 영역 삭제</li>
          <li><b>Ctrl+C/V</b> — 영역 복사/붙여넣기</li>
          <li><b>Enter</b> — 변환 실행</li>
          <li><b>Esc</b> — 취소</li>
        </ul>
      </Section>
    </div>
  )
}

function ShortcutsTab() {
  const shortcuts = [
    ['마우스 드래그 (캡처 모드)', '영역 캡처'],
    ['Delete (OD Review)', '선택 영역 삭제'],
    ['Enter (OD Review)', '변환 실행'],
    ['Esc (OD Review)', '리뷰 취소'],
    ['Ctrl+C/V (OD Review)', '영역 복사/붙여넣기'],
    ['Ctrl+C/V (에디터)', '텍스트 복사/붙여넣기'],
  ]

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-gray-50">
          <th className="text-left px-2 py-1.5 border-b font-medium">단축키</th>
          <th className="text-left px-2 py-1.5 border-b font-medium">기능</th>
        </tr>
      </thead>
      <tbody className="text-gray-600">
        {shortcuts.map(([key, desc], i) => (
          <tr key={i}>
            <td className="px-2 py-1.5 border-b font-mono bg-gray-50">{key}</td>
            <td className="px-2 py-1.5 border-b">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DevTab() {
  return (
    <div className="space-y-4">
      <Section title="오류 문의">
        <p className="text-xs text-gray-600">
          김규동 CP — <a href="mailto:kimgd@visang.com" className="text-blue-600 hover:underline">kimgd@visang.com</a>
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-800 mb-2">{title}</h4>
      {children}
    </div>
  )
}

function Arrow() {
  return <span className="text-gray-400">→</span>
}
