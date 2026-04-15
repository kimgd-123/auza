# AUZA — PDF-to-Document 스마트 작성기

PDF에서 텍스트/표를 복사 → TipTap 에디터에서 편집 → Gemini AI로 수정 → COM 자동화로 HWP·PPT 자동 생성하는 Windows 데스크톱 앱

## 기술 스택
Electron + React + TypeScript + TailwindCSS + TipTap + react-pdf + Zustand + Gemini API + Python win32com + electron-builder

## 아키텍처
```
React Renderer (UI) ↔ IPC ↔ Electron Main ↔ child_process (stdin/stdout JSON) ↔ Python Backend (COM)
```

## 핵심 설계 결정
- **원본 데이터**: ProseMirror JSON — HTML은 중간 전송 포맷으로만 사용
- **공통 정규화기**: Vision/채팅 모든 경로 → 정규화기 → TipTap 호환 노드 변환 후 에디터 삽입
- **내보내기**: ProseMirror JSON → HTML 직렬화 → html_parser.py → DocumentStructure → Writer (Strategy 패턴)
- **수식**: Whitelist(분수/루트/첨자/합/적분/극한/괄호/기호 220+) + 미지원 → 이미지 fallback
- **HWP**: GetActiveObject + ROT 모니커 연결, 커서 끝 아니면 알럿, 블록 순서 변경 ≠ HWP 변경
- **HWP 테이블**: TreatAsChar=1 + PageBreak=1 (본문 흐름 따름, 단/페이지 넘김 허용)
- **boxed_text(글상자)**: 1×1 래퍼 테이블 → 풀어서 개별 문단으로 삽입 + ParagraphShape > BorderFill로 문단 테두리 재현 (단 넘김 가능)
- **CharShape 리셋**: 서식 적용 텍스트 삽입 후 반드시 Bold/Italic/Underline/Color 초기화 (번짐 방지)
- **Gemini SDK**: `google-genai` (신규) — VisionClient 인터페이스 + GeminiDirectClient (api_key별 캐싱, 재시도/timeout)
- **Gemini 병렬화**: ThreadPoolExecutor로 Gemini 호출만 병렬, figure/PyMuPDF는 메인 스레드 순차 유지
- **일괄 변환 (v2.3.0~)**: `od_convert_many` — 여러 세그먼트를 단일 IPC로 Python에 전달, 전체 region을 하나의 Pool에서 병렬 처리. 개별 캡처 경로(`od_convert`)는 그대로 유지
- **Batch 모드 state 정규화**: AreaCapture batchMode=true 시 useEffect 로 imgCropMode=false, odEnabled=true 강제. drag handler 는 batch 분기를 IMG 크롭보다 먼저 실행. 버튼 표시도 batch 에서 raw state 대신 정규화된 값 노출
- **batch 동적 timeout**: `base(5분) + ceil(tasks/effectiveWorkers) × 180초`, `legacyFloor(3분 + 세그먼트×2분)` 를 minimum 으로 보장, 상한 60분. `AUZA_GEMINI_PARALLEL_DISABLE=1` 이면 effectiveWorkers=1 로 정렬
- **batch 진행률 UI**: 단일 IPC 구조상 per-segment 중간 상태가 없음 → 큐 표시는 indeterminate (`변환 중... (N개)`)
- **Timeout 자동 복구 (v2.3.2~)**: `electron/python-bridge.ts` 에서 요청 timeout 시 Python child 강제 종료 → 다음 요청에서 자동 재시작. child generation 격리(closure-scoped lineBuffer + exit 핸들러 self-check + timeout 시점 즉시 pending reject)로 이전 child 의 늦은 exit race 차단.
- **테스트 인프라 (v2.3.2~)**: Vitest + jsdom + @testing-library/react 도입. `vitest.config.ts` 는 vite.config.ts 와 별도 (electron plugin 충돌 회피) + `define.__APP_VERSION__` 동기화. 컴포넌트/훅 커버리지는 점진 확대 (`doc/DEFERRED_TEST_INFRA.md`)
- **부분 성공**: 프런트엔드는 `html`이 있으면 삽입 진행, `error`는 비차단 경고 (console.warn)
- **Python 패키지**: 시작 시 bs4/pywin32/Pillow/google-genai 자동 체크 + pip install (테스터 PC 대응)
- **OD 패키지 설치**: embed Python은 `--target <od-dir> --upgrade`, system Python은 `--force-reinstall` (v2.3.0 수정 — `--force-reinstall` + `--target` 조합은 잔재 디렉토리에서 불완전 설치 유발)
- **세션**: %APPDATA%/AUZA-v2/session.json 자동 저장 (ProseMirror JSON)
- **자동 업데이트**: electron-updater + GitHub Releases, 앱 시작 3초 후 체크
- **CSP**: production은 `script-src 'self'`, 개발 모드는 Vite HMR을 위해 `'unsafe-inline'` + `ws://localhost:*` 허용
- **캡처 모드**: 개별 캡처 / 일괄 캡처 선택 (기본: 일괄), OD-on + Review-on이 기본값

