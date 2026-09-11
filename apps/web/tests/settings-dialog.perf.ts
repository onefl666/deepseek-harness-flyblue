// Opt-in browser diagnostic for settings-dialog responsiveness. It reports
// measurements without timing assertions because host speed is not a
// correctness contract; structural assertions keep the surfaces it measures
// from silently disappearing. The variant switch is what attributes the cost:
// the two global stylesheets added by the upstream sync (per-element derived
// elevation custom properties, and the universal superellipse corner shape) are
// toggled from the page, so one run compares them against the shipped sheet.
// Two direct token toggles measure each variable's per-element recomputation
// cost on the same document, independent of mount work.
import type { Browser, CDPSession, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createChatScrollFixture } from './chat-scroll-fixture.ts'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

const ROUNDS = 2
const REPEATS = 3
const TOKEN_REPEATS = 5
const SCROLL_MS = 1_500
const SCROLL_PX_PER_FRAME = 64
const SETTLE_FRAMES = 2
const SEED_TURNS = 200
const SEED_ID = 'settings-dialog-perf'
const SEED_MARKER_PREFIX = 'SETTINGS_PERF'
const VIEWPORT_HEIGHT = 700

/** The measured window between two CDP metric samples. */
interface Window {
  readonly wallMs: number
  readonly taskMs: number
  readonly scriptMs: number
  readonly layoutMs: number
  readonly recalcStyleMs: number
  readonly styleInvalidations: number
  readonly layoutCount: number
}

/** rAF frame intervals collected by a page-side sampler. */
interface FrameStats {
  readonly frames: number
  readonly p50Ms: number
  readonly p95Ms: number
  readonly maxMs: number
  readonly over33Ms: number
}

/** One measured action: the CDP window plus the frames it produced. */
type Phase = Window & FrameStats

/** One phase's samples and their per-field median. */
interface PhaseSamples {
  readonly samples: readonly Phase[]
  readonly median: Phase
}

/** One page-side CSS override under test. */
interface Variant {
  readonly id: string
  /** Injected after boot; absent for the shipped sheet. */
  readonly css?: string
}

/**
 * The A/B set. `corner-none` resets the universal `corner-shape` to its initial
 * value, which is what the app computed before the synced sheet existed — the
 * comparison the paint hypothesis needs. `elevation-inherited` reverts the four
 * derived elevation properties on descendants, leaving the `body` declarations
 * inherited — the shape of the candidate fix — so only the per-element
 * re-substitution is removed.
 */
const VARIANTS: readonly Variant[] = [
  { id: 'control' },
  { id: 'corner-none', css: '*, *::before, *::after { corner-shape: initial !important; }' },
  {
    id: 'elevation-inherited',
    css: 'body * { --dsw-elevation-stroke: revert; --dsw-elevation-panel: revert;'
      + ' --dsw-elevation-prominent: revert; --dsw-elevation-soft: revert; }',
  },
  {
    id: 'both',
    css: '*, *::before, *::after { corner-shape: initial !important; }'
      + ' body * { --dsw-elevation-stroke: revert; --dsw-elevation-panel: revert;'
      + ' --dsw-elevation-prominent: revert; --dsw-elevation-soft: revert; }',
  },
]

const CORNER_SHAPE_VALUES = ['superellipse(1.5)', 'superellipse(1.4)'] as const
const STROKE_COLOR_VALUES = ['rgb(0 0 0 / 0.1)', 'rgb(0 0 0 / 0.2)'] as const
// Renderer phases worth attributing: style, layout, paint, raster, GPU, and the
// compositor handoff. `Paint` covers main-thread paint recording; `RasterTask`
// and `GPUTask` are where a path-based corner shape would show up.
const TRACE_CATEGORIES = [
  'Paint',
  'RasterTask',
  'GPUTask',
  'UpdateLayoutTree',
  'Layout',
  'PrePaint',
  'UpdateLayerTree',
  'Commit',
  'CompositeLayers',
  'ScrollLayer',
  'FunctionCall',
] as const

