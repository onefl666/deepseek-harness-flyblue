import { describe, expect, it } from 'vitest'
import { modelShares, RING_STROKE, ringArc } from '../src/client/models.ts'
import { model } from './fixtures.client.ts'

describe('modelShares', () => {
  it('keeps the leading models and sums the rest into a remainder', () => {
    const shares = modelShares([model(1, 50), model(2, 30), model(3, 10), model(4, 6), model(5, 4)], 100, 4)
    expect(shares.map(share => [share.model, share.totalTokens, share.share, share.offset, share.remainder])).toEqual([
      ['m1', 50, 0.5, 0, false],
      ['m2', 30, 0.3, 0.5, false],
      ['m3', 10, 0.1, 0.8, false],
      ['m4', 6, 0.06, 0.9, false],
      ['', 4, 0.04, 0.96, true],
    ])
  })

  it('omits the remainder when every model fits', () => {
    const shares = modelShares([model(1, 75), model(2, 25)], 100, 4)
    expect(shares.map(share => share.model)).toEqual(['m1', 'm2'])
    expect(shares.some(share => share.remainder)).toBe(false)
  })

  it('reports no share when the range total is zero', () => {
    expect(modelShares([model(1, 0)], 0, 4).map(share => share.share)).toEqual([0])
  })

  it('returns nothing for an empty model list', () => {
    expect(modelShares([], 0, 4)).toEqual([])
  })
})

describe('ringArc', () => {
  it('draws a partial segment as one arc', () => {
    expect(ringArc(0, 0.25)).toMatch(/^M 50 10 A 40 40 0 0 1 /)
    expect(ringArc(0, 0.75)).toContain('A 40 40 0 1 1')
  })

  it('draws a full turn as two half arcs, because one arc renders nothing', () => {
    expect(ringArc(0, 1).match(/A 40 40 0 1 1/g)).toHaveLength(2)
  })

  it('starts a later segment where the earlier ones ended', () => {
    expect(ringArc(0.25, 0.25)).not.toBe(ringArc(0, 0.25))
    expect(ringArc(0.25, 0.25)).toContain('M 90 50')
  })

  it('draws nothing for a non-positive share', () => {
    expect(ringArc(0, 0)).toBe('')
    expect(ringArc(0.5, -0.1)).toBe('')
  })

  it('keeps the ring inside its drawing box', () => {
    // Radius plus half the stroke must stay within the 100-unit box.
    expect(40 + RING_STROKE / 2).toBeLessThanOrEqual(50)
  })
})
