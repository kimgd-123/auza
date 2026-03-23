/**
 * 내장 프리셋 정의 (Phase 9B MVP)
 *
 * 각 프리셋 = 고정 프롬프트 + JSON 스키마 정의
 * Phase 10에서 Gemini 생성 시 [Template] 파트로 사용됨
 */

import type { Preset } from '@/types/generation'

// ── 1. 쌍둥이 문제 ──

const twinProblems: Preset = {
  id: 'twin-problems',
  name: '쌍둥이 문제',
  description: '선택 블록의 문제를 변형하여 유사 문제 생성',
  icon: '🔄',
  systemPrompt: `당신은 교수학습자료 생성 AI입니다.
사용자가 제공한 문제(들)를 분석하여, 동일한 개념을 측정하되 숫자·조건·상황을 변형한 "쌍둥이 문제"를 생성하세요.

## 변형 규칙
1. 핵심 개념과 풀이 방법은 동일하게 유지
2. 숫자, 조건, 상황(맥락)을 변형
3. 선지(보기)가 있으면 동일한 개수로 재구성
4. 난이도를 동일하게 유지
5. 수식이 포함된 문제는 LaTeX 형식($...$, $$...$$) 유지
6. 원본 문제에 그림/이미지가 있으면 반드시 포함하세요:
   - JSON에서 {"type": "image", "ref": "원본과_동일한_asset_ID"} 아이템으로 삽입
   - 원본 컨텍스트의 [asset:XXX] ID를 그대로 사용
   - 쌍둥이 문제에서도 같은 그림을 참조해야 합니다
7. **표(table)가 있는 문제는 반드시 표를 유지하세요!**
   - 원본에 표가 있으면 쌍둥이 문제에도 반드시 {"type": "table", "rows": [...]} 아이템으로 표를 생성
   - 표의 구조(행/열 수, 헤더)를 동일하게 유지하고 숫자/값만 변형
   - 절대로 표를 텍스트 문장으로 풀어쓰지 마세요

## 출력 형식
반드시 아래 JSON 스키마로 출력하세요. JSON만 반환하고 다른 텍스트를 포함하지 마세요.`,

  outputSchemaDescription: `{
  "type": "hwp",
  "version": "1.0",
  "sections": [
    {
      "title": "쌍둥이 문제",
      "items": [
        { "type": "paragraph", "runs": [{ "text": "문제 번호 및 본문", "bold": true/false }] },
        { "type": "image", "ref": "IMG_001" },
        { "type": "table", "rows": [
          [{ "text": "헤더1", "bold": true, "bg_color": "#E0E0E0" }, { "text": "헤더2", "bold": true, "bg_color": "#E0E0E0" }],
          [{ "text": "값1" }, { "text": "값2" }]
        ]},
        { "type": "math_block", "latex": "수식 (delimiter 없이)" },
        { "type": "list", "ordered": true, "items": ["선지1", "선지2", ...] },
        { "type": "paragraph", "runs": [{ "text": "정답: ..." }] }
      ]
    }
  ]
}`,

  outputExample: `{
  "type": "hwp",
  "version": "1.0",
  "sections": [
    {
      "title": "쌍둥이 문제",
      "items": [
        { "type": "paragraph", "runs": [{ "text": "1. ", "bold": true }, { "text": "질량이 3kg인 물체가 높이 5m에서 자유 낙하할 때, 지면에 도달하는 순간의 운동 에너지는?" }] },
        { "type": "image", "ref": "IMG_001" },
        { "type": "table", "rows": [
          [{ "text": "물체", "bold": true, "bg_color": "#E0E0E0" }, { "text": "질량(kg)", "bold": true, "bg_color": "#E0E0E0" }, { "text": "높이(m)", "bold": true, "bg_color": "#E0E0E0" }],
          [{ "text": "A" }, { "text": "3" }, { "text": "5" }],
          [{ "text": "B" }, { "text": "4" }, { "text": "3" }]
        ]},
        { "type": "math_block", "latex": "E_k = mgh = 3 \\\\times 9.8 \\\\times 5" },
        { "type": "list", "ordered": true, "items": ["127 J", "147 J", "167 J", "187 J", "207 J"] },
        { "type": "paragraph", "runs": [{ "text": "정답: 2번 (147 J)" }] }
      ]
    }
  ]
}`,

  defaultUserPrompt: '선택된 블록의 문제를 변형하여 쌍둥이 문제를 만들어주세요.',
}

