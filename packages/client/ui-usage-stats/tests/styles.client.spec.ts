import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientDir = fileURLToPath(new URL('../src/client/', import.meta.url))
const files = readdirSync(clientDir)
const modules = files.filter(name => name.endsWith('.module.css'))
const sources = files.filter(name => name.endsWith('.tsx') || name.endsWith('.ts'))
const read = (name: string): string => readFileSync(`${clientDir}${name}`, 'utf8')
const tokens = readdirSync(fileURLToPath(new URL('../../ui-theme/src/styles/', import.meta.url)))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url)), 'utf8'))
  .join('\n')

describe('usage dashboard styles', () => {
  it('scans every stylesheet and source of the dashboard', () => {
    expect(modules.length).toBeGreaterThan(1)
    expect(sources).toContain('section.tsx')
  })

  it('uses only declared project tokens', () => {
    for (const name of modules) {
      const css = read(name)
      const named = [...css.matchAll(/var\((--(?:dsw|ds)-[a-z0-9-]+)/g)].map(match => match[1])
      expect(named.every(token => token?.startsWith('--dsw-alias-')
        || token?.startsWith('--dsw-shadow-')
        || token?.startsWith('--ds-transition-')
        || token === '--ds-ease-in-out'), name).toBe(true)
      expect([...new Set(named)].filter(token => !tokens.includes(`  ${String(token)}:`)), name).toEqual([])
    }
  })

  it('contains no literal color values or fallback colors', () => {
    for (const name of modules) {
      const css = read(name)
      expect(css, name).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(|\btransparent\b/i)
      expect(css, name).not.toMatch(/var\(--dsw-[a-z0-9-]+\s*,/)
    }
  })

  it('imports every stylesheet from a source of this package', () => {
    const imported = sources.map(read).join('\n')
    for (const name of modules) {
      expect(imported, name).toContain(`./${name}`)
    }
  })

  it('carries series emphasis as an attribute instead of joining class names', () => {
    // A palette class and a state class never share an element: the state rides
    // an attribute, so a missing palette entry cannot render the literal text
    // "undefined" into a class list.
    for (const name of sources) {
      expect(read(name), name).not.toMatch(/\$\{SERIES_CLASSES\[[^\]]+\]\} \$\{/)
    }
  })
})
