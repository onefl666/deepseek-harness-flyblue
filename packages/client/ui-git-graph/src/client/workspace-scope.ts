/**
 * Pure resolution of the workspace identities a Git surface works with: which
 * registered workspace it shows, which one the open session belongs to, and how
 * that workspace's repository state is named. All of it is a function of the
 * two framework snapshots, so it lives here rather than in the components that
 * render it.
 */

import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Find the workspace holding the current session. A session records its
 * directory, and a workspace records its own, so the two are matched by path —
 * the same rule the workspace navigation policy uses.
 * @param workspaces - Registered workspaces in registry order.
 * @param currentSessionId - Session currently open, when one is.
 * @param sessionsById - Session rows holding each session's directory.
 * @returns the owning workspace, or undefined when the session's directory is not registered.
 */
export function sessionWorkspaceId(
  workspaces: readonly WorkspaceView[],
  currentSessionId: SessionId | undefined,
  sessionsById: Readonly<Record<SessionId, SessionSummary>>,
): WorkspaceId | undefined {
  const cwd = currentSessionId === undefined ? undefined : sessionsById[currentSessionId]?.cwd
  if (cwd === undefined) return undefined
  return workspaces.find(item => item.path === cwd)?.workspaceId
}

/**
 * Resolve the workspace to show. An explicit choice wins while it still names a
 * registered workspace, so a deletion returns the panel to the session's own
 * workspace instead of showing nothing.
 * @param workspaces - Registered workspaces in registry order.
 * @param currentSessionId - Session currently open, when one is.
 * @param sessionsById - Session rows holding each session's directory.
 * @param preferred - Operator choice, when one was made.
 * @returns the workspace id, or undefined when none is registered.
 */
export function resolveWorkspaceId(
  workspaces: readonly WorkspaceView[],
  currentSessionId: SessionId | undefined,
  sessionsById: Readonly<Record<SessionId, SessionSummary>>,
  preferred?: WorkspaceId,
): WorkspaceId | undefined {
  if (preferred !== undefined && workspaces.some(item => item.workspaceId === preferred)) return preferred
  return sessionWorkspaceId(workspaces, currentSessionId, sessionsById) ?? workspaces[0]?.workspaceId
}

/**
 * Resolve a workspace chooser row back to the workspace it names.
 * @param workspaces - Registered workspaces.
 * @param id - Row id the chooser emitted.
 * @param fallback - Workspace to keep when the id names none, which is what a
 * registry change between opening the chooser and picking from it produces.
 * @returns the named workspace, or the fallback.
 */
export function workspaceNamed(
  workspaces: readonly WorkspaceView[],
  id: string,
  fallback: WorkspaceView,
): WorkspaceView {
  return workspaces.find(item => item.workspaceId === id) ?? fallback
}

/**
 * Abbreviate a HEAD hash for display.
 * @param head - full hash, or null for a branch that has no commits yet.
 * @returns the first seven characters, or an empty string with no commits.
 */
export function shortHead(head: string | null): string {
  return head === null ? '' : head.slice(0, 7)
}
