/**
 * Skill manager: the Host owner of the `skillManager` Remote namespace, the
 * package's Client face being the settings section in `./client`.
 *
 * The manager owns skill *directories*, not the skill registry. It reads the
 * same four roots `dsh-skill-filesystem` discovers, writes new skills into the
 * scope's shared agent root, and expresses enablement as location: a disabled
 * skill moves into the root's disabled area, which the provider's depth-one
 * discovery never descends into. Every mutation therefore lands on disk and the
 * provider's own watcher publishes the change — no registry API is involved,
 * and no restart is required.
 *
 * @module @deepseek-ai/dsh-skill-manager
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import {
  SkillManagerError, createSkill, installDirectory, installGit, listSkills, readSkill,
  setSkillEnabled, uninstallSkill, updateSkill,
} from './managed-skills.ts'
import type {
  SkillCreateRequest, SkillInstallDirectoryRequest, SkillInstallGitRequest, SkillListView,
  SkillReadRequest, SkillReadValue, SkillScopeRequest, SkillSetEnabledRequest, SkillUninstallRequest,
  SkillUpdateRequest,
} from './types.ts'

export type * from './types.ts'

/** Manager configuration. */
export interface Config {
  /** DeepSeek Harness config root; defaults to `$DSH_HOME` or `~/.dsh`. */
  readonly dshHome?: string
  /** Shared agent config root; defaults to `$DSH_AGENTS_HOME` or `~/.agents`. */
  readonly agentsHome?: string
  /** Directory inside each skill root that holds the disabled skills. */
  readonly disabledDirName?: string
  /** Bundled read-only skill root; omission registers none. */
  readonly bundledSkillDir?: string
  /** Largest skill document or copied skill directory, in bytes. */
  readonly maxSkillBytes?: number
  /** Wall-clock limit for one repository clone, in milliseconds. */
  readonly installTimeoutMs?: number
  /** Executable used for repository installs. */
  readonly gitExecutable?: string
}

/** Manager configuration with every default applied. */
export interface ResolvedSkillManagerConfig {
  readonly dshHome: string | undefined
  readonly agentsHome: string | undefined
  readonly disabledDirName: string
  readonly bundledSkillDir: string | undefined
  readonly maxSkillBytes: number
  readonly installTimeoutMs: number
  readonly gitExecutable: string
}

/**
 * Apply the deployment defaults and reject programmatic values Schemastery
 * would have normalized, so a bypass fails loud instead of reaching the
 * filesystem with an unusable shape.
 *
 * @param config - Raw plugin configuration.
 * @returns The same values with defaults applied.
 * @throws when a supplied value cannot name a directory or bound work.
 */
export function resolveSkillManagerConfig(config: Config = {}): ResolvedSkillManagerConfig {
  const disabledDirName = config.disabledDirName ?? '.disabled'
  if (disabledDirName.length === 0 || disabledDirName.includes('/') || disabledDirName.includes('\\')) {
    throw new Error('skill-manager: disabledDirName must be a single nonempty path segment')
  }
  const maxSkillBytes = config.maxSkillBytes ?? 1_048_576
  if (!Number.isInteger(maxSkillBytes) || maxSkillBytes < 1) {
    throw new Error('skill-manager: maxSkillBytes must be a positive integer')
  }
  const installTimeoutMs = config.installTimeoutMs ?? 120_000
  if (!Number.isInteger(installTimeoutMs) || installTimeoutMs < 1) {
    throw new Error('skill-manager: installTimeoutMs must be a positive integer')
  }
  return {
    dshHome: config.dshHome,
    agentsHome: config.agentsHome,
    disabledDirName,
    bundledSkillDir: config.bundledSkillDir,
    maxSkillBytes,
    installTimeoutMs,
    gitExecutable: config.gitExecutable ?? 'git',
  }
}

/**
 * Map a manager refusal onto the Remote failure vocabulary.
 *
 * @param error - The value thrown by a manager operation.
 * @returns The RemoteError the gateway should report.
 */
