// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  PendingQuestion, planReviewOf, type QuestionComposerProps, type QuestionWait,
} from '../src/client/contract/slots.ts'
import { createQuestionDraftStore } from '../src/client/draft-store.ts'
import { QuestionComposer } from '../src/client/QuestionComposer.tsx'
import { en, zh } from '../src/client/locales.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

// Every session-scope fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']

afterEach(cleanup)


const SID = 's1' as SessionId

const seatOver = (dict: Record<string, string>, common: Record<string, string>): QuestionComposerProps['t'] =>
  (key => dict[key] ?? common[key] ?? key)

type SessionState = Parameters<Parameters<QuestionComposerProps['useSession']>[0]>[0]
type ConversationState = Parameters<Parameters<QuestionComposerProps['useConversation']>[0]>[0]
type ChatState = Parameters<Parameters<QuestionComposerProps['useChat']>[0]>[0]
type TrajectoryState = Parameters<Parameters<QuestionComposerProps['useTrajectory']>[0]>[0]
type InputState = Parameters<Parameters<QuestionComposerProps['useInput']>[0]>[0]
type AttentionState = Parameters<Parameters<QuestionComposerProps['useSessionPendingInteraction']>[0]>[0]

const sessionState: SessionState = {
  sessionId: SID,
  queue: [],
  pendingSubmissions: [],
  running: false,
  subagent: null,
  removed: false,
  openState: 'open',
  openError: null,
  hasMore: false,
  loadingOlder: false,
  promptError: null,
  blank: false,
  lastAgentError: null,
  promptAttempted: false,
  awaitingFirstTurn: false,
}
const sessionList = {
  ids: [SID],
  byId: { [SID]: { id: SID, displayTitle: 'Session', running: false, blank: false, updatedAt: 0 } },
  current: SID,
  phase: 'ready' as const,
  subagentsByParent: {},
  jobsBySession: {},
  currentAddress: undefined,
}
const attentionState: AttentionState = new Map()
const workspaceState = {
  items: [],
  archivedSessionIds: [],
  state: 'idle' as const,
  phase: 'ready' as const,
  error: null,
}
const conversationState: ConversationState = {
  views: { get: () => undefined },
  activeTargets: new Set(),
}
const emptyKeys: readonly string[] = []
const emptyNodeSource = { getSnapshot: () => undefined, subscribe: () => () => {} }
const chatState: ChatState = {
  order: emptyKeys,
  nodes: {
    get: () => undefined,
    source: () => emptyNodeSource,
    processSource: () => emptyNodeSource,
    values: () => [],
  },
  locations: { getTurn: () => emptyKeys, getStep: () => emptyKeys },
  navigation: { items: () => [] },
  timeline: { turnOrder: [], turns: new Map() },
  legacy: {
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: [],
  },
}
const trajectoryState: TrajectoryState = {
  eventNodes: [],
  eventLocations: new Map(),
  requests: [],
  callSchemas: new Map(),
  partial: null,
  runningCalls: [],
}
const inputState: InputState = {
  draft: '',
  attachmentIds: [],
  draftRev: 0,
  phase: 'plain',
  occurrences: [],
  queue: [],
}

const questionDraftStore = createQuestionDraftStore().create(SID)

/** Framework standard-kit stubs: the panel consumes only the locale seat. */
const kit: Omit<QuestionComposerProps, 'matched'> = {
  sessionId: SID,
  session: undefined,
  pendingInteraction: undefined,
  useSession: selector => selector(sessionState),
  useSessions: selector => selector(sessionList),
  useResource,
  useSessionPendingInteraction: selector => selector(attentionState),
  useWorkspaces: selector => selector(workspaceState),
  useConversation: selector => selector(conversationState),
  useChat: selector => selector(chatState),
  useTrajectory: selector => selector(trajectoryState),
  useProjection: (() => undefined),
  useInput: selector => selector(inputState),
  inputActions: {
    setDraft: () => { throw new Error('unused') },
    addAttachments: () => { throw new Error('unused') },
    removeAttachment: () => { throw new Error('unused') },
    pruneAttachments: () => { throw new Error('unused') },
    submit: () => { throw new Error('unused') },
  },
  useStore: selector => selector(questionDraftStore.getSnapshot()),
  actions: questionDraftStore.actions,
  t: seatOver(zh, commonZh),
}

