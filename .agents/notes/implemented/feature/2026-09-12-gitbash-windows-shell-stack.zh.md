# Agent Note: Windows 默认切换为 Git Bash shell 栈，由 DSH_WINDOWS_SHELL 选择

Status: implemented

[English](2026-09-12-gitbash-windows-shell-stack.md) | 中文

## Problem

本发行版的主要宿主是 Windows，而模型的命令语料绝大多数是 POSIX 形态：随仓库发布的 win32 栈挂载的是受限 PowerShell 执行器（`pwsh-sandbox` + `tool-pwsh`），导致每条按 Linux 训练的命令都要翻译或重试。fork 需要让模型经由 Git for Windows 的 `bash.exe` 执行命令——同时平台 shell 栈仍可选择——且不破坏缝的"每主机一个执行器"规则与发布的权限栈。

## Decision

shell 能力新增两个提供者，win32 组合默认切到无限制的 Git Bash 栈：

- `@deepseek-ai/dsh-gitbash-local`（`GitBashExecutor extends LocalBashExecutor`）只拥有 Windows 增量：fail-loud 的 Git Bash 发现（`src/resolve.ts` 中的纯函数 `resolveGitBashPath`——显式路径、常见安装位置、PATH 中 `git.exe` 所指安装、再到 PATH 上的 Git `bin` 目录；绝不采用 `System32`/`WindowsApps` 的 `bash.exe`，因为那是 WSL 启动器；也绝不返回裸 `bash`）、`gitBashPath` 的设置重探测、以及 argv 接缝。全部机制均为继承。`dsh-bash-local` 增加两个子类钩子：settings 分节安装具体类的 `static Config`，以及文档变更时触发的空 `onSettingsChanged()`。
- `@deepseek-ai/dsh-gitbash-sandbox` 逐调用镜像 `pwsh-sandbox`，本身完整，但不被任何发布组合挂载（见下方 spike 证据）。
- base bundle 与四个 agent preset 的 shell 行以 `process.platform` **与** `process.env.DSH_WINDOWS_SHELL` 门控：未设/`gitbash` 时 win32 挂 `gitbash-local` + `tool-bash`（以及 minimal preset 的 `terminal-bash`/`persistent-bash`）；`pwsh` 恢复上游受限栈；POSIX 行不变。vendored loader 以 `with(ctx){eval}` 求值 `!!js` `disabled` 表达式，未被遮蔽的标识符会落到真实 `process`——`process.env` 读取可用；`apps/cli/tests/windows-shell.spec.ts` 经真实 compose 算法钉住两平台 × 两环境取值。
- `dsh-terminal-bash` 的 bash 方言在 win32 解析 Git Bash（`resolveConfig` 新增 `platform`/`env` 参数以支持跨宿主单测钉住），minimal preset 的持久 bash 栈因此在 Windows 无需行配置改动即可工作。
- `vitest.config.ts` 新增 Git Bash 探针：在孪生套件自跳过的宿主（所有非 Windows 车道）上豁免其 src 文件的覆盖率——与 pwsh 探针相同的成员资格契约。

## msys 限制 spike（默认栈为何不隔离）

真实 `dsh-sandbox-local` win32 链（windows-acl 受限令牌 runner）之上的 `SandboxGitBashExecutor` 在启动期即死，两种模式下均可复现：

```text
bash: *** fatal error - CreateFileMapping S-1-5-21-…-1001.1, Win32 error 5.  Terminating.
```

msys 运行时必须在 `main()` 之前打开/创建其以 SID 命名的共享内存节；受限令牌拒绝了它。这是结构性的（restricting-SID 设计正是 DACL 授权有意义的前提——无令牌的纯 DACL 变体不构成限制），因此当前没有随仓库发布的 Windows runner 能限制 Git Bash。`gitbash-sandbox` 因此不进入组合发布，默认 win32 栈接受无限制的 shell 执行。

## 权限适配

`dsh-permission-presets` 在无限制执行器上会大声失败（"presets bundle a sandbox mode … misconfiguration"），这将使默认 win32 profile 无法启动。服务的断言被放松到诚实的最小范围：无限制执行器只允许挂载每一条目均为 `danger-full-access` 的预设表（唯一一个"什么都不做即生效"的模式）；其余按名拒绝。base bundle 把 `permission` 行拆为两条：执行器具限制能力处用全量表，默认 win32 栈用 `permission-unconfined`（`unconfined-ask`：danger-full-access + ask，显式 `defaultPreset`）。`fs` 能力保持自己的 `fs-sandbox` 限制；approval 流程不变；`DSH_WINDOWS_SHELL=pwsh` 恢复全量表。

## Alternatives considered

- **按次方言选择（同时挂载 `bash` 与 `pwsh` 工具）**——需要共享 `ShellExecRequest` 增加方言字段加派发式提供者，触碰核心缝与两个消费者；因耦合违背缝的单执行器契约而否决。
- **仅 patch 选择（无环境变量）**——纯官方机制；因本发行版所有者希望免改 profile 文件即可按次切换而否决其作为唯一通道。
- **无限制执行器宣告 `sandboxMode: 'danger-full-access'`**——能让全量预设表挂载，但工具的升级面会提供执行器永不兑现的限制模式；作为对模型的谎言否决。
- **WSL `bash.exe`**——真正的 Linux bash，但文件系统视图与 Windows 侧 `fs` 能力分裂；因视图分裂否决。
- **新建能容纳 msys 的限制 runner**——独立项目量级且安全敏感；暂缓（`gitbash-sandbox` 已为它就绪）。
- **把权限断言放松到"任意预设 + 无限制执行器"**——会让切换器承诺执行器无法兑现的 `workspace-write`；与 sandboxMode 谎言同理否决。

## Consequences

- Windows 上模型默认 shell 工具是基于 Git Bash 的 `bash`，schema 与渲染和 POSIX 栈逐字节一致；其命令以 harness 进程权限运行——shell 限制来自审批策略而非沙箱。这是 fork 的明确取舍；`DSH_WINDOWS_SHELL=pwsh` 按次恢复完整限制，profile patch 可持久恢复。
- POSIX 宿主与 `sdk-minimal` 独立树不受影响；`gitbash-sandbox` 带测试发布但不挂载；覆盖率门禁在装有 Git for Windows 的 Windows 宿主上对孪生包全额执行。
- 无 Git Bash 的 Windows 宿主上 `pnpm dsh --profile headless` 会在插件加载期带着指明 `gitBashPath` 的可操作报错失败——设计上的 fail-loud。
- 未新增录制会话快照：`SessionEventMap`、agent-loop、工具面文本均无变化（`tool-bash` 描述不变，win32 花名册变化由 `windows-shell.spec.ts` 钉住）；本机无 `DEEPSEEK_API_KEY` 无法录制，若日后有 key 可补录 `gitbash` 场景。
