/**
 * Filesystem core of the skill manager: which roots one scope reads, how the
 * skills in them are discovered, and the create/install/update/remove/enable
 * operations. Enablement is expressed as location — a skill sits either
 * directly in its root, where `dsh-skill-filesystem` discovers it, or in the
 * root's disabled area, which discovery never descends into (it inspects only
 * depth-one entries). Moving between the two is one same-filesystem rename, so
 * the operation is all-or-nothing and the provider's watcher invalidates the
 * catalog on its own.
 *
 * @module
 */

import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { resolveProjectRoot } from '@deepseek-ai/dsh-skill-filesystem'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { SkillDraft, SkillEntryView, SkillListView, SkillReadValue, SkillRootView, SkillScope } from './types.ts'
import type { ResolvedSkillManagerConfig } from './index.ts'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const execFileAsync = promisify(execFile)

/** How a manager operation failed, so the Remote can name the outcome. */
export type SkillFailure = 'not-found' | 'conflict' | 'read-only' | 'rejected'

/** A refused skill-manager operation carrying the failure the Remote reports. */
export class SkillManagerError extends Error {
  /**
   * @param failure - outcome class the Remote maps to a stable error code.
   * @param message - actionable text shown to the user.
   * @param fields - skill name and/or free-form reason for the error details.
   * @param options - optional cause, preserved for the host log.
   */
  constructor(
    readonly failure: SkillFailure,
    message: string,
    readonly fields: { readonly name?: string; readonly reason?: string } = {},
    options?: { readonly cause?: unknown },
  ) {
    super(message, options)
    this.name = 'SkillManagerError'
  }
}

/** One root the manager reads, and writes when `managed`. */
export interface ManagedRoot {
  readonly kind: 'user' | 'project'
  readonly origin: 'dsh' | 'agents' | 'bundled'
  readonly path: string
  readonly managed: boolean
}

/** One discovered skill document plus where it lives. */
interface RawSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly docPath: string
  readonly entryPath: string
  readonly enabled: boolean
  readonly managed: boolean
  readonly data: Record<string, unknown>
  readonly frontmatter: string
  readonly body: string
}

