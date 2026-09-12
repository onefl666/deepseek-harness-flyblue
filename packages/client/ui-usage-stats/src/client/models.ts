/**
 * Ring geometry and share arithmetic for the model-usage view. The ring is
 * drawn as one stroked arc per segment rather than with `stroke-dasharray`
 * offsets, so a segment's pointer area is exactly the segment the reader sees.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/models
 */

import type { ModelUsage } from './types.ts'

/** Radius of the ring inside the 100x100 drawing box. */
const RING_RADIUS = 40
/** Center of the drawing box, and of the ring. */
const RING_CENTER = 50
/** Ring thickness in box units, so the drawing box and the stroke agree. */
export const RING_STROKE = 14

/** One ring segment: a model, its share of the range, and its start offset. */
export interface ModelShare {
  /** Provider route, empty for the remainder segment. */
  provider: string
  /** Provider model, empty for the remainder segment. */
  model: string
  /** Sum of the four token buckets attributed to this segment. */
  totalTokens: number
  /** Fraction of the range total, 0..1; zero when the range reported none. */
  share: number
  /** Cumulative fraction before this segment, 0..1. */
  offset: number
  /** True when this segment sums every model past the leading limit. */
  remainder: boolean
}

/** Round a box coordinate so generated paths stay readable. */
function coordinate(value: number): number {
  return Number(value.toFixed(3))
}

/** A point on the ring at a fraction of a full turn, starting at twelve o'clock. */
function ringPoint(turn: number, radius: number): string {
  const angle = turn * Math.PI * 2 - Math.PI / 2
  return `${coordinate(RING_CENTER + radius * Math.cos(angle))} ${coordinate(RING_CENTER + radius * Math.sin(angle))}`
}

/**
 * Draw one ring segment as a stroked SVG arc.
 * @param offset - cumulative share before this segment, 0..1.
 * @param share - this segment's share, 0..1.
 * @param radius - ring radius in the 100x100 box.
 * @returns a stroke-only path, or an empty string when the share is not positive.
 */
export function ringArc(offset: number, share: number, radius = RING_RADIUS): string {
  if (share <= 0) return ''
  const start = ringPoint(offset, radius)
  if (share >= 1) {
    // A single full-turn segment: two half arcs, because an arc whose ends
    // coincide renders nothing.
    const half = ringPoint(offset + 0.5, radius)
    return `M ${start} A ${radius} ${radius} 0 1 1 ${half} A ${radius} ${radius} 0 1 1 ${start}`
  }
  const end = ringPoint(offset + share, radius)
  return `M ${start} A ${radius} ${radius} 0 ${share > 0.5 ? 1 : 0} 1 ${end}`
}

/**
 * Collapse model usage to a leading set plus an optional remainder.
 * @param models - model aggregates ordered by tokens, as the Host returns them.
 * @param total - range token total the shares are taken against.
 * @param limit - number of leading models kept separate.
 * @returns segments in plotting order with cumulative offsets.
 */
export function modelShares(models: readonly ModelUsage[], total: number, limit: number): ModelShare[] {
  const shares: ModelShare[] = []
  let offset = 0
  const push = (provider: string, model: string, totalTokens: number, remainder: boolean): void => {
    const share = total > 0 ? totalTokens / total : 0
    shares.push({ provider, model, totalTokens, share, offset, remainder })
    offset += share
  }
  for (const model of models.slice(0, limit)) push(model.provider, model.model, model.totalTokens, false)
  const rest = models.slice(limit).reduce((sum, model) => sum + model.totalTokens, 0)
  if (rest > 0) push('', '', rest, true)
  return shares
}
