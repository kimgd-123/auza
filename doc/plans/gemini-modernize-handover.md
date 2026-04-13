# Gemini SDK 마이그레이션 + 부분 병렬화 — Handover

> 작성일: 2026-04-10
> 작성자: Claude (Opus 4.6)
> 다음 작업자: Claude (내일 세션) + 사용자(기획자)
> 상태: **계획 확정 / 코드 작성 직전**

---

## 1. 한 줄 요약

AUZA의 OD 캡처 시 사용자 체감 시간을 약 3배 단축하고, 동시에 단종된(EOL) Google Gemini Python 라이브러리를 신규 라이브러리로 교체하는 작업.
**위험을 분리하기 위해 2개의 phase로 나눠서 진행한다.**

---

## 2. 왜 하는가 (배경)

### 사용자 문제
- 사내 편집자 약 300명, 피크 동시 사용자 20명+
- OD ON 캡처 시 영역 5개 = 약 15~40초 대기 (느림)
- 가장 큰 병목은 OD 검출이 아니라 **Gemini Vision 호출이 영역마다 순차로 일어나는 것**

### 발견한 추가 위험 (Codex가 잡음)
- 우리가 쓰는 `google.generativeai` Python 라이브러리가 **2025-11-30에 deprecated** (이미 EOL)
- 매 호출마다 `genai.configure()` 재호출 → thread safety 위험 (병렬화하면 폭발)
- PyMuPDF는 공식 문서가 멀티스레드 미지원 (Python crash 위험)

### 해결 방향
- 라이브러리를 **새 `google-genai`로 교체** → thread safety 개선 + 기술부채 해소
- **Gemini 호출만 부분 병렬화** (figure/PyMuPDF는 메인 스레드 순차 유지)
- 한 번에 다 하지 말고 **2 phase로 분리**해서 위험 격리

---

## 3. 결정된 작업 분할

### Phase A: `gemini-sdk-migration` (먼저, 0.5~1일)
**목적**: SDK만 교체. 기존 동작과 100% 동일한 결과 보장.
- 병렬화 작업 없음 (순차 그대로)
- 새 SDK + Client 캐싱 + 재시도/timeout + VisionResult dataclass + VisionClient 인터페이스

### Phase B: `gemini-parallel` (Phase A 완료 후, 약 1일)
**목적**: 새 SDK 위에서 Gemini 호출만 병렬화. 사용자 체감 3배 단축.
- ThreadPoolExecutor 도입
- figure/PyMuPDF/진행률은 메인 스레드 순차 유지
- feature flag로 즉시 롤백 가능

**총 작업 시간**: 약 1.5~2일 (분리해도 한 번에 하는 것과 동일)

---

## 4. Phase A 상세 — 내일 시작할 작업

### 4.1 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `python/od/gemini_vision.py` | **메인 변경**. 새 SDK로 호출 부분 교체, Client 캐싱, 재시도/timeout |
| `python/od/vision_client.py` | **신규**. `VisionClient` 추상 + `GeminiDirectClient` 구현 + `VisionResult` dataclass |
| `python/main.py` | 자동 설치 패키지 이름 1줄 수정 (`google.generativeai` → `google.genai`) |
| `python/requirements.txt` | `google-genai>=0.8` 추가 |
| `python/tests/test_embed_imports.py` | `google.genai` import 검증 추가 |
| `python/tests/test_gemini_vision.py` | **신규**. 11개 unittest 시나리오 |

### 4.2 코드 변경 핵심 (Before → After)

**현재 (`gemini_vision.py:132`)**:
```python
def call_gemini_vision(api_key, image_base64, prompt):
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-3.1-pro-preview")
    response = model.generate_content([
        {"inline_data": {"mime_type": "image/png", "data": image_base64}},
        prompt,
    ])
    return response.text
```

**목표 (Phase A 완료 후)**:
```python
# vision_client.py (신규)
from dataclasses import dataclass
from google import genai
from google.genai import types

@dataclass
class VisionResult:
    text: str
    attempts: int
    status_code: int | None
    model_version: str
    elapsed_ms: int

class VisionClient:
    def call_vision(self, image_b64: str, prompt: str, timeout: float = 60) -> VisionResult: ...

class GeminiDirectClient(VisionClient):
    # api_key별 Client 캐싱 + threading.Lock
    # http_options.timeout 사용 (SDK 1차 방어)
    # 429/503/504 → exponential backoff (3회, 0.5/1/2초)
    # 400/401 → 즉시 실패
    # 종료 시 close() 호출
    ...
```

