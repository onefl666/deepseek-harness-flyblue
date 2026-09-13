/**
 * Git graph settings section: the changes, branches, and commit history of one
 * workspace. The workspace is resolved from the session being worked in and can
 * be pointed elsewhere from the header; every read and mutation goes through
 * the injected Remote verbs scoped to the resolved workspace id, so switching
 * the scope rereads the panel rather than reinterpreting what is on screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { GitBranchEntry, GitGraphEntry, GitGraphView, GitRepositoryView, GitStatusEntry } from '@deepseek-ai/dsh-workspace-git/types'
import {
  Button, IconBranchOutline16, IconCopyOutline16, IconLoadingOutline16, IconPlusOutline16,
  IconRefreshOutline16, Input, Pill, writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pulls the Workspace UI's GlobalStandardProps merge (props.useWorkspaces).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { LANE_WIDTH, ROW_HEIGHT, graphRows, connectorPath, laneCenter, laneColor, laneCount } from './graph.ts'
import type { GraphRow } from './graph.ts'
import { resolveWorkspaceId, sessionWorkspaceId, shortHead } from './workspace-scope.ts'
import { WorkspaceSwitcher } from './WorkspaceSwitcher.tsx'
import css from './section.module.css'

/** Remote dependency surface used by the Git panel. */
export interface GitGraphInjected {
  /** Read the workspace's repository identity and bounded commit graph. */
  graph: (workspaceId: WorkspaceId) => Promise<RemoteResult<GitGraphView>>
  /** Read porcelain working-tree status. */
  status: (workspaceId: WorkspaceId) => Promise<RemoteResult<GitStatusEntry[]>>
  /** Read local branches and the attached branch. */
  branches: (workspaceId: WorkspaceId) => Promise<RemoteResult<GitBranchEntry>>
  /** Create a branch at the current HEAD. */
  createBranch: (workspaceId: WorkspaceId, name: string) => Promise<RemoteResult<void>>
  /** Switch to a clean local branch. */
  switchBranch: (workspaceId: WorkspaceId, name: string) => Promise<RemoteResult<void>>
  /** Stage one path. */
  stage: (workspaceId: WorkspaceId, path: string) => Promise<RemoteResult<void>>
  /** Unstage one path. */
  unstage: (workspaceId: WorkspaceId, path: string) => Promise<RemoteResult<void>>
  /** Discard one path after explicit confirmation. */
  discard: (workspaceId: WorkspaceId, path: string, confirmed: boolean) => Promise<RemoteResult<void>>
}

/** How one porcelain status pair is presented. */
export type ChangeKind = 'staged' | 'unstaged' | 'untracked' | 'conflict'

/** Classification of one porcelain status pair plus its action flags. */
export interface ChangeMeta {
  kind: ChangeKind
  /** Whether the change is staged in the index. */
  staged: boolean
  /** Whether the working tree (or an untracked file) holds a change. */
  worktree: boolean
  /**
   * Whether the row can be restored. Git cannot restore a path it does not
   * track, so an untracked entry offers staging only.
   */
  discardable: boolean
}

/** Porcelain v1 two-character conflict codes (index+worktree). */
const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

/**
 * Classify one porcelain v1 status pair.
 * @param index - Index column code.
 * @param worktree - Worktree column code.
 * @returns the kind and the stage/discard action flags.
 */
export function statusMeta(index: string, worktree: string): ChangeMeta {
  const code = `${index}${worktree}`
  if (CONFLICT_CODES.has(code)) return { kind: 'conflict', staged: false, worktree: false, discardable: false }
  if (code === '??') return { kind: 'untracked', staged: false, worktree: true, discardable: false }
  const staged = index !== ' '
  const worktreeChanged = worktree !== ' '
  if (!staged && !worktreeChanged) return { kind: 'unstaged', staged: false, worktree: false, discardable: false }
  return { kind: staged ? 'staged' : 'unstaged', staged, worktree: worktreeChanged, discardable: worktreeChanged }
}

/**
 * One workspace read's result. A facet stays absent until its own read
 * succeeded, so a failed read shows the error banner instead of an empty list
 * that would claim the repository has nothing in it.
 */
interface PanelState {
  /** Absent until the first read for this workspace settles; null when the workspace holds no repository. */
  repository?: GitRepositoryView | null | undefined
  commits: readonly GitGraphEntry[]
  changes?: readonly GitStatusEntry[] | undefined
  branches?: GitBranchEntry | undefined
  busy: boolean
  error?: string | undefined
}

/** The state a panel starts from, and the one it returns to with no workspace. */
const IDLE: PanelState = { commits: [], busy: false }

/** How long the copy-success label stays visible, in ms. */
const COPIED_MS = 1000

/**
 * @param results - facet reads, in the order their failures should be reported.
 * @returns the first failure message, or undefined when every read succeeded.
 */