const PLAN = '# Ship the picker\n\n- read the store\n- render the rows\n'

/** The plan-handoff request shape: one question, the plan as detail, every execution path named. */
const questions = (): QuestionWait['questions'] => [{
  id: 'plan-review',
  header: 'Plan review',
  question: 'Approve this plan and leave plan mode?',
  detail: PLAN,
  options: [
    { label: 'Approve and execute', description: 'Leave plan mode and execute in a fresh session.' },
    { label: 'Approve and compact context', description: 'Leave plan mode, compact, then execute.' },
    { label: 'Approve and keep context', description: 'Leave plan mode and execute here.' },
    { label: 'Refine plan', description: 'Stay in plan mode; feedback goes back to the model.' },
  ],
  intent: {
    kind: 'plan-review',
    approve: ['Approve and execute', 'Approve and compact context', 'Approve and keep context'],
  },
}]

/** Pending waterfall fixture with observable Client response methods. */
function wait(items: QuestionWait['questions'] = questions()) {
  const carrier = new PendingQuestion(SID, items)
  const answer = vi.spyOn(carrier, 'answer')
  const cancel = vi.spyOn(carrier, 'cancel')
  void carrier.result.catch(() => {})
  return { carrier, answer, cancel }
}

const decision = (label: string) => ({ answers: [{ id: 'plan-review', selected: [label] }] })

describe('planReviewOf', () => {
  it('narrows a plan-review request to its decision, every approve path included', () => {
    expect(planReviewOf(questions())).toEqual({
      id: 'plan-review',
      question: 'Approve this plan and leave plan mode?',
      plan: PLAN,
      approves: [
        { label: 'Approve and execute', description: 'Leave plan mode and execute in a fresh session.' },
        { label: 'Approve and compact context', description: 'Leave plan mode, compact, then execute.' },
        { label: 'Approve and keep context', description: 'Leave plan mode and execute here.' },
      ],
      refine: { label: 'Refine plan', description: 'Stay in plan mode; feedback goes back to the model.' },
    })
  })

  it('leaves refine absent when the asker offered approve paths alone', () => {
    const [question] = questions()
    const review = planReviewOf([{
      ...question as object,
      options: [{ label: 'Approve and execute' }],
      intent: { kind: 'plan-review', approve: ['Approve and execute'] },
    } as never])
    expect(review?.approves).toEqual([{ label: 'Approve and execute' }])
    expect(review === undefined ? true : 'refine' in review).toBe(false)
  })

  it.each([
    ['a batch of more than one question', () => [...questions(), ...questions()]],
    ['no intent at all', () => [{ ...questions()[0] as object, intent: undefined }]],
    ['an intent without the plan as detail', () => [{ ...questions()[0] as object, detail: undefined }]],
    ['an intent whose approve names no option', () => [{
      ...questions()[0] as object, intent: { kind: 'plan-review', approve: ['Ship it'] },
    }]],
    ['an intent naming no approve label at all', () => [{
      ...questions()[0] as object, intent: { kind: 'plan-review', approve: [] },
    }]],
    ['an intent with no options at all', () => [{ ...questions()[0] as object, options: undefined }]],
    // The card can send every named approve path plus one refine; an unnamed
    // extra option has an answer it cannot express, and the generic flow can.
    ['a second unnamed option beyond refine', () => [{
      ...questions()[0] as object,
      options: [
        { label: 'Approve and execute' }, { label: 'Refine plan' }, { label: 'Start over' },
      ],
    }]],
    ['a multi-select decision', () => [{ ...questions()[0] as object, multiSelect: true }]],
  ])('declines %s, leaving the request to the generic flow', (_case, build) => {
    expect(planReviewOf(build() as never)).toBeUndefined()
  })

  it('declines an empty batch, which the generic flow reports as such', () => {
    expect(planReviewOf([])).toBeUndefined()
  })
})

