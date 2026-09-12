# Agent Note: Reveal each charted figure on the usage dashboard

Status: implemented

English | [中文](2026-09-12-usage-stats-dashboard-interaction-details.zh.md)

## Problem

The usage dashboard presented its history as one-directional pictures. Every value a reader might want to check — a single day's tokens, which bucket produced a spike, how a model's share was measured — was available only somewhere else: a heatmap cell's native `title`, the summary line above the trend, or a table behind a disclosure. Reference implementations of this dashboard instead answer the reader where they are looking, and the settings column has room to do it.

## Decision

`@deepseek-ai/dsh-client-ui-usage-stats` reveals each figure from the element that draws it, and its cards own the viewing state that governs them.

The headline figures moved into one divided strip with the value above its label. A compacted value carries the exact figure as a hover and focus tooltip rather than restating it, and the leading-model fact moved beside the ring that shows it, so the strip holds the five range totals alone. The range row now names the control that governs every card below it.

The activity grid colors a cell by tokens in thirds of the range maximum and lets the reader choose what a cell reports: the day, the Monday-started week containing it, or the running total through it. Every cell opens a detail card on hover or keyboard focus, and names itself with the exact day, tokens, and messages.

The trend card plots the range as one line per Token bucket or as stacked daily bars. Both forms share the per-day hover columns, so a hover or a focus reveals the same detail card, places the same crosshair, and marks each non-zero bucket at that day. Pointing at a legend entry recedes the other series. The plot box is `0 0 100 100` with `preserveAspectRatio="none"` and non-scaling strokes, so neither the lines nor the stacked bars need the card's pixel width.

The model ring is drawn as one stroked arc per segment instead of `stroke-dasharray` offsets, so a segment's pointer area is exactly the segment the reader sees, and pointing at a row or a segment highlights the other.

`Tooltip` in `@deepseek-ai/dsh-client-ui-primitives` now accepts a node label, not only a string. The dashboard's two detail cards are nodes, and the primitive already owns anchor measurement, placement, viewport fitting, and the top/bottom flip. Its bubble takes no pointer events, which is what a chart hover hint needs: `HoverCard` is a preview the pointer may rest on and copy from, and its block-level anchor wrapper would break the grid and column layouts these cells live in.

Every switch belongs to the card it governs: the metric to the activity grid, the plotting form to the trend card. Nothing about the range or the scan changed.

## Alternatives considered

**Extend the Host snapshot instead of the browser** — rejected for this change, not on principle. Cumulative tokens, a peak day, the longest session, the longest streak, and a year-long activity series would all require new Host fields (and, for the longest session, a new per-session wall-time fold), which changes the wire contract, the typos-generated Remote artifacts, and the recorded goldens. Those figures are worth adding on their own merits; they are not a prerequisite for revealing values the dashboard already receives.

**Draw a week-column calendar with weekday rows** — rejected because a 7- or 30-day range cannot fill one, and a week-column grid would use roughly a third of the content column while shrinking the hover target. The dense grid keeps cells large enough to point at; the day of a cell comes from its accessible name and its detail card.

**Per-model trend lines, as the reference shows** — not possible from the current wire: the Host aggregates tokens per day and per model separately, never per day *and* model. The four Token buckets are the per-day series the snapshot actually carries, so the legend and the detail-card rows name buckets. Model attribution stays in the ring and the ranking, where the data supports it.

**Keep a local tooltip component beside the charts** — rejected as duplication: anchor measurement, viewport fitting, and the flip are the primitive's, and a second copy would drift. Widening `Tooltip.label` to a node is additive: every existing call site passes a string, and no branch was added.

**Make the activity grid's week start locale-derived** — rejected in favour of a fixed Monday. The weekly metric then depends only on the date, and a unit test pins it; a locale-derived start would have made "the week's total" differ between readers of the same log.

**Give the legend keyboard stops** — rejected: the legend's only behavior is a transient visual emphasis, and the dashboard's keyboard path already reaches the same figures through each day column and the detail tables. Adding five stops with no action would cost more than it returns.

## Consequences

Every figure the dashboard draws can be read where it is drawn, and each detail card's compact value is backed by an exact one in the same element's accessible name. The recorded Web golden now carries a named cell per day and a named column per day, so the interactions are under the same keyless evidence as the rest of the page.

The cards hold their own switches, so a range change keeps the reader's chosen metric and plotting form. Detail cards are transient and non-interactive by design: nothing inside them can be selected, copied, or focused, which is why the tables remain the surface for reading many values at once.

The dashboard still requests 7 or 30 Host days and presents no figure the Host does not supply. A reviewer looking for cumulative or all-time figures will not find them here, and the README's limitations say so.
