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
