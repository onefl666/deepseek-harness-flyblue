# Agent Note：win32 技术栈上的录制会话语料

Status: implemented

[English](2026-09-19-win32-snapshot-corpus-launch.md) | 中文

## Problem

`pnpm run test:snapshot` 是 CI 在已构建的树上以 `lib` 模式运行的无密钥重放泳道（`ciConsumerGates` 组合出 `snapshotGate(validatedBuild)`，其脚本设置 `DSH_EXAMPLE_MODE=lib`）。在本发行版的 win32 默认组合上，该泳道在两个语料中大面积为红：`snapshots/sdk` 的 18 个用例全部失败，`snapshots/session` 的 97 个用例中 75 个失败。

每个 SDK 用例都在第一条断言之前就以 SDK 客户端的 `JsonRpcResponseError: cannot create effect on inactive context` 失败。这条消息既不指明缺陷也不指明插件：`HarnessSdkJsonRpcServer.handleRequest` 服务于 `initialize`，而 `initialize` 在没有任何适配器注册时挂载 `LlmDeepSeek`，该挂载又会在插件树从未完成加载的上下文上断言失败。加载器自己的报告写在子进程 stderr 上，客户端虽然保留了它，却只在超时或退出时才报告。

这条消息背后藏着三个启动缺陷。

`hydrateReplayFixtures` 把场景 cwd 原样替换进 JSONL fixture。该替换位于 JSON 字符串内部，因此 POSIX 路径是合法 JSON，而 win32 写法不是：`C:\Users\...` 注入了 `\U`、`\A`、`\L`，重放提供者以 `SyntaxError: Bad escaped character in JSON` 拒绝第 1 行，使 `llm-replay` 条目在树完成加载前就失败。整个语料的每个用例都受影响，且失败是确定性的。

`@deepseek-ai/dsh-llm-replay` 只声明为 `apps/cli` 的 devDependency，而 `healProfilesModuleFallback` 仅链接 `dependencies` 与 `peerDependencies`。`src` 启动掩盖了这个缺口，因为 tsx 通过 `paths` 映射解析工作区包；`lib` 启动则经由 `$DSH_HOME/profiles/node_modules` 到达插件，根本无法导入该提供者。`materializeProfilePatch` 本已把补丁中的裸包链接进启动 profile，但只经由补丁自身的模块解析路径，而那些路径不包含仅存在于 devDependency 的工作区包。

`snapshots/sdk/persistent-tools/cordis.yml` 插入 `bash-local`，而本发行版的 win32 基础组合挂载了 `gitbash-local`，其执行器继承 `LocalBashExecutor`。两者都构造 `shell` 服务，于是插件树以 `service "shell" has been registered at <LocalBashExecutor>` 失败。该场景自己的禁用清单本已让它所替换的 profile 行退出（`bash-sandbox`、`pwsh-sandbox`、`permission`）；本发行版新增的那一行晚于它。

## Decision

fixture 水合时以 JSON 写法写入注入的路径（`JSON.stringify(cwd).slice(1, -1)`）：对 POSIX 路径而言这是恒等变换，对 win32 则把 JSON 字符串所需的分隔符翻倍。`{{cwd}}` 被插入到已解析的值而非 JSON 文本时（`materializeInput`）仍使用原始写法。

`materializeProfilePatch` 接受解析锚点，`snapshots/sdk/sdk.snapshot.ts` 传入它所启动的应用清单（`apps/cli/package.json`）。补丁中的裸包先经补丁查找、再经锚点查找，随后照旧链接进启动 profile，因此 `lib` 模式启动可以解析仅声明为应用 devDependency 的语料提供者。

场景让本发行版的执行器行退出：`snapshots/sdk/persistent-tools/cordis.yml` 在它所替换的其他行旁边禁用 `gitbash-local`，因为它插入的 `bash-local` 拥有该服务。

共享的 headless 组合（`snapshots/session/text-turn/cordis.yml`）将其 win32 预设表收窄为它所钉住的 sandbox/approval 组合所选中的那一个预设。该行在其他所有平台上都是惰性的，基础组合在那里把它置为 `disabled`。

## Alternatives considered

**在每次 JSON-RPC 错误时报告子进程 stderr。** 该客户端是面向 SDK 使用者的产品接口；插件树失败是调用方以握手失败形式看到的运行时故障，而保留的尾部信息是为传输中断准备的。上述 harness 侧修复消除了这一需要：树加载成功后 `initialize` 即成功，不再抛出该错误。

**让 SDK 快照泳道像 headless 泳道那样从源码启动。** 这能同时绕开 fallback 与解析缺口，但也就不再演练同一门禁在其他所有地方使用的 `lib` 启动，而客户端在存在构建产物时优先使用构建产物本身是合理的。

**把 `@deepseek-ai/dsh-llm-replay` 提升为应用依赖。** 没有任何已交付组合挂载它；它只为该语料而存在，产品安装不应为了一个测试泳道能解析而携带测试提供者。

**改为在 tokenize 阶段转义 `{{cwd}}`。** 已提交的 fixture 是与 POSIX 泳道共享的归一化不动点，而不合法之处并非该 token，而是被替换进去的值。

## Consequences

SDK 语料现在能在 win32 上启动：`initialize` 返回 `serverInfo`，18 个用例只在各自录制的组合与本发行版 win32 技术栈发生分歧之处失败。

该分歧并未闭合，这也是本次改动的诚实边界。67 个 headless 用例钉住带 `sandbox_permissions` 与 `justification` 的 `bash` 工具 schema，而该工具只在所挂载的执行器能够约束时才公布它们；win32 默认执行的正是刻意不受约束的 Git Bash 执行器。18 个 SDK 用例钉住 `workspace-write` 的 sandbox 模式与预设，而 `permission-presets` 拒绝在无法强制该模式的执行器上挂载它——这正是本发行版提供 `permission-unconfined` 的原因。二者都无法靠配置钉住，因为它们都源自执行器的约束能力。

因此在 win32 上复现已提交的 fixture，需要一份在 win32 上录制的 fixture，而那会与 Linux 泳道所比较的 POSIX 录制产生分歧。本发行版是应在 win32 上跳过录制语料，还是保留其为红，尚未决定；在决定之前，该泳道在 win32 上的失败属于平台分歧，而非回归。

## Testing

`DSH_EXAMPLE_MODE=lib pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts` 从 18 个启动失败变为 18 个组合不一致，每一个报告的都是会话日志或请求头差异，而不再是 `cannot create effect on inactive context`。直接启动场景子进程（`--profile sdk`，配上物化后的补丁，并在 stdin 写入一帧 `initialize`）返回 `serverInfo`，而此前它返回该错误，并在 stderr 上留下 `llm-replay` 导入失败。

采用收窄后的 win32 预设表后，`snapshots/session/headless.snapshot.ts` 从 75 个失败降到 73 个，并有 15 个用例通过。其余 67 个共享同一特征：缺失的升级 schema。

`pnpm run verify-cordis-config` 通过全部 145 个配置文件，`pnpm run typecheck` 通过。
