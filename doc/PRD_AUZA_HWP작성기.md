# PRD — AUZA Document Writer

> **버전**: v2.0
> **작성일**: 2026-03-23
> **상태**: Draft (v2.0 방향 전환 반영)

---

## 1. 프로젝트 개요

### 1.1 제품명
**AUZA** — PDF-to-Document 스마트 작성기

### 1.2 한 줄 요약
PDF에서 텍스트를 복사하고, 표/수식은 Gemini Vision으로 구조화하여 재구성한 뒤, 편집 결과를 COM 자동화로 HWP에 작성하고, 캡처한 콘텐츠를 재료로 Gemini AI가 교수학습자료(쌍둥이 문제, 학습지도안, 핵심정리 PPT 등)를 자동 생성하는 Windows 데스크톱 앱

### 1.3 해결하려는 문제
- PDF 문서의 내용을 HWP/PPT 문서로 옮기는 작업이 수동적이고 반복적
- PDF의 표/수식은 단순 복사로 구조가 유지되지 않아 수작업 재구성이 필요
- 복사한 내용을 수정/교정할 때 별도 도구가 필요
- 교수학습자료(학습지, PPT, 지도안 등) 제작 시 기존 콘텐츠를 수동으로 재구성해야 함

### 1.4 핵심 가치
1. **PDF → 에디터 → HWP** 워크플로우를 하나의 앱에서 완결
2. **Gemini Vision**으로 표/수식/복잡 콘텐츠를 AI가 구조화하여 재구성
3. **Gemini AI 채팅**으로 텍스트/표를 즉시 수정·교정 가능
4. **COM 인라인 자동화**로 표 스타일·수식까지 재현하여 HWP 자동 작성
5. **AI 교수학습자료 생성** — 캡처한 블록 콘텐츠 + 샘플 양식을 기반으로 Gemini가 쌍둥이 문제, 핵심정리 PPT, 학습지도안 등 초안을 자동 생성

### 1.5 제품 로드맵

| 단계 | 버전 | 범위 | 설명 |
|------|------|------|------|
| **v1.x** | 1.0.0 ~ 1.0.x | HWP 작성 | 한글 오토메이션 API (COM/OLE) 기반 HWP 자동 작성 |
| **v2.x** | 2.0.0 ~ | AI 교수학습자료 생성 | 블록 콘텐츠 + 양식 기반 Gemini AI 문서 생성, PPT/HWP 자동 작성 |

### 1.6 패키지 분리 전략

> v2.0은 기존 v1.x와 별도 패키지로 개발한다. v1.x의 안정성을 보호하면서 v2.0의 실험적 기능을 독립적으로 진행한다.

| 항목 | v1.x (현재) | v2.0 (Phase 9~) |
|------|------------|-----------------|
| **버전** | 1.0.x | 2.0.0-alpha → 2.0.0 |
| **브랜치** | `main` | `v2-dev` |
| **패키지명** | AUZA | AUZA v2 (또는 AUZA AI) |
| **설치 파일** | `AUZA Setup 1.0.x.exe` | `AUZA-v2 Setup 2.0.0.exe` |
| **무설치 폴더** | `AUZA_v1.0.x_무설치/` | `AUZA-v2_v2.0.0_무설치/` |
| **세션 파일** | `%APPDATA%/AUZA/session.json` | `%APPDATA%/AUZA-v2/session.json` (분리) |
| **롤백** | — | v2.0 실패 시 v1.x로 즉시 복귀 가능 |

**분리 원칙:**
- v2.0 작업은 `v2-dev` 브랜치에서 진행, `main`에는 v1.x 핫픽스만 커밋
- Phase 9A 시작 시 `v2-dev` 브랜치 생성 + `package.json` 버전을 `2.0.0-alpha.0`으로 변경
- 각 Phase 완료 시 alpha 버전 증가 (2.0.0-alpha.1, alpha.2, ...)
- MVP 검증 완료(Phase 10) 후 `2.0.0-beta.0` → 안정화 후 `2.0.0` 정식 릴리즈
- 정식 릴리즈 시 `v2-dev` → `main` 머지

---

## 2. 타겟 사용자

| 구분 | 설명 |
|------|------|
| 1차 | PDF 보고서를 HWP 공문서로 변환해야 하는 공공기관/기업 담당자 |
| 2차 | 논문, 참고자료(PDF)를 HWP 보고서로 재구성하는 대학생/연구자 |
| 3차 | 반복적 문서 작성 업무를 자동화하려는 사무직 종사자 |

---

## 3. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| **프레임워크** | Electron | Chromium + Node.js 데스크톱 앱 |
| **프론트엔드** | React + TypeScript | SPA, 반응형 UI |
| **스타일링** | TailwindCSS | 유틸리티 기반 CSS |
| **리치 에디터** | TipTap (ProseMirror) | 표 편집(셀 병합/스타일), HTML 출력 |
| **PDF 뷰어** | react-pdf (pdf.js) | 앱 내 PDF 렌더링, 텍스트 선택 |
| **AI 채팅** | Google Gemini API | 텍스트/표 수정 채팅 |
| **AI 비전** | Gemini Vision (gemini-2.0-flash) | 영역 캡처 → 텍스트/표/수식 구조 인식 |
| **수식 렌더링** | KaTeX 0.16+ | TipTap 에디터 내 LaTeX 수식 시각 표시 |
| **수식 변환** | latex-to-hwp (Paser_Exam_pj 포팅) | LaTeX → KaTeX AST → HWP 수식 스크립트 |
| **LaTeX 정규화** | latex-normalizer (Paser_Exam_pj 포팅) | Gemini 출력 LaTeX → KaTeX 호환 정규화 |
| **HWP 자동화** | Python + win32com | COM/OLE, Electron에서 child_process로 호출 |
| **PPT 자동화** | Python + win32com | COM/OLE, v2.0 |
| **패키징** | electron-builder | exe 배포 |
| **OS** | Windows 전용 | COM 자동화 필수 |

### 3.1 아키텍처 개요

