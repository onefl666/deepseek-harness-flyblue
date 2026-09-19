/**
 * Browser-safe vocabulary of the skill-management surface: the scope, the
 * listing and read views, the mutation requests, and the failure codes.
 *
 * @module @deepseek-ai/dsh-skill-manager/types
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No skill with that name is installed in the addressed scope. */
    'skill-manager/not-found': { readonly name: string }
    /** A skill with that name already exists in the target root. */
    'skill-manager/conflict': { readonly name: string }
    /** The skill exists but its source is not one this manager may move or delete. */
    'skill-manager/read-only': { readonly name: string }
    /** Any other refusal: invalid name, missing or malformed `SKILL.md`, a failed install. */
    'skill-manager/rejected': { readonly reason: string }
  }
}

/** Which set of skill roots one request addresses. */
export type SkillScope =
  /** The harness home and shared agent home roots. */
  | { readonly kind: 'user' }
  /** The roots of the project containing `cwd`. */
  | { readonly kind: 'workspace'; readonly cwd: string }

/** One skill root the manager reads and, when managed, writes. */
export interface SkillRootView {
  /** Whether the root belongs to the user or to a project. */
  readonly kind: 'user' | 'project'
  /** Which convention the root follows, or `bundled` for a shipped read-only root. */
  readonly origin: 'dsh' | 'agents' | 'bundled'
  /** Absolute root directory. */
  readonly path: string
  /** Whether install, uninstall, and enable/disable may act inside this root. */
  readonly managed: boolean
}

/** One discoverable skill, from a managed or read-only root. */
export interface SkillEntryView {
  /** Kebab-case identifier from the skill's frontmatter. */
  readonly name: string
  /** Routing description from the skill's frontmatter. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Whether the skill currently sits in its root rather than the root's disabled area. */
  readonly enabled: boolean
  /** Absolute path of the instruction file, or of the disabled entry's file. */
  readonly path: string
  /** Root the skill was found in. */
  readonly kind: 'user' | 'project'
  /** Convention the owning root follows. */
  readonly origin: 'dsh' | 'agents' | 'bundled'
  /** Whether install, uninstall, and enable/disable may act on this entry. */
  readonly managed: boolean
}

/** One scope's complete listing. */
export interface SkillListView {
  /** Absolute directory a newly created skill is written into; absent when the scope exposes none. */
  readonly createRoot?: string
  /** Every root this scope reads, managed and read-only. */
  readonly roots: readonly SkillRootView[]
  /** Every skill found across those roots, ordered by name. */
  readonly skills: readonly SkillEntryView[]
}

/** One skill's stored text, split so an editor can leave frontmatter untouched. */
export interface SkillReadValue {
  /** Kebab-case identifier from the frontmatter. */
  readonly name: string
  /** Routing description from the frontmatter. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Absolute path of the instruction file. */
  readonly path: string
  /** Raw frontmatter block including its `---` fences, or empty when the file has none. */
  readonly frontmatter: string
  /** Everything after the frontmatter block, without a trailing newline. */
  readonly body: string
}

/** Author-supplied fields for a new or rewritten skill. */
export interface SkillDraft {
  /** Kebab-case identifier; also the directory name under the target root. */
  readonly name: string
  /** Routing description written to the frontmatter. */
  readonly description: string
  /** Optional extra routing guidance written to the frontmatter. */
  readonly whenToUse?: string
  /** Markdown instruction body. */
  readonly body: string
}

/** Request shape shared by every scope-addressed read. */
export interface SkillScopeRequest {
  /** Scope whose roots are read. */
  readonly scope: SkillScope
}

/** Request for one skill's stored text. */
export interface SkillReadRequest {
  /** Scope whose roots are read. */
  readonly scope: SkillScope
  /** Skill identifier to read. */
  readonly name: string
}

/** Request to author a new skill. */
export interface SkillCreateRequest {
  /** Scope whose create root receives the skill. */
  readonly scope: SkillScope
  /** Name, description, and body to write. */
  readonly draft: SkillDraft
}

/** Request to rewrite one managed skill. */
export interface SkillUpdateRequest {
  /** Scope owning the skill. */
  readonly scope: SkillScope
  /** Existing skill identifier. */
  readonly name: string
  /** Replacement fields. */
  readonly draft: SkillDraft
}

/** Request to copy a skill directory into a managed root. */
export interface SkillInstallDirectoryRequest {
  /** Scope that receives the copy. */
  readonly scope: SkillScope
  /** Absolute path of the source directory holding `SKILL.md`. */
  readonly path: string
}

/** Request to clone a git repository and copy the skill it carries. */
export interface SkillInstallGitRequest {
  /** Scope that receives the copy. */
  readonly scope: SkillScope
  /** Repository URL passed to `git clone`. */
  readonly url: string
  /** Optional branch or tag to clone. */
  readonly ref?: string
}

/** Request to delete one managed skill. */
export interface SkillUninstallRequest {
  /** Scope owning the skill. */
  readonly scope: SkillScope
  /** Existing skill identifier. */
  readonly name: string
}

/** Request to move one managed skill between its root and the root's disabled area. */
export interface SkillSetEnabledRequest {
  /** Scope owning the skill. */
  readonly scope: SkillScope
  /** Existing skill identifier. */
  readonly name: string
  /** Whether the skill should be discoverable. */
  readonly enabled: boolean
}
