# Phase 8 통합테스트 체크리스트

- 작성일: 2026-03-18
- 대상: AUZA v1 최종 통합 검증
- 기준 문서:
  - `doc/PRD_AUZA_HWP작성기.md`
  - `doc/CLAUDE_CODEX_교차검토_파이프라인.md`
  - `CLAUDE.md`

## 1. 목적

Phase 8은 개별 기능 구현 확인이 아니라, 아래 전체 플로우가 실제로 이어지는지 검증하는 단계다.

- PDF 입력
- 에디터 편집
- Vision/채팅/정규화
- Electron IPC
- Python bridge
- HWP 출력
- 세션 저장/복구
- 패키징 결과

## 2. 기본 원칙

- 실패는 한 번에 하나씩만 닫는다
- 같은 버그를 여러 시나리오에서 중복 추적하지 않는다
- 증상은 반드시 `재현 절차 / 기대 / 실제 / 로그 경로` 단위로 남긴다
- 리뷰 번들은 `Phase8_Integration` 이름으로 관리한다
- cross-check / recheck는 백그라운드로 돌리고, 통합테스트 수행은 계속 진행한다

## 3. 시작 전 준비

### 3.1 리뷰 번들 생성

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\New-PhaseReviewBundle.ps1 -PhaseName "Phase8_Integration"
```

생성 후 아래 파일을 사용한다.

- `01_CROSS_CHECK_REQUEST.md`
- `02_CODEX_REVIEW.md`
- `03_FIX_RESPONSE.md`
- `04_CODEX_RECHECK.md`

### 3.2 테스트 로그 폴더

권장 경로:

```text
doc/integration-runs/2026-03-18_phase8/
```

권장 저장 항목:

- `run-notes.md`
- `scenario-results.md`
- `renderer.log`
- `main.log`
- `python-bridge.log`
- `gemini-request-response.log`
- `hwp-action-trace.log`
- 스크린샷 / 캡처 이미지

### 3.3 사전 점검

- `npm run typecheck`
- `npm run build`
- dev 실행 가능 여부
- HWP 설치 및 실행 확인
- Gemini API 키 설정 확인
- 샘플 PDF 준비

## 4. 테스트 시나리오

| ID | 시나리오 | 핵심 검증 포인트 | 우선순위 |
|----|----------|------------------|----------|
| `S1` | 텍스트만 있는 PDF | 선택/복사/붙여넣기, 저장/복구, HWP 텍스트 삽입 | 높음 |
| `S2` | 단순 표 PDF | 표 인식, 표 편집, HWP 표 생성 | 높음 |
| `S3` | 병합 셀이 있는 표 PDF | rowspan/colspan, 셀 배경/정렬/테두리 | 높음 |
| `S4` | 수식 PDF | Vision → LaTeX → 정규화 → 렌더링 → HWP 수식 | 높음 |
| `S5` | 텍스트+표+수식 혼합 PDF | 혼합 콘텐츠 정합성, 블록 순서, 전체 작성 | 높음 |
| `S6` | 스캔/저품질 PDF | 캡처 품질, 재시도 UX, fallback 안내 | 중간 |
| `S7` | 세션 저장 후 재실행 복구 | session.json 무결성, 복구 품질 | 높음 |
| `S8` | HWP 미실행/연결 실패 | 에러 메시지, 재시도 UX, 비정상 종료 대응 | 높음 |
| `S9` | exe 패키징 실행 | 배포 환경 동일 동작 여부 | 높음 |

## 5. 시나리오별 체크포인트

### S1. 텍스트만 있는 PDF

목표:

- 선택 도구로 텍스트 복사
- 에디터 블록 반영
- 저장/복구 후 동일 상태 유지
- HWP에 텍스트 정상 삽입

체크:

- 페이지 이동/줌이 정상 동작하는가
- 복사 후 붙여넣기 시 글자 깨짐이 없는가
- 에디터 내용이 session 복구 후 동일한가
- HWP 삽입 후 문단 순서가 맞는가

증적:

- 텍스트 붙여넣기 전/후 스크린샷
- HWP 결과 스크린샷

### S2. 단순 표 PDF

목표:

- Vision 또는 구조화 경로로 표가 생성되는지
- 표 편집 후 HWP 표로 나가는지

체크:

- 행/열 수가 맞는가
- 헤더/본문 구분이 맞는가
- 편집 후 상태가 저장/복구되는가

### S3. 병합 셀이 있는 표 PDF

목표:

- 병합 셀, 배경색, 정렬, 테두리 속성이 유지되는지

체크:

- `rowspan`, `colspan`이 유지되는가
- 셀 배경색이 유지되는가
- 정렬이 유지되는가
- 테두리 설정이 UI와 직렬화에 반영되는가
- HWP에서 병합이 맞는가

주의:

- 현재 남은 known issue가 border 계열이라면 이 시나리오가 최우선 회귀 확인 포인트다

### S4. 수식 PDF

목표:

- Vision 인식 결과가 LaTeX로 정규화되고 에디터/출력에 반영되는지

체크:

- whitelist 수식이 정상 변환되는가
- 미지원 수식이 fallback 또는 경고 처리되는가
- HWP EquEdit 결과가 기대와 크게 다르지 않은가

### S5. 텍스트 + 표 + 수식 혼합 PDF

목표:

- 한 블록 또는 여러 블록에서 혼합 콘텐츠가 깨지지 않는지

체크:

- 블록 순서 변경 후 앱 내 순서만 변하는가
- 전체 작성 시 블록 순서대로 삽입되는가
- HWP 독립성 원칙이 유지되는가

### S6. 스캔/저품질 PDF

목표:

- 캡처 품질 규칙과 재시도 UX 확인

체크:

- 저품질 캡처 시 재캡처 안내가 나오는가
- 확대 후 다시 시도하면 인식이 개선되는가
- 완전 실패 시 사용자 안내가 충분한가

### S7. 세션 저장 후 재실행 복구

목표:

- session.json에 저장된 ProseMirror JSON이 무결하게 복구되는지

체크:

- 앱 재실행 후 블록/제목/에디터 내용이 복구되는가
- 표/수식도 복구되는가
- 깨진 JSON 또는 빈 세션 파일일 때 방어 동작이 있는가

### S8. HWP 미실행 / 연결 실패

목표:

- 실패 UX와 에러 처리 검증

체크:

- HWP 미실행 상태에서 안내가 뜨는가
- 연결 실패 시 앱이 죽지 않는가
- 다시 시도 가능 상태로 복구되는가

### S9. exe 패키징 실행

목표:

- dev 환경이 아니라 배포 환경에서도 핵심 플로우가 유지되는지

체크:

- exe 실행
- 설정 로드
- PDF 열기
- 표/수식 처리
- HWP 출력
- 세션 복구

## 6. 디버깅 우선순위

문제가 발생하면 아래 순서로 원인을 좁힌다.

1. 입력 문제
   - PDF 선택 / 캡처 / 복사 문제인지
2. 정규화 문제
   - Vision/채팅 응답 -> 공통 정규화기 문제인지
3. 에디터 문제
   - ProseMirror JSON / TipTap 렌더링 문제인지
4. 브리지 문제
   - preload / IPC / child_process 문제인지
5. 출력 문제
   - Python writer / HWP COM 문제인지
6. 배포 문제
   - dev에서는 되는데 exe에서만 깨지는지

## 7. 실패 기록 양식

`doc/integration-runs/<run>/scenario-results.md`에 아래 형식으로 기록한다.

```md
## S3

- 상태: fail
- 재현 절차:
- 기대 동작:
- 실제 동작:
- 관련 로그:
- 스크린샷:
- 원인 추정:
- 다음 조치:
```

## 8. Codex 교차검토에 넘길 권장 범위

Phase 8에서 Codex에게는 아래 관점으로 요청하는 것이 좋다.

- 통합 시나리오 누락
- 회귀 여부
- 로그상 명백한 버그
- PRD와 실제 동작의 불일치
- 배포 환경과 dev 환경 차이

## 9. Phase 8 완료 기준

아래 조건이 모두 맞아야 완료로 본다.

- `S1` ~ `S8` 중 높음 우선순위 시나리오 통과
- 남은 medium 이슈는 사용자 합의 하에 허용 가능 수준
- cross-check / recheck 결과에 blocking finding 없음
- `npm run typecheck` 통과
- 가능한 경우 `npm run build` 통과
- HWP 수동 검증 결과 치명적 문제 없음
- 사용자에게 결과 요약과 잔여 리스크 전달 완료