/** Aggregated trace totals for one workload. */
interface TraceReport {
  /** Total self time per event name, milliseconds. */
  readonly totalsMs: Record<string, number>
  /** Event count per event name. */
  readonly counts: Record<string, number>
  readonly wallMs: number
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

function requiredMetric(metrics: Record<string, number>, name: string): number {
  const value = metrics[name]
  if (value === undefined) throw new Error(`Chromium performance metric ${name} is unavailable`)
  return value
}

async function chromiumMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const payload = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(payload.metrics.map(metric => [metric.name, metric.value]))
}

function windowDelta(
  before: Record<string, number>,
  after: Record<string, number>,
  wallMs: number,
): Window {
  return {
    wallMs: rounded(wallMs),
    taskMs: rounded((requiredMetric(after, 'TaskDuration') - requiredMetric(before, 'TaskDuration')) * 1_000),
    scriptMs: rounded((requiredMetric(after, 'ScriptDuration') - requiredMetric(before, 'ScriptDuration')) * 1_000),
    layoutMs: rounded((requiredMetric(after, 'LayoutDuration') - requiredMetric(before, 'LayoutDuration')) * 1_000),
    recalcStyleMs: rounded(
      (requiredMetric(after, 'RecalcStyleDuration') - requiredMetric(before, 'RecalcStyleDuration')) * 1_000,
    ),
    styleInvalidations: requiredMetric(after, 'RecalcStyleCount') - requiredMetric(before, 'RecalcStyleCount'),
    layoutCount: requiredMetric(after, 'LayoutCount') - requiredMetric(before, 'LayoutCount'),
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function frameStats(frames: readonly number[]): FrameStats {
  const sorted = [...frames].sort((left, right) => left - right)
  return {
    frames: frames.length,
    p50Ms: rounded(percentile(sorted, 0.5)),
    p95Ms: rounded(percentile(sorted, 0.95)),
    maxMs: rounded(sorted.at(-1) ?? 0),
    over33Ms: frames.filter(frame => frame > 33).length,
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function medianPhase(samples: readonly Phase[]): Phase {
  const field = (name: keyof Phase): number => rounded(median(samples.map(sample => sample[name])))
  return {
    wallMs: field('wallMs'),
    taskMs: field('taskMs'),
    scriptMs: field('scriptMs'),
    layoutMs: field('layoutMs'),
    recalcStyleMs: field('recalcStyleMs'),
    styleInvalidations: field('styleInvalidations'),
    layoutCount: field('layoutCount'),
    frames: field('frames'),
    p50Ms: field('p50Ms'),
    p95Ms: field('p95Ms'),
    maxMs: field('maxMs'),
    over33Ms: field('over33Ms'),
  }
}

async function settleFrames(page: Page): Promise<void> {
  for (let index = 0; index < SETTLE_FRAMES; index += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => { resolve() })
    }))
  }
}

async function startFrameSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = { frames: [] as number[], running: true, last: performance.now() }
    const tick = (now: number): void => {
      state.frames.push(now - state.last)
      state.last = now
      if (state.running) requestAnimationFrame(tick)
    }
    Reflect.set(globalThis, '__dshPerfFrames', state)
    requestAnimationFrame(tick)
  })
}

async function stopFrameSampler(page: Page): Promise<FrameStats> {
  const frames = await page.evaluate(() => {
    const state = Reflect.get(globalThis, '__dshPerfFrames') as
      | { frames: number[]; running: boolean }
      | undefined
    if (state === undefined) throw new Error('frame sampler was not started')
    state.running = false
    Reflect.deleteProperty(globalThis, '__dshPerfFrames')
    return state.frames
  })
  return frameStats(frames)
}

/** Measure one action through CDP metrics and the frames it produced. */
async function measurePhase(
  page: Page,
  cdp: CDPSession,
  action: () => Promise<void>,
): Promise<Phase> {
  await startFrameSampler(page)
  const before = await chromiumMetrics(cdp)
  const started = performance.now()
  await action()
  const wallMs = performance.now() - started
  await settleFrames(page)
  const after = await chromiumMetrics(cdp)
  const frames = await stopFrameSampler(page)
  return { ...windowDelta(before, after, wallMs), ...frames }
}

