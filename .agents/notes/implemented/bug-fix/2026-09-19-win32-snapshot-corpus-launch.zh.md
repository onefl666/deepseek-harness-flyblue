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

SDK 语料走到断言、headless 泳道逐例读过之后，又暴露出四个缺陷。

`snapshots/session/pwsh-tool-turn` 通过挂载 `pwsh-sandbox` 选择受限 pwsh 栈，而本发行版 win32 基础组合在环境未选择该栈时挂载 Git Bash 执行器，于是同一处双提供者冲突以 `service "shell" has been registered at <GitBashExecutor>` 让插件树失败。

`snapshots/session/subagent-acp-diagnostic` 用 `decodeURIComponent(new URL(relative, 'file://' + process.env.DSH_SNAPSHOT_FILE).pathname)` 构造其 mock server 参数。URL pathname 把 win32 路径写成 `/D:/...`，而 Node 会把开头的斜杠解析为当前盘符，于是子进程以 `Cannot find module 'C:\D:\deepseek-harness-flyblue\...'` 死亡——与 LSP 启动器改用 `fileURLToPath` 之前所携带的是同一个缺陷。

`snapshots/session/read-image-attachment-path` 钉住的 `fromRequest` 模式在 `red.png` 之前是一个 `/`，只有 POSIX 请求文本才满足；重放提供者报 `matched nothing in the request`，场景以非零码退出。

共享归一化器中的 `cwdSpellings` 只保存字面 cwd 写法，因此出现在内嵌 JSON 文档里的 cwd（其每个分隔符都带 JSON 自身的转义）从未被 token 化，生成机器的临时路径就留在了被比较的请求文本中。

## Decision

fixture 水合时以 JSON 写法写入注入的路径（`JSON.stringify(cwd).slice(1, -1)`）：对 POSIX 路径而言这是恒等变换，对 win32 则把 JSON 字符串所需的分隔符翻倍。`{{cwd}}` 被插入到已解析的值而非 JSON 文本时（`materializeInput`）仍使用原始写法。

`materializeProfilePatch` 接受解析锚点，`snapshots/sdk/sdk.snapshot.ts` 传入它所启动的应用清单（`apps/cli/package.json`）。补丁中的裸包先经补丁查找、再经锚点查找，随后照旧链接进启动 profile，因此 `lib` 模式启动可以解析仅声明为应用 devDependency 的语料提供者。

场景让本发行版的执行器行退出：`snapshots/sdk/persistent-tools/cordis.yml` 在它所替换的其他行旁边禁用 `gitbash-local`，因为它插入的 `bash-local` 拥有该服务。`snapshots/session/pwsh-tool-turn` 在其两个补丁中都这样做，因为它挂载的是受限 pwsh 执行器，而本发行版的 Git Bash 行会被基础组合在每次未选择 pwsh 栈的 win32 启动中挂载。

mock server 参数是一个 file URL，当其后跟随盘符时去掉开头的斜杠；其基址取自 fixture 路径并归一化开头的分隔符，于是一个表达式在 win32 上给出 `D:/.../mock-acp-server.ts`，在 POSIX 上给出 `/.../mock-acp-server.ts`。

重放模式接受任一种分隔符（`[\\/]`），对它所匹配的 POSIX 请求而言这是恒等变换。

`cwdSpellings` 还会返回每个写法转义后的形式，而规范化路径重写会合并转义写法留下的连续分隔符。二者对没有分隔符可转义的 POSIX cwd 都是恒等变换。

共享的 headless 组合（`snapshots/session/text-turn/cordis.yml`）将其 win32 预设表收窄为它所钉住的 sandbox/approval 组合所选中的那一个预设。该行在其他所有平台上都是惰性的，基础组合在那里把它置为 `disabled`。

在无法挂载受限组合的宿主上，语料整体让位：`recordedCorpusReplayable` 在 win32 上为假，各泳道据此跳过其场景，而 `DSH_SNAPSHOT_ALLOW_UNSUPPORTED=1` 仍可照常运行。ACP 套件以调用方自有的探针（`replayable`）接收它，与 `hasPwsh` 并列，因为该工厂同时注册着它自己的单元 spec 在进程内驱动的机制。

三个事实表明这条泳道从来不是 Windows 泳道：本 fork 的 Windows 门禁不含它（`ciWindowsObservationalGates`——"Linux owns required lint and snapshots; Windows omits those duplicates"）、上游快照层文档写明其必需运行平台是 macOS 与 Linux、而 `dsh-gitbash-sandbox` 带测试但不挂载，因为本发行版没有任何 win32 runner 能约束 Git Bash。因此在 win32 上跑该语料会把平台分歧读成失败——这正是默认行为现在所避免的。

## Alternatives considered

**在每次 JSON-RPC 错误时报告子进程 stderr。** 该客户端是面向 SDK 使用者的产品接口；插件树失败是调用方以握手失败形式看到的运行时故障，而保留的尾部信息是为传输中断准备的。上述 harness 侧修复消除了这一需要：树加载成功后 `initialize` 即成功，不再抛出该错误。

