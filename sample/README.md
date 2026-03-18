# AUZA Phase 8 Sample PDFs

- 생성일: 2026-03-18
- 원본 경로: `C:\Users\kaeli\Downloads\docling_pj\sample`
- 목적: `doc/PHASE8_통합테스트_체크리스트.md` 의 `S1~S9` 시나리오에 맞는 테스트용 PDF 묶음

## 파일 목록

| ID | 파일 | 용도 | 원본 |
|----|------|------|------|
| `S1` | `S1_text_only.pdf` | 텍스트 위주 PDF | `high_kor_level.pdf` p1~p3 |
| `S2` | `S2_simple_table.pdf` | 단순 표/목차형 표 | `초등_사회(설) 5-1_수활북.pdf` p2 |
| `S3` | `S3_merged_table.pdf` | 표 복합도 높은 다중 행 표 | `초등_사회(설) 5-1_수활북.pdf` p2~p3 |
| `S4` | `S4_formula.pdf` | 수식/수학 표현 중심 | `mid_level.pdf` p2~p4 |
| `S5` | `S5_mixed_text_table_formula.pdf` | 텍스트 + 표 + 수식 혼합 | `high_kor_level.pdf` p1 + `초등_사회(설) 5-1_수활북.pdf` p2 + `mid_level.pdf` p3 |
| `S6` | `S6_low_quality_scan_like.pdf` | 저품질/저해상도 계열 테스트 | `low_level.pdf` 전체 |
| `S7` | `S7_session_restore_mix.pdf` | 세션 저장/복구용 혼합 샘플 | `high_level.pdf` p3 + `high_soc_level.pdf` p5 + `mid_level.pdf` p5 |
| `S8` | `S8_hwp_failure_input.pdf` | HWP 미실행/연결 실패 UX 테스트용 입력 | `표현-강강.pdf` p1~p2 |
| `S9` | `S9_packaging_regression.pdf` | exe 패키징 최종 회귀용 종합 샘플 | `high_kor_level.pdf` p1 + `초등_사회(설) 5-1_수활북.pdf` p2~p3 + `mid_level.pdf` p2~p3 |

## 사용 메모

- `S2`, `S3`는 표성이 높은 페이지를 우선 기준으로 잘랐다.
- `S5`, `S7`, `S9`는 통합 시나리오를 위해 여러 원본 PDF 페이지를 합쳐 만든 조합 샘플이다.
- `S8`은 PDF 내용보다 `HWP 연결 실패 UX` 검증이 목적이므로 가장 가벼운 텍스트형 입력으로 사용하면 된다.
- `S9`는 dev 환경 검증이 끝난 뒤 exe 패키징 최종 점검에 사용하는 것을 권장한다.
