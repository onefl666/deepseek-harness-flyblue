---
description: "Web settings dashboard for local session usage statistics; for users and maintainers of the usage-stats experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-usage-stats

English | [中文](README.zh.md)

## Summary
Web settings dashboard for `@deepseek-ai/dsh-usage-stats`. It registers the existing `settings.section` id `usage-stats`; no top-level navigation is added.

The initial view requests 30 days and can switch to 7 days or refresh manually. KPI cards, a visible-message heatmap, stacked daily Token bars, a model donut and ranking, and the Token-bucket breakdown fit the settings content column; expandable tables retain every model and day. Refresh and range changes retain the committed data with a busy message, stale responses are ignored, a failed update exposes Retry, and sessions the Host could not interpret are excluded and reported.


## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Model Experience

None, as this browser plugin renders Host-derived data and adds no model-visible content.

#### KV Cache effect

None; it never participates in provider requests.

## Known Limitations and Deferred Work

- The dashboard refreshes on mount, range change, or explicit user action; it does not poll.
- Visual charts intentionally use five existing semantic series colors. Labels, fixed ordering, accessible summaries, and complete tables carry the same distinctions without color.
- Costs, balance, plan, quota, and model pricing are intentionally absent because the Host service does not establish those facts.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
