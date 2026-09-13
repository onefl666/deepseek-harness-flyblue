/** Git graph settings-section registration. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { GitBranchEntry, GitGraphView, GitStatusEntry } from '@deepseek-ai/dsh-workspace-git/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the renderer-owned slots service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Session root standard-hook merge (props.useSessions).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the Client Workspace service merge (ctx.workspaces) and the
// Workspace standard-hook merge (props.useWorkspaces).
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { GitGraphSection } from './section.tsx'
import type { GitGraphInjected } from './section.tsx'
import { zh, en } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { gitgraph: keyof typeof import('./locales.ts').zh } }

/**
 * Required services. The section chooses its scope from the framework's global
 * `useWorkspaces` seat, which the Workspace Controller backs, so `workspaces`
 * is the dependency behind that read rather than a service this plugin calls.
 */
export const inject = ['slots', 'locale', 'remote', 'remote.workspaceGit', 'workspaces']

/** Register the Web workbench Git graph entry. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('gitgraph', { zh, en }), 'ui-git-graph: dictionaries')
  const t = ctx.locale.bind('gitgraph')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'git-graph', order: 42, label: () => t('nav'), locale: 'gitgraph',
    inject: (): GitGraphInjected => ({
      graph: (workspaceId: WorkspaceId): Promise<RemoteResult<GitGraphView>> => ctx.remote.workspaceGit.graph(workspaceId),
      status: (workspaceId: WorkspaceId): Promise<RemoteResult<GitStatusEntry[]>> => ctx.remote.workspaceGit.status(workspaceId),
      branches: (workspaceId: WorkspaceId): Promise<RemoteResult<GitBranchEntry>> => ctx.remote.workspaceGit.branches(workspaceId),
      createBranch: (workspaceId: WorkspaceId, name: string) => ctx.remote.workspaceGit.createBranch(workspaceId, name),
      switchBranch: (workspaceId: WorkspaceId, name: string) => ctx.remote.workspaceGit.switchBranch(workspaceId, name),
      stage: (workspaceId: WorkspaceId, path: string) => ctx.remote.workspaceGit.stage(workspaceId, path),
      unstage: (workspaceId: WorkspaceId, path: string) => ctx.remote.workspaceGit.unstage(workspaceId, path),
      discard: (workspaceId: WorkspaceId, path: string, confirmed: boolean) =>
        ctx.remote.workspaceGit.discard(workspaceId, path, confirmed),
    }),
  }, GitGraphSection))
}
