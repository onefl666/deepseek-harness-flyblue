# Agent Note: 一次批准只执行一遍

Status: implemented

[English](2026-09-19-plan-approval-single-execution.md) | 中文

## 问题

`exit_plan_mode` 有两个「现在开始执行」的持有者。保留上下文的工具结果告诉模型 `carry out the plan starting with your next step`，同时插件在源 agent 空闲后又 steer 自己的已批准计划消息。只有压缩和清空调用了 `exec.concludeTurn()`，因此保留上下文的批准会继续同一轮：一份真实会话日志显示模型在该批准轮内执行了 74 次 edit、77 次 bash 调用，等这一轮终于结束后又按 steer 执行了第二遍。重复是结构性的、不是竞态——工具结果文案与 steer 描述的是同一份工作，而插件里没有任何一方拥有「由谁执行」。

同一路径上还有两个更小的缺陷。`clearThenExecute` 创建兄弟执行会话后用一个 `void title` 丢掉了计划标题，于是子会话完全没有 `session/title`；而首个提示词标题提供方又拒绝带 `parentSession` 的会话，所以 Web 客户端的 `displayTitleOf` 落到 `workspaceTitleOf(cwd)`，每个执行会话在侧边栏里都显示为工作区目录名。整个「创建→挂载→标题→steer」序列还包在同一个 `try` 里，其 `catch` 会回退到源会话的 `compactThenExecute`：因此 `agents.create` 成功之后的任何失败都会既留下一个孤儿子会话，又在源会话里执行一遍计划——同一类重复的更罕见形态。

用 `@deepseek-ai/dsh-plan-handoff` 替换 `@deepseek-ai/dsh-plan-mode` 时也没有重录 fixture：39 个 pin 文件（Web 4 个、session 26 个、SDK 9 个）仍在描述已退役的插件，于是 `pnpm run test:snapshot` 与 Web e2e 泳道因与代码缺陷无关的原因变红。

## 决策

每种批准都结束它被审阅时所在的那一轮。审阅被接受后无条件调用 `exec.concludeTurn()`，插件的 steer 成为启动执行的唯一输入——无论哪种执行模式，一次批准都只执行一遍计划。`approvedResultText('keep')` 只陈述事实（`plan mode exited; this session keeps the planning history and runs the approved plan as the next turn`），不携带任何执行祈使句，因为面向模型的执行指令只存在于被 steer 的 `approvedPlanPrompt` 里。

清空交接通过 `ctx.sessionTitle.rename` 把子会话命名为 `【执行计划】<计划会话标题>`，常量导出为 `EXECUTION_SESSION_TITLE_PREFIX`。基名取源会话折叠后的 `session/title`，没有则回退到已批准计划的第一个标题；基名本身已带前缀时原样使用，因此在执行会话里再审阅一次计划不会叠出两层前缀。重命名有自己的 `try`/`catch`，只记日志后继续：没有 `ctx.sessionTitle` 的宿主、或重命名被拒绝的宿主，依然会收到 steer 后的计划。

`clearThenExecute` 把两类失败分开。`agents.create` 被拒绝时子会话从未存在，因此回退到源会话的 `compactThenExecute`。子会话已存在之后的失败——挂载工作区、标题、`plan/handoff`、steer——会 detach 并释放该子会话后重新抛出；调用方记录它，且没有任何会话会把计划跑第二遍。`attachSession` 完成才是武装 detach 的条件。

pin 文件按当前组合重录（`DSH_SNAPSHOT=refresh pnpm run test:web`，随后 `pnpm run test:snapshot`），刷新 diff 在保留前被逐行审阅：替换 plan 插件时只允许 `exit_plan_mode` 的描述与 `plan:policy` 段落文本移动，任何其它变动行都是披着刷新的回归。

## Alternatives considered

**在 `agent-loop` 里抑制重复。** 循环无法判断两个插件形态输入中哪一个是权威的，且仓库策略要求新行为落在有文档的扩展点上。拥有批准的插件就拥有轮次边界。

**保留上下文的路径继续在轮内执行、不 steer。** 模型的续写不保证就是那份计划——轮次可能因长度截断、工具错误或用户中断而结束，计划就永远不会执行。只由 steer 驱动的方案对三种模式只有一条路径。

**只用计划的第一个标题命名子会话。** 标题说明主题，而计划会话的标题才是用户在会话列表里已经认得的东西；标题仍是没有会话标题时的回退。

**创建之后再失败时回退到源会话。** 那正是缺陷本身而非恢复手段：源会话会执行计划，而已创建的子会话可能也已被 steer。释放子会话并报告失败，才能守住「一次批准至多执行一遍」的不变量。

**给子会话一个重新派生的标题而不是宿主机前缀。** 不设标题正是工作区名标题的成因。由提供方生成的标题会多出一次模型调用，与首个执行轮争夺该会话的游标。

## Consequences

保留上下文的批准现在会结束规划轮，这是用户可见的行为变更：批准消息返回、轮次settle，执行轮在插件 steer 之后才开始，而不是在被打断的那一轮里。

`【执行计划】` 是与 `APPROVE_*` 标签同类的宿主机文案——包常量，不是 `Config` 字段。它固定位于标题最前，因此被截断到 `maxTitleBytes` 的标题仍保留该标记。

未组合 `ctx.sessionTitle` 的宿主得到无标题的执行会话，与之前完全一致；这一点记录在包 README 的 Known Limitations 中。子会话创建之后的 `clear` 失败现在是一次被拒绝的交接，而不再是降级的交接，因此已批准的计划在用户重试前不会执行。

与[审阅后的计划交接](../feature/2026-08-19-plan-handoff.zh.md)互相链接；那份笔记仍拥有审阅与执行决策，并已更新为无条件结束轮次与子会话标题。

## Testing

[integration.spec.ts](../../../../packages/plan/plan-handoff/tests/integration.spec.ts) 用脚本化 adapter 与真实 `UserQuestionService` 驱动真实 agent loop：经 `APPROVE_KEEP` 的保留上下文批准恰好产生两次模型请求（规划、执行）、恰好一条 `plan-handoff` 来源的 `user/message`，且该消息的 seq 在第一个 `turn/end` 之后；把 `concludeTurn` 改回仅压缩/清空的条件下，同一测试会观察到三次请求。

[handoff.spec.ts](../../../../packages/plan/plan-handoff/tests/handoff.spec.ts) 钉住标题组合（源标题、H1 回退、已带前缀的基名）、缺少服务与重命名被拒两条路径，以及回滚：steer 失败的子会话被 detach 并释放，源会话从不被 steer，调用被拒绝。`agents.create` 被拒绝时仍会 steer 源会话。

[plan-review.e2e.ts](../../../../apps/web/tests/plan-review.e2e.ts) 在真实卡片上点击 `Keep context`，并断言重放会话中出现两次 `turn/start` 与一条 `plan-handoff` 消息。

pin 文件是第三条腿：先 `DSH_SNAPSHOT=refresh`，再连续两次 `DSH_SNAPSHOT=replay`，Web 泳道与会话快照泳道各跑一遍。
