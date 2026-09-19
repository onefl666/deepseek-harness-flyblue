// Keyless browser pin for the plan-handoff follow: a live `plan/handoff` on the
// Session on screen must select the execution Session the event names. The
// planning Session is seeded through the real persistence API, and the
// execution Session is created through the same host factory the shipped
// `clearThenExecute` uses — same cwd, same lineage, same title — minus the
// steer, because a keyless run has no model and the execution turn is not what
// this scenario pins. `connectFreshWorkspace` is deliberately skipped so the
// seeded Session is opened from the sidebar, the way the standalone-compaction
// scenario does.
//
// Because the loopback host publishes `api-session/added` during create before
// the handoff is appended here, the browser holds the child row first: this
// scenario covers the already-listed path, while the late-arrival latch is
// covered by packages/client/ui-plan/tests/handoff-navigation.client.spec.ts.
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
// Type-only: pull the Context merges for the host services this scenario drives.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
// Type-only: pulls the plan/handoff SessionEventMap merge so the append below
// types as the plan-handoff event in the host aggregate.
import type {} from '@deepseek-ai/dsh-plan-handoff'
import { EXECUTION_SESSION_TITLE_PREFIX } from '@deepseek-ai/dsh-plan-handoff'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/plan-handoff-follow', import.meta.url))
const SIDEBAR_EXPECTED = fileURLToPath(
  new URL('./snapshots/plan-handoff-follow/sidebar.expected.md', import.meta.url))
const MODE = webSnapshotMode()
const SEED_ID = 'plan-handoff-follow-web-e2e'
const EXECUTION_ID = SessionId('plan-handoff-follow-execution')
const TITLE = 'Plan handoff follow'
const EXECUTION_TITLE = `${EXECUTION_SESSION_TITLE_PREFIX}${TITLE}`
const PROMPT = 'Plan a small change and stop.'
const REPLY = 'PLAN_READY'
/** The Client's persisted selection cell (`dsh.sessions.current`). */
const SELECTION_KEY = 'dsh.sessions.current'

/**
 * The Session the page currently shows, read from the Client's persisted
 * selection cell — the durable half of the list's `current`.
 * @param page - the page under test.
 * @returns the selected Session id, or undefined before one is written.
 */
async function selectedSessionId(page: Page): Promise<string | undefined> {
  const raw = await page.evaluate(key => localStorage.getItem(key), SELECTION_KEY)
  return raw === null ? undefined : (JSON.parse(raw) as { sessionId?: string }).sessionId
}

/** Closed one-turn planning seed: the Session a clear handoff plans in. */
function planningFixture(): string {
  const session = Session.create(SessionId('plan-handoff-follow-source'))
  const eventTimeOrigin = new Date().setHours(12, 0, 0, 0)
  // The permission knobs every real Session carries at creation. A resumed
  // Session without them pins the missing ones from the composed shell, which
  // a keyless scaffold without a confining shell cannot supply.
  session.append('sandbox/mode', { mode: 'workspace-write' })
  session.append('approval/policy', { policy: 'ask' })
  session.append('turn/start', { turn: 1 })
  const user = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: PROMPT }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('session/title', {
    title: TITLE,
    messageSeqs: [user.seq],
    source: { kind: 'fallback' },
  })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: REPLY }],
      source: { kind: 'model', provider: 'fixture', model: 'fixture' },
    }),
    stream: [],
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  return [
    JSON.stringify({
      type: 'session',
      version: SESSION_FORMAT_VERSION,
      id: '{{sessionId}}',
      createdAt: eventTimeOrigin,
      isSeeded: false,
      delegationDepth: 0,
    }),
    ...session.snapshotEvents().map(event => JSON.stringify({
      ...event,
      time: eventTimeOrigin + event.seq,
    })),
    '',
  ].join('\n')
}

describe('web e2e: a clear plan handoff switches to the execution session', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    if (MODE === 'record') throw new Error('plan-handoff-follow is a keyless assembled snapshot')
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, planningFixture(), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('selects the listed execution session when the handoff lands', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plan-handoff-follow'))
    // Open the seeded planning Session from the sidebar: the follow policy
    // only watches the Session on screen.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    await expect.poll(() => page.getByText(REPLY, { exact: true }).count(), { timeout: 15_000 }).toBe(1)

    // The planning Session's live agent: the same lookup the interactive
    // surface uses, so its options (model route) seed the execution Session.
    const resolved = await scaffold.ctx.sessionController.resolveAgent(SessionId(SEED_ID))
    if ('error' in resolved) throw new Error(`seeded session did not attach an agent: ${resolved.error.message}`)
    const planning = resolved.agent

    // The shipped clear path, minus the steer.
    const handle = await scaffold.ctx.agents.create({
      sessionId: EXECUTION_ID,
      meta: { cwd: scaffold.workspaceCwd, parentSession: planning.id },
      agentOptions: { ...planning.options },
    })
    const workspace = await scaffold.ctx.workspaceRegistry.resolveByPath(scaffold.workspaceCwd)
    await workspace?.attachSession(EXECUTION_ID)
    scaffold.ctx.sessionTitle.rename(handle.agent.session, EXECUTION_TITLE)
    planning.session.append('plan/handoff', { childSessionId: EXECUTION_ID, mode: 'clear' })

    // The switch itself: the persisted selection cell is the durable half of
    // the Client's current Session, so it names the Session on screen. The row
    // text cannot: a blank Session renders as the provisional "New Session"
    // placeholder (its title arrives with the execution turn, which this
    // keyless scenario does not run).
    await expect.poll(() => selectedSessionId(page), { timeout: 15_000 }).toBe(EXECUTION_ID)
    // The conversation followed: the planning transcript is gone, and the
    // column on screen is the execution Session's own fresh-session phase.
    await expect.poll(() => page.getByText(REPLY, { exact: true }).count(), { timeout: 10_000 }).toBe(0)
    expect(await page.locator('[class*="centerCol"] [data-phase="hero"]').count()).toBe(1)

    // The switched-in column ships the entrance motion, and reduced motion
    // drops it. The keyframe name is CSS-module scoped, so match its suffix.
    const column = page.locator('[class*="centerCol"] [data-phase]').first()
    const animationName = async (): Promise<string> => await column.evaluate(
      element => getComputedStyle(element).animationName)
    await expect.poll(animationName).toContain('conversation-enter')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(animationName).toBe('none')
    await page.emulateMedia({ reducedMotion: null })

    const snapshot = await captureStableAria(page, '[role="tree"]', scaffold.workspaceCwd, {
      normalizeAge: true,
      replacements: [[SEED_ID, '{{seededId}}'], [EXECUTION_ID, '{{executionId}}']],
    })
    await compareOrRefreshGolden(SIDEBAR_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)

  it('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['sidebar.expected.md'])
  })
})
