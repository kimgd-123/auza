/**
 * KaTeX AST 노드 핸들러 (Paser_Exam_pj 포팅)
 */

import { SYMBOL_MAP, isOperator } from './symbol-map'

const UNICODE_TO_HWP: Record<string, string> = {
  '≠': 'neq', '≤': 'leq', '≥': 'geq', '≪': 'll', '≫': 'gg',
  '≈': 'approx', '≡': 'equiv', '∼': 'sim', '≅': 'cong', '∝': 'propto',
  '⊂': 'subset', '⊃': 'supset', '⊆': 'subseteq', '⊇': 'supseteq',
  '∈': 'in', '∋': 'ni', '∉': 'notin', '⊥': 'perp', '∥': 'parallel',
  '∅': 'emptyset', '∞': 'inf', '∀': 'forall', '∃': 'exists',
  '∠': 'angle', '△': 'triangle', '∴': 'therefore', '∵': 'because',
}

export interface KaTeXNode {
  type: string
  mode?: string
  text?: string
  name?: string
  body?: KaTeXNode | KaTeXNode[]
  base?: KaTeXNode
  sup?: KaTeXNode
  sub?: KaTeXNode
  numer?: KaTeXNode
  denom?: KaTeXNode
  index?: KaTeXNode
  left?: string
  right?: string
  leftDelim?: string
  rightDelim?: string
  delim?: string
  size?: number
  value?: string | KaTeXNode[]
  args?: KaTeXNode[]
  limits?: boolean
  envName?: string
}

export type NodeHandler = (node: KaTeXNode, serialize: (node: KaTeXNode | KaTeXNode[]) => string) => string