/** The shared agent home, following the provider's resolution order. */
function agentsHome(config: ResolvedSkillManagerConfig): string {
  return resolve(config.agentsHome ?? process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents'))
}

/** The disabled area of one root: a sibling directory inside it. */
function disabledDir(root: string, config: ResolvedSkillManagerConfig): string {
  return join(root, config.disabledDirName)
}

/**
 * Resolve every root one scope reads, in listing order: the harness home and
 * shared agent home for user scope, the project's two roots for workspace
 * scope, and the bundled root when the deployment sets one.
 *
 * @param ctx - Context that may carry the `fs` service used for the project-root walk.
 * @param config - Resolved manager configuration.
 * @param scope - User or workspace scope to resolve.
 * @returns Managed roots followed by any read-only root.
 */
export async function resolveManagedRoots(ctx: Context, config: ResolvedSkillManagerConfig, scope: SkillScope): Promise<ManagedRoot[]> {
  const roots: ManagedRoot[] = []
  if (scope.kind === 'user') {
    roots.push(
      { kind: 'user', origin: 'dsh', path: join(resolveDshHome(config.dshHome), 'skills'), managed: true },
      { kind: 'user', origin: 'agents', path: join(agentsHome(config), 'skills'), managed: true },
    )
  } else {
    const projectRoot = await resolveProjectRoot(ctx, scope.cwd)
    roots.push(
      { kind: 'project', origin: 'dsh', path: join(projectRoot, '.dsh/skills'), managed: true },
      { kind: 'project', origin: 'agents', path: join(projectRoot, '.agents/skills'), managed: true },
    )
  }
  if (config.bundledSkillDir !== undefined) {
    roots.push({ kind: 'user', origin: 'bundled', path: resolve(config.bundledSkillDir), managed: false })
  }
  return roots
}

/** The root a newly created skill is written into: the scope's shared agent root. */
function createRootOf(roots: readonly ManagedRoot[]): ManagedRoot | undefined {
  return roots.find(root => root.managed && root.origin === 'agents')
}

async function pathKind(path: string): Promise<'file' | 'directory' | 'absent'> {
  try {
    const info = await stat(path)
    if (info.isDirectory()) return 'directory'
    return info.isFile() ? 'file' : 'absent'
  } catch {
    return 'absent'
  }
}

/**
 * Split a skill document into its frontmatter and body. The provider's own
 * parser is broader; this reports only what listing and editing need.
 */
function parseDocument(text: string): { data: Record<string, unknown>; frontmatter: string; body: string } | undefined {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return undefined
  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === '---') {
      end = index
      break
    }
  }
  if (end < 0) return undefined
  const block = lines.slice(1, end)
  let data: unknown
  try {
    data = parseYaml(block.join('\n'))
  } catch {
    return undefined
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined
  return {
    data: data as Record<string, unknown>,
    frontmatter: ['---', ...block, '---'].join('\n'),
    body: lines.slice(end + 1).join('\n').trim(),
  }
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Read one candidate document into a skill, or undefined when it is not one. */
async function readCandidate(
  docPath: string,
  entryPath: string,
  enabled: boolean,
  managed: boolean,
  config: ResolvedSkillManagerConfig,
): Promise<RawSkill | undefined> {
  let text: string
  try {
    const info = await stat(docPath)
    if (info.size > config.maxSkillBytes) return undefined
    text = await readFile(docPath, 'utf8')
  } catch {
    return undefined
  }
  const parsed = parseDocument(text)
  if (parsed === undefined) return undefined
  const name = stringField(parsed.data, 'name')
  const description = stringField(parsed.data, 'description')
  if (name === undefined || description === undefined || !SKILL_NAME.test(name)) return undefined
  const whenToUse = stringField(parsed.data, 'whenToUse')
  return {
    name,
    description,
    ...whenToUse === undefined ? {} : { whenToUse },
    docPath,
    entryPath,
    enabled,
    managed,
    data: parsed.data,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  }
}

/** Discover the skills declared directly inside one directory. */
async function readDirectorySkills(
  directory: string,
  managed: boolean,
  enabled: boolean,
  config: ResolvedSkillManagerConfig,
): Promise<RawSkill[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const skills: RawSkill[] = []
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === config.disabledDirName) continue
    const entryPath = join(directory, entry.name)
    const docPath = entry.isDirectory()
      ? join(entryPath, 'SKILL.md')
      : entry.isFile() && entry.name.endsWith('.md') ? entryPath : undefined
    if (docPath === undefined) continue
    const skill = await readCandidate(docPath, entryPath, enabled, managed, config)
    if (skill !== undefined) skills.push(skill)
  }
  return skills
}

/** Every skill one root contributes, active entries and parked ones alike. */
async function readRootSkills(root: ManagedRoot, config: ResolvedSkillManagerConfig): Promise<RawSkill[]> {
  const active = await readDirectorySkills(root.path, root.managed, true, config)
  if (!root.managed) return active
  const parked = await readDirectorySkills(disabledDir(root.path, config), root.managed, false, config)
  return [...active, ...parked]
}

/**
 * Keep the first entry per name. Roots are listed in precedence order, matching
 * the provider's rank order, so a name shadowed by a nearer root appears once.
 */
