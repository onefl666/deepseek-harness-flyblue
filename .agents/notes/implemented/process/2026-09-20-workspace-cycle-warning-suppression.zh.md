# Agent Note: Suppressing the workspace cycle warning with a release-family guard

Status: implemented

[English](2026-09-20-workspace-cycle-warning-suppression.md) | 中文

## 问题

`pnpm install` 会打印 `[WARN] There are cyclic workspace dependencies`，覆盖八组循环。每个环都使用开发依赖或 peer 边：包测试 harness 互相驱动，客户端包共享一个浏览器测试运行时，而 vendor 的 Cordis 包保留上游 peer 范围。仅限 `dependencies` 与 `optionalDependencies` 时，安装图是无环的，而且发布族构建器已经断言该性质。

## 决策

`pnpm-workspace.yaml` 设置 `ignoreWorkspaceCycles: true`。该设置停止 pnpm 的整图提示，而发布族断言仍是安装边形成环时的守卫：当已发布的依赖闭包成环时，`scripts/release/families.ts` 仍会抛出 `dependency cycle in release family`。

此外，若干真实开发边被删除，而不是被隐藏。

- `packages/client/ui-conversation` 与 `packages/client/ui-sidebar` 不再在 `dsh.client.inject` 或 devDependencies 中声明 `@deepseek-ai/dsh-client-ui-workspace`；两个包都不导入它。
- `packages/client/file-upload` 不再注入或 devDepend `@deepseek-ai/dsh-api-remotes`；此前只有 inject 声明造出了该边。
- `packages/client/connection` 不再 devDepend `@deepseek-ai/dsh-api-session-controller`；其 fixture spec 现在在本地声明小的结构类型 `ModelCatalog`、`ModelSelection` 与 `SessionAssistantStreamFrame`。
- Windows ACL 的 provider-chain spec 移入 `dsh-sandbox-local`；该包已经拥有对 `dsh-sandbox-windows-acl` 的生产依赖，反向开发边被删除。
- spawn 后端 e2e 及其 harness 移入 `dsh-tool-subagent`；该包已经 devDepend `dsh-subagent-spawn-in-process`，因此 spawn 包不再 devDepend 该工具。
- one-world E2B 组合 e2e 与 fixture 移入新的 `packages/test-support/e2b-composition` 包，其 devDependencies 覆盖 fixture 的裸插件。`dsh-e2b` 不再 devDepend `dsh-fs-e2b` 或 `dsh-subprocess-e2b`，因此这些 peer 边不再指回 `dsh-e2b`。

这些删除之后，剩余的非平凡 SCC 是大型客户端/浏览器测试运行时分量，以及 agent-loop/DeepSeek provider 分量。打破第一个需要跨数十个包重新设计客户端测试运行时 API；打破第二个则要把真实 DeepSeek 组合 spec 搬离其属主包。vendor 的 `cordis` / `include` / `loader` peer 环是按 vendoring 策略保留的上游元数据。

## 备选方案

**用假的依赖清单或 `pnpm.overrides` 让图看起来无环。** 否决：这会在开发架构不变的情况下隐藏警告，而且 overrides 会改变包解析。

**打破所有剩余 SCC。** 否决：已知割的代价高于它消除的警告。客户端运行时刻意启动 web 花名册，并被它所测试的包 devDepend；移动该边界是测试架构项目，而不是安装清理。

**全局关闭 peer 自动安装。** 否决，理由与依赖警告清理相同：它会为少数开发边改变数百个包的安装。

**保持 `ignoreWorkspaceCycles` 为 false 并接受警告。** 在真实可删除边已经消失后否决：pnpm 的剩余报告是整图建议，而绝不能失败的运行时行为由发布族断言守护。

## 后果

`pnpm install` 在废弃子依赖和工作区循环两类警告上都保持安静。零覆盖的真实开发边已删除，存活的环也有文档记录。代价是：未来开发或 peer 边创建新环时，pnpm 不再打印通用警告；`scripts/release/families.ts` 仍会拒绝进入已发布安装图的环，未来若有需要，可以在 check-all 级门禁中加入最小环断言。

## 验证

- `pnpm install` 既不打印 `cyclic workspace dependencies`，也不打印 `deprecated subdependencies found`。
- 对工作区清单执行一次性 Tarjan 后，定向边删除后只剩大型客户端 SCC 与 agent-loop SCC。
- `pnpm run verify-package-dependencies`、`pnpm run test:gui`，以及定向的 client/connection、sandbox、subagent 与 E2B 测试套件通过。
- 重新生成输出后，`pnpm run verify-cordis-config`、`pnpm run verify-tsconfig-paths` 与 `pnpm run verify-doc-graphs` 通过。
