# Agent Note: 计划评审的执行设置

Status: implemented

[English](2026-09-20-plan-review-execution-settings.md) | 中文

## 问题

被批准的计划会用规划会话当时持有的路由执行。想换模型、换思考强度或换 Agent 预设的评审者，只能退出计划模式、改会话、再重新规划——而预设根本改不了，因为会话一旦开始对话，它的组装就固定了。

## 决定

`plan-review` intent 现在声明 `settings: string[]`（本次评审在决定之外收集的设置名），`AskUserQuestionAnswerItem.settings` 把取值带回来。`PLAN_REVIEW_SETTINGS` 列出四个：`provider`、`model`、`reasoningEffort`、`agentPreset`。每一项都可选，答复里没有的项就让执行沿用本来会继承的值，因此未被改动的卡片与它出现之前的行为完全一致。

**路由走会话自己的模型 RPC，预设走答复。** 卡片对两者都只是暂存，提交却走不同的路，因为两条执行路径落在不同的会话上：

- 模型与思考强度。composer entry 的注入面提供 `commitModel`，它调用 `session.selectModel`——与 composer 模型座位同一次调用——卡片在答复之前先做这一步，因此装不上的路由绝不会留下一个"已批准、按旧模型执行"的计划。`keep` 与 `compact` 就在本会话执行，这次调用就是全部改动。`clear` 在不存在的会话里执行，同样的取值随答复走，成为子会话的 `agentOptions`。
- Agent 预设。只有从零创建的会话才能采用一份组装，而那个会话只有 Host 能创建，因此预设 id 随答复进入 `clearThenExecute` 的 `meta.agentPreset` 与创建时的挂载。评审比它读到的名册活得久：未知或损坏的预设会带着告警回退到规划会话自己的组装，因为拒绝交接会搁置一个用户已经给出的批准。

呈现是组合出来的，不是耦合出来的。`question.planReview.model` 与 `question.planReview.agentPreset` 是 question composer entry 声明的子槽位；`ui-model-selection` 与 `ui-agent-preset` 各自在它们本就拥有的目录与名册上注册一个受控控件。跨包边都是纯类型的。卡片只在"新建会话"那一步渲染预设槽位，因为只有那条路径用得上。`ModelSelect` 拆成 `ModelMenu`（纯呈现，接收 store 与一个提交动词）加两个宿主，于是 composer 座位与评审卡片共用一个控件，而不是两份会各自漂移的菜单。

## 考虑过的替代方案

**让计划插件直接读持久选择。** 最显然的来源是 `modelSelection` 投影，但它的 state 类型由 `@deepseek-ai/dsh-api-session-controller/types` 合并声明，读它会把一个计划插件依赖到 BFF 组装层。把已提交的路由放进答复，保持了依赖既有的方向。

**等子会话建好之后再选预设。** 否决：`AgentPresets.select` 拒绝已经开始对话的会话，而交接在创建子会话的当下就给它派发计划。

**让 Host 为所有路径应用路由。** 否决：keep 与 compact 执行的会话只能经 session controller 自己的选择路径触达，在它旁边再加一条插件自己的路径，等于同一个问题有两个答案。

**把执行选择做成 plan-handoff 的 Remote 而不是答复。** 否决：那会让模型域知道评审的生命周期，而且模型座位得去够一个它本来没有理由知道的服务。

## 后果

`AskUserQuestionAnswerItem` 与 `plan-review` intent 各多一个可选字段；通用问题流、`ask_user_question`，以及任何不声明设置的 intent 都不受影响。`ui-user-questions` 现在需要 `remote.session`。由于 `session.selectModel` 同时写入部署默认模型，被评审选中的路由会成为之后新建会话的起始模型——这正是 composer 模型座位本来就有的行为。`clear` 的子会话现在以规划会话已提交的路由起步，而不是创建期的选项，这与它的标题和它继承的组装本来就宣称的一致。

## 测试

包测试固定 intent 声明的设置，以及答复收集到的值会到达子会话的 options 与预设。`handoff.spec.ts` 覆盖路由覆盖、只答一半的路由、空白强度、被选中的预设、未知预设回退、损坏预设回退，以及没有名册的部署。`user-questions.spec.ts` 拒绝空白与重复的设置名，并固定答复里的 settings 会穿过 waterfall。`plan-review-panel.client.spec.tsx` 覆盖暂存值、答复前先提交、提交被拒后评审仍未结束、新建会话那一步带预设答复、从中退回，以及继续型路径立即答复。两个座位 spec 覆盖"只暂存不写入"，`model-select.client.spec.tsx` 继续充当菜单抽取的回归判据。`snapshots/web/plan-review` 重录卡片的 aria 金标。
