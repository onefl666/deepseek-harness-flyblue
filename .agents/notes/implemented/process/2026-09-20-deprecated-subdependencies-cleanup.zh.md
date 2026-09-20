# Agent Note: Clearing deprecated subdependency warnings

Status: implemented

[English](2026-09-20-deprecated-subdependencies-cleanup.md) | 中文

## 问题

`pnpm install` 会报告 `[WARN] N deprecated subdependencies found`，并列出 12 个废弃的包版本。它们大多来自仍在维护、但继续请求旧范围的上游：桌面端 Electron 打包链、无密钥 E2B/MCP 测试 fixture，以及两个根开发工具。该警告本身准确，但没有安全的跨大版本升级路径；如果置之不理，每次安装都会显得不健康。

## 决策

直接受我们控制的依赖已迁出废弃闭包，剩余由上游持有的版本则作为显式且有注释的允许清单记录在工作区设置中。

### 已消除的版本

- `packages/e2b/e2b` 从 `e2b@2.29.1` 升级到 `e2b@2.49.1`，把 `glob@11` 换成 `glob@13`。
- `packages/mcp/mcp-client` 把 `@modelcontextprotocol/server-filesystem` 升级到 `^2026.8.31`，把 `glob@10` 换成 `glob@13`。
- `apps/web` 删除 `http-server`；`serve:preview` 现在通过该包已拥有的 Vite 依赖运行 `vite preview --host 0.0.0.0 --port 4173`，从而移除 `html-encoding-sniffer@3` 与 `whatwg-encoding@2`。

`packages/mcp/mcp-client/package.json` 现在也会发布 `lib/types/**/*.js`；该包的 `./types` 导出指向一个已生成运行时文件，因此清单现在符合工作区发布不变式，并会发布它导出的文件。

### 剩余允许清单

`pnpm-workspace.yaml` 在 `allowedDeprecatedVersions` 中列出剩余的上游版本；每条注释都点明仍在拉取该版本的上游，以及删除条目的条件：`boolean@3`、`glob@7`、`inflight@1`、`lodash.isequal@4`、`node-domexception@1`、`prebuild-install@7`、`rimraf@2` 与 `tsconfck@3`。

工作区刻意不为这些范围添加跨大版本 `pnpm.overrides`。把 `glob@7` 覆盖成 `glob@13`、把 `@electron/asar@3` 覆盖成 `@electron/asar@4`，或把 `html-encoding-sniffer@3` 覆盖成新的大版本，都会绕过 Electron 打包链中的精确钉版。同样，`autoInstallPeers` 保持开启：`electron-builder-squirrel-windows` 是 `app-builder-lib` 的必装 peer，若全局关闭 peer 自动安装，就会为了一个废弃范围改动数百个工作区安装。

本次清理不采用 alpha 线。`electron-updater@7.0.0-alpha` 与 `vite-tsconfig-paths@7.0.0-alpha` 是唯一会分别改变 `lodash.isequal` 与 `tsconfck` 的线路；两者都会为了仅影响警告的收益，用 alpha 替换受维护的稳定依赖。

### PLUGIN_TIMINGS

Rolldown 的 `PLUGIN_TIMINGS` 是性能诊断：当插件超过构建时间阈值时发出，不是正确性警告。本仓库的 `tsdown.config.ts` 保持不变，现有输出也保持不变。它的主要贡献者是工作区级 Typert 生成（`dsh-typert-generator`）与依赖解析（`tsdown:deps`），二者都是该构建的固有成本。

## 备选方案

**使用跨大版本的工作区 overrides。** 否决：它会绕过打包链中的精确钉版来消掉警告，把风险转移到 `electron-builder` 与桌面产物，却没有对应的上游发布。

**关闭 `autoInstallPeers`。** 否决：废弃的 `electron-builder-squirrel-windows` 闭包之所以出现，是因为 Electron 打包栈把它声明为必装 peer；全局开关会改变整个工作区的 peer 安装。

**现在升级 `electron-builder`、`@yao-pkg/pkg` 或 `vite-tsconfig-paths`。** 否决：最新稳定版仍带有相同范围，而唯一改变的线路是 alpha。

**继续忽略该警告。** 否决：它会在每次安装时产生噪声；允许清单精确记录每个剩余版本的属主与退场条件。

## 后果

`pnpm install` 不再打印废弃子依赖汇总。剩余八个范围是带有明确属主和移除条件的可见债务，而不是无法解释的警告。桌面打包与根开发工具闭包保留经过审查的钉版；E2B 与 MCP fixture 的升级保持各自的包测试与宿主类型检查通过。

## 验证

- `pnpm install` 安装时不出现废弃子依赖汇总。
- `pnpm why glob@7.2.0 glob@7.2.3 glob@10.5.0 glob@11.1.0 whatwg-encoding inflight` 只显示允许清单内的 `glob@7` 与 `inflight`。
- `pnpm run typecheck` 与 `pnpm exec vitest run packages/e2b packages/mcp/mcp-client` 通过。
- `pnpm run verify-package-dependencies` 与 `pnpm run verify-vendored-links` 通过。当前 `hygiene` 聚合被脏工作树中与本任务无关的既有 README/包不变式失败阻塞。
