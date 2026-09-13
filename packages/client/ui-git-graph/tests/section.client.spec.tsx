// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { GitGraphEntry, GitGraphView, GitRepositoryView } from '@deepseek-ai/dsh-workspace-git/types'
import { GitGraphSection, failureText, statusMeta } from '../src/client/section.tsx'
import type { GitGraphInjected } from '../src/client/section.tsx'

afterEach(cleanup)

/** Renders keys and, for interpolated copy, the values it was given. */
const t = (key: string, params?: Record<string, string>): string =>
  params === undefined ? key : [key, ...Object.values(params)].join(' ')

const okValue = <T,>(value: T): RemoteResult<T> => ({ ok: true, value })
const failValue = (message: string): RemoteResult<never> =>
  ({ ok: false, error: new RemoteError('gateway/internal', message, {}) })

const commit = (
  hash: string, parents: readonly string[] = [], subject = `subject-${hash}`, refs: readonly string[] = [],
): GitGraphEntry => ({ hash, parents: [...parents], subject, refs: [...refs] })

const graphValue = (entries: readonly GitGraphEntry[], repository: Partial<GitRepositoryView> = {}): GitGraphView =>
  ({ repository: { root: '/work/proj', head: 'abcdef1234567890', branch: 'main', ...repository }, entries: [...entries] })

const space = (id: string, path: string, title: string = id): WorkspaceView => ({
  workspaceId: id as WorkspaceId,
  path,
  title,
  sessionIds: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
})

const workspaceSnapshot = (items: readonly WorkspaceView[]): WorkspaceSnapshot =>
  ({ items, archivedSessionIds: [], state: 'idle', phase: 'ready', error: null })

interface Sessions {
  current?: string
  byId: Record<string, { cwd?: string }>
}

interface Options {
  workspaces?: readonly WorkspaceView[]
  sessions?: Sessions
  graph?: GitGraphInjected['graph']
  status?: GitGraphInjected['status']
  branches?: GitGraphInjected['branches']
  createBranch?: GitGraphInjected['createBranch']
  switchBranch?: GitGraphInjected['switchBranch']
  stage?: GitGraphInjected['stage']
  unstage?: GitGraphInjected['unstage']
  discard?: GitGraphInjected['discard']
}

/**
 * Render the section with plain stubs for the framework hooks the panel reads.
 * @param options - fixture overrides.
 * @returns the injected verbs the panel was handed.
 */
function renderSection(options: Options = {}): GitGraphInjected {
  const workspaces = options.workspaces ?? [space('ws-1', '/work/proj', 'proj')]
  const sessions = options.sessions ?? { current: 's-1', byId: { 's-1': { cwd: '/work/proj' } } }
  const resolved: GitGraphInjected = {
    graph: options.graph ?? (async () => okValue(graphValue([
      commit('aaa111', ['bbb222'], 'feat: lanes', ['HEAD -> main', 'origin/main']),
      commit('bbb222'),
    ]))),
    status: options.status ?? (async () => okValue([])),
    branches: options.branches ?? (async () => okValue({ current: 'main', branches: ['main', 'dev'] })),
    createBranch: options.createBranch ?? (async () => okValue(undefined)),
    switchBranch: options.switchBranch ?? (async () => okValue(undefined)),
    stage: options.stage ?? (async () => okValue(undefined)),
    unstage: options.unstage ?? (async () => okValue(undefined)),
    discard: options.discard ?? (async () => okValue(undefined)),
  }
  const byId = Object.fromEntries(Object.entries(sessions.byId).map(([id, row]) => [id, {
    id, displayTitle: id, blank: false, running: false, updatedAt: 0, cwd: row.cwd,
  }])) as unknown as Readonly<Record<SessionId, SessionSummary>>
  const useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot> = selector => selector(workspaceSnapshot(workspaces))
  const useSessions = ((selector: (value: unknown) => unknown) =>
    selector({ ids: Object.keys(byId), byId, current: sessions.current })) as never
  render(
    <GitGraphSection
      t={t as never}
      close={() => {}}
      useSessions={useSessions}
      useWorkspaces={useWorkspaces}
      useResource={(() => ({ status: 'none', value: undefined, failure: undefined, reload: () => {} })) as never}
      useSessionPendingInteraction={((selector: (value: never) => unknown) => selector(new Map() as never)) as never}
      usePanelInfo={selector => selector({ activePanelId: null })}
      {...resolved}
    />,
  )
  return resolved
}