```
┌─────────────────────────────────────────────┐
│              Electron                        │
│  ┌────────────────────────────────────────┐  │
│  │  Renderer (React + TailwindCSS)        │  │
│  │  ├─ PDF 뷰어 (react-pdf)              │  │
│  │  ├─ 에디터 블록 (TipTap)              │  │
│  │  └─ Gemini 채팅 UI                    │  │
│  └──────────────┬─────────────────────────┘  │
│                 │ IPC                        │
│  ┌──────────────▼─────────────────────────┐  │
│  │  Main Process (Node.js)                │  │
│  │  ├─ Gemini API 호출                    │  │
│  │  ├─ 설정 관리 (config.json)            │  │
│  │  └─ Python child_process 관리          │  │
│  └──────────────┬─────────────────────────┘  │
│                 │ child_process / stdin-out   │
│  ┌──────────────▼─────────────────────────┐  │
│  │  Python Backend (COM 자동화)           │  │
│  │  ├─ hwp_writer.py (v1.0)              │  │
│  │  └─ ppt_writer.py (v2.0)             │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 3.2 한글 오토메이션 API 참조 문서
- `ActionTable.pdf` — 액션 테이블
- `HwpAutomation.pdf` — 핵심 API
- `ParameterSetTable.pdf` — 파라미터 설정
- `한글오토메이션EventHandler추가.pdf` — 이벤트 핸들러
- 로컬 참조 경로: `C:\Users\kaeli\Downloads\docling_pj\HANCOM개발가이드문서\`

### 3.3 HWP COM 주요 활용 영역
| 기능 | COM 메서드/액션 |
|------|----------------|
| HWP 인스턴스 연결 | `win32com.client.GetActiveObject("HWPFrame.HwpObject")` |
| HWP 프로그램 실행 | `win32com.client.Dispatch("HWPFrame.HwpObject")` |
| 커서 위치 확인 | `hwp.GetPos()` — 현재 캐럿 위치 반환 |
| 문서 끝 이동 | `hwp.HAction.Run("MoveDocEnd")` |
| 텍스트 삽입 | `hwp.HAction.Run("InsertText")` + ParameterSet |
| 표 생성 | `hwp.HAction.Run("TableCreate")` + ParameterSet |
| 셀 이동/선택 | `hwp.HAction.Run("TableCellBlock")`, `TableMoveCell` |
| 셀 병합 | `hwp.HAction.Run("TableCellBlockExtend")` + `MergeTableCells` |
| 테두리 설정 | `hwp.HAction.Run("TableCellBorderFill")` + ParameterSet |
| 문서 저장 | `hwp.HAction.Run("FileSaveAs_S")` |
| 보안 모듈 | `hwp.RegisterModule("FilePathCheckerModule", dll_path)` |

---

## 4. 기능 명세

### 4.1 앱 레이아웃 (반응형)

```
+------------------------------------------------------------------+
|  [메뉴바] 파일 | 설정 | 도움말                                    |
+------------------------------------------------------------------+
|              |                              |                     |
|   PDF 뷰어   |      에디터 블록 영역          |  Gemini 채팅 패널   |
|   (왼쪽)     |        (중앙)                 |  (오른쪽, 접기 가능) |
|              |  +------------------------+  |                     |
|  [PDF 불러오기]|  | 에디터 블록 #1          |  |  [채팅 입력]        |
|              |  | [TipTap 리치 에디터]     |  |  [채팅 히스토리]    |
|              |  | [삭제]                  |  |  [에디터에 적용]    |
|              |  +------------------------+  |                     |
|              |  | 에디터 블록 #2          |  |                     |
|              |  | [TipTap 리치 에디터]     |  |                     |
|              |  | [삭제]                  |  |                     |
|              |  +------------------------+  |                     |
|              |  [+ 블록 추가]               |                     |
|              |                              |                     |
+------------------------------------------------------------------+
|  [전체 HWP 작성]  |  HWP 연결 상태 | 블록 수 | Gemini 상태        |
+------------------------------------------------------------------+
```

- 3패널 구조 (PDF, 에디터, 채팅)
- **Windows Snap 스타일 레이아웃 피커**: 메뉴바에서 6가지 레이아웃 프리셋 선택
  - `pdf-editor`: PDF + 에디터 (2분할, 채팅 없음)
  - `editor-chat`: 에디터 + 채팅 (2분할, PDF 없음)
  - `pdf-stack`: PDF + 에디터/채팅 상하 (좌: PDF 전체, 우: 에디터+채팅 상하 분할)
  - `three-equal`: 3분할 균등
  - `pdf-focus`: PDF 중심 (PDF 넓게 + 에디터 + 채팅)
  - `editor-focus`: 에디터 중심 (PDF + 에디터 넓게 + 채팅)
- CSS Grid 기반 레이아웃, 레이아웃 모드별 `gridTemplateColumns`/`gridTemplateRows` 자동 전환
- 반응형: PDF 뷰어는 `ResizeObserver`로 컨테이너 너비 측정 → `react-pdf` Page `width` prop에 전달하여 자동 맞춤
- 레이아웃 피커 UI: 미니어처 그리드 섬네일로 시각적 프리뷰 제공

### 4.2 PDF 뷰어 (좌측 패널)

| 기능 | 설명 |
|------|------|
| PDF 열기 | 파일 다이얼로그로 PDF 선택 후 렌더링 (react-pdf) |
| 페이지 네비게이션 | 이전/다음 페이지, 페이지 번호 입력 이동 |
| 확대/축소 | 줌 인/아웃 지원 |
| 텍스트 선택 & 복사 | PDF 내 텍스트 드래그 선택 → Ctrl+C 복사 |
| **영역 캡처** | 드래그로 영역 선택 → 이미지 캡처 → Gemini Vision으로 구조 인식 (아래 4.3 상세) |

#### 4.2.1 PDF 콘텐츠 입력 방식 (2가지)

| 방식 | 도구 | 대상 | 언제 사용 |
|------|------|------|----------|
| **텍스트 복사** | 선택 도구 (기본) | 단순 텍스트, 단순 목록 | Ctrl+C → 에디터에 Ctrl+V |
| **영역 캡처** | 캡처 도구 (전환) | 수식, 복잡한 표, 이미지+텍스트 혼합, 다단 레이아웃 | 드래그 선택 → Gemini Vision → 에디터에 자동 삽입 |

- PDF 뷰어 상단에 **[선택 도구 | 캡처 도구]** 토글 버튼
- 캡처 도구 선택 시 커서가 십자(+) 모양으로 변경
- 영역 드래그 후 자동으로 Gemini Vision 호출

### 4.3 영역 캡처 → Gemini Vision 인식

#### 4.3.1 동작 흐름

```
캡처 도구로 PDF 영역 드래그 선택
       ↓
선택 영역을 이미지로 캡처 (Canvas API)
       ↓
Gemini Vision API 전송
  프롬프트: "이 영역의 콘텐츠를 분석하여 구조화해주세요.
    - 일반 텍스트 → HTML
    - 표 → HTML <table> (셀 병합, 스타일 포함)
    - 수식 → LaTeX ($...$, $$...$$)
    - 텍스트와 수식이 혼합된 경우 인라인 LaTeX 사용"
       ↓
응답 수신 (HTML + LaTeX 혼합)
       ↓
latex-normalizer → KaTeX 호환 정규화
       ↓
에디터 블록에 삽입
  - 텍스트 → HTML 렌더링
  - 표 → TipTap Table
  - 수식 → KaTeX 렌더링
