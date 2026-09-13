# DSH Claude Style Reasoning Slider

An animated reasoning-effort slider and model picker for **DeepSeek Harness (DSH)**.
It replaces the native model selector's `conversation.input.model` slot with a
compatible selector whose reasoning pane is a Claude-style animated slider.

> 🇨🇳 中文版说明请见 [README.zh.md](README.zh.md)

## Preview

![DSH Effort Slider preview](assets/dsh-effort-slider-preview.png)

## Features

- **Drop-in model selector** — replaces only the `conversation.input.model` slot;
  the rest of the chat input stays untouched.
- **One slider stop per declared level** — the slider renders exactly the
  reasoning levels the current model's adapter advertises, in the adapter's own
  order and count. DeepSeek advertises `Off | Low | High | Max`, so that is what
  the slider shows; a level the model does not offer never appears, and every
  stop applies the real effort id it stands for.
- **Tolerant tier matching** — declared names are recognized through aliases
  (`none`/`disabled` → off, `ultracode`/`maximum` → max, `med` → medium,
  `extreme` → extra, and pi-ai's `Xhigh`). Known tiers take the localized label;
  a provider vocabulary we do not know keeps its own name verbatim.
- **Model switching preserves effort** — when you switch models, the current
  effort is kept when the new model advertises the same effort id; otherwise the
  choice falls back to that model's own default and a toast explains it.
- **Liang Calibrator (滑动变祖器)** — optional, off by default. Distributes the
  six stage names across however many levels the model offers, proportionally:
  the first level is always `小难梁` and the top level is always `梁祖` (at four
  levels: `小难梁`, `梁子`, `梁圣`, `梁祖`). When enabled, a 31-frame portrait
  (`frame-00`…`frame-30`) appears above the slider and follows the thumb
  continuously while dragging, then snaps to the segment's first frame on
  release. Labels and the trigger show `Max 梁祖`-style suffixes. The setting
  persists in `localStorage`.
- **Big Fat Fish thumb** — optional, off by default. Replaces the slider thumb
  with an 8-frame running chibi fish sprite. The idle animation loops at
  `720ms`, speeds up to `420ms` while dragging, and freezes under
  `prefers-reduced-motion`. Toggle it in DSH **Settings → General → Big Fat Fish
  slider**; changes apply immediately and persist in `localStorage`.
- **High / Extra ripple field** — a `high` level (and pi-ai's `xhigh`) shows a
  blue dot-matrix field; `extra` shows the same in purple. Both flicker randomly
  and ripple outward around the thumb, as a lighter prelude to the `Max` pixel
  field.
- **Ultracode ambience** — the model's `max` level turns the slider into an
  animated purple pixel field with a brighter entry shockwave and a slow aurora
  sweep, and the `Max` label becomes a flowing multi-color gradient text. With
  **Settings → General → Ultracode ambience** on (the default), the effort pane
  gains a flowing gradient border, the trigger chip gains a violet halo, and the
  composer card gains a matching edge ring and glow. Turning the switch off
  removes all three without touching the pixel field itself.
- **Interruptible motion** — the ambience ramps in and out instead of snapping:
  every layer fades, blooms and recedes over a non-linear curve, and turning the
  level or the switch around mid-flight reverses the same motion from wherever it
  had reached. Entering is quicker than leaving, and the whole ramp is skipped
  under `prefers-reduced-motion`.
- **Localized and theme-aware** — ships with English and Simplified Chinese
  dictionaries and follows DSH light/dark design tokens.
- **Accessible** — keyboard-operable slider (arrows, Home/End, PageUp/PageDown)
  that keeps focus while the level is applied, ARIA labels, focus management,
  and `prefers-reduced-motion` support.

## Install

Install the bundle from the Git repository:

```sh
dsh plugin --profile web add github:MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider
dsh --profile web
```

Or use a local checkout:

```sh
dsh plugin --profile web add ./dsh-client-ui-effort-slider
```

Restart the web profile after installing or removing the bundle.

## Usage

1. Click the model/effort trigger chip in the conversation input.
2. In the popup menu, choose **Model** to switch models, or **Effort** to adjust
   the reasoning level of the current model.
3. In the effort pane:
   - Drag or click the slider to pick one of the levels the model advertises.
   - Every stop is a real level, so the stop you click is the effort that is
     applied. A model advertising a single level shows one fixed chip instead of
     a one-stop range.

   Adjusting the level keeps the menu open and the focus on the slider, so
   arrow keys step through levels one after another. Only a successful model
   switch closes the menu and returns focus to the trigger chip.
4. When switching models, the plugin keeps the current effort if the new model
   advertises the same effort id; otherwise the level falls back to that model's
   default and a toast explains it.
5. To enable the **Liang Calibrator**, click the `滑动变祖器` switch below the
   track. The portrait and stage-name suffixes turn on immediately; the state
   is remembered across sessions.
6. To enable the **Big Fat Fish thumb**, open DSH **Settings → General** and turn
   on **Big Fat Fish slider**. The thumb changes immediately without a restart.
7. To turn off the **Ultracode ambience**, open DSH **Settings → General** and
   turn off **Ultracode ambience**. The pane border, trigger halo, and composer
   edge glow fade out over the same curve they arrived on; the switch is on by
   default.

## UI effects

- **Trigger chip** — shows the current model and effort label, rising signal
  bars (one per real level) that fill with the current level, and a chevron. At
  the top `max` level the effort label flows as a purple gradient and, with the
  Ultracode ambience on, the chip carries a violet halo. With the Liang
  Calibrator enabled it also shows stage suffixes such as `Max 梁祖`.
- **Two-level popup menu** — a compact menu with a model list (grouped by
  provider) and an effort pane; loading/error/retry states are included. The
  effort pane stays open while you adjust, and the help bubble is anchored to
  the panel header so it stays inside the menu. Moving between the root, model
  and effort panes slides and cross-fades them in the direction you travelled:
  the outgoing pane keeps its own node and animates out while the incoming one
  settles, so clicking again before it finishes turns the same motion around
  rather than restarting it.
- **Glass track** — inner bevel shadows and a subtle fractal-noise layer break
  up flat-color banding.
- **Light field** — the track responds to the pointer like a light source: an
  interior light pool and a glass-edge highlight follow the cursor, brightening
  as the pointer approaches and fading with distance. The light is suppressed
  at `Max` so the pixel field stays clean.
- **Level labels** — faint tick labels; the current level is always shown,
  hovering near a slot highlights it, and others stay barely visible. The stage
  sizes itself to the real label, so suffixed labels such as `高 梁圣` fit.
- **Liang portrait** — when the Liang Calibrator is enabled, a `224px` square
  portrait appears above the track. It uses 31 WebP frames (`frame-00`…
  `frame-30`) that change continuously while dragging and keep the original
  scanline + light-spot texture.
- **Liang toggle indicator** — the `滑动变祖器` switch below the track uses a
  dot indicator: a gray dot when off, a glowing purple dot when on.
- **High / Xhigh / Extra dot-matrix ripple** — a `high` level shows a blue
  particle field and `xhigh`/`extra` the same in purple: sparse dots that expand
  from the thumb, flicker randomly, and animate bright/dark water ripples
  radiating outward.
- **Max pixel field** — at `Max` the track becomes an animated purple pixel
  field with a reveal sweep and flowing cell flicker; the `Max` label uses a
  flowing multi-color gradient.
- **Ultracode ambience** — the effort pane gains a flowing gradient border, a
  violet outer glow and a soft inner wash; entering `Max` sweeps a brighter
  shockwave across the track and a slow aurora band keeps sweeping afterwards;
  the composer card gains a matching edge ring and glow. Every one of those
  layers is driven by a single intensity that eases in and out over a
  `cubic-bezier` curve, so the glow blooms as it arrives and recedes as it
  leaves instead of switching on and off. `prefers-reduced-motion` keeps the
  static violet border and label color and drops every animation.
- **Interruptible by construction** — the intensity is a target the current
  value eases toward, never a one-shot ramp: dragging across `Max`, flipping the
  ambience switch, or stepping back and forth resumes from the intensity already
  on screen. The pane switch works the same way, because the outgoing pane keeps
  its DOM node and only changes state class.
- **Big Fat Fish thumb** — when enabled, the thumb becomes an 8-frame running
  chibi fish sprite. It loops at `720ms` when idle, `420ms` while dragging, and
  freezes under reduced motion. The track grows to the thumb height, so the
  sprite is drawn in full instead of being clipped top and bottom.
- **Motion safety** — effects use CSS transitions/animations or lightweight
  event handlers, and `prefers-reduced-motion` is respected.

## Notes

- The plugin styles the composer card through
  `[data-composer-card]:has(.ds-effort-ultracode)` rather than writing an
  attribute onto another package's DOM element. A browser without `:has()`
  support simply shows no composer glow; nothing else changes.
- There is no `Default` level anywhere. The chip names the level the slider
  handle rests on: the model's advertised default when it has one, otherwise the
  first declared level.

## Development

Build the client bundle from source:

```sh
npm install
npm run build
```

`lib/client.js` is generated from `src/client.js` plus `src/ds-effort-slider.js`
by `scripts/build-client.mjs`.

Run the standalone component demo:

```sh
# open demo/index.html in a browser
```

The demo page exercises panel mode, inline mode, supported-level combinations,
theme switching, the Max pixel field, the Liang Calibrator, and the Big Fat Fish
thumb. It resolves `liang-asset-base` / `chibi-sprite` against `../assets/`, so
it opens straight from the filesystem with no build step.

## Package contract

This is a DSH bundle, not a dynamic `cordis_define` snippet. The package uses:

- `dsh.bundle.patch` (`cordis.patch.yml`) for self-registration.
- `dsh.client.platform: web` for the browser half.
- `lib/client.js` as a prebuilt ModuleLoader artifact, generated from `src/`.
- `index.js` as the host half: it mounts an `/effort-slider-assets/` static
  route that serves `assets/liang-frames/*.webp` and
  `assets/chibi-runner-strip.png` to the browser half.

## Files

- `index.js` — host half; serves the Liang portrait frames and chibi sprite.
- `src/ds-effort-slider.js` — standalone Web Component (shadow DOM, no framework).
- `src/client.js` — React wrapper + forked model selector plugin logic.
- `scripts/build-client.mjs` — bundle generator.
- `demo/index.html` — standalone UI demo.
- `assets/` — `liang-frames/` (31 WebP frames) and `chibi-runner-strip.png`.
