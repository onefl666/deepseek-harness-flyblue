# Agent Note：上游同步后的适配

Status: implemented

[English](2026-09-08-upstream-sync-adaptation.md) | 中文

## 问题

本 fork 在 vendored Cordis 运行时之上承载了自定义插件——plan-handoff、CodeGraph、SSH、task-board、usage-stats、工作区浏览器与 effort slider。上游分支已领先 fork 的合并基点 3255 个提交，合并后的工作树既无法通过类型检查，也无法构建：

- 自定义插件调用了上游已替换的 Session API：`session.events` 变为 `session.snapshotEvents()`，`plan` 投影改用 `stateSchema` 加 `wire.view`，`sessionPersistence.listSnapshots`／`inspect` 变为 `list` 加 `open(id, 'read')`。
- 上游删除了整包（`client/runtime`、`host/apiproxy` 及若干示例），但合并遗留了它们的构建产物与包清单。这些陈旧目录既掩盖了真实的类型错误，又在后续让 `tsdown` 解析到一个不存在的根入口。
- 上游新增了 fork 尚未满足的仓库门禁：README frontmatter 与 Summary／目录／开发备注骨架、全圆角半径上的 `corner-shape: round`、中性实线边框的发丝线宽度、能解析的目录锚点，以及 type-equiv 清单。
- 两处冲突解决悄悄取了上游一侧，而 fork 的行为才是本意：`plan` 投影的测试文件与 ui-user-questions 的载体约定。

## 决定

把 fork 的插件适配到当前上游 API；当两者分歧时，保留 fork 的产品行为。工作分四部分。

**服务端 API 迁移。** `plan-handoff` 在 `session.snapshotEvents()` 上折叠，并以 `stateSchema` 与 `wire: { viewSchema, view }` 注册其投影单元；会话创建中已删除的 `seedLength` 选项被移除。`usage-stats` 通过 `open(id, 'read')` 读取已存日志，并从 `assistant/message` 结算事件或 `assistant/attempt` 流末尾的 usage chunk 取用量。`codegraph-index` 改用字符串 `'codegraph'` 设置命名空间，因为 `settingsNamespace()` 工厂已不存在。

**客户端载体迁移。** 上游用领域自有的 `PendingQuestion` 类替换了运行时的 `PendingWait` 载体。fork 的 `contract/slots.ts` 采用该载体，同时保留其多审批的计划审阅：`approve` 仍为 `string[]`，`PlanReview` 保留 `approves` 与 `refine`，`planReviewOf` 仍要求每个被指名的审批标签都对应真实选项，且除 refine 外至多一个额外选项。导入迁往新归属——`SlotRegistry` 到 `ui-renderer/client`、`ClientContext` 到 `cordis`、`defineStore` 到 `client-store`、`WorkspaceListState` 到 `WorkspaceSnapshot`。

**陈旧产物清理。** 上游删除的每个包都从工作树移除，包括 `client/runtime` 目录——它残留的 `node_modules` 曾使 `tsdown` 的 workspace glob 回退到根入口。

**门禁合规。** fork 的 README 补齐文档标准要求的 frontmatter 与骨架；其目录只链接实际存在的小节（中文侧链接英文锚点，配对门禁会比较两侧目标）；全圆角 CSS 半径配对 `corner-shape: round`；中性实线边框降为 0.5px；生成的目录与配对记录一并重新生成。

## 备选方案

**直接采用上游的 plan-mode 插件，而不是适配 plan-handoff。** 上游把计划模式换成了二元的批准／拒绝审阅，无法表达 fork 的三条执行路径（执行、压缩后执行、保留上下文）。适配 fork 插件可保留这些答案；采用上游会悄悄移除其中两条。

**保留陈旧的包目录，让构建忽略它们。** 这些产物在合并期间掩盖了真实的类型错误，并在源码修好后破坏了 `tsdown` 的 workspace 解析。移除它们才让失败可见并可修复。

**只重录配对文件，不同步中文侧。** 配对门禁比较结构与链接目标，而不只是哈希；仅重录哈希会在第一处结构分歧上失败，并使该配对在评审中失真。

## 后果

fork 的自定义插件能针对当前上游 API 编译与测试，仓库门禁通过（`typecheck`、`lint`、`doc-sync` 及适配过的包测试）。fork 行为得以保留：计划审阅仍提供每条执行路径，独立 compactNow 仍渲染运行中行，工作区浏览器仍暴露自己的 Remote 面。

有两类失败不在本次改动范围内。需要 PowerShell 7（`pwsh`）的测试在只装 Windows PowerShell 5 的主机上失败；`build-exe-for-python-sdk` 断言了特定的 `pnpm` 路径。两者都是环境前提，不是 fork 回归。
