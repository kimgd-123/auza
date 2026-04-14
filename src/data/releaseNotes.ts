// 릴리즈 노트 — 버전별 변경 사항
// 새 버전 릴리즈 시 이 파일 최상단에 항목 추가 (version은 package.json과 일치해야 함)

export type ChangeType = 'feat' | 'fix' | 'perf' | 'refactor' | 'docs' | 'chore'

export interface ReleaseNote {
  version: string          // package.json의 version과 일치
  date: string             // YYYY-MM-DD
  title?: string           // 릴리즈 요약 제목 (옵션)
  highlights?: string[]    // 주요 변경 하이라이트 (옵션)
  changes: Array<{
    type: ChangeType
    text: string
  }>
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '2.3.1',
    date: '2026-04-14',
    title: '수동 업데이트 확인 버튼 추가',
    highlights: [
      '릴리즈 노트 모달에 "업데이트 확인" 버튼 추가',
      '자동 체크 외에도 언제든 수동으로 업데이트를 조회/다운로드 가능',
    ],
    changes: [
      { type: 'feat', text: '수동 업데이트 확인 버튼 — 릴리즈 노트 모달 하단에 추가' },
      { type: 'feat', text: '업데이트 진행 상태 표시 — 확인 중 / 최신 / 다운로드 진행률 / 완료' },
      { type: 'fix', text: '자동 업데이트 이벤트 브로드캐스트 보강 (update:not-available, update:downloaded, update:error)' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-04-14',
    title: '일괄 캡처 + 변환 성능 최적화',
    highlights: [
      '일괄 캡처 — 여러 영역을 연속으로 캡처 → 한번에 리뷰 → 한번에 변환',
      '일괄 변환 성능 개선 — 세그먼트 전체를 하나의 Pool에서 동시 처리',
      'Gemini 병렬 워커 기본값 상향 (4 → 8)',
    ],
    changes: [
      { type: 'feat', text: '일괄 캡처 (Batch Capture) — 캡처 큐 + 일괄 리뷰 모달 + 일괄 변환' },
      { type: 'feat', text: 'od_convert_many 일괄 변환 명령 — 여러 세그먼트를 단일 IPC로 처리' },
      { type: 'feat', text: '캡처 드롭다운 (개별/일괄) — 기본값 "일괄 캡처"' },
      { type: 'feat', text: '일괄 모드에서 OD/Review 기본 ON — 캡처 즉시 감지까지 자동' },
      { type: 'perf', text: 'Gemini 병렬 워커 기본값 4 → 8 (유료 티어 기준 최적화)' },
      { type: 'perf', text: '일괄 변환 동적 timeout — 실제 Gemini task 수 기반 계산' },
      { type: 'fix', text: '일괄 모드 진입 시 state 정규화 — IMG/OD 버튼/실행 경로 일치' },
      { type: 'fix', text: '일괄 모드 첫 드래그 해상도 저하 회귀 수정' },
      { type: 'fix', text: '일괄 변환 중 취소/삭제/재시도 차단' },
      { type: 'fix', text: '일괄 변환 진행 UI — 부정확한 0/N 표시 대신 진행 중 상태로 교체' },
      { type: 'fix', text: 'OD 패키지 매 실행 시 재다운로드되던 버그 수정' },
      { type: 'fix', text: '개발 모드 CSP 완화 — HMR 정상 동작' },
    ],
  },
  {
    version: '2.2.2',
    date: '2026-04-13',
    title: '안정성 개선',
    changes: [
      { type: 'fix', text: '앱 안정성 및 내부 보안 개선' },
      { type: 'fix', text: '세션 복구 안정성 향상' },
    ],
  },
  {
    version: '2.2.1',
    date: '2026-04-13',
    title: 'Gemini SDK 마이그레이션 + 병렬화',
    highlights: [
      'Gemini Vision 호출 병렬화로 OD 캡처 체감 속도 ~3배 향상',
      '단종된 google-generativeai SDK를 신규 google-genai로 교체',
      '일부 영역 실패 시에도 성공한 영역은 정상 삽입',
    ],
    changes: [
      { type: 'feat', text: 'Gemini Vision 호출 병렬화 — ThreadPoolExecutor 기반, 기본 4워커 동시 처리' },
      { type: 'feat', text: 'VisionClient 인터페이스 도입 — api_key별 캐싱, 429/503 자동 재시도, timeout 방어' },
      { type: 'fix', text: '부분 성공 처리 개선 — 일부 영역 실패 시에도 성공한 HTML을 에디터에 삽입' },
      { type: 'refactor', text: 'Gemini SDK 마이그레이션 — google-generativeai(EOL) → google-genai' },
      { type: 'chore', text: '시스템 Python 호환성 개선 — embed/시스템 Python 자동 분기' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-04-10',
    title: '자동 업데이트 도입',
    highlights: [
      'electron-updater 기반 자동 업데이트 지원',
      'OD 패키지 설치 경로를 %APPDATA%/AUZA-v2 하위로 분리',
      '업데이트 내역(릴리즈 노트) 모달 추가',
    ],
    changes: [
      { type: 'feat', text: 'electron-updater 자동 업데이트 도입 — 새 버전 자동 다운로드 + 재시작 안내' },
      { type: 'feat', text: '업데이트 내역 모달 추가 — 새 버전 첫 실행 시 자동 표시 + MenuBar에서 수동 열기' },
      { type: 'fix', text: 'OD 패키지 설치 경로를 %APPDATA% 하위로 분리 — 설치 디렉터리 쓰기 권한 불필요' },
      { type: 'fix', text: 'Codex F1 — OD 패키지 경로 마이그레이션 + legacy site-packages 정리' },
      { type: 'fix', text: 'legacy 정리를 embed Python에서만 실행하도록 제한 (Codex recheck)' },
    ],
  },
  {
    version: '2.1.9',
    date: '2026-04-08',
    title: 'Python embed 번들 + PyMuPDF 복원',
    highlights: [
      'Python embed 번들 방식으로 전환하여 무설치 실행 지원',
      'OD 패키지 자동 설치 + 환경 진단 스크립트 추가',
      'figure 이미지 해상도 저하 버그 수정 (PyMuPDF 누락 복원)',
    ],
    changes: [
      { type: 'feat', text: 'Python embed 번들 + OD 패키지 자동 설치 + 환경 진단 스크립트' },
      { type: 'refactor', text: '무설치 버전 제거 + python-installer 정리' },
      { type: 'fix', text: 'PyMuPDF 누락 복원 — embed Python figure 이미지 해상도 저하 수정' },
      { type: 'fix', text: 'Codex F1~F3 Finding 처리 — PyMuPDF embed 설치 + import smoke test 추가' },
    ],
  },
  {
    version: '2.1.6',
    date: '2026-03-25',
    title: 'HWP 2단 레이아웃 + 언더라인 번짐 수정',
    changes: [
      { type: 'fix', text: 'HWP 2단 레이아웃 글상자 단넘김 수정' },
      { type: 'fix', text: '서식 적용 텍스트 삽입 후 언더라인 번짐 수정 (CharShape 리셋)' },
      { type: 'fix', text: 'Python 패키지(bs4/pywin32/Pillow) 자동 설치 — 테스터 PC 대응' },
      { type: 'docs', text: 'CLAUDE.md + README.md 현행화' },
    ],
  },
  {
    version: '2.1.2',
    date: '2026-03-18',
    title: 'boxed_text 글상자 + OD 결과 재편집',
    changes: [
      { type: 'feat', text: 'boxed_text 유형 추가 — 글상자(테두리 박스) 자동 감지 및 border 래핑' },
      { type: 'feat', text: '블록별 OD 결과 저장 + 재편집/AI 재변환 지원' },
      { type: 'feat', text: '튜토리얼 스텝 가이드 + 사용 안내(ⓘ) 모달' },
      { type: 'fix', text: 'HWP 중첩 테이블 렌더링 + boxed_text 테두리 보존' },
      { type: 'fix', text: 'HWP 테이블 탈출 로직 개선 — 2단 레이아웃 보기박스 커서 탈출 문제 해결' },
      { type: 'fix', text: 'HWP 보기박스 줄바꿈 + <보기> 꺾쇠 보존 + 선지 테이블 변환 방지' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-03-12',
    title: 'OD Review Step + IMG 크롭 모드',
    highlights: [
      'OD 검출 결과를 사용자가 직접 편집 후 변환하는 Review Step 추가',
      'IMG 크롭 모드 — PDF 300DPI 고해상도 이미지 크롭',
    ],
    changes: [
      { type: 'feat', text: 'v2.1 OD Review Step 구현 — 영역 이동/리사이즈/타입 변경' },
      { type: 'feat', text: 'IMG 크롭 모드 — PDF 300DPI 고해상도 이미지 크롭 + 커서 위치 삽입' },
      { type: 'feat', text: '채팅 응답 "새 블록에 추가" 버튼' },
      { type: 'feat', text: '배포용 Gemini API 키 사용자 입력 모드 + 미설정 시 설정 모달 자동 표시' },
      { type: 'fix', text: 'HWP 다중 이미지 width 버그 수정' },
      { type: 'fix', text: '프리셋 생성 시 표 셀 내 이미지 JSON 혼입 방지' },
    ],
  },
]

/** 최신 버전 릴리즈 노트 반환 */
export function getLatestRelease(): ReleaseNote | null {
  return RELEASE_NOTES[0] ?? null
}

/** 특정 버전의 릴리즈 노트 찾기 */
export function findReleaseByVersion(version: string): ReleaseNote | null {
  return RELEASE_NOTES.find((r) => r.version === version) ?? null
}
