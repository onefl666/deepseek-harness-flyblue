/**
 * Skill manager, browser half: the「技能」settings section over the Host's
 * `skillManager` Remote namespace.
 *
 * The section is a plain settings page — no store and no child slots — so the
 * injected face carries only Remote verbs and the component keeps its own view
 * state. Scope selection reads the shared Workspace roster through the
 * framework's root-scope `useWorkspaces` seat.
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
import { SkillManagerSection } from './SkillManagerSection.tsx'
import type { SkillManagerSectionInjected } from './SkillManagerSection.tsx'
import { NS, en, zh, type SkillManagerKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skill management page copy. */
    'settings.skills': SkillManagerKey
  }
}

/** Required services: the slot registry, dictionaries, and the generated Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.skillManager']

/** Section position after Plugins (15), CodeGraph (25), and Skills' siblings. */
const ORDER = 30

/**
 * Register the skill management settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-manager: dictionaries')
  const t = ctx.locale.bind(NS)
  const remote = ctx.remote.skillManager
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skills',
    order: ORDER,
    label: () => t('nav'),
    locale: NS,
    inject: (): SkillManagerSectionInjected => ({
      list: scope => remote.list({ scope }),
      read: (scope, name) => remote.read({ scope, name }),
      create: (scope, draft) => remote.create({ scope, draft }),
      update: (scope, name, draft) => remote.update({ scope, name, draft }),
      uninstall: (scope, name) => remote.uninstall({ scope, name }),
      setEnabled: (scope, name, enabled) => remote.setEnabled({ scope, name, enabled }),
      installFromDirectory: (scope, path) => remote.installFromDirectory({ scope, path }),
      installFromGit: (scope, url, ref) => ref === undefined
        ? remote.installFromGit({ scope, url })
        : remote.installFromGit({ scope, url, ref }),
    }),
  }, SkillManagerSection))
}