async function repeatPhase(
  page: Page,
  cdp: CDPSession,
  times: number,
  action: () => Promise<void>,
): Promise<PhaseSamples> {
  const samples: Phase[] = []
  for (let index = 0; index < times; index += 1) samples.push(await measurePhase(page, cdp, action))
  return { samples, median: medianPhase(samples) }
}

/** Open the seeded long session so the document behind the dialog is heavy. */
async function openSeededSession(page: Page, marker: string): Promise<void> {
  await page.getByText('Ungrouped', { exact: true }).waitFor({ timeout: 30_000 })
  const searchButton = page.getByRole('button', { name: 'Search sessions' })
  if (await searchButton.getAttribute('aria-expanded') !== 'true') await searchButton.click()
  await page.getByRole('textbox', { name: 'Search sessions...', exact: true }).fill(marker)
  const results = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
  await expect.poll(() => results.count(), { timeout: 60_000 }).toBe(1)
  await results.click()
  await page.getByRole('tab', { name: 'Chat', exact: true }).waitFor({ timeout: 30_000 })
  await settleFrames(page)
}

/** Toggle one custom property on the given element between two values. */
async function toggleToken(
  page: Page,
  selector: 'html' | 'body',
  token: string,
  values: readonly [string, string],
): Promise<void> {
  await page.evaluate((options: { selector: 'html' | 'body'; token: string; values: readonly string[] }) => {
    const element = options.selector === 'html' ? document.documentElement : document.body
    const current = element.style.getPropertyValue(options.token)
    const next = current === options.values[0] ? options.values[1] : options.values[0]
    element.style.setProperty(options.token, next ?? '', 'important')
  }, { selector, token, values })
}

/** Scroll the transcript with a page-side rAF loop for a fixed window. */
async function scrollTranscript(page: Page): Promise<void> {
  const target = page.locator('[data-conversation-scroll]')
  await target.waitFor({ timeout: 15_000 })
  await target.evaluate((element, options: { durationMs: number; px: number }) => {
    const scrollable = element as HTMLElement
    const state = { frames: [] as number[], done: false }
    let direction = -1
    let last = performance.now()
    const started = performance.now()
    const step = (now: number): void => {
      state.frames.push(now - last)
      last = now
      if (scrollable.scrollTop <= 0) direction = 1
      else if (scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1) direction = -1
      scrollable.scrollTop += direction * options.px
      if (now - started < options.durationMs) requestAnimationFrame(step)
      else state.done = true
    }
    Reflect.set(globalThis, '__dshPerfScroll', state)
    requestAnimationFrame(step)
  }, { durationMs: SCROLL_MS, px: SCROLL_PX_PER_FRAME })
  await page.waitForFunction(
    () => {
      const state = Reflect.get(globalThis, '__dshPerfScroll') as { done?: boolean } | undefined
      return state?.done === true
    },
    undefined,
    { timeout: 60_000 },
  )
}

/** Record one workload's trace events and aggregate them by name. */
async function traceWorkload(
  cdp: CDPSession,
  action: () => Promise<void>,
): Promise<TraceReport> {
  const collected: { name?: string; dur?: number }[] = []
  const onData = (payload: { value: { name?: string; dur?: number }[] }): void => {
    collected.push(...payload.value)
  }
  cdp.on('Tracing.dataCollected', onData)
  await cdp.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'benchmark',
      'cc',
      'gpu',
      'viz',
    ].join(','),
    transferMode: 'ReportEvents',
  })
  const started = performance.now()
  await action()
  const wallMs = performance.now() - started
  const complete = new Promise<void>((resolve) => { cdp.once('Tracing.tracingComplete', () => { resolve() }) })
  await cdp.send('Tracing.end')
  await complete
  cdp.off('Tracing.dataCollected', onData)
  const totals: Record<string, number> = {}
  const counts: Record<string, number> = {}
  for (const event of collected) {
    if (event.name === undefined || event.dur === undefined) continue
    if (!(TRACE_CATEGORIES as readonly string[]).includes(event.name)) continue
    totals[event.name] = (totals[event.name] ?? 0) + event.dur / 1_000
    counts[event.name] = (counts[event.name] ?? 0) + 1
  }
  const roundedTotals = Object.fromEntries(
    Object.entries(totals).map(([name, value]) => [name, rounded(value)]),
  )
  return { totalsMs: roundedTotals, counts, wallMs: rounded(wallMs) }
}

