/** One porcelain status entry. */
export interface GitStatusEntry {
  /**
   * Path relative to the work-tree root, which is also the directory every
   * mutation in this service runs from, so the value can be fed straight back
   * to stage, unstage, or discard.
   */
  path: string
  /** Source path of a rename or copy, absent for every other status pair. */
  origPath?: string
  index: string
  worktree: string
}

/** A compact Git commit graph row. */
export interface GitGraphEntry {
  hash: string
  parents: string[]
  subject: string
  refs: string[]
}

/**
 * Identity of the repository backing one workspace. `root` is the work-tree
 * root that owns every path this service reports; it is not the workspace
 * directory whenever the workspace is a subdirectory of the repository.
 */
export interface GitRepositoryView {
  /** Absolute work-tree root. */
  root: string
  /** Full hash of HEAD; absent in a repository whose branch has no commits. */
  head: string | null
  /** Attached branch name; absent while HEAD is detached. */
  branch: string | null
}

/** Local branch roster with the attached branch, when there is one. */
export interface GitBranchEntry {
  /** Attached branch name; absent while HEAD is detached. */
  current: string | null
  branches: string[]
}

/**
 * One graph read: the repository this workspace resolves to plus its commit
 * rows. A null `repository` is the definitional answer that the workspace
 * directory is outside every work tree, which is a separate state from a Git
 * read that failed.
 */
export interface GitGraphView {
  repository: GitRepositoryView | null
  entries: GitGraphEntry[]
}
