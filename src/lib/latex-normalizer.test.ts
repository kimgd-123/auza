import { describe, it, expect } from 'vitest'
import { normalizeLatexForKatex } from './latex-normalizer'

describe('normalizeLatexForKatex', () => {
  it('returns input as-is when no math delimiters present', () => {
    expect(normalizeLatexForKatex('plain text without math')).toBe('plain text without math')
  })

  it('handles empty / non-string input safely', () => {
    expect(normalizeLatexForKatex('')).toBe('')
    expect(normalizeLatexForKatex(null as unknown as string)).toBe(null)
    expect(normalizeLatexForKatex(undefined as unknown as string)).toBe(undefined)
  })

  it('normalizes unicode math symbols inside inline $...$', () => {
    const out = normalizeLatexForKatex('값은 $α ≤ β$ 이다')
    expect(out).toContain('\\alpha')
    expect(out).toContain('\\leq')
    expect(out).toContain('\\beta')
    expect(out.startsWith('값은 $')).toBe(true)
    expect(out.endsWith('$ 이다')).toBe(true)
  })

  it('normalizes block $$...$$ separately from inline', () => {
    const out = normalizeLatexForKatex('식: $$x ≥ 0$$ 끝')
    expect(out).toMatch(/^식: \$\$.*\$\$ 끝$/)
    expect(out).toContain('\\geq')
  })

  it('replaces unicode minus with ASCII dash', () => {
    const out = normalizeLatexForKatex('$a − b$')
    expect(out).toBe('$a - b$')
  })

  it('converts unicode superscripts to LaTeX form', () => {
    const out = normalizeLatexForKatex('$x²$')
    expect(out).toBe('$x^{2}$')
  })

  it('does not transform text outside math delimiters', () => {
    const out = normalizeLatexForKatex('α 밖 $α 안$ β 밖')
    expect(out.startsWith('α 밖 $')).toBe(true)
    expect(out).toContain('\\alpha')
    expect(out).toContain('β 밖')
  })

  it('handles multiple inline math segments in one string', () => {
    const out = normalizeLatexForKatex('$a ≤ b$ 그리고 $c ≥ d$')
    expect(out).toContain('\\leq')
    expect(out).toContain('\\geq')
  })
})