**让 SDK 快照泳道像 headless 泳道那样从源码启动。** 这能同时绕开 fallback 与解析缺口，但也就不再演练同一门禁在其他所有地方使用的 `lib` 启动，而客户端在存在构建产物时优先使用构建产物本身是合理的。

**把 `@deepseek-ai/dsh-llm-replay` 提升为应用依赖。** 没有任何已交付组合挂载它；它只为该语料而存在，产品安装不应为了一个测试泳道能解析而携带测试提供者。

**改为在 tokenize 阶段转义 `{{cwd}}`。** 已提交的 fixture 是与 POSIX 泳道共享的归一化不动点，而不合法之处并非该 token，而是被替换进去的值。

**在 harness 自行终止 win32 命令时合成 `SIGTERM`。** 这能让模型可见的结果与 POSIX 标记一致，但子进程结果报告的是平台自身的事实，而伪造的信号会告诉模型该进程死于该宿主上并不存在的东西。本笔记改为记录这处差异。

**把宿主判据放进 `defineAcpSnapshotSuite` 内部。** 最初就是这么做的，结果它跳过了 `suite.spec.ts` 在进程内驱动的机制——8 个失败，因为那些 spec 断言的是套件自身的写回，而对应的测试此后根本没跑。该探针属于知道自身宿主情况的调用方，这也正是 `hasPwsh` 的传递方式。

**给每个分歧场景标注 `platform: posix`。** 这是泳道本已支持的逐场景机制，但为一条宿主策略改动约七十个 fixture 清单，还会连带丢掉在 win32 上确实通过的那些场景——headless 15 个、ACP 9 个——而本笔记里的启动缺陷正是从它们的失败中找出来的。改为整体让位，并用显式覆盖保留这些运行能力。

## Consequences

SDK 语料现在能在 win32 上启动：`initialize` 返回 `serverInfo`，18 个用例只在各自录制的组合与本发行版 win32 技术栈发生分歧之处失败。

该分歧并未闭合，这也是本次改动的诚实边界。67 个 headless 用例钉住带 `sandbox_permissions` 与 `justification` 的 `bash` 工具 schema，而该工具只在所挂载的执行器能够约束时才公布它们；win32 默认执行的正是刻意不受约束的 Git Bash 执行器。18 个 SDK 用例钉住 `workspace-write` 的 sandbox 模式与预设，而 `permission-presets` 拒绝在无法强制该模式的执行器上挂载它——这正是本发行版提供 `permission-unconfined` 的原因。二者都无法靠配置钉住，因为它们都源自执行器的约束能力。

另有两处差异贯穿 headless 的失败，且都不是启动路径的缺陷。harness 终止的命令在 POSIX 上报告 `[killed by signal: SIGTERM]`，在 win32 上报告 Node 观察到的退出码——那里终止即 `TerminateProcess`，不携带信号；子进程结果契约报告的是平台所给出的事实。此外 fixture 仍钉住已退役的 `dsh-plan-mode` 的 `exit_plan_mode` 文本，而组合挂载的是 `dsh-plan-handoff`，其描述与 `execution` 参数都不同。

在 win32 上复现已提交的 fixture 需要一份在 win32 上录制的 fixture，而那会与 Linux 泳道所比较的 POSIX 录制产生分歧。因此语料在该平台默认让位：win32 上的 `pnpm run test:snapshot` 保留语料完整性断言并把场景报告为跳过，而 `DSH_SNAPSHOT_ALLOW_UNSUPPORTED=1` 仍会运行它们，供需要诊断本笔记所记录分歧的人使用。POSIX 与 macOS 宿主看到 `recordedCorpusReplayable` 为真，行为与之前完全一致。

## Testing

`DSH_EXAMPLE_MODE=lib pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts` 从 18 个启动失败变为 18 个组合不一致，每一个报告的都是会话日志或请求头差异，而不再是 `cannot create effect on inactive context`。直接启动场景子进程（`--profile sdk`，配上物化后的补丁，并在 stdin 写入一帧 `initialize`）返回 `serverInfo`，而此前它返回该错误，并在 stderr 上留下 `llm-replay` 导入失败。

采用收窄后的 win32 预设表后，`snapshots/session/headless.snapshot.ts` 从 75 个失败降到 73 个，并有 15 个用例通过；归一化器改动之后计数不变，因此转义后的 cwd 写法与分隔符合并没有改动任何原本通过的用例。

后四项修复逐例验证：`pwsh-tool-turn`、`read-image-attachment-path`、`subagent-acp-diagnostic` 都不再在启动或重放模式处失败，转而以上述组合差异失败；被 token 化的路径也已从 `ptc-workspace-context` 的请求文本中消失。

win32 上 `pnpm run test:snapshot` 报告 23 passed 与 110 skipped，而 `DSH_SNAPSHOT_ALLOW_UNSUPPORTED=1` 会重新运行整个语料——三个泳道共 96 个失败（headless 73、SDK 18、ACP 5），即本笔记所记录的分歧，别无其他。带上套件选项中的探针后，`pnpm run test packages/test-support/session-snapshot` 通过 343 个测试；而将判据放进工厂内部会破坏它们。

`pnpm run verify-cordis-config` 通过全部 145 个配置文件，`pnpm run typecheck` 通过。
