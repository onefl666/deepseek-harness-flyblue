// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { SkillManagerSection } from '../src/client/SkillManagerSection.tsx'
import { zh } from '../src/client/locales.ts'
import type { SkillManagerSectionInjected } from '../src/client/SkillManagerSection.tsx'
import type { SkillEntryView, SkillListView } from '../src/types.ts'

const t = makeTranslate(zh, commonZh)
type SectionProps = Parameters<typeof SkillManagerSection>[0]

afterEach(cleanup)

/** One entry with the fields a row reads. */
function entry(over: Partial<SkillEntryView> = {}): SkillEntryView {
  return {
    name: 'alpha',
    description: 'the alpha skill',
    enabled: true,
    path: '/skills/alpha/SKILL.md',
    kind: 'user',
    origin: 'agents',
    managed: true,
    ...over,
  }
}

/** A listing answering with `skills`. */
function listing(skills: readonly SkillEntryView[]): SkillListView {
  return { createRoot: '/skills', roots: [], skills }
}

/** Build the props one section render needs, with every verb recorded. */
function bench(skills: readonly SkillEntryView[] = [entry()]) {
  const list = vi.fn().mockResolvedValue({ ok: true, value: listing(skills) })
  const verbs: SkillManagerSectionInjected = {
    list,
    read: vi.fn().mockResolvedValue({ ok: true, value: { name: 'alpha', description: 'd', path: '/x', frontmatter: '', body: '' } }),
    create: vi.fn().mockResolvedValue({ ok: true, value: listing([]) }),
    update: vi.fn().mockResolvedValue({ ok: true, value: listing([]) }),
    uninstall: vi.fn().mockResolvedValue({ ok: true, value: listing([]) }),
    setEnabled: vi.fn().mockResolvedValue({ ok: true, value: listing([]) }),
    installFromDirectory: vi.fn().mockResolvedValue({ ok: true, value: listing([]) }),
    installFromGit: vi.fn().mockResolvedValue({ ok: true, value: listing([]) }),
  }
  // The framework seat returns the same snapshot reference until the fact
  // moves; a fresh object per render would re-run every effect keyed on it.
  const workspaces = { items: [{ workspaceId: 'w1', path: '/project', title: 'FlyBlue' }] }
  const useWorkspaces = ((selector: (snapshot: unknown) => unknown) => selector(workspaces)) as unknown as SectionProps['useWorkspaces']
  const props = { t, ...verbs, useWorkspaces } as unknown as SectionProps
  return { props, verbs, list }
}

describe('SkillManagerSection', () => {
  it('lists what the scope reports and counts it', async () => {
    const b = bench([entry(), entry({ name: 'beta', description: 'the beta skill' })])
    render(<SkillManagerSection {...b.props} />)
    expect(await screen.findByText('alpha')).toBeDefined()
    expect(screen.getByText('beta')).toBeDefined()
    expect(screen.getByText('已安装 2')).toBeDefined()
  })

  it('filters by name and description and explains an empty result', async () => {
    const b = bench([entry(), entry({ name: 'beta', description: 'matches nothing here' })])
    render(<SkillManagerSection {...b.props} />)
    await screen.findByText('alpha')

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索技能' }), { target: { value: 'beta' } })
    await vi.waitFor(() => { expect(screen.queryByText('alpha')).toBeNull() })
    expect(screen.getByText('beta')).toBeDefined()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索技能' }), { target: { value: 'zzz' } })
    await vi.waitFor(() => { expect(screen.getByText('没有匹配的技能。')).toBeDefined() })
  })

  it('reports an empty scope with the create/import guidance', async () => {
    const b = bench([])
    render(<SkillManagerSection {...b.props} />)
    await vi.waitFor(() => {
      expect(screen.getByText('还没有技能。用「新建」撰写一个，或从目录、Git 仓库导入。')).toBeDefined()
    })
  })

  it('switches a skill off through the Remote verb named by its accessible label', async () => {
    const b = bench()
    render(<SkillManagerSection {...b.props} />)
    const toggle = await screen.findByRole('switch', { name: '启用技能 alpha' })
    fireEvent.click(toggle)
    await vi.waitFor(() => { expect(b.verbs.setEnabled).toHaveBeenCalledWith({ kind: 'user' }, 'alpha', false) })
  })

  it('locks the switch on a skill a shipped root owns', async () => {
    const b = bench([entry({ managed: false, origin: 'bundled' })])
    render(<SkillManagerSection {...b.props} />)
    const toggle = await screen.findByRole('switch', { name: '启用技能 alpha' })
    expect((toggle as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('只读')).toBeDefined()
  })

  it('names the row actions on a skill that ships with the deployment', async () => {
    const b = bench([entry({ managed: false, origin: 'bundled' })])
    render(<SkillManagerSection {...b.props} />)
    await screen.findByText('alpha')
    expect(screen.getByRole('button', { name: '技能 alpha 的更多操作' })).toBeDefined()
  })

  it('surfaces a listing failure instead of an empty list', async () => {
    const b = bench()
    b.list.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'registry unavailable' } })
    render(<SkillManagerSection {...b.props} />)
    expect(await screen.findByText(/registry unavailable/u)).toBeDefined()
  })
})