```

#### 4.3.2 Gemini Vision 인식 대상

| 콘텐츠 유형 | Gemini Vision 출력 | 에디터 표시 | HWP 변환 |
|------------|-------------------|-----------|----------|
| 일반 텍스트 | HTML (`<p>`, `<b>` 등) | TipTap 텍스트 | InsertText |
| 수식 | LaTeX (`$...$`) | KaTeX 렌더링 | EquEdit (HWP 수식 스크립트) |
| 단순 표 | HTML `<table>` | TipTap Table | TableCreate |
| 복잡한 표 (셀 병합 등) | HTML `<table>` + colspan/rowspan | TipTap Table | TableCreate + MergeTableCells |
| 혼합 (텍스트 + 수식) | HTML + 인라인 LaTeX | HTML + KaTeX 인라인 | InsertText + EquEdit 혼합 |
| 다단 레이아웃 | 구조화된 HTML | TipTap 블록 | 순차 삽입 |

#### 4.3.3 수식 지원 범위 (v1 Whitelist + Fallback)

v1의 수식 변환은 **주요 학술 수식**을 우선 지원하며, 미지원 LaTeX 환경은 fallback 처리한다.

**v1 지원 수식 (Whitelist)**:
| 분류 | LaTeX 문법 | HWP 변환 |
|------|-----------|----------|
| 분수 | `\frac{a}{b}` | `{a}over{b}` |
| 루트 | `\sqrt{x}`, `\sqrt[3]{x}` | `sqrt{x}`, `sqrt[3]{x}` |
| 첨자 | `x^2`, `x_i`, `x_i^2` | `x^2`, `x_i`, `x_i^2` |
| 합/적분 | `\sum_{k=1}^{n}`, `\int_a^b` | `sum from{k=1} to{n}`, `int from{a} to{b}` |
| 극한 | `\lim_{x→0}` | `lim from{x→0}` |
| 괄호 | `\left(`, `\right)`, `\{`, `\}` | 대응 HWP 괄호 |
| 기호 | 그리스 문자, 연산자, 화살표 등 (220+ 매핑) | symbol-map.ts 참조 |

**미지원 → Fallback 처리**:
| 미지원 환경 | Fallback |
|------------|----------|
| `align`, `gather`, `cases` | 수식 이미지로 삽입 |
| `tikz`, `pgfplots` | 미지원 안내 |
| 커스텀 매크로 | 미지원 안내 |

> 미지원 수식 감지 시 에디터에 경고 표시: "이 수식은 HWP 자동 변환이 지원되지 않습니다. 이미지로 삽입하거나 수동으로 입력해주세요."

#### 4.3.4 캡처 품질 규칙

| 규칙 | 설명 |
|------|------|
| **캡처 스케일** | 사용자 드래그 좌표를 pdf.js 페이지 좌표로 변환 후, **기본 2.5x** 스케일로 오프스크린 재렌더링하여 캡처. 작은 영역(짧은 변 < 100px)은 3x까지 허용, 결과 이미지 긴 변이 4096px 초과 시 2x로 낮춰 처리 |
| **좌표 변환** | pdf.js `viewport.convertToViewportPoint()` / `convertToPdfPoint()`로 화면↔PDF 좌표 상호 변환 |
| **페이지 단위 제한** | 한 번에 **한 페이지 안에서만** 드래그 허용. 페이지 경계 드래그 시 안내 메시지 |
| **인식 실패 판정** | Vision 응답이 비어 있거나, 정규화기에서 유효한 콘텐츠를 추출하지 못하면 실패로 간주. 예: 표 행/열 구조 불성립, LaTeX 파싱 실패, HTML 파싱 결과 빈 노드. 실패 시 "더 크게 확대해서 다시 캡처해주세요" 안내 + **재시도 버튼** 제공 |
| **스캔 PDF** | 스캔 PDF는 "지원"이 아니라 "캡처 품질에 따라 인식 정확도가 달라질 수 있음"으로 안내 |

> **참고**: docling_pj에서 PyMuPDF 기반 PDF 좌표(pt) → HWP 좌표(hwpunit, pt×100) 변환 및 150 DPI 오프스크린 렌더링 패턴을 검증 완료. AUZA에서는 pdf.js(브라우저)가 동일 역할을 수행하되, Canvas API + 고해상도 스케일로 구현.

#### 4.3.5 캡처 후 사용자 워크플로우
1. 캡처 → Gemini Vision 인식 → 에디터에 자동 삽입
2. (선택) 인식 결과가 부정확하면 → Gemini 채팅에서 "이 수식 수정해줘" 등으로 교정
3. 만족하면 HWP 작성

### 4.4 에디터 블록 (중앙 패널)

| 기능 | 설명 |
|------|------|
| 블록 추가 | "+" 버튼으로 새 에디터 블록 추가 |
| 블록 삭제 | 각 블록의 삭제 버튼으로 제거 (확인 다이얼로그) |
| 블록 순서 변경 | 드래그&드롭으로 순서 재배치 (**앱 내 순서만 변경, 이미 작성된 HWP 내용에는 영향 없음**) |
| TipTap 리치 에디터 | WYSIWYG 편집, 표 편집(셀 병합/분할, 행열 추가/삭제, 배경색), 서식. 테두리 커스텀 UI는 Phase 5(HWP 내보내기)에서 구현 |
| 수식 렌더링 | TipTap + KaTeX 확장, LaTeX 수식을 시각적으로 표시/편집 |
| 붙여넣기 | Ctrl+V로 PDF에서 복사한 텍스트/표를 HTML로 붙여넣기 |
| 캡처 삽입 | 영역 캡처 결과 (HTML + LaTeX)를 자동으로 현재 블록에 삽입 |
| 서식 도구바 | 볼드, 이탤릭, 밑줄, 글꼴 크기, 정렬, 표 삽입/편집, 수식 삽입 |
| 블록별 제목 | 각 블록에 제목 입력란 (HWP 문단 구분용) |

> **중요**: 에디터 블록의 순서를 변경해도 이미 HWP에 작성된 내용은 변경되지 않습니다. 블록 순서 변경은 앱 내 편집 순서만 영향을 미칩니다.

### 4.5 Gemini AI 채팅 (우측 사이드 패널)

| 기능 | 설명 |
|------|------|
| 블록 연동 | 현재 선택된(포커스된) 에디터 블록의 내용을 컨텍스트로 전달 |
| 채팅 히스토리 | 블록별 독립된 채팅 히스토리 유지 |
| 수정 요청 | "이 표에서 3번째 열 삭제해줘", "문장을 공문서 어투로 바꿔줘" 등 |
| 에디터에 적용 | AI 응답 결과를 에디터 블록에 직접 반영하는 버튼 |
| 모델 설정 | Gemini 모델 선택 (기본: gemini-2.0-flash) |
| 패널 접기 | 사이드 패널 토글로 에디터 영역 확장 가능 |

#### 4.5.1 채팅 작업 유형

| 유형 | 설명 | 예시 |
|------|------|------|
| **자유 채팅** | 텍스트 수정, 어투 변환 등 자유형 요청 | "공문서 어투로 바꿔줘", "요약해줘" |
| **구조화 작업** | 표 재구성, 열/행 수정 등 정해진 출력 형식이 있는 작업 | "이 데이터로 표 만들어줘", "3번째 열 삭제" |

- **자유 채팅**: Gemini가 자유형 텍스트/HTML을 반환
- **구조화 작업**: Gemini가 **JSON 구조**를 반환 → 앱이 검증 후 HTML 표로 변환 → TipTap에 삽입

#### 4.5.2 구조화 작업 — Gemini 출력 계약 (Output Contract)

표 생성/수정 시 Gemini는 자유형 HTML이 아닌 **JSON 구조**를 반환한다. 이를 통해 검증·정규화 후 TipTap에 안전하게 삽입한다.

**표 생성 JSON 스키마**:
```json
{
  "type": "table",
  "title": "표 제목 (선택)",
  "columns": 4,
  "headerRows": 1,
  "rows": [
    {
      "cells": [
        { "text": "항목", "header": true, "align": "center" },
        { "text": "값", "header": true, "align": "center" },
        { "text": "비고", "header": true, "colspan": 2 }
      ]
    },
    {
      "cells": [
        { "text": "매출", "rowspan": 2 },
        { "text": "120억" },
        { "text": "전년 대비 +15%" },
        { "text": "" }
      ]
    }
  ]
}
```

**허용 셀 속성**:
| 속성 | 타입 | 설명 |
|------|------|------|
| `text` | string | 셀 내용 (필수) |
| `header` | boolean | 헤더 셀 여부 |
| `colspan` | number | 가로 병합 |
| `rowspan` | number | 세로 병합 |
| `align` | "left" \| "center" \| "right" | 텍스트 정렬 |
| `bgColor` | string | 배경색 (예: "#f0f0f0") |

**처리 흐름**:
1. Gemini가 JSON 반환
2. 앱이 스키마 검증 (필수 필드, 행/열 수 일치 등)
3. 검증 실패 시 → 에러 메시지 + "다시 생성" 옵션
4. 검증 성공 → 미리보기 표시
5. 사용자 확인 후 → TipTap HTML 표로 변환하여 에디터에 삽입

> **AI가 생성한 표는 에디터 반영 전 미리보기를 제공하며, 사용자는 내용을 검토한 뒤 적용한다.**

> **구조화 작업의 결과는 항상 "적용 후 전체 표 상태"를 나타내는 JSON 스냅샷으로 반환한다.** "3번째 열 삭제" 같은 수정 요청도 변경 연산 패치가 아닌 전체 표 스냅샷을 반환한다. 부분 연산 패치는 v1 범위에 포함하지 않는다.

### 4.6 HWP 작성 기능

| 기능 | 설명 |
|------|------|
| **전체 HWP 작성 (기본)** | 모든 에디터 블록을 순서대로 현재 열린 HWP 문서에 작성 |
| 커서 위치 확인 | 작성 전 커서가 문서 끝인지 확인 |
| 커서 위치 알럿 | 커서가 문서 끝이 아닌 경우 알럿 표시 (아래 상세) |
| 텍스트 작성 | HTML 텍스트를 HWP 텍스트로 변환하여 삽입 |
| 표 작성 | HTML 테이블 → HWP 표로 변환 (행/열 수, 내용) |
| 표 스타일 재현 | 셀 병합(colspan/rowspan), 테두리, 셀 배경색, 텍스트 정렬 |
| **수식 작성** | LaTeX → KaTeX AST → HWP 수식 스크립트 변환 → EquEdit 삽입 |
| **수식 너비 조정** | 작성 완료 후 수식 너비 자동조정 (선택, fix_equation_width.py) |
| HWP 연결 상태 | 한글 프로그램 실행 여부 및 연결 상태 표시 |

#### 4.6.1 HWP 작성 동작 흐름

```
"전체 HWP 작성" 클릭
       ↓
HWP 프로그램 실행 중인가?
  ├─ NO → "한글을 먼저 실행해주세요" 안내
  └─ YES → 활성 HWP 인스턴스에 연결
              ↓
       커서가 문서 맨 끝인가?
         ├─ YES → 바로 작성 시작 (블록 순서대로 삽입)
         └─ NO → 알럿 표시:
                  "현재 커서가 문서 끝이 아닙니다.
                   현재 커서 위치에 블록 내용이 삽입됩니다.
                   계속하시겠습니까?"
                   [예] → 현재 커서 위치에 삽입
                   [아니오] → 작성 취소
