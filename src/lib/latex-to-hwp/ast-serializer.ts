/**
 * KaTeX AST → HWP 수식 스크립트 직렬화 (Paser_Exam_pj 포팅)
 */

import katex from 'katex'
import { getNodeHandler, type KaTeXNode } from './node-handlers'

export interface SerializeResult {
  success: boolean
  hwpScript?: string
  errorReason?: string
}

export function latexToHwpScript(latex: string): SerializeResult {
  try {
    // @ts-expect-error __parse는 KaTeX 내부 API
    const parseTree = katex.__parse(latex, { throwOnError: true, strict: false })
    const hwpScript = serialize(parseTree)
    return { success: true, hwpScript: hwpScript.trim() }
  } catch (error) {
    return { success: false, errorReason: error instanceof Error ? error.message : 'Unknown parse error' }
  }
}

function serialize(node: KaTeXNode | KaTeXNode[]): string {
  if (Array.isArray(node)) return node.map((n) => serialize(n)).join('')
  if (!node || typeof node !== 'object') return ''
  const handler = getNodeHandler(node.type)
  if (handler) return handler(node, serialize)

  if (node.body) return serialize(node.body as KaTeXNode | KaTeXNode[])
  if (node.text) return node.text
  return ''
}

export function isConvertible(latex: string): boolean {
  const unsupportedEnvs = [
    'tikzpicture', 'tikz', 'pgfplots', 'align', 'align*',
    'gather', 'gather*', 'multline', 'split', 'aligned', 'gathered',
  ]
  for (const env of unsupportedEnvs) {
    if (latex.includes(`\\begin{${env}}`)) return false
  }
  const unsupportedCommands = [
    '\\tikz', '\\draw', '\\node', '\\path', '\\pgfmathparse',
    '\\newcommand', '\\renewcommand', '\\def', '\\let',
  ]
  for (const cmd of unsupportedCommands) {
    if (latex.includes(cmd)) return false
  }
  return true
}

export function normalizeLatex(latex: string): string {
  let normalized = latex.trim()
  // 제어문자는 공백으로 정규화 (KaTeX에서 \n, \t 등은 유효하지 않음)
  normalized = normalized.replace(/[\t\r\n]+/g, ' ')

  // Vision API backslash 누락 패턴
  normalized = normalized.replace(/(?<!\\)\btimes\b/g, '\\times')
  normalized = normalized.replace(/(?<!\\)\bdiv\b/g, '\\div')
  normalized = normalized.replace(/(?<!\\)\boverline\{/g, '\\overline{')
  normalized = normalized.replace(/(?<!\\)\bunderline\{/g, '\\underline{')
  normalized = normalized.replace(/(?<!\\)\bsqrt\{/g, '\\sqrt{')
  normalized = normalized.replace(/(?<!\\)\bfrac\{/g, '\\frac{')

  const greekLetters = [
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
    'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
  ]
  for (const letter of greekLetters) {
    normalized = normalized.replace(new RegExp(`(?<!\\\\)\\b${letter}\\b`, 'g'), `\\${letter}`)
  }

  const functions = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'lim', 'max', 'min']
  for (const func of functions) {
    normalized = normalized.replace(new RegExp(`(?<!\\\\)\\b${func}(?=\\s|\\(|\\{|[0-9a-zA-Z])`, 'g'), `\\${func}`)
  }

  normalized = normalized.replace(/\\(displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/g, '')
  normalized = normalized.replace(/\\left\./g, '')
  normalized = normalized.replace(/\\right\./g, '')
  normalized = normalized.replace(/\s+/g, ' ')

  return normalized
}

export function safeLatexToHwpScript(latex: string): SerializeResult {
  const normalized = normalizeLatex(latex)
  if (!isConvertible(normalized)) {
    return { success: false, errorReason: 'Unsupported LaTeX environment or command' }
  }
  return latexToHwpScript(normalized)
}
