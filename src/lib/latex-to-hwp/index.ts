/**
 * LaTeX → HWP 수식 변환 (Paser_Exam_pj 포팅)
 */

import { safeLatexToHwpScript, normalizeLatex, isConvertible } from './ast-serializer'
import { SYMBOL_MAP, convertSymbol, isOperator, LATEX_TO_HWP_SYMBOLS, convertLatexSymbol } from './symbol-map'

export interface LatexConversionResult {
  success: boolean
  hwpEquation?: string
  error?: string
}

/**
 * LaTeX 수식을 HWP 수식 형식으로 변환
 */
export function convertLatexToHwp(latex: string): LatexConversionResult {
  try {
    const cleanLatex = latex.trim().replace(/^\$+|\$+$/g, '')
    const result = safeLatexToHwpScript(cleanLatex)

    if (result.success && result.hwpScript) {
      return { success: true, hwpEquation: result.hwpScript }
    }
    return { success: false, error: result.errorReason || 'Conversion failed' }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * HTML에서 LaTeX 수식 추출
 */
export function extractLatexFromHtml(html: string): string[] {
  const matches: string[] = []

  const blockRegex = /\$\$([\s\S]+?)\$\$/g
  let match
  while ((match = blockRegex.exec(html)) !== null) {
    matches.push(match[1])
  }

  const inlineRegex = /\$([^$]+)\$/g
  while ((match = inlineRegex.exec(html)) !== null) {
    const prevChar = html[match.index - 1]
    const nextChar = html[match.index + match[0].length]
    if (prevChar !== '$' && nextChar !== '$') {
      matches.push(match[1])
    }
  }

  return matches
}

export { SYMBOL_MAP, convertSymbol, isOperator, LATEX_TO_HWP_SYMBOLS, convertLatexSymbol }
export { normalizeLatex, isConvertible, safeLatexToHwpScript }