```

#### 4.6.2 블록 순서와 HWP 독립성 원칙
- 에디터 블록의 순서 변경(드래그&드롭)은 **앱 내 편집 순서만** 변경
- 이미 HWP에 작성된 내용은 **절대 변경/재배치하지 않음**
- HWP 작성은 항상 **작성 시점의 블록 순서**를 기준으로 실행
- 블록을 HWP에 작성한 후 순서를 바꿔도 HWP 문서에는 영향 없음

#### 4.6.3 중복 삽입 정책
> "전체 HWP 작성"은 현재 커서 위치에 블록 내용을 **순차적으로 추가 삽입**하며, 기존에 삽입된 내용을 추적하거나 재배치하지 않는다.

- 같은 블록을 여러 번 작성하면 **중복 삽입**된다
- 앱은 이전 작성 내역을 추적하지 않으며, HWP 문서 내 기존 콘텐츠를 수정/삭제하지 않는다
- 이는 의도된 동작이며, 사용자가 HWP에서 직접 불필요한 내용을 정리한다

#### 4.6.4 HWP 연결 정책 (v1)
- **기본 전제**: 사용자가 한글을 미리 열어둔 상태
- **앱 동작**: 실행 중인 HWP 인스턴스에 `GetActiveObject`로 연결 시도
- **연결 실패 시**: "한글을 먼저 실행해주세요" 안내 메시지
- **자동 실행**: v1에서는 지원하지 않음 (후순위)

### 4.6.5 세션 자동 저장 (v1)

| 기능 | 설명 |
|------|------|
| **자동 저장** | 에디터 블록 변경 시 마지막 작업 세션을 `%APPDATA%/AUZA/session.json`에 자동 저장 (ProseMirror JSON) |
| **복구** | 앱 시작 시 세션 파일 존재 → "이전 작업을 복구하시겠습니까?" 다이얼로그 |
| **저장 대상** | 에디터 블록 목록 (ProseMirror JSON), 블록 제목, 블록 순서, 열린 PDF 경로 |
| **제외 대상** | 채팅 히스토리 (v1 제외), 캡처 이미지 원본 (v1 제외) |
| **비정상 종료** | 자동 저장된 세션이 있으면 복구 가능, 완전히 보장하지는 않음 |

> v1은 프로젝트 파일(.auza) 저장/열기를 제공하지 않으며, 마지막 세션 자동 저장만 지원한다. 프로젝트 파일 관리는 v1.1 이후.

### 4.7 설정

| 항목 | 설명 |
|------|------|
| Gemini API 키 | 사용자 API 키 입력 및 저장 (아래 4.8 참조) |
| Gemini 모델 | 사용할 모델 선택 |
| 보안 모듈 | 한글 오토메이션 보안 모듈 DLL 경로 설정 |

> v1은 `GetActiveObject`로 실행 중인 HWP에 연결만 하므로, HWP 경로 설정은 불필요. HWP 자동 실행 기능(v1.1 이후)에서 경로 설정 추가 예정.

### 4.8 Gemini API 키 관리

| 환경 | 방식 | 설명 |
|------|------|------|
| **개발** | `.env.local` 파일 | `GEMINI_API_KEY=...` — git/패키징에서 제외 |
| **exe 배포** | 앱 내 설정 UI | 최초 실행 시 API 키 입력 다이얼로그 표시, `%APPDATA%/AUZA/config.json`에 저장 |

**키 로딩 우선순위**:
1. `.env.local` 파일 (개발 환경)
2. `%APPDATA%/AUZA/config.json` (exe 배포 환경)
3. 둘 다 없으면 → 설정 다이얼로그 자동 표시

**exe 패키징 시 `.env.local` 제외 필수**

---

## 5. 사용자 플로우

### 5.1 기본 플로우 (텍스트 복사)
```
1. 앱 실행
2. PDF 불러오기 (좌측 패널)
3. [선택 도구] PDF에서 텍스트 선택 → Ctrl+C → 에디터 블록에 Ctrl+V
4. (선택) Gemini 채팅으로 내용 수정 → 에디터에 적용
5. 필요시 블록 추가 → 3~4 반복
6. 한글 프로그램에서 문서를 열어둠
7. "전체 HWP 작성" 클릭 → 커서 위치 알럿(필요 시) → 삽입
```

### 5.2 캡처 플로우 (수식/복잡한 표/혼합 콘텐츠)
```
1. PDF 불러오기
2. [캡처 도구] PDF에서 영역 드래그 → Gemini Vision 자동 인식
3. 인식 결과가 에디터 블록에 자동 삽입 (텍스트 + 표 + 수식)
4. (선택) 인식 부정확 시 → Gemini 채팅에서 교정
5. "전체 HWP 작성" 클릭 → 텍스트/표/수식 각각 적절한 방식으로 HWP 삽입
```

---

## 6. 공통 콘텐츠 모델 및 데이터 흐름

### 6.1 원본 데이터 (Source of Truth)

에디터 블록의 원본 데이터는 **ProseMirror JSON** (TipTap 내부 상태)이다.

| 레이어 | 포맷 | 역할 |
|--------|------|------|
| **원본 (저장/복원)** | ProseMirror JSON | 에디터 상태의 유일한 원본, 세션 저장 시 이 데이터를 저장 |
| **뷰 (에디터 표시)** | TipTap 렌더링 | ProseMirror JSON → 시각적 WYSIWYG 편집 |
| **내보내기 (HWP/PPT)** | DocumentStructure | ProseMirror JSON → HTML 직렬화 → html_parser.py → DocumentStructure → Writer |

> HTML은 중간 전송 포맷으로만 사용하며, 원본 데이터로 취급하지 않는다.

### 6.2 공통 정규화기 (Content Normalizer)

Vision 경로와 채팅 경로 모두 에디터에 삽입하기 전 **공통 정규화기**를 통과한다.

```
[Vision 경로]
  Gemini Vision → HTML + LaTeX 혼합
       ↓
  공통 정규화기 ──→ TipTap 호환 ProseMirror 노드로 변환
       ↓
  에디터 블록에 삽입

[채팅 구조화 경로]
  Gemini → JSON 스냅샷
       ↓
  스키마 검증
       ↓
  공통 정규화기 ──→ TipTap 호환 ProseMirror 노드로 변환
       ↓
  에디터 블록에 삽입

[채팅 자유형 경로]
  Gemini → 자유형 HTML/텍스트
       ↓
  공통 정규화기 ──→ TipTap 호환 ProseMirror 노드로 변환
       ↓
  에디터 블록에 삽입
```

정규화기 처리 내용:
- HTML 태그 정리 (허용 태그만 통과, 위험 태그 제거)
- LaTeX 수식 감지 → latex-normalizer → KaTeX 호환 정규화
- 표 구조 검증 (행/열 수 일치, 병합 유효성)
- TipTap이 인식할 수 있는 ProseMirror 노드 구조로 최종 변환

### 6.3 전체 데이터 흐름

```
PDF 파일
   ├─ [선택 도구] 사용자 Ctrl+C 복사
   │    ↓
   │  에디터 블록 (Ctrl+V → 정규화기 통과)
   │
   └─ [캡처 도구] 영역 드래그 → 이미지 캡처
        ↓
     Gemini Vision API
        ↓
     구조화된 응답 (HTML + LaTeX 혼합)
        ↓
     공통 정규화기 (latex-normalizer + 표 검증 + TipTap 변환)
        ↓
     에디터 블록에 삽입
        - 텍스트 → HTML
        - 표 → TipTap Table
        - 수식 → KaTeX 렌더링

에디터 블록 (ProseMirror JSON — 원본 데이터)
   ↓ (선택: Gemini 채팅으로 수정 → 정규화기 통과 후 적용)
ProseMirror JSON → HTML 직렬화
   ↓ (IPC → Python child_process)
html_parser.py → DocumentStructure
   ↓ (Strategy 패턴)
   ├── hwp_writer.py → HWP (커서 위치에 삽입)
   │    ├─ 텍스트 → InsertText
   │    ├─ 표 → TableCreate + 스타일
   │    └─ 수식 → latex-to-hwp 변환 → EquEdit 삽입
   └── ppt_writer.py → PPT (v2.0)
