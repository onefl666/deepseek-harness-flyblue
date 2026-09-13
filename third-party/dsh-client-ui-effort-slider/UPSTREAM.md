# Upstream pin

Embedded checkout of [MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider](https://github.com/MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider).

- Version: `0.7.0`
- Source: local `DSH-Claude-Style-Reasoning-Slider-main.zip` matching commit `7bfa52083ed36ccd012fe34710f345dde19e42db`
- License: MIT

`@deepseek-ai/dsh-web-app` mounts this package as the enabled `effort-slider` row. Rebuild the browser half with `node scripts/build-client.mjs` after editing `src/`.

## Local modifications

Keep this log exhaustive — every divergence from upstream must be listed, and a
sync replays or retires each entry the way
[vendor/README.md](../../vendor/README.md) requires for vendored packages.

1. **`index.js`** — adapted to the 0.1.5 host plugin contract: the entry is a
   function plugin (`name` + `apply`) instead of the upstream standalone
   server, and it mounts the `/effort-slider-assets/` prefix route through
   `ctx.inject(["webServer"], ...)` so a composition without a web server still
   activates.
2. **`package.json`** — repointed at this checkout: `dsh.client` inject names,
   the `files` list (`lib/client.js`, assets, README) and the `build` script
   that runs `scripts/build-client.mjs` follow the local layout rather than
   upstream master.
3. **`src/client.js`** — the forked `EffortModelSelect` reads the shared model
   directory through `React.useSyncExternalStore` (matching the workspace
   `ModelSelect`) instead of mirroring it into local state, computes its choice
   list from `state.groups`, and renders the repeated chevron and the whole
   reasoning pane through the local `Chevron` / `EffortPane` components.
4. **`src/client.js` menu behavior** — the reasoning pane keeps its controls
   enabled while a selection is in flight, and `onBlur` ignores a `focusout`
   whose `relatedTarget` is not a `Node`. Upstream disabled the slider during
   the submit, which moved focus to `body` and closed the menu on every adjust;
   only the model list stays disabled and only a successful model switch closes
   the menu.
5. **`src/client.js` settings row** — the chibi switch row and its switch follow
   the native settings row metrics and the `ui-primitives` `Switch` geometry,
   keyed off `aria-checked`, and the switch carries the row title as its
   accessible name.
6. **`src/ds-effort-slider.js` shadow CSS** — one derived custom property set
   (`--ds-effort-thumb-travel` / `-left` / `-center`) is the single source for
   the thumb, glow, fill and tick geometry, which also centers the thumb glow;
   `:host([chibi]) .track-shell` grows to the thumb height so the chibi is not
   clipped by the track; the help bubble is positioned against the header with
   `width: min(16rem, 100%)` so it stays inside the panel; the level stage is a
   single-cell inline grid sized by the real label instead of a hidden
   `Default` placeholder; and inline mode uses the menu's type scale.
7. **`src/ds-effort-slider.js` dead code** — removed `_nearestSupported`,
   `_stepSupported` and `_nearestSupportedFrom` (superseded by the pane-level
   nearest-supported logic), the unreachable `min()` clamp on the chibi thumb,
   and the duplicate inline rules.
8. **`README.md` / `README.zh.md`** — document the current menu behavior
   (adjusting effort keeps the menu open), the contained help bubble and the
   fully visible chibi, and point the demo page at `../assets/`.
9. **`demo/index.html`** — restored: loads `src/ds-effort-slider.js` directly
   with `liang-asset-base` / `chibi-sprite` resolved against `../assets/`, and
   offers panel/inline mode and level switches for visual checks.
10. **`src/client.js` declared levels** — the slider's level list is now derived
    from the model's adapter-declared `reasoning.efforts` (`levelsFromReasoning`)
    instead of the fixed six-slot `LEVELS` palette. The `supported` boolean
    array, `computeSupported`, `nearestSupportedBelow`, `effortIdForCanonical`,
    the adapter-specific extra pills, the `Default` pill and the whole
    "unsupported level → apply the nearest one below + toast" path are gone;
    every stop applies its own real effort id. A model advertising a single
    level renders one fixed chip instead of a one-stop range. Switching models
    now carries the effort over only when the new model advertises the same
    effort id; otherwise the selection falls back to that model's default with
    a toast. The `effort.providerDefault` strings are gone too: the chip names
    the level the handle rests on (the advertised default, else the first
    declared level), so there is no `Default` state left to display.
11. **`src/ds-effort-slider.js` tiers** — level identity moved from slider
    position to tier: `TIER_COLORS`/`_SOFT`/`_DEEP` are keyed by canonical
    token, `data-level` (index) became `data-tier` (string), the High/Extra
    ripple field is selected by tier (`data-field="high" | "extra"`, with
    `xhigh` sharing the `extra` treatment) instead of by index 3/4, `data-glow`
    follows the tier, and the trigger bars and `aria-valuemax` are rebuilt from
    the real level count by `_syncLevels`. The `supported` accessor, the
    `data-disabled` tick style and `_parseSupported`/`_isSupported` are removed.
12. **`src/ds-effort-slider.js` 梁 mapping** — `liangStageForIndex(index, count)`
    distributes the six stage names proportionally, so the first level is always
    `小难梁` and the top level is always `梁祖` at any level count; the label
    suffix, the aria label and the 31-frame portrait index all use it, and the
    frame helper now uses `LIANG_MAX_FRAME` instead of a literal 30.
    `_applyLevelLabel` also refreshes the range's `aria-valuetext`.
13. **`src/ds-effort-slider.js` / `src/client.js` Ultracode ambience** — a new
    `ultracode` attribute gates a panel-wide gradient border, outer glow and
    inner wash, a brighter entry shockwave plus a slow aurora sweep over the Max
    pixel field, and a violet halo on the trigger chip. The composer card is
    styled through `[data-composer-card]:has(.ds-effort-ultracode)` from the
    plugin's global sheet, so the plugin still writes nothing outside its own
    subtree. All of it degrades to a static violet border under
    `prefers-reduced-motion`.
14. **`src/client.js` settings rows** — the `settings.general.item` inject now
    yields two registrations from one generator: the existing Big Fat Fish row
    and a new `Ultracode 氛围光效` row backed by its own `localStorage` store,
    **on by default**. Both rows render through a shared `PrefSettingRow`.
15. **`demo/index.html`** — the supported-level checkboxes became a level-set
    `<select>` (DeepSeek four, pi-ai three, the six-level superset, an `xhigh`
    set and a set containing an unknown level), plus an Ultracode ambience
    switch; the level range and its label follow the selected set.
16. **`README.md` / `README.zh.md`** — rewritten around declared-level parity,
    the removed Default/extra pills and downgrade path, the proportional 梁
    mapping, and the Ultracode ambience plus its settings switch.
17. **`src/ds-effort-slider.js` intensity animation** — the ambience is no longer
    switched on and off. `--ds-effort-ultracode` is a registered `<number>` on
    the host (0 → 1 while `[data-max][ultracode]`), driving the panel border,
    both panel layers and the panel glow through one transition; the ring and the
    inner wash are now always present and merely faded, so leaving the state is a
    real transition rather than an element disappearing. `_reveal` and
    `_ultracodeIntensity` are the canvas equivalents: each frame eases the
    current value toward a target with a frame-rate-independent exponential, so
    reversing mid-flight continues from the value already on screen instead of
    restarting. Leaving Max keeps `data-pixels-ready` and the draw loop alive
    until the intensity reaches zero, the entry shockwave is gated to the rising
    direction, and the ambience bloom is multiplied separately from the pixel
    field so the settings switch never disturbs the field itself.
18. **`src/client.js` pane transition** — the three menu panes are now keyed
    nodes inside `.ds-effort-panes`: switching keeps the outgoing pane mounted,
    inert and absolutely placed while it transitions out, and the incoming one
    enters from the direction of travel (`--ds-effort-pane-dir`). Because the
    outgoing pane keeps its DOM node, React reuses it and CSS transitions from
    its current computed values, so a second click mid-flight turns the same
    motion around. The trigger chip and the composer card gained matching
    enter/leave transitions, and the card's ring is now an always-present
    pseudo-element faded by opacity.
