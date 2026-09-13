import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { resolveWorkspaceId, sessionWorkspaceId, shortHead, workspaceNamed } from '../src/client/workspace-scope.ts'

const space = (name: string, path: string): WorkspaceView => ({
  workspaceId: name as WorkspaceId,
  path,
  title: name,
  sessionIds: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
})

const row = (cwd: string): SessionSummary => ({
  id: 's-1' as SessionId,
  displayTitle: 'session',
  cwd,
  running: false,
  blank: false,
  updatedAt: 0,
})

const one = (cwd: string | undefined): Readonly<Record<SessionId, SessionSummary>> =>
  (cwd === undefined ? {} : { ['s-1' as SessionId]: row(cwd) })

const WORKSPACES = [space('ws-1', '/work/one'), space('ws-2', '/work/two')]

describe('sessionWorkspaceId', () => {
  it('matches the open session to its workspace by path', () => {
    expect(sessionWorkspaceId(WORKSPACES, 's-1' as SessionId, one('/work/two'))).toBe('ws-2')
  })

  it('reports nothing without an open session', () => {
    expect(sessionWorkspaceId(WORKSPACES, undefined, one('/work/two'))).toBeUndefined()
    expect(sessionWorkspaceId(WORKSPACES, 's-1' as SessionId, one(undefined))).toBeUndefined()
  })

  it('reports nothing for a directory no workspace holds', () => {
    expect(sessionWorkspaceId(WORKSPACES, 's-1' as SessionId, one('/work/three'))).toBeUndefined()
  })
})

describe('resolveWorkspaceId', () => {
  it('follows the open session\u2019s workspace', () => {
    expect(resolveWorkspaceId(WORKSPACES, 's-1' as SessionId, one('/work/two'), undefined)).toBe('ws-2')
  })

  it('honors an explicit choice over the session\u2019s workspace', () => {
    expect(resolveWorkspaceId(WORKSPACES, 's-1' as SessionId, one('/work/two'), 'ws-1' as WorkspaceId)).toBe('ws-1')
  })

  it('returns to the session\u2019s workspace once the choice is no longer registered', () => {
    expect(resolveWorkspaceId(WORKSPACES, 's-1' as SessionId, one('/work/two'), 'ws-gone' as WorkspaceId)).toBe('ws-2')
  })

  it('falls back to registry order without a session or a match', () => {
    expect(resolveWorkspaceId(WORKSPACES, undefined, one('/work/two'), undefined)).toBe('ws-1')
    expect(resolveWorkspaceId(WORKSPACES, 's-1' as SessionId, one('/work/three'), undefined)).toBe('ws-1')
  })

  it('reports nothing when no workspace is registered', () => {
    expect(resolveWorkspaceId([], 's-1' as SessionId, one('/work/two'), 'ws-1' as WorkspaceId)).toBeUndefined()
    expect(resolveWorkspaceId([], undefined, {}, undefined)).toBeUndefined()
  })
})

describe('workspaceNamed', () => {
  it('resolves the row id back to its workspace', () => {
    expect(workspaceNamed(WORKSPACES, 'ws-2', WORKSPACES[0]!).workspaceId).toBe('ws-2')
  })

  it('keeps the shown workspace when the id names none', () => {
    // The chooser's rows come from the registry, so a missing id means the
    // registry changed while the list was open.
    expect(workspaceNamed(WORKSPACES, 'ws-gone', WORKSPACES[0]!).workspaceId).toBe('ws-1')
  })
})

describe('shortHead', () => {
  it('abbreviates a commit hash', () => {
    expect(shortHead('abcdef1234567890')).toBe('abcdef1')
  })

  it('has nothing to abbreviate for a branch with no commits', () => {
    expect(shortHead(null)).toBe('')
  })
})