/**
 * Open the workspace chooser and pick another workspace. The trigger names the
 * workspace currently shown, and the menu holds the rows to choose from.
 * @param shown - title of the workspace the panel is on.
 * @param target - title of the workspace row to pick.
 */
async function pickWorkspace(shown: string, target: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(shown) }))
  fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(target) }))
}

/**
 * @param subject - commit subject shown in one history row.
 * @returns that row's lane cell.
 */
function laneCell(subject: string): SVGSVGElement {
  const cell = screen.getByText(subject).closest('li')?.querySelector('svg')
  if (cell === undefined || cell === null) throw new Error(`no lane cell for ${subject}`)
  return cell
}

describe('statusMeta', () => {
  it('classifies porcelain pairs into kinds and action flags', () => {
    expect(statusMeta('M', ' ')).toEqual({ kind: 'staged', staged: true, worktree: false, discardable: false })
    expect(statusMeta(' ', 'M')).toEqual({ kind: 'unstaged', staged: false, worktree: true, discardable: true })
    expect(statusMeta('M', 'M')).toEqual({ kind: 'staged', staged: true, worktree: true, discardable: true })
    expect(statusMeta('?', '?')).toEqual({ kind: 'untracked', staged: false, worktree: true, discardable: false })
    expect(statusMeta('U', 'U')).toEqual({ kind: 'conflict', staged: false, worktree: false, discardable: false })
    expect(statusMeta('D', 'U')).toEqual({ kind: 'conflict', staged: false, worktree: false, discardable: false })
    expect(statusMeta(' ', ' ')).toEqual({ kind: 'unstaged', staged: false, worktree: false, discardable: false })
  })
})