```

---

## 7. HTML → HWP 변환 매핑

| HTML 요소 (TipTap 출력) | HWP 변환 |
|------------------------|----------|
| `<p>`, `<div>` | 문단 삽입 |
| `<b>`, `<strong>` | 글자 굵게 |
| `<i>`, `<em>` | 글자 기울임 |
| `<u>` | 밑줄 |
| `<table>` | HWP 표 생성 (`TableCreate`) |
| `<tr>` | 표 행 |
| `<td>`, `<th>` | 표 셀 (텍스트 삽입) |
| `colspan` | 셀 가로 병합 (`MergeTableCells`) |
| `rowspan` | 셀 세로 병합 (`MergeTableCells`) |
| `border` / `border-color` | 테두리 스타일 (`TableCellBorderFill`) |
| `background-color` | 셀 배경색 |
| `text-align` | 텍스트 정렬 |
| `font-size` | 글자 크기 |
| `$...$` (인라인 LaTeX) | HWP 수식 EquEdit 삽입 (latex-to-hwp 변환) |
| `$$...$$` (블록 LaTeX) | HWP 수식 EquEdit 삽입 (별도 줄) |

---

## 8. v1 비목표 (Non-goals)

| 항목 | 설명 |
|------|------|
| PDF 표 원형 100% 복원 | 임의의 PDF 표를 원본과 동일하게 복원하는 것은 v1 범위가 아님. AI 재구성 결과를 사용자가 검토 후 적용 |
| 복잡한 시각 스타일 완전 재현 | 셀 내부 여백, 미세 선 굵기 차이 등은 보장하지 않음. 구조(병합/정렬/배경색)에 집중 |
| HWP 기존 콘텐츠 추적/수정 | 앱은 HWP에 삽입만 하며, 이전에 삽입한 내용을 추적·수정·삭제하지 않음 |
| HWP 자동 실행 | v1은 사용자가 한글을 미리 열어둔 상태를 전제. 앱에서 HWP 자동 실행은 후순위 |
| 보안/키 암호화 | 현재 내부 직원 사용 목적이므로 API 키 암호화 저장 등은 우선순위에서 제외. 외부 배포 시 재검토 |
| 미지원 LaTeX 환경 | latex-to-hwp가 미지원하는 LaTeX 환경(align, tikz, matrix 등)은 이미지 삽입 fallback 또는 미지원 안내 |
| 프로젝트 저장/복구 | v1은 마지막 세션 자동 저장만 제공. 프로젝트 파일(.auza) 저장/열기는 v1.1 이후 |

---

## 9. 기술 제약 및 전제

| 항목 | 내용 |
|------|------|
| OS | Windows 전용 (HWP/PPT COM 자동화) |
| HWP 설치 필수 | 사용자 PC에 한컴오피스 한글이 설치되어 있어야 함 |
| PPT 설치 필수 (v2.0) | Microsoft PowerPoint 설치 필요 |
| 보안 모듈 | 한글 오토메이션 보안 승인 모듈 등록 필요 |
| Python 내장 | exe에 Python 런타임 번들 (COM 자동화용) |
| Node.js | Electron 내장 |
| Gemini API | 사용자가 직접 API 키 발급 후 입력 |
| 사용 대상 | 내부 직원 (v1). 외부 배포 시 보안 재검토 필요 |

---

## 10. 프로젝트 구조 (최종 목표 트리)

> 아래는 v1.0 완료 시점의 **최종 목표 트리**입니다. Phase별로 점진 생성되며, 현재 워크스페이스에 아직 존재하지 않는 파일이 포함되어 있을 수 있습니다.

```
auza_pj/
├── CLAUDE.md                        # Claude 작업 지침
├── .env.local                       # Gemini API 키 (git/패키징 제외)
├── .gitignore
├── package.json                     # Electron + React 의존성
├── tsconfig.json
├── tailwind.config.js
├── doc/
│   └── PRD_AUZA_HWP작성기.md        # 본 문서
├── electron/                         # Electron Main Process
│   ├── main.ts                      # Electron 엔트리포인트
│   ├── preload.ts                   # preload 스크립트 (IPC 브릿지)
│   └── python-bridge.ts            # Python child_process 관리
├── src/                              # React Renderer
│   ├── App.tsx                      # 루트 컴포넌트
│   ├── main.tsx                     # React 엔트리포인트
│   ├── components/                  # UI 컴포넌트
│   │   ├── layout/
│   │   │   └── MainLayout.tsx       # 3패널 반응형 레이아웃
│   │   ├── pdf/
│   │   │   ├── PdfViewer.tsx        # PDF 뷰어 패널
│   │   │   └── AreaCapture.tsx      # 영역 캡처 도구 (드래그 선택 → 이미지)
│   │   ├── editor/
│   │   │   ├── EditorPanel.tsx      # 에디터 블록 관리 패널
│   │   │   ├── EditorBlock.tsx      # 개별 에디터 블록
│   │   │   ├── RichEditor.tsx       # TipTap 리치 에디터 래퍼
│   │   │   └── EditorToolbar.tsx    # 서식 도구바
│   │   ├── chat/
│   │   │   └── ChatPanel.tsx        # Gemini 채팅 사이드 패널
│   │   └── settings/
│   │       └── SettingsDialog.tsx   # 설정 다이얼로그
│   ├── hooks/                       # 커스텀 훅
│   │   ├── useEditorBlocks.ts       # 에디터 블록 상태 관리
│   │   └── useGeminiChat.ts         # Gemini 채팅 훅
│   ├── stores/                      # 상태 관리
│   │   └── appStore.ts             # Zustand 스토어
│   ├── types/                       # TypeScript 타입
│   │   └── index.ts
│   ├── lib/                         # 유틸리티
│   │   ├── config.ts               # 설정 관리
│   │   ├── constants.ts            # 상수
│   │   ├── latex-normalizer.ts     # LaTeX → KaTeX 정규화 (Paser_Exam_pj 포팅)
│   │   └── latex-to-hwp/           # LaTeX → HWP 수식 변환 (Paser_Exam_pj 포팅)
│   │       ├── index.ts            # 변환 진입점
│   │       ├── ast-serializer.ts   # KaTeX AST → HWP 스크립트
│   │       ├── node-handlers.ts    # AST 노드별 핸들러
│   │       └── symbol-map.ts       # LaTeX → HWP 기호 매핑 (220+항)
│   └── styles/                      # 스타일
├── python/                           # Python COM 백엔드
│   ├── main.py                      # Python 엔트리 (stdin/stdout IPC)
│   ├── writers/                     # 문서 출력 엔진 (Strategy 패턴)
│   │   ├── __init__.py
│   │   ├── base_writer.py          # 추상 클래스 (공통 인터페이스)
│   │   ├── hwp_writer.py           # HWP 오토메이션 (v1.0)
│   │   └── ppt_writer.py           # PPT COM 자동화 (v2.0)
│   ├── parsers/                     # 변환 엔진
│   │   ├── __init__.py
│   │   ├── html_parser.py          # HTML → DocumentStructure
│   │   └── document.py             # 공통 중간 구조 (dataclass)
│   ├── utils/
│   │   └── config.py               # Python 측 설정
│   └── scripts/
│       └── fix_equation_width.py   # HWP 수식 너비 자동조정 (Paser_Exam_pj 포팅)
├── resources/
│   └── icons/                      # 아이콘 리소스
└── electron-builder.yml             # exe 빌드 설정
```

### 10.1 모듈 역할 및 의존 관계

```
┌──────────────────────────────────────────┐
│  React Renderer                          │
│  ├─ PdfViewer (react-pdf)                │
│  ├─ EditorPanel → EditorBlock (TipTap)   │
│  └─ ChatPanel (Gemini)                   │
└──────────────┬───────────────────────────┘
               │ IPC (Electron)
┌──────────────▼───────────────────────────┐
│  Electron Main                           │
│  ├─ Gemini API 호출                      │
│  └─ python-bridge.ts                     │
└──────────────┬───────────────────────────┘
               │ child_process (stdin/stdout JSON)
┌──────────────▼───────────────────────────┐
│  Python Backend                          │
│  ├─ parsers/ → DocumentStructure         │
│  └─ writers/ (Strategy)                  │
│       ├─ hwp_writer → HWP (커서 위치)    │
│       └─ ppt_writer → PPT (v2.0)        │
└──────────────────────────────────────────┘
```

- **Electron ↔ Python 통신**: child_process, stdin/stdout JSON 메시지
- **parsers/**: HTML → `DocumentStructure` (출력 대상에 무관한 공통 구조)
- **writers/**: `DocumentStructure` → HWP/PPT (각 Writer는 `BaseWriter` 상속)
- Writer 추가 = Python 파일 하나 + WriterFactory 등록

---

## 11. 의존성

### Frontend (package.json)

| 패키지 | 용도 |
|--------|------|
| `electron` | 데스크톱 앱 프레임워크 |
| `react`, `react-dom` | UI 프레임워크 |
| `typescript` | 타입 안전성 |
| `tailwindcss` | 스타일링 |
| `@tiptap/react`, `@tiptap/starter-kit` | 리치 에디터 |
| `@tiptap/extension-table` | TipTap 표 확장 |
| `@tiptap/extension-mathematics` | TipTap 수식 확장 (KaTeX 렌더링) |
| `katex` | LaTeX 수식 렌더링 + AST 파싱 |
| `react-pdf` | PDF 뷰어 |
| `@google/generative-ai` | Gemini API + Vision |
| `zustand` | 상태 관리 |
| `electron-builder` | exe 패키징 (dev) |

### Python (requirements.txt)

| 패키지 | 용도 |
|--------|------|
| `pywin32` | COM/OLE 자동화 (win32com) |
| `pyhwpx` | HWP COM 래퍼 (수식 너비 자동조정용) |
| `beautifulsoup4` | HTML 파싱 |

---

## 12. 마일스톤

### v1.0 — HWP 작성기

| Phase | 내용 | 목표 |
|-------|------|------|
| **Phase 1** | 프로젝트 셋업 + 기본 레이아웃 | Electron + React + 3패널 반응형 구조 |
| **Phase 2** | PDF 뷰어 + 에디터 블록 | react-pdf, TipTap 리치 에디터, 블록 추가/삭제/순서변경 |
| **Phase 3** | 영역 캡처 + Gemini Vision | PDF 영역 캡처 도구, Vision API 연동, 텍스트/표/수식 자동 인식 |
| **Phase 4** | 수식 처리 파이프라인 | latex-normalizer, KaTeX 렌더링, latex-to-hwp 변환 (Paser_Exam_pj 포팅) |
| **Phase 5** | Python 백엔드 + HWP 연동 | child_process 브릿지, HWP COM 자동화, 커서 위치 알럿, 수식 EquEdit |
| **Phase 6** | Gemini AI 채팅 연동 | 사이드 패널 채팅, 에디터 반영, API 키 설정 |
| **Phase 7** | 세션 자동 저장 | 마지막 작업 세션 로컬 자동 저장/복구, 비정상 종료 복구 |
| **Phase 8** | 통합 테스트 + exe 패키징 | electron-builder, 전체 플로우 테스트. 체크리스트: `doc/PHASE8_통합테스트_체크리스트.md` |

### v2.0 — AI 기반 교수학습자료 생성

| Phase | 내용 | 목표 |
|-------|------|------|
| **Phase 9A** | 콘텐츠 컨텍스트 엔진 | ProseMirror JSON→MD 직접 변환, 블록 선택, 2계층 컨텍스트, Asset Store |
| **Phase 9B** | 양식 분석 POC | 내장 프리셋 2~3종, PPTX 파일 파싱 POC, HWP Vision 분석 spike |
| **Phase 10** | HWP 생성 MVP | Generation IR/JSON schema, HWP-only 생성, 에디터 미리보기+수정+확정 UX |
| **Phase 11** | PPT 확장 + 통합 | PPT Writer, PPT용 GenerationIR, 템플릿 바인딩, e2e 테스트, exe 재패키징 |

---

## 13. AI 교수학습자료 생성 상세 (v2.0)

### 13.1 핵심 사용자 시나리오

사용자(교사/교육콘텐츠 제작자)는 PDF 시험지·교재에서 블록별로 캡처한 내용(수식, 표, 이미지 포함)을 **재료**로 활용하여, Gemini에게 다양한 교수학습자료의 초안 생성을 요청한다.

**생성 가능 자료 예시:**
- 쌍둥이 문제 (유사 변형 문제)
- 교수학습지도안
- 핵심정리 PPT
- 학습지/워크시트
- 단원 평가 문제

### 13.2 MVP 범위 (최소 기능 제품)

> Codex 리뷰 반영: Phase 9 단독으로는 체감 가치가 약함. MVP는 Phase 10(HWP 생성)까지 도달해야 함.

| 항목 | MVP 범위 | 후속 확장 |
|------|----------|----------|
| **출력 대상** | HWP만 | PPT (Phase 11) |
| **생성 유형** | 쌍둥이 문제 또는 교수학습지도안 1종 | 핵심정리 PPT, 학습지, 자유 입력 등 |
| **템플릿** | 내장 프리셋 2~3종 | 사용자 업로드 + PPTX 파일 파싱 |
| **Flow** | 선택 블록 → 생성 → 에디터 블록 삽입 → 기존 HWP export | 생성 결과 직접 파일 출력 |
| **품질 기준** | 쌍둥이 문제 난이도 유지율, 지도안 항목 충족률 (수동 평가) | 자동화된 acceptance metric |

### 13.3 사용자 Flow

```
1. PDF에서 블록별 캡처 (재료 수집) — v1.0 기구현
2. (MVP) 내장 프리셋에서 생성 유형 선택 / (후속) 샘플 양식 파일 업로드
3. 생성에 사용할 블록 선택 (체크박스)
4. Gemini에게 "선택 블록 MD + 양식 정보 + 생성 지시" 전달
5. Gemini가 Generation IR(JSON) 생성 → 에디터 블록에 미리보기 삽입
6. 사용자가 미리보기 확인/수정 → "HWP 작성" 확정
```

### 13.4 Phase 9A — 콘텐츠 컨텍스트 엔진

#### 13.4.1 ProseMirror JSON → Markdown 직접 변환

> Codex 리뷰: HTML을 거치지 말고 ProseMirror JSON에서 직접 MD 변환. 기존 `prosemirror-to-html.ts`의 node-walk 구조에 sibling serializer 추가.

**구현 파일**: `src/lib/prosemirror-to-md.ts`

| ProseMirror 노드 | MD 변환 | 비고 |
|-----------------|---------|------|
| `paragraph` | 문단 텍스트 + `\n\n` | bold=`**`, italic=`_` |
| `heading` | `#` ~ `###` | 블록 제목은 `##`로 매핑 |
| `table` (단순) | GFM 테이블 `\| A \| B \|` | 셀 병합 없는 경우만 |
| `table` (병합/배경색) | HTML `<table>` 블록 삽입 | GFM은 병합 셀 표현 불가 |
| `math` ($...$, $$...$$) | 그대로 유지 | MD에서 LaTeX 호환 |
| `image` | `[asset:IMG_001] 핵반응 다이어그램` | **base64 금지** — Asset ID 참조 |
| `bulletList` / `orderedList` | `- item` / `1. item` | 표준 Markdown |

