# Agent Note: Measure synced global stylesheets before changing them

Status: implemented

English | [中文](2026-09-08-settings-dialog-global-stylesheet-measurement.zh.md)

## Problem

Settings-dialog interactions became janky after the upstream sync. Two global sheets arrived in that sync and both scale per element, so each had a plausible story:

- [`gradient-shadow-text.css`](../../../../packages/client/ui-theme/src/styles/gradient-shadow-text.css) declares four derived elevation custom properties on `body, body *`, each value embedding further `var()` references, so every element re-substitutes them against its own stroke color.
- [`corner-shape.css`](../../../../packages/client/ui-theme/src/styles/corner-shape.css) applies `corner-shape: superellipse(1.5)` to `*, *::before, *::after`, so every element paints path-based corners.

A plausible story is not a measurement, and the two candidate fixes differ in kind: the elevation rewrite is visually neutral, while changing the corner shape is a product-visible change.

## Decision

[`apps/web/tests/settings-dialog.perf.ts`](../../../../apps/web/tests/settings-dialog.perf.ts) is the diagnostic. It boots the real scaffold, seeds and opens a 200-turn session, then measures four page-side variants — the shipped sheet, `corner-shape: initial` on the universal selectors, the four derived elevation properties reverted on descendants, and both — over two rounds with reversed page order and repeats, taking per-field medians. It reports CDP window metrics, rAF frame intervals, and two CDP traces (dialog-only, and dialog plus transcript scroll), and asserts only that the measured surfaces still exist.

Measured on headless Edge 152 at 1680x700 over 2837 nodes:

- The derived elevation properties cost nothing measurable. A full-document restyle of the same document measured 7.5 ms shipped and 7.3 ms with them reverted (~3%), and every traced category matched.
- `corner-shape: superellipse(1.5)` is the only measurable cost. One dialog open, section switch, and close: GPUTask 14–15 ms shipped against 4.5–4.7 ms, Paint 5.4–6.2 ms against 3.0–3.7 ms. A 1.5 s transcript scroll: GPUTask 520–541 ms against 222–232 ms (−57%), RasterTask 68–74 ms against 57–60 ms. Style recalculation and layout are unchanged in both workloads, as expected for a paint-only property.
- No variant reproduced user-visible jank: p95 frame interval 4.2–8.4 ms, zero or one frame above 33 ms, median dialog open 34–63 ms (coldest first open 98 ms).

## Alternatives considered

**Land the elevation rewrite on the code-reading argument.** Rejected: the reverted variant measured ~3% of a full-document restyle, inside run-to-run noise. Rewriting every rule that rebinds `--dsw-elevation-stroke-color` to re-declare the derived properties would buy no measured gain and would put the visual equivalence of fourteen component sheets at risk.

**Treat the superellipse as the cause and change it.** Rejected: the probe never reproduced frame jank in any variant. The measured GPU cost is real, but the replacement is product-visible, so it needs the owner's choice rather than an inferred one.

**Add the probe to the CI web lane.** Rejected: a required browser timing case needs repeated samples on the actual CI browser and runner before it can carry a budget. The manual lane is where uncalibrated diagnostics belong.

## Consequences

The elevation rewrite is not justified and is not made: every rule that rebinds `--dsw-elevation-stroke-color` keeps its current form.

The superellipse rule stays as shipped until its owner chooses a replacement, because removing or narrowing it changes visible corner geometry. The measurement above is the evidence for that choice: it attributes GPU and raster time to the corner shape and none to the elevation properties, while also showing that this environment never produced frame jank. A DevTools profile from a machine that does reproduce the jank is what would connect the measured GPU cost to the reported symptom.

The probe lives in the manual performance lane (`vitest.web.perf.config.ts`), not in a CI lane. A browser timing budget requires repeated measurement on the CI browser and runner; this probe has only one environment's samples, so it reports instead of asserting thresholds.
