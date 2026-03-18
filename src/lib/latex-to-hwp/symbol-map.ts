/**
 * LaTeX → HWP 수식 기호 매핑 (Paser_Exam_pj 포팅)
 */

export const SYMBOL_MAP: Record<string, string> = {
  // 그리스 소문자
  '\\alpha': 'alpha', '\\beta': 'beta', '\\gamma': 'gamma', '\\delta': 'delta',
  '\\epsilon': 'epsilon', '\\varepsilon': 'epsilon', '\\zeta': 'zeta', '\\eta': 'eta',
  '\\theta': 'theta', '\\vartheta': 'theta', '\\iota': 'iota', '\\kappa': 'kappa',
  '\\lambda': 'lambda', '\\mu': 'mu', '\\nu': 'nu', '\\xi': 'xi',
  '\\pi': 'pi', '\\varpi': 'pi', '\\rho': 'rho', '\\varrho': 'rho',
  '\\sigma': 'sigma', '\\varsigma': 'sigma', '\\tau': 'tau', '\\upsilon': 'upsilon',
  '\\phi': 'phi', '\\varphi': 'phi', '\\chi': 'chi', '\\psi': 'psi', '\\omega': 'omega',

  // 그리스 대문자
  '\\Gamma': 'GAMMA', '\\Delta': 'DELTA', '\\Theta': 'THETA', '\\Lambda': 'LAMBDA',
  '\\Xi': 'XI', '\\Pi': 'PI', '\\Sigma': 'SIGMA', '\\Upsilon': 'UPSILON',
  '\\Phi': 'PHI', '\\Psi': 'PSI', '\\Omega': 'OMEGA',

  // 이항 연산자
  '\\times': 'times', '\\div': 'div', '\\cdot': 'cdot', '\\pm': '+-', '\\mp': '-+',
  '\\ast': '*', '\\star': 'star', '\\circ': 'circ', '\\bullet': 'bullet',
  '\\cap': 'cap', '\\cup': 'cup', '\\vee': 'vee', '\\wedge': 'wedge',
  '\\oplus': 'oplus', '\\otimes': 'otimes', '\\odot': 'odot',

  // 관계 연산자
  '\\leq': 'leq', '\\le': 'leq', '\\geq': 'geq', '\\ge': 'geq',
  '\\neq': 'neq', '\\ne': 'neq', '\\equiv': 'equiv', '\\approx': 'approx',
  '\\sim': 'sim', '\\simeq': 'simeq', '\\cong': 'cong', '\\propto': 'propto',
  '\\gt': '>', '\\lt': '<', '\\ll': 'll', '\\gg': 'gg',
  '\\subset': 'subset', '\\supset': 'supset', '\\subseteq': 'subseteq', '\\supseteq': 'supseteq',
  '\\in': 'in', '\\ni': 'ni', '\\notin': 'notin', '\\perp': 'perp', '\\parallel': 'parallel',

  // 화살표
  '\\rightarrow': 'rarrow', '\\to': 'rarrow', '\\leftarrow': 'larrow', '\\gets': 'larrow',
  '\\leftrightarrow': 'lrarrow', '\\Rightarrow': 'drarrow', '\\Leftarrow': 'dlarrow',
  '\\Leftrightarrow': 'dlrarrow', '\\uparrow': 'uparrow', '\\downarrow': 'downarrow',
  '\\updownarrow': 'udarrow', '\\Uparrow': 'duparrow', '\\Downarrow': 'ddownarrow',
  '\\mapsto': 'mapsto', '\\longmapsto': 'mapsto',
  '\\longrightarrow': 'rarrow', '\\longleftarrow': 'larrow',

  // 기타 기호
  '\\infty': 'inf', '\\partial': 'partial', '\\nabla': 'nabla',
  '\\forall': 'forall', '\\exists': 'exists', '\\nexists': 'nexists',
  '\\emptyset': 'emptyset', '\\varnothing': 'emptyset',
  '\\therefore': 'therefore', '\\because': 'because',
  '\\angle': 'angle', '\\triangle': 'triangle', '\\square': 'square', '\\diamond': 'diamond',
  '\\prime': "'", '\\hbar': 'hbar', '\\ell': 'ell',
  '\\Re': 'Re', '\\Im': 'Im', '\\aleph': 'aleph',

  // 삼각함수 및 연산자
  '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\cot': 'cot',
  '\\sec': 'sec', '\\csc': 'csc', '\\arcsin': 'arcsin', '\\arccos': 'arccos', '\\arctan': 'arctan',
  '\\sinh': 'sinh', '\\cosh': 'cosh', '\\tanh': 'tanh',
  '\\log': 'log', '\\ln': 'ln', '\\exp': 'exp', '\\lim': 'lim',
  '\\max': 'max', '\\min': 'min', '\\sup': 'sup', '\\inf': 'inf',
  '\\limsup': 'limsup', '\\liminf': 'liminf',
  '\\det': 'det', '\\dim': 'dim', '\\ker': 'ker', '\\gcd': 'gcd',
  '\\deg': 'deg', '\\arg': 'arg', '\\hom': 'hom',

  // 큰 연산자
  '\\sum': 'sum', '\\prod': 'prod', '\\coprod': 'coprod',
  '\\int': 'int', '\\iint': 'iint', '\\iiint': 'iiint', '\\oint': 'oint',
  '\\bigcap': 'bigcap', '\\bigcup': 'bigcup', '\\bigvee': 'bigvee', '\\bigwedge': 'bigwedge',
  '\\bigoplus': 'bigoplus', '\\bigotimes': 'bigotimes',

  // 점
  '\\ldots': 'ldots', '\\cdots': 'cdots', '\\vdots': 'vdots', '\\ddots': 'ddots', '\\dots': 'ldots',

  // 악센트
  '\\hat': 'hat', '\\check': 'check', '\\tilde': 'tilde', '\\bar': 'bar', '\\vec': 'vec',
  '\\dot': 'dot', '\\ddot': 'ddot', '\\overline': 'overline', '\\underline': 'underline',
  '\\widehat': 'widehat', '\\widetilde': 'widetilde',

  // 괄호/구분자
  '\\{': 'lbrace', '\\}': 'rbrace', '\\lbrace': 'lbrace', '\\rbrace': 'rbrace',
  '\\mid': '|', '\\vert': '|', '\\lvert': '|', '\\rvert': '|',
  '\\|': '||', '\\Vert': '||', '\\lVert': '||', '\\rVert': '||',
  '\\langle': 'langle', '\\rangle': 'rangle',

  // 구두점
  '\\colon': ':', '\\;': ' ', '\\,': '', '\\!': '', '\\quad': '  ', '\\qquad': '    ',
}

export function convertSymbol(latex: string): string | null {
  return SYMBOL_MAP[latex] ?? null
}

export function isOperator(latex: string): boolean {
  return ['\\sum', '\\prod', '\\int', '\\iint', '\\iiint', '\\oint', '\\bigcap', '\\bigcup',
    '\\lim', '\\max', '\\min', '\\sup', '\\inf', '\\limsup', '\\liminf'].includes(latex)
}

export function isTrigFunction(latex: string): boolean {
  return ['\\sin', '\\cos', '\\tan', '\\cot', '\\sec', '\\csc', '\\arcsin', '\\arccos', '\\arctan',
    '\\sinh', '\\cosh', '\\tanh', '\\log', '\\ln', '\\exp'].includes(latex)
}

export const LATEX_TO_HWP_SYMBOLS = SYMBOL_MAP
export function convertLatexSymbol(latex: string): string {
  return SYMBOL_MAP[latex] || latex
}
