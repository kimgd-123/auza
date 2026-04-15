# 테스트 인프라 도입 — 진행 현황

- 결정일: 2026-04-10 (사용자 승인 — Deferral)
- 인프라 도입일: 2026-04-15 (Vitest + jsdom + @testing-library/react 설치)
- 상태: **인프라 도입 완료 — 커버리지 확대는 점진 진행**

## 도입된 인프라 (2026-04-15)

- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@vitest/coverage-v8` (devDependencies)
- `vitest.config.ts` — jsdom 환경, `@` alias, `src/test/setup.ts` 로딩
- `src/test/setup.ts` — `@testing-library/jest-dom/vitest` matcher 등록
- `package.json` scripts: `test` (watch), `test:run` (단발 실행)
- 첫 샘플: `src/lib/latex-normalizer.test.ts` — 8 케이스 통과 (인프라 동작 증명)

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

## 다음 우선 커버 대상 (인프라 도입 후)

### Python
1. `convert_regions_many` — 결과 순서, whole-image fallback, figure 혼합, partial failure
2. `convert_regions` — 기존 커버리지 유지

### Frontend
1. `useBatchCapture` — convertMany 경로 상태 전이, 부분 실패 매핑, retry 방어
2. `AreaCapture` — batchMode 진입 정규화, `minLongSide` 해상도 계산
3. `BatchCaptureQueue` — indeterminate progress 전환 및 버튼 disabled 상태
4. `BatchReviewModal` — 탭 전환 시 편집 저장, detecting 전 리뷰 진입 차단

## 착수 조건

- 인프라 자체는 도입 완료 (2026-04-15)
- 위 우선 대상 테스트는 해당 영역을 다음에 만질 때 함께 작성하는 것을 기본으로 함