## to Claude
1. Thinking은 반드시 한국어로 진행, compacted 후에도 이 규칙 준수
2. HWP COM 자동화 코드 작성 시 반드시 한글 오토메이션 참조 문서 확인
3. HTML → HWP/PPT 변환 시 표 스타일(셀 병합, 테두리, 배경색) 재현에 주의
4. Electron IPC 보안: contextIsolation + preload 패턴 준수
5. win32com 에러 핸들링 필수 (HWP/PPT 미설치, COM 연결 실패 등)
6. hwp_writer와 ppt_writer는 동일 인터페이스 구현 (Strategy 패턴)
7. 파일 삭제 전 의존성 검사 필수
8. 구현 완료 후에는 반드시 `doc/CLAUDE_CODEX_교차검토_파이프라인.md` 기준으로 Codex 교차검토 요청
9. Codex 교차검토 요청 시 작업 범위, 변경 파일, 실행한 테스트, 남은 리스크를 함께 전달
10. Phase 또는 큰 기능 구현이 끝나면 `scripts/New-PhaseReviewBundle.ps1 -PhaseName "<phase>"`로 리뷰 번들을 생성
11. 생성된 번들의 `01_CROSS_CHECK_REQUEST.md`를 직접 채운 뒤 `scripts/Start-CodexCrossCheckJob.ps1 -InputFile "<bundle>\\01_CROSS_CHECK_REQUEST.md" -Mode cross-check`를 실행해 Codex CLI 리뷰를 백그라운드에서 시작
12. 리뷰 시작 직후 사용자에게 반드시 아래 3가지를 전달: 번들 경로, 상태 파일 경로(`02_CODEX_REVIEW.status.json`), 결과 파일 경로(`02_CODEX_REVIEW.md`)
13. 리뷰는 기본적으로 **비동기**로 돌리고, Claude는 다음 독립 작업 또는 다음 phase 구현을 계속 진행할 수 있다
14. 상태 확인이 필요하면 `scripts/Get-CodexCrossCheckStatus.ps1 -Target "<bundle>" -Mode cross-check`를 사용하고, `scripts/Wait-CodexCrossCheck.ps1`는 수동 블로킹이 필요할 때만 사용한다
15. 단, 아래 시점에는 반드시 리뷰 상태를 확인해야 한다: 사용자에게 완료 보고 전, release/package 전, 같은 파일/모듈을 다시 크게 수정하기 전, 이전 phase 결과에 직접 의존하는 다음 phase에 진입하기 전
16. `02_CODEX_REVIEW.md`가 `## Debug Request`이면 관련 finding과 겹치는 작업을 우선 중단하고 수정한 뒤 `03_FIX_RESPONSE.md`를 작성한다
17. 수정 후에는 `scripts/Start-CodexCrossCheckJob.ps1 -InputFile "<bundle>\\03_FIX_RESPONSE.md" -Mode recheck`를 실행해 재검증을 백그라운드에서 시작한다
18. 재검증도 기본적으로 비동기이며, `scripts/Get-CodexCrossCheckStatus.ps1 -Target "<bundle>" -Mode recheck`로 상태를 확인한다
19. 최종 완료 선언 전에는 반드시 recheck가 끝났는지 확인하고, 남은 finding이 있으면 모두 해소한다
20. 자동 호출이 권한 문제로 막히면 사용자에게 승인 요청 후 계속 진행
21. **빌드 전 릴리즈 노트 필수**: `npm run electron:build` 실행 전에 반드시 `src/data/releaseNotes.ts`에 해당 버전의 릴리즈 노트 항목을 추가해야 한다. version은 `package.json`과 일치해야 하며, 누락 시 사용자가 업데이트 후 릴리즈 노트를 확인할 수 없다

## 참조
- **PRD**: `doc/PRD_AUZA_HWP작성기.md`
- **교차검토 파이프라인**: `doc/CLAUDE_CODEX_교차검토_파이프라인.md`
- **자동화 스크립트**: `scripts/New-PhaseReviewBundle.ps1`, `scripts/Start-CodexCrossCheckJob.ps1`, `scripts/Get-CodexCrossCheckStatus.ps1`
- **대기 스크립트**: `scripts/Wait-CodexCrossCheck.ps1`
- **한글 오토메이션 문서**: `C:\Users\kaeli\Downloads\docling_pj\HANCOM개발가이드문서\`
- **Paser_Exam_pj** (`C:\Project\Paser_Exam_pj`): 수식 파이프라인 포팅 (latex-normalizer, latex-to-hwp, fix_equation_width)
- **docling_pj** (`C:\Users\kaeli\Downloads\docling_pj`): PDF 좌표/JSON 중간구조/오프스크린 렌더링 설계 참조
- **Gemini API 키**: `.env.local` (개발) / `%APPDATA%/AUZA-v2/config.json` (배포) — `.env.local`은 exe 패키징 제외
- **Python 의존성**: `python/requirements.txt` (beautifulsoup4, pywin32, Pillow, PyMuPDF, google-genai)
- **Gemini SDK**: `google-genai>=0.8` (신규 SDK, `google-generativeai`는 EOL)
- **VisionClient**: `python/od/vision_client.py` — GeminiDirectClient (api_key별 캐싱, 재시도, timeout)
- **병렬화**: `python/od/analyzer.py` — ThreadPoolExecutor (기본 8워커, v2.3.0~), figure/PyMuPDF는 메인 스레드 순차
- **Feature Flag**: `AUZA_GEMINI_PARALLEL_DISABLE=1` (순차 fallback), `AUZA_GEMINI_PARALLEL=N` (워커 수 1~10, 기본 8)
- **자동 업데이트**: electron-updater + GitHub Releases (`latest.yml`)
- **HWP COM 속성 참고**: ParagraphShape > `Item("BorderFill")` → `SetItem("BorderTypeTop/Bottom/Left/Right", 1)` 로 문단 테두리 설정
- **일괄 변환 경로**: `python/main.py` `od_convert_many` + `python/od/analyzer.py` `convert_regions_many` + `electron/main.ts` `capture:convertMany` IPC
- **테스트 인프라 deferred**: `doc/DEFERRED_TEST_INFRA.md` (Vitest 도입 별도 phase)
