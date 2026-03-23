/**
 * Generation IR (중간 표현) + Preset 타입 정의
 *
 * Phase 10에서 Gemini가 schema-validated JSON으로 출력하는 구조.
 * Phase 9B에서는 타입 정의 + 프리셋 스키마만 선행 구현.
 */

// ── Generation IR 공통 아이템 타입 ──

export interface IRTextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  fontSize?: string
}

export interface IRParagraph {
  type: 'paragraph'
  runs: IRTextRun[]
}

export interface IRHeading {
  type: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
}

export interface IRMathBlock {
  type: 'math_block'
  latex: string
}

export interface IRMathInline {
  type: 'math_inline'
  latex: string
}

export interface IRTableCell {
  text: string
  bold?: boolean
  bg_color?: string
  colspan?: number
  rowspan?: number
}

export interface IRTable {
  type: 'table'
  rows: IRTableCell[][]
}

export interface IRImage {
  type: 'image'
  ref: string   // Asset Store ID (e.g. "IMG_001")
  alt?: string
}

export interface IRList {
  type: 'list'
  ordered: boolean
  items: string[]
}

export type IRItem = IRParagraph | IRHeading | IRMathBlock | IRMathInline | IRTable | IRImage | IRList

// ── HWP Generation IR ──

export interface HwpGenerationIR {
  type: 'hwp'
  version: '1.0'
  sections: HwpSection[]
}

export interface HwpSection {
  title: string
  items: IRItem[]
}

// ── Preset 정의 ──

export interface Preset {
  id: string
  name: string
  description: string
  icon: string                    // 이모지 또는 아이콘 식별자
  /** Gemini system prompt에 포함될 생성 지시 */
  systemPrompt: string
  /** Gemini에게 출력 형식을 강제할 JSON schema 설명 */
  outputSchemaDescription: string
  /** 출력 예시 (few-shot) */
  outputExample: string
  /** 기본 사용자 프롬프트 (편집 가능) */
  defaultUserPrompt: string
}
