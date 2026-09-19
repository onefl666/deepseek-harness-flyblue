/**
 * SearchField's motion contract as CSS text. jsdom has no layout and CSS
 * Modules resolve to class-name maps in the component suite, so the only place
 * the transition and its reduced-motion guard can be read is the stylesheet:
 * a missing guard animates for users who asked for none, and a missing
 * transition would make the clear affordance snap instead of retargeting.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/SearchField.module.css', import.meta.url)), 'utf8')

describe('SearchField.module.css', () => {
  it('retargets the clear affordance through a transition rather than a keyframe', () => {
    expect(css).toContain('.clear {')
    expect(css).toMatch(/\.clear\s*\{[^}]*transition:/)
    expect(css).not.toMatch(/\.clear[^{]*\{[^}]*animation:/)
  })

  it('drives the hidden state from the data attribute the component writes', () => {
    expect(css).toContain('.clear[data-empty]')
  })

  it('honors reduced motion for every transition it declares', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    const guard = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\n\}/.exec(css)?.[1] ?? ''
    expect(guard).toContain('.clear')
    expect(guard).toContain('transition: none')
  })
})
