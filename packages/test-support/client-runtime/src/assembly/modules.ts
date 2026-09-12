/**
 * In-process module arrival: import every roster row's `/client` module (or
 * the plan's replacement) and register each as a pre-arrived factory on a
 * production `ClientModuleSystem`, so neither the Loader's `internal.import`
 * nor a stage-one `prefetch` ever fetches a bundle.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/modules
 */
import * as modulesClient from '@deepseek-ai/dsh-client-modules/client'
import { createClientModuleSystem } from '@deepseek-ai/dsh-client-modules/client'
import type { ClientModuleLoader, ClientModuleLoaderTarget, WebBootGraph } from '@deepseek-ai/dsh-client-modules/client'
import { loadFragmentPlugin } from './fragment-plugin.ts'
import type { AssemblyPlan, ClientPluginModule } from './roster.ts'

/** The bootstrap row: always this process's static namespace, never a dynamic import or a `provide` replacement. */
export const MODULES_PACKAGE = '@deepseek-ai/dsh-client-modules'

/**
 * Resolve each roster row to its plugin module: `plan.provide[name]` when
 * present, otherwise a `/client` import resolved by the repository's tsconfig
 * path aliases under Vitest. The bootstrap row is the
 * statically imported `@deepseek-ai/dsh-client-modules/client` namespace.
 *
 * A row whose `/client` entry is a ModuleLoader artifact — a third-party
 * package built for the browser rather than emitted as ESM — falls back to
 * {@link loadFragmentPlugin}, because no test runner can import one.
 * @param plan - validated plan.
 * @returns package name → module, in roster order.
 * @throws {Error} when an import fails (the package name prefixes the original message) or the bootstrap row is provided.
 */
export async function loadPluginModules(plan: AssemblyPlan): Promise<ReadonlyMap<string, ClientPluginModule>> {
  const modules = new Map<string, ClientPluginModule>()
  for (const { name } of plan.roster.rows) {
    const provided = plan.provide?.[name]
    if (name === MODULES_PACKAGE) {
      if (provided !== undefined) {
        throw new Error(`client-test-runtime: ${MODULES_PACKAGE} is the bootstrap module and cannot be provided`)
      }
      modules.set(name, modulesClient)
      continue
    }
    modules.set(name, provided ?? await importClient(name))
  }
  return modules
}

async function importClient(name: string): Promise<ClientPluginModule> {
  try {
    return await import(/* @vite-ignore */ `${name}/client`) as ClientPluginModule
  } catch (error) {
    try {
      return loadFragmentPlugin(name)
    } catch (fallbackError) {
      throw new Error(
        `client-test-runtime: cannot import ${name}/client: ${String(error)}`
        + `; ${name} is not a browser-fragment package either: ${String(fallbackError)}`,
        { cause: error },
      )
    }
  }
}

/**
 * Build the production module system over queued factories returning the
 * loaded namespaces. The bootstrap row uses `bootstrapModule`; `staticModules`
 * is empty because namespaces already hold their own imports. Missing factories
 * reject through `loadBundle` without fetching.
 * @param graph - raw boot graph from `graphFromRoster`; `createClientModuleSystem` parses it.
 * @param modules - loaded plugin modules keyed by package name.
 * @returns module system to install as `loader.internal`; its `manifest` is the parsed graph.
 */
export function createInProcessModules(
  graph: WebBootGraph,
  modules: ReadonlyMap<string, ClientPluginModule>,
): ClientModuleLoader {
  const target: ClientModuleLoaderTarget = {
    mode: 'queue',
    pendingQueue: [],
    /* v8 ignore next -- construction replaces this sink before draining the prefilled queue. */
    load: () => { throw new Error('client-test-runtime: module facade is not initialized') },
    create: options => createClientModuleSystem(target, { id: MODULES_PACKAGE, exports: modulesClient }, options),
  }
  for (const [id, namespace] of modules) {
    if (id === MODULES_PACKAGE) continue
    target.pendingQueue.push({ id, factory: () => namespace as unknown as Record<string, unknown> })
  }
  return target.create({
    boot: graph,
    staticModules: {},
    loadBundle: url => Promise.reject(new Error(`client-test-runtime: in-process modules never load bundles (${url})`)),
  })
}
