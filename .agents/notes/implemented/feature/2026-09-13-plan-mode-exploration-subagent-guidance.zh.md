# Agent Note: Plan-mode guidance directs intent analysis, parallel subagent exploration, and early clarification

Status: implemented

[English](2026-09-13-plan-mode-exploration-subagent-guidance.md) | 中文

## Problem

已发布的 `plan:policy` 段落（`agent-presets` 的三份副本加基础 bundle patch）告诉模型"先探索"，并把 `ask_user_question` 保留给用户所有的选择，但对**如何**探索大型工作区只字未提：引导从未提及委派，因此规划型代理即使问题横跨多个子系统，也在自己的上下文里串行读文件，把主上下文预算花在全新上下文子代理本可完成的普查式阅读上。提问规则也偏向一侧——能查到就别问——却没有引导模型尽早暴露意图歧义，而意图答案可能改变究竟什么值得探索。

## Decision

- 四份已发布的 plan 引导副本（`presets/standard`、`presets/cordis`、`presets/ptc` 的 `agent.cordis.yml`，以及 `packages/bundle/base/cordis.patch.yml`）同步修改；bundle 第四段既有的措辞漂移（"only to keep the request shape stable"）有意保留。
- 第二段现在以意图分析开篇——复述目标、把用户实际所问与模型自行假设分开——并显式给出工作顺序：先探索，再计划；批准后才编码。
- 新增的第三段引导子代理分解：把横跨多个子系统（或落入陌生工作区）的请求拆成独立、自包含的子任务；在同一个响应里派发多个 `subagent` 调用使其并行探索；只直接读处于变更中心的内容，把外围探索委派出去；给每个子代理完整独立的 prompt。该段陈述了一个承重事实：子代理不继承 plan 模式，因此不修改的约束只能经由父代理写下的 prompt 传达。
- 提问段落现在引导尽早问——歧义一旦改变要探索或要计划的内容就问，而不是等探索做完——同时保留代码事实先查的规则。
- 决策完备段落新增引用探索找到的文件路径，让委派所得的发现落进计划，而不是消失在子代理的转录里。
- 引导放在部署 `section` 里，而不是 `tool-subagent` 自己的提示词段落：子代理工具的段落（order 2800）已经讲授机制（后台默认、同一消息批量派发独立委派）且对所有模式生效；plan 段落补充的是规划特有的"何时派、派什么"。携带该段的四个组合都挂载了 `subagent`/`subagent_fork`，因此点名工具在任何文本发布处都有依据。

## Alternatives considered

- **改在 `tool-subagent` 的 order-2800 段落讲授探索扇出** — 范围错误：该段落与模式无关且已承载批量机制；规划特有方向（先探索再计划、委派外围、守住中心）会让每个非规划请求都背上规划专用建议。弃用。
- **在插件里加专门的 `plan:exploration` 提示词段落** — 为本就按设计归属部署所有的文本（`PlanModeConfig.section` 是 plan 引导的唯一归宿）新增机制。弃用。
- **回避点名 `subagent` 工具的中性措辞** — 该段落只发布在上述四个组合中，它们都挂载了该工具；现有段落已经点名 `exit_plan_mode`、`todo_write`、`ask_user_question`；含糊措辞会削弱可解析性而无移植性收益。弃用。

## Consequences

- 这份模型可见文本的钉住点落在了 keyless replay 能触达的位置：`snapshots/web/plan-review` 新增 `plan-policy.expected.md`，用段落自身的首尾句从渲染出的 `system/message` 中提取，并经 `compareOrRefreshGolden` 比对。headless 语料无法持有该钉住点：其场景以 argv 传入任务，`/plan` 命令派发发生在客户端 composer，没有任何 headless 场景携带 plan 模式。这个缺口正是 web 场景持有 golden 的原因。
- `plan-handoff` 单测不受影响（它们使用占位 `section`），且没有 README 或文档页引用已发布文本，因此没有随行的文档改动。
- 引导是软性的：沙箱与审批策略仍是变更执行的权威，子代理侧的约束按设计经由委派 prompt 传递——plan 状态按会话隔离，而子代理是独立会话。
- 此后每次修改已发布段落，都必须对 plan-review 场景重跑 `DSH_SNAPSHOT=refresh` 并审查 golden diff；场景的封闭 fixture 清单会强制 golden 的存在。
