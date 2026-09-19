/**
 * MCP server manager, browser half: the「MCP 服务器」settings section over the
 * Host's `mcpManager` Remote namespace. Connection state is pushed through the
 * forwarded `mcp/status` event, so a reconnect or a dropped server updates the
 * status mark without another listing call.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the generated Remote namespaces and the ctx.remote merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the renderer-owned slots service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Workspace UI's GlobalStandardProps merge (props.useWorkspaces).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { McpManagerSection } from './McpManagerSection.tsx'
import type { McpManagerSectionInjected } from './McpManagerSection.tsx'
import { NS, en, zh, type McpManagerKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP server management page copy. */
    'settings.mcp': McpManagerKey
  }
}

/** Required services: the slot registry, dictionaries, and the generated Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.mcpManager']

/** Section position right after the skill manager's section. */
const ORDER = 35

/**
 * Register the MCP server management settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mcp-manager: dictionaries')
  const t = ctx.locale.bind(NS)
  const remote = ctx.remote.mcpManager
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp',
    order: ORDER,
    label: () => t('nav'),
    locale: NS,
    inject: (): McpManagerSectionInjected => ({
      list: scope => remote.list({ scope }),
      save: (scope, config) => remote.save({ scope, config }),
      remove: (scope, serverName) => remote.uninstall({ scope, serverName }),
      setEnabled: (scope, serverName, enabled) => remote.setEnabled({ scope, serverName, enabled }),
      restart: (scope, serverName) => remote.restart({ scope, serverName }),
      setStaticEnabled: (entryId, enabled) => remote.setStaticEnabled({ entryId, enabled }),
      subscribeStatus: listener => ctx.remote.$on('mcp/status', () => { listener() }),
    }),
  }, McpManagerSection))
}
