/**
 * Behavior tests for the skill manager's filesystem core: discovery across the
 * managed roots, authoring, install, rewrite, removal, and the rename that
 * expresses enablement.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { resolveSkillManagerConfig } from '../src/index.ts'
import {
  SkillManagerError, createSkill, installDirectory, installGit, listSkills, readSkill,
  setSkillEnabled, uninstallSkill, updateSkill,
} from '../src/managed-skills.ts'
import type { ResolvedSkillManagerConfig } from '../src/index.ts'
import type { SkillScope } from '../src/types.ts'

let root: string
let config: ResolvedSkillManagerConfig
let ctx: Context
let scope: SkillScope

/** Write one skill directory with the given frontmatter fields. */
async function writeSkill(parent: string, name: string, body: string, extra: Record<string, string> = {}): Promise<string> {
  const directory = join(parent, name)
  await mkdir(directory, { recursive: true })
  const front = ['---', `name: ${name}`, `description: describe ${name}`, ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`), '---'].join('\n')
  await writeFile(join(directory, 'SKILL.md'), `${front}\n\n${body}\n`, 'utf8')
  return directory
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'skill-manager-'))
  config = resolveSkillManagerConfig({
    dshHome: join(root, 'dsh'),
    agentsHome: join(root, 'agents'),
  })
  ctx = new Context()
  scope = { kind: 'user' }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('listSkills', () => {
  it('finds directory and flat skills across both user roots', async () => {
    await writeSkill(join(root, 'dsh', 'skills'), 'from-dsh', 'body')
    await writeSkill(join(root, 'agents', 'skills'), 'from-agents', 'body')
    await writeFile(join(root, 'agents', 'skills', 'flat.md'), '---\nname: flat\ndescription: a flat skill\n---\n\nbody\n', 'utf8')

    const listing = await listSkills(ctx, config, scope)
    expect(listing.skills.map(skill => skill.name)).toEqual(['flat', 'from-agents', 'from-dsh'])
    expect(listing.createRoot).toBe(join(root, 'agents', 'skills'))
    expect(listing.roots).toHaveLength(2)
  })

  it('hides skills parked in the disabled area from the enabled set', async () => {
    const skills = join(root, 'agents', 'skills')
    await writeSkill(skills, 'off', 'body')
    await setSkillEnabled(ctx, config, scope, 'off', false)

    const listing = await listSkills(ctx, config, scope)
    expect(listing.skills).toHaveLength(1)
    expect(listing.skills[0]).toMatchObject({ name: 'off', enabled: false, managed: true })
  })

  it('skips entries with unusable frontmatter instead of failing the listing', async () => {
    const skills = join(root, 'agents', 'skills')
    await mkdir(join(skills, 'nameless'), { recursive: true })
    await writeFile(join(skills, 'nameless', 'SKILL.md'), '---\ndescription: no name\n---\n\nbody\n', 'utf8')
    await writeSkill(skills, 'good', 'body')

    expect((await listSkills(ctx, config, scope)).skills.map(skill => skill.name)).toEqual(['good'])
  })

  it('lists a bundled root read-only', async () => {
    const bundled = join(root, 'bundled')
    await writeSkill(bundled, 'shipped', 'body')
    const withBundled = resolveSkillManagerConfig({
      dshHome: join(root, 'dsh'),
      agentsHome: join(root, 'agents'),
      bundledSkillDir: bundled,
    })
    const listing = await listSkills(ctx, withBundled, scope)
    expect(listing.skills[0]).toMatchObject({ name: 'shipped', managed: false, origin: 'bundled' })
  })

  it('resolves project roots from the workspace directory', async () => {
    const project = join(root, 'project')
    await mkdir(join(project, '.git'), { recursive: true })
    await writeSkill(join(project, '.agents', 'skills'), 'project-skill', 'body')
    const nested = join(project, 'packages', 'app')
    await mkdir(nested, { recursive: true })

    const listing = await listSkills(ctx, config, { kind: 'workspace', cwd: nested })
    expect(listing.skills.map(skill => skill.name)).toEqual(['project-skill'])
    expect(listing.skills[0]).toMatchObject({ kind: 'project', origin: 'agents' })
  })
})

describe('createSkill', () => {
  it('writes a SKILL.md into the shared agent root', async () => {
    await createSkill(ctx, config, scope, { name: 'fresh', description: 'a fresh skill', body: 'Do the thing.' })
    const text = await readFile(join(root, 'agents', 'skills', 'fresh', 'SKILL.md'), 'utf8')
    expect(text).toContain('name: fresh')
    expect(text).toContain('description: a fresh skill')
    expect(text).toContain('Do the thing.')
  })

  it('rejects a name that cannot become a directory', async () => {
    await expect(createSkill(ctx, config, scope, { name: 'Bad Name', description: 'x', body: '' }))
      .rejects.toMatchObject({ failure: 'rejected' })
  })

  it('refuses to overwrite an existing skill', async () => {
    await writeSkill(join(root, 'agents', 'skills'), 'taken', 'body')
    await expect(createSkill(ctx, config, scope, { name: 'taken', description: 'x', body: '' }))
      .rejects.toMatchObject({ failure: 'conflict' })
  })

  it('records optional routing guidance when the author supplies it', async () => {
    await createSkill(ctx, config, scope, {
      name: 'guided', description: 'x', whenToUse: 'when guiding', body: 'body',
    })
    const found = (await listSkills(ctx, config, scope)).skills[0]
    expect(found?.whenToUse).toBe('when guiding')
  })
})

describe('readSkill and updateSkill', () => {
  it('separates the frontmatter from the body', async () => {
    await writeSkill(join(root, 'agents', 'skills'), 'readable', 'The body.', { whenToUse: 'seldom' })
    const value = await readSkill(ctx, config, scope, 'readable')
    expect(value).toMatchObject({ name: 'readable', description: 'describe readable', whenToUse: 'seldom', body: 'The body.' })
    expect(value.frontmatter).toContain('name: readable')
  })

  it('rewrites the owned fields and keeps unknown frontmatter keys', async () => {
    await writeSkill(join(root, 'agents', 'skills'), 'kept', 'old body', { license: 'MIT' })
    await updateSkill(ctx, config, scope, 'kept', { name: 'kept', description: 'new description', body: 'new body' })
    const text = await readFile(join(root, 'agents', 'skills', 'kept', 'SKILL.md'), 'utf8')
    expect(text).toContain('description: new description')
    expect(text).toContain('new body')
    expect(text).toContain('license: MIT')
  })

  it('renames the directory when the name changes', async () => {
    await writeSkill(join(root, 'agents', 'skills'), 'before', 'body')
    await updateSkill(ctx, config, scope, 'before', { name: 'after', description: 'describe after', body: 'body' })
    expect((await listSkills(ctx, config, scope)).skills.map(skill => skill.name)).toEqual(['after'])
  })

  it('renames a flat skill file rather than its directory', async () => {
    const skills = join(root, 'agents', 'skills')
    await mkdir(skills, { recursive: true })
    await writeFile(join(skills, 'flat.md'), '---\nname: flat\ndescription: flat skill\n---\n\nbody\n', 'utf8')
    await updateSkill(ctx, config, scope, 'flat', { name: 'renamed', description: 'renamed flat', body: 'body' })
    const listing = await listSkills(ctx, config, scope)
    expect(listing.skills.map(skill => skill.name)).toEqual(['renamed'])
    expect(listing.skills[0]?.path).toBe(join(skills, 'renamed.md'))
  })
})

describe('uninstallSkill', () => {
  it('removes a managed skill from its root', async () => {
    await writeSkill(join(root, 'agents', 'skills'), 'doomed', 'body')
    await uninstallSkill(ctx, config, scope, 'doomed')
    expect((await listSkills(ctx, config, scope)).skills).toEqual([])
  })

  it('refuses a skill from a shipped root', async () => {
    const bundled = join(root, 'bundled')
    await writeSkill(bundled, 'shipped', 'body')
    const withBundled = resolveSkillManagerConfig({
      dshHome: join(root, 'dsh'),
      agentsHome: join(root, 'agents'),
      bundledSkillDir: bundled,
    })
    await expect(uninstallSkill(ctx, withBundled, scope, 'shipped'))
      .rejects.toMatchObject({ failure: 'read-only' })
  })

  it('reports a missing skill as not-found', async () => {
    await expect(readSkill(ctx, config, scope, 'absent')).rejects.toMatchObject({ failure: 'not-found' })
  })
})

describe('setSkillEnabled', () => {
  it('moves a skill into the disabled area and back', async () => {
    const skills = join(root, 'agents', 'skills')
    await writeSkill(skills, 'toggle', 'body')

    await setSkillEnabled(ctx, config, scope, 'toggle', false)
    expect(await readFile(join(skills, '.disabled', 'toggle', 'SKILL.md'), 'utf8')).toContain('name: toggle')

    await setSkillEnabled(ctx, config, scope, 'toggle', true)
    expect(await readFile(join(skills, 'toggle', 'SKILL.md'), 'utf8')).toContain('name: toggle')
  })

  it('is a no-op when the requested state is the current one', async () => {
    await writeSkill(join(root, 'agents', 'skills'), 'steady', 'body')
    const listing = await setSkillEnabled(ctx, config, scope, 'steady', true)
    expect(listing.skills[0]).toMatchObject({ name: 'steady', enabled: true })
  })

  it('refuses to park a skill onto an occupied name', async () => {
    const skills = join(root, 'agents', 'skills')
    await writeSkill(skills, 'clash', 'body')
    await writeSkill(join(skills, '.disabled'), 'clash', 'body')
    await expect(setSkillEnabled(ctx, config, scope, 'clash', false))
      .rejects.toMatchObject({ failure: 'conflict' })
  })

  it('refuses a skill from a shipped root', async () => {
    const bundled = join(root, 'bundled')
    await writeSkill(bundled, 'shipped', 'body')
    const withBundled = resolveSkillManagerConfig({
      dshHome: join(root, 'dsh'),
      agentsHome: join(root, 'agents'),
      bundledSkillDir: bundled,
    })
    await expect(setSkillEnabled(ctx, withBundled, scope, 'shipped', false))
      .rejects.toBeInstanceOf(SkillManagerError)
  })
})

describe('installDirectory', () => {
  it('copies a skill directory into the create root', async () => {
    const source = await writeSkill(join(root, 'elsewhere'), 'imported', 'imported body')
    await installDirectory(ctx, config, scope, source)
    expect((await listSkills(ctx, config, scope)).skills.map(skill => skill.name)).toEqual(['imported'])
  })

  it('rejects a directory that carries no usable skill', async () => {
    const source = join(root, 'plain')
    await mkdir(source, { recursive: true })
    await expect(installDirectory(ctx, config, scope, source)).rejects.toMatchObject({ failure: 'rejected' })
  })

  it('rejects a path that is not a directory', async () => {
    const file = join(root, 'file.md')
    await writeFile(file, '---\nname: x\ndescription: y\n---\n', 'utf8')
    await expect(installDirectory(ctx, config, scope, file)).rejects.toMatchObject({ failure: 'rejected' })
  })

  it('refuses to overwrite an installed skill', async () => {
    const source = await writeSkill(join(root, 'elsewhere'), 'duplicate', 'body')
    await writeSkill(join(root, 'agents', 'skills'), 'duplicate', 'body')
    await expect(installDirectory(ctx, config, scope, source)).rejects.toMatchObject({ failure: 'conflict' })
  })
})

describe('installGit', () => {
  it('reports a clone failure as a refusal, never a crash', async () => {
    await expect(installGit(ctx, { ...config, installTimeoutMs: 20_000 }, scope, join(root, 'no-such-repository'), undefined))
      .rejects.toMatchObject({ failure: 'rejected' })
  })
})
