// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { McpManagerSection } from '../src/client/McpManagerSection.tsx'
import { zh } from '../src/client/locales.ts'
import type { McpManagerSectionInjected } from '../src/client/McpManagerSection.tsx'
import type { McpListView, McpServerView, McpStaticRowView } from '../src/types.ts'

const t = makeTranslate(zh, commonZh)
type SectionProps = Parameters<typeof McpManagerSection>[0]

afterEach(cleanup)

/** One stored server row. */
function server(over: Partial<McpServerView> = {}): McpServerView {
  return {
    serverName: 'engram',
    enabled: true,
    mounted: true,
    status: 'connected',
    transport: 'stdio',
    target: 'engram mcp',
    config: { transport: 'stdio', serverName: 'engram', command: 'engram' },
    ...over,
  }
}

/** One Loader-declared row. */
function declared(over: Partial<McpStaticRowView> = {}): McpStaticRowView {
  return {
    entryId: 'memory-engram',
    serverName: 'declared',
    enabled: true,
    status: 'connected',
    moduleName: '@deepseek-ai/dsh-mcp-client',
    ...over,
  }
}

/** A listing answering with the given rows. */
function listing(servers: readonly McpServerView[], staticRows: readonly McpStaticRowView[] = []): McpListView {
  return { registryPath: '/home/.dsh/mcp-servers.json', servers, staticRows, supportedProtocolVersions: ['2025-11-25'] }
}

/** Build the props one section render needs, with every verb recorded. */
function bench(value: McpListView = listing([server()])) {
  const list = vi.fn().mockResolvedValue({ ok: true, value })
  const verbs: McpManagerSectionInjected = {
    list,
    save: vi.fn().mockResolvedValue({ ok: true, value }),
    remove: vi.fn().mockResolvedValue({ ok: true, value }),
    setEnabled: vi.fn().mockResolvedValue({ ok: true, value }),
    restart: vi.fn().mockResolvedValue({ ok: true, value }),
    setStaticEnabled: vi.fn().mockResolvedValue({ ok: true, value }),
    subscribeStatus: vi.fn(() => () => {}),
  }
  // The framework seat returns the same snapshot reference until the fact
  // moves; a fresh object per render would re-run every effect keyed on it.
  const workspaces = { items: [{ workspaceId: 'w1', path: '/project', title: 'FlyBlue' }] }
  const useWorkspaces = ((selector: (snapshot: unknown) => unknown) => selector(workspaces)) as unknown as SectionProps['useWorkspaces']
  const props = { t, ...verbs, useWorkspaces } as unknown as SectionProps
  return { props, verbs, list }
}

describe('McpManagerSection', () => {
  it('lists stored servers and declared rows with their connection state', async () => {
    const b = bench(listing([server()], [declared()]))
    render(<McpManagerSection {...b.props} />)
    expect(await screen.findByText('engram')).toBeDefined()
    expect(screen.getByText('已安装 1')).toBeDefined()
    expect(screen.getAllByText('已连接')).toHaveLength(2)
    expect(screen.getByText('declared')).toBeDefined()
    expect(screen.getByText('由 cordis.yml 声明')).toBeDefined()
  })

  it('explains that a declared row toggles only this run', async () => {
    const b = bench(listing([], [declared()]))
    render(<McpManagerSection {...b.props} />)
    expect(await screen.findByText(/只对本次运行生效/u)).toBeDefined()
  })

  it('filters by server name and by target', async () => {
    const b = bench(listing([
      server(),
      server({ serverName: 'down', status: 'failed', target: 'http://127.0.0.1:1/mcp', enabled: false, mounted: false }),
    ]))
    render(<McpManagerSection {...b.props} />)
    await screen.findByText('engram')

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索 MCP 服务器' }), { target: { value: 'down' } })
    await vi.waitFor(() => { expect(screen.queryByText('engram')).toBeNull() })
    expect(screen.getByText('down')).toBeDefined()
    expect(screen.getByText('连接失败')).toBeDefined()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索 MCP 服务器' }), { target: { value: 'zzz' } })
    await vi.waitFor(() => { expect(screen.getByText('没有匹配的服务器。')).toBeDefined() })
  })

  it('switches a stored server off through its labelled toggle', async () => {
    const b = bench()
    render(<McpManagerSection {...b.props} />)
    fireEvent.click(await screen.findByRole('switch', { name: '启用服务器 engram' }))
    await vi.waitFor(() => { expect(b.verbs.setEnabled).toHaveBeenCalledWith({ kind: 'user' }, 'engram', false) })
  })

  it('switches a declared row through the entry it belongs to', async () => {
    const b = bench(listing([], [declared()]))
    render(<McpManagerSection {...b.props} />)
    fireEvent.click(await screen.findByRole('switch', { name: '启用 cordis.yml 行 memory-engram' }))
    await vi.waitFor(() => { expect(b.verbs.setStaticEnabled).toHaveBeenCalledWith('memory-engram', false) })
  })

  it('re-reads the listing whenever a connection status arrives', async () => {
    const b = bench()
    let listener: (() => void) | undefined
    b.verbs.subscribeStatus = vi.fn((next: () => void) => {
      listener = next
      return () => {}
    })
    const props = { ...b.props, subscribeStatus: b.verbs.subscribeStatus } as SectionProps
    render(<McpManagerSection {...props} />)
    await screen.findByText('engram')
    expect(b.list).toHaveBeenCalledTimes(1)

    listener?.()
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(2) })
  })

  it('surfaces a listing failure instead of an empty list', async () => {
    const b = bench()
    b.list.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'registry unavailable' } })
    render(<McpManagerSection {...b.props} />)
    expect(await screen.findByText(/registry unavailable/u)).toBeDefined()
  })

  it('reports an empty scope with the add guidance', async () => {
    const b = bench(listing([]))
    render(<McpManagerSection {...b.props} />)
    expect(await screen.findByText('还没有 MCP 服务器。用「新建」添加一个，或从 cordis.yml 声明。')).toBeDefined()
  })
})
