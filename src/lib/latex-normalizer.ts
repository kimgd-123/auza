/**
 * LaTeX → KaTeX 정규화 유틸리티
 *
 * AI(Gemini)가 출력한 LaTeX를 KaTeX가 렌더링할 수 있도록 정규화합니다.
 * Paser_Exam_pj에서 포팅
 */

interface LatexRule {
  name: string
  pattern: string | RegExp
  replacement: string | ((match: string, ...args: string[]) => string)
}

const LATEX_RULES: LatexRule[] = [
  // HTML 엔티티
  { name: 'html-lt', pattern: /&lt;/g, replacement: '\\lt ' },
  { name: 'html-gt', pattern: /&gt;/g, replacement: '\\gt ' },
  { name: 'html-amp', pattern: /&amp;/g, replacement: '\\&' },

  // 부등호 (수식 내)
  { name: 'raw-lt', pattern: /(?<!\\)(<)/g, replacement: '\\lt ' },
  { name: 'raw-gt', pattern: /(?<!\\)(>)/g, replacement: '\\gt ' },

  // 유니코드 수학 기호
  { name: 'unicode-leq', pattern: /≤/g, replacement: '\\leq ' },
  { name: 'unicode-geq', pattern: /≥/g, replacement: '\\geq ' },
  { name: 'unicode-neq', pattern: /≠/g, replacement: '\\neq ' },
  { name: 'unicode-approx', pattern: /≈/g, replacement: '\\approx ' },
  { name: 'unicode-infty', pattern: /∞/g, replacement: '\\infty ' },
  { name: 'unicode-pm', pattern: /±/g, replacement: '\\pm ' },
  { name: 'unicode-mp', pattern: /∓/g, replacement: '\\mp ' },
  { name: 'unicode-times', pattern: /×/g, replacement: '\\times ' },
  { name: 'unicode-div', pattern: /÷/g, replacement: '\\div ' },
  { name: 'unicode-cdot', pattern: /·/g, replacement: '\\cdot ' },

  // 마이너스 기호 정규화
  { name: 'unicode-minus', pattern: /−/g, replacement: '-' },
  { name: 'fullwidth-minus', pattern: /－/g, replacement: '-' },
  { name: 'en-dash-minus', pattern: /–/g, replacement: '-' },

  // 그리스 문자
  { name: 'greek-alpha', pattern: /α/g, replacement: '\\alpha ' },
  { name: 'greek-beta', pattern: /β/g, replacement: '\\beta ' },
  { name: 'greek-gamma', pattern: /γ/g, replacement: '\\gamma ' },
  { name: 'greek-delta', pattern: /δ/g, replacement: '\\delta ' },
  { name: 'greek-epsilon', pattern: /ε/g, replacement: '\\varepsilon ' },
  { name: 'greek-theta', pattern: /θ/g, replacement: '\\theta ' },
  { name: 'greek-lambda', pattern: /λ/g, replacement: '\\lambda ' },
  { name: 'greek-mu', pattern: /μ/g, replacement: '\\mu ' },
  { name: 'greek-pi', pattern: /π/g, replacement: '\\pi ' },
  { name: 'greek-sigma', pattern: /σ/g, replacement: '\\sigma ' },
  { name: 'greek-phi', pattern: /φ/g, replacement: '\\varphi ' },
  { name: 'greek-omega', pattern: /ω/g, replacement: '\\omega ' },
  { name: 'greek-Delta', pattern: /Δ/g, replacement: '\\Delta ' },
  { name: 'greek-Sigma', pattern: /Σ/g, replacement: '\\Sigma ' },
  { name: 'greek-Omega', pattern: /Ω/g, replacement: '\\Omega ' },

  // 화살표
  { name: 'arrow-right', pattern: /→/g, replacement: '\\rightarrow ' },
  { name: 'arrow-left', pattern: /←/g, replacement: '\\leftarrow ' },
  { name: 'arrow-double-right', pattern: /⇒/g, replacement: '\\Rightarrow ' },
  { name: 'arrow-double-left', pattern: /⇐/g, replacement: '\\Leftarrow ' },
  { name: 'arrow-double-both', pattern: /⇔/g, replacement: '\\Leftrightarrow ' },

  // 집합 기호
  { name: 'set-in', pattern: /∈/g, replacement: '\\in ' },
  { name: 'set-notin', pattern: /∉/g, replacement: '\\notin ' },
  { name: 'set-subset', pattern: /⊂/g, replacement: '\\subset ' },
  { name: 'set-supset', pattern: /⊃/g, replacement: '\\supset ' },
  { name: 'set-cup', pattern: /∪/g, replacement: '\\cup ' },
  { name: 'set-cap', pattern: /∩/g, replacement: '\\cap ' },
  { name: 'set-empty', pattern: /∅/g, replacement: '\\emptyset ' },

  // 기타 수학 기호
  { name: 'sqrt-unicode', pattern: /√/g, replacement: '\\sqrt ' },
  { name: 'cbrt-unicode', pattern: /∛/g, replacement: '\\sqrt[3]' },
  { name: 'fourthrt-unicode', pattern: /∜/g, replacement: '\\sqrt[4]' },
  { name: 'nthrt-superscript-3', pattern: /³√/g, replacement: '\\sqrt[3]' },
  { name: 'nthrt-superscript-4', pattern: /⁴√/g, replacement: '\\sqrt[4]' },
  { name: 'nthrt-superscript-5', pattern: /⁵√/g, replacement: '\\sqrt[5]' },
  { name: 'nthrt-superscript-6', pattern: /⁶√/g, replacement: '\\sqrt[6]' },
  { name: 'nthrt-superscript-7', pattern: /⁷√/g, replacement: '\\sqrt[7]' },
  { name: 'nthrt-superscript-8', pattern: /⁸√/g, replacement: '\\sqrt[8]' },
  { name: 'nthrt-superscript-n', pattern: /ⁿ√/g, replacement: '\\sqrt[n]' },
  { name: 'integral', pattern: /∫/g, replacement: '\\int ' },
  { name: 'partial', pattern: /∂/g, replacement: '\\partial ' },
  { name: 'sum', pattern: /∑/g, replacement: '\\sum ' },
  { name: 'prod', pattern: /∏/g, replacement: '\\prod ' },
  { name: 'forall', pattern: /∀/g, replacement: '\\forall ' },
  { name: 'exists', pattern: /∃/g, replacement: '\\exists ' },
  { name: 'therefore', pattern: /∴/g, replacement: '\\therefore ' },
  { name: 'because', pattern: /∵/g, replacement: '\\because ' },

  // 위첨자/아래첨자 유니코드
  { name: 'superscript-2', pattern: /²/g, replacement: '^{2}' },
  { name: 'superscript-3', pattern: /³/g, replacement: '^{3}' },
  { name: 'superscript-n', pattern: /ⁿ/g, replacement: '^{n}' },
  { name: 'subscript-0', pattern: /₀/g, replacement: '_{0}' },
  { name: 'subscript-1', pattern: /₁/g, replacement: '_{1}' },
  { name: 'subscript-2', pattern: /₂/g, replacement: '_{2}' },
  { name: 'subscript-n', pattern: /ₙ/g, replacement: '_{n}' },
]

function normalizeLatexContent(latex: string): string {
  let result = latex
  for (const rule of LATEX_RULES) {
    if (typeof rule.pattern === 'string') {
      result = result.split(rule.pattern).join(rule.replacement as string)
    } else {
      result = result.replace(rule.pattern, rule.replacement as string)
    }
  }
  return result
}

/**
 * 텍스트 내 모든 LaTeX 수식을 KaTeX 호환 형식으로 정규화
 */
export function normalizeLatexForKatex(text: string): string {
  if (!text || typeof text !== 'string') return text

  // 단일 패스로 블록($$...$$)과 인라인($...$)을 겹침 없이 처리
  // $$...$$를 먼저 매칭하여 인라인과 충돌 방지
  const combined = /\$\$([\s\S]+?)\$\$|\$([^$]+)\$/g
  const result = text.replace(combined, (match, blockContent, inlineContent) => {
    if (blockContent !== undefined) {
      return `$$${normalizeLatexContent(blockContent)}$$`
    }
    return `$${normalizeLatexContent(inlineContent)}$`
  })

  return result
}
