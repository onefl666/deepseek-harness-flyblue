/**
 * Pure decoders for every Git text format this service reads, plus the path
 * guard the mutation verbs share. Keeping the formats here leaves `index.ts`
 * as subprocess glue: the decoding is unit-testable without a repository and
 * without a process, which is the same split pwsh-local uses for its
 * dependency-free `resolve.ts`.
 */

import type { GitBranchEntry, GitGraphEntry, GitStatusEntry } from './types.ts'

/** Field separator Git emits between graph columns (`%x1f`, ASCII unit separator). */
const FIELD = '\x1f'

/** Porcelain v1 codes whose record carries a separate source path. */
const RENAME_CODES = new Set(['R', 'C'])

/** The word Git prints for a directory that is outside every work tree. */
const OUTSIDE_WORK_TREE = 'false'

/**
 * Decode `git status --porcelain=v1 -z` output.
 *
 * A `-z` record is `XY PATH`; a rename or copy is followed by one extra
 * NUL-terminated record holding the source path, which the `->` form of the
 * line format replaces. Reading the two records as one entry is what keeps a
 * rename from producing a phantom row whose status pair is the first two bytes
 * of a file name.
 * @param output - raw stdout of the status call.
 * @returns one entry per changed path, in Git's order.
 */
export function parseStatus(output: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = []
  // A rename or copy leaves its entry waiting for the source record that
  // follows it.
  let awaitingSource: GitStatusEntry | undefined
  for (const record of output.split('\0')) {
    if (record === '') continue
    if (awaitingSource !== undefined) {
      awaitingSource.origPath = record
      awaitingSource = undefined
      continue
    }
    const index = record.slice(0, 1)
    const worktree = record.slice(1, 2)
    const entry: GitStatusEntry = { index, worktree, path: record.slice(3) }
    entries.push(entry)
    if (RENAME_CODES.has(index) || RENAME_CODES.has(worktree)) awaitingSource = entry
  }
  return entries
}

/**
 * Decode `git branch --format=%(refname:short)` output.
 *
 * The listing never supplies the attached branch: a detached HEAD appears in
 * this output as a synthetic `(HEAD detached at …)` row, so `current` comes
 * from `git symbolic-ref` instead and the synthetic row is filtered out here.
 * @param output - raw stdout of the branch listing.
 * @param current - attached branch name from `parseBranch`, or null when detached.
 * @returns the roster in Git's (alphabetical) order.
 */
export function parseBranches(output: string, current: string | null): GitBranchEntry {
  return {
    current,
    branches: output.split(/\r?\n/).filter(line => line !== '' && !line.startsWith('(')),
  }
}

/**
 * Decode `git log --format=%H%x1f%P%x1f%D%x1f%s` output.
 * @param output - raw stdout of the log call.
 * @returns one row per commit, newest first in the order Git emitted.
 */
export function parseGraph(output: string): GitGraphEntry[] {
  return output.split(/\r?\n/).filter(line => line !== '').map((line) => {
    const [hash = '', parentText = '', refText = '', subject = ''] = line.split(FIELD)
    return {
      hash,
      parents: parentText === '' ? [] : parentText.split(' '),
      refs: refText === '' ? [] : refText.split(', '),
      subject,
    }
  })
}

/**
 * Read the work-tree decision out of `git rev-parse --is-inside-work-tree`.
 *
 * Git answers this question on stdout in both directions: `true` inside a work
 * tree and `false` inside a repository's own `.git` directory. Outside every
 * repository it prints nothing and fails instead, which is also what any real
 * fault looks like, so this decoder only reports the two answers it can prove.
 * @param output - raw stdout of the probe.
 * @returns the decision, or null when Git printed no answer at all.
 */
export function parseWorkTree(output: string): boolean | null {
  const word = output.trim()
  if (word === 'true') return true
  if (word === OUTSIDE_WORK_TREE) return false
  return null
}

/**
 * Decode the HEAD probe.
 * @param output - raw stdout of `git rev-parse --verify --quiet HEAD`.
 * @returns the full hash, or null while the branch has no commits yet.
 */
export function parseHead(output: string): string | null {
  const hash = output.trim()
  return hash === '' ? null : hash
}

/**
 * Decode the attached-branch probe.
 * @param output - raw stdout of `git symbolic-ref --quiet --short HEAD`.
 * @returns the branch name, or null while HEAD is detached.
 */
export function parseBranch(output: string): string | null {
  const name = output.trim()
  return name === '' ? null : name
}

/**
 * Validate a path before it reaches Git's option separator.
 * @param path - work-tree-root-relative path as Git reported it.
 * @returns the same path.
 * @throws when the path is empty, option-shaped, or traverses upward into the repository metadata.
 */
export function assertRelativePath(path: string): string {
  if (path === '' || path.startsWith('-') || path.split(/[\\/]/).some(part => part === '..' || part === '.git')) {
    throw new Error('workspace-git: invalid relative path')
  }
  return path
}