describe('GitGraphSection identification', () => {
  it('shows the repository it resolved, its branch, and its history', async () => {
    const status = vi.fn<GitGraphInjected['status']>(async () => okValue([
      { path: 'a.ts', index: 'M', worktree: ' ' },
      { path: 'b.ts', index: ' ', worktree: 'M' },
      { path: 'new.md', index: '?', worktree: '?' },
      { path: 'conf.ts', index: 'U', worktree: 'U' },
    ]))
    renderSection({ status })

    expect(screen.getByLabelText('loading')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('feat: lanes')).toBeTruthy() })

    const section = screen.getByText('title').closest('section')!
    expect(section.getAttribute('data-git-graph')).toBe('true')
    expect(section.getAttribute('aria-busy')).toBe('false')
    expect(screen.getByText('/work/proj')).toBeTruthy()
    expect(screen.getByText('currentBranch')).toBeTruthy()
    expect(screen.getByText('staged')).toBeTruthy()
    expect(screen.getByText('unstaged')).toBeTruthy()
    expect(screen.getByText('untracked')).toBeTruthy()
    expect(screen.getByText('conflict')).toBeTruthy()
    expect(screen.getByText('dev')).toBeTruthy()
    expect(screen.getByText('aaa111')).toBeTruthy()
    expect(screen.getByText('HEAD -> main')).toBeTruthy()
    // A conflict row carries no action at all; the staged row unstages; the
    // worktree row stages and discards; the untracked row stages only.
    expect(screen.queryAllByRole('button', { name: 'stage' })).toHaveLength(2)
    expect(screen.queryAllByRole('button', { name: 'discard' })).toHaveLength(1)
    expect(screen.getByText('conf.ts').closest('li')?.querySelectorAll('button')).toHaveLength(0)
  })

  it('reads the workspace the open session belongs to', async () => {
    const graph = vi.fn<GitGraphInjected['graph']>(async () => okValue(graphValue([])))
    renderSection({
      workspaces: [space('ws-1', '/work/one', 'one'), space('ws-2', '/work/two', 'two')],
      sessions: { current: 's-1', byId: { 's-1': { cwd: '/work/two' } } },
      graph,
    })
    await waitFor(() => { expect(graph).toHaveBeenCalledWith('ws-2') })
    expect(screen.getByRole('button', { name: /two/ })).toBeTruthy()
  })

  it('falls back to registry order when the open session has no workspace', async () => {
    const graph = vi.fn<GitGraphInjected['graph']>(async () => okValue(graphValue([])))
    renderSection({
      workspaces: [space('ws-1', '/work/one', 'one'), space('ws-2', '/work/two', 'two')],
      sessions: { current: 's-1', byId: { 's-1': { cwd: '/work/elsewhere' } } },
      graph,
    })
    await waitFor(() => { expect(graph).toHaveBeenCalledWith('ws-1') })
  })

  it('reports a workspace outside every work tree and reads nothing else', async () => {
    const status = vi.fn<GitGraphInjected['status']>(async () => okValue([]))
    const branches = vi.fn<GitGraphInjected['branches']>(async () => okValue({ current: null, branches: [] }))
    renderSection({ graph: async () => okValue({ repository: null, entries: [] }), status, branches })
    await waitFor(() => { expect(screen.getByText('notARepository')).toBeTruthy() })
    expect(status).not.toHaveBeenCalled()
    expect(branches).not.toHaveBeenCalled()
  })

  it('identifies a repository whose branch has no commits yet', async () => {
    renderSection({ graph: async () => okValue(graphValue([], { head: null, branch: 'main' })) })
    await waitFor(() => { expect(screen.getByText('historyEmpty')).toBeTruthy() })
    expect(screen.getByText('currentBranch')).toBeTruthy()
  })

  it('shows a detached HEAD by the commit it sits on', async () => {
    renderSection({ graph: async () => okValue(graphValue([], { branch: null })) })
    await waitFor(() => { expect(screen.getByText('detached abcdef1')).toBeTruthy() })
  })

  it('shows a rename with the path it came from', async () => {
    renderSection({
      graph: async () => okValue(graphValue([])),
      status: async () => okValue([{ path: 'renamed.ts', origPath: 'original.ts', index: 'R', worktree: ' ' }]),
    })
    await waitFor(() => { expect(screen.getByText('renamed original.ts renamed.ts')).toBeTruthy() })
  })

  it('reports no registered workspace and skips every read', async () => {
    const graph = vi.fn<GitGraphInjected['graph']>(async () => okValue(graphValue([])))
    renderSection({ workspaces: [], graph })
    await waitFor(() => { expect(screen.getByText('noWorkspace')).toBeTruthy() })
    expect(graph).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'refresh' }).getAttribute('disabled')).not.toBeNull()
  })

  it('reports a repository with no local branches', async () => {
    renderSection({
      graph: async () => okValue(graphValue([])),
      branches: async () => okValue({ current: null, branches: [] }),
    })
    await waitFor(() => { expect(screen.getByText('branchesEmpty')).toBeTruthy() })
  })
})

