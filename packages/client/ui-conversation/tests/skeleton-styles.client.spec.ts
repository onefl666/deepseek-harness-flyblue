/**
 * The conversation column's switch entrance. The renderer remounts the column
 * per Session selection, so the mount fade is the whole switch motion; it must
 * ride the shared ease token, be the only thing each declared keyframe serves,
 * and disappear under reduced motion. Losing the declaration or its guard is a
 * red test, which is what keeps an upstream re-import from silently dropping
 * the motion in packages/client/ui-conversation/src/client/skeleton/.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/skeleton/ConversationRoot.module.css', import.meta.url)),
  'utf8',
)

/** The column's own rule block (the first `.root {` declaration). */
const rootRule = /\.root \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ''
/** Every keyframe name declared in the sheet. */
const keyframes = [...css.matchAll(/@keyframes\s+([a-z0-9-]+)/g)].map(match => match[1]!)
/** The reduced-motion block body. */
const reducedMotion = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

describe('conversation skeleton styles', () => {
  it('fades the column in on mount with the shared curve', () => {
    const entrance = /animation:\s*([a-z0-9-]+)\s+150ms\s+var\(--ds-ease-in-out\)/.exec(rootRule)
    expect(entrance?.[1], '.root declares a 150ms eased entrance animation').toBeTypeOf('string')
    expect(keyframes).toContain(entrance?.[1])
  })

  it('serves every declared keyframe from an animation declaration', () => {
    expect(keyframes.length).toBeGreaterThan(0)
    for (const name of keyframes) {
      expect(css, `keyframes ${name}`).toMatch(new RegExp(`animation:[^;]*\\b${name}\\b`))
    }
  })

  it('drops the entrance under reduced motion', () => {
    expect(reducedMotion).toMatch(/\.root \{[^}]*animation: none/)
  })
})