> ⚠️ MD는 LLM 입력용 **읽기 전용 뷰**이다. 원본 저장 포맷(ProseMirror JSON)을 교체하지 않는다.

#### 13.4.2 Asset Store

> Codex 리뷰: 이미지 base64를 context에 직접 넣으면 토큰 폭증. Asset ID로 참조해야 함.

```typescript
interface Asset {
  id: string              // "IMG_001", "CAP_003" 등 자동 생성
  type: 'image' | 'capture' | 'template_analysis'
  base64: string          // 실제 데이터 (로컬 저장, LLM에는 전달하지 않음)
  alt: string             // 이미지 설명
  caption?: string        // OCR/Vision으로 추출한 캡션
  sourceBlock: string     // 소속 블록 ID
  sourcePage?: number     // PDF 페이지 번호
}
```

- 캡처 시 이미지 → Asset Store에 자동 등록
- MD 변환 시 `[asset:IMG_001] alt text`로 참조
- Gemini generation 결과에서 `{"type": "image", "ref": "IMG_001"}`로 재사용

#### 13.4.3 2계층 컨텍스트 (토큰 비용 최적화)

> Codex 리뷰: 전체 블록을 매번 보내지 말 것. 선택 블록 + 요약만 전송.

| 계층 | 내용 | 전송 조건 |
|------|------|----------|
| **Summary** (항상 전송) | 각 블록의 1줄 요약 + 포함 요소 태그 | 모든 Gemini 호출 |
| **Full Content** (선택적) | 사용자가 선택한 블록의 전체 MD | 생성 요청 시만 |

```markdown
# 블록 요약 (Summary Layer)
- 블록1: "핵반응 문제 — 핵융합, 수식3개, 이미지1개, 선지5개"
- 블록2: "에너지 보존 — 역학적 에너지, 표1개, 수식2개"
- 블록3: "파동 — 굴절/반사, 이미지2개"

# 선택 블록 상세 (Full Content Layer)
## 블록1: 핵반응 문제
1. 그림은 태양에서 일어나는 핵반응에 대해...
$${}^{1}_{1}H + {}^{1}_{1}H \rightarrow {}^{2}_{1}H$$
[asset:IMG_001] 핵반응 과정 다이어그램
...
```

#### 13.4.4 블록 선택 UI
- 에디터 블록 목록에 체크박스 추가
- 선택된 블록만 Full Content로 전송
- "전체 선택" / "전체 해제" 토글

### 13.5 Phase 9B — 양식 분석 POC

#### 13.5.1 내장 프리셋 (MVP)

| 프리셋 | 설명 | 출력 형태 |
|--------|------|----------|
| **쌍둥이 문제** | 선택 블록의 문제를 변형하여 유사 문제 생성 | HWP 문단 (기존 Writer 활용) |
| **교수학습지도안** | 선택 블록 내용을 지도안 양식으로 구조화 | HWP 표 (단원, 목표, 활동, 평가) |
| **핵심정리** | 선택 블록의 핵심 개념을 요약 정리 | HWP 문단 + 표 |

- 프리셋 = 고정 프롬프트 + JSON schema 정의
- 사용자 업로드 양식은 후속 확장

#### 13.5.2 양식 파일 분석 (후속 확장)

> Codex 리뷰: 하이브리드 방식 — PPTX는 파일 파싱, HWP는 Vision 중심

| 양식 유형 | 분석 방식 | 근거 |
|----------|----------|------|
| **PPTX** | `python-pptx` 파일 파싱 (slide master, placeholder, layout) + Vision 시각 보정 | 구조 데이터 접근 가능 |
| **HWP** | Gemini Vision 이미지 분석 (COM introspection은 복잡) | python-docx 대상 아님 |

- 분석 결과는 JSON 캐시 (1회 분석 후 재사용 → 토큰 절약)

### 13.6 Phase 10 — HWP 생성 MVP

#### 13.6.1 Generation IR (중간 표현)

> Codex 리뷰: 현재 `DocumentStructure`는 HWP에는 맞지만 PPT 레이아웃 개념 부재. 생성 전용 IR이 필요.

**HWP Generation IR** (Phase 10, `DocumentStructure` 재활용):
```json
{
  "type": "hwp",
  "version": "1.0",
  "sections": [
    {
      "title": "단원 핵심 정리",
      "items": [
        {"type": "paragraph", "runs": [{"text": "1. 핵반응이란...", "bold": true}]},
        {"type": "math_block", "latex": "$$\\frac{dm}{dt} = ...$$"},
        {"type": "table", "rows": [
          [{"text": "구분", "bold": true, "bg_color": "#E0E0E0"}, {"text": "핵융합"}, {"text": "핵분열"}],
          [{"text": "조건"}, {"text": "초고온"}, {"text": "중성자 충돌"}]
        ]},
        {"type": "image", "ref": "IMG_001"}
      ]
    }
  ]
}
```

**PPT Generation IR** (Phase 11, 별도 정의):
```json
{
  "type": "ppt",
  "version": "1.0",
  "slides": [
    {
      "title": "핵반응의 종류",
      "layout": "title_content",
      "slots": [
        {"slot": "title", "content": [{"type": "text", "value": "핵반응의 종류"}]},
        {"slot": "body", "content": [
          {"type": "text", "value": "핵융합 반응이란..."},
          {"type": "math", "latex": "$$E = mc^2$$"},
          {"type": "image", "ref": "IMG_001"}
        ]}
      ]
    }
  ]
}
```

#### 13.6.2 생성 프롬프트 계약

```
[System] 당신은 교수학습자료 생성 AI입니다.
[Context - Summary] 블록 요약 (항상 포함)
[Context - Full] 선택 블록 전체 MD (사용자 선택분)
[Template] 프리셋 정의 또는 양식 분석 JSON (캐시)
[Instruction] 사용자 생성 지시
[Schema] 반드시 아래 JSON 스키마로 출력하세요: { ... }
→ schema-validated JSON 출력
```

- LLM drift 방지: 자유형 HTML 대신 **schema-validated JSON** 강제
- 수정 요청: 전체 재생성 대신 `delta instruction + existing IR` 방식 (비용 절감)

