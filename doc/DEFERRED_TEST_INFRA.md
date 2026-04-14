# 테스트 인프라 도입 — Deferred Decision

- 결정일: 2026-04-10 (사용자 승인)
- 상태: **Deferred — 별도 phase 에서 일괄 진행 예정**

## 배경

PRD `doc/PRD_AUZA_HWP작성기.md` 는 프론트엔드 테스트 러너 + 상태 전이 테스트를 요구하지만, 현재 `package.json` 에는 `test` 스크립트가 없고 `src/` 에도 `*.test.*` / `*.spec.*` 파일이 없다.

## Deferral 사유

1. **인프라 전용 phase 필요**
   - Vitest + @testing-library/react 도입, test 스크립트 정의, CI 연동, tsconfig 분리 등이 선행되어야 함
   - 개별 finding 에 대응하는 단발성 테스트는 인프라 없이 유지보수 부담만 증가
2. **현재 릴리즈 범위와 경합**
   - v2.3.0 일괄 캡처 / `od_convert_many` 성능 개선이 핵심 목표
   - 테스트 인프라 도입은 상당한 추가 리스크 — 릴리즈 일정을 뒤로 미루게 됨
3. **수동 검증 대체**
   - 빌드 → 실행 → 캡처 → 변환 E2E 수동 시나리오로 릴리즈 전 회귀 점검

## 관련 Codex 교차검토

다음 번들에서 "테스트 부재" 가 remaining finding 으로 기록되어 있으며, 본 문서를 수용 근거로 참조한다:

- `doc/reviews/2026-04-13_184321_batch-capture-fixes/` — Finding 4
- `doc/reviews/2026-04-14_084635_od_convert_many/` — Finding 3
  - `05_RESIDUAL_RISK_ACCEPTANCE.md` 참조

## 후속 Phase 착수 시 우선 커버 대상

### Python
1. `convert_regions_many` — 결과 순서, whole-image fallback, figure 혼합, partial failure
2. `convert_regions` — 기존 커버리지 유지

### Frontend
1. `useBatchCapture` — convertMany 경로 상태 전이, 부분 실패 매핑, retry 방어
2. `AreaCapture` — batchMode 진입 정규화, `minLongSide` 해상도 계산
3. `BatchCaptureQueue` — indeterminate progress 전환 및 버튼 disabled 상태
4. `BatchReviewModal` — 탭 전환 시 편집 저장, detecting 전 리뷰 진입 차단

## 착수 조건

- 현재 진행 중 v2.3.x 릴리즈 스트림이 안정화된 이후
- 또는 PRD 수정을 통해 테스트 요구사항을 현실화하는 쪽으로 결정된 경우
