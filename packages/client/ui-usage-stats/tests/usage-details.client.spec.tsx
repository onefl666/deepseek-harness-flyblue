// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageDetails } from '../src/client/UsageDetails.tsx'
import { model, range, translate } from './fixtures.client.ts'

afterEach(cleanup)

const t = translate as never

describe('UsageDetails', () => {
  it('keeps every model and day available as text behind the disclosure', () => {
    const { container } = render(
      <UsageDetails t={t} days={range('2026-09-09', 7)} models={[model(1, 40), model(2, 20)]} />,
    )
    expect(container.querySelector('details')?.firstElementChild?.tagName).toBe('SUMMARY')
    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    expect(tables[0]?.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(tables[1]?.querySelectorAll('tbody tr')).toHaveLength(7)
    expect(tables[0]?.querySelector('tbody tr')?.textContent).toBe('p1m1401')
    expect(tables[1]?.querySelector('tbody tr')?.textContent).toBe('2026年9月3日2021')
  })

  it('renders no model rows when the range attributed none', () => {
    render(<UsageDetails t={t} days={range('2026-09-09', 7)} models={[]} />)
    expect(screen.getAllByRole('table')[0]?.querySelectorAll('tbody tr')).toHaveLength(0)
  })
})