#### 13.6.3 Generation IR → HWP Writer 연동

```
Generation IR (JSON)
    ↓ generation_ir_parser.py (신규)
DocumentStructure (기존 공통 중간 구조)
    ↓ hwp_writer.py (기존)
HWP 문서
```

- `generation_ir_parser.py`: Generation IR JSON → `DocumentStructure` 변환
- 기존 `hwp_writer.py` 완전 재활용 (Strategy 패턴 유지)
- Asset Store에서 이미지 base64 조회하여 `ImageData`에 주입

#### 13.6.4 에디터 미리보기 + 수정 + 확정 UX

> Codex 리뷰: 미리보기+수정+재생성은 핵심 UX. 단순 마감이 아닌 Phase 10의 필수 구성요소.

1. Gemini 생성 → Generation IR → **HTML로 변환** → 새 에디터 블록에 삽입
2. 사용자가 에디터에서 내용 확인/수정 (기존 TipTap 편집 기능)
3. 불만족 시 "재생성" 버튼 → delta instruction으로 수정 요청
4. 만족 시 "HWP 작성" → 기존 HWP export 파이프라인 활용

#### 13.6.5 모델 분리 (비용 최적화)

| 용도 | 모델 | 비고 |
|------|------|------|
| 블록 요약 생성 | gemini-2.0-flash (저비용) | Summary Layer 자동 생성 |
| 양식 분석 | gemini-3.1-pro-preview (고성능) | 1회 수행 → JSON 캐시 |
| 자료 생성 | gemini-3.1-pro-preview (고성능) | 핵심 생성 작업 |

### 13.7 Phase 11 — PPT 확장 + 통합

#### 13.7.1 PPT Writer
- `ppt_writer.py`: win32com COM 인라인 방식
- PPT Generation IR → 슬라이드/텍스트/표/이미지 자동 생성
- 수식: KaTeX 렌더링 → 이미지 삽입 (PPT에는 EquEdit 없음)
- `BaseWriter` 인터페이스 확장: `check_cursor_position()`은 HWP 전용이므로 capability-based 인터페이스로 리팩토링

#### 13.7.2 템플릿 바인딩
- PPTX slide master/placeholder 구조에 Generation IR 슬롯 매핑
- 사용자 업로드 PPTX 양식 지원

#### 13.7.3 통합 테스트 + 패키징
- e2e 회귀 테스트 (캡처→생성→HWP/PPT 전체 플로우)
- 사용자 평가셋 테스트 (쌍둥이 문제 품질, 지도안 충족률)
- exe 재패키징

### 13.8 아키텍처 종합

```
ProseMirror JSON (원본)
    ↓ prosemirror-to-md.ts (신규)
블록 MD (2계층: Summary + Full Content)
    + 프리셋/양식 분석 JSON (캐시)
    + 사용자 생성 지시
        ↓ Gemini API (schema-validated JSON 강제)
Generation IR (JSON)
        ↓ generation_ir_parser.py (신규)
DocumentStructure (기존 공통 중간 구조)
        ↓ (Strategy 패턴)
        ├── hwp_writer.py → HWP (Phase 10)
        └── ppt_writer.py → PPT (Phase 11)

Asset Store ← 이미지/캡처 등록 (캡처 시)
           → Generation IR에서 asset_id로 참조
           → Writer에서 실제 base64 주입
```

### 13.9 v2.0 비목표 (Non-goals)
- Gemini가 직접 PPT/HWP 바이너리를 생성하는 것 (COM Writer를 통해 생성)
- 100% 양식 재현 (초안 생성 목적, 사용자가 최종 편집)
- 실시간 협업/공유 기능
- 클라우드 저장/동기화
- MD를 원본 저장 포맷으로 사용 (ProseMirror JSON이 유일한 원본)
- 이미지 base64를 Gemini context에 직접 전달 (Asset ID 참조만)

---

## 14. 개발 운영 및 품질 검증 프로세스

### 14.1 목적

AUZA 프로젝트는 구현 완료와 안정화 완료를 분리하여 관리한다. Claude가 기능 구현을 끝낸 뒤에도, Codex가 PRD/설계/코드/테스트 기준으로 교차검토하고 필요 시 디버깅을 요청한 후 재검증한다.

### 14.2 역할

| 역할 | 책임 |
|------|------|
| **Claude** | 기능 구현, 변경 요약, 테스트 실행, 알려진 한계 정리, Codex 피드백 반영 |
| **Codex** | PRD 대비 구현 정합성 검토, 회귀/누락/버그 탐지, 디버깅 요청 작성, 수정 후 재검증 |

### 14.3 교차검토 수행 시점

- Phase 단위 구현이 끝났을 때
- PDF 캡처, Gemini Vision, 수식 변환, HWP COM 자동화처럼 리스크가 큰 영역을 수정했을 때
- 사용자가 "완료"로 보기 전에 최종 검증이 필요할 때
- Claude가 버그 수정까지 끝냈다고 판단했을 때

### 14.4 표준 흐름

1. Claude가 구현 완료 후 변경 범위, 변경 파일, 실행한 테스트, 남은 리스크를 정리한다
2. Claude가 Codex에게 교차검토를 요청한다
3. Codex가 PRD/설계/코드/테스트 기준으로 결함, 회귀, 누락을 리뷰한다
4. 이슈가 있으면 Codex가 `Debug Request`를 작성한다
5. Claude가 수정 후 `Fix Response` 형식으로 조치 내용을 회신한다
6. Codex가 재검증 후 Finding 종료 여부와 남은 리스크를 판단한다
7. Codex 재검증 이후에만 최종 완료로 간주한다

### 14.5 Claude → Codex 검토 요청 최소 항목

Claude는 교차검토 요청 시 아래 정보를 반드시 포함한다.

- 작업 범위
- 관련 PRD 섹션
- 변경 파일 목록
- 실행한 테스트와 결과
- 아직 못 돌린 테스트
- 확인이 필요한 위험 구간

예시 형식:

```md
## Cross-check Request

- 작업 범위:
- 관련 PRD 섹션:
- 변경 파일:
- 실행한 테스트:
- 아직 못 돌린 테스트:
- 확인이 필요한 위험 구간:
```

### 14.6 Codex 리뷰 결과 형식

Codex는 문제를 찾은 경우 아래 형식으로 정리한다.

```md
## Debug Request

### Finding 1
- 심각도:
- 위치:
- 증상:
- 재현 절차:
- 기대 동작:
- 실제 동작:
- 원인 추정:
- 수정 요청:
```

문제가 없으면 아래처럼 정리한다.

```md
## Cross-check Result

- 주요 결함 없음
- 남은 리스크:
- 테스트 공백:
```

### 14.7 이 프로젝트에서 우선 검토할 품질 항목

- PDF 캡처 좌표 변환과 오프스크린 렌더링 품질
- Vision 결과와 채팅 결과의 공통 정규화기 정합성
- ProseMirror JSON → HTML → DocumentStructure 변환 일관성
- LaTeX Whitelist / Fallback 처리
- HWP COM 연결 실패, 중복 삽입, 예외 전파
- 세션 자동 저장 및 복구 무결성

### 14.8 운영 원칙

- 큰 작업은 최소 Phase 단위로 한 번씩 교차검토한다
- 리뷰는 칭찬보다 결함 탐지와 회귀 방지에 집중한다
- Finding은 반드시 재현 가능하게 작성한다
- 최종 완료 선언은 Codex 재검증 이후에만 가능하다

### 14.9 백그라운드 교차검토 자동화

v1 개발 운영에서는 Claude가 phase 완료 후 교차검토 요청을 수동 프롬프트 전달 방식으로 넘기지 않고, 터미널에서 Codex CLI를 백그라운드 실행하여 리뷰를 시작한다.

기본 흐름:

1. Claude가 phase 완료 후 리뷰 번들을 생성한다
2. `01_CROSS_CHECK_REQUEST.md`를 작성한다
3. `Start-CodexCrossCheckJob.ps1`로 Codex 리뷰를 백그라운드에서 시작한다
4. 리뷰가 진행되는 동안 Claude는 다음 독립 작업 또는 다음 phase 구현을 계속 진행할 수 있다
5. 상태는 `02_CODEX_REVIEW.status.json`에 기록되고, 완료 시 결과는 `02_CODEX_REVIEW.md`에 저장된다
6. Claude는 적절한 체크포인트에서 리뷰 결과를 확인하고, `Debug Request`가 있으면 수정 작업으로 복귀한다
7. 수정 후 `03_FIX_RESPONSE.md`를 작성한다
8. `Start-CodexCrossCheckJob.ps1 -Mode recheck`로 재검증을 백그라운드에서 시작한다
9. 상태는 `04_CODEX_RECHECK.status.json`, 결과는 `04_CODEX_RECHECK.md`에 저장된다
10. 남은 finding이 있으면 Claude가 같은 번들에서 수정 → 재검증을 반복한다
11. 최종 완료 선언 전에는 cross-check/recheck가 모두 끝났는지 확인한다

보조 스크립트:

