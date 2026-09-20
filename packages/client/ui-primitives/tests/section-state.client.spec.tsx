// @vitest-environment jsdom
/** SectionState: the load, failure, and body branches every manager section shares. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SectionState } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

const LABELS = { loading: 'Loading servers', error: 'Failed' }

describe('SectionState', () => {
  it('draws the requested number of loading rows', () => {
    render(
      <SectionState loading rows={3} failure={undefined} labels={LABELS}>
        <p>body</p>
      </SectionState>,
    )

    const skeleton = screen.getByLabelText('Loading servers')
    expect(skeleton.getAttribute('aria-busy')).toBe('true')
    expect(skeleton.children).toHaveLength(3)
    expect(screen.queryByText('body')).toBeNull()
  })

  it('prefixes the failure message with its label', () => {
    render(
      <SectionState loading={false} rows={2} failure="registry unreadable" labels={LABELS}>
        <p>body</p>
      </SectionState>,
    )

    const failure = screen.getByRole('alert')
    expect(failure.textContent).toBe('Failed: registry unreadable')
    expect(screen.queryByText('body')).toBeNull()
  })

  it('renders the body once the read settled', () => {
    render(
      <SectionState loading={false} rows={2} failure={undefined} labels={LABELS}>
        <p>body</p>
      </SectionState>,
    )

    expect(screen.getByText('body')).toBeTruthy()
  })
})