interface VariantReport {
  readonly variant: string
  readonly round: number
  readonly nodeCount: number
  /** Proof the shipped sheet is active and each override actually changed the computed value. */
  readonly resolved: {
    readonly cornerShapeSupported: boolean
    readonly cornerShape: string
    readonly elevationPanel: string
    readonly elevationStrokeColor: string
    readonly elevationOverrideApplied: boolean
  }
  readonly scrollTranscript: PhaseSamples
  readonly openSettings: PhaseSamples
  readonly switchToModels: PhaseSamples
  readonly switchToGeneral: PhaseSamples
  readonly toggleCornerShape: PhaseSamples
  readonly toggleStrokeColor: PhaseSamples
  readonly trace: TraceReport
  readonly traceDialogOnly: TraceReport
}

async function measureVariant(
  scaffold: WebScaffold,
  browser: Browser,
  variant: Variant,
  marker: string,
  round: number,
): Promise<VariantReport> {
  const page = await newEnglishPage(browser, VIEWPORT_HEIGHT)
  const tripwire = watchConsole(page)
  try {
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSeededSession(page, marker)
    if (variant.css !== undefined) await page.addStyleTag({ content: variant.css })
    // Flush the injected sheet's first full restyle before any measurement.
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    await settleFrames(page)
    const resolved = await page.evaluate(() => {
      const computed = getComputedStyle(document.body)
      const rules = [...document.styleSheets].flatMap((sheet) => {
        try {
          return [...sheet.cssRules].map(rule => rule.cssText)
        } catch {
          return []
        }
      })
      return {
        cornerShapeSupported: CSS.supports('corner-shape', 'superellipse(1.5)'),
        cornerShape: computed.getPropertyValue('corner-shape').trim(),
        elevationPanel: computed.getPropertyValue('--dsw-elevation-panel').trim().slice(0, 40),
        elevationStrokeColor: computed.getPropertyValue('--dsw-elevation-stroke-color').trim(),
        elevationOverrideApplied: rules.some(rule => rule.includes('--dsw-elevation-panel: revert')),
      }
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')

    const scrollTranscriptPhase = await repeatPhase(page, cdp, 1, () => scrollTranscript(page))
    const openSettings = await repeatPhase(page, cdp, REPEATS, async () => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Settings' })
      await dialog.waitFor({ timeout: 15_000 })
      await dialog.getByRole('button', { name: 'General', exact: true }).waitFor({ timeout: 15_000 })
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('dialog', { name: 'Settings' }).count(), { timeout: 10_000 }).toBe(0)
    })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('button', { name: 'General', exact: true }).waitFor({ timeout: 15_000 })
    const switchToModels = await repeatPhase(page, cdp, REPEATS, async () => {
      await dialog.getByRole('button', { name: 'Models', exact: true }).click()
      await expect.poll(
        () => dialog.getByRole('button', { name: 'Models', exact: true }).getAttribute('aria-current'),
        { timeout: 10_000 },
      ).toBe('true')
    })
    const switchToGeneral = await repeatPhase(page, cdp, REPEATS, async () => {
      await dialog.getByRole('button', { name: 'General', exact: true }).click()
      await expect.poll(
        () => dialog.getByRole('button', { name: 'General', exact: true }).getAttribute('aria-current'),
        { timeout: 10_000 },
      ).toBe('true')
    })
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('dialog', { name: 'Settings' }).count(), { timeout: 10_000 }).toBe(0)

    const toggleCornerShape = await repeatPhase(page, cdp, TOKEN_REPEATS, async () => {
      await toggleToken(page, 'html', '--dsw-corner-shape', CORNER_SHAPE_VALUES)
    })
    const toggleStrokeColor = await repeatPhase(page, cdp, TOKEN_REPEATS, async () => {
      await toggleToken(page, 'body', '--dsw-elevation-stroke-color', STROKE_COLOR_VALUES)
    })

    // Two traced workloads: the reported dialog interaction alone, and the same
    // interaction followed by a transcript scroll that repaints every rounded
    // surface in the window.
    const openSwitchClose = async (): Promise<void> => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      const tracedDialog = page.getByRole('dialog', { name: 'Settings' })
      await tracedDialog.getByRole('button', { name: 'General', exact: true }).waitFor({ timeout: 15_000 })
      await tracedDialog.getByRole('button', { name: 'Models', exact: true }).click()
      await expect.poll(
        () => tracedDialog.getByRole('button', { name: 'Models', exact: true }).getAttribute('aria-current'),
        { timeout: 10_000 },
      ).toBe('true')
      await tracedDialog.getByRole('button', { name: 'General', exact: true }).click()
      await expect.poll(
        () => tracedDialog.getByRole('button', { name: 'General', exact: true }).getAttribute('aria-current'),
        { timeout: 10_000 },
      ).toBe('true')
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('dialog', { name: 'Settings' }).count(), { timeout: 10_000 }).toBe(0)
    }
    const traceDialogOnly = await traceWorkload(cdp, openSwitchClose)
    const trace = await traceWorkload(cdp, async () => {
      await openSwitchClose()
      await scrollTranscript(page)
    })

    expect(tripwire.pageErrors).toEqual([])
    return {
      variant: variant.id,
      round,
      nodeCount: await page.evaluate(() => document.querySelectorAll('*').length),
      resolved,
      scrollTranscript: scrollTranscriptPhase,
      openSettings,
      switchToModels,
      switchToGeneral,
      toggleCornerShape,
      toggleStrokeColor,
      trace,
      traceDialogOnly,
    }
  } finally {
    await page.close()
  }
}