describe('GitGraphSection scope switching', () => {
  it('rereads the panel for the workspace the operator picks', async () => {
    const graph = vi.fn<GitGraphInjected['graph']>(async id => okValue(graphValue([commit(`work-${id}`)])))
    renderSection({
      workspaces: [space('ws-1', '/work/one', 'one'), space('ws-2', '/work/two', 'two')],
      sessions: { current: 's-1', byId: { 's-1': { cwd: '/work/one' } } },
      graph,
    })
    await waitFor(() => { expect(screen.getByText('subject-work-ws-1')).toBeTruthy() })

    await pickWorkspace('one', 'two')

    await waitFor(() => { expect(graph).toHaveBeenCalledWith('ws-2') })
    await waitFor(() => { expect(screen.getByText('subject-work-ws-2')).toBeTruthy() })
    // Nothing from the scope the operator left may survive the switch.
    expect(screen.queryByText('subject-work-ws-1')).toBeNull()
  })

  it('drops an answer that arrives after the scope moved on', async () => {
    const pending: Array<(value: RemoteResult<GitGraphView>) => void> = []
    const graph = vi.fn<GitGraphInjected['graph']>(() => new Promise((done) => { pending.push(done) }))
    renderSection({
      workspaces: [space('ws-1', '/work/one', 'one'), space('ws-2', '/work/two', 'two')],
      sessions: { current: 's-1', byId: { 's-1': { cwd: '/work/one' } } },
      graph,
    })
    await waitFor(() => { expect(pending).toHaveLength(1) })

    await pickWorkspace('one', 'two')
    await waitFor(() => { expect(pending).toHaveLength(2) })

    pending[1]?.(okValue(graphValue([commit('newer')])))
    await waitFor(() => { expect(screen.getByText('subject-newer')).toBeTruthy() })
    pending[0]?.(okValue(graphValue([commit('older')])))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(screen.queryByText('subject-older')).toBeNull()
  })

  it('drops a failure that arrives after the scope moved on', async () => {
    const pending: Array<{ resolve: (value: RemoteResult<GitGraphView>) => void; reject: (reason: unknown) => void }> = []
    const graph = vi.fn<GitGraphInjected['graph']>(() => new Promise((resolve, reject) => { pending.push({ resolve, reject }) }))
    renderSection({
      workspaces: [space('ws-1', '/work/one', 'one'), space('ws-2', '/work/two', 'two')],
      sessions: { current: 's-1', byId: { 's-1': { cwd: '/work/one' } } },
      graph,
    })
    await waitFor(() => { expect(pending).toHaveLength(1) })

    await pickWorkspace('one', 'two')
    await waitFor(() => { expect(pending).toHaveLength(2) })
    pending[1]?.resolve(okValue(graphValue([commit('newer')])))
    await waitFor(() => { expect(screen.getByText('subject-newer')).toBeTruthy() })

    pending[0]?.reject(new Error('scope left behind'))
    await new Promise(resolve => setTimeout(resolve, 10))
    // The abandoned scope's failure describes a workspace nobody is looking at.
    expect(screen.queryByText(/scope left behind/)).toBeNull()
    expect(screen.getByText('subject-newer')).toBeTruthy()
  })
})

describe('GitGraphSection failures', () => {
  it('renders the error banner and recovers through retry', async () => {
    const graph = vi.fn<GitGraphInjected['graph']>()
      .mockResolvedValueOnce(failValue('repo missing'))
      .mockResolvedValueOnce(okValue(graphValue([commit('aaa111')])))
    renderSection({ graph })
    await waitFor(() => { expect(screen.getByText(/repo missing/)).toBeTruthy() })
    expect(screen.queryByText('notARepository')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() => { expect(screen.getByText('subject-aaa111')).toBeTruthy() })
    expect(screen.queryByText(/repo missing/)).toBeNull()
  })

  it('keeps the history when only the status read fails', async () => {
    const status = vi.fn<GitGraphInjected['status']>(async () => failValue('status failed'))
    renderSection({ graph: async () => okValue(graphValue([commit('aaa111')])), status })
    await waitFor(() => { expect(screen.getByText(/status failed/)).toBeTruthy() })
    expect(screen.getByText('subject-aaa111')).toBeTruthy()
    // An unread working tree must not be reported as a clean one.
    expect(screen.queryByText('changesEmpty')).toBeNull()
    expect(screen.queryByText('changes')).toBeNull()
  })

  it('keeps the branch form when only the branch read fails', async () => {
    const branches = vi.fn<GitGraphInjected['branches']>(async () => failValue('branch scan failed'))
    renderSection({ graph: async () => okValue(graphValue([commit('aaa111')])), branches })
    await waitFor(() => { expect(screen.getByText(/branch scan failed/)).toBeTruthy() })
    expect(screen.getByText('branches')).toBeTruthy()
    expect(screen.getByLabelText('newBranch')).toBeTruthy()
    expect(screen.queryByText('branchesEmpty')).toBeNull()
  })

  it('clears the busy flag when a read rejects', async () => {
    renderSection({ graph: vi.fn<GitGraphInjected['graph']>(async () => { throw new Error('transport lost') }) })
    await waitFor(() => { expect(screen.getByText(/transport lost/)).toBeTruthy() })
    expect(screen.getByText('title').closest('section')?.getAttribute('aria-busy')).toBe('false')
  })

  it('reports a rejection that carries no error object', () => {
    expect(failureText(new Error('transport lost'))).toBe('transport lost')
    expect(failureText('transport gone')).toBe('transport gone')
  })

  it('closes the workspace chooser without changing scope', async () => {
    const graph = vi.fn<GitGraphInjected['graph']>(async () => okValue(graphValue([])))
    renderSection({
      workspaces: [space('ws-1', '/work/one', 'one'), space('ws-2', '/work/two', 'two')],
      sessions: { current: 's-1', byId: { 's-1': { cwd: '/work/one' } } },
      graph,
    })
    await waitFor(() => { expect(graph).toHaveBeenCalledTimes(1) })

    fireEvent.click(screen.getByRole('button', { name: /one/ }))
    expect(await screen.findByRole('menuitem', { name: /two/ })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => { expect(screen.queryByRole('menuitem', { name: /two/ })).toBeNull() })
    expect(graph).toHaveBeenCalledTimes(1)
  })
})

