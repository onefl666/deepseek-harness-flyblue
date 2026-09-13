import { execFile, execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import WorkspaceGitService from '../src/index.ts'
import type { Config } from '../src/index.ts'

/** The single registered workspace every case in this file addresses. */
const WORKSPACE = 'ws-1' as WorkspaceId

/**
 * Real Git is the subject of these cases, not a dependency they can mock: the
 * formats under test are Git's own output. A host without Git skips the file
 * instead of failing it, matching how the shell packages gate their executors.
 */
const gitAvailable = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

/** Run one fixture command, independent of the service under test. */
function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveResult, reject) => {
    execFile('git', [...args], { cwd, env: { ...process.env, LC_ALL: 'C' } }, (error, stdout, stderr) => {
      if (error !== null) { reject(new Error(stderr.trim() || error.message)); return }
      resolveResult(stdout)
    })
  })
}

/** Bind the service to one directory through a stub registry. */
function bench(path: string, config: Config = {}): WorkspaceGitService {
  const ctx = new Context()
  ctx.provide('workspaceRegistry', {
    get: (id: WorkspaceId) => (id === WORKSPACE ? { path } : undefined),
  } as never)
  return new WorkspaceGitService(ctx, config)
}

let sandbox = ''
let sequences = 0

/** A path under the sandbox that does not exist yet. */
function slot(): string {
  sequences += 1
  return join(sandbox, `case-${sequences}`)
}

/** A fresh directory under the sandbox. */
async function directory(): Promise<string> {
  const path = slot()
  await mkdir(path, { recursive: true })
  return path
}

/** Make one directory a repository whose unborn branch is `main`. */
async function init(root: string): Promise<void> {
  await git(root, ['init', '-q'])
  await git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  await git(root, ['config', 'user.name', 'Workspace Git Test'])
  await git(root, ['config', 'user.email', 'workspace-git@example.invalid'])
  await git(root, ['config', 'commit.gpgsign', 'false'])
  await git(root, ['config', 'core.autocrlf', 'false'])
}

/** A fresh repository holding one commit. */
async function repository(): Promise<string> {
  const root = await directory()
  await init(root)
  await writeFile(join(root, 'a.txt'), 'a\n')
  await git(root, ['add', '-A'])
  await git(root, ['commit', '-qm', 'first'])
  return root
}

