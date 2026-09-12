// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChartTooltipCard } from '../src/client/ChartTooltipCard.tsx'

afterEach(cleanup)

describe('ChartTooltipCard', () => {
  it('renders a headline on its own', () => {
    const { container } = render(<ChartTooltipCard title="9月9日" />)
    expect(container.textContent).toBe('9月9日')
    expect(container.querySelectorAll('i')).toHaveLength(0)
  })

  it('renders the detail line when given one', () => {
    const { container } = render(<ChartTooltipCard title="9月9日" detail="1.6亿 Token · 27 条消息" />)
    expect(container.textContent).toBe('9月9日1.6亿 Token · 27 条消息')
  })

  it('renders one swatch row per series and skips an empty list', () => {
    const { container, rerender } = render(
      <ChartTooltipCard
        title="9月9日"
        rows={[
          { key: 'a', tone: 0, label: '未缓存输入', value: '10' },
          { key: 'b', tone: 1, label: '输出', value: '5' },
        ]}
      />,
    )
    // One swatch per row; the card stays inside the bubble's phrasing content.
    const swatches = [...container.querySelectorAll('i')]
    expect(swatches.map(swatch => swatch.parentElement?.textContent)).toEqual(['未缓存输入10', '输出5'])
    expect(swatches[0]?.className).toBeTruthy()
    rerender(<ChartTooltipCard title="9月9日" rows={[]} />)
    expect(container.querySelectorAll('i')).toHaveLength(0)
  })
})
