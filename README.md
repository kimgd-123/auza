# AUZA v2.1 — PDF → 한/글(HWP) 자동 변환 도구

**작성자:** 김규동 CP  
**최종 수정일:** 2026-03-31  
**버전:** 2.1

---

## 1. 배경

교과서·참고서 PDF를 편집 가능한 한/글(HWP) 문서로 변환하는 작업은 기존에 수작업으로 진행되어 시간이 많이 소요되었습니다.  
AUZA는 이 과정을 **AI와 자동화 기술로 대폭 단축**하기 위해 개발된 Windows 전용 데스크톱 프로그램입니다.

### 주요 목적
- PDF 문서에서 **텍스트, 표, 수식, 이미지**를 자동으로 인식·추출
- 추출된 내용을 **한/글(HWP) 문서에 자동 입력**
- AI를 활용한 **교육 보조 자료 생성** (쌍둥이 문제, 수업 지도안, 학습 가이드, PPT 등)

---

## 2. 구현 방법

### 전체 흐름

```
PDF 파일 열기
    ↓
[1단계] PDF에서 텍스트·이미지·표 추출 (PyMuPDF)
    ↓
[2단계] AI가 문서 구조 분석 (DocLayout-YOLO + Gemini AI)
    ↓
[3단계] 내장 편집기에서 내용 확인·수정
    ↓
[4단계] 한/글(HWP)에 자동 입력 (한/글 COM 자동화)
```

### 사용된 핵심 기술

| 구분 | 기술 | 역할 |
|------|------|------|
| 화면(UI) | Electron + React | 데스크톱 프로그램 화면 구성 |
| 문서 분석 | DocLayout-YOLO | PDF 페이지에서 텍스트/표/이미지 영역 자동 감지 |
| AI 보조 | Google Gemini API | 표 구조 분석, 수식 인식, 교육자료 생성 |
| PDF 처리 | PyMuPDF | PDF에서 텍스트·좌표·이미지 추출 |
| 한/글 입력 | pyhwpx (COM 자동화) | 한/글 프로그램을 원격 조작하여 내용 자동 입력 |
| 편집기 | TipTap | 프로그램 내 문서 편집 기능 (표, 수식 포함) |
| 수식 표시 | KaTeX | 수학 공식을 화면에 보기 좋게 표시 |

---

## 3. 실행 방법

### 사전 준비
- **운영체제:** Windows 10 또는 11 (64비트)
- **한/글:** 한컴오피스 한/글 2020 이상 설치 필요
- **Gemini API 키:** 첫 실행 시 프로그램에서 입력 안내

### 개발 환경에서 실행

```bash
# 1. 프로젝트 폴더로 이동
cd C:\Users\kaeli\Downloads\auza_pj

# 2. 필요 패키지 설치 (최초 1회)
npm install

# 3. 개발 모드로 실행
npm run dev
```

### 배포용 실행 파일 만들기

```bash
# exe 파일 생성 (release 폴더에 생성됨)
npm run electron:build
```

생성되는 파일:
- `release/AUZA-v2-X.X.X.exe` — 설치 프로그램
- `release/AUZA-v2-X.X.X-portable.exe` — 설치 없이 바로 실행 가능한 버전

### 사용 순서
1. 프로그램 실행 → Gemini API 키 입력 (최초 1회)
2. PDF 파일 열기
3. AI가 자동으로 문서 구조 분석 → 결과 확인·수정
4. 한/글 프로그램 열기 → "HWP 내보내기" 클릭
5. 한/글에 내용이 자동 입력됨

---

## 4. 개발 사양

### 프로그램 구성

| 구분 | 상세 |
|------|------|
| 프론트엔드 | Electron 33 + React 18 + TypeScript 5.7 |
| 빌드 도구 | Vite 6 |
| 스타일링 | Tailwind CSS 3.4 |
| 상태관리 | Zustand 5.0 |
| 패키징 | electron-builder 25 |
| 백엔드 | Python 3.11.9 |

### 주요 폴더 구조

```
auza_pj/
├── electron/          ← 데스크톱 프로그램 핵심 (메인 프로세스)
│   ├── main.ts            프로그램 시작점
│   ├── preload.ts         화면↔백엔드 연결
│   └── python-bridge.ts   Python 연동 관리
├── src/               ← 화면(UI) 코드
│   ├── App.tsx            메인 화면
│   ├── components/        화면 구성요소
│   ├── stores/            상태 관리
│   └── lib/               유틸리티
├── python/            ← 백엔드 (문서 처리·한/글 자동화)
│   ├── main.py            백엔드 시작점
│   ├── writers/           한/글·PPT 자동 입력
│   ├── od/                문서 구조 감지 (AI)
│   ├── parsers/           문서 구조 분석
│   └── utils/             보조 기능
├── doc/               ← 개발 문서
├── sample/            ← 샘플 PDF
└── release/           ← 배포용 exe (빌드 후 생성)
```

### 설정 파일 위치
- **개발용 API 키:** `.env.local` (프로젝트 폴더)
- **사용자 설정:** `%APPDATA%/AUZA-v2/config.json` (자동 생성)
- **작업 복원:** `%APPDATA%/AUZA-v2/session.json` (자동 저장)
