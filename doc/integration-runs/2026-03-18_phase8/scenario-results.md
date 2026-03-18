# Phase 8 통합테스트 시나리오 결과

- 테스트일: 2026-03-18
- 테스트 방식: 코드 경로 정적 검증 + typecheck + build

## 사전 점검

| 항목 | 결과 |
|------|------|
| `npm run typecheck` | 통과 |
| `npm run build` | 성공 |
| dev 실행 | 정상 (단일 창) |
| 샘플 PDF (S1~S9) | 준비 완료 |

## 시나리오별 결과

### S1. 텍스트 PDF
- **상태**: pass
- 코드 경로: PDF 열기 → react-pdf 렌더링 → 텍스트 레이어 선택/복사 → TipTap 붙여넣기 → 세션 저장 → HWP 작성 — 전 구간 연결 확인
- 에러 핸들링: 완전 (PDF 로드 실패, 세션 손상, HWP 미연결)

### S2. 단순 표 PDF
- **상태**: pass
- 코드 경로: Vision 캡처 → Gemini API → HTML 표 → auza:insertHtml → TipTap insertContent → ProseMirror JSON → prosemirrorToHtml → Python html_parser → hwp_writer — 전 구간 연결
- TipTap `@tiptap/extension-table@2.27.2` — colspan/rowspan 기본 지원 확인

### S3. 병합 셀 표 PDF
- **상태**: pass (경고 2건)
- 코드 경로: S2와 동일 + hwp_writer의 occupied set rowspan 추적 + _merge_cells COM 자동화
- 경고 1: 병합 실패 시 try-except pass (사용자 알림 없음) — 우선순위 중간
- 경고 2: 테두리 스타일 미구현 (HWP 기본 테두리만) — 우선순위 낮음

### S4. 수식 PDF
- **상태**: pass (경고 1건)
- 코드 경로: Vision → LaTeX HTML → TipTap Mathematics → ProseMirror → extractLatexFromDoc → safeLatexToHwpScript (isConvertible whitelist) → mathMappings → Python → EquEdit
- 미지원 수식 → 텍스트 fallback (`[수식: $...$]`)
- 경고: normalizeLatexForKatex()가 export 경로에서 미호출 — Vision 응답에 유니코드 수학기호 포함 시 위험

### S5. 혼합 PDF
- **상태**: pass (경고 1건)
- 코드 경로 (문단): Vision → HTML(텍스트+수식) → TipTap → ProseMirror → prosemirrorToHtml → _split_math_runs → _write_paragraph(runs 순회) — 정상
- 코드 경로 (표 내 혼합): ⚠️ html_parser가 셀 content를 HTML 문자열로 저장 → hwp_writer가 `re.sub(r'<[^>]+>', '')` 태그 제거 → 표 셀 내 수식은 텍스트로만 출력
- 경고: 표 셀 내 수식 HWP 삽입 미구현 — 우선순위 중간 (문단 수식은 정상)

### S6. 스캔/저품질 PDF
- **상태**: skip (중간 우선순위)
- Vision 재시도 UX 구현됨 (AreaCapture의 __auzaRetryCapture + PdfViewer 에러 배너)

### S7. 세션 저장/복구
- **상태**: pass (경고 1건)
- 코드 경로: useSessionAutoSave(1000ms debounce) → session:save(atomic write) → session:load(JSON 유효성 검증) → 손상 감지 → 복구 다이얼로그
- 경고: PDF 경로 복구 실패 시 사용자 피드백 없음 (allowPdf 실패 조용히 무시) — 우선순위 중간

### S8. HWP 미실행/연결 실패
- **상태**: pass (경고 1건)
- 코드 경로: checkHwpConnection → GetActiveObject 예외 처리 → UI 에러 표시 → checkHwpCursor → GetPos/SetPos → 커서 다이얼로그
- 부분 성공 처리: hwp_writer가 errors 배열 반환하나 UI에 written/total 미표시
- 경고: 부분 성공(10개 중 9개 작성) 시 사용자가 "실패"만 보임 — 우선순위 중간

### S9. exe 패키징
- **상태**: pass (수정 1건 적용)
- 수정: electron-builder.yml에서 python을 files에서 제거 (asar 내 중복 방지)
- extraResources로 python/ 폴더가 asar 외부에 정상 복사
- python-bridge.ts: app.isPackaged 분기로 process.resourcesPath 사용 확인
- .env.local 패키징 제외 확인
- 경고: Python/pywin32 사전 설치 검증 없음 — 우선순위 중간 (설치 가이드로 대체 가능)

## 발견된 이슈 요약

| # | 시나리오 | 이슈 | 우선순위 | 상태 |
|---|---------|------|---------|------|
| 1 | S3 | 병합 실패 시 사용자 알림 없음 | 중간 | known |
| 2 | S3 | 테두리 스타일 미구현 | 낮음 | known |
| 3 | S4 | normalizeLatexForKatex export 경로 미호출 | 중간 | to-fix |
| 4 | S5 | 표 셀 내 수식 HWP 삽입 미구현 | 중간 | known |
| 5 | S7 | PDF 복구 실패 시 피드백 없음 | 중간 | known |
| 6 | S8 | 부분 성공 written/total UI 미표시 | 중간 | known |
| 7 | S9 | Python/pywin32 사전 검증 없음 | 중간 | known |
| 8 | S9 | python asar 내 중복 포함 | 낮음 | fixed |

## 다음 단계

1. #3 (normalizeLatexForKatex) 수정 — export-hwp.ts에서 호출 추가
2. GUI 실행하여 S1~S5 수동 검증 (샘플 PDF 사용)
3. S7 세션 저장/복구 수동 검증
4. S8 HWP 미연결 상태 수동 검증
5. cross-check 요청 → Codex 리뷰
