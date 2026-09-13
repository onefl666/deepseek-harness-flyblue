/**
 * Pure lane model for the commit graph, plus the geometry the lane column is
 * drawn with. Keeping both here leaves the component to render numbers it is
 * handed, and makes the assignment testable without a DOM: the drawing and the
 * event handling have no bearing on which column a commit owns.
 */

import type { GitGraphEntry } from '@deepseek-ai/dsh-workspace-git/types'

/** Width of one lane column, in pixels. */
export const LANE_WIDTH = 14

/**
 * Row height, in pixels. A lane trunk crosses its row edge to edge, so
 * adjacent rows tile into one continuous line only while every row is this
 * tall — the list therefore renders no inter-row gap.
 */
export const ROW_HEIGHT = 32

/** Distinct lane colors the section palette defines. */
export const LANE_COLORS = 5

/** Where one commit sits and what its row draws. */
export interface GraphRow {
  /** Column holding this commit's dot. */
  lane: number
  /** Whether a trunk already reached this column from the row above. */
  incoming: boolean
  /** Columns whose trunk crosses the whole row without a dot. */
  passThrough: readonly number[]
  /** Column each parent is drawn into, in parent order; a later parent opens or takes a column. */
  parentColumns: readonly number[]
}

/** One history row: a commit with the lane geometry drawn for it. */
export interface GraphCommit {
  readonly commit: GitGraphEntry
  readonly row: GraphRow
}

/**
 * First free column, or one past the end when every column is taken.
 * @param tips - Occupied columns, holes included as undefined.
 * @returns the column to claim.
 */
function freeColumn(tips: readonly (string | undefined)[]): number {
  const hole = tips.indexOf(undefined)
  return hole === -1 ? tips.length : hole
}

/**
 * Assign graph lanes top-down over a newest-first, topologically ordered
 * history. Each column's tip is the commit it is waiting to reach; a commit
 * continues the column that names it, or claims a free one. The commit's
 * column is released before its parents are placed, so a parent that already
 * owns a column keeps it: without that release one commit could leave a tip in
 * two columns at once, which draws a trunk that never resolves.
 * @param commits - Commit rows, newest first, every parent after its child.
 * @returns each commit with its drawing model, in the given order.
 */
export function graphRows(commits: readonly GitGraphEntry[]): GraphCommit[] {
  const tips: (string | undefined)[] = []
  const plotted: GraphCommit[] = []
  for (const commit of commits) {
    const waiting = tips.indexOf(commit.hash)
    const lane = waiting === -1 ? freeColumn(tips) : waiting
    const before = [...tips]
    const after = [...tips]
    after[lane] = undefined
    const parentColumns: number[] = []
    for (const parent of commit.parents) {
      const taken = after.indexOf(parent)
      if (taken !== -1) { parentColumns.push(taken); continue }
      // The first parent inherits the commit's own column; the rest take a free
      // column or open one.
      const column = parentColumns.length === 0 ? lane : freeColumn(after)
      after[column] = parent
      parentColumns.push(column)
    }
    plotted.push({
      commit,
      row: {
        lane,
        incoming: waiting !== -1,
        passThrough: before.flatMap((tip, column) =>
          tip !== undefined && column !== lane && after[column] !== undefined ? [column] : []),
        parentColumns,
      },
    })
    for (let column = 0; column < after.length; column += 1) tips[column] = after[column]
    while (tips.length > 0 && tips[tips.length - 1] === undefined) tips.pop()
  }
  return plotted
}

/**
 * Count the columns the lane area must render. A free column still needs its
 * width, so this is the largest drawn column plus one and not the number of
 * columns in use.
 * @param plotted - Assigned rows.
 * @returns the column count.
 */
export function laneCount(plotted: readonly GraphCommit[]): number {
  let count = 0
  for (const { row } of plotted) {
    count = Math.max(count, row.lane + 1)
    for (const column of row.passThrough) count = Math.max(count, column + 1)
    for (const column of row.parentColumns) count = Math.max(count, column + 1)
  }
  return count
}

/**
 * Resolve a lane column to its palette position, wrapping past the last one.
 * @param column - Lane column.
 * @returns the CSS color expression for that column.
 */
export function laneColor(column: number): string {
  return `var(--lane-${column % LANE_COLORS})`
}

/**
 * Locate a lane column's horizontal center inside the lane area.
 * @param column - Lane column.
 * @returns the center offset in pixels.
 */
export function laneCenter(column: number): number {
  return column * LANE_WIDTH + LANE_WIDTH / 2
}

/**
 * Curve from a commit dot into one parent's column. The control points leave
 * the dot and arrive at the column vertically, so a merge reads as one line
 * turning rather than as two lines meeting at an angle.
 * @param from - column holding the dot.
 * @param to - column the parent is drawn into.
 * @returns an SVG path for one row, from the dot down to the row's bottom edge.
 */
export function connectorPath(from: number, to: number): string {
  return `M ${laneCenter(from)} ${ROW_HEIGHT / 2} C ${laneCenter(from)} ${ROW_HEIGHT}, ${laneCenter(to)} ${ROW_HEIGHT / 2}, ${laneCenter(to)} ${ROW_HEIGHT}`
}
