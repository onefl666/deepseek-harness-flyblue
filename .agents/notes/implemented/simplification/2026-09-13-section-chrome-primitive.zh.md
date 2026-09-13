# Agent Note：SectionChrome 拥有设置区块的页首内容

Status: implemented

[English](2026-09-13-section-chrome-primitive.md) | 中文

## Problem

`pnpm run duplication` 报出四个 tsx 克隆：`ui-ssh`、`ui-task-board` 与 `ui-workspace-inspector` 各自手写了同一份设置区块页首内容——带标题、单行描述、meta 行的 `<header>`，以及 busy 时换成旋转图标和 `refreshing` 文案的 ghost 刷新按钮——再加上带重试按钮的 `role="alert"` 失败提示条。CSS 也随之被复制：完全相同的 `.header`、`.title`、`.intro`、`.headerMeta`、`.error` 规则，以及除了避免冲突而改名外毫无差别的 spin keyframes。这正是[共享客户端控件原语](../architecture/2026-09-05-shared-client-control-primitives.zh.md)决策禁止的「复制控件」失败：插件不能 import 另一个插件的组件，于是复制成了每位作者最便宜的选择。

## Decision

页首内容是一个原语——`dsh-client-ui-primitives` 里的 `SectionChrome`，而不是 `SectionHeader` + `SectionErrorBar` 两个组件。抽取这对组件能消掉标记克隆，但接线仍是复制的：每个 section 向这两个原子传入相同的 `busy`、`onRefresh`、`error` props 和相同的四键 labels 对象，调用点末尾的相同片段依然超过 jscpd 的 60 token 下限。当组合本身被复制时，组合并不构成去重，因此框架是一个组件：`labels` 承载刷新控件与失败提示条的文案，`meta` 以节点接收调用方的计数、pill 与切换器，`refreshDisabled` 承载调用方特有的禁用原因（工作区尚未登记时的检查器），重试复用刷新处理器，因为三个 section 本来就是靠刷新来重试的。

各包样式表只保留页面仍拥有的部分：meta 内容的 `.counts` 与 `.workspacePill`，以及仅 `ui-ssh` 保留的 `.spin` 类——它的控制台执行按钮仍在用它做动画。共享规则与 `prefers-reduced-motion` 守卫移入 `SectionChrome.module.css`；`ui-task-board` 与 `ui-workspace-inspector` 整体删掉了各自的 spin keyframes，因为刷新图标是它们除行入场和骨架脉冲动画之外唯一的动画使用方，而后两者保留。

## Consequences

- 调用点按 labels 在前、title/intro/meta 居中、状态与回调在后的顺序排列 props。由于 `meta` 各不相同，调用点之间的相同片段达不到 jscpd 的行数与 token 下限；未来新增共享 prop 拉长相同片段会再次触发 gate，这是 gate 在起作用，而不是需要隐藏的格式偶然。
- `ui-git-graph` 与 `ui-usage-stats` 仍渲染各自的页头。它们不在失败的 gate 范围内，且 git graph 页头的输入不同（工作区切换器、`panel.busy`、`panel.error`）；两者下次改动时都可以不改 prop 地改用 `SectionChrome`。
- DOM、可访问名称与禁用逻辑不变——刷新控件 busy 时保留 `refresh` aria-label，`disabled` 仍按 `busy || refreshDisabled` 计算——因此三个 section 的测试套件原样通过，会话快照无需更新。
- `atoms.client.spec.tsx` 覆盖该框架：标题与 meta 的摆放、刷新激活、busy 下的文案切换与禁用加旋转图标、`refreshDisabled`、失败提示条与重试。`section-chrome-styles.client.spec.ts` 钉住 reduced-motion 守卫、错误色 token，以及此前由各包样式套件为这份标记执行的「无字面颜色」规则。

## Alternatives considered

**`SectionHeader` + `SectionErrorBar` 组件对。** 因上述接线克隆原因被否决为主要设计；失败提示条今天没有独立消费方，将来若有消费方需要单独使用它，届时再拆分这对组件，并接受其自身的调用点重复。

**在三个调用点内联 `jscpd:ignore-start` 标记。** 配置支持它，但被标记的文本是一个无主的共享控件，而非不可再分的平行文案；隐藏它只会给下一位 section 作者留下第四份拷贝。

**把 locale 席位的 `t` 函数传进原语。** 否决：原子组件接收完整的本地化 label props，不拥有语言回退（[决策](../architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)）；`t` 类型的参数会让原语耦合 slot 的 locale 词汇表。
