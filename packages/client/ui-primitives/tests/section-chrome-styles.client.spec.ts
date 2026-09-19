/**
 * SectionChrome's styles as CSS text. CSS Modules resolve to class-name maps
 * in the component suites, so the reduced-motion guard and the error tint
 * exist only here: jsdom never lays out the spin or the border.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/SectionChrome.module.css', import.meta.url)), 'utf8')

describe('SectionChrome.module.css', () => {
  it('spins the busy glyph and stops it under reduced motion', () => {
    expect(css).toContain('animation: dsh-section-chrome-spin 700ms linear infinite;')
    expect(css).toContain('@keyframes dsh-section-chrome-spin')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.spin \{ animation: none; \}/)
  })

  it('keeps the trailing meta cluster at its natural width', () => {
    const rule = /\.headerMeta\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/flex:\s*none|flex-shrink:\s*0/)
  })

  it('tints the failure strip from the error state token', () => {
    expect(css).toContain('border: 1px solid var(--dsw-alias-state-error-primary);')
    expect(css).toContain('color: var(--dsw-alias-state-error-primary);')
  })

  it('paints only through --dsw-alias tokens and carries no literal color', () => {
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(|\btransparent\b/i)
    const named = [...css.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map(match => match[1])
    expect(named.every(name => name?.startsWith('--dsw-alias-'))).toBe(true)
  })
})