describe('PlanReviewPanel', () => {
  it('renders the plan under a review strip, with none of the quiz affordances', () => {
    const { carrier } = wait()
    render(<QuestionComposer matched={carrier} {...kit} />)

    expect(document.querySelector('[data-plan-review-key]')?.getAttribute('data-plan-review-key')).toBe(carrier.key)
    expect(screen.getByText(zh['plan.header'])).toBeTruthy()
    // The plan renders as markdown, so its heading is a heading.
    expect(screen.getByRole('heading', { name: 'Ship the picker' })).toBeTruthy()
    expect(screen.getByText('render the rows')).toBeTruthy()
    // The question text stays as the card's accessible name rather than a title
    // that reads like a test item.
    expect(screen.getByLabelText('Approve this plan and leave plan mode?')).toBeTruthy()
    // No pager, no numbered options, no skip, no custom answer.
    expect(screen.queryByText('1 / 1')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText(zh['action.skip'])).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('answers with each asker-named approve label and keeps its description as the tooltip', () => {
    const { carrier, answer } = wait()
    render(<QuestionComposer matched={carrier} {...kit} />)

    const approve = screen.getByRole('button', { name: zh['plan.approve.execute'] })
    expect(approve.getAttribute('title')).toBe('Leave plan mode and execute in a fresh session.')
    fireEvent.click(approve)
    expect(answer).toHaveBeenCalledWith(decision('Approve and execute'))
    // One-shot: every action locks until the host's resolved frame lands.
    expect(approve.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: zh['plan.refine'] }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(approve)
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('offers one button per approve path, so no execution path is unreachable', () => {
    const { carrier } = wait()
    render(<QuestionComposer matched={carrier} {...kit} />)

    expect(screen.getByRole('button', { name: zh['plan.approve.execute'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['plan.approve.compact'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['plan.approve.keep'] })).toBeTruthy()
  })

  it('answers with the asker\'s refine label, which stays in plan mode', () => {
    const { carrier, answer } = wait()
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.refine'] }))
    expect(answer).toHaveBeenCalledWith(decision('Refine plan'))
  })

  it('dismisses the request so the composer returns for a plain message', () => {
    const { carrier, cancel } = wait()
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.discuss'] }))
    expect(cancel).toHaveBeenCalledWith()
  })

  it('omits the tooltip for an option carrying no description', () => {
    const { carrier } = wait([{
      ...questions()[0] as object,
      options: [{ label: 'Approve and execute' }, { label: 'Refine plan' }],
      intent: { kind: 'plan-review', approve: ['Approve and execute'] },
    }] as never)
    render(<QuestionComposer matched={carrier} {...kit} />)

    expect(screen.getByRole('button', { name: zh['plan.approve.execute'] }).hasAttribute('title')).toBe(false)
    expect(screen.getByRole('button', { name: zh['plan.refine'] }).hasAttribute('title')).toBe(false)
  })

  it('hides the refine action when the asker offered approve paths alone', () => {
    const { carrier } = wait([{
      ...questions()[0] as object,
      options: [{ label: 'Approve and execute' }],
      intent: { kind: 'plan-review', approve: ['Approve and execute'] },
    }] as never)
    render(<QuestionComposer matched={carrier} {...kit} />)

    expect(screen.queryByRole('button', { name: zh['plan.refine'] })).toBeNull()
    expect(screen.getByRole('button', { name: zh['plan.approve.execute'] })).toBeTruthy()
  })

  it('re-arms the actions and says why when the decision does not land', async () => {
    const { carrier, answer } = wait()
    answer.mockRejectedValue(new Error('question response rejected: not-pending'))
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.approve.execute'] }))
    const failure = await screen.findByText('question response rejected: not-pending')
    expect(failure.getAttribute('role')).toBe('status')
    // Re-armed for the retry: a lost click must not leave a dead card.
    expect(screen.getByRole('button', { name: zh['plan.approve.execute'] }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: zh['plan.approve.execute'] }))
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('reports a non-Error transport failure as its stringified value', async () => {
    // A non-Error rejection is the case under test: a carrier can reject with
    // anything, and the panel must still show the user something.
    const { carrier, cancel } = wait()
    cancel.mockRejectedValue('socket gone')
    render(<QuestionComposer matched={carrier} {...kit} />)

    fireEvent.click(screen.getByRole('button', { name: zh['plan.discuss'] }))
    expect(await screen.findByText('socket gone')).toBeTruthy()
  })

  it('carries the same decision surface in English', () => {
    const { carrier } = wait()
    render(<QuestionComposer matched={carrier} {...kit} t={seatOver(en, commonEn)} />)

    expect(screen.getByText('Plan review')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Execute' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refine plan' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chat about it' })).toBeTruthy()
  })
})