function dedupeByRootOrder(skills: readonly SkillEntryView[]): SkillEntryView[] {
  const seen = new Set<string>()
  const kept: SkillEntryView[] = []
  for (const skill of skills) {
    if (seen.has(skill.name)) continue
    seen.add(skill.name)
    kept.push(skill)
  }
  return kept.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * List every skill one scope reads.
 *
 * @param ctx - Context that may carry the `fs` service used for the project-root walk.
 * @param config - Resolved manager configuration.
 * @param scope - User or workspace scope to list.
 * @returns Roots, the create target, and every discovered skill ordered by name.
 */
export async function listSkills(ctx: Context, config: ResolvedSkillManagerConfig, scope: SkillScope): Promise<SkillListView> {
  const roots = await resolveManagedRoots(ctx, config, scope)
  const found: SkillEntryView[] = []
  for (const root of roots) {
    for (const skill of await readRootSkills(root, config)) {
      found.push({
        name: skill.name,
        description: skill.description,
        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
        enabled: skill.enabled,
        path: skill.docPath,
        kind: root.kind,
        origin: root.origin,
        managed: root.managed,
      })
    }
  }
  const createRoot = createRootOf(roots)?.path
  return {
    ...createRoot === undefined ? {} : { createRoot },
    roots: roots.map((root): SkillRootView => ({
      kind: root.kind, origin: root.origin, path: root.path, managed: root.managed,
    })),
    skills: dedupeByRootOrder(found),
  }
}

/** Find one skill across the scope's roots, or fail with `not-found`. */
async function locateSkill(ctx: Context, config: ResolvedSkillManagerConfig, scope: SkillScope, name: string): Promise<RawSkill> {
  for (const root of await resolveManagedRoots(ctx, config, scope)) {
    for (const skill of await readRootSkills(root, config)) {
      if (skill.name === name) return skill
    }
  }
  throw new SkillManagerError('not-found', `skill "${name}" is not installed in this scope`, { name })
}

/** Refuse an operation on a skill the manager must not move or delete. */
function requireManaged(skill: RawSkill): void {
  if (!skill.managed) {
    throw new SkillManagerError(
      'read-only',
      `skill "${skill.name}" comes from a shipped root and cannot be changed`,
      { name: skill.name },
    )
  }
}

/** Reject a name that cannot become a directory inside a skill root. */
function requireName(name: string): void {
  if (!SKILL_NAME.test(name)) {
    throw new SkillManagerError(
      'rejected',
      `"${name}" is not a valid skill name — use lowercase letters, digits, and single hyphens`,
      { reason: `invalid skill name "${name}"` },
    )
  }
}

/** Render frontmatter fields and a body as one `SKILL.md` document. */
function renderDocument(fields: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(fields).trimEnd()}\n---\n\n${body.trim()}\n`
}

/** Write one skill document after enforcing the per-skill byte cap. */
async function writeSkillDocument(path: string, text: string, config: ResolvedSkillManagerConfig): Promise<void> {
  if (Buffer.byteLength(text, 'utf8') > config.maxSkillBytes) {
    throw new SkillManagerError(
      'rejected',
      `skill document exceeds the ${String(config.maxSkillBytes)} byte limit`,
      { reason: 'skill document too large' },
    )
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, text, { encoding: 'utf8', mode: 0o600 })
}

/** Total bytes of every regular file under one directory. */
async function directoryBytes(path: string): Promise<number> {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }
  let total = 0
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) total += await directoryBytes(child)
    else if (entry.isFile()) total += (await stat(child)).size
  }
  return total
}

/** Locate the single skill document inside a cloned repository. */
async function locateClonedSkill(root: string): Promise<string> {
  if (await pathKind(join(root, 'SKILL.md')) === 'file') return root
  const candidates: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.git') continue
    const direct = join(root, entry.name)
    if (await pathKind(join(direct, 'SKILL.md')) === 'file') {
      candidates.push(direct)
      continue
    }
    for (const grandchild of await readdir(direct, { withFileTypes: true })) {
      if (!grandchild.isDirectory()) continue
      const nested = join(direct, grandchild.name)
      if (await pathKind(join(nested, 'SKILL.md')) === 'file') candidates.push(nested)
    }
  }
  if (candidates.length === 1) return candidates[0] as string
  throw new SkillManagerError(
    'rejected',
    candidates.length === 0
      ? 'the repository contains no skill: nothing inside it declares a SKILL.md'
      : `the repository contains ${String(candidates.length)} skills; clone a repository that carries one`,
    { reason: 'repository holds no single skill' },
  )
}

/** Read the source skill of an install and confirm it is one. */
async function readInstallSource(source: string, config: ResolvedSkillManagerConfig): Promise<RawSkill> {
  if (await pathKind(source) !== 'directory') {
    throw new SkillManagerError('rejected', `${source} is not a directory`, { reason: 'source is not a directory' })
  }
  const skill = await readCandidate(join(source, 'SKILL.md'), source, true, true, config)
  if (skill === undefined) {
    throw new SkillManagerError(
      'rejected',
      `${source} is not a skill: it needs a SKILL.md whose frontmatter declares a valid name and description`,
      { reason: 'source has no usable SKILL.md' },
    )
  }
  return skill
}

/** Copy one prepared skill directory into the scope's create root. */
async function copyIntoCreateRoot(
  ctx: Context,
  config: ResolvedSkillManagerConfig,
  scope: SkillScope,
  source: string,
  skill: RawSkill,
): Promise<SkillListView> {
  const target = createRootOf(await resolveManagedRoots(ctx, config, scope))
  if (target === undefined) {
    throw new SkillManagerError(
      'rejected',
      'this deployment exposes no writable skill root for the scope',
      { reason: 'no writable skill root' },
    )
  }
  const destination = join(target.path, skill.name)
  if (await pathKind(destination) !== 'absent') {
    throw new SkillManagerError('conflict', `skill "${skill.name}" already exists`, { name: skill.name })
  }
  if (await directoryBytes(source) > config.maxSkillBytes) {
    throw new SkillManagerError(
      'rejected',
      `skill "${skill.name}" exceeds the ${String(config.maxSkillBytes)} byte limit`,
      { reason: 'skill directory too large' },
    )
  }
  await mkdir(target.path, { recursive: true, mode: 0o700 })
  await cp(source, destination, { recursive: true, errorOnExist: true, force: false })
  return await listSkills(ctx, config, scope)
}

/**
 * Read one skill's stored text.
 *
 * @param ctx - Context that may carry the `fs` service.
 * @param config - Resolved manager configuration.
 * @param scope - Scope owning the skill.
 * @param name - Skill identifier to read.
 * @returns The frontmatter block and the body, separated for an editor.
 */
export async function readSkill(
  ctx: Context,
  config: ResolvedSkillManagerConfig,
  scope: SkillScope,
  name: string,
): Promise<SkillReadValue> {
  const skill = await locateSkill(ctx, config, scope, name)
  return {
    name: skill.name,
    description: skill.description,
    ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
    path: skill.docPath,
    frontmatter: skill.frontmatter,
    body: skill.body,
  }
}

/**
 * Author a new skill in the scope's create root.
 *
 * @param ctx - Context that may carry the `fs` service.
 * @param config - Resolved manager configuration.
 * @param scope - Scope that receives the skill.
 * @param draft - Name, description, and body to write.
 * @returns The scope's refreshed listing.
 */
export async function createSkill(
  ctx: Context,
  config: ResolvedSkillManagerConfig,
  scope: SkillScope,
  draft: SkillDraft,
): Promise<SkillListView> {
  const target = createRootOf(await resolveManagedRoots(ctx, config, scope))
  if (target === undefined) {
    throw new SkillManagerError(
      'rejected',
      'this deployment exposes no writable skill root for the scope',
      { reason: 'no writable skill root' },
    )
  }
  requireName(draft.name)
  const directory = join(target.path, draft.name)
  if (await pathKind(directory) !== 'absent') {
    throw new SkillManagerError('conflict', `skill "${draft.name}" already exists`, { name: draft.name })
  }
  const fields: Record<string, unknown> = { name: draft.name, description: draft.description }
  if (draft.whenToUse !== undefined && draft.whenToUse.length > 0) fields.whenToUse = draft.whenToUse
  await writeSkillDocument(join(directory, 'SKILL.md'), renderDocument(fields, draft.body), config)
  return await listSkills(ctx, config, scope)
}

/**
 * Copy an existing skill directory into the scope's create root.
 *
 * @param ctx - Context that may carry the `fs` service.
 * @param config - Resolved manager configuration.
 * @param scope - Scope that receives the copy.
 * @param source - Absolute path of the directory holding `SKILL.md`.
 * @returns The scope's refreshed listing.
 */
export async function installDirectory(
  ctx: Context,
  config: ResolvedSkillManagerConfig,
  scope: SkillScope,
  source: string,
): Promise<SkillListView> {
  return await copyIntoCreateRoot(ctx, config, scope, source, await readInstallSource(source, config))
}

/**
 * Clone a git repository into a temporary directory and copy the skill it
 * carries into the scope's create root. The temporary directory is removed on
 * every path, including failure.
 *
 * @param ctx - Context that may carry the `fs` service.
 * @param config - Resolved manager configuration.
 * @param scope - Scope that receives the copy.
 * @param url - Repository URL passed to `git clone`.
 * @param ref - Optional branch or tag to clone.
 * @returns The scope's refreshed listing.
 */
export async function installGit(
  ctx: Context,
  config: ResolvedSkillManagerConfig,
  scope: SkillScope,
  url: string,
  ref: string | undefined,
): Promise<SkillListView> {
  const staging = await mkdtemp(join(tmpdir(), 'dsh-skill-manager-'))
  try {
    const args = ['clone', '--depth', '1', ...ref === undefined ? [] : ['--branch', ref], url, staging]
    try {
      await execFileAsync(config.gitExecutable, args, {
        timeout: config.installTimeoutMs,
        maxBuffer: config.maxSkillBytes,
        windowsHide: true,
      })
    } catch (error) {
      throw new SkillManagerError(
        'rejected',
        `git clone failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        { reason: 'git clone failed' },
        { cause: error },
      )
    }
    const source = await locateClonedSkill(staging)
    return await copyIntoCreateRoot(ctx, config, scope, source, await readInstallSource(source, config))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Rewrite one managed skill's frontmatter fields and body. Unknown frontmatter
 * keys are preserved; their formatting and comments are not.
 *
 * @param ctx - Context that may carry the `fs` service.
 * @param config - Resolved manager configuration.
 * @param scope - Scope owning the skill.
 * @param name - Existing skill identifier.
 * @param draft - Replacement fields.
 * @returns The scope's refreshed listing.
 */