describe('manual web performance: settings dialog responsiveness', () => {
  let browser: Browser

  beforeAll(async () => {
    // Prefer the bundled Chromium; this checkout has no download, so fall back
    // to the installed Edge channel, which is the same engine.
    browser = await chromium.launch().catch(() => chromium.launch({ channel: 'msedge' }))
  })

  afterAll(async () => {
    await browser?.close()
  })

  it('reports the dialog cost with and without each synced global stylesheet', async () => {
    const scaffold = await launchWebScaffold({})
    try {
      const fixture = createChatScrollFixture({
        markerPrefix: SEED_MARKER_PREFIX,
        title: 'Settings dialog performance fixture',
        turns: SEED_TURNS,
      })
      await seedSession(scaffold, fixture.log, SEED_ID)
      const reports: VariantReport[] = []
      for (let round = 0; round < ROUNDS; round += 1) {
        // Reverse the page order every other round: the first page of a browser
        // process pays one-time warm-up (V8, fonts, compositor), so a fixed
        // order would credit that cost to whichever variant ran first.
        const order = round % 2 === 0 ? VARIANTS : [...VARIANTS].reverse()
        for (const variant of order) {
          reports.push(await measureVariant(scaffold, browser, variant, fixture.markers.user(1), round))
        }
      }
      for (const report of reports) {
        expect(report.scrollTranscript.median.frames).toBeGreaterThan(10)
        expect(report.nodeCount).toBeGreaterThan(500)
      }
      console.info(`WEB_PERF_RESULT ${JSON.stringify({
        scenario: 'settings-dialog-stylesheet-ab',
        seedTurns: SEED_TURNS,
        viewportHeight: VIEWPORT_HEIGHT,
        rounds: ROUNDS,
        repeats: REPEATS,
        tokenRepeats: TOKEN_REPEATS,
        reports,
      }, null, 2)}`)
    } finally {
      await scaffold.close()
    }
  }, 900_000)
})
