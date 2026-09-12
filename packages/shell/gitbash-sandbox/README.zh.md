---
description: "沙箱消费型 Git Bash 执行器：把每条命令经 ctx.sandbox 包装并报告拒绝/执行事实，供组合了 msys 运行时可容忍之限制 runner 的部署使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-gitbash-sandbox

[English](README.md) | 中文

## 概述

`dsh-gitbash-sandbox` 是 `dsh-gitbash-local` 的限制型孪生：它取代本地执行器注册为 `ctx.shell`，要求 `ctx.sandbox` 提供者与 `ctx.sandboxPolicy`，把精确的 Git Bash argv 经 `ctx.sandbox.confine` 包装，并在每个结果上报告所选模式、执行完整度与拒绝事实。它继承全部本地进程机制，并镜像 `dsh-pwsh-sandbox` 的分类方言。它**不**参与任何发布组合：windows-acl 受限令牌链无法启动 msys 运行时，因此当前没有随仓库发布的 Windows runner 能限制 Git Bash（见已知限制）。

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

当组合运行 Git Bash 命令且存在 msys 运行时可容忍的限制 runner 时，以本执行器**替代** `dsh-gitbash-local` 挂载。它逐字接收本地执行器的配置；沙箱默认（模式 + 工作区根）位于 `ctx.sandboxPolicy`，runner 选择是 `ctx.sandbox` 提供者的配置。

```yaml
- id: bash
  name: '@deepseek-ai/dsh-gitbash-sandbox'
  config:
    graceMs: 3000
```

每次运行解析单次调用策略（调用会话的，否则部署策略），限制精确的 `<bash.exe> -c <命令>` argv，并标记 `result.sandbox` 事实；`danger-full-access` 完全绕过限制。损坏或缺失的 runner 以 `SANDBOX_UNAVAILABLE` 失败关闭——绝不发生未限制执行。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-gitbash-sandbox)列出全部接受字段。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

`SandboxGitBashExecutor` 继承 `GitBashExecutor`，并是 `dsh-pwsh-sandbox` 的刻意的逐调用镜像（因此 jscpd 忽略）：`resolve()` 盖章完整单次策略，`run()`/`start()` 把继承的 `argv(spec)` 经 `ctx.sandbox.confine` 包装，结算前保留的逐进程限制事实驱动 `onProcessDone` 的拒绝/runner 故障分类。分类助手镜像 pwsh 孪生；提供者按每次包装给出拒绝签名与 runner 故障规则——windows-acl 方言已包含 `permission denied`，即 msys bash 写入被拒时打印的文本。

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | `SandboxGitBashExecutor`：策略盖章、限制包装、事实标记 |
| [`src/helpers.ts`](src/helpers.ts) | 拒绝/runner 故障分类（pwsh 孪生的镜像） |
| — | 不发布运行时 invariant 伴随包；除所属缝已强制的契约外，本包不存在可独立分歧观测的事件序列或可变数据关系。 |
| `tests/` | 已验证行为：包装、策略交接、失败关闭传播、事实标记（伪沙箱提供者使其确定性） |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [gitbash-local](../gitbash-local/README.zh.md)——本孪生所限制其 argv 与机制的执行器。
- [pwsh-sandbox](../pwsh-sandbox/README.zh.md)——本包逐调用镜像的孪生。
- [sandbox 能力](../../sandbox/sandbox/README.zh.md)——限制缝、runner 与策略词汇。
- [Bash 执行器子系统](../../../docs/subsystems/shell.zh.md)——完整执行器契约。

-----

<a id="model-experience"></a>
## 模型体验

经由 `dsh-tool-bash` 间接体现：限制拒绝渲染为带沙箱拒绝标记的失败结果；挂载本执行器时（其 `sandboxMode` 已定义）升级面出现。

#### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>


- **没有随仓库发布的 Windows runner 能限制 msys**——windows-acl 受限令牌链在启动期即杀死 msys 运行时（`CreateFileMapping` 拒绝），因此本执行器未被任何发布组合挂载；当出现 msys 运行时可容忍的 runner 时它即可用。证据与默认栈决策位于 gitbash-windows-shell-stack Agent Note。
- **分类镜像 pwsh 方言**——拒绝签名与 runner 故障规则来自 `ctx.sandbox` 提供者的包装；未来方言不同的后端按包装自行提供。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作背景——点击展开</summary>

无。

</details>