export async function updateSkill(
  ctx: Context,
  config: ResolvedSkillManagerConfig,
  scope: SkillScope,
  name: string,
  draft: SkillDraft,
): Promise<SkillListView> {
  const skill = await locateSkill(ctx, config, scope, name)
  requireManaged(skill)
  if (draft.name !== name) requireName(draft.name)
  const fields: Record<string, unknown> = { ...skill.data, name: draft.name, description: draft.description }
  if (draft.whenToUse === undefined || draft.whenToUse.length === 0) delete fields.whenToUse
  else fields.whenToUse = draft.whenToUse
  // A flat skill is one `.md` file; a bundle skill is a directory holding
  // `SKILL.md`. Only the bundle form renames the entry itself.
  const flat = skill.docPath === skill.entryPath
  const entry = flat ? join(dirname(skill.docPath), `${draft.name}.md`) : join(dirname(skill.entryPath), draft.name)
  if (entry !== skill.entryPath) {
    if (await pathKind(entry) !== 'absent') {
      throw new SkillManagerError('conflict', `skill "${draft.name}" already exists`, { name: draft.name })
    }
    await rename(skill.entryPath, entry)
  }
  await writeSkillDocument(flat ? entry : join(entry, 'SKILL.md'), renderDocument(fields, draft.body), config)
  return await listSkills(ctx, config, scope)
}

