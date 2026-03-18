# Phase 8 통합테스트용 Claude 지시문

아래 내용을 Claude에게 그대로 전달하면 된다.

```text
PRD v1.9, CLAUDE.md, doc/CLAUDE_CODEX_교차검토_파이프라인.md를 다시 읽고 Phase 8 통합테스트를 시작하세요.

이번 작업은 "구현"이 아니라 "통합 검증 + 디버깅 + 안정화"입니다.

반드시 따를 것:
1. 리뷰 번들을 `Phase8_Integration` 이름으로 생성
2. 통합테스트 기준 문서는 `doc/PHASE8_통합테스트_체크리스트.md`
3. 테스트 로그와 증적은 `doc/integration-runs/<timestamp>_phase8/` 아래에 정리
4. cross-check / recheck는 백그라운드로 돌리고, 테스트 수행은 계속 진행
5. 각 실패는 `재현 절차 / 기대 / 실제 / 로그 경로 / 다음 조치` 단위로 기록
6. 한 번에 하나의 실패 원인만 닫을 것

실행 순서:
1. `scripts/New-PhaseReviewBundle.ps1 -PhaseName "Phase8_Integration"` 실행
2. `doc/PHASE8_통합테스트_체크리스트.md` 기준으로 S1~S9 시나리오 수행
3. 실패 사항과 테스트 결과를 리뷰 번들의 `01_CROSS_CHECK_REQUEST.md`에 정리
4. `scripts/Start-CodexCrossCheckJob.ps1 -InputFile "<bundle>\\01_CROSS_CHECK_REQUEST.md" -Mode cross-check` 실행
5. Codex 리뷰는 백그라운드로 두고, 남은 통합테스트/수정 계속 진행
6. 적절한 체크포인트에서 `Get-CodexCrossCheckStatus.ps1`로 상태 확인
7. `02_CODEX_REVIEW.md`가 생성되면 finding을 반영
8. `03_FIX_RESPONSE.md` 작성 후 recheck 시작
9. `04_CODEX_RECHECK.md` 기준으로 남은 finding이 없어질 때까지 반복

테스트 우선순위:
- 최우선: S1, S2, S3, S4, S5, S7, S8, S9
- 특히 강하게 볼 항목:
  - Vision 결과 정규화
  - ProseMirror JSON 복구
  - table attrs 직렬화/역직렬화
  - HWP COM 실패 UX
  - 세션 저장/복구
  - dev와 exe 동작 차이

사용자에게 반드시 주기적으로 보고할 것:
- 현재 시나리오(S1~S9) 진행 상태
- 리뷰 번들 경로
- 상태 파일 경로
- 결과 파일 경로
- 현재 blocking issue

완료 조건:
- 높음 우선순위 시나리오 통과
- blocking finding 없음
- cross-check / recheck 종료
- typecheck/build 결과 보고 가능
- 잔여 리스크가 있으면 명시

완료라고 말하기 전에, 통합테스트 관점에서 실제로 닫히지 않은 문제를 숨기지 말고 남은 리스크를 분리해서 보고하세요.
```
