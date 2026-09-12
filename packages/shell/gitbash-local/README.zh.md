---
description: "面向部署方与维护者的本地 Git Bash 执行器说明，用于选择、配置或排查 Windows 上基于 shell seam 的非隔离 POSIX 方言命令执行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-gitbash-local

[English](README.md) | 中文

## 概述

`dsh-gitbash-local` 是面向 Windows 的 Git Bash 执行器：每条命令都以全新的非交互 `<bash.exe> -c` 进程运行——与 `dsh-bash-local` 完全相同的一次性 POSIX 方言，可执行文件解析为 Git for Windows 安装——因此模型按 Linux 语料训练出的命令可以原样运行。它继承 `dsh-bash-local` 的全部机制，自身只负责 Git Bash 发现与 argv 级接缝。命令以 harness 进程自身的权限运行：本执行器不做任何隔离，且 windows-acl 受限令牌链根本无法限制 msys 运行时。挂载后，面向模型的 `bash` 工具会与它对接。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当 Windows 组合需要 POSIX 方言命令执行时（本发行版 win32 默认栈）挂载本执行器。它注册为 `ctx.shell`，面向模型的 `bash` 工具随即在其上工作：agent 调用工具，命令以全新的 `bash -c` 进程按下方预算运行。

### 何时选择它

它是 `dsh-bash-local` 的 Windows 对应物：当模型命令是 POSIX 形态且宿主为 Windows 时选择它。执行器按以下顺序解析 Git Bash 可执行文件：显式 `gitBashPath`、常见 Git for Windows 安装位置（`Program Files`、`Program Files (x86)`、每用户安装）、PATH 中 `git.exe` 所指的安装、PATH 上的 Git `bin` 目录——绝不会采用 `System32\bash.exe`（WSL 启动器）或 WindowsApps 别名。在非 win32 平台挂载，或在无法解析出安装的 Windows 宿主上挂载，都会在加载期带着可操作的报错信息失败。

### 最小配置

