# Agent Note: The fork retires its fifteen empty invariant companions and declares MIT

Status: implemented

[English](2026-09-13-retire-empty-invariant-companions.md) | 中文

## Problem

`pnpm run hygiene` 的十六个门里有四个在本分支失败，而且每个失败都指向仓库里的事实，而不是缺了某个工具：

- **空的 invariant 伴生入口。** 十五个包发布了 `src/invariant.ts`，其 installer 体是 `const install: InvariantInstaller = () => {}`，并附带完整的 `./invariant` 发布接线：`exports` 条目、`files` 条目、`@deepseek-ai/dsh-invariants` 的 peer 与 dev 依赖、`runtime-diagnostics/invariants` 项目引用、`tsdown` 条目，以及 `tsconfig.base.json` 的路径映射。`AGENTS.md` 规定空 installer 无效，且没有可独立观测关系的包必须省略伴生入口及其接线，并在 README 记录原因。
- **非 MIT 的许可证声明。** `packages/schedule/task-board`、`packages/workspace/workspace-files` 与 `packages/workspace/workspace-git` 声明 `BSD-3-Clause`，`packages/ssh/ssh` 与 `packages/ssh/tool-ssh` 声明 `Apache-2.0`。`verify-dsh-package-licenses` 要求每个 `@deepseek-ai/dsh*` manifest 都声明 MIT。
- **在模块作用域值导入可选 peer。** `packages/plan/plan-handoff/src/handoff.ts` 以值的形式从 `@deepseek-ai/dsh-compaction` 导入 `ManualCompactionError`，而该 peer 在 `peerDependenciesMeta` 中标记为可选。因此没有 compaction 的树加载规划插件时会直接失败，而不是把该能力报告为不可用。
- **被实体化的符号链接当作配置文件读取。** `apps/cli/tests/profiles/acp/cordis.yml` 在索引中记录为符号链接（mode 120000）。本 checkout 的 `core.symlinks=false`，于是 Git 把链接目标写成 59 字节的文本文件，`verify-cordis-config` 便把那个路径字符串解析成 Loader 文档，并以「根不是数组」拒绝。

## Decision

**空的伴生入口被删除，而不是被填充。** 十五个伴生入口的每个产物都已删除：`src/invariant.ts`、四个只为覆盖它们而存在的 `tests/invariant*.spec.ts`、`exports["./invariant"]`、`files` 中的 `lib/invariant.js`、`@deepseek-ai/dsh-invariants` 的 peer 与 dev 条目、各包 `tsconfig.json` 中的 `runtime-diagnostics/invariants` 引用、各包 `tsdown.config.ts` 中的 `lib/types/invariant.js` 条目，以及 `tsconfig.base.json` 中九条显式的 `/invariant` 路径映射。客户端包无需删除路径映射：`@deepseek-ai/dsh-client-*/invariant` 通配仍要保留，因为其它客户端包仍持有真实的伴生入口。每个 README 现在都带有门所匹配的省略原因，沿用仓库既有写法（`**Runtime invariant:** No companion is published. …`）。

**五个包现在自行声明 schemastery 项目引用。** `packages/schedule/task-board`、`packages/session/usage-stats`、`packages/ssh/ssh`、`packages/workspace/workspace-files` 与 `packages/workspace/workspace-git` 导入 `@deepseek-ai/schemastery`，却从未引用 `vendor/schemastery`。它们的声明重定向此前是传递得来的：`packages/runtime-diagnostics/invariants/tsconfig.json` 引用了该项目，而这五个包都引用了 `invariants`。伴生引用一经删除，该导入便经 `tsconfig.base.json` 的 paths 落到 vendored 源码，既被 `rootDir` 拒绝，自身也带着严格模式错误。这五个包现在各自直接引用 `../../../vendor/schemastery`，即 `packages/codegraph/codegraph-index` 与 `packages/codegraph/tool-codegraph` 已在使用的写法。这五个包是扫描所有被退役包的该导入得到的，而不是靠反复重建直到编译器不再报错。

**五个 manifest 声明 MIT。** 没有任何 LICENSE 文件、README 或其它仓库文档把这五个包描述为 BSD-3-Clause 或 Apache-2.0，仓库中其它所有 DSH manifest 都声明 MIT，因此这些字段是复制粘贴漂移，而不是许可证决定。重新生成 `THIRD_PARTY_NOTICES.md` 不受影响：该表派生自第三方运行时依赖。

**`plan-handoff` 以结构化方式判定 compaction 拒绝。** 模块作用域的值导入改为对 `ManualCompactionError` 与 `ManualCompactionErrorCode` 的纯类型导入，`isCancelledCompaction` 读取错误的公开 `name` 与 `code`，而不是其构造函数身份。handoff 需要的那项区分因此得以保留：`cancelled` 码是 agent 自身信号在 compaction 中途中止，与本调用方的 abort 原因不同，只有它会返回 `compact-cancelled` 且不注入计划。按公开名称与 code 判定值是仓库已用于 `AbortError` 与 `ENOENT` 的做法。这也遵循门自己给出的顺序——作为类型导入，或重构到模块作用域不需要它——而不是动态 `import()`，后者只是把失败推迟到首次使用。

