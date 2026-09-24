/**
 * Enforce intra-package domain layering inside `packages/client/*\/src/client/`.
 * verify-module-graph covers package-level edges; this gate covers the
 * directory level: independently owned domains may import `contract/` but
 * not each other. Explicitly grouped presentation folders form one domain;
 * only declared assembly files may import across domains.
 *
 * Layer model (lower may not import higher):
 *   0  contract/            shared contract API (types + slot declarations)
 *   1  <domain>/ + service  domain implementations (skeleton/, chat/, ...)
 *   2  apply.ts, index.ts   assembly point and re-export shell
 *
 * Run directly:
 *   pnpm exec tsx scripts/verify-client-domain-graph.ts
 */

import { globSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const CLIENT_DIR = join(root, 'packages/client')

/** Directory names treated as the shared contract layer (importable by all). */
const CONTRACT_DIRS = new Set(['contract'])
/** Top-level client files allowed to import across domains (assembly layer). */
const ASSEMBLY_FILES = new Set(['apply.ts', 'index.ts', 'index.tsx'])
/** Directory groups whose presentation and implementation files form one client domain. */
const INTEGRATED_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  'ui-conversation': ['input', 'skeleton'],
  'ui-sidebar-browser': ['browser', 'electron', 'view'],
  'ui-sidebar-documentpreview': ['code', 'document', 'excel', 'html', 'image', 'markdown', 'office', 'pdf', 'text', 'zoom'],
  'ui-workspace': ['rows', 'session-actions'],
}
/** Top-level composition files for packages with integrated client domains. */
const PACKAGE_ASSEMBLY_FILES: Readonly<Record<string, readonly string[]>> = {
  'ui-sidebar-browser': ['pages.ts'],
  'ui-sidebar-documentpreview': ['TextPreview.tsx', 'face.ts', 'store.ts'],
}

interface Violation { file: string; imported: string; reason: string }

/** Recursively list .ts/.tsx files under dir (relative paths). */
function listSources(dir: string): string[] {
  return globSync('**/*.{ts,tsx}', { cwd: dir })
    .map(rel => rel.split(sep).join('/'))
    .filter(rel => !/\.legacy\./.test(rel.slice(rel.lastIndexOf('/') + 1)))
    .sort()
}

/** First path segment of a client-relative file, or '' for top-level files. */
function domainOf(rel: string): string {
  const ix = rel.indexOf('/')
  return ix === -1 ? '' : rel.slice(0, ix)
}

/** Package-aware domain identity for integrated client implementations. */
export function clientDomain(pkgName: string, rel: string): string {
  const domain = domainOf(rel)
  return INTEGRATED_DOMAINS[pkgName]?.includes(domain) === true ? '@integrated' : domain
}

/** Whether one top-level file owns assembly for its package. */
export function isClientAssembly(pkgName: string, rel: string): boolean {
  return ASSEMBLY_FILES.has(rel) || PACKAGE_ASSEMBLY_FILES[pkgName]?.includes(rel) === true
}

/**
 * Resolve one relative import to a client-directory-relative path.
 * @param file - Importing file relative to `src/client`.
 * @param specifier - Relative module specifier from that file.
 * @returns Normalized path, preserving leading `..` segments outside `src/client`.
 */
export function resolveClientImport(file: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(file), specifier))
}

function checkPackage(pkgName: string, clientDir: string): Violation[] {
  const violations: Violation[] = []
  const files = listSources(clientDir)
  for (const rel of files) {
    const fromDomain = clientDomain(pkgName, rel)
    const isAssembly = fromDomain === '' && isClientAssembly(pkgName, rel)
    if (isAssembly) continue
    const source = readFileSync(join(clientDir, rel), 'utf8')
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const spec = match[1]
      if (spec === undefined) continue
      const target = resolveClientImport(rel, spec)
      if (target === '..' || target.startsWith('../')) continue // package-level rules govern
      const toDomain = clientDomain(pkgName, target)
      if (toDomain === '' || CONTRACT_DIRS.has(toDomain)) continue // top-level shared file or contract layer
      if (fromDomain === toDomain) continue // inside one domain
      violations.push({
        file: `${pkgName}/src/client/${rel}`,
        imported: spec,
        reason: fromDomain === ''
          ? `top-level non-assembly file imports domain "${toDomain}" (only apply/index may assemble)`
          : `domain "${fromDomain}" imports sibling domain "${toDomain}" (route shared API through contract/)`,
      })
    }
  }
  return violations
}

function main(): void {
  const violations: Violation[] = []
  for (const pkg of readdirSync(CLIENT_DIR)) {
    const clientDir = join(CLIENT_DIR, pkg, 'src/client')
    try {
      if (!statSync(clientDir).isDirectory()) continue
    } catch {
      // No client half in this package — nothing to layer-check.
      continue
    }
    violations.push(...checkPackage(pkg, clientDir))
  }

  if (violations.length > 0) {
    console.error(`verify-client-domain-graph: ${violations.length} violation(s):`)
    for (const v of violations) console.error(`  ${v.file} -> ${v.imported}\n    ${v.reason}`)
    process.exitCode = 1
    return
  }
  console.log('verify-client-domain-graph: client domain layering clean.')
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