按需加载预算；每个字段都有默认值，最小组合只需插件条目本身。组合了 settings 提供者时，用户分节会叠加在组合条目之上，预算无需重载即可运行期调整（见[运行期调整预算](#adjusting-budgets-at-runtime)）。

```yaml
- id: bash
  name: '@deepseek-ai/dsh-gitbash-local'
  config:
    gitBashPath: C:\Program Files\Git\bin\bash.exe
    timeoutMs: 120000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `cwd` | `process.cwd()` | 命令的默认工作目录 |
| `timeoutMs` | `120,000` | 默认前台超时（毫秒） |
| `maxTimeoutMs` | `600,000` | 单次调用超时覆盖的上限 |
| `maxOutputBytes` | `64,000` | 单流内存输出上限；超出溢出到临时文件 |
| `maxSpillBytes` | `67,108,864` | 单流完整输出溢出上限 |
| `graceMs` | `3,000` | 杀死升级与退出后管道排空的宽限期 |
| `gitBashPath` | 解析 | 显式 Git Bash 可执行文件；否则常见安装位置，再 PATH 推导 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-gitbash-local)是每个接受字段及其 JSDoc 的穷尽来源。

### 运行命令

用 `run` 执行命令并从结果读取输出；非零退出、超时或取消都会描述性地 resolve，只有基础设施故障才会 reject。命令字符串作为 `-c` 的单一参数传入，正是 POSIX `bash -c` 契约：bash 自行解析文本，Windows 工作目录透明挂载（`pwd` 报告 msys 视图、`pwd -W` 报告 Windows 路径），UTF-8 双向原样直通。环境继承面向模型的集合——`NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat`——显式调用方条目仍然优先。

```text
const result = await ctx.shell.run(ctx.shell.resolve({ command: 'ls -la | head' }))
if (result.timedOut) console.log('timed out after', result.timeoutMs)
```

### 后台进程

调用 `start` 在后台运行命令；它立即返回句柄且不适用超时。`readOutput()` 把流增量合并为一次消费式读取，stderr 标记在 `[stderr]` 节下；`kill()` 终止提供者托管范围；`done` 在命令直接关闭时 settle 且永不 reject。任务 id、所有权、轮询与通知属于通用 `ctx.jobs` 运行时，工具层会把句柄注册到它。

<a id="adjusting-budgets-at-runtime"></a>
### 运行期调整预算

组合 settings 提供者时，本执行器以本类自己的 schema 注册能力共享的 `shell` 设置命名空间——与 POSIX 家族相同，因为一台宿主只组合恰好一个 `ctx.shell` 提供者——因此写入的 `gitBashPath` 会实时重新解析可执行文件。`settings.yaml` 中的用户分节叠加在组合条目之上，下一条命令即按新预算运行。schema 无法判定的值——正有限数与 `graceMs` 定时器上界——在写入处拒绝，运行中的执行器保持最后一个良好分节（拒绝标签以 `bash-local` 命名，即字段所属共享机制的所有者）。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本节解释执行器的设计并指向实现代码；可观测行为已完整覆盖于[使用本包](#use-this-package)。

### 设计概念

本执行器是 `ctx.shell` 缝的 Git Bash 服务提供者：`LocalBashExecutor` 的子类，因此全部机制——请求/规约默认、deadline 融合与原因分类、终端环境、后台读合并——都是被继承的 POSIX 实现。本包只拥有 Windows 增量：fail-loud 的可执行文件发现（绝不返回裸 `bash`，因为 Windows 上它可能解析到 WSL 启动器并挂载出不同的文件系统视图）、`gitBashPath` 的设置重探测、以及供限制类子类包装的 argv 级接缝。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`GitBashExecutor`、`Config`、settings 接线、argv 接缝 |
| [`src/resolve.ts`](src/resolve.ts) | 纯函数 `resolveGitBashPath`/`candidateGitBashPaths` 可执行文件解析 |
| — | 不发布运行时 invariant 伴随包；除所属缝已强制的契约外，本包不存在可独立分歧观测的事件序列或可变数据关系。 |
| `tests/` | 已验证行为：预算、分类、解析、后台句柄、真实 Loader 组合冒烟 |

### 主流程

一次调用经过三步：继承的 `resolve()` 从配置填充 `workdir`/`timeoutMs`/`stdoutMaxBytes`（钳制单次 `timeoutMs` 覆盖；其拒绝标签以 `bash-local` 命名——共享 schema 的所有者）；执行器构造 Git Bash argv——`<解析出的 bash.exe> -c <命令>`——经继承的 `runArgv`/`startArgv` 钩子以显式字节上限与 `graceMs` 通过 `ctx.subprocess` 派生；结算结果被分类并投影为 `ShellRunResult`。Windows 把强制终止报告为无信号的 exit 1，因此信号标记事实不适用；超时/中止分类与平台无关。命令内的 `$$` 是 msys pid——Windows pid 来自 `/proc/$$/winpid`。

### 不变量与所有权

- 可执行文件解析是 `(configured, env, platform)` 的纯函数：非空显式值逐字生效；`System32` 与 `WindowsApps` PATH 条目绝不贡献自身的 `bash.exe`；发现失败时大声报错而非返回裸 `bash`。
- `shell` 设置分节安装具体类的 schema（父构造器读取 `this.constructor` 的 `static Config`），因此 `gitBashPath` 作为分节一部分持久化，且仅当写入值与当前可执行文件的解析来源不同才重探文件系统。
- 环境分层继承固定顺序：终端覆盖最先，其次是调用方 `env`，受信 `dshEnv` 快照最后；subprocess 服务独立清洗环境凭据与继承的 `DSH_*` 名。
- 后台进程属于 subprocess 服务：执行器单独重载后仍存活，服务销毁时被杀死并 join。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

执行器契约不够用时阅读这些页面。从缝出发，到 POSIX 父类与 bash 工具。

- [shell 缝](../shell/README.zh.md)——本提供者实现的执行器契约，含请求/规约拆分。
- [bash-local](../bash-local/README.zh.md)——本执行器继承其机制的 POSIX 父类。
- [gitbash-sandbox](../gitbash-sandbox/README.zh.md)——限制型孪生；当存在能容纳 msys 运行时的沙箱 runner 时组合它（随仓库发布的 windows-acl 链不能）。
- [tool-bash](../tool-bash/README.zh.md)——本执行器之上面向模型的 `bash` 工具。
- [Bash 执行器子系统](../../../docs/subsystems/shell.zh.md)——完整的请求/规约词汇、结果与服务契约。

-----

<a id="model-experience"></a>
## 模型体验

经由 `dsh-tool-bash` 间接体现：它渲染本执行器的有界 stdout/stderr 尾部、后台进程增量（经由通用任务运行时）、溢出文件路径与基础设施故障。`bash` 工具的描述与渲染和 POSIX 栈逐字节一致——平台差异只在缝背后的可执行文件。

#### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>


这些限制界定本执行器何时是糟糕选择。它们是当前包约束，而非路线图。

- **自身不隔离——且发布链无法隔离**——命令以 harness 进程权限运行；windows-acl 受限令牌 runner 根本无法启动 msys 运行时（启动期 `CreateFileMapping` 拒绝），因此在默认 win32 栈上 shell 命令的限制来自审批策略而非沙箱（见 gitbash-windows-shell-stack Agent Note）。`fs` 能力保持自己的限制。
- **无持久 shell 或 PTY**——每次调用都是全新 `bash -c`；持久终端栈位于 `ctx.terminal` 缝。
- **MSYS 路径改写作用于原生子进程调用**——命令调用原生 Windows 可执行文件时，msys 会把 POSIX 形态参数改写为 Windows 路径（通常是期望行为）；必须向原生可执行文件传递斜杠开头旗标的命令需要自行处理 `MSYS2_ARG_CONV_EXCL`。
- **后台提供者故障注释仅投递一次**——执行器把阶段中立的 `subprocess failed before reporting an outcome: …` 注入恰好一次 `readOutput()` 增量；丢弃该增量的读取者无法找回它。
- **Windows 终止不报告信号**——被强杀的进程结算为 exit 1 且 `signal: null`；`kill()` 发起的停止仍直接标记 `killed`。
- **Scoop/chocolatey shim 安装可能解析不到**——PATH 上的 `git.exe` shim 不指明其安装目录；候选顺序未覆盖的包管理器布局请显式设置 `gitBashPath`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作背景——点击展开</summary>

win32 默认组合与 msys×受限令牌的证据位于 gitbash-windows-shell-stack Agent Note（`.agents/notes/implemented/feature/`）。

</details>
