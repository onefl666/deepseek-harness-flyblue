import { describe, expect, it } from 'vitest'
import { compactText, dateAt, dateKey, dateText, exactText, percentText } from '../src/client/format.ts'

// The browser locale decides separators and month names, so every assertion
// here holds in any locale rather than pinning one host's formatting.
describe('format', () => {
  it('reads a local ISO key as local midnight and writes it back unchanged', () => {
    expect(dateKey(dateAt('2026-09-09'))).toBe('2026-09-09')
    const value = dateAt('2026-09-09')
    expect([value.getFullYear(), value.getMonth(), value.getDate()]).toEqual([2026, 8, 9])
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('compacts large counts and leaves small ones exact', () => {
    expect(compactText(0)).toBe('0')
    expect(compactText(999)).toBe('999')
    const exact = exactText(1_234_567)
    const compact = compactText(1_234_567)
    expect(compact.length).toBeLessThan(exact.length)
    expect(exact).toContain('234')
    expect(exact).toContain('567')
  })

  it('formats a fraction as a percentage', () => {
    const text = percentText(0.456)
    expect(text.endsWith('%')).toBe(true)
    expect(text).toContain('45')
  })

  it('omits the year from the short date and includes it in the long form', () => {
    expect(dateText('2026-09-09')).not.toContain('2026')
    expect(dateText('2026-09-09', true)).toContain('2026')
  })
})
