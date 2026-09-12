---
description: "Web settings dashboard for local session usage statistics; for users and maintainers of the usage-stats experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-usage-stats

English | [中文](README.zh.md)

## Summary

It opens on 30 days of local usage history, with 7 days and manual refresh one click away. It occupies the existing `settings.section` id `usage-stats`. Headline figures, an activity grid, the daily Token trend, the model ring, and the breakdown follow. Each reveals its own figures on hover or focus: a cell or day column opens a detail card, and a model row and its ring segment highlight each other. Refresh and range changes keep committed data visible, stale responses are ignored, failures expose Retry, and unreadable sessions are reported, not counted. Exact figures stay in accessible names and tables.

## Table of Contents

- [Reading the dashboard](#reading-the-dashboard)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Reading the dashboard

The strip reports the range's Token total, sessions, messages, active days, and current streak. A value whose compact form drops precision carries the exact figure as a hover and focus tooltip, so no figure is readable only by approximation. The leading model is named in the model-usage card's header, beside the ring that shows it.

The activity grid colors one square per Host calendar day by tokens, in thirds of the range maximum. Its switch selects what a square reports: **daily** is that day, **weekly** is the Monday-started week containing it, so every square of a week reports the same total, and **cumulative** is the running total through that day. Weeks start on Monday so the metric is a function of the date rather than of the viewer's locale. When visible messages exist but the provider reported no tokens, the grid explains that instead of presenting an idle range.

The trend card plots the same days as one line per Token bucket or as stacked daily bars. Both forms share the day columns, so a hover or a focus reveals the same detail card and places the same crosshair; pointing at a legend entry recedes the other series. Lines scale to the largest single bucket and the stacked bars to the largest daily total, and longer ranges thin the axis labels.

The model ring draws one stroked arc per segment, so a segment's pointer area is exactly the segment the reader sees. It shares the fixed series palette with the trend. The ranking lists each model with its share of the range and its Token total, and every model past the leading four is summed into the last segment.

## Model Experience

None, as this browser plugin renders Host-derived data and adds no model-visible content.

#### KV Cache effect

None; it never participates in provider requests.

## Known Limitations and Deferred Work

- The dashboard refreshes on mount, range change, or explicit user action; it does not poll.
- The activity grid follows the selected 7- or 30-day range, so it is a dense grid rather than a year calendar: a square's date comes from its accessible name and its detail card, not from an axis.
- Visual charts intentionally use five existing semantic series colors. Labels, fixed ordering, accessible summaries, and complete tables carry the same distinctions without color.
- Costs, balance, plan, quota, and model pricing are intentionally absent because the Host service does not establish those facts.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