describe('GitGraphSection mutations', () => {
  it('stages, unstages, and discards with a two-step confirmation', async () => {
    const stage = vi.fn<GitGraphInjected['stage']>(async () => okValue(undefined))
    const unstage = vi.fn<GitGraphInjected['unstage']>(async () => okValue(undefined))
    const discard = vi.fn<GitGraphInjected['discard']>(async () => okValue(undefined))
    const status = vi.fn<GitGraphInjected['status']>(async () => okValue([
      { path: 'a.ts', index: 'M', worktree: ' ' },
      { path: 'b.ts', index: ' ', worktree: 'M' },
    ]))
    renderSection({ status, graph: async () => okValue(graphValue([])), stage, unstage, discard })
    await waitFor(() => { expect(screen.getByText('a.ts')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: 'unstage' }))
    await waitFor(() => { expect(unstage).toHaveBeenCalledWith('ws-1', 'a.ts') })
    fireEvent.click(screen.getByRole('button', { name: 'stage' }))
    await waitFor(() => { expect(stage).toHaveBeenCalledWith('ws-1', 'b.ts') })
    fireEvent.click(screen.getByRole('button', { name: 'discard' }))
    expect(screen.getByRole('button', { name: 'discardConfirm' })).toBeTruthy()
    expect(discard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'discardConfirm' }))
    await waitFor(() => { expect(discard).toHaveBeenCalledWith('ws-1', 'b.ts', true) })
  })

  it('rereads the panel after a successful mutation and reports a refused one', async () => {
    const stage = vi.fn<GitGraphInjected['stage']>()
      .mockResolvedValueOnce(okValue(undefined))
      .mockResolvedValueOnce(failValue('staging refused'))
    const graph = vi.fn<GitGraphInjected['graph']>(async () => okValue(graphValue([])))
    const status = vi.fn<GitGraphInjected['status']>(async () => okValue([{ path: 'b.ts', index: ' ', worktree: 'M' }]))
    renderSection({ status, graph, stage })
    await waitFor(() => { expect(screen.getByText('b.ts')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: 'stage' }))
    await waitFor(() => { expect(graph).toHaveBeenCalledTimes(2) })
    fireEvent.click(screen.getByRole('button', { name: 'stage' }))
    await waitFor(() => { expect(screen.getByText(/staging refused/)).toBeTruthy() })
    expect(graph).toHaveBeenCalledTimes(2)
  })

  it('switches branches and surfaces the refusal', async () => {
    const switchBranch = vi.fn<GitGraphInjected['switchBranch']>()
      .mockResolvedValueOnce(okValue(undefined))
      .mockResolvedValueOnce(failValue('working tree is not clean'))
    const graph = vi.fn<GitGraphInjected['graph']>(async () => okValue(graphValue([])))
    renderSection({ switchBranch, graph })
    await waitFor(() => { expect(screen.getByRole('button', { name: 'switch' })).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: 'switch' }))
    await waitFor(() => { expect(switchBranch).toHaveBeenCalledWith('ws-1', 'dev') })
    await waitFor(() => { expect(graph).toHaveBeenCalledTimes(2) })
    fireEvent.click(screen.getByRole('button', { name: 'switch' }))
    await waitFor(() => { expect(screen.getByText(/working tree is not clean/)).toBeTruthy() })
  })

  it('creates a branch on submit and ignores an empty or repeated one', async () => {
    const createBranch = vi.fn<GitGraphInjected['createBranch']>(async () => okValue(undefined))
    renderSection({ createBranch })
    await waitFor(() => { expect(screen.getByLabelText('newBranch')).toBeTruthy() })
    const input = screen.getByLabelText('newBranch')
    expect(screen.getByRole('button', { name: 'create' }).getAttribute('disabled')).not.toBeNull()

    fireEvent.submit(input.closest('form')!)
    expect(createBranch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'feat' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => { expect(createBranch).toHaveBeenCalledWith('ws-1', 'feat') })
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('reports a refused branch creation', async () => {
    const createBranch = vi.fn<GitGraphInjected['createBranch']>(async () => failValue('invalid name'))
    renderSection({ createBranch })
    await waitFor(() => { expect(screen.getByLabelText('newBranch')).toBeTruthy() })
    const input = screen.getByLabelText('newBranch')
    fireEvent.change(input, { target: { value: 'bad name' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => { expect(screen.getByText(/invalid name/)).toBeTruthy() })
  })

  it('copies a hash on demand and reports the transient success label', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
    try {
      renderSection()
      await screen.findByText('feat: lanes')
      fireEvent.click(screen.getAllByLabelText('copyHash')[0]!)
      await waitFor(() => { expect(screen.getByText('copied')).toBeTruthy() })
      expect(clipboard.writeText).toHaveBeenCalledWith('aaa111')
      await new Promise(resolve => setTimeout(resolve, 1100))
      expect(screen.queryByText('copied')).toBeNull()
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    }
  })

  it('stays quiet when the clipboard write is refused', async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
    try {
      renderSection()
      await screen.findByText('feat: lanes')
      fireEvent.click(screen.getAllByLabelText('copyHash')[0]!)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(screen.queryByText('copied')).toBeNull()
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    }
  })
})

