# Agent Note: The effort slider follows the model's declared reasoning levels

Status: implemented

English | [中文](2026-09-13-effort-slider-declared-levels.zh.md)

## Problem

The shipped Claude-style slider drew a fixed `Off | Low | Medium | High | Extra | Max` palette and mapped whatever each adapter advertised onto it, so `Medium` and `Extra` appeared for models that never offered them. Clicking one of those phantom stops silently applied the nearest real level below and explained the swap with a downgrade toast. DeepSeek advertises `Off | Low | High | Max`, so half of the visible track was unreachable, and the color of a real level depended on its position in that invented palette rather than on the level itself.

The Ultracode identity was also confined to the track: Claude Code renders its ultracode effort badge in a built-in purple independent of theme ([issue #70398](https://github.com/anthropics/claude-code/issues/70398)), while DSH's top level only recolored the track and the label.

## Decision

`src/client.js` derives the slider's level list from the model's adapter-declared `reasoning.efforts` — same order, same count, same ids — through `levelsFromReasoning`. There is no fixed palette to map onto and no `supported` boolean array: every stop applies the effort id it stands for. A model advertising one level renders a single fixed chip instead of a one-stop range.

Declared names are normalized to a tier (`none`/`disabled` → off, `ultracode`/`maximum` → max, `med` → medium, `extreme` → extra, pi-ai's `Xhigh`), and the tier picks the localized label. A vocabulary no tier knows keeps the adapter's own text and gets no bespoke color or effect. `Default`, the adapter-specific extra pills, the nearest-supported-level fallback, and its downgrade toasts are gone: the chip names the level the handle rests on (the advertised default, else the first declared level), so no `Default` state is displayed anywhere.

`src/ds-effort-slider.js` moved from positional to tier identity: colors are keyed by canonical token, `data-level` (index) became `data-tier` (string), the High/Extra ripple field is selected by tier (`data-field="high" | "extra"`, with `xhigh` sharing the extra treatment), and `_syncLevels` rebuilds the ticks, trigger bars and `aria-valuemax` from the real level count. The 梁 Calibrator distributes its six stage names proportionally through `liangStageForIndex`, so the first level is always `小难梁` and the top level is always `梁祖` at any count.

The Ultracode ambience extends the top `max` tier beyond the track: a flowing gradient border, outer glow and inner wash on the effort pane, a brighter entry shockwave plus a slow aurora sweep over the pixel field, and a violet halo on the trigger chip. The composer card is styled through `[data-composer-card]:has(.ds-effort-ultracode)` from the plugin's global sheet — the plugin still writes nothing outside its own DOM subtree, matching the fact that no feature plugin in `packages/client` does. A `settings.general.item` row (**Settings → General → Ultracode ambience**, on by default, `localStorage`-backed like the chibi switch) turns the whole layer off; `prefers-reduced-motion` degrades it to a static violet border and label color.

Both the ambience and the menu's pane switch animate in **both** directions on an interruptible curve. Every ambience layer is persistent and driven by one intensity: `--ds-effort-ultracode` is a registered `<number>` whose transition carries the panel border, ring, wash and glow, so removing the state fades a real transition instead of deleting an element, and the canvas equivalents (`_reveal`, `_ultracodeIntensity`) ease the current value toward a target every frame with a frame-rate-independent exponential rather than a one-shot ramp. Nothing reads elapsed time, so reversing mid-flight — dragging back off `Max`, flipping the settings switch, or stepping the level back and forth — continues from the intensity already on screen. Leaving `Max` keeps `data-pixels-ready` and the draw loop alive until the intensity reaches zero, the entry shockwave is gated to the rising direction so the exit does not re-ignite it, and the ambience bloom is multiplied separately from the pixel field so the switch never disturbs the field itself. The menu's three panes are keyed nodes: the outgoing pane stays mounted, inert and absolutely placed while it transitions out, and the incoming one enters from the direction of travel, so a second click before it settles turns the same motion around because React reuses the node and CSS interpolates from its current values.

## Alternatives considered

**Keyframe animations for the ambience.** Rejected: an `animation` replays from its first keyframe whenever it is (re)applied, so a fast Max → High → Max reads as a flicker, and there is no `animation` to run at all once the state class is removed. Transitions on a persistent layer start from the computed value, which is what makes the reversal continuous.

**A JavaScript tween with an explicit start time and duration.** Rejected for the same reason: on interrupt it either jumps to the new curve's start or needs hand-rolled velocity carry-over, while the exponential approach gets C0 continuity from simply keeping the current value.

**Keep the fixed palette and hide unsupported stops.** Rejected: hiding positions in a fixed track either leaves gaps in the track geometry or produces a variable-length track that is still a palette — the level identity stays positional, so the same level changes color between models and the track length never matches what the model offers.

**Render adapter-specific levels as extra pills below a canonical slider.** This is what shipped before for names no canonical token knew. Rejected once the slider renders declared levels directly: the pill row and the track would be two competing ways to express the same set, and a provider with only non-canonical names would show an empty track plus every level as a pill.

**Keep a `Default` pill.** Rejected by the user: with every stop being a real level, a separate control for "send nothing" contradicts "one stop per declared level". A read-only `Default` chip for the case where the provider advertises no default was also rejected: it would name a state the rest of the pane cannot express, while the handle has to rest somewhere. The handle rests on the first declared level instead, and the chip names it.

**Read the level list from a new host-provided field instead of `reasoning.efforts`.** Rejected: `ModelReasoning` already carries the exact ordered offer the picker must present, and a second projection would have to be kept in sync with the adapter catalog.

**Write a `data-*` attribute onto the composer card to drive the aura.** Rejected: no framework API publishes global DOM or CSS state, and no feature plugin writes an attribute outside its own slot subtree, so the plugin would have introduced a new cross-package DOM contract for a decorative effect. `:has()` reads the trigger's own state class instead, and degrades to no card glow where `:has()` is unsupported.

## Consequences

The visible track always matches the model's real offer, and a stop's color and effect are properties of the level rather than of its position, so `High` looks the same on a four-level and a six-level model. A model advertising an unknown vocabulary is still usable, but its level gets no ripple or pixel treatment.

Model switching is now id-preserving instead of nearest-below: an effort survives a switch only when the new model advertises the same id, otherwise the selection falls back to that model's default with a toast. That is strictly less clever than before — `High` no longer carries over to a model that only offers `Low`/`Max` — and it is what makes the slider honest, because the alternative would put the thumb on a level the new model does not have.

The Ultracode ambience is a plugin-local decoration rather than a theme token: it uses the plugin's own `--ds-effort-*` colors, so it does not extend the theme package's alias set, and its three layers are gated as one preference.

## Testing

`apps/web/tests/effort-slider-levels.e2e.ts` boots the shipped web composition on a profile declaring `reasoningEfforts: { off: null, high: 'high', max: 'ultra' }` and asserts the slider renders exactly three stops (`aria-valuemax` is `2`, three ticks, no `menuitemradio`, and no `Medium`/`Extra`/`Default` text anywhere in the pane), that `Home`/`End`/arrow presses apply `off` then `high` into `settings.yaml` and move the chip, and that the top stop turns on `ds-effort-ultracode` on the trigger and the composer card while dropping back to `high` removes both and restores the shipped card shadow. It is keyless: declaring and switching are settings/llm traffic only.

`apps/web/tests/declared-reasoning.e2e.ts` keeps its overlay disabled row and still pins the reasoning-declaration contract to the native `ui-model-selection` menu, so both surfaces now assert the same declared offer independently. `pnpm run test:gui` covers plugin load through the whole-client roster, which is the only automated check that the plain-JS browser half still activates.

A web e2e file belongs to the host program, not to `apps/web/tsconfig.json`: it must be named in both that project's `exclude` array and `tsconfig.host.json`'s `include` list, beside `apps/web/tests/support.ts`. Missing either entry is silent in the lane that owns the file and loud in the other. Omitting the `exclude` entry makes the client-registered project compile the host scaffold and floods the build with cross-project `TS6059`/`TS6307` errors — including inside `vendor/`, which then gets checked under the base compiler options instead of its own relaxed ones. Omitting the `include` entry leaves the file unowned, so the type-aware lint pass reports its `ctx` values as `error`-typed.

## Related

- [Web ships the Claude-style reasoning slider by default](2026-08-17-web-effort-slider-default.md)
- [Locale-owned client UI copy](../../implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md)