export function toRemoteError(error: unknown): RemoteError {
  if (error instanceof SkillManagerError) {
    const skillName = error.fields.name ?? ''
    switch (error.failure) {
      case 'not-found':
        return new RemoteError('skill-manager/not-found', error.message, { name: skillName })
      case 'conflict':
        return new RemoteError('skill-manager/conflict', error.message, { name: skillName })
      case 'read-only':
        return new RemoteError('skill-manager/read-only', error.message, { name: skillName })
      case 'rejected':
        return new RemoteError('skill-manager/rejected', error.message, { reason: error.fields.reason ?? error.message })
    }
  }
  const reason = error instanceof Error ? error.message : String(error)
  return new RemoteError('skill-manager/rejected', reason, { reason })
}

/** Remote-only service exposing skill-directory management. */
export class SkillManagerGateway extends TypertRemoteService {
  static Config: Schema<Config> = z.object({
    dshHome: z.string(),
    agentsHome: z.string(),
    disabledDirName: z.string().default('.disabled'),
    bundledSkillDir: z.string(),
    maxSkillBytes: z.number().default(1_048_576),
    installTimeoutMs: z.number().default(120_000),
    gitExecutable: z.string().default('git'),
  })

  private readonly config: ResolvedSkillManagerConfig

  /**
   * @param ctx - Host context.
   * @param config - Plugin configuration; every field has a deployment default.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'skillManager')
    this.config = resolveSkillManagerConfig(config)
  }

  /**
   * List every skill the addressed scope can see, managed and read-only alike.
   * @param request - Scope to list.
   * @returns Roots, the create target, and the skills ordered by name.
   * @throws RemoteError when the scope cannot be resolved.
   */
  @Remote('list')
  async list(request: SkillScopeRequest): Promise<SkillListView> {
    return await this.run(() => listSkills(this.ctx, this.config, request.scope))
  }

  /**
   * Read one skill's stored document.
   * @param request - Scope and skill name.
   * @returns The frontmatter block and the body.
   * @throws RemoteError when the skill is absent.
   */
  @Remote('read')
  async read(request: SkillReadRequest): Promise<SkillReadValue> {
    return await this.run(() => readSkill(this.ctx, this.config, request.scope, request.name))
  }

  /**
   * Author a new skill in the scope's create root.
   * @param request - Scope and the draft to write.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when the name is invalid or already taken.
   */
  @Remote('create')
  async create(request: SkillCreateRequest): Promise<SkillListView> {
    return await this.run(() => createSkill(this.ctx, this.config, request.scope, request.draft))
  }

  /**
   * Copy an existing skill directory into the scope's create root.
   * @param request - Scope and the source directory.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when the source is not a usable skill or the name is taken.
   */
  @Remote('installFromDirectory')
  async installFromDirectory(request: SkillInstallDirectoryRequest): Promise<SkillListView> {
    return await this.run(() => installDirectory(this.ctx, this.config, request.scope, request.path))
  }

  /**
   * Clone a git repository and install the skill it carries.
   * @param request - Scope, repository URL, and optional ref.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when the clone fails or the repository holds no single skill.
   */
  @Remote('installFromGit')
  async installFromGit(request: SkillInstallGitRequest): Promise<SkillListView> {
    return await this.run(() => installGit(this.ctx, this.config, request.scope, request.url, request.ref))
  }

  /**
   * Rewrite one managed skill.
   * @param request - Scope, current name, and replacement fields.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when the skill is absent, shipped, or renamed onto an existing name.
   */
  @Remote('update')
  async update(request: SkillUpdateRequest): Promise<SkillListView> {
    return await this.run(() => updateSkill(this.ctx, this.config, request.scope, request.name, request.draft))
  }

  /**
   * Delete one managed skill.
   * @param request - Scope and skill name.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when the skill is absent or shipped.
   */
  @Remote('uninstall')
  async uninstall(request: SkillUninstallRequest): Promise<SkillListView> {
    return await this.run(() => uninstallSkill(this.ctx, this.config, request.scope, request.name))
  }

  /**
   * Move one managed skill between its root and the root's disabled area.
   * @param request - Scope, skill name, and the state to reach.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when the skill is absent, shipped, or the target is occupied.
   */
  @Remote('setEnabled')
  async setEnabled(request: SkillSetEnabledRequest): Promise<SkillListView> {
    return await this.run(() => setSkillEnabled(this.ctx, this.config, request.scope, request.name, request.enabled))
  }

  /** Run one operation, translating every refusal into the Remote vocabulary. */
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error: unknown) {
      if (error instanceof RemoteError) throw error
      throw toRemoteError(error)
    }
  }
}

export default SkillManagerGateway
