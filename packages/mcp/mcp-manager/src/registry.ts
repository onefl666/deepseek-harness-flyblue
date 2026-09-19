/**
 * Per-scope MCP server registry: one JSON document per scope, read and written
 * under the shared cross-process file lock so a second Host cannot interleave a
 * read-modify-write. A missing document is an empty registry; a malformed one
 * fails loud rather than silently dropping the user's servers.
 *
 * @module
 */

import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { McpScope, McpServerConfigView } from './types.ts'
import type { ResolvedMcpManagerConfig } from './index.ts'

/** One stored server definition. */
export interface McpServerRecord {
  /** Whether the instance should run. */
  readonly enabled: boolean
  /** Complete `mcp-client` configuration for this server. */
  readonly config: McpServerConfigView
}

/** The whole registry document. */
export interface McpRegistry {
  readonly formatVersion: 1
  readonly servers: readonly McpServerRecord[]
}

/** The one registry format this build reads and writes. */
export const REGISTRY_FORMAT_VERSION = 1

/** A registry document that cannot be read as one. */
export class McpRegistryError extends Error {
  /**
   * @param path - document that failed to parse.
   * @param detail - what was wrong with it.
   */
  constructor(readonly path: string, detail: string) {
    super(`mcp-manager: ${path} is not a usable server registry: ${detail}`)
    this.name = 'McpRegistryError'
  }
}

/**
 * Absolute registry path for one scope. A project registry sits under the
 * workspace directory the caller selected, beside the skills the same scope
 * writes; the manager owns this document, so it reads no provider's roots.
 *
 * @param config - Resolved manager configuration.
 * @param scope - User or workspace scope to resolve.
 * @returns the document this scope reads and writes.
 */
export function registryPath(config: ResolvedMcpManagerConfig, scope: McpScope): string {
  if (scope.kind === 'user') return join(resolveDshHome(config.dshHome), config.registryFileName)
  return join(resolve(scope.cwd), '.dsh', config.registryFileName)
}

/** Parse one document, rejecting anything that is not this format. */
function parseRegistry(path: string, text: string): McpRegistry {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error: unknown) {
    throw new McpRegistryError(path, `it is not valid JSON (${error instanceof Error ? error.message : String(error)})`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new McpRegistryError(path, 'it is not an object')
  }
  const document = value as { formatVersion?: unknown; servers?: unknown }
  if (document.formatVersion !== REGISTRY_FORMAT_VERSION || !Array.isArray(document.servers)) {
    throw new McpRegistryError(path, `it does not declare formatVersion ${String(REGISTRY_FORMAT_VERSION)} with a servers array`)
  }
  const servers: McpServerRecord[] = []
  for (const entry of document.servers) {
    if (entry === null || typeof entry !== 'object') throw new McpRegistryError(path, 'a server record is not an object')
    const record = entry as { enabled?: unknown; config?: unknown }
    if (typeof record.enabled !== 'boolean') throw new McpRegistryError(path, 'a server record has no boolean enabled')
    if (record.config === null || typeof record.config !== 'object') {
      throw new McpRegistryError(path, 'a server record has no config object')
    }
    servers.push({ enabled: record.enabled, config: record.config as McpServerConfigView })
  }
  return { formatVersion: REGISTRY_FORMAT_VERSION, servers }
}

/**
 * Read one scope's registry. A missing document is an empty registry.
 *
 * @param path - absolute registry path.
 * @returns the parsed document.
 * @throws McpRegistryError when the document exists but is not this format.
 */
export async function readRegistry(path: string): Promise<McpRegistry> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
      return { formatVersion: REGISTRY_FORMAT_VERSION, servers: [] }
    }
    throw error
  }
  return parseRegistry(path, text)
}

/**
 * Apply one change to a scope's registry under the cross-process lock, so a
 * concurrent writer can never lose the other's servers.
 *
 * @param path - absolute registry path.
 * @param change - pure function from the current document to the next one.
 * @returns the document that was written.
 * @throws McpRegistryError when the existing document is not this format.
 */
export async function updateRegistry(
  path: string,
  change: (current: McpRegistry) => McpRegistry,
): Promise<McpRegistry> {
  // The lock file lives beside the document, so its directory must exist
  // before the lock is taken — a project scope's `.dsh` often does not yet.
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  return await withFileLock(path, async () => {
    const next = change(await readRegistry(path))
    await writeFileAtomic(path, `${JSON.stringify(next, undefined, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
    return next
  })
}