- `scripts/New-PhaseReviewBundle.ps1`
- `scripts/Start-CodexCrossCheckJob.ps1`
- `scripts/Get-CodexCrossCheckStatus.ps1`
- `scripts/Wait-CodexCrossCheck.ps1`

운영 원칙:

- Claude는 phase 리뷰 시작 직후 사용자에게 번들 경로, 상태 파일 경로, 결과 파일 경로를 전달한다
- 사용자는 프롬프트를 직접 복사해서 Codex에 다시 전달하지 않아도 된다
- 리뷰는 기본적으로 비동기이며, Claude는 리뷰가 도는 동안 독립 작업을 계속 진행할 수 있다
- 완료 보고 전, 배포 전, 또는 이전 phase 결과에 직접 의존하는 다음 phase에 들어가기 전에는 Claude가 반드시 상태와 결과를 확인한다
- CLI 권한 또는 실행 환경 문제로 자동 호출이 막히는 경우에만 사용자 승인 또는 수동 개입을 요청한다

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-03-18 | v1.0 | 초안 작성 |
| 2026-03-18 | v1.1 | PPT 확장 로드맵 추가 (v2.0), Gemini API 키 관리 정책 추가 |
| 2026-03-18 | v1.2 | 기술 스택 전환 (PyQt5 → Electron + React + TipTap), HWP 커서 위치 알럿 추가, 블록 순서-HWP 독립성 원칙 명시, 프로젝트 구조 모듈화 |
| 2026-03-18 | v1.3 | 영역 캡처 + Gemini Vision 인식 추가, 수식 처리 파이프라인 추가 (LaTeX → KaTeX → HWP), Paser_Exam_pj 참조 연동 |
| 2026-03-18 | v1.4 | Codex 분석 반영: 제품 요약 AI 재구성 뉘앙스 보강, Gemini 채팅 자유/구조화 작업 구분, 표 생성 JSON 출력 계약 추가, v1 비목표 명시, HWP 중복삽입/연결 정책 명확화 |
| 2026-03-18 | v1.5 | Codex 2차 분석 반영: 문서 버전/섹션 번호 정리, 공통 콘텐츠 모델(ProseMirror JSON 원본) 정의, 공통 정규화기 도입(Vision/채팅 통합), PDF 캡처 품질 규칙 추가, 표 수정 전체 스냅샷 정책, 수식 Whitelist+Fallback 정의, HWP 경로 설정 제거, 세션 자동 저장 추가 |
| 2026-03-18 | v1.6 | Claude-Codex 교차검토 파이프라인 반영: 구현 완료 후 Cross-check Request, Debug Request, Fix Response, Re-check 기반 품질 검증 절차 추가 |
| 2026-03-18 | v1.7 | Claude-Codex 비동기 교차검토 자동화 반영: phase 완료 시 리뷰 번들 생성, Codex CLI 백그라운드 실행, 상태 파일/결과 파일 기반 검토 파이프라인 추가 |
| 2026-03-18 | v1.8 | Claude-Codex 자동 복귀 루프 반영: Wait 스크립트 추가, 리뷰 완료 후 Claude가 결과 파일을 읽고 수정/재검증 단계로 자동 복귀하도록 운영 절차 보강 |
| 2026-03-18 | v1.9 | Claude-Codex 병렬 운영 반영: Wait 강제 제거, 리뷰는 비동기로 유지하고 완료/배포/의존 phase 진입 전만 결과를 확인하는 조건부 게이트 방식으로 전환 |
| 2026-03-23 | v2.0 | v2.0 방향 전환: PPT 단순 변환 → AI 교수학습자료 생성. Phase 9~11 재정의. 13절 전면 개정 |
| 2026-03-23 | v2.1 | Codex 리뷰 반영: Phase 9→9A/9B 분리, MVP 범위 명확화(HWP-only+1생성유형), Asset Store 도입, 2계층 컨텍스트(Summary+Full), Generation IR 분리(HWP/PPT 별도), schema-validated JSON 강제, 이미지 base64 금지→asset_id 참조, 모델 분리(저비용/고비용), BaseWriter capability-based 리팩토링 예고, 품질 평가 기준 추가 |
| 2026-03-23 | v2.2 | 패키지 분리 전략 추가: v2.0은 별도 브랜치(v2-dev)/패키지로 개발, v1.x 안정성 보호, 버전 체계(2.0.0-alpha→beta→정식), 세션/설치 경로 분리, 롤백 전략 명시 |

---

## 부록: 참조 프로젝트

### Paser_Exam_pj (`C:\Project\Paser_Exam_pj`)

PDF 시험지를 파싱하여 HWP로 변환하는 프로덕션 시스템. **수식 변환 파이프라인이 100% 구현**되어 있으며, AUZA 프로젝트에서 다음 모듈을 포팅하여 재사용한다.

#### 포팅 대상 모듈

| 원본 경로 | AUZA 대상 | 역할 |
|----------|----------|------|
| `web/src/backend/parser/utils/latex-normalizer.ts` | `src/lib/latex-normalizer.ts` | LaTeX → KaTeX 정규화 (50+ 규칙) |
| `web/src/features/hwp-export/utils/converters/latex-to-hwp/` | `src/lib/latex-to-hwp/` | LaTeX → HWP 수식 스크립트 변환 |
| — `index.ts` | — `index.ts` | 변환 진입점 (`convertLatexToHwp`) |
| — `ast-serializer.ts` | — `ast-serializer.ts` | KaTeX AST → HWP 직렬화 |
| — `node-handlers.ts` | — `node-handlers.ts` | AST 노드별 핸들러 |
| — `symbol-map.ts` | — `symbol-map.ts` | 기호 매핑 (220+항) |
| `web/src/lib/katex-renderer.ts` | `src/lib/` (참고) | KaTeX 렌더링 유틸 |
| `web/scripts/fix_equation_width.py` | `python/scripts/fix_equation_width.py` | HWP 수식 너비 자동조정 |

#### 핵심 변환 흐름 (검증 완료)
```
LaTeX → KaTeX.__parse() → AST → serialize() → HWP 수식 스크립트
  예: \frac{a}{b}  →  AST(frac)  →  {a}over{b}
  예: \sqrt[3]{x}  →  AST(sqrt)  →  sqrt[3]{x}
  예: \sum_{k=1}^{n}  →  AST(op+supsub)  →  sum from{k=1} to{n}
```

### docling_pj (`C:\Users\kaeli\Downloads\docling_pj`)

PDF를 파싱하여 JSON 중간 구조로 변환한 뒤 HWP 바이너리를 직접 생성하는 프로젝트. **PDF 좌표 처리, JSON 중간 구조, HWP 좌표 변환**이 검증되어 있으며, AUZA의 캡처 품질/좌표 변환 설계 시 참조.

#### AUZA에서 참조하는 기술 요소

| 기술 | docling_pj 구현 | AUZA 적용 |
|------|----------------|----------|
| **PDF 좌표 체계** | PyMuPDF `get_text("dict")` → 블록/라인별 `bbox(x0,y0,x1,y1)` pt 단위 | pdf.js `viewport.convertToPdfPoint()` 로 동일한 PDF pt 좌표 획득 |
| **좌표 변환** | `pt_to_hwpunit(pt) = round(pt × 100)` (1pt=100hwpunit) | HWP COM 자동화에서 동일 변환 적용 (커서 위치/표 크기 계산) |
| **오프스크린 재렌더링** | PyMuPDF `page.get_pixmap(dpi=150)` → 고해상도 JPEG | pdf.js Canvas API + 2x~3x 스케일로 캡처 영역 재렌더링 |
| **JSON 중간 구조** | `PageLayout(width, height, blocks[PageBlock(bbox, text, lines[])])` Pydantic 모델 | 공통 정규화기의 참고 모델 — TipTap ProseMirror 노드로 변환하는 중간 단계 |
| **텍스트 필터링** | Object-Aware: 본문(kept) vs 비본문(excluded) 분류 규칙 | Vision 인식 결과의 노이즈 필터링 시 참고 (라벨/번호 등 비본문 요소 처리) |
| **수식 감지** | EH 폰트 기반 + Gemini Vision → LaTeX | 동일한 Gemini Vision 파이프라인 활용 |

#### docling_pj JSON 구조 참고

```python
# docling_pj의 PDF → JSON 중간 구조 (Pydantic)
class BBox(BaseModel):
    x0: float; y0: float; x1: float; y1: float  # PDF pt

class TextLine(BaseModel):
    text: str
    bbox: BBox
    font_size_min: float
    font_size_max: float
    font_names: list[str]
    is_bold: bool

class PageBlock(BaseModel):
    page_number: int
    block_id: str
    kind: str          # "text" | "image" | "table"
    bbox: BBox
    text: str
    lines: list[TextLine]

class PageLayout(BaseModel):
    page_number: int
    width: float       # PDF page width (pt)
    height: float
    blocks: list[PageBlock]
```

> **참고 범위**: AUZA는 docling_pj의 코드를 직접 포팅하지 않음. PDF 좌표 변환 로직, 오프스크린 렌더링 패턴, JSON 중간 구조 설계를 **설계 참조**로만 활용.