function firstFailure(results: readonly RemoteResult<unknown>[]): string | undefined {
  for (const result of results) if (!result.ok) return result.error.message
  return undefined
}

/**
 * @param reason - value a Remote call rejected with.
 * @returns the message to show; a rejected call carries no RemoteResult.
 */
export function failureText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * Read one workspace's panel state.
 * @param verbs - injected Remote surface.
 * @param workspaceId - workspace to read.
 * @returns the state to publish.
 */
async function readPanel(verbs: GitGraphInjected, workspaceId: WorkspaceId): Promise<PanelState> {
  // Identification first: the repository decides whether a working tree and a
  // branch roster exist to read at all.
  const graphResult = await verbs.graph(workspaceId)
  if (!graphResult.ok) return { commits: [], busy: false, error: graphResult.error.message }
  const { repository, entries } = graphResult.value
  if (repository === null) return { repository, commits: [], busy: false }
  const [statusResult, branchResult] = await Promise.all([verbs.status(workspaceId), verbs.branches(workspaceId)])
  return {
    repository,
    commits: entries,
    changes: statusResult.ok ? statusResult.value : undefined,
    branches: branchResult.ok ? branchResult.value : undefined,
    busy: false,
    error: firstFailure([statusResult, branchResult]),
  }
}

/** Status kind to a CSS class. */
function kindClass(kind: ChangeKind): string | undefined {
  if (kind === 'conflict') return css.kindConflict
  if (kind === 'untracked') return css.kindUntracked
  if (kind === 'staged') return css.kindStaged
  return css.kindUnstaged
}

/**
 * Render one commit's lane cell. Every cell is drawn at the graph's full column
 * count so the trunks of adjacent rows line up.
 * @param props.row - the commit's drawing model.
 * @param props.columns - column count of the whole graph.
 * @returns the lane cell.
 */
function LaneGraph({ row, columns }: { row: GraphRow; columns: number }) {
  const lane = laneColor(row.lane)
  return (
    <svg className={css.lanes} width={columns * LANE_WIDTH} height={ROW_HEIGHT} aria-hidden="true">
      {row.passThrough.map(column => (
        <line
          key={column}
          x1={laneCenter(column)}
          y1={0}
          x2={laneCenter(column)}
          y2={ROW_HEIGHT}
          style={{ stroke: laneColor(column) }}
        />
      ))}
      {/* A branch tip has nothing above its dot, so its trunk starts at the dot. */}
      {row.incoming && (
        <line x1={laneCenter(row.lane)} y1={0} x2={laneCenter(row.lane)} y2={ROW_HEIGHT / 2} style={{ stroke: lane }} />
      )}
      {row.parentColumns.includes(row.lane) && (
        <line x1={laneCenter(row.lane)} y1={ROW_HEIGHT / 2} x2={laneCenter(row.lane)} y2={ROW_HEIGHT} style={{ stroke: lane }} />
      )}
      {[...new Set(row.parentColumns)].filter(column => column !== row.lane).map(column => (
        <path key={column} d={connectorPath(row.lane, column)} fill="none" style={{ stroke: laneColor(column) }} />
      ))}
      <circle cx={laneCenter(row.lane)} cy={ROW_HEIGHT / 2} r={4} style={{ fill: lane }} />
    </svg>
  )
}

/**
 * Render the Git graph settings section.
 * @param props - locale, Remote verbs, and the shared framework hooks.
 * @returns the section element tree.
 */
