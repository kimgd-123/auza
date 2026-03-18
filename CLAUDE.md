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
- **HWP**: GetActiveObject 연결만 (v1), 커서 끝 아니면 알럿, 블록 순서 변경 ≠ HWP 변경
- **세션**: %APPDATA%/AUZA/session.json 자동 저장 (ProseMirror JSON)

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

## 참조
- **PRD**: `doc/PRD_AUZA_HWP작성기.md`
- **교차검토 파이프라인**: `doc/CLAUDE_CODEX_교차검토_파이프라인.md`
- **자동화 스크립트**: `scripts/New-PhaseReviewBundle.ps1`, `scripts/Start-CodexCrossCheckJob.ps1`, `scripts/Get-CodexCrossCheckStatus.ps1`
- **대기 스크립트**: `scripts/Wait-CodexCrossCheck.ps1`
- **한글 오토메이션 문서**: `C:\Users\kaeli\Downloads\docling_pj\HANCOM개발가이드문서\`
- **Paser_Exam_pj** (`C:\Project\Paser_Exam_pj`): 수식 파이프라인 포팅 (latex-normalizer, latex-to-hwp, fix_equation_width)
- **docling_pj** (`C:\Users\kaeli\Downloads\docling_pj`): PDF 좌표/JSON 중간구조/오프스크린 렌더링 설계 참조
- **Gemini API 키**: `.env.local` (개발) / `%APPDATA%/AUZA/config.json` (배포) — `.env.local`은 exe 패키징 제외