**`rescope-vendor` 容忍工作区中已被删除的路径。** 该门用 `git ls-files` 构造扫描列表，因此已从工作区删除但尚未暂存的被跟踪路径仍会列出，读取它会以 `ENOENT` 中止整个检查，而不是报告残留。扫描列表现在会剔除工作区中不存在的路径：按定义它不携带 pre-rescope 记号。任何贡献者的未暂存删除都会触发这条路径，不只是本次改动。

**本 checkout 实体化符号链接。** 仓库配置中 `core.symlinks` 设为 `true`，索引中记录为 mode 120000 的十一个条目恢复为真实链接。该门的判定是对的：它读到的确实是一个内容为路径的普通文件。同样这十一个链接承载着 `CLAUDE.md`、`.claude/skills`、三份 `CLAUDE.md`/`AGENTS.md` fixture 与三份 ACP 快照旁挂文件，而三个 ACP profile e2e 会按路径启动 `apps/cli/tests/profiles/acp/cordis.yml`，所以实体化链接的 checkout 同时会破坏这些 lane。

## Alternatives considered

**把十五个伴生入口填上真实检查。** `AGENTS.md` 明确列出不合格的检查——服务存在性、插件元数据、effects，以及固定示例——而这些包没有第二个可对照的实时关系：Git 服务在每次受守卫的操作前重读仓库状态，SSH 服务在变更边界校验主机记录，用量与索引面都是派生投影，客户端面板渲染的是 RPC 快照。为了满足门而臆造的检查，断言的是一个不可能发生分歧的关系。

**保留伴生入口，放宽或屏蔽该门。** `verify-package-invariants` 属上游所有，其规则已经捕获了一类真实缺陷；为了让十五个空注册留存而删掉这条规则，会一并抹掉它对未来每个包的信号。

**保留 `instanceof`，把 compaction 提升为硬依赖。** compaction 按设计就是可选的：在没有挂载任何 compaction 引擎的组合里，handoff 仍须可用，并让计划保持可见。改为必需会删掉 ``resolveCompaction`` 回退与 `kept` 结果。

**只在编译器报错处引用 `vendor/schemastery`。** 只点名报错的工程，会让其余包继续依赖「恰好有某个引用替它重定向」这一偶然。该引用属于导入 vendored 工程的那个包。

**暂存这些删除，让 `git ls-files` 不再列出它们。** 暂存只修好一台机器上的一次门运行，崩溃仍留给下一个在跑 `hygiene` 前删除文件的贡献者。

**放宽 `verify-cordis-config`，或在 Windows 上跳过它。** 该门读到的正是文件系统持有的内容。修正 checkout 保住了门的语义，而另一个方案会把语义交换出去。

**只删 `src/invariant.ts`，保留项目引用。** `verify-package-invariants` 会拒绝在缺少伴生入口时仍保留 `runtime-diagnostics/invariants` 引用的包，所以引用必须随源码一起删除。

## Consequences

五个分叉包失去已发布的 `./invariant` 子路径。没有任何地方挂载这些伴生入口——没有 bundle 或 profile 行点名它们，`packages/bundle/sdk-minimal/cordis.patch.yml` 中仅有的 `/invariant` 行属于 `dsh-session`、`dsh-agent`、`dsh-scope` 与 `dsh-agent-loop`——因此运行时组合没有变化，包的运行行为完全相同。导入 `<package>/invariant` 的使用方必须去掉该导入。

导入 vendored 工程的包现在必须自行声明项目引用。经 `runtime-diagnostics/invariants` 的隐式重定向，是一个与导入包本身无关的引用带来的副作用；对所有引用过该工程的包，它已不再存在。

`plan-handoff` 依赖 compaction 错误的公开名称与 code，而不是其构造函数身份。名称不同却带 `code: 'cancelled'` 的错误会被判定为已取消的 compaction；若 compaction 包重命名了 `ManualCompactionError`，判定会失效并落入 `kept` 结果——那会注入计划并记录一条告警。

`rescope-vendor` 对存在未暂存删除的工作区报告残留，而不是中止，因此一次删除不再掩盖同一轮运行中的其它残留发现。

覆盖率不变。每个被退役伴生入口的唯一用例已随它一起删除，且没有任何仍存在的测试或源文件导入被退役的子路径。

## Verification

`pnpm run hygiene` 报告 16 passed、0 failed。`pnpm run typecheck`、`pnpm run lint`（0 warnings、0 errors）与 `pnpm run test:docs`（16 passed）均为绿，`verify-config-catalog`、`verify-cordis-catalog`、`verify-doc-graphs`、`verify-export-jsdoc`、`verify-scoped-events`、`verify-tsconfig-paths`、`verify-package-readme-limitations` 与 `verify-translation-pairing` 各自通过。`@deepseek-ai/dsh-client-ui-git-graph`、`@deepseek-ai/dsh-workspace-git` 与 `@deepseek-ai/dsh-plan-handoff` 的十二个用例文件共 203 个测试通过。
