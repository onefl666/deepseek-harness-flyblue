# Agent Note: 同步上游 0.1.5 发布周期

Status: implemented

[English](2026-09-11-upstream-sync-0.1.5.md) | 中文

## Problem

fork 再次落后上游 852 个提交——整个 0.1.5 发布周期。合并带来了新的 Session 格式代际（v3，header 增加 `isSeeded`/`delegationDepth`）、系统提示词从 `EpochHeader` 移入 `system/message` surface 事件、同步 Session 事件读取的废弃、shipped preset 按平台选择 shell 工具、组合树加载后的入口激活审计、包 README Summary 100 词上限，以及 web scaffold 的访问认证。机械合并后仍有 44 处冲突，且树既过不了类型检查也过不了 lint：fork 插件与测试还在调用被移除的 API，effort-slider 入口过不了新的激活审计，plan 命令丢了本地化的客户端面孔，fork 的 web e2e 要么打开 401 页面、要么种下的会话根本没落盘。

## Decision

把 fork 适配到当前上游 API，并在两者分歧处保留 fork 行为，沿用 [2026-09-08 同步](2026-09-08-upstream-sync-adaptation.zh.md)的做法。生成目录一律重新生成而非手工合并；冲突侧逐文件取舍：plan-handoff 与 fork 插件名单取 fork 侧，fork 侧已过时的取上游侧（session-log note 曾被意外退回 v0 时代文本；现以上游当前文本承载 fork 的用量仪表盘那一句）。

**API 迁移。** `EpochHeader.system` 已移除：plan-handoff 集成测试改为断言 `system/message` surface 节点（首次组装 append、模式切换原位 replace），与上游 plan-mode 测试完全同构；用量仪表盘种子 header 不再写 `system`。PTC 派发事件更名为 `tool/ptc-dispatch`；非法 `plan/approved` payload 在更严格的事件联合下需要双重断言转换。fork UI 测试替身补上新的 `usePanelInfo` 标准属性。fork 的十一处生产 `snapshotEvents()` 调用按[废弃决策](../architecture/2026-09-09-deprecate-synchronous-session-event-reads.zh.md)允许的方式挂行级 `typescript/no-deprecated` 豁免并保留行为。

**产品修复。** 持久化写句柄改由 agent loop 持有，用量仪表盘的冷会话种子改为自行把缓冲事件交给 `sessionPersistence.create()`；在 UI 中打开存储会话也不再自动挂载 Agent——standalone-compaction 测试经 `sessionController.resolveAgent()` 解析。composer 菜单的内置命令面孔按命令的 `definitionId` 匹配，plan-handoff 因此注册上游的 `@deepseek-ai/dsh-plan-mode` id，保住本地化的 Plan 标签、claim token 与图标。effort-slider 宿主半边从加载期 `inject: ['webServer']` 改为运行期 `ctx.inject()`，因为新的激活审计会拒绝在 `dsh --profile web --help` 这类无服务器启动中仍然 pending 的入口。

**测试与快照适配。** web scaffold 现处于认证之后，fork 的三个 web 测试改走 `authenticatedUrl`。presets e2e 断言按平台选择的 shell 工具（Windows 为 `pwsh`，其余为 `bash`）及各平台的持久 shell 描述；标准 preset 名单补上 fork 自有的 `ssh_exec`/`ssh_list`（SSH 落地起组合里就一直在提供）；POSIX 专属的属主权限检查加平台分支。种子的 v3 fixture 补上必填的 `isSeeded`/`delegationDepth` header 字段。lifecycle、codegraph-index、standalone-compaction、usage-stats 的金文件刷新：fork 的空会话索引横幅进入 hero，命令标签跟随上游本地化面孔，设置区把 "Session log" 更名为 "More actions"。七个 fork 包 README 的 Summary 在双语两侧压到新的 100 词上限并重录配对记录。

## Alternatives considered

**整体采用上游 plan-mode。** 与上一轮同步同理拒绝：二元 approve/decline 评审表达不了 fork 的 execute/compact/keep 三条路径。

**在 patch 里把 effort-slider 改为条件行。** 拒绝：只要加载 web 客户端名单该行就应存在；运行期注入表达了"服务器绑定时挂载资源路由"，无需第二个组合变体。

**在本地拆分 preset 让 Windows 也保留 `bash`。** 拒绝：按平台选择是上游产品行为（各平台有各自的沙箱执行器）；fork 在测试里镜像它，而不是 fork 一份 preset。

## Consequences

fork 在 0.1.5 周期的上游之上可编译、可 lint、可构建，适配面全部通过：plan-handoff（92 个测试）、usage-stats、SSH/task-board/workspace/codegraph 服务端包、fork 客户端 UI 包（205 个测试）、四个 fork web e2e 的 replay、本机可跑的 perf 套件，以及全部 34 项文档门禁。合并提交记录了 852 个提交的范围及上述取舍。

本机 Windows 的三类限制不属于本次改动，与上一轮同步的环境前提同类：以符号链接存放的快照 fixture 在 `core.symlinks=false` 下物化为文本指针，本地破坏 ACP 语料；调用 `bash` 的录制会话在 win32 上 replay 为 `UNKNOWN_TOOL`（win32 preset 禁用 `tool-bash`）；缺 pwsh 7 的套件保持红。CI 的 POSIX 矩阵拥有这些信号。
