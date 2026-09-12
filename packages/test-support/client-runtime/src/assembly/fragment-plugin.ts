/**
 * Browser-fragment plugin loading: evaluate a third-party package's client
 * sources into the plugin module the Loader materializes.
 *
 * `dsh.client` plugins are published as ModuleLoader artifacts — the DSH
 * server serves `lib/client.js` to a browser, which evaluates it against
 * `window.__ModuleLoader__`. A test runner imports the client half as an ES
 * module instead, and GitHub-installed third-party packages carry no build
 * step this repository can rely on, so a package that publishes its client
 * half as the conventional fragment pair is evaluated here:
 *
 * - `src/ds-*.js` — the Web Component source, which registers its custom
 *   element at module scope;
 * - `src/client.js` — the plugin fragment, which ends with `return { … }` and
 *   expects the component in the same function scope.
 *
 * `scripts/build-client.mjs` in such a package applies the same two rules,
 * stripping the standalone timer bootstrap from the component before
 * concatenating. `new Function` reproduces that scope contract while keeping a
 * real module export; `require` reaches React against the package's own
 * resolution paths, where its `package.json` declares it.
 *
 * The package itself is located through this module's resolution paths, so a
 * third-party row must be a declared dependency of this package for it to
 * load here.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/fragment-plugin
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import type { ClientPluginModule } from './roster.ts'

/** The component source's standalone-only section, stripped from the client half. */
const STANDALONE_START = '// __DS_EFFORT_STANDALONE_BOOTSTRAP__'
const STANDALONE_END = '// __DS_EFFORT_STANDALONE_BOOTSTRAP_END__'

/** Fragment entry this loader evaluates; the build script's own name for it. */
const CLIENT_FRAGMENT = 'src/client.js'

/**
 * Read the plugin specifier's package root through its own resolution paths.
 * @param require - a require scoped to that package.
 * @param specifier - the package name.
 * @returns the package directory, ending in a separator.
 */
function locatePackageRoot(require: NodeJS.Require, specifier: string): string {
  return dirname(require.resolve(`${specifier}/package.json`)) + '/'
}

/** Strip the standalone-only section, exactly as the package's build script does. */
function withoutStandaloneSection(source: string): string {
  const start = source.indexOf(STANDALONE_START)
  const end = source.indexOf(STANDALONE_END)
  if (start < 0 || end <= start) return source
  return source.slice(0, start) + source.slice(end + STANDALONE_END.length)
}

/**
 * Evaluate one browser-fragment package's client half.
 * @param specifier - the package name, as the roster carries it.
 * @returns the plugin module its fragments return.
 * @throws {Error} when the specifier does not resolve from this module, when
 * the package publishes no fragment pair, or when the sources do not evaluate
 * to a module with an `apply` function.
 */
export function loadFragmentPlugin(specifier: string): ClientPluginModule {
  // Anchored on this module rather than the process cwd: the client build face types `process` without
  // `cwd`, and a `URL` here would resolve against jsdom's `URL`, not `node:url`, under Vitest.
  const anchor = createRequire(import.meta.url)
  let root: string
  try {
    root = locatePackageRoot(anchor, specifier)
  } catch (error) {
    throw new Error(`client-test-runtime: cannot resolve ${specifier} from the test runtime`, { cause: error })
  }
  const sourceDir = join(root, 'src')
  let entries: string[]
  try {
    entries = readdirSync(sourceDir)
  } catch (error) {
    throw new Error(`client-test-runtime: ${specifier} publishes no src/ fragment directory`, { cause: error })
  }
  const fragment = entries.find(entry => `src/${entry}` === CLIENT_FRAGMENT)
  const component = entries.find(entry => entry.startsWith('ds-') && entry.endsWith('.js'))
  if (fragment === undefined || component === undefined) {
    throw new Error(
      `client-test-runtime: ${specifier} publishes no browser-fragment pair; expected ${CLIENT_FRAGMENT}`
      + ` beside one ds-*.js component source, found ${entries.join(', ') || 'nothing'}`,
    )
  }
  const fragmentRequire = createRequire(`${root}${fragment}`)
  const react: unknown = fragmentRequire('react')
  const body = `${withoutStandaloneSection(readFileSync(join(sourceDir, component), 'utf8'))}\n`
    + readFileSync(join(sourceDir, fragment), 'utf8')
  // oxlint-disable-next-line typescript/no-implied-eval -- a fragment is a function body by contract, not a module
  const evaluate = new Function('React', 'require', body) as (
    react: unknown,
    require: NodeJS.Require,
  ) => ClientPluginModule
  const module = evaluate(react, fragmentRequire)
  if (typeof module.apply !== 'function') {
    throw new Error(`client-test-runtime: ${specifier} fragments evaluated to a module without apply()`)
  }
  return module
}