describe('GitGraphSection lanes', () => {
  it('tiles trunk lines, merge curves, and dots across the graph', async () => {
    renderSection({
      graph: async () => okValue(graphValue([
        commit('aaa111', ['bbb222', 'ccc333']),
        commit('bbb222'),
        commit('ccc333'),
      ])),
    })
    await waitFor(() => { expect(screen.getByText('subject-aaa111')).toBeTruthy() })
    // One lane cell per commit row, each drawn at the graph's full width.
    const rows = screen.getByText('subject-aaa111').closest('ol')!.querySelectorAll('li')
    expect(rows).toHaveLength(3)
    const merge = laneCell('subject-aaa111')
    // The merge owns two columns: a trunk below its own dot and a curve into
    // the column its second parent was given.
    expect(merge.querySelectorAll('line')).toHaveLength(1)
    expect(merge.querySelectorAll('path')).toHaveLength(1)
    expect(merge.querySelector('circle')?.getAttribute('cx')).toBe('7')
    // The second column crosses the next row rather than appearing in it.
    const second = laneCell('subject-bbb222')
    expect(second.querySelectorAll('line')).toHaveLength(2)
    expect(second.querySelectorAll('path')).toHaveLength(0)
    expect(laneCell('subject-ccc333').querySelector('circle')?.getAttribute('cx')).toBe('21')
    expect(merge.getAttribute('width')).toBe('28')
    expect(merge.getAttribute('height')).toBe('32')
  })

  it('draws a branch tip without a trunk above it', async () => {
    renderSection({ graph: async () => okValue(graphValue([commit('tip', ['base']), commit('base')])) })
    await waitFor(() => { expect(screen.getByText('subject-tip')).toBeTruthy() })
    const lines = [...laneCell('subject-tip').querySelectorAll('line')]
    // A tip has a dot and the trunk below it, and nothing reaching in from above.
    expect(lines).toHaveLength(1)
    expect(lines[0]?.getAttribute('y1')).toBe('16')
    expect(lines[0]?.getAttribute('y2')).toBe('32')
  })

  it('gives the lane list the row height the columns were measured with', async () => {
    renderSection()
    await screen.findByText('feat: lanes')
    const list = screen.getByText('feat: lanes').closest('ol')
    expect(list?.getAttribute('style')).toContain('--graph-row-height: 32px')
  })
})
