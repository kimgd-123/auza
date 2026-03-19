/**
 * 공통 콘텐츠 정규화기
 *
 * Vision/채팅 모든 경로에서 TipTap 삽입 전에 호출.
 * HTML 정규화 + LaTeX 정규화를 통합.
 */

import { normalizeHtmlForTipTap } from './normalize-html-table'
import { normalizeLatexForKatex } from './latex-normalizer'

/**
 * Gemini 응답 HTML → TipTap 삽입용으로 정규화
 *
 * 1. HTML 테이블 구조 정규화 (TipTap 스키마 호환)
 * 2. LaTeX 수식 정규화 (KaTeX 렌더링 호환)
 */
export function normalizeContentForEditor(html: string): string {
  // 1. HTML 구조 정규화 (테이블, orphan br 등)
  let normalized = normalizeHtmlForTipTap(html)

  // 2. LaTeX 수식 정규화 — $...$, $$...$$ 내부의 LaTeX를 KaTeX 호환으로 변환
  normalized = normalizeLatexInHtml(normalized)

  return normalized
}

/**
 * HTML 내 LaTeX 수식을 정규화
 * normalizeLatexForKatex는 $...$, $$...$$ 포함 전체 텍스트를 받아야 함
 */
function normalizeLatexInHtml(html: string): string {
  // normalizeLatexForKatex는 $...$, $$...$$ 패턴을 자체적으로 찾아 처리
  return normalizeLatexForKatex(html)
}