### 4.3 Codex가 요구한 핵심 보정 (반드시 반영)

1. **`http_options.timeout`** 사용 (현재 계획서의 `generate_content(timeout=...)`는 google-genai 공식 구조와 다름)
2. **Client 캐싱에 close/eviction 정책** 명시 (장수 프로세스 리소스 누적 방지)
3. **`VisionClient` 반환형은 `str` 아닌 `VisionResult` dataclass** (장애 분석/측정에 필요)

### 4.4 Phase A 자동 테스트 (11개, 모두 unittest + mock)

| # | 테스트 |
|---|---|
| A1 | 회귀 동일성 — 옛/새 SDK 결과 텍스트 동일 |
| A2 | Client 캐싱 — 같은 키 1회 생성 |
| A3 | Client 캐싱 — 다른 키 분리 |
| A4 | Client close 호출 검증 |
| A5 | 재시도 분류 — 일시 오류(429/503/504) → 재시도 → 성공 |
| A6 | 재시도 분류 — 영구 오류(400/401) → 즉시 실패 |
| A7 | 재시도 한계 — 3회 모두 실패 → deterministic 에러 |
| A8 | timeout 동작 — http_options.timeout 초과 처리 |
| A9 | 빈 응답 처리 — response.text가 None/빈 |
| A10 | VisionResult 필드 정확성 (text/attempts/status_code/elapsed_ms) |
| A11 | embed Python에서 google.genai import 성공 |

### 4.5 Phase A 작업 순서 (내일 실제 진행 순서)

1. Phase 번들 생성: `scripts/New-PhaseReviewBundle.ps1 -PhaseName "gemini-sdk-migration"`
2. `01_CROSS_CHECK_REQUEST.md` 작성 (Phase A 범위만)
3. `python/od/vision_client.py` 신규 작성 (`VisionResult`, `VisionClient`, `GeminiDirectClient`)
4. `python/od/gemini_vision.py` 마이그레이션 (`call_gemini_vision` → `VisionClient.call_vision` 위임)
5. `python/main.py` 의존성 이름 수정
6. `python/requirements.txt` 업데이트
7. `python/tests/test_embed_imports.py`에 google.genai 추가
8. `python/tests/test_gemini_vision.py` 신규 (11개 unittest)
9. 로컬 unittest 전체 통과 확인 (`python -m unittest discover -s python/tests -v`)
10. 실제 캡처 1~2회 돌려서 결과 동일성 확인
11. Codex 정식 cross-check 요청
12. finding 처리 → recheck → 합격
13. 빌드 + 검증 + 커밋
14. (선택) 사용자 PC에서 검증 후 Phase B 진입

### 4.6 Phase A 성공 기준

- ✅ baseline 29 + 신규 11 = 40개 unittest 모두 통과
- ✅ 동일 캡처를 마이그레이션 전후로 비교했을 때 **결과 HTML 동일**
- ✅ Codex cross-check에서 critical/high finding 0건
- ✅ `google.generativeai` import/사용처가 코드베이스에서 완전히 제거됨
- ✅ 빌드 정상

---

## 5. Phase B 상세 — Phase A 완료 후

### 5.1 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `python/od/analyzer.py` | **메인 변경**. `convert_regions`를 부분 병렬화 |
| `python/tests/test_analyzer_parallel.py` | **신규**. 12개 unittest 시나리오 |
| `doc/perf/gemini-parallel-baseline.md` | **신규**. 측정 프로토콜 + before/after 표 |

### 5.2 핵심 변경 (병렬화 구조)

```
[메인 스레드]
├─ Phase A (병렬 워커들): Gemini 호출만 ← ThreadPoolExecutor (max_workers=4)
│   - 워커 함수: VisionClient.call_vision() 만 호출
│   - stderr/진행률 emit 안 함 (메인이 집계)
├─ as_completed 루프 (메인): 진행률 단조 증가 emit + atomic counter
└─ Phase B (메인 순차): figure/PyMuPDF 후처리
    - _get_figure_image() (PyMuPDF)
    - _replace_figure_markers()
```

### 5.3 Feature Flag (롤백 안전망)