/**
 * Delete one managed skill from its root.
 *
 * @param ctx - Context that may carry the `fs` service.
 * @param config - Resolved manager configuration.
 * @param scope - Scope owning the skill.
 * @param name - Existing skill identifier.
 * @returns The scope's refreshed listing.
 */
export async function uninstallSkill(
  ctx: Context,
  config: ResolvedSkillManagerConfig,
  scope: SkillScope,
  name: string,
): Promise<SkillListView> {
  const skill = await locateSkill(ctx, config, scope, name)
  requireManaged(skill)
  await rm(skill.entryPath, { recursive: true, force: true })
  return await listSkills(ctx, config, scope)
}

/**
 * Move one managed skill between its root and the root's disabled area.
 *
 * @param ctx - Context that may carry the `fs` service.
 * @param config - Resolved manager configuration.
 * @param scope - Scope owning the skill.
 * @param name - Existing skill identifier.
 * @param enabled - Whether the skill should be discoverable.
 * @returns The scope's refreshed listing.
 */
export async function setSkillEnabled(
  ctx: Context,
  config: ResolvedSkillManagerConfig,
  scope: SkillScope,
  name: string,
  enabled: boolean,
): Promise<SkillListView> {
  const skill = await locateSkill(ctx, config, scope, name)
  requireManaged(skill)
  if (skill.enabled === enabled) return await listSkills(ctx, config, scope)
  const owning = dirname(skill.entryPath)
  const root = enabled ? dirname(owning) : owning
  const destination = enabled ? join(root, basename(skill.entryPath)) : join(disabledDir(root, config), basename(skill.entryPath))
  if (!enabled) await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  if (await pathKind(destination) !== 'absent') {
    throw new SkillManagerError(
      'conflict',
      `"${basename(destination)}" already exists in the target location`,
      { name },
    )
  }
  try {
    await rename(skill.entryPath, destination)
  } catch (error) {
    throw new SkillManagerError(
      'rejected',
      `skill "${name}" could not be moved: ${error instanceof Error ? error.message : String(error)}`,
      { name, reason: 'rename failed' },
      { cause: error },
    )
  }
  return await listSkills(ctx, config, scope)
}
