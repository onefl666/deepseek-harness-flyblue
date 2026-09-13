import { describe, expect, it } from 'vitest'
import type { GitGraphEntry } from '@deepseek-ai/dsh-workspace-git/types'
import { LANE_COLORS, LANE_WIDTH, ROW_HEIGHT, connectorPath, graphRows, laneCenter, laneColor, laneCount } from '../src/client/graph.ts'
import type { GraphRow } from '../src/client/graph.ts'

const commit = (hash: string, parents: readonly string[] = []): GitGraphEntry =>
  ({ hash, parents: [...parents], subject: `subject-${hash}`, refs: [] })

/** The drawing models of a history, which is what most cases assert. */
const rows = (commits: readonly GitGraphEntry[]): GraphRow[] => graphRows(commits).map(entry => entry.row)

/** One row paired with a stand-in commit, for the column-count cases. */
const withRow = (row: GraphRow) => ({ commit: commit('x'), row })

describe('graphRows', () => {
  it('reads an empty history as no rows', () => {
    expect(graphRows([])).toEqual([])
  })

  it('pairs every commit with its own drawing model', () => {
    const plotted = graphRows([commit('a', ['b']), commit('b')])
    expect(plotted.map(entry => entry.commit.hash)).toEqual(['a', 'b'])
    expect(plotted.map(entry => entry.row.lane)).toEqual([0, 0])
  })

  it('keeps a linear history in one column', () => {
    expect(rows([commit('a', ['b']), commit('b', ['c']), commit('c')])).toEqual([
      { lane: 0, incoming: false, passThrough: [], parentColumns: [0] },
      { lane: 0, incoming: true, passThrough: [], parentColumns: [0] },
      // The tip of a history has nothing below it, so its column ends at the dot.
      { lane: 0, incoming: true, passThrough: [], parentColumns: [] },
    ])
  })

  it('gives a merge its own column for the second parent and keeps both trunks crossed', () => {
    expect(rows([
      commit('a', ['b', 'c']),
      commit('b', ['d']),
      commit('c', ['e']),
      commit('d'),
      commit('e'),
    ])).toEqual([
      { lane: 0, incoming: false, passThrough: [], parentColumns: [0, 1] },
      { lane: 0, incoming: true, passThrough: [1], parentColumns: [0] },
      { lane: 1, incoming: true, passThrough: [0], parentColumns: [1] },
      { lane: 0, incoming: true, passThrough: [1], parentColumns: [] },
      { lane: 1, incoming: true, passThrough: [], parentColumns: [] },
    ])
  })

  it('starts an unrelated commit in a freed column', () => {
    const plotted = rows([
      commit('a', ['b', 'c']),
      commit('b'),
      commit('d', ['e']),
      commit('c'),
      commit('e'),
    ])
    expect(plotted[2]).toEqual({ lane: 0, incoming: false, passThrough: [1], parentColumns: [0] })
  })

  it('fills a freed column with an extra merge parent', () => {
    const plotted = rows([
      commit('a', ['b', 'c']),
      commit('b'),
      commit('c', ['d', 'e']),
      commit('d'),
      commit('e'),
    ])
    expect(plotted[2]).toEqual({ lane: 1, incoming: true, passThrough: [], parentColumns: [1, 0] })
  })

  it('records a repeated parent once per parent, so one connector is drawn', () => {
    const plotted = rows([
      commit('a', ['b']),
      commit('b', ['c']),
      commit('c'),
      commit('d', ['e', 'e']),
      commit('e'),
    ])
    expect(plotted[3]).toEqual({ lane: 0, incoming: false, passThrough: [], parentColumns: [0, 0] })
  })

  it('returns a parent to the column that already waits for it', () => {
    // Both p and q are children of r. Taking the commit's own column for r
    // again would leave r waiting in two columns at once, and the second one
    // would draw a trunk that no commit ever resolves.
    const plotted = rows([
      commit('m', ['p', 'q']),
      commit('p', ['r']),
      commit('q', ['r']),
      commit('r'),
    ])
    expect(plotted).toEqual([
      { lane: 0, incoming: false, passThrough: [], parentColumns: [0, 1] },
      { lane: 0, incoming: true, passThrough: [1], parentColumns: [0] },
      // q keeps column 1 for its dot and joins r in column 0.
      { lane: 1, incoming: true, passThrough: [0], parentColumns: [0] },
      { lane: 0, incoming: true, passThrough: [], parentColumns: [] },
    ])
    expect(laneCount(graphRows([
      commit('m', ['p', 'q']),
      commit('p', ['r']),
      commit('q', ['r']),
      commit('r'),
    ]))).toBe(2)
  })

  it('keeps the first parent in the commit\u2019s column whenever that column is free', () => {
    const plotted = rows([commit('a', ['b']), commit('b', ['c']), commit('c')])
    for (const row of plotted.slice(0, 2)) expect(row.parentColumns[0]).toBe(row.lane)
  })
})

describe('laneCount', () => {
  it('counts an empty graph as no columns', () => {
    expect(laneCount([])).toBe(0)
  })

  it('measures a free column as width, not as a column in use', () => {
    // One commit in column 0 whose second parent opens column 2: the graph is
    // three columns wide even though only two columns hold anything.
    expect(laneCount([withRow({ lane: 0, incoming: false, passThrough: [], parentColumns: [0, 2] })])).toBe(3)
  })

  it('follows the widest row', () => {
    expect(laneCount([
      withRow({ lane: 0, incoming: false, passThrough: [], parentColumns: [0] }),
      withRow({ lane: 2, incoming: true, passThrough: [1], parentColumns: [2] }),
    ])).toBe(3)
  })
})

describe('laneColor', () => {
  it('maps a column onto the palette and wraps around it', () => {
    expect(laneColor(0)).toBe('var(--lane-0)')
    expect(laneColor(LANE_COLORS - 1)).toBe(`var(--lane-${LANE_COLORS - 1})`)
    expect(laneColor(LANE_COLORS)).toBe('var(--lane-0)')
  })
})

describe('lane geometry', () => {
  it('centers a column within its own width', () => {
    expect(laneCenter(0)).toBe(LANE_WIDTH / 2)
    expect(laneCenter(3)).toBe(3 * LANE_WIDTH + LANE_WIDTH / 2)
  })

  it('curves from the dot down to the parent column', () => {
    // From column 0's center at the row's midline, down to column 1 at the
    // row's bottom edge, with the control points holding both ends vertical.
    expect(connectorPath(0, 1)).toBe(`M ${LANE_WIDTH / 2} ${ROW_HEIGHT / 2} C ${LANE_WIDTH / 2} ${ROW_HEIGHT}, ${LANE_WIDTH * 1.5} ${ROW_HEIGHT / 2}, ${LANE_WIDTH * 1.5} ${ROW_HEIGHT}`)
  })
})