/** Work-tree root as Git reports it, which is what the service must return. */
async function reportedRoot(cwd: string): Promise<string> {
  return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
}

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'dsh-workspace-git-'))
})

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe.skipIf(!gitAvailable)('workspace-git service', () => {
  describe('graph', () => {
    it('reports no repository for a directory outside every work tree', async () => {
      const path = await directory()
      await expect(bench(path).graph(WORKSPACE)).resolves.toEqual({ repository: null, entries: [] })
    })

    it('reports no repository for a workspace pointing at the metadata directory', async () => {
      const root = await repository()
      // Git answers `false` here rather than refusing, which is the second
      // shape of the repository-absent answer.
      await expect(bench(join(root, '.git')).graph(WORKSPACE)).resolves.toEqual({ repository: null, entries: [] })
    })

    it('identifies a repository whose branch has no commits yet', async () => {
      const root = await directory()
      await init(root)
      await expect(bench(root).graph(WORKSPACE)).resolves.toEqual({
        repository: { root: await reportedRoot(root), head: null, branch: 'main' },
        entries: [],
      })
    })

    it('returns commits newest first with their parents and refs', async () => {
      const root = await repository()
      await writeFile(join(root, 'b.txt'), 'b\n')
      await git(root, ['add', '-A'])
      await git(root, ['commit', '-qm', 'second'])
      await git(root, ['branch', 'dev'])

      const view = await bench(root).graph(WORKSPACE)
      expect(view.repository).toEqual({
        root: await reportedRoot(root),
        head: (await git(root, ['rev-parse', 'HEAD'])).trim(),
        branch: 'main',
      })
      expect(view.entries.map(entry => entry.subject)).toEqual(['second', 'first'])
      expect(view.entries[0]?.parents).toEqual([view.entries[1]?.hash])
      expect(view.entries[1]?.parents).toEqual([])
      expect(view.entries[0]?.refs).toContain('HEAD -> main')
      expect(view.entries[0]?.refs).toContain('dev')
    })

    it('orders every parent after its child', async () => {
      const root = await repository()
      await git(root, ['checkout', '-q', '-b', 'side'])
      await writeFile(join(root, 'side.txt'), 's\n')
      await git(root, ['add', '-A'])
      await git(root, ['commit', '-qm', 'side'])
      await git(root, ['checkout', '-q', 'main'])
      await writeFile(join(root, 'main.txt'), 'm\n')
      await git(root, ['add', '-A'])
      await git(root, ['commit', '-qm', 'main'])
      await git(root, ['merge', '-q', '--no-ff', '-m', 'merge side', 'side'])

      const entries = (await bench(root).graph(WORKSPACE)).entries
      const position = new Map(entries.map((entry, index) => [entry.hash, index]))
      // The lane assignment the client runs needs this property: a commit is
      // always read before the parents it opens lanes for.
      for (const entry of entries) {
        for (const parent of entry.parents) {
          expect(position.get(parent)).toBeGreaterThan(position.get(entry.hash)!)
        }
      }
      expect(entries[0]?.parents).toHaveLength(2)
    })

    it('bounds the graph by its configured limit', async () => {
      const root = await repository()
      for (const name of ['second', 'third']) {
        await writeFile(join(root, `${name}.txt`), `${name}\n`)
        await git(root, ['add', '-A'])
        await git(root, ['commit', '-qm', name])
      }
      const service = bench(root, { graphLimit: 2, timeoutMs: 10_000 })
      expect((await service.graph(WORKSPACE)).entries).toHaveLength(2)
    })
  })

  describe('status', () => {
    it('folds a rename into one entry and keeps untracked files separate', async () => {
      const root = await repository()
      await git(root, ['mv', 'a.txt', 'renamed.txt'])
      await writeFile(join(root, 'new.md'), 'n\n')
      await expect(bench(root).status(WORKSPACE)).resolves.toEqual([
        { index: 'R', worktree: ' ', path: 'renamed.txt', origPath: 'a.txt' },
        { index: '?', worktree: '?', path: 'new.md' },
      ])
    })

    it('reports paths from the work-tree root for a workspace below it', async () => {
      const root = await repository()
      await mkdir(join(root, 'sub'), { recursive: true })
      await writeFile(join(root, 'sub', 'tracked.txt'), 't\n')
      await git(root, ['add', '-A'])
      await git(root, ['commit', '-qm', 'sub'])
      await writeFile(join(root, 'sub', 'tracked.txt'), 'changed\n')

      const service = bench(join(root, 'sub'))
      expect((await service.graph(WORKSPACE)).repository?.root).toBe(await reportedRoot(root))
      await expect(service.status(WORKSPACE)).resolves.toEqual([
        { index: ' ', worktree: 'M', path: 'sub/tracked.txt' },
      ])
    })

    it('keeps Git\u2019s collapsed entry for a directory holding only untracked files', async () => {
      const root = await repository()
      await mkdir(join(root, 'loose'), { recursive: true })
      await writeFile(join(root, 'loose', 'x.txt'), 'x\n')
      await expect(bench(root).status(WORKSPACE)).resolves.toEqual([
        { index: '?', worktree: '?', path: 'loose/' },
      ])
    })

    it('refuses a status read for a workspace with no repository', async () => {
      const path = await directory()
      await expect(bench(path).status(WORKSPACE)).rejects.toThrow(/not a Git repository/)
    })

    it('surfaces a Git refusal that is not a missing repository', async () => {
      const path = await directory()
      await writeFile(join(path, '.git'), 'garbage\n')
      await expect(bench(path).graph(WORKSPACE)).rejects.toThrow(/invalid gitfile/)
    })

    it('reports a workspace directory Git cannot run in', async () => {
      await expect(bench(slot()).status(WORKSPACE))
        .rejects.toThrow(/git could not run in/)
    })

    it('refuses an unregistered workspace', async () => {
      const root = await repository()
      await expect(bench(root).status('ws-other' as WorkspaceId))
        .rejects.toThrow(/unknown workspace/)
    })
  })

  describe('branches', () => {
    it('lists local branches with the attached one', async () => {
      const root = await repository()
      await git(root, ['branch', 'dev'])
      await expect(bench(root).branches(WORKSPACE)).resolves.toEqual({
        current: 'main',
        branches: ['dev', 'main'],
      })
    })

    it('reports a detached HEAD without a synthetic branch row', async () => {
      const root = await repository()
      await git(root, ['checkout', '-q', '--detach', 'HEAD'])
      await expect(bench(root).branches(WORKSPACE)).resolves.toEqual({ current: null, branches: ['main'] })
      await expect(bench(root).graph(WORKSPACE)).resolves.toMatchObject({ repository: { branch: null } })
    })

    it('creates a branch at the current HEAD', async () => {
      const root = await repository()
      await bench(root).createBranch(WORKSPACE, 'feature')
      expect((await git(root, ['branch', '--format=%(refname:short)'])).split('\n').filter(Boolean))
        .toEqual(['feature', 'main'])
    })
  })

  describe('switchBranch', () => {
    it('switches to a clean local branch', async () => {
      const root = await repository()
      await git(root, ['branch', 'dev'])
      await bench(root).switchBranch(WORKSPACE, 'dev')
      await expect(bench(root).branches(WORKSPACE)).resolves.toEqual({ current: 'dev', branches: ['dev', 'main'] })
    })

    it('refuses to switch over a dirty tree', async () => {
      const root = await repository()
      await git(root, ['branch', 'dev'])
      await writeFile(join(root, 'a.txt'), 'changed\n')
      await expect(bench(root).switchBranch(WORKSPACE, 'dev')).rejects.toThrow(/not clean/)
    })

    it('refuses an unknown branch', async () => {
      const root = await repository()
      await expect(bench(root).switchBranch(WORKSPACE, 'nowhere')).rejects.toThrow(/unknown branch/)
    })

    it('refuses to switch while another Git operation is in progress', async () => {
      const root = await repository()
      await git(root, ['branch', 'dev'])
      await writeFile(join(root, '.git', 'MERGE_HEAD'), `${(await git(root, ['rev-parse', 'HEAD'])).trim()}\n`)
      await expect(bench(root).switchBranch(WORKSPACE, 'dev'))
        .rejects.toThrow(/operation is in progress/)
    })

    it('refuses a branch another worktree already holds', async () => {
      const root = await repository()
      await git(root, ['worktree', 'add', '-q', slot(), '-b', 'shared'])
      await expect(bench(root).switchBranch(WORKSPACE, 'shared'))
        .rejects.toThrow(/another worktree/)
    })
  })

  describe('index mutations', () => {
    it('stages, unstages, and discards after confirmation', async () => {
      const root = await repository()
      await writeFile(join(root, 'a.txt'), 'changed\n')
      const service = bench(root)

      await service.stage(WORKSPACE, 'a.txt')
      expect(await git(root, ['diff', '--cached', '--name-only'])).toBe('a.txt\n')
      await service.unstage(WORKSPACE, 'a.txt')
      expect(await git(root, ['diff', '--cached', '--name-only'])).toBe('')

      await expect(service.discard(WORKSPACE, 'a.txt', false)).rejects.toThrow(/confirmation-required/)
      await service.discard(WORKSPACE, 'a.txt', true)
      expect(await git(root, ['diff', '--name-only'])).toBe('')
    })

    it('stages the exact path status reported for a workspace below the work-tree root', async () => {
      const root = await repository()
      await mkdir(join(root, 'sub'), { recursive: true })
      await writeFile(join(root, 'sub', 'tracked.txt'), 't\n')
      await git(root, ['add', '-A'])
      await git(root, ['commit', '-qm', 'sub'])
      await writeFile(join(root, 'sub', 'tracked.txt'), 'changed\n')
      const service = bench(join(root, 'sub'))

      // The reported path is work-tree-root-relative and the mutation resolves
      // through that same root, so a reported path is usable as-is.
      const reported = (await service.status(WORKSPACE))[0]?.path ?? ''
      expect(reported).toBe('sub/tracked.txt')
      await service.stage(WORKSPACE, reported)
      expect(await git(root, ['diff', '--cached', '--name-only'])).toBe('sub/tracked.txt\n')
      await service.unstage(WORKSPACE, reported)
      expect(await git(root, ['diff', '--cached', '--name-only'])).toBe('')
    })

    it('stages a directory entry Git collapsed', async () => {
      const root = await repository()
      await mkdir(join(root, 'loose'), { recursive: true })
      await writeFile(join(root, 'loose', 'x.txt'), 'x\n')
      const service = bench(root)

      await service.stage(WORKSPACE, 'loose/')
      expect(await git(root, ['diff', '--cached', '--name-only'])).toBe('loose/x.txt\n')
    })

    it('rejects a path that escapes the work tree', async () => {
      const root = await repository()
      await expect(bench(root).stage(WORKSPACE, '../outside.txt'))
        .rejects.toThrow(/invalid relative path/)
    })

    it('surfaces a Git command that refuses', async () => {
      const root = await repository()
      await expect(bench(root).createBranch(WORKSPACE, 'not a branch name'))
        .rejects.toThrow(/workspace-git:/)
    })
  })
})
