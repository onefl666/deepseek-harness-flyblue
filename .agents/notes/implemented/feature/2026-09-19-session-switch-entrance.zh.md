# Agent Note: 会话切换的可打断入场

Status: implemented

[English](2026-09-19-session-switch-entrance.md) | 中文

## Problem

在 Web GUI 中切换会话时，对话列没有任何过渡地重绘：渲染器按选择重挂载该列，而 `ConversationRoot.module.css` 完全没有声明动效，于是切换读起来像一刀切——最明显的是实时 `plan/handoff` 把页面移到执行会话、而规划文本记录仍在屏幕上时。只有新挂载会话的侧栏行有动画（`row-in`，150ms），同一次切换的两半因此动得不一样。

## Decision

对话列拥有唯一的挂载入场：`packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css` 的 `.root` 执行 `animation: conversation-enter 150ms var(--ds-ease-in-out)`，这是一条把 `opacity` 从 0 淡入的关键帧；同一选择器的 `@media (prefers-reduced-motion: reduce)` 设为 `animation: none`。时长与曲线刻意与侧栏行的 `row-in`（`packages/client/ui-workspace/src/client/rows/Rows.module.css`）一致，使一次切换在两块表面上读作同一次动效。

该列随选择重挂载（`SessionMaybeEntry` 的 epoch key，加上按 session id 取键的 strict session 座位），因此入场恰好在会话变化时重放；淡入过程中再次切换只是挂载新的列，而不会对旧的列 retarget——既没有残留的半应用状态，也没有任何脚本掌管时钟。其他一切不动：`settling` 的 composer 隐藏仍是硬性的 `visibility: hidden`，选中的侧栏行也保持其无过渡的高亮。

## Alternatives considered

**View Transitions API。** 否决：`packages/client` 中完全未使用，而且交叉淡入需要让离场的子树活到过渡结束，而渲染器在新列出现之前就已卸载它。

**在持久元素上用 `[data-ready]` 两段式 CSS transition。** 否决：该列在切换之间并不持久，因此 transition 需要 React state 加一帧来武装，使列的可见性归脚本所有——隐藏标签页或错过一帧就会把它留在 `opacity: 0`。已记录的可打断原则（[可打断的滑块](2026-08-19-segmented-range-interruptible-thumb.zh.md)）为持久元素上可 retarget 的状态动效选择 transition；挂载入场没有旧值可 retarget。

**给 settling 隐藏加动画。** 被[空白会话打开时保持 hero 可见](../../archived/bug-fix/2026-07-31-hero-visible-while-blank-session-opens.md)否决：那里的修法是停止隐藏结果已知的内容，而不是给隐藏加装饰。

**把 plan-handoff 的跟随门控到执行会话开始运行。** 否决：这会改变[计划交接说明](2026-08-19-plan-handoff.zh.md)所拥有的触发条件，而始终起不来的执行轮次会让导航悬空；入场淡入已经在一次动效里覆盖了空白到运行的换帧。

## Consequences

每次会话切换——手动的或跟随的——都以整列（页头、文本记录、composer）150ms 的淡入开始，重新加载时该列挂载也会淡入。减少动效会关闭淡入，但不改变渲染内容。该动效是本 fork 对上游所属包的新增，因此一旦重新同步丢掉声明或其 reduced-motion 守卫，`packages/client/ui-conversation/tests/skeleton-styles.client.spec.ts` 就会变红。

## Testing

样式守卫钉住 `.root` 入场使用共享曲线、每条声明的关键帧都被某条 animation 声明引用、以及减少动效会关闭它。`apps/web/tests/plan-handoff-follow.e2e.ts` 驱动真实宿主与浏览器：实时 `plan/handoff` 之后持久化的选择单元点名执行会话、规划文本记录消失、该列报告其全新会话相位、其计算出的 `animation-name` 以 `conversation-enter` 结尾，而模拟 `prefers-reduced-motion: reduce` 时报告 `none`。