- `AUZA_GEMINI_PARALLEL_DISABLE=1` → 즉시 기존 순차 경로로 fallback
- `AUZA_GEMINI_PARALLEL=N` (1~10) → 워커 수 조절 (기본 4)
- 기본값 4: Codex 권장 보수적 동시성

### 5.4 Phase B 자동 테스트 (12개)

| # | 테스트 |
|---|---|
| B1 | 순서 보장 — 5영역 응답 순서 무관, 인덱스 순서대로 정렬 |
| B2 | 병렬 동작 증명 — sleep 0.5s × 5영역, 총 < 1.5초 |
| B3 | 에러 격리 — 5개 중 2개 실패, 나머지 정상 |
| B4 | trust_labels=True/False 모두 병렬에서 동일 |
| B5 | 순차 vs 병렬 결과 동일성 (regression) |
| B6 | 진행률 단조 증가 + done 1회 |
| B7 | no detections / 소형 캡처 fallback 경로 |
| B8 | PyMuPDF 메인 스레드 검증 (mock thread name) |
| B9 | 환경변수 — DISABLE 우선순위 |
| B10 | 환경변수 — 정상값 (4) |
| B11 | 환경변수 — 비정상값(0/음수/비정수/과대) → 안전한 기본값 |
| B12 | figure-heavy 케이스 (메인 스레드 순차 정확성) |

### 5.5 측정 프로토콜 (Codex 보강 사항)

`doc/perf/gemini-parallel-baseline.md`에 다음 기록:
- 동일 PDF + 5영역 캡처 **5회 이상 반복**
- median + p95 시간 (warm start)
- model_version, 네트워크 조건 메타데이터
- before/after 비교 표
- figure-heavy 샘플 1종 추가 측정

### 5.6 Phase B 성공 기준

- ✅ Phase A baseline + 신규 12 = 총 52개 unittest 통과
- ✅ 5영역 캡처 기준 사용자 체감 시간 ≥ 60% 단축 (median 기준)
- ✅ DISABLE flag로 즉시 순차 fallback 가능
- ✅ 진행률 이벤트 단조 증가 + done 1회 발행
- ✅ 동일 캡처의 순차/병렬 결과 HTML 동일
- ✅ Codex cross-check에서 critical/high finding 0건

---

## 6. 작업 시간 견적

| Phase | 예상 시간 | 누적 |
|---|---|---|
| Phase A: 코드 + 테스트 + 검증 + Codex cross-check | 0.5~1일 | 0.5~1일 |
| Phase B: 코드 + 테스트 + 측정 + Codex cross-check | 1일 | 1.5~2일 |

각 phase 종료 시 빌드 + 커밋 + (선택) GitHub Release.

---

## 7. 위험 / 미지수

### 다 잡혔지만 구현 시 신경 써야 할 것
1. **`google-genai` 정확한 호출 패턴** — `http_options.timeout` 등 공식 구조 (구현 시점에 SDK 문서 재확인)
2. **`Client.close()` 호출 시점** — 프로세스 종료 시 atexit 또는 명시적 정리
3. **api_key별 Client 캐싱 — eviction 정책** — LRU 또는 단순 dict + 사이즈 제한
4. **embed Python에 google-genai 자동 설치** — `main.py`의 `_ensure_packages` 흐름 그대로 활용
5. **Phase A에서 SDK 변경 후 실제 Gemini API 1회 smoke test 필수** — mock만으론 부족
6. **PyMuPDF 메인 스레드 검증** — Phase B 테스트 B8이 핵심

### 이전 phase에서 deferred됐던 F3 (release-notes-modal)
- Python 사이드: ✅ **이번 두 phase로 부분 해결** (총 23개 신규 unittest = 11+12)
- JS/React 사이드: ⏸ 여전히 deferred (Vitest 도입 별도 phase 필요)

---

## 8. 내일 사용자가 줄 수 있는 명령 예시

### Phase A 시작 (권장 경로)
> "어제 핸드오버 문서대로 Phase A 진행해줘"

또는

> "gemini-sdk-migration phase 시작해. 번들 생성부터 Codex cross-check까지 진행해줘"

### 진행 중간 확인
> "Phase A 어디까지 됐어?"
> "지금 변경한 파일 보여줘"
> "테스트 결과 보여줘"