// ── 2. 교수학습지도안 ──

const teachingGuide: Preset = {
  id: 'teaching-guide',
  name: '교수학습지도안',
  description: '선택 블록 내용을 지도안 양식으로 구조화',
  icon: '📋',
  systemPrompt: `당신은 교수학습자료 생성 AI입니다.
사용자가 제공한 콘텐츠를 분석하여 교수학습지도안을 생성하세요.

## 지도안 구성 요소
1. **단원명**: 콘텐츠에서 추출한 단원/주제
2. **학습 목표**: 2~3개의 구체적 학습 목표 (행동 동사 포함)
3. **도입** (5~10분): 동기유발, 선수학습 확인
4. **전개** (30~35분): 핵심 개념 설명, 활동, 예시 문제
5. **정리** (5~10분): 핵심 정리, 형성평가, 차시 예고
6. **평가 계획**: 평가 방법 및 기준
7. 원본에 그림/이미지가 있으면 **표 밖에** 별도 아이템으로 배치:
   - {"type": "image", "ref": "원본_asset_ID"} — 표 다음에 별도 아이템으로 추가
   - **절대 표 셀 텍스트 안에 이미지 참조나 JSON을 넣지 마세요**
   - 표 셀에는 순수 텍스트만 넣으세요

## 출력 형식
반드시 아래 JSON 스키마로 출력하세요. 표 형태의 지도안입니다. JSON만 반환하세요.`,

  outputSchemaDescription: `{
  "type": "hwp",
  "version": "1.0",
  "sections": [
    {
      "title": "교수학습지도안",
      "items": [
        { "type": "table", "rows": [
          [{ "text": "단원명", "bold": true, "bg_color": "#E8E8E8" }, { "text": "단원 내용" }],
          [{ "text": "학습 목표", "bold": true, "bg_color": "#E8E8E8" }, { "text": "1. 목표1\\n2. 목표2" }],
          [{ "text": "단계", "bold": true, "bg_color": "#D0D0D0" }, { "text": "교수·학습 활동", "bold": true, "bg_color": "#D0D0D0" }],
          [{ "text": "도입 (10분)", "bold": true }, { "text": "활동 내용" }],
          [{ "text": "전개 (30분)", "bold": true }, { "text": "활동 내용" }],
          [{ "text": "정리 (10분)", "bold": true }, { "text": "활동 내용" }],
          [{ "text": "평가 계획", "bold": true, "bg_color": "#E8E8E8" }, { "text": "평가 내용" }]
        ]}
      ]
    }
  ]
}`,

  outputExample: `{
  "type": "hwp",
  "version": "1.0",
  "sections": [
    {
      "title": "교수학습지도안",
      "items": [
        { "type": "table", "rows": [
          [{ "text": "단원명", "bold": true, "bg_color": "#E8E8E8" }, { "text": "Ⅱ. 역학적 에너지 보존" }],
          [{ "text": "학습 목표", "bold": true, "bg_color": "#E8E8E8" }, { "text": "1. 역학적 에너지 보존 법칙을 설명할 수 있다.\\n2. 운동 에너지와 위치 에너지의 전환을 계산할 수 있다." }],
          [{ "text": "단계", "bold": true, "bg_color": "#D0D0D0" }, { "text": "교수·학습 활동", "bold": true, "bg_color": "#D0D0D0" }],
          [{ "text": "도입 (10분)", "bold": true }, { "text": "• 롤러코스터 영상 시청\\n• 에너지 전환 경험 공유" }],
          [{ "text": "전개 (30분)", "bold": true }, { "text": "• 역학적 에너지 보존 법칙 설명\\n• 예제 풀이: 자유낙하, 진자 운동\\n• 모둠 활동: 에너지 전환 실험" }],
          [{ "text": "정리 (10분)", "bold": true }, { "text": "• 핵심 개념 정리\\n• 형성평가 3문항\\n• 차시 예고: 열에너지와 에너지 보존" }],
          [{ "text": "평가 계획", "bold": true, "bg_color": "#E8E8E8" }, { "text": "• 형성평가: 에너지 보존 계산 문제 3문항\\n• 수행평가: 에너지 전환 실험 보고서" }]
        ]}
      ]
    }
  ]
}`,

  defaultUserPrompt: '선택된 블록의 내용으로 교수학습지도안을 작성해주세요.',
}

