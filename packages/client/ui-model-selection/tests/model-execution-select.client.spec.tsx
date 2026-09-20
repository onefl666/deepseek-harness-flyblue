// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { ModelExecutionSelect } from '../src/client/ModelExecutionSelect.tsx'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

// The seat's key domain is model ∪ common; the stub mirrors the real lookup
// chain: package dictionary, then common vocabulary, then the key.
const t: ComponentProps<typeof ModelExecutionSelect>['t'] = (key, params) => {
  const template = (zh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'max', name: 'Max' }], defaultEffort: 'high' },
      }, { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' }],
    }],
    failures: [],
    status: 'ready',
    error: null,
    ...overrides,
  }
}

/** Render the seat over one directory, returning what it staged. */
function seat(overrides: Partial<ModelDirectoryState> = {}) {
  const store = createSnapshotStore<ModelDirectoryState>(state(overrides))
  const onChange = vi.fn()
  render(
    <ModelExecutionSelect
      value={null}
      onChange={onChange}
      locked={false}
      available
      directory={store}
      load={vi.fn()}
      t={t}
    />,
  )
  return { store, onChange }
}

afterEach(cleanup)

describe('ModelExecutionSelect', () => {
  it('names the pair of values it stages and opens on the session’s own', () => {
    seat()

    expect(screen.getByText(zh['planReview.label'])).toBeTruthy()
    expect(screen.getByRole('button', { name: '选择模型，当前 DeepSeek-V4-Flash，推理等级 High' })).toBeTruthy()
  })

  it('stages a model pick instead of writing it to the session', async () => {
    const { store, onChange } = seat()
    const before = store.getSnapshot()

    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }))

    expect(onChange).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    // The session's directory is untouched: staging is the card's business.
    expect(store.getSnapshot()).toBe(before)
  })

  it('stages the effort beside the model it belongs to', () => {
    const { onChange } = seat()

    fireEvent.click(screen.getByRole('button', { name: /选择模型/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /推理等级/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Max' }))

    expect(onChange).toHaveBeenCalledWith({
      provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max',
    })
  })

  it('shows the staged selection once the card holds one', () => {
    const store = createSnapshotStore<ModelDirectoryState>(state())
    render(
      <ModelExecutionSelect
        value={{ provider: 'deepseek-official', model: 'deepseek-v4-pro' }}
        onChange={vi.fn()}
        locked
        available
        directory={store}
        load={vi.fn()}
        t={t}
      />,
    )

    expect(screen.getByRole('button', { name: '选择模型，当前 DeepSeek-V4-Pro' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /选择模型/ }).hasAttribute('disabled')).toBe(true)
  })

  it('renders nothing for a session that cannot select a model', () => {
    const store = createSnapshotStore<ModelDirectoryState>(state())
    const { container } = render(
      <ModelExecutionSelect
        value={null}
        onChange={vi.fn()}
        locked={false}
        available={false}
        directory={store}
        load={vi.fn()}
        t={t}
      />,
    )

    expect(container.textContent).toBe('')
  })
})