export function GitGraphSection({
  t, graph, status, branches, createBranch, switchBranch, stage, unstage, discard, useWorkspaces, useSessions,
}: PropsLocale<'gitgraph'> & InjectFace<GitGraphInjected> & PropsRuntime<'settings.section'>) {
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  const currentSessionId = useSessions(snapshot => snapshot.current)
  const sessionsById = useSessions(snapshot => snapshot.byId)
  const [preferred, setPreferred] = useState<WorkspaceId | undefined>(undefined)
  const [panel, setPanel] = useState<PanelState>(IDLE)
  const [pendingPaths, setPendingPaths] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmDiscard, setConfirmDiscard] = useState<string | undefined>(undefined)
  const [newBranch, setNewBranch] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [switchingBranch, setSwitchingBranch] = useState<string | undefined>(undefined)
  const [copiedHash, setCopiedHash] = useState<string | undefined>(undefined)
  const sequence = useRef(0)

  const workspaceId = resolveWorkspaceId(workspaces, currentSessionId, sessionsById, preferred)
  const workspace = workspaces.find(item => item.workspaceId === workspaceId)
  const verbs = useMemo<GitGraphInjected>(
    () => ({ graph, status, branches, createBranch, switchBranch, stage, unstage, discard }),
    [graph, status, branches, createBranch, switchBranch, stage, unstage, discard],
  )

  /**
   * Read the resolved workspace. A reset drops the previous workspace's rows
   * before the new read lands, so nothing on screen can describe the scope the
   * operator just left; every other read keeps the rows it already has while
   * the busy indicator runs. A read that started before a newer one is
   * discarded by sequence, so the panel always shows the newest scope's answer.
   */
  const load = useCallback((target: WorkspaceId, reset: boolean): void => {
    const seq = ++sequence.current
    setPanel(previous => reset
      ? { ...IDLE, busy: true }
      : { ...previous, busy: true, error: undefined })
    void readPanel(verbs, target).then(
      (next) => {
        if (seq !== sequence.current) return
        setPanel(next)
      },
      (reason: unknown) => {
        if (seq !== sequence.current) return
        setPanel(previous => ({ ...previous, busy: false, error: failureText(reason) }))
      },
    )
  }, [verbs])

  useEffect(() => {
    if (workspaceId === undefined) { setPanel(IDLE); return }
    load(workspaceId, true)
  }, [workspaceId, load])

  const refresh = useCallback((): void => {
    /* v8 ignore next -- every affordance that calls refresh is disabled without a workspace */
    if (workspaceId !== undefined) load(workspaceId, false)
  }, [load, workspaceId])

  /** Run one path mutation, then reread the panel on success. */
  const mutatePath = useCallback((path: string, action: () => Promise<RemoteResult<void>>): void => {
    setPendingPaths(previous => new Set(previous).add(path))
    void action().then((result) => {
      setPendingPaths((previous) => {
        const next = new Set(previous)
        next.delete(path)
        return next
      })
      if (result.ok) { setConfirmDiscard(undefined); refresh() }
      else setPanel(previous => ({ ...previous, error: result.error.message }))
    })
  }, [refresh])

  const switchTo = useCallback((target: WorkspaceId, name: string): void => {
    setSwitchingBranch(name)
    void switchBranch(target, name).then((result) => {
      setSwitchingBranch(undefined)
      if (result.ok) refresh()
      else setPanel(previous => ({ ...previous, error: result.error.message }))
    })
  }, [refresh, switchBranch])

  const submitBranch = useCallback((event: FormEvent, target: WorkspaceId): void => {
    event.preventDefault()
    const name = newBranch.trim()
    if (name === '' || creatingBranch) return
    setCreatingBranch(true)
    void createBranch(target, name).then((result) => {
      setCreatingBranch(false)
      if (result.ok) { setNewBranch(''); refresh() }
      else setPanel(previous => ({ ...previous, error: result.error.message }))
    })
  }, [createBranch, creatingBranch, newBranch, refresh])

  const copyHash = (hash: string): void => {
    void writeClipboard(hash).then((ok) => {
      if (!ok) return
      setCopiedHash(hash)
      window.setTimeout(() => { setCopiedHash(undefined) }, COPIED_MS)
    })
  }

  const repository = panel.repository
  const changes = panel.changes
  const branchInfo = panel.branches
  const plotted = useMemo(() => graphRows(panel.commits), [panel.commits])
  const columns = useMemo(() => laneCount(plotted), [plotted])

  return (
    <section className={css.section} data-git-graph aria-busy={panel.busy}>
      <header className={css.header}>
        <div className={css.heading}>
          <h2 className={css.title}>{t('title')}</h2>
          <p className={css.intro}>{t('intro')}</p>
        </div>
        <div className={css.headerMeta}>
          {workspace !== undefined && (
            <WorkspaceSwitcher
              workspaces={workspaces}
              selected={workspace}
              sessionWorkspaceId={sessionWorkspaceId(workspaces, currentSessionId, sessionsById)}
              caption={t('workspace')}
              onSelect={(picked) => { setPreferred(picked.workspaceId) }}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={panel.busy ? <IconLoadingOutline16 className={css.spin} /> : <IconRefreshOutline16 />}
            disabled={panel.busy || workspaceId === undefined}
            onClick={refresh}
            aria-label={t('refresh')}
          >
            {panel.busy ? t('refreshing') : t('refresh')}
          </Button>
        </div>
      </header>
      {panel.error !== undefined && (
        <div className={css.error} role="alert">
          <span>{t('error')}: {panel.error}</span>
          <Button variant="ghost" size="sm" onClick={refresh}>{t('retry')}</Button>
        </div>
      )}
      {workspaceId === undefined || workspace === undefined
        ? <div className={css.empty}>{t('noWorkspace')}</div>
        : repository === undefined
          ? panel.busy
            ? <div className={css.skeleton} aria-busy="true" aria-label={t('loading')}><div className={css.skeletonCard} /><div className={css.skeletonCard} /><div className={css.skeletonCard} /></div>
            : null
          : repository === null
            ? <div className={css.empty}>{t('notARepository')}</div>
            : (
              <>
                <p className={css.repository}>
                  <span className={css.repositoryCaption}>{t('repository')}</span>
                  <code className={css.repositoryPath} title={repository.root}>{repository.root}</code>
                  <Pill active>{repository.branch ?? t('detached', { hash: shortHead(repository.head) })}</Pill>
                </p>
                {changes !== undefined && (
                  <article className={css.card}>
                    <h3 className={css.cardTitle}>{t('changes')}</h3>
                    {changes.length === 0
                      ? <p className={css.empty}>{t('changesEmpty')}</p>
                      : (
                        <ul className={css.list}>
                          {changes.map((change, index) => {
                            const meta = statusMeta(change.index, change.worktree)
                            const pending = pendingPaths.has(change.path)
                            return (
                              <li key={change.path} className={css.row} style={{ '--row-index': index } as CSSProperties}>
                                <span className={kindClass(meta.kind)}>{t(meta.kind)}</span>
                                <code className={css.path} title={change.path}>
                                  {change.origPath === undefined
                                    ? change.path
                                    : t('renamed', { from: change.origPath, to: change.path })}
                                </code>
                                <span className={css.actions}>
                                  {meta.staged && (
                                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { mutatePath(change.path, () => unstage(workspaceId, change.path)) }}>
                                      {t('unstage')}
                                    </Button>
                                  )}
                                  {meta.worktree && (
                                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { mutatePath(change.path, () => stage(workspaceId, change.path)) }}>
                                      {t('stage')}
                                    </Button>
                                  )}
                                  {meta.discardable && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className={css.danger}
                                      disabled={pending}
                                      onClick={() => {
                                        if (confirmDiscard === change.path) {
                                          mutatePath(change.path, () => discard(workspaceId, change.path, true))
                                        } else setConfirmDiscard(change.path)
                                      }}
                                    >
                                      {confirmDiscard === change.path ? t('discardConfirm') : t('discard')}
                                    </Button>
                                  )}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                  </article>
                )}
                <article className={css.card}>
                  <h3 className={css.cardTitle}>{t('branches')}</h3>
                  {branchInfo !== undefined && (branchInfo.branches.length === 0
                    ? <p className={css.empty}>{t('branchesEmpty')}</p>
                    : (
                      <ul className={css.list}>
                        {branchInfo.branches.map((name, index) => {
                          const current = name === branchInfo.current
                          const switching = switchingBranch === name
                          return (
                            <li key={name} className={css.row} style={{ '--row-index': index } as CSSProperties}>
                              <IconBranchOutline16 className={current ? css.branchIconCurrent : css.branchIcon} />
                              <span className={current ? css.branchCurrent : css.branchName}>{name}</span>
                              {current ? <Pill active>{t('currentBranch')}</Pill> : (
                                <span className={css.actions}>
                                  <Button size="sm" variant="ghost" disabled={switching} onClick={() => { switchTo(workspaceId, name) }}>
                                    {t('switch')}
                                  </Button>
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    ))}
                  <form className={css.branchForm} onSubmit={(event) => { submitBranch(event, workspaceId) }}>
                    <Input
                      icon={<IconPlusOutline16 />}
                      placeholder={t('branchPlaceholder')}
                      aria-label={t('newBranch')}
                      value={newBranch}
                      onChange={(event) => { setNewBranch(event.target.value) }}
                    />
                    <Button type="submit" variant="primary" size="sm" disabled={newBranch.trim() === '' || creatingBranch}>
                      {t('create')}
                    </Button>
                  </form>
                </article>
                <article className={css.card}>
                  <h3 className={css.cardTitle}>{t('history')}</h3>
                  {panel.commits.length === 0
                    ? <p className={css.empty}>{t('historyEmpty')}</p>
                    : (
                      <ol className={css.commits} style={{ '--graph-row-height': `${ROW_HEIGHT}px` } as CSSProperties}>
                        {plotted.map(({ commit, row }, index) => (
                          <li key={commit.hash} className={css.commitRow} style={{ '--row-index': index } as CSSProperties}>
                            <LaneGraph row={row} columns={columns} />
                            <code className={css.hash} title={commit.hash}>{commit.hash.slice(0, 12)}</code>
                            <span className={css.subject} title={commit.subject}>{commit.subject}</span>
                            <span className={css.refs} title={commit.refs.join(', ')}>
                              {commit.refs.map(ref => <Pill key={ref} active={ref.startsWith('HEAD')}>{ref}</Pill>)}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={css.copy}
                              aria-label={t('copyHash')}
                              onClick={() => { copyHash(commit.hash) }}
                            >
                              {copiedHash === commit.hash ? t('copied') : <IconCopyOutline16 />}
                            </Button>
                          </li>
                        ))}
                      </ol>
                    )}
                </article>
              </>
            )}
    </section>
  )
}