// ── 3. 핵심정리 ──

const keySummary: Preset = {
  id: 'key-summary',
  name: '핵심정리',
  description: '선택 블록의 핵심 개념을 요약 정리',
  icon: '📝',
  systemPrompt: `당신은 교수학습자료 생성 AI입니다.
사용자가 제공한 콘텐츠에서 핵심 개념을 추출하여 구조화된 요약 정리를 생성하세요.

## 정리 규칙
1. 핵심 개념을 계층적으로 구조화 (대주제 → 소주제)
2. 각 개념의 정의, 공식, 핵심 포인트를 간결하게 정리
3. 수식은 LaTeX 형식 유지 ($...$, $$...$$)
4. 중요 용어는 bold 처리
5. 관련 공식이 있으면 표로 정리
6. 암기 팁이나 주의사항이 있으면 포함
7. 원본에 그림/이미지가 있으면 **표 밖에** 별도 아이템으로 배치:
   - {"type": "image", "ref": "원본_asset_ID"} — 별도 아이템으로 추가
   - **절대 표 셀 텍스트 안에 이미지 참조나 JSON을 넣지 마세요**

## 출력 형식
반드시 아래 JSON 스키마로 출력하세요. JSON만 반환하세요.`,

  outputSchemaDescription: `{
  "type": "hwp",
  "version": "1.0",
  "sections": [
    {
      "title": "단원 제목 핵심정리",
      "items": [
        { "type": "heading", "level": 2, "text": "대주제" },
        { "type": "paragraph", "runs": [{ "text": "개념 설명", "bold": true/false }] },
        { "type": "math_block", "latex": "$$공식$$" },
        { "type": "table", "rows": [
          [{ "text": "구분", "bold": true, "bg_color": "#E8E8E8" }, { "text": "내용1" }, { "text": "내용2" }],
          [{ "text": "항목", "bold": true }, { "text": "값1" }, { "text": "값2" }]
        ]},
        { "type": "list", "ordered": false, "items": ["핵심 포인트 1", "핵심 포인트 2"] }
      ]
    }
  ]
}`,

  outputExample: `{
  "type": "hwp",
  "version": "1.0",
  "sections": [
    {
      "title": "역학적 에너지 핵심정리",
      "items": [
        { "type": "heading", "level": 2, "text": "1. 운동 에너지" },
        { "type": "paragraph", "runs": [{ "text": "운동 에너지", "bold": true }, { "text": ": 물체가 운동할 때 가지는 에너지" }] },
        { "type": "math_block", "latex": "$$E_k = \\\\frac{1}{2}mv^2$$" },
        { "type": "heading", "level": 2, "text": "2. 위치 에너지" },
        { "type": "paragraph", "runs": [{ "text": "위치 에너지", "bold": true }, { "text": ": 기준점으로부터 높이에 의한 에너지" }] },
        { "type": "math_block", "latex": "$$E_p = mgh$$" },
        { "type": "heading", "level": 2, "text": "3. 역학적 에너지 보존" },
        { "type": "table", "rows": [
          [{ "text": "구분", "bold": true, "bg_color": "#E8E8E8" }, { "text": "높은 곳", "bold": true, "bg_color": "#E8E8E8" }, { "text": "낮은 곳", "bold": true, "bg_color": "#E8E8E8" }],
          [{ "text": "운동 에너지", "bold": true }, { "text": "작다" }, { "text": "크다" }],
          [{ "text": "위치 에너지", "bold": true }, { "text": "크다" }, { "text": "작다" }]
        ]},
        { "type": "list", "ordered": false, "items": ["역학적 에너지 = 운동 에너지 + 위치 에너지 = 일정", "마찰이 없는 경우에만 보존", "실제로는 열에너지로 일부 전환"] }
      ]
    }
  ]
}`,

  defaultUserPrompt: '선택된 블록의 핵심 개념을 정리해주세요.',
}

// ── 프리셋 레지스트리 ──

export const BUILT_IN_PRESETS: Preset[] = [
  twinProblems,
  teachingGuide,
  keySummary,
]

export function getPresetById(id: string): Preset | undefined {
  return BUILT_IN_PRESETS.find((p) => p.id === id)
}