### Phase A 끝나면
> "Phase A 빌드해서 내 PC에서 검증해볼게. 빌드만 해줘"
> "Phase A 커밋하고 푸시해"
> "Phase B 시작해"

### 만약 중간에 멈추고 싶으면
> "여기까지만 하고 내일 이어서 하자. 핸드오버 문서 업데이트해줘"

---

## 9. 참고: Codex plan review에서 잡은 핵심 finding

이 계획은 **Codex가 두 번의 plan review로 검증**한 내용입니다.

### 1차 plan review에서 발견 (4가지 승인 조건)
1. ✅ PyMuPDF 경로 순차화 → Phase B에서 figure는 메인 스레드 유지로 해결
2. ✅ Gemini 재시도/timeout → Phase A에서 http_options + exponential backoff
3. ✅ 진행률 emit 메인 스레드 집계 → Phase B에서 워커는 stderr 안 씀
4. ✅ pytest 대신 unittest 유지 → 기존 패턴(test_hwp_connection.py, test_embed_imports.py) 따름

### 2차 plan review에서 추가 발견 (3가지 핵심 보정)
1. ✅ `http_options.timeout` 표현 정확화 (`generate_content(timeout=...)`은 잘못)
2. ✅ Client 캐싱에 close/eviction 정책 명시
3. ✅ `VisionClient` 반환형을 `str`이 아닌 `VisionResult` dataclass로

### 2차 plan review에서 분리 권고
> "SDK 마이그레이션 + retry/timeout + 패키징 먼저, 병렬화 + flag + 측정은 다음"

→ 이것이 Phase A/B 분리의 근거.

---

## 10. 관련 문서 / 메모리

- `doc/CLAUDE_CODEX_교차검토_파이프라인.md` — Codex 워크플로우
- `codex_plan.txt` — 통합 plan (Phase A+B 합쳤던 옛 버전. 분리 전 자료)
- 메모리: `project_v2_auto_update.md` — v2.2.0 자동 업데이트 + 릴리즈 노트 모달
- 메모리: `project_test_infra_setup.md` — 자동 테스트 인프라 deferred (JS 사이드)
- 메모리: `project_gemini_modernize.md` — **이 작업의 메모리 entry (신규, 본 문서로 연결)**

---

## 11. 핵심 파일 위치 빠른 참조

```
python/
├── main.py                          ← 자동 설치 패키지 목록 (29번 줄)
├── od/
│   ├── analyzer.py                  ← Phase B 메인 변경 대상 (convert_regions, 137번 줄)
│   ├── gemini_vision.py             ← Phase A 메인 변경 대상 (call_gemini_vision, 121번 줄)
│   ├── vision_client.py             ← Phase A 신규 파일
│   ├── detector.py                  ← 변경 없음
│   └── pdf_image_extractor.py       ← 변경 없음
├── tests/
│   ├── test_embed_imports.py        ← Phase A에서 google.genai import 테스트 추가
│   ├── test_hwp_connection.py       ← 변경 없음
│   ├── test_prompt_coverage.py      ← 변경 없음
│   ├── test_gemini_vision.py        ← Phase A 신규 (11개 unittest)
│   └── test_analyzer_parallel.py    ← Phase B 신규 (12개 unittest)
└── requirements.txt                 ← Phase A에서 google-genai>=0.8 추가

doc/
├── plans/
│   ├── v2.1_OD_Review_Step.md
│   └── gemini-modernize-handover.md ← 이 문서
└── perf/
    └── gemini-parallel-baseline.md  ← Phase B 신규
```

---

## 12. 끝나면 결과

| 효과 | 값 |
|---|---|
| 사용자 체감 시간 (5영역 캡처) | 15~40초 → **5~15초** (약 3배 단축) |
| 기술부채 (EOL SDK) | ✅ 해소 |
| Thread safety 위험 | ✅ 해소 (PyMuPDF 메인 유지 + 새 SDK + 인터페이스 분리) |
| 향후 사내 게이트웨이 마이그레이션 부담 | 대폭 감소 (VisionClient 인터페이스 덕) |
| Python 사이드 자동 테스트 | 29개 → **52개** (이전 phase F3 부분 해소) |
| 운영 비용 | 변화 없음 (서버 인프라 도입 없음) |
| 사용자 추가 설치 부담 | 변화 없음 (EXE 그대로) |