export const NODE_HANDLERS: Record<string, NodeHandler> = {
  mathord: (node) => {
    const text = node.text || ''
    if (text.startsWith('\\') && SYMBOL_MAP[text]) {
      const sym = SYMBOL_MAP[text]
      if (/^[a-zA-Z]/.test(sym)) return ` ${sym} `
      return sym
    }
    return text
  },

  textord: (node) => {
    const text = node.text || ''
    if (text.startsWith('\\') && SYMBOL_MAP[text]) {
      const sym = SYMBOL_MAP[text]
      if (/^[a-zA-Z]/.test(sym)) return ` ${sym} `
      return sym
    }
    if (UNICODE_TO_HWP[text]) return UNICODE_TO_HWP[text]
    return text
  },

  atom: (node) => {
    const text = node.text || ''
    const family = (node as { family?: string }).family

    if (family === 'bin') {
      if (SYMBOL_MAP[text]) return ' ' + SYMBOL_MAP[text] + ' '
      if (text === '×') return ' times '
      if (text === '÷') return ' div '
      if (text === '·') return ' cdot '
      return ' ' + text + ' '
    }
    if (family === 'rel') {
      if (SYMBOL_MAP[text]) return ' ' + SYMBOL_MAP[text] + ' '
      if (text === '→') return ' rarrow '
      if (text === '←') return ' larrow '
      if (text === '↔') return ' lrarrow '
      if (text === '⇒') return ' drarrow '
      if (text === '⇐') return ' dlarrow '
      if (text === '⇔') return ' dlrarrow '
      if (text === '≤') return ' leq '
      if (text === '≥') return ' geq '
      if (text === '≠') return ' neq '
      if (text === '=') return ' = '
      if (text === '<') return ' < '
      if (text === '>') return ' > '
      return ' ' + text + ' '
    }
    if (family === 'open') {
      if (text === '\\{' || text === '\\lbrace') return 'lbrace '
      if (SYMBOL_MAP[text]) return SYMBOL_MAP[text]
      return text
    }
    if (family === 'close') {
      if (text === '\\}' || text === '\\rbrace') return ' rbrace'
      if (SYMBOL_MAP[text]) return SYMBOL_MAP[text]
      return text
    }
    if (SYMBOL_MAP[text]) return SYMBOL_MAP[text]
    return text
  },

  text: (node) => {
    const body = node.body
    if (Array.isArray(body)) return body.map((n) => n.text || '').join('')
    return ''
  },

  op: (node) => {
    const name = node.name || ''
    if (SYMBOL_MAP[name]) return SYMBOL_MAP[name] + ' '
    return name.replace(/^\\/, '') + ' '
  },

  bin: (node) => {
    const text = node.text || ''
    if (SYMBOL_MAP[text]) return ' ' + SYMBOL_MAP[text] + ' '
    if (text === '×') return ' times '
    if (text === '÷') return ' div '
    if (text === '·') return ' cdot '
    return ' ' + text + ' '
  },

  rel: (node) => {
    const text = node.text || ''
    if (SYMBOL_MAP[text]) return ' ' + SYMBOL_MAP[text] + ' '
    if (text === '→') return ' rarrow '
    if (text === '←') return ' larrow '
    if (text === '↔') return ' lrarrow '
    if (text === '⇒') return ' drarrow '
    if (text === '⇐') return ' dlarrow '
    if (text === '⇔') return ' dlrarrow '
    return ' ' + text + ' '
  },

  operatorname: (node) => {
    // KaTeX operatorname 타입 (limsup, liminf 등)
    const body = node.body
    if (Array.isArray(body)) {
      const name = body.map((n) => n.text || '').join('')
      if (SYMBOL_MAP[`\\${name}`]) return SYMBOL_MAP[`\\${name}`] + ' '
      return name + ' '
    }
    return ''
  },

  supsub: (node, serialize) => {
    let base = node.base ? serialize(node.base) : ''
    const baseName = node.base?.name || ''
    // \lim, \max, \min, \limsup, \liminf 등도 from{}/to{} 형식 사용 (PRD §4.3.3)
    // KaTeX는 \limsup/\liminf를 operatorname 타입으로 파싱하므로 둘 다 체크
    const baseType = node.base?.type || ''
    const isLimits = (baseType === 'op' || baseType === 'operatorname') &&
      (node.base?.limits || isOperator(baseName) || _isOperatornameLimit(node.base))

    if (isLimits) {
      if (node.sub) base += ` from{${serialize(node.sub)}}`
      if (node.sup) base += ` to{${serialize(node.sup)}}`
    } else {
      if (node.sub) base += `_{${serialize(node.sub)}}`
      if (node.sup) base += `^{${serialize(node.sup)}}`
    }
    return base
  },

  genfrac: (node, serialize) => {
    const numer = node.numer ? serialize(node.numer) : ''
    const denom = node.denom ? serialize(node.denom) : ''
    const numerStr = `{${numer}}`
    const denomStr = `{${denom}}`
    if (node.leftDelim === '(' && node.rightDelim === ')') return `(${numerStr}over${denomStr})`
    if (node.leftDelim === '[' && node.rightDelim === ']') return `[${numerStr}over${denomStr}]`
    return `${numerStr}over${denomStr}`
  },

  sqrt: (node, serialize) => {
    const body = node.body ? serialize(node.body) : ''
    if (node.index) {
      const index = serialize(node.index)
      return `root{${index}} of {${body}}`
    }
    return `sqrt{${body}}`
  },

  leftright: (node, serialize) => {
    const bodyArr = Array.isArray(node.body) ? node.body : []
    if (bodyArr.length === 1 && bodyArr[0].type === 'array') {
      const arrayNode = bodyArr[0]
      const leftDelim = node.left || ''
      const rightDelim = node.right || ''
      let hwpEnv = 'matrix'
      if (leftDelim === '\\{' && (rightDelim === '.' || rightDelim === '\\}')) hwpEnv = 'cases'
      else if (leftDelim === '(') hwpEnv = 'pmatrix'
      else if (leftDelim === '[') hwpEnv = 'bmatrix'
      else if (leftDelim === '|' || leftDelim === '\\|') hwpEnv = 'dmatrix'
      arrayNode.envName = hwpEnv
      return serialize(bodyArr)
    }

    const body = node.body ? serialize(node.body) : ''
    const leftMap: Record<string, string> = {
      '(': '(', '[': '[', '\\{': 'lbrace ', '|': '|', '\\|': '||', '.': '', '\\langle': 'langle ',
    }
    const rightMap: Record<string, string> = {
      ')': ')', ']': ']', '\\}': ' rbrace', '|': '|', '\\|': '||', '.': '', '\\rangle': ' rangle',
    }
    const left = node.left ? (leftMap[node.left] ?? '(') : ''
    const right = node.right ? (rightMap[node.right] ?? ')') : ''
    return `${left}${body}${right}`
  },

  open: (node) => {
    const text = node.text || '('
    const map: Record<string, string> = { '(': '(', '[': '[', '\\{': 'lbrace ', '|': '|' }
    return map[text] ?? text
  },

  close: (node) => {
    const text = node.text || ')'
    const map: Record<string, string> = { ')': ')', ']': ']', '\\}': ' rbrace', '|': '|' }
    return map[text] ?? text
  },

  array: (node, serialize) => {
    const body = node.body
    if (!Array.isArray(body)) return ''
    const rows = body
      .map((row) => Array.isArray(row) ? row.map((cell) => serialize(cell)).join(' & ') : serialize(row))
      .join(' # ')
    const hwpEnvMap: Record<string, string> = {
      pmatrix: 'pmatrix', bmatrix: 'bmatrix', vmatrix: 'dmatrix', Vmatrix: 'dmatrix',
      cases: 'cases', matrix: 'matrix', Bmatrix: 'matrix',
    }
    const envName = node.envName || 'matrix'
    const hwpEnv = hwpEnvMap[envName] || 'matrix'
    return `${hwpEnv}{${rows}}`
  },

  accent: (node, serialize) => {
    const base = node.base ? serialize(node.base) : ''
    const label = node.text || node.name || ''
    const accentMap: Record<string, string> = {
      '\\hat': `hat{${base}}`, '\\check': `check{${base}}`, '\\tilde': `tilde{${base}}`,
      '\\bar': `bar{${base}}`, '\\vec': `vec{${base}}`, '\\dot': `dot{${base}}`,
      '\\ddot': `ddot{${base}}`, '\\acute': `acute{${base}}`, '\\grave': `grave{${base}}`,
      '\\breve': `breve{${base}}`, '\\widehat': `widehat{${base}}`, '\\widetilde': `widetilde{${base}}`,
    }
    return accentMap[label] || base
  },

  overline: (node, serialize) => {
    const body = node.body ? serialize(node.body) : ''
    return `overline{${body}}`
  },

  underline: (node, serialize) => {
    const body = node.body ? serialize(node.body) : ''
    return `underline{${body}}`
  },

  spacing: () => ' ',

  ordgroup: (node, serialize) => {
    const body = node.body
    if (Array.isArray(body)) return body.map((n) => serialize(n)).join('')
    return ''
  },

  color: (node, serialize) => {
    const body = node.body
    if (Array.isArray(body)) return body.map((n) => serialize(n)).join('')
    return ''
  },

  punct: (node) => node.text || '',
  inner: (node) => node.text || '',

  sizing: (node, serialize) => {
    const body = node.body
    if (Array.isArray(body)) return body.map((n) => serialize(n)).join('')
    return ''
  },

  styling: (node, serialize) => {
    const body = node.body
    if (Array.isArray(body)) return body.map((n) => serialize(n)).join('')
    return ''
  },

  phantom: () => '',

  htmlmathml: (node, serialize) => {
    const mathml = (node as { mathml?: KaTeXNode[] }).mathml
    if (Array.isArray(mathml)) return mathml.map((n) => serialize(n)).join('')
    return ''
  },

  mclass: (node, serialize) => {
    const body = node.body
    if (Array.isArray(body)) {
      const mclass = (node as { mclass?: string }).mclass
      const inner = body.map((n) => serialize(n)).join('')
      if (mclass === 'mrel' || mclass === 'mbin') return ' ' + inner + ' '
      return inner
    }
    return ''
  },

  lap: () => '',
  html: () => '',
  rule: () => '',
  kern: () => '',

  macro: (node, serialize) => {
    if (node.body) return serialize(node.body)
    return ''
  },
}

// operatorname 노드에서 이름을 추출하여 limits 연산자인지 확인
function _isOperatornameLimit(node: KaTeXNode | undefined): boolean {
  if (!node || node.type !== 'operatorname') return false
  const body = node.body
  if (!Array.isArray(body)) return false
  const name = '\\' + body.map((n) => n.text || '').join('')
  return isOperator(name)
}

export function getNodeHandler(type: string): NodeHandler | undefined {
  return NODE_HANDLERS[type]
}
