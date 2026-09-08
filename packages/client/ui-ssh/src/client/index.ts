/** SSH operations settings-section registration. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the renderer-owned slots service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { SshSection } from './section.tsx'
import { zh, en } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { ssh: keyof typeof import('./locales.ts').zh } }
export const inject = ['slots', 'locale', 'remote', 'remote.ssh']
/** Register the Web workbench usage entry. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('ssh', { zh, en }), 'ui-ssh: dictionaries')
  const t = ctx.locale.bind('ssh')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'ssh', order: 44, label: () => t('nav'), locale: 'ssh',
    inject: () => ({
      list: () => ctx.remote.ssh.list(),
      put: host => ctx.remote.ssh.put(host as Parameters<typeof ctx.remote.ssh.put>[0]),
      remove: (id: string) => ctx.remote.ssh.remove(id as Parameters<typeof ctx.remote.ssh.remove>[0]),
      exec: (id: string, command: string) => ctx.remote.ssh.exec(id as Parameters<typeof ctx.remote.ssh.exec>[0], command),
    }),
  }, SshSection))
}
