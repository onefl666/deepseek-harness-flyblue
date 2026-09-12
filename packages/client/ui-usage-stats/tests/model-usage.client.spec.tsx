// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ModelUsage } from '../src/client/ModelUsage.tsx'
import { model, translate } from './fixtures.client.ts'
import type { ModelUsage as ModelUsageRow } from '../src/client/types.ts'

afterEach(cleanup)

const t = translate as never
const renderUsage = (models: readonly ModelUsageRow[], totalTokens: number) =>
  render(<ModelUsage t={t} models={models} totalTokens={totalTokens} />)
const ring = (): HTMLElement => screen.getByRole('img', { name: /models\.summary/ })
const segments = (): SVGPathElement[] => [...ring().querySelectorAll('path')] as SVGPathElement[]
const rows = (): HTMLElement[] => [...screen.getByRole('list').children] as HTMLElement[]
const muted = (): SVGPathElement[] => segments().filter(segment => segment.hasAttribute('data-muted'))

describe('ModelUsage', () => {
  it('draws one arc per segment and names the leading model with its share', () => {
    renderUsage([model(1, 75), model(2, 25)], 100)
    expect(segments()).toHaveLength(2)
    expect(screen.getByText(/models\.top/).textContent).toContain('m1')
  })

  it('renders the range total in the middle of the ring', () => {
    renderUsage([model(1, 75)], 100)
    expect(screen.getByText('100')).toBeTruthy()
  })

  it('lists each model with its share and tokens, and labels the remainder', () => {
    renderUsage([model(1, 50), model(2, 30), model(3, 10), model(4, 6), model(5, 4)], 100)
    const text = document.body.textContent ?? ''
    expect(text).toContain('m1')
    expect(text).toContain('other')
    expect(text).toContain('models.tokens')
    expect(text).toContain('50%')
  })

  it('keeps every model separate when they all fit', () => {
    renderUsage([model(1, 50), model(2, 30), model(3, 10), model(4, 6)], 96)
    expect(segments()).toHaveLength(4)
    expect(document.body.textContent).not.toContain('other')
  })

  it('highlights the ring segment a row points at', () => {
    renderUsage([model(1, 75), model(2, 25)], 100)
    const row = rows()[0] as HTMLElement
    fireEvent.pointerEnter(row)
    expect(row.hasAttribute('data-active')).toBe(true)
    expect(muted()).toHaveLength(1)
    fireEvent.pointerLeave(row)
    expect(row.hasAttribute('data-active')).toBe(false)
    expect(muted()).toHaveLength(0)
  })

  it('highlights the row a ring segment points at', () => {
    renderUsage([model(1, 75), model(2, 25)], 100)
    const segment = segments()[1] as SVGPathElement
    fireEvent.pointerEnter(segment)
    expect(muted()).toHaveLength(1)
    expect(muted()[0]).toBe(segments()[0])
    expect((rows()[1] as HTMLElement).hasAttribute('data-active')).toBe(true)
    fireEvent.pointerLeave(segment)
    expect(muted()).toHaveLength(0)
    expect((rows()[0] as HTMLElement).hasAttribute('data-active')).toBe(false)
  })

  it('says there is no attributable usage instead of drawing an empty ring', () => {
    renderUsage([], 0)
    expect(screen.getByText('models.empty')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(/models\.top/)).toBeNull()
  })
})
