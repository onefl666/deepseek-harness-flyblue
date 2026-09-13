// Web e2e scenario: the shipped Claude-style effort slider renders exactly the
// reasoning levels the settings profile declares — no phantom slots from a
// fixed palette — and the level the user picks is the level that lands in
// Settings. Zero model calls: declaring, describing, and switching are
// settings/llm traffic only, so there is no fixture and a stray stream would
// fail loud.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, connectFreshWorkspaceZh, saveFailureShot } from './support.ts'

/** Starts the shipped default on this scenario's declared reasoning model. */
const OVERLAY = fileURLToPath(new URL('./effort-slider-levels.overlay.yml', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/effort-slider-levels', import.meta.url))
const UI_EXPECTED = fileURLToPath(new URL('./expected/effort-slider-levels/ui.expected.md', import.meta.url))
const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record')('web e2e: the effort slider offers exactly the declared levels', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    // The whole reasoning offer is the profile: key = selectable level, value
    // = the wire spelling dispatch would send (`max: ultra` renames; the
    // valueless `off` means "supported, send nothing"). The route sets no
    // deployment default, so nothing is selected until the user picks.
    await scaffold.ctx.settings.update('llm-pi-ai', {
      providers: {
        'acme-gateway': {
          displayName: 'Acme Gateway',
          api: 'openai-completions',
          baseURL: 'https://gateway.acme.example/v1',
          models: [{
            id: 'acme-think',
            name: 'Acme Think',
            reasoningEfforts: { off: null, high: 'high', max: 'ultra' },
          }],
        },
      },
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders one stop per declared level and records the picked one', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-effort-slider-levels'))
    const trigger = page.getByRole('button', { name: /^选择模型/ })
    await trigger.waitFor({ timeout: 15_000 })
    // Nothing is selected yet and the route advertises no default, so the
    // slider rests on the first declared level and the chip names it — there is
    // no separate Default state to fall back to.
    await expect.poll(() => trigger.getAttribute('aria-label'), { timeout: 10_000 })
      .toBe('选择模型，当前 Acme Think，推理等级 关闭')
    await trigger.click()
    const leaving = page.locator('.ds-effort-pane:not(.ds-effort-paneLeave) + .ds-effort-paneLeave')
    await page.getByRole('menuitem', { name: /推理等级/ }).click()
    // Switching panes is a transition, not a swap: the outgoing pane stays
    // mounted and inert while it animates out, which is what lets a second
    // click interrupt the same motion instead of restarting it.
    expect(await leaving.count()).toBe(1)
    await expect.poll(() => page.locator('.ds-effort-paneLeave[inert]').count(), { timeout: 2_000 }).toBe(1)
    await expect.poll(() => leaving.count(), { timeout: 2_000 }).toBe(0)

    // Declared levels, nothing else: minimal/low/medium/xhigh/extra were not
    // declared and must not appear, and neither must a Default control.
    const range = page.locator('ds-effort-slider input.range')
    await expect.poll(() => range.getAttribute('aria-valuemax'), { timeout: 10_000 }).toBe('2')
    expect(await page.locator('ds-effort-slider .tick').count()).toBe(3)
    expect(await page.getByRole('menuitemradio').count()).toBe(0)
    const pane = page.locator('[role="menu"]')
    for (const phantom of ['中', '超高', 'Default', 'Medium', 'Extra']) {
      expect(await pane.getByText(phantom, { exact: true }).count()).toBe(0)
    }
    const snapshot = await captureStableAria(page, '[role="menu"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)

    // Every stop is a real declared level: walk them with the keyboard. Each
    // press submits the level it lands on, so the chip and Settings agree.
    await range.focus()
    await page.keyboard.press('Home')
    await expect.poll(() => range.getAttribute('aria-valuetext'), { timeout: 10_000 }).toBe('关闭')
    await page.keyboard.press('End')
    await expect.poll(() => range.getAttribute('aria-valuetext')).toBe('最高')
    await expect.poll(() => trigger.getAttribute('aria-label'), { timeout: 10_000 })
      .toBe('选择模型，当前 Acme Think，推理等级 最高')
    await page.keyboard.press('Home')
    await expect.poll(() => range.getAttribute('aria-valuetext')).toBe('关闭')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => range.getAttribute('aria-valuetext')).toBe('高')
    await expect.poll(
      async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'),
      { timeout: 10_000 },
    ).toContain('reasoningEffort: high')
    await expect.poll(() => trigger.getAttribute('aria-label'), { timeout: 10_000 })
      .toBe('选择模型，当前 Acme Think，推理等级 高')

    // The top real level turns on the Ultracode ambience: the trigger carries
    // the state class and the composer card picks it up through :has(), which
    // is the whole reason the plugin never writes another package's DOM.
    const cardShadow = () => page.locator('[data-composer-card]')
      .evaluate(node => getComputedStyle(node).boxShadow)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => range.getAttribute('aria-valuetext')).toBe('最高')
    await expect.poll(() => page.locator('ds-effort-slider[data-max][ultracode]').count()).toBe(1)
    await expect.poll(() => page.locator('.ds-effort-ultracode').count()).toBe(1)
    await expect.poll(() => page.locator('[data-composer-card]:has(.ds-effort-ultracode)').count()).toBe(1)
    const shadowAtMax = await cardShadow()

    // Both the ambience and the pane switch are CSS transitions, not keyframes:
    // a transition starts from the value currently on screen, so interrupting
    // one reverses it from wherever it got to instead of restarting it.
    const motion = await page.evaluate(() => {
      const read = (element: Element | null, pseudo?: string) => {
        if (element === null) return null
        const style = getComputedStyle(element, pseudo)
        return {
          property: style.transitionProperty,
          duration: style.transitionDuration,
          timing: style.transitionTimingFunction,
        }
      }
      const card = document.querySelector('[data-composer-card]')
      return {
        card: read(card),
        ring: read(card, '::before'),
        trigger: read(document.querySelector('.ds-effort-trigger')),
        pane: read(document.querySelector('.ds-effort-pane')),
      }
    })
    for (const layer of [motion.card, motion.ring, motion.trigger, motion.pane]) {
      expect(layer).not.toBeNull()
      expect(parseFloat(layer!.duration)).toBeGreaterThan(0.1)
      expect(layer!.timing).toContain('cubic-bezier')
    }
    expect(motion.card!.property).toContain('box-shadow')
    expect(motion.ring!.property).toContain('opacity')
    expect(motion.trigger!.property).toContain('box-shadow')
    expect(motion.pane!.property).toContain('opacity')

    // Dropping to High is a real level too, and the ambience leaves with it —
    // the card falls back to the shipped elevation shadow.
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => range.getAttribute('aria-valuetext')).toBe('高')
    await expect.poll(() => page.locator('.ds-effort-ultracode').count()).toBe(0)
    await expect.poll(() => page.locator('[data-composer-card]:has(.ds-effort-ultracode)').count()).toBe(0)
    const shadowAtHigh = await cardShadow()
    expect(shadowAtMax).not.toBe(shadowAtHigh)

    // Going back is a real navigation, not a close: the root pane returns with
    // its own transition, and the slider survives an interrupt mid-flight.
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('menuitem', { name: /推理等级/ }).count(), { timeout: 5_000 }).toBe(1)
    await page.getByRole('menuitem', { name: /推理等级/ }).click()
    await expect.poll(() => range.getAttribute('aria-valuemax'), { timeout: 5_000 }).toBe('2')
    await expect.poll(() => range.getAttribute('aria-valuetext')).toBe('高')

    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['ui.expected.md'])
  })
})
